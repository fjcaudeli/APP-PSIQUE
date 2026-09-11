import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonIcon, IonRouterLinkWithHref } from '@ionic/angular';
import { arrowBackOutline, personOutline } from 'ionicons/icons';
import { PacientesService } from '../services/pacientes.service';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [AsyncPipe, DatePipe, IonBackButton, IonContent, IonIcon, IonRouterLinkWithHref, RouterLink],
  templateUrl: './pacientes.page.html',
  styleUrl: './pacientes.page.scss',
})
export class PacientesPage {
  private readonly pacientesService = inject(PacientesService);

  // El componente pide los datos al servicio sin conocer su fuente.
  // El sufijo $ identifica un Observable; AsyncPipe recibe sus valores en el HTML.
  readonly pacientes$ = this.pacientesService.obtenerPacientes();

  readonly iconoPaciente = personOutline;
  readonly iconoVolver = arrowBackOutline;
}
