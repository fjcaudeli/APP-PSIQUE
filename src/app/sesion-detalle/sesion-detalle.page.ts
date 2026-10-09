import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonRouterLinkWithHref } from '@ionic/angular';
import { arrowBackOutline } from 'ionicons/icons';
import { finalize, Subscription } from 'rxjs';
import { Paciente } from '../models/paciente';
import { EdicionSesion, Sesion } from '../models/sesion';
import { PacientesService } from '../services/pacientes.service';
import { SesionesService } from '../services/sesiones.service';
import { aCentavos, aPesos, importeValido } from '../shared/importes';
import { yaTranscurrio } from '../shared/tiempo';

function fechaValida(control: AbstractControl): ValidationErrors | null {
  const fecha = String(control.value ?? '');
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(fecha)) return { fecha: true };
  const dia = new Date(fecha + 'T12:00:00Z');
  return Number.isFinite(dia.getTime()) && dia.toISOString().slice(0, 10) === fecha ? null : { fecha: true };
}

@Component({
  selector: 'app-sesion-detalle', standalone: true,
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, RouterLink, IonRouterLinkWithHref, IonBackButton, IonContent],
  templateUrl: './sesion-detalle.page.html', styleUrl: './sesion-detalle.page.scss',
})
export class SesionDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly sesionesService = inject(SesionesService);
  private readonly pacientesService = inject(PacientesService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  private cargaPacientes?: Subscription;
  private visible = false;
  readonly iconoVolver = arrowBackOutline;
  readonly formulario = inject(FormBuilder).nonNullable.group({
    codigoPaciente: ['', Validators.required],
    fecha: ['', [Validators.required, fechaValida]],
    horario: ['', [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
    modalidad: ['Presencial' as Sesion['modalidad'], [Validators.required, Validators.pattern(/^(Presencial|Virtual)$/)]],
    estado: ['Programada' as Sesion['estado'], [Validators.required, Validators.pattern(/^(Programada|Realizada)$/)]],
    importe: ['0.00', importeValido],
    pagado: ['0.00', importeValido],
  });
  sesion?: Sesion;
  pacientes: Paciente[] = [];
  cargando = true;
  cargandoPacientes = false;
  editando = false;
  guardando = false;
  errorCarga = '';
  errorPacientes = '';
  errorGuardado = '';
  mensaje = '';

  ionViewWillEnter(): void {
    this.visible = true;
    this.editando = false;
    this.mensaje = this.route.snapshot.queryParamMap.get('creado') === '1' ? 'Paciente creado y sesión agendada.'
      : this.route.snapshot.queryParamMap.get('agendada') === '1' ? 'Sesión agendada.' : '';
    this.cargar();
  }

  ionViewWillLeave(): void {
    this.visible = false;
    this.editando = false;
    this.errorGuardado = '';
    this.mensaje = '';
    this.carga?.unsubscribe();
    this.cargaPacientes?.unsubscribe();
    this.restaurarFormulario();
  }

  cargar(): void {
    this.carga?.unsubscribe();
    this.cargando = true;
    this.errorCarga = '';
    this.errorGuardado = '';
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(id) || id < 1) { this.errorCarga = 'Sesión no encontrada.'; this.cargando = false; return; }
    this.carga = this.sesionesService.obtener(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; }))
      .subscribe({ next: (sesion) => { this.sesion = sesion; this.restaurarFormulario(); }, error: (error: HttpErrorResponse) => { this.errorCarga = error.status === 404 ? 'Sesión no encontrada.' : 'No se pudo cargar la sesión. Volvé a intentar.'; } });
  }

  get puedeRealizar(): boolean { return !!this.sesion && yaTranscurrio(this.sesion.fecha, this.sesion.horario); }

  get realizadaEnFuturo(): boolean {
    const { fecha, horario, estado } = this.formulario.controls;
    return estado.value === 'Realizada' && fecha.valid && horario.valid && !yaTranscurrio(fecha.value, horario.value);
  }

  get cobradoSuperaHonorarios(): boolean {
    const importe = aCentavos(this.formulario.controls.importe.value);
    const pagado = aCentavos(this.formulario.controls.pagado.value);
    return importe !== null && pagado !== null && pagado > importe;
  }

  campoInvalido(campo: keyof typeof this.formulario.controls): boolean {
    const control = this.formulario.controls[campo];
    return control.invalid && (control.dirty || control.touched);
  }

  iniciarEdicion(): void {
    if (this.guardando || !this.sesion) return;
    this.restaurarFormulario();
    this.errorGuardado = '';
    this.mensaje = '';
    this.editando = true;
    this.cargarPacientes();
  }

  cargarPacientes(): void {
    this.cargaPacientes?.unsubscribe();
    this.cargandoPacientes = true;
    this.errorPacientes = '';
    this.cargaPacientes = this.pacientesService.obtenerPacientes()
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargandoPacientes = false; }))
      .subscribe({ next: (pacientes) => { this.pacientes = pacientes; },
        error: () => { this.errorPacientes = 'No se pudo cargar la lista de pacientes. Volvé a intentar para editar la sesión.'; } });
  }

  cancelarEdicion(): void {
    if (this.guardando) return;
    this.cargaPacientes?.unsubscribe();
    this.editando = false;
    this.errorGuardado = '';
    this.errorPacientes = '';
    this.restaurarFormulario();
  }

  private restaurarFormulario(): void {
    if (!this.sesion) return;
    const { codigoPaciente, fecha, horario, modalidad, estado, importeCentavos, pagadoCentavos } = this.sesion;
    this.formulario.reset({ codigoPaciente, fecha, horario, modalidad, estado,
      importe: aPesos(importeCentavos), pagado: aPesos(pagadoCentavos) });
  }

  guardar(): void {
    if (this.guardando || !this.sesion || !this.editando || this.cargandoPacientes || this.errorPacientes) return;
    this.errorGuardado = '';
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) { this.errorGuardado = 'Revisá los campos marcados antes de guardar.'; return; }
    if (this.realizadaEnFuturo) { this.errorGuardado = 'Una sesión futura debe permanecer programada. Podrás marcarla como realizada cuando haya pasado su horario.'; return; }
    const { codigoPaciente, fecha, horario, modalidad, estado, importe, pagado } = this.formulario.getRawValue();
    const importeCentavos = aCentavos(importe);
    const pagadoCentavos = aCentavos(pagado);
    if (importeCentavos === null || pagadoCentavos === null) return;
    if (this.cobradoSuperaHonorarios) { this.errorGuardado = 'El total cobrado no puede superar los honorarios de la sesión.'; return; }
    if (!this.pacientes.some((paciente) => paciente.codigo === codigoPaciente)) {
      this.errorGuardado = 'Elegí un paciente de la lista antes de guardar.';
      return;
    }
    const datos: EdicionSesion = { codigoPaciente, fecha, horario, modalidad, estado, importeCentavos, pagadoCentavos };
    this.guardando = true;
    this.mensaje = '';
    this.sesionesService.actualizar(this.sesion.id, datos).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guardando = false; }))
      .subscribe({ next: (sesion) => {
        this.sesion = sesion;
        this.editando = false;
        this.restaurarFormulario();
        if (this.visible) this.mensaje = 'Cambios guardados.';
      }, error: (error: HttpErrorResponse) => {
        if (this.visible) this.errorGuardado = typeof error.error?.mensaje === 'string' ? error.error.mensaje : 'No se pudo guardar la sesión. Revisá la conexión y volvé a intentar.';
      } });
  }

  realizar(): void {
    if (this.guardando || this.editando || !this.sesion || !this.puedeRealizar || this.sesion.estado === 'Realizada') return;
    this.guardando = true;
    this.errorGuardado = '';
    this.mensaje = '';
    this.sesionesService.realizar(this.sesion.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guardando = false; }))
      .subscribe({ next: (sesion) => { this.sesion = sesion; if (this.visible) this.mensaje = 'Sesión marcada como realizada.'; },
        error: (error: HttpErrorResponse) => { if (this.visible) this.errorGuardado = typeof error.error?.mensaje === 'string' ? error.error.mensaje : 'No se pudo marcar la sesión. Volvé a intentar.'; } });
  }
}
