import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonRouterLinkWithHref } from '@ionic/angular';
import { arrowBackOutline } from 'ionicons/icons';
import { finalize, Subscription } from 'rxjs';
import { SesionAgendada } from '../models/sesion';
import { SesionesService } from '../services/sesiones.service';

@Component({
  selector: 'app-sesiones-agendadas', standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, IonBackButton, IonContent, IonRouterLinkWithHref],
  templateUrl: './sesiones-agendadas.page.html', styleUrl: './sesiones-agendadas.page.scss',
})
export class SesionesAgendadasPage {
  private readonly servicio = inject(SesionesService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  private filtros?: Subscription;
  readonly iconoVolver = arrowBackOutline;
  sesiones: SesionAgendada[] = [];
  codigoPaciente = '';
  cargando = false;
  error = '';

  get destinoVolver(): string { return this.codigoPaciente ? '/pacientes/' + encodeURIComponent(this.codigoPaciente) : '/inicio'; }

  ionViewWillEnter(): void {
    this.filtros?.unsubscribe();
    this.filtros = this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(parametros => {
      this.codigoPaciente = parametros.get('codigoPaciente') ?? '';
      this.cargar();
    });
  }

  ionViewWillLeave(): void {
    this.filtros?.unsubscribe();
    this.carga?.unsubscribe();
    this.sesiones = [];
  }

  cargar(): void {
    this.carga?.unsubscribe();
    this.cargando = true; this.error = ''; this.sesiones = [];
    // Al volver de una sesión o de la ficha se consulta nuevamente: la Nota
    // es el vigente del paciente y no una copia guardada con la reserva.
    this.carga = this.servicio.agendadas(this.codigoPaciente || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.cargando = false; }))
      .subscribe({
        next: sesiones => { this.sesiones = sesiones; },
        error: () => { this.error = 'No se pudieron cargar las sesiones agendadas. Volvé a intentar.'; },
      });
  }
}
