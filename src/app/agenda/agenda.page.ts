import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonContent, IonRouterLinkWithHref, NavController } from '@ionic/angular';
import { finalize, Subscription } from 'rxjs';
import { CalendarioAgenda } from '../models/sesion';
import { SesionesService } from '../services/sesiones.service';
import { CalendarioComponent } from '../shared/calendario.component';
import { ahoraConsultorio } from '../shared/tiempo';

@Component({ selector: 'app-agenda', standalone: true,
  imports: [IonContent, RouterLink, IonRouterLinkWithHref, CalendarioComponent],
  templateUrl: './agenda.page.html', styleUrl: './agenda.page.scss' })
export class AgendaPage {
  private readonly sesiones = inject(SesionesService);
  private readonly navegacion = inject(NavController);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  calendario?: CalendarioAgenda;
  semanaVisible = '';
  cargando = false;
  error = '';
  ionViewWillEnter(): void { this.cargar(ahoraConsultorio().fecha); }
  ionViewWillLeave(): void { this.carga?.unsubscribe(); }
  cargar(fecha = this.semanaVisible || ahoraConsultorio().fecha): void {
    this.semanaVisible = fecha;
    this.carga?.unsubscribe(); this.cargando = true; this.error = '';
    this.carga = this.sesiones.calendario(undefined, fecha).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; })).subscribe({
      next: calendario => { this.calendario = calendario; }, error: () => { this.error = 'No se pudo cargar el calendario.'; },
    });
  }
  agendar(fecha: string): void { void this.navegacion.navigateForward('/agenda/agendar', { queryParams: { fecha } }); }
}
