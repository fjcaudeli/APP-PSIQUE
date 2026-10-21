import { isIP } from 'node:net';
import { ErrorConfiguracionPostgres } from './db/seguridad-postgres.ts';

export function configuracionServidor(entorno: NodeJS.ProcessEnv = process.env) {
  const ambiente = entorno['NODE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(ambiente)) throw new ErrorConfiguracionPostgres('NODE_ENV debe ser development, test o production.');
  const produccion = ambiente === 'production';
  const puerto = Number(entorno['PORT'] ?? (produccion ? NaN : 3000));
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) throw new ErrorConfiguracionPostgres('PORT debe ser un número entero entre 1 y 65535.');
  const host = entorno['HOST'] ?? (produccion ? '0.0.0.0' : '127.0.0.1');
  if (!['127.0.0.1', ...(produccion ? ['0.0.0.0'] : [])].includes(host)) {
    throw new ErrorConfiguracionPostgres('HOST debe ser 127.0.0.1 localmente; 0.0.0.0 se permite solo en producción.');
  }
  const origen = entorno['FRONTEND_ORIGIN'] ?? (produccion ? '' : 'http://127.0.0.1:4200');
  try {
    const url = new URL(origen);
    if (url.origin !== origen || url.username || url.password || (produccion ? url.protocol !== 'https:' : !['http:', 'https:'].includes(url.protocol))) throw new Error();
  } catch { throw new ErrorConfiguracionPostgres('FRONTEND_ORIGIN debe ser un origen exacto, sin ruta; HTTPS es obligatorio en producción.'); }

  // Solo redes/IP explícitas del proxy. Nunca true, cantidad de saltos ni toda Internet.
  // Vacío conserva la IP del socket: detrás de un proxy compartiría el cupo.
  const listaProxies = entorno['TRUSTED_PROXY_CIDRS']?.trim();
  const proxies = listaProxies ? listaProxies.split(',').map(p => p.trim()) : [];
  if (proxies.some(p => {
    const [ip = '', prefijo, extra] = p.split('/');
    const version = isIP(ip);
    return !version || extra !== undefined || (prefijo !== undefined && (!/^\d+$/.test(prefijo) || Number(prefijo) < 1 || Number(prefijo) > (version === 4 ? 32 : 128)));
  })) throw new ErrorConfiguracionPostgres('TRUSTED_PROXY_CIDRS debe contener IP o redes CIDR explícitas y acotadas.');
  return { produccion, puerto, host, origen, proxies };
}
