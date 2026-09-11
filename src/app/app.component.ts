import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonApp, IonFooter, IonIcon, IonRouterLinkWithHref, IonRouterOutlet } from '@ionic/angular';
import { calendarOutline, homeOutline, peopleOutline } from 'ionicons/icons';

// IonApp organiza la aplicación y el outlet muestra la pantalla de la ruta actual.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonFooter, IonIcon, IonRouterLinkWithHref, IonRouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly iconoInicio = homeOutline;
  readonly iconoPacientes = peopleOutline;
  readonly iconoAgenda = calendarOutline;
}
