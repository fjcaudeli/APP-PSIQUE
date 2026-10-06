import { AsyncPipe, DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonRouterLinkWithHref } from '@ionic/angular';
import { catchError, defer, EMPTY, finalize, Observable } from 'rxjs';
import { SemanaAgenda } from '../models/turno';
import { AgendaService } from '../services/agenda.service';
import { SesionesService } from '../services/sesiones.service';
import { ahoraConsultorio, desplazarFecha, yaTranscurrio } from '../shared/tiempo';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [AsyncPipe, DatePipe, IonContent, ReactiveFormsModule, RouterLink, IonRouterLinkWithHref],
  templateUrl: './agenda.page.html',
  styleUrl: './agenda.page.scss',
})
export class AgendaPage {
  private readonly agendaService = inject(AgendaService);
  private readonly sesionesService = inject(SesionesService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  fechaReferencia = ahoraConsultorio().fecha;
  mostrarFormulario = false;
  guardando = false;
  errorGuardado = '';
  mensaje = '';
  readonly formulario = inject(FormBuilder).nonNullable.group({
    fecha: [this.fechaReferencia, Validators.required],
    horario: ['', Validators.required],
  });
  readonly yaTranscurrio = yaTranscurrio;
  get hoy(): string { return ahoraConsultorio().fecha; }

  cargando = true;
  errorCarga = false;

  semana$?: Observable<SemanaAgenda>;

  // Volvemos a consultar al entrar: los turnos pueden conservar su horario pero
  // recibir un código nuevo cuando se personaliza el identificador de un paciente.
  ionViewWillEnter(): void {
    if (this.route.snapshot.queryParamMap.get('crearHorario') === '1') this.mostrarFormulario = true;
    this.cargarSemana();
  }

  cargarSemana(): void {
    this.semana$ = defer(() => {
      this.cargando = true;
      this.errorCarga = false;
      return this.agendaService.obtenerSemana(this.fechaReferencia).pipe(
        catchError(() => {
          this.errorCarga = true;
          return EMPTY;
        }),
        finalize(() => { this.cargando = false; }),
      );
    });
  }

  // Al abrir Agenda seleccionamos el día de hoy en el calendario del consultorio.
  indiceDiaSeleccionado = (new Date(`${this.fechaReferencia}T12:00:00Z`).getUTCDay() + 6) % 7;

  seleccionarDia(indice: number, fecha: string): void {
    // Cambiar la selección actualiza la lista sin modificar los turnos de la semana.
    this.indiceDiaSeleccionado = indice;
    if (!this.guardando) this.formulario.controls.fecha.setValue(fecha);
  }

  cambiarSemana(dias: number): void {
    this.fechaReferencia = desplazarFecha(this.fechaReferencia, dias);
    this.cargarSemana();
  }

  semanaActual(): void {
    this.fechaReferencia = this.hoy;
    this.indiceDiaSeleccionado = (new Date(`${this.fechaReferencia}T12:00:00Z`).getUTCDay() + 6) % 7;
    this.cargarSemana();
  }

  crearHorario(): void {
    if (this.guardando) return;
    this.formulario.markAllAsTouched();
    if (this.formulario.invalid) return;
    const { fecha, horario } = this.formulario.getRawValue();
    this.guardando = true;
    this.errorGuardado = '';
    this.mensaje = '';
    this.sesionesService.crearHorario(fecha, horario)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.guardando = false; }))
      .subscribe({
        next: () => {
          this.fechaReferencia = fecha;
          this.indiceDiaSeleccionado = (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;
          this.formulario.controls.horario.reset('');
          this.mostrarFormulario = false;
          this.mensaje = 'Horario disponible agregado.';
          this.cargarSemana();
        },
        error: (error: HttpErrorResponse) => { this.errorGuardado = error.error?.mensaje ?? 'No se pudo agregar el horario. Volvé a intentar.'; },
      });
  }
}
