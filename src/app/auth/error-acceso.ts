import { HttpErrorResponse } from '@angular/common/http';

export function mensajeErrorAcceso(error: unknown, alternativa: string): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'No se pudo conectar con el servidor. Volvé a intentar.';
    if ([400, 401, 409].includes(error.status) && typeof error.error?.mensaje === 'string') return error.error.mensaje;
  }
  return alternativa;
}
