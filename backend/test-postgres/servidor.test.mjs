import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { Pool } from 'pg';
import { iniciarServidorPostgres } from '../dist/server.js';
import { ErrorConfiguracionPostgres } from '../dist/db/postgres.js';
import { conexionPruebas } from './fixtures.mjs';
import { ficha } from './api-fixtures.mjs';

const secreto = randomBytes(48).toString('hex');
const entorno = () => ({ ...process.env, JWT_SECRET: secreto });
async function puertoLibre() {
  const temporal = createServer().listen(0, '127.0.0.1');
  await once(temporal, 'listening');
  const puerto = temporal.address().port;
  await new Promise(resolve => temporal.close(resolve));
  return puerto;
}

test('JWT_SECRET se comprueba antes de abrir el pool', async () => {
  for (const JWT_SECRET of [undefined, '', 'corta', ' '.repeat(64)]) {
    await assert.rejects(iniciarServidorPostgres({ entorno: { JWT_SECRET } }), error => {
      assert.ok(error instanceof ErrorConfiguracionPostgres);
      assert.match(error.message, /JWT_SECRET/); return true;
    });
  }
});

test('PORT inválido impide comenzar el arranque PostgreSQL', async () => {
  for (const PORT of ['0', '65536', '1.5', 'texto']) {
    await assert.rejects(iniciarServidorPostgres({ entorno: { JWT_SECRET: secreto, PORT } }), /PORT/);
  }
});

test('la entrada normal no selecciona pruebas ni crea SQLite si falta DATABASE_URL', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'psique-sin-fallback-'));
  const ruta = join(carpeta, 'no-crear.sqlite');
  try {
    const env = { ...entorno(), DB_PATH: ruta, PORT: String(await puertoLibre()) };
    delete env.DATABASE_URL; delete env.APP_DATABASE_URL; delete env.MIGRATION_DATABASE_URL;
    // TEST_DATABASE_URL puede existir en el ejecutor; la entrada normal no la usa.
    const hijo = spawn(process.execPath, [resolve('dist/server.js')], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    hijo.stdout.on('data', datos => { salida += datos.toString(); });
    hijo.stderr.on('data', datos => { salida += datos.toString(); });
    const [codigo] = await once(hijo, 'exit');
    assert.equal(codigo, 1);
    assert.match(salida, /No se pudo iniciar.*DATABASE_URL/);
    assert.ok(!salida.includes('disponible en http'));
    assert.ok(!salida.includes(process.env.TEST_DATABASE_URL));
    assert.equal(existsSync(ruta), false);
  } finally { rmdirSync(carpeta); }
});

test('la entrada normal rechaza DATABASE_URL del rol/base de pruebas', async () => {
  await assert.rejects(iniciarServidorPostgres({ entorno: { JWT_SECRET: secreto, DATABASE_URL: process.env.TEST_DATABASE_URL } }),
    /base psique y el rol psique_app/);
});

test('un esquema incompleto cierra el pool sin abrir HTTP ni ejecutar DDL', async t => {
  const original = Pool.prototype.query;
  let pool;
  const consultas = [];
  t.mock.method(Pool.prototype, 'query', function (sql, ...args) {
    pool = this; consultas.push(sql);
    if (sql.includes('FROM public.turnos LIMIT 0')) return Promise.reject(Object.assign(new Error('Fallo ficticio de esquema'), { code: '42P01' }));
    return original.call(this, sql, ...args);
  });
  await assert.rejects(iniciarServidorPostgres({ pruebas: true, entorno: { ...entorno(), PORT: String(await puertoLibre()) } }),
    /Revisá credenciales, permisos y migraciones/);
  assert.equal(pool.ended, true);
  assert.equal(pool.totalCount, 0);
  assert.ok(consultas.every(sql => sql.trim().startsWith('SELECT')));
});

test('un puerto ocupado cierra el pool creado durante el arranque fallido', async t => {
  const ocupado = createServer().listen(0, '127.0.0.1');
  await once(ocupado, 'listening');
  t.after(() => new Promise(resolve => ocupado.close(resolve)));
  const original = Pool.prototype.end;
  let cerrado;
  t.mock.method(Pool.prototype, 'end', function (...args) { cerrado = this; return original.apply(this, args); });
  await assert.rejects(iniciarServidorPostgres({ pruebas: true, entorno: { ...entorno(), PORT: String(ocupado.address().port) } }),
    error => error.code === 'EADDRINUSE');
  assert.equal(cerrado.ended, true);
  assert.equal(cerrado.totalCount, 0);
});

