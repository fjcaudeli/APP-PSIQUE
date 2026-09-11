import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { RESUMEN_DASHBOARD_MOCK } from '../data/dashboard.mock';
import { ResumenDashboard } from '../models/dashboard';

// Inicio solicita el resumen al servicio sin conocer su origen.
// Aquí se podrá reemplazar el mock por una consulta a la API en una etapa futura.
@Injectable({ providedIn: 'root' })
export class DashboardService {
  obtenerResumen(): Observable<ResumenDashboard> {
    // of entrega los cuatro números de ejemplo y finaliza; no hace una llamada HTTP.
    return of(RESUMEN_DASHBOARD_MOCK);
  }
}
