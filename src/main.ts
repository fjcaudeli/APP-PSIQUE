import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Este es el punto de entrada: Angular inicia la aplicación
// con la configuración de Ionic y las rutas disponibles.
bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => {
  console.error('No se pudo iniciar PSIQUE.', error);
});
