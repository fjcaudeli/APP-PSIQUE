import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as argon2 from 'argon2';
import { decodeJwt, SignJWT } from 'jose';
import { crearApp } from '../dist/app.js';
import { validarSecretoJwt } from '../dist/auth.js';
import { abrirBaseDeDatos } from '../dist/db/database.js';

// Credenciales inventadas y secretos aleatorios exclusivos de bases temporales.
// Los tokens y hashes no se escriben en archivos ni se imprimen en los resultados.
const password = 'Clave solo para pruebas 2026';
const fechaInicial = '2026-10-05T15:00:00.000Z';

async function entorno(t) {
  const carpeta = mkdtempSync(join(tmpdir(), 'psique-auth-'));
  const db = abrirBaseDeDatos(join(carpeta, 'temporal.sqlite'));
  const secreto = randomBytes(48).toString('base64url');
  let instante = new Date(fechaInicial);
  const reloj = () => new Date(instante);
  const servidor = crearApp(db, 'http://127.0.0.1:4200', reloj, secreto).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => servidor.close(error => error ? reject(error) : resolve()));
    db.close();
    for (const nombre of readdirSync(carpeta)) unlinkSync(join(carpeta, nombre));
    rmdirSync(carpeta);
  });
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  async function api(ruta, { metodo = 'GET', token, datos } = {}) {
    const respuesta = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(datos !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(datos !== undefined ? { body: JSON.stringify(datos) } : {}),
    });
    return { estado: respuesta.status, cuerpo: await respuesta.json() };
  }
  async function cuenta(email) {
    const registro = await api('/auth/registro', { metodo: 'POST', datos: { email, password, repetirPassword: password } });
    assert.equal(registro.estado, 201);
    const login = await api('/auth/login', { metodo: 'POST', datos: { email, password } });
    assert.equal(login.estado, 200);
    return login.cuerpo;
  }
  async function tokenFirmado(id, cambios = {}, algoritmo = 'HS256', otraClave = secreto) {
    const iat = Math.floor(reloj().getTime() / 1000);
    const payload = { sub: String(id), iss: 'psique', aud: 'psique-app', iat, exp: iat + 3600, ...cambios };
    return new SignJWT(payload).setProtectedHeader({ alg: algoritmo, typ: 'JWT' })
      .sign(new TextEncoder().encode(otraClave));
  }
  return { db, api, cuenta, secreto, tokenFirmado, avanzar: segundos => { instante = new Date(instante.getTime() + segundos * 1000); } };
}

function ficha(codigo) {
  return {
    codigo, modalidad: 'Virtual', estado: 'Activo', proximaSesion: null, frecuencia: 'Quincenal',
    diaHabitual: null, horarioHabitual: null, fechaInicioTratamiento: '2026-10-05', motivoConsulta: '', postIt: '',
  };
}

test('JWT_SECRET es obligatorio y no tiene una clave predeterminada', () => {
  for (const valor of [undefined, '', 'breve', ' '.repeat(40)]) assert.throws(() => validarSecretoJwt(valor), /JWT_SECRET/);
  const secreto = randomBytes(32).toString('hex');
  assert.equal(validarSecretoJwt(secreto), secreto);
});

test('registro normaliza email, guarda Argon2id con sal y devuelve solo datos públicos', async t => {
  const e = await entorno(t);
  const registro = await e.api('/auth/registro', { metodo: 'POST', datos: { email: '  Profesional.A@example.test ', password, repetirPassword: password } });
  assert.equal(registro.estado, 201);
  assert.deepEqual(registro.cuerpo, { usuario: { id: 1, email: 'profesional.a@example.test', fechaCreacion: fechaInicial } });
  const guardado = e.db.prepare('SELECT * FROM usuarios WHERE id = 1').get();
  assert.equal(guardado.passwordHash.startsWith('$argon2id$'), true);
  assert.notEqual(guardado.passwordHash, password);
  assert.equal(await argon2.verify(guardado.passwordHash, password), true);
  await e.cuenta('profesional.b@example.test');
  const segundo = e.db.prepare('SELECT passwordHash FROM usuarios WHERE id = 2').get();
  assert.notEqual(guardado.passwordHash, segundo.passwordHash, 'La misma contraseña recibe una sal distinta.');
  assert.deepEqual(e.db.prepare('SELECT name FROM pragma_table_info(?)').all('usuarios').map(columna => columna.name), ['id', 'email', 'passwordHash', 'fechaCreacion']);
});

