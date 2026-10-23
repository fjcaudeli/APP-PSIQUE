import { AsyncPipe, CurrencyPipe, DatePipe } from '@angular/common';
import { Component, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent, IonIcon, IonModal, NavController } from '@ionic/angular';
import {
  calendarOutline,
  cardOutline,
  documentTextOutline,
  peopleOutline,
  timeOutline,
} from 'ionicons/icons';
import { catchError, defer, EMPTY, finalize, forkJoin, map, Observable } from 'rxjs';
import { ResumenDashboard } from '../models/dashboard';
import { Sesion } from '../models/sesion';
import { DashboardService } from '../services/dashboard.service';
import { SesionesService } from '../services/sesiones.service';
import { AuthService } from '../services/auth.service';

type ResumenInicio = ResumenDashboard & { notas: number; sesionesAgendadas: number; ultimasSesiones: number };

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [AsyncPipe, CurrencyPipe, DatePipe, RouterLink, IonContent, IonIcon, IonModal],
  templateUrl: './inicio.page.html',
  styleUrl: './inicio.page.scss',
})
export class InicioPage implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);
  private readonly sesiones = inject(SesionesService);
  private readonly navegacion = inject(NavController);
  @ViewChild(IonModal) private modal?: IonModal;
  @ViewChild(IonModal, { read: ElementRef }) private elementoModal?: ElementRef<HTMLElement>;

  cargando = true;
  errorCarga = false;
  resumen$?: Observable<ResumenInicio>;
  modalAbierto: 'cobros' | null = null;
  cargandoModal = false;
  errorModal = false;
  cobros$?: Observable<Sesion[]>;

  ionViewWillEnter(): void { this.cargarResumen(); }

  ngOnDestroy(): void {
    // Ionic mueve el modal abierto al body. Al cerrar o vencer la sesión debemos
    // quitar también ese elemento, sin dejar datos privados sobre la pantalla Login.
    // Su desconexión permite que Ionic retire el bloqueo de foco y aria-hidden.
    this.elementoModal?.nativeElement.remove();
  }

  cargarResumen(): void {
    this.resumen$ = defer(() => {
      this.cargando = true;
      this.errorCarga = false;
      return forkJoin({ resumen: this.dashboard.obtenerResumen(), agendadas: this.sesiones.agendadas(), ultimas: this.sesiones.ultimas() }).pipe(
        // Se reutilizan las reservas privadas: una Nota con texto por próxima
        // sesión, mientras el otro contador incluye también el segundo bloque.
        map(({ resumen, agendadas, ultimas }) => ({ ...resumen, sesionesAgendadas: agendadas.length, ultimasSesiones: ultimas.length,
          notas: agendadas.filter(sesion => sesion.esProxima && !!sesion.postIt?.trim()).length })),
        catchError(() => { this.errorCarga = true; return EMPTY; }),
        finalize(() => { this.cargando = false; }),
      );
    });
  }

  abrirModal(tipo: 'cobros'): void {
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

    }
  }

  async cerrarModal(): Promise<void> { await this.modal?.dismiss(); }

  alCerrarModal(): void {
    this.modalAbierto = null;
    this.cobros$ = undefined;
  }

  async abrirSesion(sesion: Sesion): Promise<void> {
    await this.cerrarModal();
    await this.navegacion.navigateForward(['/sesiones', sesion.id]);
  }

  // Importamos solo los iconos que utiliza esta pantalla.
  readonly iconoPacientes = peopleOutline;
  readonly iconoSesiones = calendarOutline;
  readonly iconoCobros = cardOutline;
  readonly iconoHorarios = timeOutline;
  readonly iconoNotas = documentTextOutline;
}
