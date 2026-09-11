import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { PACIENTES_MOCK } from '../data/pacientes.mock';
import { Paciente } from '../models/paciente';

// Angular proporciona una instancia compartida del servicio a las pantallas.
// Centralizar el acceso permite cambiar la fuente de datos dentro de esta clase.
@Injectable({ providedIn: 'root' })
export class PacientesService {
  obtenerPacientes(): Observable<Paciente[]> {
    // of entrega el arreglo mediante un Observable y finaliza, sin hacer una petición HTTP.
    return of(PACIENTES_MOCK);
  }

  obtenerPacientePorCodigo(codigo: string): Observable<Paciente | undefined> {
    // Buscamos por el mismo código que aparece en la URL de la ficha.
    // Si no existe, devolvemos undefined para que la pantalla pueda informarlo.
    return of(PACIENTES_MOCK.find((paciente) => paciente.codigo === codigo));
  }
}