test('registro rechaza datos inválidos sin crear usuarios', async t => {
  const e = await entorno(t);
  const valido = { email: 'validacion@example.test', password, repetirPassword: password };
  for (const datos of [
    null, [], {}, { ...valido, email: 'sin-arroba' }, { ...valido, email: 'a@b' },
    { ...valido, email: `${'x'.repeat(245)}@example.test` },
    { ...valido, password: 'corta', repetirPassword: 'corta' },
    { ...valido, password: 'x'.repeat(129), repetirPassword: 'x'.repeat(129) },
    { ...valido, repetirPassword: 'otra contraseña diferente' }, { ...valido, usuarioId: 900 },
  ]) {
    assert.equal((await e.api('/auth/registro', { metodo: 'POST', datos })).estado, 400);
  }
  assert.equal(e.db.prepare('SELECT count(*) cantidad FROM usuarios').get().cantidad, 0);
});

test('email duplicado, incluso con mayúsculas o solicitudes simultáneas, devuelve 409', async t => {
  const e = await entorno(t);
  await e.cuenta('duplicado@example.test');
  const datos = { email: ' DUPLICADO@example.test ', password, repetirPassword: password };
  const duplicado = await e.api('/auth/registro', { metodo: 'POST', datos });
  assert.equal(duplicado.estado, 409);
  assert.deepEqual(duplicado.cuerpo, { mensaje: 'Ya existe una cuenta con ese email.' });
  const simultaneas = await Promise.all([1, 2].map(() => e.api('/auth/registro', {
    metodo: 'POST', datos: { ...datos, email: 'simultaneo@example.test' },
  })));
  assert.deepEqual(simultaneas.map(resultado => resultado.estado).sort(), [201, 409]);
  assert.equal(e.db.prepare('SELECT count(*) cantidad FROM usuarios').get().cantidad, 2);
});

test('login valida contraseña exacta y emite JWT mínimo por una hora', async t => {
  const e = await entorno(t);
  const cuenta = await e.cuenta('login@example.test');
  assert.deepEqual(Object.keys(cuenta).sort(), ['expiraEn', 'token', 'usuario']);
  assert.deepEqual(Object.keys(cuenta.usuario).sort(), ['email', 'fechaCreacion', 'id']);
  assert.equal(cuenta.expiraEn, 3600);
  const claims = decodeJwt(cuenta.token);
  assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'sub']);
  assert.equal(claims.sub, String(cuenta.usuario.id));
  assert.equal(claims.iss, 'psique');
  assert.equal(claims.aud, 'psique-app');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal((await e.api('/dashboard', { token: cuenta.token })).estado, 200);
  const incorrectos = [];
  for (const datos of [
    { email: 'login@example.test', password: 'Contraseña incorrecta' },
    { email: 'inexistente@example.test', password },
    { email: 'login@example.test', password: `${password} ` },
  ]) {
    const resultado = await e.api('/auth/login', { metodo: 'POST', datos });
    assert.equal(resultado.estado, 401);
    incorrectos.push(resultado.cuerpo);
  }
  assert.deepEqual(incorrectos[0], incorrectos[1]);
  assert.deepEqual(incorrectos[1], incorrectos[2]);
  assert.equal((await e.api('/auth/login', { metodo: 'POST', datos: { email: ' LOGIN@example.test ', password } })).estado, 200);
});

test('todos los endpoints privados rechazan solicitudes sin token antes de acceder a los datos', async t => {
  const e = await entorno(t);
  const rutas = [
    ['GET', '/pacientes'], ['GET', '/pacientes/siguiente-codigo'], ['GET', '/pacientes/P-001'],
    ['POST', '/pacientes'], ['PUT', '/pacientes/P-001'], ['GET', '/agenda'], ['GET', '/dashboard'],
    ['GET', '/horarios/disponibles'], ['GET', '/horarios/2026-10-06/14:00'], ['POST', '/horarios'],
    ['GET', '/sesiones/semana'], ['GET', '/sesiones/pendientes'], ['GET', '/sesiones/1'],
    ['POST', '/sesiones'], ['PUT', '/sesiones/1'], ['POST', '/sesiones/1/realizar'],
  ];
  for (const [metodo, ruta] of rutas) {
    const respuesta = await e.api(ruta, { metodo, ...(metodo !== 'GET' ? { datos: {} } : {}) });
    assert.equal(respuesta.estado, 401, `${metodo} ${ruta}`);
    assert.deepEqual(Object.keys(respuesta.cuerpo), ['mensaje']);
  }
});

