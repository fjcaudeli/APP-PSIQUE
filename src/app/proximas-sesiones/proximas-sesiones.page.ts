import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonContent, IonRouterLinkWithHref, NavController } from '@ionic/angular';
import { finalize, Subscription } from 'rxjs';
import { Paciente } from '../models/paciente';
import { Sesion } from '../models/sesion';
import { SesionesService } from '../services/sesiones.service';
import { PacientesService } from '../services/pacientes.service';
import { ahoraConsultorio, desplazarFecha } from '../shared/tiempo';

@Component({ selector: 'app-proximas-sesiones', standalone: true,
  imports: [DatePipe, RouterLink, IonContent, IonRouterLinkWithHref],
  templateUrl: './proximas-sesiones.page.html', styleUrl: '../shared/pagina.scss' })
export class ProximasSesionesPage {
  private readonly sesiones = inject(SesionesService);
  private readonly pacientes = inject(PacientesService);
  private readonly navegacion = inject(NavController);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  pendientes: { paciente: Paciente; ultimaSesion: Sesion | null }[] = [];
  cargando = false;
  error = '';
  confirmarSuspension = '';
  suspendiendo = false;
  errorEstado = '';
  ionViewWillEnter(): void { this.cargar(); }
  ionViewWillLeave(): void { this.carga?.unsubscribe(); this.confirmarSuspension = ''; this.errorEstado = ''; }
  cargar(): void {
    this.carga?.unsubscribe(); this.cargando = true; this.error = '';
    this.carga = this.sesiones.pendientesAgendar().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; })).subscribe({
      next: pendientes => { this.pendientes = pendientes; }, error: () => { this.error = 'No se pudieron consultar los pacientes pendientes de agendar.'; },
    });
  }
  agendar(paciente: Paciente, ultima: Sesion | null, mantener = false): void {
    // La sugerencia nunca reserva automáticamente. El calendario y el backend
    // vuelven a validar fecha, duración y ocupación al confirmar.
    const hoy = ahoraConsultorio().fecha;
    const indiceHoy = (new Date(`${hoy}T12:00:00Z`).getUTCDay() + 6) % 7;
    const indiceUltima = ultima ? (new Date(`${ultima.fecha}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
    const fecha = desplazarFecha(hoy, 7 - indiceHoy + indiceUltima);
    void this.navegacion.navigateForward('/agenda/agendar', { queryParams: {
      codigoPaciente: paciente.codigo, modalidad: paciente.modalidad, pacienteFijo: '1',
      ...(ultima ? { duracionMinutos: ultima.duracionMinutos } : {}),
      ...(mantener && ultima ? { fecha, horario: ultima.horario } : {}),
    } });
  }
  suspender(codigo: string): void {
    if (this.suspendiendo || this.confirmarSuspension !== codigo) return;
    this.suspendiendo = true; this.errorEstado = '';
    // Suspendido es el estado persistente: al volver a entrar tampoco integra
    // el contador ni la cola, y se puede reactivar desde su ficha.
    this.pacientes.suspender(codigo).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.suspendiendo = false; })).subscribe({
      next: () => { this.pendientes = this.pendientes.filter(p => p.paciente.codigo !== codigo); this.confirmarSuspension = ''; },
      error: () => { this.errorEstado = 'No se pudo suspender al paciente. Continúa pendiente de agendar; volvé a intentar.'; },
    });
  }
}
