import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import express from 'express';
import * as argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { abrirPoolPostgres, ErrorConfiguracionPostgres, ErrorPostgresNoDisponible } from '../dist/db/postgres.js';
import { configurarAutenticacionPostgres, manejarDisponibilidadPostgres } from '../dist/auth-postgres.js';
import { conexionPruebas, buzonPruebas } from './fixtures.mjs';

const password = '  Clave ficticia PostgreSQL 2026  ';
const fechaInicial = '2026-10-13T15:12:34.123Z';
let usuariosIniciales;

before(async () => {
  const c = await conexionPruebas();
  try { usuariosIniciales = (await c.query('SELECT count(*)::integer AS n FROM public.usuarios')).rows[0].n; }
  finally { await c.end(); }
});
after(async () => {
  const c = await conexionPruebas();
  try { assert.equal((await c.query('SELECT count(*)::integer AS n FROM public.usuarios')).rows[0].n, usuariosIniciales); }
  finally { await c.end(); }
});

async function entorno(t, opciones = {}) {
  // Cada instancia espera la comprobación del pool antes de abrir su puerto efímero.
  const pool = await abrirPoolPostgres({ pruebas: true, ...opciones });
  const prefijo = 'psique-auth-' + randomUUID() + '-';
  const secreto = randomBytes(48).toString('base64url');
  let instante = new Date(fechaInicial);
  const reloj = () => new Date(instante);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  const buzon = buzonPruebas();
  configurarAutenticacionPostgres(app, pool, secreto, reloj, buzon.correo);
  // Ruta artificial de prueba: comprueba res.locals sin montar pacientes ni agenda.
  app.get('/api/verificacion', (_req, res) => res.json({ usuarioId: res.locals['usuarioId'] }));
  app.use((_req, res) => res.status(404).json({ mensaje: 'Recurso no encontrado' }));
  app.use(manejarDisponibilidadPostgres);
  app.use((error, _req, res, _next) => {
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ mensaje: 'El cuerpo de la solicitud debe contener JSON válido.' });
    if (error?.type === 'entity.too.large') return res.status(413).json({ mensaje: 'La ficha enviada supera el tamaño permitido de 32 KB.' });
    return res.status(500).json({ mensaje: 'No se pudo completar la operación' });
  });
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(async () => {
    try {
      await new Promise((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
    } finally {
      if (!pool.ending) await pool.end();
      // Esta conexión exige psique_test/psique_test. Solo se borran usuarios del UUID de esta instancia.
      const c = await conexionPruebas();
      try {
        await c.query('DELETE FROM public.usuarios WHERE email LIKE $1', [prefijo + '%']);
        assert.equal((await c.query('SELECT count(*)::integer AS n FROM public.usuarios WHERE email LIKE $1', [prefijo + '%'])).rows[0].n, 0);
      } finally { await c.end(); }
    }
  });
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  const email = (sufijo = 'a') => prefijo + sufijo + '@example.test';
  async function api(ruta, { metodo = 'GET', token, datos, authorization } = {}) {
    const respuesta = await fetch(base + ruta, { method: metodo,
      headers: { ...(authorization !== undefined ? { Authorization: authorization } : token ? { Authorization: 'Bearer ' + token } : {}),
        ...(datos !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(datos !== undefined ? { body: JSON.stringify(datos) } : {}),
    });
    return { estado: respuesta.status, cuerpo: await respuesta.json() };
  }
  async function registrar(sufijo = 'a') {
    const resultado = await api('/auth/registro', { metodo: 'POST', datos: { email: email(sufijo), password, repetirPassword: password } });
    assert.equal(resultado.estado, 201);
    assert.equal((await api('/auth/confirmar-email', { metodo: 'POST', datos: { token: buzon.token(email(sufijo)) } })).estado, 200);
    return resultado.cuerpo.usuario;
  }
  async function login(sufijo = 'a') {
    const resultado = await api('/auth/login', { metodo: 'POST', datos: { email: email(sufijo), password } });
    assert.equal(resultado.estado, 200);
    return resultado.cuerpo;
  }
  async function tokenFirmado(id, cambios = {}, omitir = [], alg = 'HS256', clave = secreto) {
    const iat = Math.floor(reloj().getTime() / 1000);
    const payload = { sub: String(id), iss: 'psique', aud: 'psique-app', iat, exp: iat + 3600, versionCredenciales: 0, ...cambios };
    for (const claim of omitir) delete payload[claim];
    return new SignJWT(payload).setProtectedHeader({ alg, typ: 'JWT' }).sign(new TextEncoder().encode(clave));
  }
  return { pool, base, api, registrar, login, email, secreto, tokenFirmado,
    avanzar: segundos => { instante = new Date(instante.getTime() + segundos * 1000); } };
}

test('registro PostgreSQL conserva JSON, normaliza email y guarda Argon2id con sal', async t => {
  const e = await entorno(t);
  const resultado = await e.api('/auth/registro', { metodo: 'POST', datos: { email: '  ' + e.email().toUpperCase() + '  ', password, repetirPassword: password } });
  assert.equal(resultado.estado, 201);
  const usuario = resultado.cuerpo.usuario;
  assert.deepEqual(Object.keys(resultado.cuerpo).sort(), ['correoEnviado', 'usuario']);
  assert.equal(resultado.cuerpo.correoEnviado, true);
  assert.deepEqual(Object.keys(usuario).sort(), ['email', 'fechaCreacion', 'id']);
  assert.equal(typeof usuario.id, 'number');
  assert.equal(usuario.email, e.email()); assert.equal(usuario.fechaCreacion, fechaInicial);
  const guardado = (await e.pool.query('SELECT "passwordHash" FROM public.usuarios WHERE id=$1', [usuario.id])).rows[0];
  assert.ok(guardado.passwordHash.startsWith('$argon2id$'));
  assert.ok(guardado.passwordHash !== password);
  assert.ok(await argon2.verify(guardado.passwordHash, password));
  const segundo = await e.registrar('b');
  const otro = (await e.pool.query('SELECT "passwordHash" FROM public.usuarios WHERE id=$1', [segundo.id])).rows[0];
  assert.ok(otro.passwordHash !== guardado.passwordHash);
});

test('registro PostgreSQL mantiene validaciones y mensajes sin insertar usuarios inválidos', async t => {
  const e = await entorno(t);
  const valido = { email: e.email(), password, repetirPassword: password };
  const casos = [
    [null, 'El cuerpo de la solicitud debe contener JSON válido.'],
    [[], 'Enviá un objeto JSON con los datos de acceso.'],
    [{ ...valido, usuarioId: 1 }, 'Revisá los campos enviados: hay datos faltantes o desconocidos.'],
    [{ ...valido, email: 'no-es-email' }, 'Ingresá un email válido.'],
    [{ ...valido, password: 'x'.repeat(11), repetirPassword: 'x'.repeat(11) }, 'La contraseña debe tener entre 12 y 128 caracteres.'],
    [{ ...valido, password: 'x'.repeat(129), repetirPassword: 'x'.repeat(129) }, 'La contraseña debe tener entre 12 y 128 caracteres.'],
    [{ ...valido, repetirPassword: 'No coincide' }, 'Las contraseñas no coinciden.'],
  ];
  for (const [datos, mensaje] of casos) {
    const r = await e.api('/auth/registro', { metodo: 'POST', datos });
    assert.equal(r.estado, 400); assert.deepEqual(r.cuerpo, { mensaje });
  }
  assert.equal((await e.pool.query('SELECT count(*)::integer AS n FROM public.usuarios WHERE email=$1', [e.email()])).rows[0].n, 0);
  for (const [sufijo, longitud] of [['minimo', 12], ['maximo', 128]]) {
    const clave = 'x'.repeat(longitud);
    assert.equal((await e.api('/auth/registro', { metodo: 'POST', datos: { email: e.email(sufijo), password: clave, repetirPassword: clave } })).estado, 201);
  }
});

test('email duplicado y variantes de mayúsculas reciben el mismo 409', async t => {
  const e = await entorno(t); await e.registrar();
  for (const email of [e.email(), e.email().toUpperCase()]) {
    const r = await e.api('/auth/registro', { metodo: 'POST', datos: { email, password, repetirPassword: password } });
    assert.equal(r.estado, 409); assert.deepEqual(r.cuerpo, { mensaje: 'Ya existe una cuenta con ese email.' });
  }
});

test('dos registros simultáneos del mismo email generan un solo usuario', async t => {
  const e = await entorno(t);
  const respuestas = await Promise.all([e.email(), e.email().toUpperCase()].map(email => e.api('/auth/registro', {
    metodo: 'POST', datos: { email, password, repetirPassword: password },
  })));
  assert.deepEqual(respuestas.map(r => r.estado).sort(), [201, 409]);
  assert.equal((await e.pool.query('SELECT count(*)::integer AS n FROM public.usuarios WHERE lower(email)=lower($1)', [e.email()])).rows[0].n, 1);
});

test('login PostgreSQL conserva JWT HS256, claims, duración e información pública', async t => {
  const e = await entorno(t); const usuario = await e.registrar(); const sesion = await e.login();
  assert.deepEqual(Object.keys(sesion).sort(), ['expiraEn', 'token', 'usuario']);
  assert.deepEqual(sesion.usuario, usuario); assert.equal(sesion.expiraEn, 3600);
  assert.ok(typeof sesion.token === 'string');
  const { payload, protectedHeader } = await jwtVerify(sesion.token, new TextEncoder().encode(e.secreto), {
    algorithms: ['HS256'], issuer: 'psique', audience: 'psique-app', currentDate: new Date(fechaInicial),
  });
  assert.deepEqual(protectedHeader, { alg: 'HS256', typ: 'JWT' });
  assert.deepEqual(Object.keys(payload).sort(), ['aud', 'exp', 'iat', 'iss', 'sub', 'versionCredenciales']);
  assert.equal(payload.sub, String(usuario.id)); assert.equal(payload.exp - payload.iat, 3600);
  assert.deepEqual(await e.api('/verificacion', { token: sesion.token }), { estado: 200, cuerpo: { usuarioId: usuario.id } });
});

test('contraseña incorrecta y usuario inexistente tienen idéntico 401; la contraseña no se recorta', async t => {
  const e = await entorno(t); await e.registrar();
  for (const datos of [{ email: e.email(), password: 'Incorrecta de prueba' },
    { email: e.email('inexistente'), password }, { email: e.email(), password: password.trim() }]) {
    const r = await e.api('/auth/login', { metodo: 'POST', datos });
    assert.equal(r.estado, 401); assert.deepEqual(r.cuerpo, { mensaje: 'El email o la contraseña son incorrectos.' });
  }
  assert.equal((await e.api('/auth/login', { metodo: 'POST', datos: { email: e.email().toUpperCase(), password } })).estado, 200);
});

test('middleware rechaza ausencia de token y encabezados Bearer incorrectos', async t => {
  const e = await entorno(t);
  for (const authorization of [undefined, 'Basic abc', 'Bearer', 'Bearer uno dos', 'Bearer uno ']) {
    const r = await e.api('/verificacion', { authorization });
    assert.equal(r.estado, 401); assert.deepEqual(r.cuerpo, { mensaje: 'Iniciá sesión para acceder a PSIQUE.' });
  }
});

test('middleware rechaza firma alterada, otra clave, algoritmo, emisor o audiencia', async t => {
  const e = await entorno(t); const usuario = await e.registrar();
  const valida = await e.tokenFirmado(usuario.id);
  const partes = valida.split('.');
  partes[2] = (partes[2][0] === 'A' ? 'B' : 'A') + partes[2].slice(1);
  const tokens = [partes.join('.'), await e.tokenFirmado(usuario.id, {}, [], 'HS256', randomBytes(48).toString('hex')),
    await e.tokenFirmado(usuario.id, {}, [], 'HS384'), await e.tokenFirmado(usuario.id, { iss: 'otro' }),
    await e.tokenFirmado(usuario.id, { aud: 'otro' })];
  for (const token of tokens) assert.equal((await e.api('/verificacion', { token })).estado, 401);
});

test('middleware rechaza JWT vencidos y todos los claims requeridos ausentes', async t => {
  const e = await entorno(t); const usuario = await e.registrar();
  for (const claim of ['sub', 'iat', 'exp', 'iss', 'aud', 'versionCredenciales']) {
    const token = await e.tokenFirmado(usuario.id, {}, [claim]);
    assert.equal((await e.api('/verificacion', { token })).estado, 401);
  }
  const { token } = await e.login(); e.avanzar(3600);
  assert.equal((await e.api('/verificacion', { token })).estado, 401);
});

test('usuario eliminado o sub inexistente/fuera del rango de INTEGER recibe 401', async t => {
  const e = await entorno(t); const usuario = await e.registrar(); const { token } = await e.login();
  await e.pool.query('DELETE FROM public.usuarios WHERE id=$1', [usuario.id]);
  assert.equal((await e.api('/verificacion', { token })).estado, 401);
  for (const id of ['0', '-1', '01', '2147483648', '9007199254740991', '9007199254740992']) {
    assert.equal((await e.api('/verificacion', { token: await e.tokenFirmado(id) })).estado, 401);
  }
});

test('la instancia PostgreSQL de autenticación no expone pacientes, agenda, sesiones ni dashboard', async t => {
  const e = await entorno(t); await e.registrar(); const { token } = await e.login();
  for (const ruta of ['/pacientes', '/agenda', '/sesiones/semana', '/dashboard', '/horarios/disponibles']) {
    assert.equal((await e.api(ruta, { token })).estado, 404);
  }
});

test('pool cerrado produce 503 en registro, login y comprobación de usuario, no falsos 401', async t => {
  const e = await entorno(t); await e.registrar(); const { token } = await e.login();
  await e.pool.end();
  const resultados = [
    await e.api('/auth/registro', { metodo: 'POST', datos: { email: e.email('otro'), password, repetirPassword: password } }),
    await e.api('/auth/login', { metodo: 'POST', datos: { email: e.email(), password } }),
    await e.api('/verificacion', { token }),
  ];
  for (const r of resultados) {
    assert.equal(r.estado, 503);
    assert.deepEqual(r.cuerpo, { mensaje: 'El servicio de autenticación no está disponible. Intentá nuevamente.' });
  }
  assert.equal((await e.api('/verificacion')).estado, 401);
});

test('error de conexión durante INSERT devuelve 503 y no se convierte en email duplicado', async t => {
  const e = await entorno(t);
  const original = e.pool.query.bind(e.pool);
  t.mock.method(e.pool, 'query', (sql, valores) => {
    if (typeof sql === 'string' && sql.startsWith('INSERT INTO public.usuarios')) {
      return Promise.reject(Object.assign(new Error('Fallo de transporte ficticio'), { code: '08006' }));
    }
    return original(sql, valores);
  });
  const r = await e.api('/auth/registro', { metodo: 'POST', datos: { email: e.email(), password, repetirPassword: password } });
  assert.equal(r.estado, 503);
  assert.deepEqual(r.cuerpo, { mensaje: 'El servicio de autenticación no está disponible. Intentá nuevamente.' });
  assert.equal((await original('SELECT count(*)::integer AS n FROM public.usuarios WHERE email=$1', [e.email()])).rows[0].n, 0);
});

test('un error SQL interno conserva 500 y no revela detalles ni se confunde con credenciales', async t => {
  const e = await entorno(t);
  t.mock.method(e.pool, 'query', () => Promise.reject(Object.assign(new Error('Detalle SQL ficticio que no debe salir'), { code: '42P01' })));
  const r = await e.api('/auth/login', { metodo: 'POST', datos: { email: e.email(), password } });
  assert.equal(r.estado, 500); assert.deepEqual(r.cuerpo, { mensaje: 'No se pudo completar la operación' });
});

test('espera del pool limitada devuelve 503 y se recupera al liberar la conexión', async t => {
  const e = await entorno(t, { maximoConexiones: 1, esperaConexionMs: 200 });
  await e.registrar();
  const ocupada = await e.pool.connect();
  try {
    const r = await e.api('/auth/login', { metodo: 'POST', datos: { email: e.email(), password } });
    assert.equal(r.estado, 503);
  } finally { ocupada.release(); }
  assert.equal((await e.api('/auth/login', { metodo: 'POST', datos: { email: e.email(), password } })).estado, 200);
  assert.equal(e.pool.totalCount, 1); assert.equal(e.pool.waitingCount, 0);
});

test('PostgreSQL inaccesible impide obtener el pool antes de iniciar HTTP', async () => {
  const reserva = createServer(); reserva.listen(0, '127.0.0.1'); await once(reserva, 'listening');
  const puerto = reserva.address().port;
  await new Promise(resolve => reserva.close(resolve));
  const url = new URL(process.env.TEST_DATABASE_URL); url.port = String(puerto);
  await assert.rejects(abrirPoolPostgres({ pruebas: true, entorno: { TEST_DATABASE_URL: url.href }, esperaConexionMs: 200 }), ErrorPostgresNoDisponible);
});

test('configuración del pool rechaza rol migrador, destinos incorrectos y secretos mezclados', async () => {
  for (const opciones of [
    { entorno: {} },
    { entorno: { DATABASE_URL: 'postgresql://psique_migrador:ejemplo@localhost/psique' } },
    { pruebas: true, entorno: { TEST_DATABASE_URL: 'postgresql://psique_test:ejemplo@localhost/psique' } },
    { pruebas: true, entorno: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL, DATABASE_URL: 'no-se-usa' } },
  ]) await assert.rejects(abrirPoolPostgres(opciones), ErrorConfiguracionPostgres);
});

test('el pool reutiliza conexiones y cierra sus sockets y temporizadores', async () => {
  const pool = await abrirPoolPostgres({ pruebas: true });
  try {
    const primero = (await pool.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    const segundo = (await pool.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    assert.equal(primero, segundo); assert.equal(pool.totalCount, 1);
    assert.equal(pool.options.max, 5); assert.equal(pool.options.connectionTimeoutMillis, 5000);
  } finally { await pool.end(); }
  assert.equal(pool.ended, true); assert.equal(pool.totalCount, 0);
});

test('una conexión inactiva interrumpida se retira y el pool se recupera sin registrar secretos', async t => {
  const pool = await abrirPoolPostgres({ pruebas: true });
  const control = await conexionPruebas();
  const avisos = [];
  t.mock.method(console, 'error', mensaje => avisos.push(mensaje));
  try {
    const pid = (await pool.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    const interrupcion = once(pool, 'error');
    // El PID proviene de nuestro propio pool psique_test; nunca se detiene el servidor ni otra cuenta.
    assert.equal((await control.query('SELECT pg_terminate_backend($1) AS terminado', [pid])).rows[0].terminado, true);
    const [error] = await interrupcion;
    assert.equal(error.code, '57P01');
    assert.deepEqual(avisos, ['Se interrumpió una conexión PostgreSQL inactiva.']);
    const nuevo = (await pool.query('SELECT pg_backend_pid() AS id')).rows[0].id;
    assert.notEqual(nuevo, pid); assert.equal(pool.totalCount, 1);
  } finally { await control.end(); await pool.end(); }
});
