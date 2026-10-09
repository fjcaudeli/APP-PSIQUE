import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonIcon } from '@ionic/angular';
import { arrowBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { catchError, EMPTY, finalize, map, merge, Subject, switchMap } from 'rxjs';
import { SesionesService } from '../services/sesiones.service';
import { ahoraConsultorio, desplazarFecha } from '../shared/tiempo';

@Component({
  selector: 'app-sesiones',
  standalone: true,
  imports: [AsyncPipe, DatePipe, RouterLink, IonBackButton, IonContent, IonIcon],
  templateUrl: './sesiones.page.html',
  styleUrl: './sesiones.page.scss',
})
export class SesionesPage {
  private readonly sesiones = inject(SesionesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly refrescar = new Subject<void>();
  readonly iconoVolver = arrowBackOutline;
  readonly iconoDetalle = chevronForwardOutline;
  cargando = true;
  errorCarga = false;
  fechaReferencia = this.inicioSemana(ahoraConsultorio().fecha);

  // La semana viaja en la URL: se conserva al abrir una sesión, volver y recargar.
  readonly historial$ = merge(
    this.route.queryParamMap.pipe(map((parametros) => parametros.get('fecha'))),
    this.refrescar.pipe(map(() => this.route.snapshot.queryParamMap.get('fecha'))),
  ).pipe(switchMap((fecha) => {
    this.cargando = true;
    this.errorCarga = false;
    this.fechaReferencia = this.inicioSemana(this.fechaValida(fecha) ? fecha : ahoraConsultorio().fecha);
    return this.sesiones.historial(fecha ?? undefined).pipe(
      catchError(() => { this.errorCarga = true; return EMPTY; }),
      finalize(() => { this.cargando = false; }),
    );
  }));

  ionViewWillEnter(): void { this.cargar(); }
  cargar(): void { this.refrescar.next(); }

  get esSemanaActual(): boolean { return this.fechaReferencia === this.inicioSemana(ahoraConsultorio().fecha); }
  get puedeAvanzar(): boolean { return this.fechaReferencia < this.inicioSemana(ahoraConsultorio().fecha); }

  cambiarSemana(dias: number): void {
    this.irASemana(desplazarFecha(this.fechaReferencia, dias));
  }

  semanaActual(): void { this.irASemana(this.inicioSemana(ahoraConsultorio().fecha)); }

  private irASemana(fecha: string): void {
    void this.router.navigate([], {
      relativeTo: this.route, queryParams: { fecha }, queryParamsHandling: 'merge',
    });
  }

  private inicioSemana(fecha: string): string {
    return desplazarFecha(fecha, -((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7));
  }

  private fechaValida(fecha: string | null): fecha is string {
    if (!fecha || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
    const dia = new Date(`${fecha}T12:00:00Z`);
    return Number.isFinite(dia.getTime()) && dia.toISOString().slice(0, 10) === fecha;
  }
}
