import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { API_BASE_URL } from '../api.config';
import { DisponibilidadSemanal, EdicionSesion, HistorialSemanal, HorarioConsultado, HorarioDisponible, ReservaSesion, Sesion } from '../models/sesion';

@Injectable({ providedIn: 'root' })
export class SesionesService {
  private readonly http = inject(HttpClient);

  historial(fecha?: string) {
    return this.http.get<HistorialSemanal>(`${API_BASE_URL}/sesiones/semana`, { params: fecha ? { fecha } : {} });
  }
  pendientes() { return this.http.get<Sesion[]>(`${API_BASE_URL}/sesiones/pendientes`); }
  obtener(id: number) { return this.http.get<Sesion>(`${API_BASE_URL}/sesiones/${id}`); }
  disponibles(fecha?: string) {
    return this.http.get<DisponibilidadSemanal>(`${API_BASE_URL}/horarios/disponibles`, { params: fecha ? { fecha } : {} });
  }
  horario(fecha: string, horario: string) {
    return this.http.get<HorarioConsultado>(`${API_BASE_URL}/horarios/${encodeURIComponent(fecha)}/${encodeURIComponent(horario)}`);
  }
  crearHorario(fecha: string, horario: string) {
    return this.http.post<HorarioDisponible>(`${API_BASE_URL}/horarios`, { fecha, horario });
  }
  agendar(reserva: ReservaSesion & { codigoPaciente: string }) {
    return this.http.post<Sesion>(`${API_BASE_URL}/sesiones`, reserva);
  }
  actualizar(id: number, datos: EdicionSesion) {
    return this.http.put<Sesion>(`${API_BASE_URL}/sesiones/${id}`, datos);
  }
  realizar(id: number) {
    return this.http.post<Sesion>(`${API_BASE_URL}/sesiones/${id}/realizar`, {});
  }
}
