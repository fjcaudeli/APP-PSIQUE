import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { SemanaAgenda } from '../models/turno';

// La API entrega la misma estructura de semana que ya utiliza Agenda.
// Seleccionar un día sigue siendo responsabilidad de la pantalla.
@Injectable({ providedIn: 'root' })
export class AgendaService {
  private readonly http = inject(HttpClient);

  obtenerSemana(fecha?: string): Observable<SemanaAgenda> {
    return this.http.get<SemanaAgenda>(`${API_BASE_URL}/agenda`, { params: fecha ? { fecha } : {} });
  }
}
