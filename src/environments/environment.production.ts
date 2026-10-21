// Angular reemplaza esta constante al compilar, a partir de una URL pública.
// No hay URL remota predeterminada ni retorno a la API de desarrollo.
declare const PSIQUE_API_URL: string;
export const environment = { production: true, apiBaseUrl: typeof PSIQUE_API_URL === 'undefined' ? '' : PSIQUE_API_URL };
