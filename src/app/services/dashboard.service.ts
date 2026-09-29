import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { ResumenDashboard } from '../models/dashboard';

// Inicio mantiene su contrato: recibe los cuatro indicadores como Observable.
// La API los lee de SQLite; todavía no se calculan a partir de otros registros.
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  obtenerResumen(): Observable<ResumenDashboard> {
    return this.http.get<ResumenDashboard>(`${API_BASE_URL}/dashboard`);
  }
}
