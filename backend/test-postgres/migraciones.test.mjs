import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DIRECTORIO_MIGRACIONES, ejecutarMigraciones, leerMigraciones } from '../scripts/migrar.mjs';
import { configuracionPostgres, ErrorHerramienta } from '../scripts/postgres-config.mjs';
import { conexionPruebas } from './fixtures.mjs';

before(async () => { await ejecutarMigraciones({ pruebas: true }); });

async function temporal(prueba, copiarOriginales = false) {
  const directorio = await mkdtemp(join(tmpdir(), 'psique-migraciones-'));
  try {
    if (copiarOriginales) {
      for (const archivo of await readdir(DIRECTORIO_MIGRACIONES)) {
        if (archivo.endsWith('.sql')) await copyFile(join(DIRECTORIO_MIGRACIONES, archivo), join(directorio, archivo));
      }
    }
    return await prueba(directorio);
  } finally {
    // Solo se elimina la carpeta temporal creada por esta prueba, nunca rutas de la base.
    const rutaAbsoluta = resolve(directorio);
    assert.equal(dirname(rutaAbsoluta), resolve(tmpdir()));
    assert.ok(basename(rutaAbsoluta).startsWith('psique-migraciones-'));
    await rm(rutaAbsoluta, { recursive: true, force: true });
  }
}

async function estadoPersistido() {
  const c = await conexionPruebas();
  try {
    return {
      historial: (await c.query('SELECT * FROM public.migraciones ORDER BY version')).rows,
      objetos: (await c.query(`SELECT c.oid, c.relname, c.relkind FROM pg_class c
        WHERE c.relnamespace='public'::regnamespace ORDER BY c.relname`)).rows,
    };
  } finally { await c.end(); }
}

test('las salvaguardas rechazan otra base, otro rol o credenciales de desarrollo en las pruebas', () => {
  for (const entorno of [
    { TEST_DATABASE_URL: 'postgresql://psique_test:ejemplo@localhost/psique' },
    { TEST_DATABASE_URL: 'postgresql://postgres:ejemplo@localhost/psique_test' },
    { TEST_DATABASE_URL: 'postgresql://psique_test:ejemplo@localhost/psique_test', MIGRATION_DATABASE_URL: 'no-se-usa' },
    { TEST_DATABASE_URL: 'postgresql://psique_test:ejemplo@localhost/psique_test?database=psique' },
  ]) assert.throws(() => configuracionPostgres('pruebas', entorno), ErrorHerramienta);
});

test('los archivos se ordenan numéricamente y no admiten versiones duplicadas', async () => {
  await temporal(async directorio => {
    for (const archivo of ['010_diez.sql', '002_dos.sql', '001_uno.sql']) await writeFile(join(directorio, archivo), 'SELECT 1;\n');
    assert.deepEqual((await leerMigraciones(directorio)).map(m => m.version), [1, 2, 10]);
    await writeFile(join(directorio, '002_repetida.sql'), 'SELECT 2;\n');
    await assert.rejects(leerMigraciones(directorio), /misma versión/);
  });
});

test('el checksum tolera CRLF de Windows y detecta cambios reales de contenido', async () => {
  await temporal(async directorio => {
    const ruta = join(directorio, '001_prueba.sql');
    await writeFile(ruta, 'SELECT 1;\r\n-- comentario\r\n');
    const primero = (await leerMigraciones(directorio))[0].checksum;
    await writeFile(ruta, 'SELECT 1;\n-- comentario\n');
    assert.equal((await leerMigraciones(directorio))[0].checksum, primero);
    await writeFile(ruta, 'SELECT 2;\n-- comentario\n');
    assert.notEqual((await leerMigraciones(directorio))[0].checksum, primero);
  });
});

test('consultar estado y repetir el migrador conservan historial y objetos ya aplicados', async () => {
  const antes = await estadoPersistido();
  const estado = await ejecutarMigraciones({ pruebas: true, soloEstado: true });
  assert.deepEqual(estado.pendientes, []);
  const repetida = await ejecutarMigraciones({ pruebas: true });
  assert.deepEqual(repetida.aplicadas, []);
  assert.deepEqual(await estadoPersistido(), antes);
});

