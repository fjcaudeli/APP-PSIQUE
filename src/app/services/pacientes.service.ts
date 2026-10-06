import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of, throwError } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { NuevoPaciente, Paciente } from '../models/paciente';
import { ReservaSesion, Sesion } from '../models/sesion';

// Angular proporciona una instancia compartida del servicio a las pantallas.
// Centralizar el acceso permite cambiar la fuente de datos dentro de esta clase.
@Injectable({ providedIn: 'root' })
export class PacientesService {
  private readonly http = inject(HttpClient);

  obtenerPacientes(): Observable<Paciente[]> {
    // HttpClient entrega el JSON de la API al Observable que ya consume la pantalla.
    return this.http.get<Paciente[]>(`${API_BASE_URL}/pacientes`);
  }

  siguienteCodigo(): Observable<{ codigo: string }> {
    return this.http.get<{ codigo: string }>(`${API_BASE_URL}/pacientes/siguiente-codigo`);
  }

  crearPaciente(paciente: NuevoPaciente, turno?: ReservaSesion): Observable<{ paciente: Paciente; sesion: Sesion | null }> {
    return this.http.post<{ paciente: Paciente; sesion: Sesion | null }>(
      `${API_BASE_URL}/pacientes`,
      turno ? { paciente, turno } : { paciente },
    );
  }

  obtenerPacientePorCodigo(codigo: string): Observable<Paciente | undefined> {
    return this.http.get<Paciente>(`${API_BASE_URL}/pacientes/${encodeURIComponent(codigo)}`).pipe(
      catchError((error: HttpErrorResponse) => {
        // Solo el 404 representa un paciente inexistente. Conservamos el undefined
        // que entiende la ficha; una falla de conexión debe mostrarse como un error.
        if (error.status === 404) {
          return of(undefined);
        }
        return throwError(() => error);
      }),
    );
  }

  actualizarPaciente(codigoOriginal: string, paciente: Paciente): Observable<Paciente> {
    // La URL identifica la ficha existente; el cuerpo puede incluir un código nuevo.
    // El backend valida y guarda el paciente junto con las referencias de sus turnos.
    return this.http.put<Paciente>(
      `${API_BASE_URL}/pacientes/${encodeURIComponent(codigoOriginal)}`,
      paciente,
    );
  }
}
