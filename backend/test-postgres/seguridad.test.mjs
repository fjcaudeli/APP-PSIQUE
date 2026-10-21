import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { TLSSocket, createSecureContext } from 'node:tls';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import express from 'express';
import pg from 'pg';
import { configuracionServidor } from '../dist/configuracion.js';
import { opcionesTlsPostgres } from '../dist/db/seguridad-postgres.js';
import { configurarSeguridadHttp } from '../dist/seguridad-http.js';
import { configurarAutenticacionConAlmacen } from '../dist/auth.js';
import { configurarDisponibilidad } from '../dist/disponibilidad.js';
import { crearAppPostgres } from '../dist/app-postgres.js';
import { abrirPoolPostgres } from '../dist/db/postgres.js';
import { iniciarServidorPostgres } from '../dist/server.js';
import { configuracionPostgres } from '../scripts/postgres-config.mjs';

const remoto = 'https://frontend.example.test'; // Dominio reservado, nunca se consulta.
const urlFicticia = 'postgresql://psique_app:solo-ficticia@db.example.test/psique';
const secreto = randomBytes(48).toString('hex');

async function escuchar(t, app) {
  const servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(() => new Promise(resolve => servidor.close(resolve)));
  return `http://127.0.0.1:${servidor.address().port}`;
}

test('configuración local conserva interfaz, puerto y origen; nunca se publica por accidente', () => {
  assert.deepEqual(configuracionServidor({}), { produccion: false, puerto: 3000, host: '127.0.0.1', origen: 'http://127.0.0.1:4200', proxies: [] });
  assert.throws(() => configuracionServidor({ HOST: '0.0.0.0' }), /HOST/);
  assert.throws(() => configuracionServidor({ NODE_ENV: 'prod' }), /NODE_ENV/);
});

test('producción exige PORT y origen HTTPS exacto; admite interfaz de Render', () => {
  const env = { NODE_ENV: 'production', PORT: '10000', FRONTEND_ORIGIN: remoto };
  assert.equal(configuracionServidor(env).host, '0.0.0.0');
  for (const cambios of [{ PORT: undefined }, { FRONTEND_ORIGIN: undefined }, { FRONTEND_ORIGIN: 'http://frontend.example.test' },
    { FRONTEND_ORIGIN: remoto + '/' }, { FRONTEND_ORIGIN: '*' }, { FRONTEND_ORIGIN: 'https://usuario:clave@frontend.example.test' }]) {
    assert.throws(() => configuracionServidor({ ...env, ...cambios }));
  }
});

