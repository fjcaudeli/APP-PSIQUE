import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SEMANA_AGENDA_MOCK } from '../data/agenda.mock';
import { SemanaAgenda } from '../models/turno';

// La pantalla conoce el servicio, pero no importa los mocks directamente.
// Este método concentra el lugar donde se podrá conectar una futura consulta a la API.
@Injectable({ providedIn: 'root' })
export class AgendaService {
  obtenerSemana(): Observable<SemanaAgenda> {
    // of emite la semana completa y finaliza; no hace una llamada HTTP.
    return of(SEMANA_AGENDA_MOCK);
  }
}
