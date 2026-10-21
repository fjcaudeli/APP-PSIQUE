import pg from 'pg';
import { opcionesTlsPostgres, ErrorConfiguracionPostgres } from '../src/db/seguridad-postgres.ts';

export class ErrorHerramienta extends Error {}

// Las herramientas reciben secretos del entorno; nunca los imprimen ni los persisten.
export function configuracionPostgres(tipo, entorno = process.env) {
  const destinos = {
    migraciones: ['MIGRATION_DATABASE_URL', 'psique', 'psique_migrador'],
    pruebas: ['TEST_DATABASE_URL', 'psique_test', 'psique_test'],
    aplicacion: ['APP_DATABASE_URL', 'psique', 'psique_app'],
  };
  const destino = destinos[tipo];
  if (!destino) throw new ErrorHerramienta('Tipo de conexión desconocido.');
  const [variable, base, rol] = destino;
  const connectionString = entorno[variable];
  if (!connectionString) throw new ErrorHerramienta(`Falta ${variable}; configurala fuera del repositorio.`);
  if (tipo === 'pruebas' && (entorno['MIGRATION_DATABASE_URL'] || entorno['APP_DATABASE_URL'] || entorno['DATABASE_URL'])) {
    throw new ErrorHerramienta('Las pruebas deben recibir únicamente TEST_DATABASE_URL, sin credenciales de desarrollo.');
  }
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
        || decodeURIComponent(url.pathname.slice(1)) !== base
        || decodeURIComponent(url.username) !== rol || !url.password
        || [...url.searchParams.keys()].some(k => ['user', 'password', 'database', 'dbname', 'host', 'port'].includes(k))) {
      throw new Error();
    }
  } catch {
    throw new ErrorHerramienta(`${variable} debe seleccionar la base ${base} y el rol ${rol}; no se abrió una conexión.`);
  }
  try { return { connectionString, base, rol, ssl: opcionesTlsPostgres(connectionString, entorno) }; }
  catch (error) {
    if (error instanceof ErrorConfiguracionPostgres) throw new ErrorHerramienta(error.message);
    throw new ErrorHerramienta('Configuración TLS inválida.');
  }
}

export async function abrirConexion(configuracion) {
  const cliente = new pg.Client({
    connectionString: configuracion.connectionString,
    ssl: configuracion.ssl,
    connectionTimeoutMillis: 5000,
    application_name: 'psique-herramientas-esquema',
  });
  try {
    await cliente.connect();
    // Verificamos también lo que respondió el servidor antes de ejecutar cualquier DDL.
    const { rows: [actual] } = await cliente.query(`
      SELECT current_database() AS base, current_user AS rol,
        pg_get_userbyid(d.datdba) AS propietario, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
        r.rolreplication, r.rolbypassrls
      FROM pg_database d JOIN pg_roles r ON r.rolname = current_user
      WHERE d.datname = current_database()
    `);
    if (actual.base !== configuracion.base || actual.rol !== configuracion.rol
        || actual.rolsuper || actual.rolcreatedb || actual.rolcreaterole || actual.rolreplication || actual.rolbypassrls
        || (configuracion.rol !== 'psique_app' && actual.propietario !== configuracion.rol)) {
      throw new ErrorHerramienta('La base, el propietario o los permisos de la conexión no corresponden al destino solicitado.');
    }
    await cliente.query("SET statement_timeout = '15s'");
    await cliente.query("SET lock_timeout = '5s'");
    await cliente.query('SET search_path = pg_catalog, public');
    return cliente;
  } catch (error) {
    await cliente.end().catch(() => {});
    throw error;
  }
}

export function mensajeSeguro(error) {
  if (error instanceof ErrorHerramienta) return error.message;
  const codigo = typeof error?.code === 'string' && /^[A-Z0-9_]{2,30}$/.test(error.code) ? error.code : 'INTERNO';
  return `No se pudo completar la operación PostgreSQL (código ${codigo}). Revisá conexión, permisos y archivos.`;
}
