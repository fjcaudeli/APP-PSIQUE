import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { abrirConexion, configuracionPostgres, ErrorHerramienta, mensajeSeguro } from './postgres-config.mjs';

export const DIRECTORIO_MIGRACIONES = fileURLToPath(new URL('../migrations/', import.meta.url));

export async function leerMigraciones(directorio = DIRECTORIO_MIGRACIONES) {
  const archivos = (await readdir(directorio)).filter(nombre => nombre.endsWith('.sql'));
  const migraciones = [];
  for (const archivo of archivos) {
    const coincidencia = archivo.match(/^(\d{3,})_[a-z0-9_]+\.sql$/);
    const version = coincidencia ? Number(coincidencia[1]) : 0;
    if (!Number.isSafeInteger(version) || version < 1 || version > 2147483647) {
      throw new ErrorHerramienta('Cada migración debe tener una versión positiva y un nombre como 001_esquema_inicial.sql.');
    }
    // Normalizamos CRLF para que Windows y Linux calculen el mismo checksum.
    const sql = (await readFile(join(directorio, archivo), 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (!sql.trim()) throw new ErrorHerramienta(`La migración ${archivo} está vacía.`);
    migraciones.push({ version, archivo, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  migraciones.sort((a, b) => a.version - b.version);
  if (new Set(migraciones.map(m => m.version)).size !== migraciones.length) {
    throw new ErrorHerramienta('Hay dos archivos con la misma versión de migración.');
  }
  if (!migraciones.length) throw new ErrorHerramienta('No hay migraciones SQL para comprobar.');
  return migraciones;
}

function comprobarHistorial(migraciones, historial) {
  for (const aplicada of historial) {
    const archivo = migraciones.find(m => m.version === aplicada.version);
    if (!archivo || archivo.archivo !== aplicada.archivo || archivo.checksum !== aplicada.checksum) {
      throw new ErrorHerramienta(`La migración aplicada ${aplicada.version} falta o fue modificada. Restaurá el archivo original y creá otra versión.`);
    }
  }
  const ultima = Math.max(0, ...historial.map(m => m.version));
  if (migraciones.some(m => m.version < ultima && !historial.some(h => h.version === m.version))) {
    throw new ErrorHerramienta('Hay una migración pendiente anterior a la última aplicada; no se alteró el esquema.');
  }
}

export async function ejecutarMigraciones({ pruebas = false, soloEstado = false, directorio = DIRECTORIO_MIGRACIONES } = {}) {
  const configuracion = configuracionPostgres(pruebas ? 'pruebas' : 'migraciones');
  const migraciones = await leerMigraciones(directorio);
  const cliente = await abrirConexion(configuracion);
  let bloqueo = false;
  try {
    // Un único migrador por base; el bloqueo se libera también al cerrar la conexión.
    await cliente.query('SELECT pg_advisory_lock(180613, 2)');
    bloqueo = true;
    let existe = (await cliente.query("SELECT to_regclass('public.migraciones') IS NOT NULL AS existe")).rows[0].existe;
    if (!existe && !soloEstado) {
      await cliente.query('BEGIN');
      try {
        await cliente.query(`CREATE TABLE public.migraciones (
          version INTEGER PRIMARY KEY CHECK (version > 0),
          archivo TEXT NOT NULL UNIQUE,
          checksum TEXT NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
          "aplicadaEn" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
        await cliente.query('REVOKE ALL ON TABLE public.migraciones FROM PUBLIC');
        if (!pruebas) await cliente.query('REVOKE ALL ON TABLE public.migraciones FROM psique_app');
        await cliente.query('COMMIT');
        existe = true;
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
      }
    }
    const historial = existe
      ? (await cliente.query('SELECT version, archivo, checksum, "aplicadaEn" FROM public.migraciones ORDER BY version')).rows : [];
    comprobarHistorial(migraciones, historial);
    const pendientes = migraciones.filter(m => !historial.some(h => h.version === m.version));
    const aplicadas = [];
    if (!soloEstado) {
      for (const migracion of pendientes) {
        await cliente.query('BEGIN');
        try {
          await cliente.query(migracion.sql);
          await cliente.query('INSERT INTO public.migraciones (version, archivo, checksum) VALUES ($1, $2, $3)',
            [migracion.version, migracion.archivo, migracion.checksum]);
          await cliente.query('COMMIT');
          aplicadas.push(migracion.archivo);
        } catch (error) {
          await cliente.query('ROLLBACK');
          const fallo = new ErrorHerramienta(`Falló ${migracion.archivo}; sus cambios y su registro se revirtieron. ${mensajeSeguro(error)}`);
          fallo.code = error.code;
          throw fallo;
        }
      }
    }
    return { base: configuracion.base, rol: configuracion.rol, aplicadas,
      pendientes: soloEstado ? pendientes.map(m => m.archivo) : [],
      historial: [...historial.map(h => h.archivo), ...aplicadas] };
  } finally {
    if (bloqueo) await cliente.query('SELECT pg_advisory_unlock(180613, 2)').catch(() => {});
    await cliente.end();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const argumentos = process.argv.slice(2);
    if (argumentos.some(a => !['--test', '--status'].includes(a))) {
      throw new ErrorHerramienta('Opciones admitidas: --test y --status.');
    }
    const resultado = await ejecutarMigraciones({ pruebas: argumentos.includes('--test'), soloEstado: argumentos.includes('--status') });
    console.log(`Base ${resultado.base}; rol ${resultado.rol}.`);
    console.log(`Aplicadas: ${resultado.historial.join(', ') || 'ninguna'}.`);
    console.log(`Pendientes: ${resultado.pendientes.join(', ') || 'ninguna'}. Nuevas en esta ejecución: ${resultado.aplicadas.length}.`);
  } catch (error) {
    console.error(mensajeSeguro(error));
    process.exitCode = 1;
  }
}
