import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonIcon, NavController } from '@ionic/angular';
import { arrowBackOutline } from 'ionicons/icons';
import { finalize, Subject, takeUntil } from 'rxjs';
import { NuevoPaciente, Paciente } from '../models/paciente';
import { ReservaSesion } from '../models/sesion';
import { PacientesService } from '../services/pacientes.service';
import { SesionesService } from '../services/sesiones.service';
import { nombreDia, yaTranscurrio } from '../shared/tiempo';

@Component({
  selector: 'app-paciente-crear',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, IonContent, IonIcon, ReactiveFormsModule],
  templateUrl: './paciente-crear.page.html',
  styleUrls: ['../paciente-detalle/paciente-detalle.page.scss', './paciente-crear.page.scss'],
})
export class PacienteCrearPage {
  private readonly route = inject(ActivatedRoute);
  private readonly pacientesService = inject(PacientesService);
  private readonly sesionesService = inject(SesionesService);
  private readonly navegacion = inject(NavController);
  private readonly formularios = inject(FormBuilder).nonNullable;
  private readonly destroyRef = inject(DestroyRef);
  private readonly salida = new Subject<void>();
  private visible = false;
  private seleccionandoHorario = false;
  desdeAgendamiento = false;

  readonly iconoVolver = arrowBackOutline;
  readonly dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  turno: ReservaSesion | null = null;
  contextoSolicitado = false;
  cargandoContexto = false;
  cargandoCodigo = false;
  guardando = false;
  errorContexto = '';
  errorGuardado = '';
  avisoCodigo = '';

