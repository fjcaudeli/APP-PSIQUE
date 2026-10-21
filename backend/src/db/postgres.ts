import { Pool } from 'pg';
import { ErrorConfiguracionPostgres, opcionesTlsPostgres } from './seguridad-postgres.ts';

export { ErrorConfiguracionPostgres } from './seguridad-postgres.ts';
export class ErrorPostgresNoDisponible extends Error {
  constructor(mensaje = 'El servicio de autenticación no está disponible. Intentá nuevamente.') {
    super(mensaje);
  }
}

interface OpcionesPool {
  pruebas?: boolean;
  entorno?: NodeJS.ProcessEnv;
  maximoConexiones?: number;
  esperaConexionMs?: number;
}

const CODIGOS_DISPONIBILIDAD = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EPIPE',
  '57P01', '57P02', '57P03', '53300', '53400', '57014',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID',
]);
const MENSAJES_TRANSPORTE = new Set([
  'timeout exceeded when trying to connect', 'Connection terminated unexpectedly',
  'Connection terminated', 'Connection terminated due to connection timeout', 'Query read timeout',
  'Client has encountered a connection error and is not queryable',
]);

export function esErrorDisponibilidadPostgres(error: unknown, pool?: Pool): boolean {
  if (pool?.ending || pool?.ended) return true;
  if (!(error instanceof Error)) return false;
  const codigo = 'code' in error && typeof error.code === 'string' ? error.code : '';
  // PostgreSQL expone SQLSTATE; algunos errores de transporte de pg solo tienen mensaje.
  return codigo.startsWith('08') || codigo.startsWith('ERR_TLS_') || codigo.startsWith('ERR_SSL_')
    || CODIGOS_DISPONIBILIDAD.has(codigo) || MENSAJES_TRANSPORTE.has(error.message);
}

function configuracion({ pruebas = false, entorno = process.env }: OpcionesPool) {
  const variable = pruebas ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
  const base = pruebas ? 'psique_test' : 'psique';
  const rol = pruebas ? 'psique_test' : 'psique_app';
  if (pruebas && (entorno['DATABASE_URL'] || entorno['MIGRATION_DATABASE_URL'] || entorno['APP_DATABASE_URL'])) {
    throw new ErrorConfiguracionPostgres('Las pruebas solo pueden recibir TEST_DATABASE_URL, sin credenciales de desarrollo.');
  }
  const connectionString = entorno[variable];
  if (!connectionString) throw new ErrorConfiguracionPostgres(`Falta ${variable}; configurala fuera del repositorio.`);
  try {
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
        || decodeURIComponent(url.pathname.slice(1)) !== base
        || decodeURIComponent(url.username) !== rol || !url.password
        || [...url.searchParams.keys()].some(k => ['user', 'password', 'database', 'dbname', 'host', 'port'].includes(k))) {
      throw new Error();
    }
  } catch {
    throw new ErrorConfiguracionPostgres(`${variable} debe seleccionar la base ${base} y el rol ${rol}.`);
  }
  return { connectionString, base, rol, ssl: opcionesTlsPostgres(connectionString, entorno) };
}

// Se llama una sola vez antes de montar un servidor PostgreSQL; nunca por solicitud.
// El servidor habitual usa psique_app; solo pruebas explícitas usan psique_test.
export async function abrirPoolPostgres(opciones: OpcionesPool = {}): Promise<Pool> {
  const destino = configuracion(opciones);
  const max = opciones.maximoConexiones ?? 5;
  const espera = opciones.esperaConexionMs ?? 5000;
  if (!Number.isInteger(max) || max < 1 || max > 20 || !Number.isInteger(espera) || espera < 1 || espera > 30000) {
    throw new ErrorConfiguracionPostgres('Límite del pool o espera de conexión inválidos.');
  }
  const pool = new Pool({ connectionString: destino.connectionString, ssl: destino.ssl, max,
    connectionTimeoutMillis: espera, idleTimeoutMillis: 30000,
    query_timeout: 10000, statement_timeout: 10000, application_name: 'psique-api',
  });
  // pg retira la conexión inactiva que falló. El listener evita errores sin manejar
  // y registra solo un mensaje fijo, sin el error original ni sus credenciales.
  pool.on('error', () => { console.error('Se interrumpió una conexión PostgreSQL inactiva.'); });
  try {
    const { rows: [actual] } = await pool.query(`SELECT current_database() AS base, current_user AS rol,
      r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls
      FROM pg_roles r WHERE r.rolname = current_user`);
    if (!actual || actual.base !== destino.base || actual.rol !== destino.rol
        || actual.rolsuper || actual.rolcreatedb || actual.rolcreaterole || actual.rolreplication || actual.rolbypassrls) {
      throw new ErrorConfiguracionPostgres('El servidor respondió con otra base, otro rol o privilegios administrativos.');
    }
    // LIMIT 0 valida acceso y todas las columnas esperadas, sin leer datos ni
    // crear/modificar tablas. El historial de migraciones sigue siendo privado.
    await pool.query('SELECT id, email, "passwordHash", "fechaCreacion" FROM public.usuarios LIMIT 0');
    await pool.query(`SELECT "usuarioId", codigo, modalidad, estado, "proximaSesion", frecuencia, "diaHabitual",
      "horarioHabitual", "fechaCreacion", "fechaInicioTratamiento", "motivoConsulta", "postIt" FROM public.pacientes LIMIT 0`);
    await pool.query('SELECT "usuarioId", fecha, horario, "codigoPaciente", modalidad, estado FROM public.turnos LIMIT 0');
    await pool.query(`SELECT id, "usuarioId", fecha, horario, "codigoPaciente", modalidad, estado,
      "importeCentavos", "pagadoCentavos", resumen FROM public.sesiones LIMIT 0`);
    return pool;
  } catch (error) {
    // Un inicio fallido tampoco deja sockets ni temporizadores abiertos.
    const noDisponible = esErrorDisponibilidadPostgres(error, pool);
    await pool.end();
    if (error instanceof ErrorConfiguracionPostgres) throw error;
    if (noDisponible) throw new ErrorPostgresNoDisponible();
    throw new ErrorConfiguracionPostgres('No se pudo comprobar PostgreSQL. Revisá credenciales, permisos y migraciones.');
  }
}
