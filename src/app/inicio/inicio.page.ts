import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular';
import {
  calendarOutline,
  cardOutline,
  peopleOutline,
  timeOutline,
} from 'ionicons/icons';
import { catchError, EMPTY, finalize } from 'rxjs';
import { DashboardService } from '../services/dashboard.service';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [AsyncPipe, IonContent, IonIcon],
  templateUrl: './inicio.page.html',
  styleUrl: './inicio.page.scss',
})
export class InicioPage {
  cargando = true;
  errorCarga = false;

  // El servicio entrega el resumen como Observable. AsyncPipe recibe su valor
  // en el HTML, de modo que Inicio solo se ocupa de presentar los indicadores.
  readonly resumen$ = inject(DashboardService).obtenerResumen().pipe(
    // Un error no se reemplaza por ceros ni por datos ficticios: se informa en el HTML.
    catchError(() => {
      this.errorCarga = true;
      return EMPTY;
    }),
    finalize(() => { this.cargando = false; }),
  );

  // Importamos solo los iconos que utiliza esta pantalla.
  readonly iconoPacientes = peopleOutline;
  readonly iconoSesiones = calendarOutline;
  readonly iconoCobros = cardOutline;
  readonly iconoHorarios = timeOutline;
}
