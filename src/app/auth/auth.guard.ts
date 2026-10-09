import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// El guard cuida la navegación. La autorización real de datos ocurre en Express.
export const authGuard: CanActivateFn = () =>
  inject(AuthService).obtenerToken() ? true : inject(Router).createUrlTree(['/login']);

export const accesoGuard: CanActivateFn = () =>
  inject(AuthService).obtenerToken() ? inject(Router).createUrlTree(['/inicio']) : true;
