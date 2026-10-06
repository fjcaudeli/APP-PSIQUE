import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonContent, NavController } from '@ionic/angular';
import { arrowBackOutline } from 'ionicons/icons';
import { finalize, forkJoin, Subscription } from 'rxjs';
import { Paciente } from '../models/paciente';
import { HorarioConsultado } from '../models/sesion';
import { PacientesService } from '../services/pacientes.service';
import { SesionesService } from '../services/sesiones.service';
import { aCentavos, aPesos, importeValido } from '../shared/importes';
import { yaTranscurrio } from '../shared/tiempo';

@Component({
  selector: 'app-agendar', standalone: true,
  imports: [DatePipe, ReactiveFormsModule, IonBackButton, IonContent],
  templateUrl: './agendar.page.html', styleUrl: './agendar.page.scss',
})
export class AgendarPage {
  private readonly route = inject(ActivatedRoute);
  private readonly navegacion = inject(NavController);
  private readonly pacientesService = inject(PacientesService);
  private readonly sesionesService = inject(SesionesService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  readonly iconoVolver = arrowBackOutline;
  readonly formulario = inject(FormBuilder).nonNullable.group({
    codigoPaciente: ['', Validators.required],
    modalidad: ['Presencial' as Paciente['modalidad'], Validators.required],
    importe: ['0.00', importeValido],
  });
  fecha = '';
  horario = '';
  turno?: HorarioConsultado;
  pacientes: Paciente[] = [];
  cargando = true;
  guardando = false;
  errorCarga = '';
  errorGuardado = '';

  ionViewWillEnter(): void { this.cargar(); }

  cargar(): void {
    this.carga?.unsubscribe();
    const parametros = this.route.snapshot.queryParamMap;
    this.fecha = parametros.get('fecha') ?? '';
    this.horario = parametros.get('horario') ?? '';
    this.turno = undefined;
    this.errorCarga = '';
    this.errorGuardado = '';
    this.cargando = true;
    const modalidad = parametros.get('modalidad');
    const importe = Number(parametros.get('importeCentavos') ?? 0);
    this.formulario.reset({ codigoPaciente: '', modalidad: modalidad === 'Virtual' ? 'Virtual' : 'Presencial',
      importe: Number.isSafeInteger(importe) && importe >= 0 && importe <= 999999999 ? aPesos(importe) : '0.00' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.fecha) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(this.horario)) {
      this.errorCarga = 'Elegí un horario disponible desde Inicio o Agenda.';
      this.cargando = false;
      return;
    }
    this.carga = forkJoin({ turno: this.sesionesService.horario(this.fecha, this.horario), pacientes: this.pacientesService.obtenerPacientes() })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; }))
      .subscribe({
        next: ({ turno, pacientes }) => {
          this.turno = turno;
          this.pacientes = pacientes;
          if (turno.estado === 'Programado') this.errorCarga = 'Este horario ya está ocupado. Elegí otro desde Agenda.';
          else if (yaTranscurrio(this.fecha, this.horario)) this.errorCarga = 'Este horario ya pasó. Elegí un horario futuro.';
        },
        error: (error: HttpErrorResponse) => { this.errorCarga = error.status === 404 ? 'El horario ya no está disponible. Elegí otro desde Agenda.' : 'No se pudo cargar el horario. Volvé a intentar.'; },
      });
  }

  seleccionarPaciente(): void {
    const paciente = this.pacientes.find((p) => p.codigo === this.formulario.controls.codigoPaciente.value);
    if (paciente) this.formulario.controls.modalidad.setValue(paciente.modalidad);
  }

  crearPaciente(): void {
    if (this.guardando || this.errorCarga || !this.turno) return;
    this.formulario.controls.importe.markAsTouched();
    const importeCentavos = aCentavos(this.formulario.controls.importe.value);
    if (importeCentavos === null) return;
    void this.navegacion.navigateForward('/pacientes/nuevo', { queryParams: {
      fecha: this.fecha, horario: this.horario, modalidad: this.formulario.controls.modalidad.value, importeCentavos,
    } });
  }

  guardar(): void {
    if (this.guardando || this.errorCarga || !this.turno) return;
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) return;
    const { codigoPaciente, modalidad, importe } = this.formulario.getRawValue();
    const importeCentavos = aCentavos(importe);
    if (importeCentavos === null) return;
    this.guardando = true;
    this.errorGuardado = '';
    this.sesionesService.agendar({ fecha: this.fecha, horario: this.horario, codigoPaciente, modalidad, importeCentavos })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guardando = false; }))
      .subscribe({
        next: (sesion) => { void this.navegacion.navigateRoot(['/sesiones', sesion.id], { replaceUrl: true, queryParams: { agendada: '1' } }); },
        error: (error: HttpErrorResponse) => { this.errorGuardado = error.error?.mensaje ?? 'No se pudo agendar la sesión. Revisá la conexión y volvé a intentar.'; },
      });
  }

  volver(): void { void this.navegacion.navigateRoot('/agenda'); }
}
