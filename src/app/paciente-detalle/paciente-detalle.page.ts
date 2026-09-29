import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonContent, IonIcon } from '@ionic/angular';
import { arrowBackOutline, documentTextOutline } from 'ionicons/icons';
import { catchError, EMPTY, finalize, switchMap } from 'rxjs';
import { PacientesService } from '../services/pacientes.service';

@Component({
  selector: 'app-paciente-detalle',
  standalone: true,
  imports: [AsyncPipe, DatePipe, IonBackButton, IonContent, IonIcon],
  templateUrl: './paciente-detalle.page.html',
  styleUrl: './paciente-detalle.page.scss',
})
export class PacienteDetallePage {
  private readonly route = inject(ActivatedRoute);
  private readonly pacientesService = inject(PacientesService);

  cargando = true;
  errorCarga = false;

  // paramMap permite leer :codigo desde la URL, incluso si cambia durante la navegación.
  // switchMap solicita al servicio el paciente de ese código y conserva la consulta más reciente.
  // AsyncPipe gestiona la suscripción y la libera cuando se destruye la pantalla.
  readonly paciente$ = this.route.paramMap.pipe(
    switchMap((parametros) => {
      // Cada código inicia una nueva consulta. Mientras carga no mostramos
      // "Paciente no encontrado" ni los datos de una consulta anterior.
      this.cargando = true;
      this.errorCarga = false;
      return this.pacientesService.obtenerPacientePorCodigo(parametros.get('codigo') ?? '').pipe(
        catchError(() => {
          this.errorCarga = true;
          return EMPTY;
        }),
        finalize(() => { this.cargando = false; }),
      );
    }),
  );

  readonly iconoVolver = arrowBackOutline;
  readonly iconoPostIt = documentTextOutline;
}
