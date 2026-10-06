import { provideHttpClient } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';

registerLocaleData(localeEsAr);

// Reunimos aquí la configuración de Angular e Ionic.
// La estrategia de Ionic administra las pantallas dentro de ion-router-outlet.
export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-AR' },
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Habilita las consultas HTTP que realizan los servicios de datos.
    provideHttpClient(),
    provideIonicAngular({ mode: 'md' }),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideRouter(routes),
  ],
};