test('rechaza JWT inválidos, expirados, con otra firma o sin claims requeridos', async t => {
  const e = await entorno(t);
  const cuenta = await e.cuenta('tokens@example.test');
  const iat = Math.floor(new Date(fechaInicial).getTime() / 1000);
  const casos = [
    ['texto inválido', 'esto-no-es-un-token'],
    ['otra firma', await e.tokenFirmado(cuenta.usuario.id, {}, 'HS256', randomBytes(48).toString('hex'))],
    ['otro algoritmo', await e.tokenFirmado(cuenta.usuario.id, {}, 'HS512')],
    ['vencido', await e.tokenFirmado(cuenta.usuario.id, { iat: iat - 3601, exp: iat - 1 })],
    ['emisor incorrecto', await e.tokenFirmado(cuenta.usuario.id, { iss: 'otra-aplicacion' })],
    ['audiencia incorrecta', await e.tokenFirmado(cuenta.usuario.id, { aud: 'otro-cliente' })],
    ['sin expiración', await e.tokenFirmado(cuenta.usuario.id, { exp: undefined })],
    ['sin identidad', await e.tokenFirmado(cuenta.usuario.id, { sub: undefined })],
    ['sin fecha de emisión', await e.tokenFirmado(cuenta.usuario.id, { iat: undefined })],
    ['emitido en el futuro', await e.tokenFirmado(cuenta.usuario.id, { iat: iat + 120 })],
    ['usuario inexistente', await e.tokenFirmado(900)],
    ['id no válido', await e.tokenFirmado('1 OR 1=1')],
  ];
  for (const [nombre, token] of casos) assert.equal((await e.api('/dashboard', { token })).estado, 401, nombre);
  e.avanzar(3600);
  assert.equal((await e.api('/dashboard', { token: cuenta.token })).estado, 401, 'El token real vence exactamente a la hora.');
});

test('un token deja de dar acceso si su usuario ya no existe', async t => {
  const e = await entorno(t);
  const cuenta = await e.cuenta('baja@example.test');
  e.db.prepare('DELETE FROM usuarios WHERE id = ?').run(cuenta.usuario.id);
  assert.equal((await e.api('/pacientes', { token: cuenta.token })).estado, 401);
});