test('el cierre ordenado es idempotente y deja HTTP/pool cerrados', async () => {
  const instancia = await iniciarServidorPostgres({ pruebas: true, entorno: { ...entorno(), PORT: String(await puertoLibre()) } });
  assert.equal(instancia.servidor.listening, true);
  const r = await fetch(`http://127.0.0.1:${instancia.servidor.address().port}/api/pacientes`);
  assert.equal(r.status, 401); await r.json();
  await Promise.all([instancia.detener(), instancia.detener()]);
  assert.equal(instancia.servidor.listening, false);
  assert.equal(instancia.pool.ended, true);
  assert.equal(instancia.pool.totalCount, 0);
});

test('el arranque real conserva cuenta, paciente, horario y sesión tras reiniciar Express', async t => {
  const email = 'psique-servidor-' + randomUUID() + '@example.test';
  const password = 'Clave ficticia de persistencia 2026';
  const env = { ...entorno(), PORT: String(await puertoLibre()) };
  let instancia;
  const pedir = async (ruta, metodo = 'GET', datos, token) => {
    const r = await fetch(`http://127.0.0.1:${env.PORT}/api/${ruta}`, { method: metodo,
      headers: { ...(datos !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(datos !== undefined ? { body: JSON.stringify(datos) } : {}),
    });
    return { status: r.status, body: await r.json() };
  };
  t.after(async () => {
    try { if (instancia) await instancia.detener(); }
    finally {
      // conexionPruebas verifica exclusivamente psique_test/psique_test.
      const c = await conexionPruebas();
      try {
        const ids = (await c.query('SELECT id FROM public.usuarios WHERE email = $1', [email])).rows.map(u => u.id);
        await c.query('BEGIN');
        for (const tabla of ['sesiones', 'turnos', 'pacientes']) await c.query(`DELETE FROM public.${tabla} WHERE "usuarioId" = ANY($1::integer[])`, [ids]);
        await c.query('DELETE FROM public.usuarios WHERE id = ANY($1::integer[])', [ids]);
        await c.query('COMMIT');
      } catch (error) { await c.query('ROLLBACK'); throw error; }
      finally { await c.end(); }
    }
  });
  instancia = await iniciarServidorPostgres({ pruebas: true, entorno: env });
  const cuenta = await pedir('auth/registro', 'POST', { email, password, repetirPassword: password });
  assert.equal(cuenta.status, 201);
  const acceso = await pedir('auth/login', 'POST', { email, password });
  assert.equal(acceso.status, 200);
  const token = acceso.body.token;
  assert.equal((await pedir('pacientes', 'POST', { paciente: ficha('Persistente') }, token)).status, 201);
  const fecha = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const horario = '15:00';
  assert.equal((await pedir('horarios', 'POST', { fecha, horario }, token)).status, 201);
  const sesion = await pedir('sesiones', 'POST', { fecha, horario, codigoPaciente: 'Persistente', modalidad: 'Virtual', importeCentavos: 123456 }, token);
  assert.equal(sesion.status, 201);
  const antes = {};
  for (const ruta of ['pacientes/Persistente', `horarios/${fecha}/${horario}`, `sesiones/${sesion.body.id}`, 'dashboard']) antes[ruta] = await pedir(ruta, 'GET', undefined, token);
  await instancia.detener();
  instancia = await iniciarServidorPostgres({ pruebas: true, entorno: env });
  for (const [ruta, respuesta] of Object.entries(antes)) assert.deepEqual(await pedir(ruta, 'GET', undefined, token), respuesta);
  assert.equal((await pedir('auth/login', 'POST', { email, password })).status, 200);
  // Otra conexión, creada después del reinicio, comprueba las relaciones reales.
  const c = await conexionPruebas();
  try {
    const { rows: [guardado] } = await c.query(`SELECT u.id AS "usuarioId", p.codigo, s.id AS "sesionId", s."importeCentavos",
      to_char(t.fecha, 'YYYY-MM-DD') AS fecha, to_char(t.horario, 'HH24:MI') AS horario
      FROM public.usuarios u JOIN public.pacientes p ON p."usuarioId" = u.id
      JOIN public.sesiones s ON s."usuarioId" = u.id AND s."codigoPaciente" = p.codigo
      JOIN public.turnos t ON t."usuarioId" = s."usuarioId" AND t.fecha = s.fecha AND t.horario = s.horario
      WHERE u.email = $1`, [email]);
    assert.deepEqual(guardado, { usuarioId: cuenta.body.usuario.id, codigo: 'Persistente', sesionId: sesion.body.id, importeCentavos: 123456, fecha, horario });
  } finally { await c.end(); }
});
