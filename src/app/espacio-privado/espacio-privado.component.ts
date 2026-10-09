import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonFooter, IonIcon, IonRouterLinkWithHref, IonRouterOutlet } from '@ionic/angular';
import { calendarOutline, homeOutline, peopleOutline } from 'ionicons/icons';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-espacio-privado',
  standalone: true,
  imports: [IonFooter, IonIcon, IonRouterLinkWithHref, IonRouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './espacio-privado.component.html',
  styleUrl: './espacio-privado.component.scss',
})
export class EspacioPrivadoComponent {
  readonly auth = inject(AuthService);
  readonly iconoInicio = homeOutline;
  readonly iconoPacientes = peopleOutline;
  readonly iconoAgenda = calendarOutline;
}
