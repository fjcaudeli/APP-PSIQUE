import { environment } from '../environments/environment';
import { validarUrlApi } from '../environments/configuracion-api';

// Servicios e interceptor comparten el destino validado del entorno seleccionado.
export const API_BASE_URL = validarUrlApi(environment.apiBaseUrl, environment.production);
