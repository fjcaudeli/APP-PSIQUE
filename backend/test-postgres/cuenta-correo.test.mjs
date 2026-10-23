import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import { entornoApi, ficha } from './api-fixtures.mjs';

const clave = 'Clave ficticia para confirmar 2026';
const nueva = 'Nueva clave ficticia de acceso 2026';
const hash = token => createHash('sha256').update(token).digest('hex');
const usuarioNuevo = e => e.cuentas[0].usuario.email.replace('-a@', '-nuevo@');
const registro = email => ({ email, password: clave, repetirPassword: clave });
const pedir = (e, ruta, datos) => e.raw('auth/' + ruta, { metodo: 'POST', datos });

test('registro pendiente, correo sin datos clínicos, hash del enlace y bloqueo real hasta confirmar', async t => {
  const e = await entornoApi(t);
  const email = usuarioNuevo(e);
  const r = await pedir(e, 'registro', registro(email));
  assert.equal(r.status, 201); assert.equal(r.body.correoEnviado, true); assert.equal(r.body.token, undefined);
  assert.equal((await pedir(e, 'login', { email, password: clave })).status, 403);
  const token = e.buzon.token(email);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const u = (await e.pool.query('SELECT * FROM public.usuarios WHERE id=$1', [r.body.usuario.id])).rows[0];
  assert.equal(u.emailConfirmado, false); assert.equal(u.confirmacionHash, hash(token));
  assert.notEqual(u.confirmacionHash, token); assert.equal(u.confirmacionVence.toISOString(), '2026-10-06T12:00:00.000Z');
  const jwtSinConfirmar = await e.token(0, { sub: String(u.id) });
  assert.equal((await e.raw('pacientes', { bearer: jwtSinConfirmar })).status, 401);
  const mensaje = e.buzon.mensajes.at(-1);
  assert.match(mensaje.texto, /http:\/\/127\.0\.0\.1:4200\/confirmar-email#token=/);
  assert.equal((await pedir(e, 'restablecer', { token, password: nueva, repetirPassword: nueva })).status, 400);
  assert.equal((await pedir(e, 'confirmar-email', { token })).status, 200);
  assert.equal((await pedir(e, 'confirmar-email', { token })).status, 400);
  assert.equal((await pedir(e, 'login', { email, password: clave })).status, 200);
  const despues = (await e.pool.query('SELECT * FROM public.usuarios WHERE id=$1', [u.id])).rows[0];
  assert.equal(despues.emailConfirmado, true); assert.equal(despues.confirmacionHash, null); assert.equal(despues.confirmacionVence, null);
});

test('reenviar espera un minuto, rota el enlace y una confirmación vencida no habilita acceso', async t => {
  const e = await entornoApi(t); const email = usuarioNuevo(e);
  await pedir(e, 'registro', registro(email)); const primero = e.buzon.token(email);
  const cantidad = e.buzon.mensajes.length;
  await pedir(e, 'reenviar-confirmacion', { email }); assert.equal(e.buzon.mensajes.length, cantidad);
  e.avanzar('2026-10-05T12:01:00Z');
  await pedir(e, 'reenviar-confirmacion', { email }); const segundo = e.buzon.token(email);
  assert.notEqual(primero, segundo);
  assert.equal((await pedir(e, 'confirmar-email', { token: primero })).status, 400);
  e.avanzar('2026-10-06T12:01:01Z');
  assert.equal((await pedir(e, 'confirmar-email', { token: segundo })).status, 400);
  assert.equal((await pedir(e, 'login', { email, password: clave })).status, 403);
});

test('recuperación no enumera cuentas, conserva contraseña hasta usar el enlace y revoca todos los JWT anteriores', async t => {
  const e = await entornoApi(t); const email = e.cuentas[0].usuario.email;
  assert.equal((await e.pedir(0, 'pacientes', 'POST', { paciente: ficha('CONSERVAR') })).status, 201);
  const datosAntes = await e.snapshot(); const jwtAnterior = await e.token();
  const inexistente = await pedir(e, 'recuperar', { email: usuarioNuevo(e) });
  const existente = await pedir(e, 'recuperar', { email }); assert.deepEqual(existente, inexistente);
  const token = e.buzon.token(email, false);
  const u = (await e.pool.query('SELECT * FROM public.usuarios WHERE id=$1', [e.ids[0]])).rows[0];
  assert.equal(u.recuperacionHash, hash(token)); assert.equal(u.recuperacionVence.toISOString(), '2026-10-05T12:30:00.000Z');
  assert.equal((await pedir(e, 'login', { email, password: 'Clave ficticia para la API 2026' })).status, 200);
  assert.equal((await pedir(e, 'confirmar-email', { token })).status, 400);
  assert.equal((await pedir(e, 'restablecer', { token, password: nueva, repetirPassword: 'Distinta' })).status, 400);
  assert.equal((await pedir(e, 'restablecer', { token, password: nueva, repetirPassword: nueva })).status, 200);
  assert.equal((await pedir(e, 'restablecer', { token, password: nueva, repetirPassword: nueva })).status, 400);
  assert.equal((await pedir(e, 'login', { email, password: 'Clave ficticia para la API 2026' })).status, 401);
  const acceso = await pedir(e, 'login', { email, password: nueva }); assert.equal(acceso.status, 200);
  assert.equal((await e.raw('pacientes', { bearer: jwtAnterior })).status, 401);
  assert.equal((await e.raw('pacientes', { bearer: acceso.body.token })).status, 200);
  assert.equal((await e.pedir(1, 'pacientes')).status, 200, 'La otra cuenta conserva su sesión');
  assert.deepEqual(await e.snapshot(), datosAntes);
  await e.reabrir();
  assert.equal((await pedir(e, 'login', { email, password: nueva })).status, 200);
  const despues = (await e.pool.query('SELECT * FROM public.usuarios WHERE id=$1', [e.ids[0]])).rows[0];
  assert.equal(despues.versionCredenciales, 1); assert.equal(despues.recuperacionHash, null);
  assert.ok(await argon2.verify(despues.passwordHash, nueva));
});

test('recuperación vencida y tokens inválidos no modifican credenciales; dos usos simultáneos solo confirman uno', async t => {
  const e = await entornoApi(t); const email = e.cuentas[0].usuario.email;
  await pedir(e, 'recuperar', { email }); const vencido = e.buzon.token(email, false);
  e.avanzar('2026-10-05T12:31:00Z');
  assert.equal((await pedir(e, 'restablecer', { token: vencido, password: nueva, repetirPassword: nueva })).status, 400);
  for (const token of ['', 'x', 'a'.repeat(43)]) assert.equal((await pedir(e, 'confirmar-email', { token })).status, 400);
  await pedir(e, 'recuperar', { email }); const token = e.buzon.token(email, false);
  const resultados = await Promise.all([nueva, nueva + ' B'].map(password => pedir(e, 'restablecer', { token, password, repetirPassword: password })));
  assert.deepEqual(resultados.map(r => r.status).sort(), [200, 400]);
  const ganadora = resultados[0].status === 200 ? nueva : nueva + ' B';
  assert.equal((await pedir(e, 'login', { email, password: ganadora })).status, 200);
});

test('cuentas no confirmadas no reciben recuperación y cuentas confirmadas no reciben confirmaciones nuevas', async t => {
  const e = await entornoApi(t); const email = usuarioNuevo(e);
  await pedir(e, 'registro', registro(email)); const cantidad = e.buzon.mensajes.length;
  const pendiente = await pedir(e, 'recuperar', { email });
  assert.deepEqual(pendiente, await pedir(e, 'recuperar', { email: 'inexistente@example.test' }));
  assert.equal(e.buzon.mensajes.length, cantidad);
  await pedir(e, 'reenviar-confirmacion', { email: e.cuentas[0].usuario.email });
  assert.equal(e.buzon.mensajes.length, cantidad);
  for (const datos of [{ email, usuarioId: e.ids[1] }, { email, redirectTo: 'https://otro.example' }, { email: 'inválido' }]) {
    assert.equal((await pedir(e, 'recuperar', datos)).status, 400);
  }
});

test('fallo del correo mantiene registro pendiente y permite reintentar sin fingir envío exitoso', async t => {
  const e = await entornoApi(t); const email = usuarioNuevo(e);
  const enviar = e.buzon.correo.enviar; e.buzon.correo.enviar = async () => { throw new Error('Fallo ficticio'); };
  const r = await pedir(e, 'registro', registro(email));
  assert.equal(r.status, 201); assert.equal(r.body.correoEnviado, false);
  assert.equal((await pedir(e, 'login', { email, password: clave })).status, 403);
  const u = (await e.pool.query('SELECT "confirmacionHash", "confirmacionVence" FROM public.usuarios WHERE id=$1', [r.body.usuario.id])).rows[0];
  assert.deepEqual(u, { confirmacionHash: null, confirmacionVence: null });
  e.buzon.correo.enviar = enviar;
  await pedir(e, 'reenviar-confirmacion', { email });
  assert.equal((await pedir(e, 'confirmar-email', { token: e.buzon.token(email) })).status, 200);
});

test('sin proveedor configurado no se crean cuentas inaccesibles ni se simula enviar correos', async t => {
  const e = await entornoApi(t); e.buzon.correo.habilitado = false;
  const email = usuarioNuevo(e);
  assert.equal((await pedir(e, 'registro', registro(email))).status, 503);
  assert.equal((await pedir(e, 'recuperar', { email })).status, 503);
  assert.equal((await e.pool.query('SELECT id FROM public.usuarios WHERE email=$1', [email])).rowCount, 0);
});

test('pedidos simultáneos envían un solo enlace por cuenta y el límite HTTP rechaza el exceso', async t => {
  const e = await entornoApi(t); const email = e.cuentas[0].usuario.email;
  const cantidad = e.buzon.mensajes.length;
  const respuestas = await Promise.all([1, 2].map(() => pedir(e, 'recuperar', { email })));
  assert.deepEqual(respuestas.map(r => r.status), [200, 200]);
  assert.equal(e.buzon.mensajes.length, cantidad + 1);
  for (let i = 0; i < 3; i++) assert.equal((await pedir(e, 'recuperar', { email })).status, 200);
  assert.equal((await pedir(e, 'recuperar', { email })).status, 429);
});

test('un fallo SQL no consume el enlace ni cambia contraseña o versión y permite reintentar', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  const email = e.cuentas[0].usuario.email;
  await pedir(e, 'recuperar', { email }); const token = e.buzon.token(email, false);
  const antes = (await e.pool.query('SELECT * FROM public.usuarios WHERE id=$1', [e.ids[0]])).rows[0];
  const cliente = await e.pool.connect(); const original = cliente.query;
  cliente.query = function (sql, ...args) {
    if (typeof sql === 'string' && sql.startsWith('UPDATE public.usuarios SET "passwordHash"')) throw Object.assign(new Error('Fallo SQL ficticio'), { code: '23503' });
    return original.call(this, sql, ...args);
  }; cliente.release();
  try { assert.equal((await pedir(e, 'restablecer', { token, password: nueva, repetirPassword: nueva })).status, 500); }
  finally { cliente.query = original; }
  assert.deepEqual((await e.pool.query('SELECT * FROM public.usuarios WHERE id=$1', [e.ids[0]])).rows[0], antes);
  assert.equal((await pedir(e, 'restablecer', { token, password: nueva, repetirPassword: nueva })).status, 200);
});

test('la respuesta pública no espera al proveedor de correo para no revelar cuentas por su demora', async t => {
  const e = await entornoApi(t); const email = e.cuentas[0].usuario.email;
  let completar; let limite;
  const puerta = new Promise(resolve => { completar = resolve; });
  const enviar = e.buzon.correo.enviar;
  e.buzon.correo.enviar = async mensaje => { await puerta; await enviar(mensaje); };
  try {
    const respuesta = await Promise.race([
      pedir(e, 'recuperar', { email }),
      new Promise((_, reject) => { limite = setTimeout(() => reject(new Error('La respuesta quedó esperando al proveedor')), 2000); }),
    ]);
    assert.equal(respuesta.status, 200);
    assert.equal(e.buzon.mensajes.some(m => m.asunto.startsWith('Restablecé')), false);
  } finally { clearTimeout(limite); completar(); }
  await puerta;
});
