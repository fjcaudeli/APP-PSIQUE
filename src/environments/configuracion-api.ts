export function validarUrlApi(valor: string | undefined, produccion: boolean): string {
  try {
    if (!valor) throw new Error();
    const url = new URL(valor);
    if (url.username || url.password || url.search || url.hash || !/^\/api\/?$/.test(url.pathname)
        || (produccion ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol))
        || (produccion && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')
          || url.hostname === '[::1]' || url.hostname === '0.0.0.0' || url.hostname.startsWith('127.')))) throw new Error();
    return url.origin + '/api';
  } catch { throw new Error('Configurá PSIQUE_API_URL con la URL HTTPS de la API terminada en /api antes de compilar producción.'); }
}
