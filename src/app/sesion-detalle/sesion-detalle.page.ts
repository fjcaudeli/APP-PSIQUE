import { CurrencyPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonRouterLinkWithHref, NavController } from '@ionic/angular';
import { arrowBackOutline } from 'ionicons/icons';
import { finalize, Subscription } from 'rxjs';
import { Paciente } from '../models/paciente';
import { CalendarioAgenda, EdicionSesion, Sesion } from '../models/sesion';
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
  private readonly navegacion = inject(NavController);
  private seleccionandoHorario = false;
  private contextoAntesSelector = '';
  calendario?: CalendarioAgenda;
  confirmandoCancelacion = false;
  private readonly sesionesService = inject(SesionesService);
  private readonly pacientesService = inject(PacientesService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  private cargaPacientes?: Subscription;
  private cargaNota?: Subscription;
  notaDisponible = false;
  notaActual = '';
  cargandoNota = false;
  errorNota = '';
  private visible = false;
  readonly yaTranscurrio = yaTranscurrio;
  readonly iconoVolver = arrowBackOutline;
  readonly formulario = inject(FormBuilder).nonNullable.group({
    codigoPaciente: ['', Validators.required],
    fecha: ['', [Validators.required, fechaValida]],
    horario: ['', [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)]],
    modalidad: ['Presencial' as Sesion['modalidad'], [Validators.required, Validators.pattern(/^(Presencial|Virtual)$/)]],
    estado: ['Programada' as Sesion['estado'], [Validators.required, Validators.pattern(/^(Programada|Realizada|Cancelada)$/)]],
    importe: ['0.00', importeValido],
    pagado: ['0.00', importeValido],
    resumen: ['', Validators.maxLength(100)],
    postIt: ['', Validators.maxLength(300)],
    duracionMinutos: [60, [Validators.required, Validators.pattern(/^(30|40|50|60)$/)]],
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
    if (this.seleccionandoHorario && this.editando) {
      this.seleccionandoHorario = false;
      const q = this.route.snapshot.queryParamMap;
      if (q.get('fecha') && q.get('horario') && JSON.stringify(q.keys.map(k => [k, q.get(k)])) !== this.contextoAntesSelector) {
        this.formulario.patchValue({ fecha: q.get('fecha')!, horario: q.get('horario')!, duracionMinutos: Number(q.get('duracionMinutos')) });
      }
      return;
    }
    this.editando = false;
    this.mensaje = this.route.snapshot.queryParamMap.get('creado') === '1' ? 'Paciente creado y sesión agendada.'
      : this.route.snapshot.queryParamMap.get('agendada') === '1' ? 'Sesión agendada.' : '';
    this.cargar();
  }

  ionViewWillLeave(): void {
    this.visible = false;
    if (this.seleccionandoHorario) return;
    this.confirmandoCancelacion = false;
    this.editando = false;
    this.errorGuardado = '';
    this.mensaje = '';
    this.carga?.unsubscribe();
    this.cargaPacientes?.unsubscribe();
    this.cargaNota?.unsubscribe();
    this.restaurarFormulario();
  }

  cargar(): void {
    this.carga?.unsubscribe();
    this.cargando = true;
    this.errorCarga = '';
    this.errorGuardado = '';
    this.notaDisponible = false; this.notaActual = ''; this.errorNota = '';
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isSafeInteger(id) || id < 1) { this.errorCarga = 'Sesión no encontrada.'; this.cargando = false; return; }
    this.carga = this.sesionesService.obtener(id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; }))
      .subscribe({ next: (sesion) => {
        this.sesion = sesion; this.restaurarFormulario();
        if (this.route.snapshot.queryParamMap.get('editar') === '1') this.iniciarEdicion();
      }, error: (error: HttpErrorResponse) => { this.errorCarga = error.status === 404 ? 'Sesión no encontrada.' : 'No se pudo cargar la sesión. Volvé a intentar.'; } });
  }

  get puedeRealizar(): boolean { return !!this.sesion && yaTranscurrio(this.sesion.fecha, this.sesion.horario); }

  get pacienteBloqueado(): boolean { return !!this.sesion && yaTranscurrio(this.sesion.fecha, this.sesion.horario); }
  get desdeNotas(): boolean { return this.route.snapshot.queryParamMap.get('nota') === '1'; }
  get puedeEditarNota(): boolean {
    return this.notaDisponible && this.formulario.controls.codigoPaciente.value === this.sesion?.codigoPaciente
      && this.formulario.controls.estado.value === 'Programada';
  }

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
    this.cargarNota();
    this.sesionesService.calendario(this.sesion.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: c => { this.calendario = c; }, error: () => { this.calendario = undefined; } });
    if (!yaTranscurrio(this.sesion.fecha, this.sesion.horario)) {
      this.formulario.controls.fecha.disable({ emitEvent: false }); this.formulario.controls.horario.disable({ emitEvent: false });
    }
  }

  cargarNota(): void {
    this.cargaNota?.unsubscribe();
    this.notaDisponible = false; this.errorNota = '';
    if (!this.sesion || this.sesion.estado !== 'Programada') {
      if (this.desdeNotas) this.errorNota = 'Esta sesión ya no está programada. Volvé a Notas para actualizar el listado.';
      return;
    }
    this.cargandoNota = true;
    this.cargaNota = this.sesionesService.agendadas(this.sesion.codigoPaciente)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargandoNota = false; })).subscribe({
        next: sesiones => {
          const proxima = sesiones.find(s => s.id === this.sesion?.id && s.esProxima);
          this.notaDisponible = !!proxima;
          this.notaActual = proxima?.postIt ?? '';
          this.formulario.controls.postIt.reset(this.notaActual);
          if (!proxima && this.desdeNotas) this.errorNota = 'Esta sesión ya no es la próxima programada. Volvé a Notas para actualizar el listado.';
        },
        error: () => { this.errorNota = 'No se pudo cargar la Nota. Volvé a intentar.'; },
      });
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
    this.cargaNota?.unsubscribe();
    this.editando = false;
    this.errorGuardado = '';
    this.errorPacientes = '';
    this.restaurarFormulario();
  }

  private restaurarFormulario(): void {
    if (!this.sesion) return;
    const { codigoPaciente, fecha, horario, modalidad, estado, importeCentavos, pagadoCentavos } = this.sesion;
    this.formulario.controls.fecha.enable({ emitEvent: false }); this.formulario.controls.horario.enable({ emitEvent: false });
    // Conservamos la asignación histórica según el horario original de la sesión,
    // aunque se corrija su fecha en el borrador. getRawValue incluye este campo.
    if (this.pacienteBloqueado) this.formulario.controls.codigoPaciente.disable({ emitEvent: false });
    else this.formulario.controls.codigoPaciente.enable({ emitEvent: false });
    this.formulario.reset({ codigoPaciente, fecha, horario, modalidad, estado, duracionMinutos: this.sesion.duracionMinutos, resumen: this.sesion.resumen ?? '',
      postIt: this.notaActual,
      importe: aPesos(importeCentavos), pagado: aPesos(pagadoCentavos) });
  }

  guardar(): void {
    if (this.guardando || !this.sesion || !this.editando || this.cargandoPacientes || this.cargandoNota || this.errorPacientes) return;
    this.errorGuardado = '';
    if ((this.desdeNotas || this.formulario.controls.postIt.dirty) && (!this.puedeEditarNota || this.errorNota)) {
      this.errorGuardado = this.errorNota || 'Para editar la Nota, conservá el paciente y el estado Programada de la próxima sesión.'; return;
    }
    this.formulario.markAllAsTouched();
    if (this.errorReserva) { this.errorGuardado = this.errorReserva; return; }
    if (this.formulario.invalid) { this.errorGuardado = 'Revisá los campos marcados antes de guardar.'; return; }
    if (this.realizadaEnFuturo) { this.errorGuardado = 'Una sesión futura debe permanecer programada. Podrás marcarla como realizada cuando haya pasado su horario.'; return; }
    const { codigoPaciente, fecha, horario, modalidad, estado, importe, pagado, resumen, duracionMinutos } = this.formulario.getRawValue();
    const importeCentavos = aCentavos(importe);
    const pagadoCentavos = aCentavos(pagado);
    if (importeCentavos === null || pagadoCentavos === null) return;
    if (this.cobradoSuperaHonorarios) { this.errorGuardado = 'El total cobrado no puede superar los honorarios de la sesión.'; return; }
    if (!this.pacientes.some((paciente) => paciente.codigo === codigoPaciente)) {
      this.errorGuardado = 'Elegí un paciente de la lista antes de guardar.';
      return;
    }
    const datos: EdicionSesion = { codigoPaciente, fecha, horario, modalidad, estado, importeCentavos, pagadoCentavos, resumen, duracionMinutos: Number(duracionMinutos) };
    if (this.puedeEditarNota && this.formulario.controls.postIt.dirty) datos.postIt = this.formulario.controls.postIt.value.trim();
    this.guardando = true;
    this.mensaje = '';
    this.sesionesService.actualizar(this.sesion.id, datos).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guardando = false; }))
      .subscribe({ next: (sesion) => {
        this.sesion = sesion;
        if (datos.postIt !== undefined) this.notaActual = datos.postIt;
        this.editando = false;
        this.restaurarFormulario();
        if (this.visible) this.mensaje = 'Cambios guardados.';
        if (this.desdeNotas) void this.navegacion.navigateBack('/notas');
      }, error: (error: HttpErrorResponse) => {
        if (this.visible) this.errorGuardado = typeof error.error?.mensaje === 'string' ? error.error.mensaje : 'No se pudo guardar la sesión. Revisá la conexión y volvé a intentar.';
      } });
  }

  get errorReserva(): string {
    if (!this.sesion || !this.calendario) return '';
    const v = this.formulario.getRawValue();
    if (yaTranscurrio(v.fecha, v.horario) || (v.fecha === this.sesion.fecha && v.horario === this.sesion.horario && Number(v.duracionMinutos) === this.sesion.duracionMinutos)) return '';
    const inicio = Number(v.horario.slice(0, 2)) * 60 + Number(v.horario.slice(3));
    const dia = this.calendario.dias.find(d => d.fecha === v.fecha);
    return dia?.habilitado && dia.libres.some(f => v.horario >= f.desde && inicio + Number(v.duracionMinutos) <= Number(f.hasta.slice(0, 2)) * 60 + Number(f.hasta.slice(3)))
      ? '' : 'La duración o el horario elegido no entra en una franja libre. Revisá el calendario o reducí la duración.';
  }

  elegirHorario(): void {
    if (!this.sesion || this.guardando) return;
    this.seleccionandoHorario = true;
    const q = this.route.snapshot.queryParamMap;
    this.contextoAntesSelector = JSON.stringify(q.keys.map(k => [k, q.get(k)]));
    void this.navegacion.navigateForward('/agenda/horarios-disponibles/sesion', { queryParams: {
      sesionId: this.sesion.id, codigo: this.formulario.controls.codigoPaciente.value,
      fecha: this.formulario.controls.fecha.value, horario: this.formulario.controls.horario.value,
      duracionMinutos: this.formulario.controls.duracionMinutos.value,
    } });
  }

  desagendar(): void {
    if (!this.sesion || this.guardando) return;
    this.guardando = true; this.errorGuardado = '';
    this.sesionesService.cancelar(this.sesion.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guardando = false; })).subscribe({
      next: sesion => { this.sesion = sesion; this.confirmandoCancelacion = false; this.mensaje = 'Sesión desagendada. El intervalo quedó libre y sus datos se conservaron.'; },
      error: (error: HttpErrorResponse) => { this.errorGuardado = error.error?.mensaje ?? 'No se pudo desagendar la sesión.'; },
    });
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