test('una migración aplicada modificada se rechaza antes de ejecutar SQL', async () => {
  const antes = await estadoPersistido();
  await temporal(async directorio => {
    const original = (await leerMigraciones())[0];
    await writeFile(join(directorio, original.archivo), original.sql + '\n-- Cambio que debe rechazarse.\n');
    await assert.rejects(ejecutarMigraciones({ pruebas: true, directorio }), /falta o fue modificada/);
  }, true);
  assert.deepEqual(await estadoPersistido(), antes);
});

test('una migración fallida revierte DDL, datos y registro de versión', async () => {
  const antes = await estadoPersistido();
  await temporal(async directorio => {
    const version = Math.max(...(await leerMigraciones()).map(m => m.version)) + 1;
    const archivo = String(version).padStart(3, '0') + '_fallo_controlado.sql';
    const tabla = 'prueba_rollback_' + randomUUID().replaceAll('-', '');
    await writeFile(join(directorio, archivo), `CREATE TABLE public.${tabla} (id INTEGER PRIMARY KEY);
      INSERT INTO public.${tabla} VALUES (1);
      SELECT * FROM public.tabla_inexistente_para_esta_prueba;`);
    await assert.rejects(ejecutarMigraciones({ pruebas: true, directorio }), error => error.code === '42P01');
  }, true);
  assert.deepEqual(await estadoPersistido(), antes);
});

test('dos migradores simultáneos aplican una versión una sola vez', async () => {
  const antes = await estadoPersistido();
  await temporal(async directorio => {
    const version = Math.max(...(await leerMigraciones()).map(m => m.version)) + 1;
    const archivo = String(version).padStart(3, '0') + '_concurrencia_prueba.sql';
    const tabla = 'prueba_migracion_' + randomUUID().replaceAll('-', '');
    await writeFile(join(directorio, archivo), `CREATE TABLE public.${tabla} (id INTEGER PRIMARY KEY);
      INSERT INTO public.${tabla} VALUES (1);`);
    try {
      const resultados = await Promise.all([
        ejecutarMigraciones({ pruebas: true, directorio }), ejecutarMigraciones({ pruebas: true, directorio }),
      ]);
      assert.equal(resultados.reduce((n, r) => n + r.aplicadas.length, 0), 1);
      const c = await conexionPruebas();
      try {
        assert.equal((await c.query(`SELECT count(*)::integer AS n FROM public.${tabla}`)).rows[0].n, 1);
        assert.equal((await c.query('SELECT count(*)::integer AS n FROM public.migraciones WHERE version=$1', [version])).rows[0].n, 1);
      } finally { await c.end(); }
    } finally {
      // Esta conexión solo admite psique_test/psique_test. Se limpian exclusivamente los artefactos UUID de esta prueba.
      const c = await conexionPruebas();
      try {
        await c.query('BEGIN');
        await c.query(`DROP TABLE IF EXISTS public.${tabla}`);
        await c.query('DELETE FROM public.migraciones WHERE version=$1 AND archivo=$2', [version, archivo]);
        await c.query('COMMIT');
      } catch (error) {
        await c.query('ROLLBACK'); throw error;
      } finally { await c.end(); }
    }
  }, true);
  assert.deepEqual(await estadoPersistido(), antes);
});

test('la CLI muestra un error claro sin revelar la cadena ni su contraseña', () => {
  const secretoFicticio = 'CLAVE-FICTICIA-QUE-NO-DEBE-SALIR';
  const resultado = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/migrar.mjs', import.meta.url)), '--status'], {
    env: { ...process.env, MIGRATION_DATABASE_URL: `postgresql://otro:${secretoFicticio}@localhost/psique` },
    encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
  assert.equal(resultado.status, 1);
  const salida = resultado.stdout + resultado.stderr;
  assert.match(salida, /MIGRATION_DATABASE_URL/);
  assert.ok(!salida.includes(secretoFicticio));
  assert.ok(!salida.includes('postgresql://'));
});