test('dos profesionales conservan pacientes, horarios, sesiones, cobros y dashboard aislados', async t => {
  const e = await entorno(t);
  const a = await e.cuenta('profesional.a@example.test');
  const b = await e.cuenta('profesional.b@example.test');
  async function consultar(cuenta, ruta, metodo = 'GET', datos, esperado = 200) {
    const resultado = await e.api(ruta, { token: cuenta.token, metodo, datos });
    assert.equal(resultado.estado, esperado, `${metodo} ${ruta}`);
    return resultado.cuerpo;
  }
  async function paciente(cuenta, codigo) { return consultar(cuenta, '/pacientes', 'POST', { paciente: ficha(codigo) }, 201); }
  async function horario(cuenta, hora, fecha = '2026-10-06') {
    return consultar(cuenta, '/horarios', 'POST', { fecha, horario: hora }, 201);
  }
  async function sesion(cuenta, codigoPaciente, hora, importeCentavos) {
    await horario(cuenta, hora);
    return consultar(cuenta, '/sesiones', 'POST', { fecha: '2026-10-06', horario: hora, codigoPaciente, modalidad: 'Virtual', importeCentavos }, 201);
  }
  function edicion(sesion, cambios = {}) {
    const { id, pendienteCentavos, ...datos } = sesion;
    return { ...datos, ...cambios };
  }

  await t.test('las altas y sugerencias de código pertenecen al usuario autenticado', async () => {
    await paciente(a, 'SOLO-A');
    await paciente(b, 'SOLO-B');
    await paciente(a, 'P-001');
    assert.deepEqual(await consultar(b, '/pacientes/siguiente-codigo'), { codigo: 'P-001' });
    await paciente(b, 'P-001');
    await paciente(b, 'EXTRA-B');
    assert.deepEqual((await consultar(a, '/pacientes')).map(p => p.codigo), ['P-001', 'SOLO-A']);
    assert.deepEqual((await consultar(b, '/pacientes')).map(p => p.codigo), ['EXTRA-B', 'P-001', 'SOLO-B']);
    const registros = e.db.prepare('SELECT usuarioId, codigo FROM pacientes ORDER BY usuarioId, codigo').all();
    assert.equal(registros.filter(p => p.usuarioId === a.usuario.id).length, 2);
    assert.equal(registros.filter(p => p.usuarioId === b.usuario.id).length, 3);
  });

  await t.test('cambiar URL, cuerpo o query no permite leer ni editar pacientes de otra cuenta', async () => {
    await consultar(a, '/pacientes/SOLO-B', 'GET', undefined, 404);
    await consultar(a, '/pacientes/SOLO-B', 'PUT', ficha('ROBO'), 404);
    await consultar(b, '/pacientes/SOLO-A', 'GET', undefined, 404);
    await consultar(a, '/pacientes', 'POST', { paciente: ficha('INYECTADO'), usuarioId: b.usuario.id }, 400);
    await consultar(a, '/pacientes/P-001', 'PUT', { ...ficha('P-001'), usuarioId: b.usuario.id }, 400);
    const lista = await consultar(a, `/pacientes?usuarioId=${b.usuario.id}`);
    assert.equal(lista.some(p => p.codigo === 'SOLO-B'), false);
    assert.equal((await consultar(b, '/pacientes/SOLO-B')).codigo, 'SOLO-B');
  });

  const sa = await sesion(a, 'P-001', '14:00', 10000);
  const sb = await sesion(b, 'P-001', '14:00', 25000);
  const sbExtra = await sesion(b, 'SOLO-B', '15:00', 35000);
  await horario(a, '16:00');
  await horario(b, '17:00');
  await horario(b, '18:00');

  await t.test('el mismo horario puede existir en dos agendas sin mezclar sus sesiones', async () => {
    assert.notEqual(sa.id, sb.id);
    assert.equal((await consultar(a, '/horarios/2026-10-06/14:00')).sesionId, sa.id);
    assert.equal((await consultar(b, '/horarios/2026-10-06/14:00')).sesionId, sb.id);
    assert.equal((await consultar(a, '/agenda')).dias.flatMap(dia => dia.turnos).length, 2);
    assert.equal((await consultar(b, '/agenda')).dias.flatMap(dia => dia.turnos).length, 4);
    assert.deepEqual((await consultar(a, '/horarios/disponibles')).horarios.map(h => h.horario), ['16:00']);
    assert.deepEqual((await consultar(b, '/horarios/disponibles')).horarios.map(h => h.horario), ['17:00', '18:00']);
    await consultar(a, '/horarios/2026-10-06/17:00', 'GET', undefined, 404);
    await consultar(a, '/horarios', 'POST', { fecha: '2026-10-06', horario: '19:00', usuarioId: b.usuario.id }, 400);
  });

  await t.test('los ID ajenos y las referencias a pacientes u horarios ajenos devuelven 404', async () => {
    await consultar(a, `/sesiones/${sb.id}`, 'GET', undefined, 404);
    await consultar(a, `/sesiones/${sb.id}`, 'PUT', edicion(sb, { importeCentavos: 0 }), 404);
    await consultar(a, `/sesiones/${sb.id}/realizar`, 'POST', {}, 404);
    await consultar(b, `/sesiones/${sa.id}`, 'GET', undefined, 404);
    await consultar(a, `/sesiones/${sa.id}`, 'PUT', edicion(sa, { codigoPaciente: 'SOLO-B' }), 404);
    await consultar(a, '/sesiones', 'POST', { fecha: '2026-10-06', horario: '17:00', codigoPaciente: 'P-001', modalidad: 'Virtual', importeCentavos: 0 }, 404);
    await consultar(a, '/sesiones', 'POST', { fecha: '2026-10-06', horario: '16:00', codigoPaciente: 'SOLO-B', modalidad: 'Virtual', importeCentavos: 0 }, 404);
    assert.equal((await consultar(a, '/horarios/2026-10-06/16:00')).estado, 'Disponible');
    assert.equal((await consultar(b, `/sesiones/${sb.id}`)).importeCentavos, 25000);
  });

  await t.test('renombrar un código compartido actualiza solo las referencias de su profesional', async () => {
    await consultar(a, '/pacientes/P-001', 'PUT', ficha('REN-A'));
    assert.equal((await consultar(a, `/sesiones/${sa.id}`)).codigoPaciente, 'REN-A');
    assert.equal((await consultar(a, '/horarios/2026-10-06/14:00')).codigoPaciente, 'REN-A');
    assert.equal((await consultar(b, `/sesiones/${sb.id}`)).codigoPaciente, 'P-001');
    assert.equal((await consultar(b, '/horarios/2026-10-06/14:00')).codigoPaciente, 'P-001');
  });

  await consultar(a, `/sesiones/${sa.id}`, 'PUT', edicion(sa, { fecha: '2026-10-05', horario: '10:00', codigoPaciente: 'REN-A' }));
  await consultar(a, `/sesiones/${sa.id}/realizar`, 'POST', {});
  await consultar(b, `/sesiones/${sb.id}`, 'PUT', edicion(sb, { fecha: '2026-10-05', horario: '10:00', estado: 'Realizada', pagadoCentavos: 5000 }));
  await consultar(b, `/sesiones/${sbExtra.id}`, 'PUT', edicion(sbExtra, { fecha: '2026-10-05', horario: '11:00', estado: 'Realizada' }));

  await t.test('histórico, pendientes y contadores solo incluyen los datos propios', async () => {
    assert.deepEqual((await consultar(a, '/sesiones/semana')).sesiones.map(s => s.id), [sa.id]);
    assert.deepEqual((await consultar(b, '/sesiones/semana')).sesiones.map(s => s.id), [sbExtra.id, sb.id]);
    assert.deepEqual((await consultar(a, '/sesiones/pendientes')).map(s => s.pendienteCentavos), [10000]);
    assert.deepEqual((await consultar(b, '/sesiones/pendientes')).map(s => s.pendienteCentavos), [20000, 35000]);
    assert.deepEqual(await consultar(a, '/dashboard'), { pacientesActivos: 2, sesionesSemana: 1, pendientesCobro: 1, horariosDisponibles: 2 });
    assert.deepEqual(await consultar(b, '/dashboard'), { pacientesActivos: 3, sesionesSemana: 2, pendientesCobro: 2, horariosDisponibles: 4 });
    await consultar(a, '/dashboard', 'GET', undefined);
    assert.deepEqual(e.db.pragma('foreign_key_check'), []);
  });

  await t.test('alta y reserva atómicas mantienen el propietario también al crear ambos registros', async () => {
    for (const cuenta of [a, b]) {
      await horario(cuenta, '20:00');
      const creada = await consultar(cuenta, '/pacientes', 'POST', {
        paciente: ficha('NUEVO-COMUN'),
        turno: { fecha: '2026-10-06', horario: '20:00', modalidad: 'Presencial', importeCentavos: 12000 },
      }, 201);
      assert.equal(e.db.prepare('SELECT usuarioId FROM sesiones WHERE id = ?').get(creada.sesion.id).usuarioId, cuenta.usuario.id);
      assert.equal(e.db.prepare('SELECT usuarioId FROM pacientes WHERE usuarioId = ? AND codigo = ?').get(cuenta.usuario.id, 'NUEVO-COMUN').usuarioId, cuenta.usuario.id);
      assert.equal(e.db.prepare('SELECT usuarioId FROM turnos WHERE usuarioId = ? AND fecha = ? AND horario = ?').get(cuenta.usuario.id, '2026-10-06', '20:00').usuarioId, cuenta.usuario.id);
    }
  });

  await t.test('SQLite rechaza relaciones entre profesionales incluso fuera de la API', async () => {
    assert.throws(() => e.db.prepare("INSERT INTO turnos (usuarioId, fecha, horario, codigoPaciente, modalidad, estado) VALUES (?, '2026-10-06', '21:00', 'SOLO-B', 'Virtual', 'Programado')")
      .run(a.usuario.id), /FOREIGN KEY/);
    assert.throws(() => e.db.prepare("INSERT INTO sesiones (usuarioId, fecha, horario, codigoPaciente, modalidad) VALUES (?, '2026-10-06', '18:00', 'SOLO-A', 'Virtual')")
      .run(a.usuario.id), /FOREIGN KEY/);
    assert.deepEqual(e.db.pragma('foreign_key_check'), []);
  });
});
