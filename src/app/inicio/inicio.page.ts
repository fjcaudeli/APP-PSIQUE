import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonRouterLink } from '@ionic/angular';
import {
  arrowForwardOutline,
  calendarOutline,
  cardOutline,
  peopleOutline,
  timeOutline,
} from 'ionicons/icons';
import { DashboardService } from '../services/dashboard.service';

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [AsyncPipe, IonButton, IonContent, IonIcon, IonRouterLink, RouterLink],
  templateUrl: './inicio.page.html',
  styleUrl: './inicio.page.scss',
})
export class InicioPage {
  // El servicio entrega el resumen como Observable. AsyncPipe recibe su valor
  // en el HTML, de modo que Inicio solo se ocupa de presentar los indicadores.
  readonly resumen$ = inject(DashboardService).obtenerResumen();

  // Importamos solo los iconos que utiliza esta pantalla.
  readonly iconoPacientes = peopleOutline;
  readonly iconoSesiones = calendarOutline;
  readonly iconoCobros = cardOutline;
  readonly iconoHorarios = timeOutline;
  readonly iconoAvanzar = arrowForwardOutline;
}
