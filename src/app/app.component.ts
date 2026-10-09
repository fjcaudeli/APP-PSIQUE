import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IonApp } from '@ionic/angular';

// Angular destruye el contenedor privado y su caché de Ionic al ir a Login.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {}
