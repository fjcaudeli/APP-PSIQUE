import { readFileSync } from 'node:fs';
import { createSecureContext } from 'node:tls';

export class ErrorConfiguracionPostgres extends Error {}

// La URL no puede sobreescribir la política TLS ni el destino comprobado después.
// Esta misma función se usa en Express y en las herramientas de migraciones.
export function opcionesTlsPostgres(connectionString: string, entorno: NodeJS.ProcessEnv = process.env) {
  const url = new URL(connectionString);
  if (url.search) throw new ErrorConfiguracionPostgres('La URL PostgreSQL no admite parámetros; configurá TLS mediante sus variables específicas.');
  const ambiente = entorno['NODE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(ambiente)) throw new ErrorConfiguracionPostgres('NODE_ENV debe ser development, test o production.');
  const produccion = ambiente === 'production';
  const modo = entorno['DATABASE_SSL_MODE'] ?? (produccion ? 'verify-full' : 'disable');
  if (!['disable', 'verify-full'].includes(modo) || (produccion && modo !== 'verify-full')) {
    throw new ErrorConfiguracionPostgres('DATABASE_SSL_MODE debe ser verify-full en producción; disable se permite solo localmente.');
  }
  const archivoCa = entorno['DATABASE_SSL_CA_FILE'];
  if (modo === 'disable') {
    if (archivoCa) throw new ErrorConfiguracionPostgres('DATABASE_SSL_CA_FILE requiere DATABASE_SSL_MODE=verify-full.');
    return false;
  }
  let ca: string | undefined;
  if (archivoCa) {
    try { ca = readFileSync(archivoCa, 'utf8'); createSecureContext({ ca }); }
    catch { throw new ErrorConfiguracionPostgres('No se pudo leer o validar el certificado CA configurado.'); }
  }
  return { rejectUnauthorized: true as const, minVersion: 'TLSv1.2' as const, ...(ca ? { ca } : {}) };
}
