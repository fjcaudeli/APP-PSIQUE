import { AsyncPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonContent, IonIcon, NavController } from '@ionic/angular';
import { arrowBackOutline, createOutline, documentTextOutline } from 'ionicons/icons';
import { catchError, EMPTY, finalize, map, merge, Subject, switchMap } from 'rxjs';
import { Paciente } from '../models/paciente';
import { PacientesService } from '../services/pacientes.service';

@Component({
  selector: 'app-paciente-detalle',
  standalone: true,
  imports: [AsyncPipe, DatePipe, IonBackButton, IonContent, IonIcon, ReactiveFormsModule],
  templateUrl: './paciente-detalle.page.html',
  styleUrl: './paciente-detalle.page.scss',
})
export class PacienteDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly pacientesService = inject(PacientesService);
  private readonly formularios = inject(FormBuilder).nonNullable;
  private readonly navegacion = inject(NavController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pacienteGuardado = new Subject<Paciente>();
  private readonly volverAFicha = new Subject<void>();
  private codigoOriginal = '';
  private fechaCreacionOriginal = '';
  private visible = false;

  cargando = true;
  errorCarga = false;
  editando = false;
  guardando = false;
  errorGuardado = '';
  mensajeGuardado = '';

  readonly dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  // El formulario es un borrador separado: escribir o cancelar no modifica la ficha.
  // Los campos opcionales usan texto vacío en los controles y null al enviarse a la API.
  readonly formulario = this.formularios.group({
    codigo: ['', [Validators.required, Validators.maxLength(12), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9_-]{0,11}$/),
      (control: AbstractControl<string>) => /^nuevo$/i.test(control.value.trim()) ? { codigoReservado: true } : null]],
    modalidad: this.formularios.control<Paciente['modalidad']>('Presencial', Validators.required),
    estado: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(40)]],
    proximaSesion: ['', Validators.maxLength(30)],
    frecuencia: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(40)]],
    diaHabitual: [''],
    horarioHabitual: [''],
    fechaInicioTratamiento: ['', Validators.required],
    motivoConsulta: ['', Validators.maxLength(3000)],
    postIt: ['', Validators.maxLength(300)],
  });

  // paramMap permite leer :codigo desde la URL, incluso si cambia durante la navegación.
  // switchMap solicita al servicio el paciente de ese código y conserva la consulta más reciente.
  // AsyncPipe gestiona la suscripción y la libera cuando se destruye la pantalla.
  private readonly pacienteConsultado$ = merge(
    this.route.paramMap.pipe(map((parametros) => parametros.get('codigo') ?? '')),
    this.volverAFicha.pipe(map(() => this.route.snapshot.paramMap.get('codigo') ?? '')),
  ).pipe(
    switchMap((codigo) => {
      // Cada código inicia una nueva consulta. Mientras carga no mostramos
      // "Paciente no encontrado" ni los datos de una consulta anterior.
      this.cargando = true;
      this.errorCarga = false;
      return this.pacientesService.obtenerPacientePorCodigo(codigo).pipe(
        catchError(() => {
          this.errorCarga = true;
          return EMPTY;
        }),
        finalize(() => { this.cargando = false; }),
      );
    }),
  );

  // AsyncPipe recibe tanto la consulta inicial como el resultado confirmado del PUT.
  // Así mostramos lo que guardó SQLite sin sustituirlo por el borrador del formulario.
  readonly paciente$ = merge(this.pacienteConsultado$, this.pacienteGuardado);

  ionViewWillEnter(): void {
    this.visible = true;
    // También refrescamos una ficha conservada por Ionic después de agendar.
    this.volverAFicha.next();
    if (this.route.snapshot.queryParamMap.get('creado') === '1') {
      this.mensajeGuardado = 'Paciente creado.';
    }
  }

  ionViewWillLeave(): void {
    this.visible = false;
    this.editando = false;
    this.errorGuardado = '';
    this.mensajeGuardado = '';
  }

  iniciarEdicion(paciente: Paciente): void {
    this.codigoOriginal = paciente.codigo;
    this.fechaCreacionOriginal = paciente.fechaCreacion;
    this.formulario.reset({
      ...paciente,
      proximaSesion: paciente.proximaSesion ?? '',
      diaHabitual: paciente.diaHabitual ?? '',
      horarioHabitual: paciente.horarioHabitual ?? '',
    });
    this.errorGuardado = '';
    this.mensajeGuardado = '';
    this.editando = true;
  }

  cancelarEdicion(): void {
    if (this.guardando) return;
    this.editando = false;
    this.errorGuardado = '';
    this.formulario.reset();
  }

  campoInvalido(campo: keyof typeof this.formulario.controls): boolean {
    const control = this.formulario.controls[campo];
    return control.invalid && (control.touched || control.dirty);
  }

  guardar(): void {
    if (this.guardando) return;
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) {
      this.errorGuardado = 'Revisá los campos marcados antes de guardar.';
      return;
    }

    const borrador = this.formulario.getRawValue();
    const paciente: Paciente = {
      ...borrador,
      fechaCreacion: this.fechaCreacionOriginal,
      codigo: borrador.codigo.trim(),
      estado: borrador.estado.trim(),
      frecuencia: borrador.frecuencia.trim(),
      proximaSesion: borrador.proximaSesion.trim() || null,
      diaHabitual: borrador.diaHabitual || null,
      horarioHabitual: borrador.horarioHabitual || null,
      motivoConsulta: borrador.motivoConsulta.trim(),
      postIt: borrador.postIt.trim(),
    };
    const codigoAnterior = this.codigoOriginal;
    this.guardando = true;
    this.errorGuardado = '';

    this.pacientesService.actualizarPaciente(codigoAnterior, paciente).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.guardando = false; }),
    ).subscribe({
      next: (actualizado) => {
        this.editando = false;
        this.mensajeGuardado = 'Cambios guardados.';
        this.pacienteGuardado.next(actualizado);

        // Al cambiar el identificador, reemplazamos también la ruta y la pila de Ionic
        // para que el botón de regreso no lleve a la ficha con el código anterior.
        if (actualizado.codigo !== codigoAnterior && this.visible) {
          void this.navegacion.navigateRoot(['/pacientes', actualizado.codigo], { replaceUrl: true });
        }
      },
      error: (error: HttpErrorResponse) => {
        // Conservamos el borrador ante un conflicto, validación o falla de conexión.
        this.errorGuardado = typeof error.error?.mensaje === 'string'
          ? error.error.mensaje
          : 'No se pudieron guardar los cambios. Revisá la conexión y volvé a intentar.';
      },
    });
  }

  readonly iconoVolver = arrowBackOutline;
  readonly iconoPostIt = documentTextOutline;
  readonly iconoEditar = createOutline;
}
