import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { abrirConexion, configuracionPostgres, ErrorHerramienta, mensajeSeguro } from './postgres-config.mjs';

const TABLAS = ['usuarios', 'pacientes', 'turnos', 'sesiones'];

function exigir(condicion, mensaje) {
  if (!condicion) throw new ErrorHerramienta(mensaje);
}

async function denegada(cliente, sql) {
  await cliente.query('BEGIN');
  try {
    try {
      await cliente.query(sql);
    } catch (error) {
      exigir(error.code === '42501', 'La operación no se rechazó por falta de permisos.');
      return;
    }
    throw new ErrorHerramienta('La aplicación pudo ejecutar una operación que debe estar prohibida.');
  } finally {
    // Incluso ante permisos incorrectos, ninguna operación de comprobación se confirma.
    await cliente.query('ROLLBACK');
  }
}

export async function verificarDesarrollo() {
  const migrador = await abrirConexion(configuracionPostgres('migraciones'));
  let aplicacion;
  const controles = [];
  try {
    for (const tabla of TABLAS) {
      const { rows: [permisos] } = await migrador.query(`
        SELECT pg_get_userbyid(c.relowner) AS propietario, c.relrowsecurity AS rls,
          has_table_privilege('psique_app', c.oid, 'SELECT') AS leer,
          has_table_privilege('psique_app', c.oid, 'INSERT') AS insertar,
          has_table_privilege('psique_app', c.oid, 'UPDATE') AS actualizar,
          has_table_privilege('psique_app', c.oid, 'DELETE') AS borrar,
          has_table_privilege('psique_app', c.oid, 'TRUNCATE') AS vaciar,
          has_table_privilege('psique_app', c.oid, 'TRIGGER') AS disparadores,
          has_table_privilege('psique_app', c.oid, 'REFERENCES') AS referencias,
          has_table_privilege('psique_app', c.oid, 'MAINTAIN') AS mantenimiento
        FROM pg_class c WHERE c.oid = to_regclass($1)
      `, ['public.' + tabla]);
      exigir(permisos?.propietario === 'psique_migrador' && !permisos.rls
        && permisos.leer && permisos.insertar && permisos.actualizar
        && !permisos.borrar && !permisos.vaciar && !permisos.disparadores
        && !permisos.referencias && !permisos.mantenimiento, `Permisos incorrectos en ${tabla}.`);
      const { rows: [cantidad] } = await migrador.query(`SELECT count(*)::integer AS registros FROM public.${tabla}`);
      controles.push({ tabla, registros: cantidad.registros, permisos: 'SELECT, INSERT, UPDATE' });
    }
    const { rows: [accesos] } = await migrador.query(`SELECT
      has_database_privilege('psique_test', 'psique', 'CONNECT') AS pruebas_en_desarrollo,
      has_database_privilege('psique_app', 'psique_test', 'CONNECT') AS aplicacion_en_pruebas,
      has_database_privilege('psique_app', 'psique', 'CREATE') AS crear_esquemas,
      has_database_privilege('psique_app', 'psique', 'TEMP') AS temporales,
      has_schema_privilege('psique_app', 'public', 'CREATE') AS crear_objetos,
      has_table_privilege('psique_app', 'public.migraciones', 'SELECT') AS leer_historial,
      has_table_privilege('psique_app', 'public.migraciones', 'UPDATE') AS alterar_historial`);
    exigir(Object.values(accesos).every(v => v === false), 'Hay accesos excesivos o cruzados entre bases.');
    for (const secuencia of ['usuarios_id_seq', 'sesiones_id_seq']) {
      const { rows: [permisos] } = await migrador.query(`SELECT
        has_sequence_privilege('psique_app', $1, 'USAGE') AS usar,
        has_sequence_privilege('psique_app', $1, 'UPDATE') AS reiniciar`, ['public.' + secuencia]);
      exigir(permisos.usar && !permisos.reiniciar, 'Permisos incorrectos sobre una secuencia.');
    }
    const invalidas = (await migrador.query(`SELECT count(*)::integer AS cantidad FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND NOT convalidated`)).rows[0].cantidad;
    exigir(invalidas === 0, 'Hay restricciones que no fueron validadas.');

    aplicacion = await abrirConexion(configuracionPostgres('aplicacion'));
    for (const tabla of TABLAS) {
      await aplicacion.query(`SELECT * FROM public.${tabla} LIMIT 0`);
      const columnas = (await migrador.query(`SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name <> 'id'
        ORDER BY ordinal_position`, [tabla])).rows.map(c => '"' + c.column_name + '"').join(', ');
      // Comprobamos INSERT y UPDATE sin insertar filas, consumir IDs ni cambiar datos de desarrollo.
      const insertadas = await aplicacion.query(`INSERT INTO public.${tabla} (${columnas}) SELECT ${columnas} FROM public.${tabla} WHERE false`);
      const campo = tabla === 'usuarios' ? 'email' : 'estado';
      const actualizadas = await aplicacion.query(`UPDATE public.${tabla} SET ${campo} = ${campo} WHERE false`);
      exigir(insertadas.rowCount === 0 && actualizadas.rowCount === 0, 'La comprobación no debía modificar filas.');
    }
    await denegada(aplicacion, 'CREATE TABLE public.comprobacion_permiso (id INTEGER)');
    await denegada(aplicacion, 'DROP TABLE public.sesiones');
    await denegada(aplicacion, 'ALTER TABLE public.sesiones DROP CONSTRAINT sesiones_importe_check');
    await denegada(aplicacion, 'DELETE FROM public.usuarios WHERE false');
    return { base: 'psique', controles, restriccionesValidadas: true,
      aplicacionSinDDL: true, basesAisladas: true, datosModificados: 0 };
  } finally {
    if (aplicacion) await aplicacion.end();
    await migrador.end();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const resultado = await verificarDesarrollo();
    console.log(JSON.stringify(resultado, null, 2));
  } catch (error) {
    console.error(mensajeSeguro(error));
    process.exitCode = 1;
  }
}