test('solo se aceptan proxies explícitos, nunca trust proxy=true o toda Internet', () => {
  for (const valor of ['true', '1', '0.0.0.0/0', '::/0', 'loopback', '127.0.0.1/33', '::1/129']) {
    assert.throws(() => configuracionServidor({ TRUSTED_PROXY_CIDRS: valor }), /TRUSTED_PROXY/);
  }
  assert.deepEqual(configuracionServidor({ TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128' }).proxies, ['127.0.0.1/32', '::1/128']);
});

test('CORS acepta solo el origen exacto, soporta Bearer/preflight y rechaza métodos y encabezados extra', async t => {
  const app = express(); configurarSeguridadHttp(app, remoto, { produccion: true });
  app.get('/api/ejemplo', (_req, res) => res.json({ ejemplo: true }));
  const base = await escuchar(t, app);
  const permitida = await fetch(base + '/api/ejemplo', { headers: { Origin: remoto } });
  assert.equal(permitida.status, 200); assert.equal(permitida.headers.get('access-control-allow-origin'), remoto);
  assert.equal(permitida.headers.get('access-control-allow-credentials'), null);
  const preflight = await fetch(base + '/api/ejemplo', { method: 'OPTIONS', headers: { Origin: remoto,
    'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/i);
  for (const Origin of ['null', 'https://otro.example.test', remoto + '.ajeno.test', 'http://frontend.example.test']) {
    const r = await fetch(base + '/api/ejemplo', { headers: { Origin } });
    assert.equal(r.status, 403); assert.equal(r.headers.get('access-control-allow-origin'), null);
    assert.deepEqual(await r.json(), { mensaje: 'Origen o solicitud CORS no autorizados.' });
  }
  for (const extra of [{ 'Access-Control-Request-Method': 'DELETE' }, { 'Access-Control-Request-Headers': 'X-UsuarioId' }]) {
    assert.equal((await fetch(base + '/api/ejemplo', { method: 'OPTIONS', headers: { Origin: remoto, ...extra } })).status, 403);
  }
  assert.equal((await fetch(base + '/api/ejemplo')).status, 200); // CORS no sustituye JWT.
});

test('Helmet y no-store protegen respuestas correctas, errores y endpoints públicos sin CSP sobre Angular', async t => {
  const app = crearAppPostgres({ query: async () => ({ rows: [] }) }, remoto, () => new Date(), secreto, { produccion: true });
  const base = await escuchar(t, app);
  for (const ruta of ['/health/live', '/api/pacientes', '/no-existe']) {
    const r = await fetch(base + ruta);
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('etag'), null);
    assert.match(r.headers.get('strict-transport-security'), /max-age=31536000/);
    assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
    assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(!JSON.stringify(await r.json()).includes(secreto));
  }
});

for (const [ruta, limite] of [['registro', 10], ['login', 30]]) {
  test(`${ruta}: límite real HTTP 429 anterior a SQL/Argon2; X-Forwarded-For falso no permite evadirlo`, async t => {
    const app = express(); configurarSeguridadHttp(app, remoto); app.use(express.json({ limit: '32kb' }));
    let consultas = 0;
    configurarAutenticacionConAlmacen(app, { buscarPorEmail: () => { consultas++; }, existeUsuario: () => false }, secreto, () => new Date());
    const base = await escuchar(t, app);
    for (let i = 0; i < limite; i++) {
      const r = await fetch(base + '/api/auth/' + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${i + 1}` }, body: '{}' });
      assert.equal(r.status, 400); await r.json();
    }
    const r = await fetch(base + '/api/auth/' + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ficticio@example.test', password: 'Clave ficticia de prueba', repetirPassword: 'Clave ficticia de prueba' }) });
    assert.equal(r.status, 429); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.deepEqual(await r.json(), { mensaje: 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.' });
    assert.equal(consultas, 0);
  });
}

test('proxy explícito recupera IP por cadena confiable; no basta falsificar el primer elemento', async t => {
  const app = express(); configurarSeguridadHttp(app, remoto, { proxies: ['127.0.0.1/32'] });
  // Solo esta aplicación artificial expone req.ip; PSIQUE no tiene este endpoint.
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  const base = await escuchar(t, app);
  const r = await fetch(base + '/ip', { headers: { 'X-Forwarded-For': '192.0.2.99, 198.51.100.7' } });
  assert.deepEqual(await r.json(), { ip: '198.51.100.7' });
});

test('liveness no consulta SQL; readiness agrupa solicitudes y conserva solo estado genérico', async t => {
  let consultas = 0;
  const app = express(); configurarDisponibilidad(app, async () => { consultas++; throw new Error(urlFicticia + secreto); });
  const base = await escuchar(t, app);
  assert.deepEqual(await (await fetch(base + '/health/live')).json(), { estado: 'ok' });
  assert.equal(consultas, 0);
  const respuestas = await Promise.all(Array.from({ length: 20 }, () => fetch(base + '/health/ready')));
  for (const r of respuestas) { assert.equal(r.status, 503); assert.deepEqual(await r.json(), { estado: 'no_disponible' }); }
  assert.equal(consultas, 1);
});

test('readiness acota espera y no acumula consultas aunque PostgreSQL no conteste', async t => {
  let consultas = 0;
  const app = express(); configurarDisponibilidad(app, () => { consultas++; return new Promise(() => {}); });
  const base = await escuchar(t, app);
  const inicio = Date.now();
  for (let i = 0; i < 2; i++) assert.equal((await fetch(base + '/health/ready')).status, 503);
  assert.ok(Date.now() - inicio < 4500); assert.equal(consultas, 1);
});

test('TLS es explícito y compartido por pool/herramientas; producción nunca acepta disable ni sslmode en URL', () => {
  assert.equal(opcionesTlsPostgres(urlFicticia, {}), false);
  const entorno = { NODE_ENV: 'production' };
  assert.deepEqual(opcionesTlsPostgres(urlFicticia, entorno), { rejectUnauthorized: true, minVersion: 'TLSv1.2' });
  assert.deepEqual(configuracionPostgres('aplicacion', { ...entorno, APP_DATABASE_URL: urlFicticia }).ssl, opcionesTlsPostgres(urlFicticia, entorno));
  assert.throws(() => opcionesTlsPostgres(urlFicticia, { ...entorno, DATABASE_SSL_MODE: 'disable' }), /verify-full/);
  assert.throws(() => opcionesTlsPostgres(urlFicticia, { NODE_ENV: 'prod' }), /NODE_ENV/);
  for (const parametro of ['sslmode=require', 'sslmode=no-verify', 'sslcert=otro', 'host=otro']) {
    assert.throws(() => opcionesTlsPostgres(urlFicticia + '?' + parametro, entorno), /parámetros/);
  }
  assert.throws(() => opcionesTlsPostgres(urlFicticia, { ...entorno, DATABASE_SSL_CA_FILE: 'no-existe.pem' }), /certificado CA/);
});

test('handshake PostgreSQL/TLS real rechaza certificado autofirmado y nombre de servidor incorrecto', async t => {
  const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
  if (process.platform === 'win32' && !existsSync(openssl)) { t.skip('Esta prueba necesita OpenSSL (incluido con Git para Windows).'); return; }
  const carpeta = mkdtempSync(join(tmpdir(), 'psique-tls-'));
  const clave = join(carpeta, 'ficticia.key'); const certificado = join(carpeta, 'ficticio.pem');
  const sockets = new Set();
  let servidor;
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    if (servidor) await new Promise(resolve => servidor.close(resolve));
    rmSync(carpeta, { recursive: true });
  });
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', clave, '-out', certificado,
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-days', '1'], { stdio: 'ignore', windowsHide: true });
  const contexto = createSecureContext({ key: readFileSync(clave), cert: readFileSync(certificado) });
  servidor = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.once('data', datos => {
      assert.equal(datos.readInt32BE(4), 80877103); // SSLRequest del protocolo PostgreSQL.
      socket.write('S');
      const seguro = new TLSSocket(socket, { isServer: true, secureContext: contexto });
      sockets.add(seguro); seguro.on('close', () => sockets.delete(seguro)); seguro.on('error', () => {});
    });
  }).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const url = `postgresql://psique_test:ficticia@127.0.0.1:${servidor.address().port}/psique_test`;
  for (const [adicional, codigo] of [[{}, 'DEPTH_ZERO_SELF_SIGNED_CERT'], [{ DATABASE_SSL_CA_FILE: certificado }, 'ERR_TLS_CERT_ALTNAME_INVALID']]) {
    const cliente = new pg.Client({ connectionString: url, ssl: opcionesTlsPostgres(url, { NODE_ENV: 'production', ...adicional }), connectionTimeoutMillis: 1500 });
    try { await assert.rejects(cliente.connect(), error => error.code === codigo); }
    finally { await cliente.end(); }
  }
});

test('logs de arranque fallido no imprimen URL, password, JWT ni detalles del driver', async () => {
  const hijo = spawn(process.execPath, [resolve('dist/server.js')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production', PORT: '10000', FRONTEND_ORIGIN: remoto, JWT_SECRET: secreto,
      DATABASE_URL: 'postgresql://psique_app:secreto-de-prueba@127.0.0.1:1/psique' } });
  let salida = ''; hijo.stdout.on('data', d => { salida += d; }); hijo.stderr.on('data', d => { salida += d; });
  const [codigo] = await once(hijo, 'exit'); assert.equal(codigo, 1);
  assert.match(salida, /No se pudo iniciar/);
  for (const dato of ['secreto-de-prueba', 'postgresql://', secreto, 'ECONNREFUSED']) assert.ok(!salida.includes(dato));
});

test('arranque local y health consultan PostgreSQL de pruebas; un pool cerrado devuelve 503', async t => {
  // Esta excepción solo existe como parámetro de la función importada, nunca en npm start.
  const reserva = createServer().listen(0, '127.0.0.1'); await once(reserva, 'listening');
  const PORT = String(reserva.address().port); await new Promise(resolve => reserva.close(resolve));
  // En modo production TLS es obligatorio: esta prueba de escucha utiliza development.
  const instancia = await iniciarServidorPostgres({ pruebas: true, entorno: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    JWT_SECRET: secreto, PORT, NODE_ENV: 'development' } });
  let detenida = false;
  t.after(async () => { if (!detenida) await instancia.detener(); });
  assert.equal(instancia.servidor.address().address, '127.0.0.1');
  const base = `http://127.0.0.1:${PORT}`;
  assert.equal((await fetch(base + '/health/ready')).status, 200);
  await instancia.detener(); detenida = true;
  // Se crea una app nueva para que no intervenga la caché positiva de 5 s.
  const app = crearAppPostgres(instancia.pool, remoto, () => new Date(), secreto);
  const aislada = await escuchar(t, app);
  assert.equal((await fetch(aislada + '/health/ready')).status, 503);
  assert.equal((await fetch(aislada + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ficticio@example.test', password: 'ficticia' }) })).status, 503);
  // Un certificado vencido o inválido al reconectar es indisponibilidad, nunca
  // una autenticación incorrecta ni motivo para aceptar una conexión insegura.
  for (const code of ['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    const poolTls = { query: async () => { throw Object.assign(new Error(urlFicticia), { code }); } };
    const appTls = crearAppPostgres(poolTls, remoto, () => new Date(), secreto);
    const baseTls = await escuchar(t, appTls);
    const respuesta = await fetch(baseTls + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ficticio@example.test', password: 'ficticia' }) });
    assert.equal(respuesta.status, 503);
    assert.deepEqual(await respuesta.json(), { mensaje: 'El servicio de autenticación no está disponible. Intentá nuevamente.' });
  }
});

test('escucha de producción en 0.0.0.0 usa PORT; conexión simulada sin infraestructura remota', async t => {
  const reserva = createServer().listen(0, '127.0.0.1'); await once(reserva, 'listening');
  const PORT = String(reserva.address().port); await new Promise(resolve => reserva.close(resolve));
  t.mock.method(pg.Pool.prototype, 'query', async sql => ({ rows: sql.includes('current_database()')
    ? [{ base: 'psique_test', rol: 'psique_test', rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false }] : [] }));
  const instancia = await iniciarServidorPostgres({ pruebas: true, entorno: { TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
    JWT_SECRET: secreto, PORT, NODE_ENV: 'production', FRONTEND_ORIGIN: remoto } });
  t.after(() => instancia.detener());
  assert.equal(instancia.servidor.address().address, '0.0.0.0');
  assert.equal(instancia.servidor.address().port, Number(PORT));
  assert.equal((await fetch(`http://127.0.0.1:${PORT}/health/live`)).status, 200);
});
