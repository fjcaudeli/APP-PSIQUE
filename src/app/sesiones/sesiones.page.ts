import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonIcon } from '@ionic/angular';
import { arrowBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { catchError, defer, EMPTY, finalize, Observable } from 'rxjs';
import { HistorialSemanal } from '../models/sesion';
import { SesionesService } from '../services/sesiones.service';

@Component({
  selector: 'app-sesiones',
  standalone: true,
  imports: [AsyncPipe, DatePipe, RouterLink, IonBackButton, IonContent, IonIcon],
  templateUrl: './sesiones.page.html',
  styleUrl: './sesiones.page.scss',
})
export class SesionesPage {
  private readonly sesiones = inject(SesionesService);
  readonly iconoVolver = arrowBackOutline;
  readonly iconoDetalle = chevronForwardOutline;
  historial$?: Observable<HistorialSemanal>;
  cargando = true;
  errorCarga = false;

  ionViewWillEnter(): void { this.cargar(); }

  cargar(): void {
    this.historial$ = defer(() => {
      this.cargando = true;
      this.errorCarga = false;
      return this.sesiones.historial().pipe(
        catchError(() => { this.errorCarga = true; return EMPTY; }),
        finalize(() => { this.cargando = false; }),
      );
    });
  }
}
