import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { crearAppPostgres } from './app-postgres.ts';
import { validarSecretoJwt } from './auth.ts';
import { abrirPoolPostgres, ErrorConfiguracionPostgres, ErrorPostgresNoDisponible } from './db/postgres.ts';
import { configuracionServidor } from './configuracion.ts';

interface OpcionesServidor {
  entorno?: NodeJS.ProcessEnv;
  // Solo las pruebas importan esta función con pruebas:true. La entrada normal
  // no lee ninguna variable ni argumento que permita seleccionar psique_test.
  pruebas?: boolean;
}

export async function iniciarServidorPostgres({ entorno = process.env, pruebas = false }: OpcionesServidor = {}) {
  let secretoJwt: string;
  try { secretoJwt = validarSecretoJwt(entorno['JWT_SECRET']); }
  catch { throw new ErrorConfiguracionPostgres('Configurá JWT_SECRET con un secreto aleatorio de al menos 32 bytes antes de iniciar la API.'); }
  const configuracion = configuracionServidor(entorno);

  // El pool comprueba destino, rol y las cuatro tablas antes de montar Express.
  // No hay apertura de SQLite, migraciones automáticas ni cuentas precargadas.
  const pool = await abrirPoolPostgres({ entorno, pruebas });
  try {
    let cerrando = false;
    const app = crearAppPostgres(pool, configuracion.origen, () => new Date(), secretoJwt, { ...configuracion, cerrando: () => cerrando });
    const servidor = app.listen(configuracion.puerto, configuracion.host);
    await once(servidor, 'listening');
    let cierre: Promise<void> | undefined;
    function detener(): Promise<void> {
      cierre ??= (async () => {
        cerrando = true;
        // Dejamos terminar las solicitudes antes de cerrar sus conexiones SQL.
        const limite = setTimeout(() => servidor.closeAllConnections(), 10000);
        limite.unref();
        try {
          await new Promise<void>((resolver, rechazar) => servidor.close(error => error ? rechazar(error) : resolver()));
        } finally { clearTimeout(limite); await pool.end(); }
      })();
      return cierre;
    }
    return { servidor, pool, detener };
  } catch (error) {
    await pool.end();
    throw error;
  }
}

// Importar el módulo permite probar el mismo ciclo de vida sin abrir otro servidor
// permanente. npm run dev/start ejecutan esta entrada siempre en psique/psique_app.
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  let instancia: Awaited<ReturnType<typeof iniciarServidorPostgres>> | undefined;
  let interrumpido = false;
  async function detener(): Promise<void> {
    interrumpido = true;
    try { await instancia?.detener(); }
    catch { console.error('No se pudo completar el cierre de la API de PSIQUE.'); process.exitCode = 1; }
  }
  process.once('SIGINT', detener);
  process.once('SIGTERM', detener);
  try {
    instancia = await iniciarServidorPostgres();
    if (interrumpido) await instancia.detener();
    else console.log('API de PSIQUE iniciada correctamente con PostgreSQL.');
  } catch (error) {
    // Solo mensajes propios o fijos: nunca el error original, URL o contraseña.
    const detalle = error instanceof ErrorConfiguracionPostgres ? error.message
      : error instanceof ErrorPostgresNoDisponible ? 'PostgreSQL no está disponible. Revisá el servicio y la conexión.'
      : (error as NodeJS.ErrnoException)?.code === 'EADDRINUSE' ? 'El puerto HTTP está ocupado.'
      : 'Revisá configuración, permisos, esquema y puerto.';
    console.error(`No se pudo iniciar la API de PSIQUE. ${detalle}`);
    process.exitCode = 1;
    process.removeListener('SIGINT', detener);
    process.removeListener('SIGTERM', detener);
  }
}