  readonly formulario = this.formularios.group({
    codigo: ['', [Validators.maxLength(12), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9_-]{0,11}$/),
      (control: AbstractControl<string>) => /^nuevo$/i.test(control.value.trim()) ? { codigoReservado: true } : null]],
    modalidad: this.formularios.control<Paciente['modalidad']>('Presencial', Validators.required),
    estado: ['Activo', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(40)]],
    proximaSesion: ['', Validators.maxLength(30)],
    frecuencia: ['A confirmar', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(40)]],
    diaHabitual: [''],
    horarioHabitual: [''],
    motivoConsulta: ['', Validators.maxLength(3000)],
    postIt: ['', Validators.maxLength(300)],
  });

  ionViewWillEnter(): void {
    this.visible = true;
    if (this.guardando) return;
    this.salida.next();
    const conservarBorrador = this.seleccionandoHorario;
    this.seleccionandoHorario = false;
    this.turno = null;
    this.errorContexto = '';
    this.errorGuardado = '';
    this.avisoCodigo = '';
    // Al volver del selector conservamos todos los datos que ya se habían escrito.
    if (!conservarBorrador) this.formulario.reset({
      codigo: '', modalidad: 'Presencial', estado: 'Activo', proximaSesion: '',
      frecuencia: 'A confirmar', diaHabitual: '', horarioHabitual: '',
      motivoConsulta: '', postIt: '',
    });
    this.formulario.controls.diaHabitual.disable({ emitEvent: false });
    this.formulario.controls.horarioHabitual.disable({ emitEvent: false });

    const parametros = this.route.snapshot.queryParamMap;
    this.contextoSolicitado = ['fecha', 'horario', 'modalidad', 'importeCentavos'].some((campo) => parametros.has(campo));
    if (!conservarBorrador) this.desdeAgendamiento = this.contextoSolicitado;
    this.cargandoContexto = false;
    if (this.contextoSolicitado) {
      const fecha = parametros.get('fecha') ?? '';
      const horario = parametros.get('horario') ?? '';
      const modalidad = parametros.get('modalidad');
      const importeTexto = parametros.get('importeCentavos') ?? '';
      const importeCentavos = Number(importeTexto);
      const duracionMinutos = Number(parametros.get('duracionMinutos'));
      if (!this.fechaValida(fecha) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)
        || (modalidad !== 'Presencial' && modalidad !== 'Virtual')
        || ![30, 40, 50, 60].includes(duracionMinutos)
        || !/^\d+$/.test(importeTexto) || !Number.isSafeInteger(importeCentavos) || importeCentavos > 999999999) {
        this.errorContexto = 'El horario recibido está incompleto o no es válido. Volvé a elegir un horario antes de crear el paciente.';
      } else {
        this.turno = { fecha, horario, modalidad, importeCentavos, duracionMinutos };
        if (!conservarBorrador) this.formulario.controls.modalidad.setValue(modalidad);
        // El turno elegido fija el horario habitual. getRawValue() lo incluye al guardar aunque esté deshabilitado.
        this.formulario.controls.horarioHabitual.setValue(horario);
        this.formulario.controls.diaHabitual.setValue(nombreDia(fecha));
        if (yaTranscurrio(fecha, horario)) {
          this.errorContexto = 'Este horario ya pasó. Volvé al agendamiento para elegir uno futuro.';
        } else {
          this.cargandoContexto = true;
          this.sesionesService.calendario().pipe(takeUntil(this.salida), takeUntilDestroyed(this.destroyRef),
            finalize(() => { this.cargandoContexto = false; })).subscribe({
            next: calendario => {
              const dia = calendario.dias.find(d => d.fecha === fecha);
              const inicio = Number(horario.slice(0, 2)) * 60 + Number(horario.slice(3));
              const libre = dia?.habilitado && dia.libres.some(f => horario >= f.desde
                && inicio + duracionMinutos <= Number(f.hasta.slice(0, 2)) * 60 + Number(f.hasta.slice(3)));
              if (!libre) this.errorContexto = 'El intervalo ya no está disponible. Elegí otro horario antes de guardar.';
            }, error: () => { this.errorContexto = 'No se pudo comprobar la disponibilidad. Volvé a elegir el horario.'; },
          });
        }
      }
    }

    this.cargandoCodigo = true;
    this.pacientesService.siguienteCodigo().pipe(
      takeUntil(this.salida), takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.cargandoCodigo = false; }),
    ).subscribe({
      next: ({ codigo }) => {
        if (!this.formulario.controls.codigo.dirty && !this.formulario.controls.codigo.value && !this.guardando) {
          this.formulario.controls.codigo.setValue(codigo);
        }
      },
      error: () => { this.avisoCodigo = 'No se pudo obtener una sugerencia. Podés elegir un código o dejarlo vacío para que se genere al guardar.'; },
    });
  }

  ionViewWillLeave(): void {
    this.visible = false;
    this.salida.next();
  }

  campoInvalido(campo: keyof typeof this.formulario.controls): boolean {
    const control = this.formulario.controls[campo];
    return control.invalid && (control.touched || control.dirty);
  }

  asignarHorario(): void {
    if (this.guardando) return;
    this.seleccionandoHorario = true;
    void this.navegacion.navigateForward('/agenda/horarios-disponibles/crear', { queryParams: {
      modalidad: this.formulario.controls.modalidad.value,
      importeCentavos: this.turno?.importeCentavos ?? 0, duracionMinutos: this.turno?.duracionMinutos ?? 0,
    } });
  }

  guardar(): void {
    if (this.guardando || this.cargandoContexto || this.errorContexto) return;
    if (this.contextoSolicitado && !this.turno) return;
    if (this.turno && yaTranscurrio(this.turno.fecha, this.turno.horario)) {
      this.errorContexto = 'Este horario ya pasó. Volvé al agendamiento para elegir uno futuro.';
      return;
    }
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) {
      this.errorGuardado = 'Revisá los campos marcados antes de guardar.';
      return;
    }
    const borrador = this.formulario.getRawValue();
    const paciente: NuevoPaciente = {
      ...borrador,
      codigo: borrador.codigo.trim(), estado: borrador.estado.trim(), frecuencia: borrador.frecuencia.trim(),
      proximaSesion: borrador.proximaSesion.trim() || null,
      diaHabitual: borrador.diaHabitual || null, horarioHabitual: borrador.horarioHabitual || null,
      motivoConsulta: borrador.motivoConsulta.trim(), postIt: borrador.postIt.trim(),
    };
    this.errorGuardado = '';
    this.guardando = true;
    // La API crea el paciente y su turno juntos: si el horario se ocupó, no deja un alta parcial.
    this.pacientesService.crearPaciente(paciente, this.turno ?? undefined).pipe(
      takeUntilDestroyed(this.destroyRef), finalize(() => { this.guardando = false; }),
    ).subscribe({
      next: (creado) => {
        if (!this.visible) return;
        const destino = creado.sesion ? ['/sesiones', creado.sesion.id] : ['/pacientes', creado.paciente.codigo];
        void this.navegacion.navigateRoot(destino, { replaceUrl: true, queryParams: { creado: '1' } });
      },
      error: (error: HttpErrorResponse) => {
        this.errorGuardado = this.mensajeError(error, 'No se pudo crear el paciente. Revisá la conexión y volvé a intentar.');
      },
    });
  }

  cancelar(): void {
    if (this.guardando) return;
    if (this.turno && this.desdeAgendamiento) {
      void this.navegacion.navigateBack('/agenda/agendar', { queryParams: { ...this.turno } });
    } else if (this.desdeAgendamiento) {
      void this.navegacion.navigateBack('/inicio');
    } else {
      void this.navegacion.navigateBack('/pacientes');
    }
  }

  private mensajeError(error: HttpErrorResponse, respaldo: string): string {
    return typeof error.error?.mensaje === 'string' ? error.error.mensaje : respaldo;
  }

  private fechaValida(fecha: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha.startsWith('0000')) return false;
    const instante = new Date(`${fecha}T12:00:00Z`);
    return !Number.isNaN(instante.getTime()) && instante.toISOString().slice(0, 10) === fecha;
  }

}
