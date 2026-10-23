import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonIcon } from '@ionic/angular';
import { arrowBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { finalize, Subscription } from 'rxjs';
import { Sesion } from '../models/sesion';
import { SesionesService } from '../services/sesiones.service';

@Component({
  selector: 'app-sesiones',
  standalone: true,
  imports: [CurrencyPipe, DatePipe, RouterLink, IonBackButton, IonContent, IonIcon],
  templateUrl: './sesiones.page.html',
  styleUrl: './sesiones.page.scss',
})
export class SesionesPage {
  private readonly servicio = inject(SesionesService);
  private readonly destroyRef = inject(DestroyRef);
  private carga?: Subscription;
  @ViewChild(IonContent) private contenido?: IonContent;
  readonly iconoVolver = arrowBackOutline;
  readonly iconoDetalle = chevronForwardOutline;
  cargando = true;
  errorCarga = false;
  sesiones: Sesion[] = [];
  readonly tamanioPagina = 5;
  paginaActual = 1;

  get totalPaginas(): number { return Math.max(1, Math.ceil(this.sesiones.length / this.tamanioPagina)); }
  get sesionesPagina(): Sesion[] {
    const desde = (this.paginaActual - 1) * this.tamanioPagina;
    return this.sesiones.slice(desde, desde + this.tamanioPagina);
  }

  cambiarPagina(pagina: number): void {
    if (this.cargando || this.errorCarga || !Number.isInteger(pagina) || pagina < 1 || pagina > this.totalPaginas || pagina === this.paginaActual) return;
    this.paginaActual = pagina;
    void this.contenido?.scrollToTop(0);
  }

  ionViewWillEnter(): void { this.cargar(); }
  ionViewWillLeave(): void { this.carga?.unsubscribe(); this.sesiones = []; }
  cargar(): void {
    this.carga?.unsubscribe();
    this.cargando = true; this.errorCarga = false; this.sesiones = [];
    // Al volver del detalle se reflejan asistencia, fechas y cobros corregidos.
    this.carga = this.servicio.ultimas().pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.cargando = false; })).subscribe({
      next: sesiones => {
        // La API ya ordena de más reciente a más antigua. Al refrescar,
        // conservamos la página salvo que haya desaparecido su último registro.
        this.sesiones = sesiones;
        this.paginaActual = Math.min(this.paginaActual, this.totalPaginas);
      },
      error: () => { this.errorCarga = true; },
    });
  }
}
