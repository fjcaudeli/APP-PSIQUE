import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBackButton, IonContent, IonIcon, IonRouterLinkWithHref } from '@ionic/angular';
import { addOutline, arrowBackOutline, personOutline } from 'ionicons/icons';
import { catchError, defer, EMPTY, finalize, map, Observable } from 'rxjs';
import { Paciente } from '../models/paciente';
import { PacientesService } from '../services/pacientes.service';

@Component({
  selector: 'app-pacientes',
  standalone: true,
  imports: [AsyncPipe, DatePipe, IonBackButton, IonContent, IonIcon, IonRouterLinkWithHref, RouterLink],
  templateUrl: './pacientes.page.html',
  styleUrl: './pacientes.page.scss',
})
export class PacientesPage {
  private readonly pacientesService = inject(PacientesService);
  private readonly route = inject(ActivatedRoute);
  get noActivos(): boolean { return this.route.snapshot.data['noActivos'] === true; }

  cargando = true;
  errorCarga = false;

  pacientes$?: Observable<Paciente[]>;

  // Ionic conserva pantallas visitadas. Consultamos al volver para mostrar también
  // los cambios de código y demás datos guardados desde una ficha.
  ionViewWillEnter(): void {
    this.pacientes$ = defer(() => {
      this.cargando = true;
      this.errorCarga = false;
      return this.pacientesService.obtenerPacientes().pipe(
        map(pacientes => pacientes.filter(p => (p.estado.toLowerCase() !== 'activo') === this.noActivos)),
        catchError(() => {
          this.errorCarga = true;
          return EMPTY;
        }),
        finalize(() => { this.cargando = false; }),
      );
    });
  }

  readonly iconoPaciente = personOutline;
  readonly iconoCrear = addOutline;
  readonly iconoVolver = arrowBackOutline;
}
