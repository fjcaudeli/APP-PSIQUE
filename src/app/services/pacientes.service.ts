import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of, throwError } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { Paciente } from '../models/paciente';

// Angular proporciona una instancia compartida del servicio a las pantallas.
// Centralizar el acceso permite cambiar la fuente de datos dentro de esta clase.
@Injectable({ providedIn: 'root' })
export class PacientesService {
  private readonly http = inject(HttpClient);

  obtenerPacientes(): Observable<Paciente[]> {
    // HttpClient entrega el JSON de la API al Observable que ya consume la pantalla.
    return this.http.get<Paciente[]>(`${API_BASE_URL}/pacientes`);
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
}
