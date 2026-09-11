import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { AgendaService } from '../services/agenda.service';

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [AsyncPipe, DatePipe, IonContent],
  templateUrl: './agenda.page.html',
  styleUrl: './agenda.page.scss',
})
export class AgendaPage {
  private readonly agendaService = inject(AgendaService);

  // El servicio entrega la semana; AsyncPipe recibe el resultado en la plantilla.
  // La pantalla no depende de dónde se guardan los datos.
  readonly semana$ = this.agendaService.obtenerSemana();

  // El índice identifica el día visible; al abrir Agenda mostramos el primero.
  indiceDiaSeleccionado = 0;

  seleccionarDia(indice: number): void {
    // Cambiar la selección actualiza la lista sin modificar los turnos de la semana.
    this.indiceDiaSeleccionado = indice;
  }
}
