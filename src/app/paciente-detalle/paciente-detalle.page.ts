import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonContent, IonIcon } from '@ionic/angular';
import { arrowBackOutline, documentTextOutline } from 'ionicons/icons';
import { switchMap } from 'rxjs';
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

  // paramMap permite leer :codigo desde la URL, incluso si cambia durante la navegación.
  // switchMap solicita al servicio el paciente de ese código y conserva la consulta más reciente.
  // AsyncPipe gestiona la suscripción y la libera cuando se destruye la pantalla.
  readonly paciente$ = this.route.paramMap.pipe(
    switchMap((parametros) => this.pacientesService.obtenerPacientePorCodigo(parametros.get('codigo') ?? '')),
  );

  readonly iconoVolver = arrowBackOutline;
  readonly iconoPostIt = documentTextOutline;
}
