import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon, IonModal, NavController } from '@ionic/angular';
import {
  calendarOutline,
  cardOutline,
  peopleOutline,
  timeOutline,
} from 'ionicons/icons';
import { catchError, defer, EMPTY, finalize, Observable } from 'rxjs';
import { ResumenDashboard } from '../models/dashboard';
import { DisponibilidadSemanal, HorarioDisponible, Sesion } from '../models/sesion';
import { DashboardService } from '../services/dashboard.service';
import { SesionesService } from '../services/sesiones.service';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, DatePipe, RouterLink, IonContent, IonIcon, IonModal],
  templateUrl: './inicio.page.html',
  styleUrl: './inicio.page.scss',
})
export class InicioPage {
  private readonly dashboard = inject(DashboardService);
  private readonly sesiones = inject(SesionesService);
  private readonly navegacion = inject(NavController);
  @ViewChild(IonModal) private modal?: IonModal;

  cargando = true;
  errorCarga = false;
  resumen$?: Observable<ResumenDashboard>;
  modalAbierto: 'cobros' | 'horarios' | null = null;
  cargandoModal = false;
  errorModal = false;
  cobros$?: Observable<Sesion[]>;
  horarios$?: Observable<DisponibilidadSemanal>;

  ionViewWillEnter(): void { this.cargarResumen(); }

  cargarResumen(): void {
    this.resumen$ = defer(() => {
      this.cargando = true;
      this.errorCarga = false;
      return this.dashboard.obtenerResumen().pipe(
        catchError(() => { this.errorCarga = true; return EMPTY; }),
        finalize(() => { this.cargando = false; }),
      );
    });
  }

  abrirModal(tipo: 'cobros' | 'horarios'): void {
    this.modalAbierto = tipo;
    this.cargarModal();
  }

  cargarModal(): void {
    if (this.modalAbierto === 'cobros') {
      this.cobros$ = defer(() => {
        this.cargandoModal = true;
        this.errorModal = false;
        return this.sesiones.pendientes().pipe(
          catchError(() => { this.errorModal = true; return EMPTY; }),
          finalize(() => { this.cargandoModal = false; }),
        );
      });
    } else if (this.modalAbierto === 'horarios') {
      this.horarios$ = defer(() => {
        this.cargandoModal = true;
        this.errorModal = false;
        return this.sesiones.disponibles().pipe(
          catchError(() => { this.errorModal = true; return EMPTY; }),
          finalize(() => { this.cargandoModal = false; }),
        );
      });
    }
  }

  async cerrarModal(): Promise<void> { await this.modal?.dismiss(); }

  alCerrarModal(): void {
    this.modalAbierto = null;
    this.cobros$ = undefined;
    this.horarios$ = undefined;
  }

  async abrirSesion(sesion: Sesion): Promise<void> {
    await this.cerrarModal();
    await this.navegacion.navigateForward(['/sesiones', sesion.id]);
  }

  async agendar(horario: HorarioDisponible): Promise<void> {
    await this.cerrarModal();
    await this.navegacion.navigateForward('/agenda/agendar', {
      queryParams: { fecha: horario.fecha, horario: horario.horario },
    });
  }

  async cargarHorario(): Promise<void> {
    await this.cerrarModal();
    await this.navegacion.navigateForward('/agenda', { queryParams: { crearHorario: '1' } });
  }

  // Importamos solo los iconos que utiliza esta pantalla.
  readonly iconoPacientes = peopleOutline;
  readonly iconoSesiones = calendarOutline;
  readonly iconoCobros = cardOutline;
  readonly iconoHorarios = timeOutline;
}
