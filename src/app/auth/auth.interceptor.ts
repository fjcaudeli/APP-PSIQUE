import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, EMPTY, filter, throwError } from 'rxjs';
import { API_BASE_URL } from '../api.config';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (solicitud, siguiente) => {
  const destino = new URL(solicitud.url, window.location.origin);
  const api = new URL(API_BASE_URL);
  const rutaBase = api.pathname.replace(/\/$/, '');
  const esApi = destino.origin === api.origin && destino.pathname.startsWith(`${rutaBase}/`);
  const esAcceso = [`${rutaBase}/auth/login`, `${rutaBase}/auth/registro`].includes(destino.pathname);

  // El token no se envía a otros servidores ni a Login/Registro.
  if (!esApi || esAcceso) return siguiente(solicitud);
  const auth = inject(AuthService);
  const token = auth.obtenerToken();
  if (!token) return siguiente(solicitud);

  return siguiente(solicitud.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
    // Descarta respuestas de una cuenta que ya cerró sesión.
    filter(() => auth.esTokenActual(token)),
    catchError((error: unknown) => {
      if (!auth.esTokenActual(token)) return EMPTY;
      if (error instanceof HttpErrorResponse && error.status === 401) auth.expirarSesion(token);
      return throwError(() => error);
    }),
  );
};
