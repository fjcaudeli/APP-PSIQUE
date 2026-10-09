import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { crearApp } from '../dist/app.js';
import { abrirBaseDeDatos } from '../dist/db/database.js';
import { nombreDia } from '../dist/calendario.js';
import { abrirFixtureLegacy } from './fixtures.mjs';

const editable = ({ id: _id, pendienteCentavos: _pendiente, ...datos }) => datos;

async function entorno(t, fecha = '2026-10-05T15:00:00Z') {
  const carpeta = mkdtempSync(join(tmpdir(), 'psique-editar-sesion-'));
  const ruta = join(carpeta, 'prueba.sqlite');
  const db = abrirFixtureLegacy(ruta);
  let ahora = new Date(fecha);
  const servidor = crearApp(db, 'http://127.0.0.1:4200', () => ahora).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  t.after(async () => {
    await new Promise(resolve => servidor.close(resolve));
    db.close();
    for (const archivo of readdirSync(carpeta)) unlinkSync(join(carpeta, archivo));
    rmdirSync(carpeta);
  });
  async function pedir(recurso, method = 'GET', body) {
    const respuesta = await fetch(`${base}/${recurso}`, {
      method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: respuesta.status, body: await respuesta.json() };
  }
  const consultar = async recurso => (await pedir(recurso)).body;
  const guardar = async (id, cambios) => pedir(`sesiones/${id}`, 'PUT', { ...editable(await consultar(`sesiones/${id}`)), ...cambios });
  const snapshot = () => Object.fromEntries(['pacientes', 'turnos', 'dias_agenda', 'semana_agenda', 'sesiones']
    .map(tabla => [tabla, db.prepare(`SELECT * FROM ${tabla} ORDER BY rowid`).all()]));
  return { db, ruta, pedir, consultar, guardar, snapshot, avanzar: valor => { ahora = new Date(valor); } };
}

test('Edición completa de sesiones y sincronización con la agenda', async t => {
  await t.test('edita una sesión migrada, mantiene su ID y libera el turno anterior al cambiar fecha y paciente', async t => {
    const e = await entorno(t);
    const original = await e.consultar('sesiones/1');
    const otra = await e.consultar('sesiones/2');
    const pacienteAntes = await e.consultar('pacientes/P-002');
    const cambios = { fecha: '2026-10-06', horario: '16:30', codigoPaciente: 'P-002', modalidad: 'Virtual',
      estado: 'Programada', importeCentavos: 350050, pagadoCentavos: 120025 };
    const respuesta = await e.guardar(1, cambios);
    assert.equal(respuesta.status, 200);
    assert.deepEqual(respuesta.body, { id: 1, ...cambios, pendienteCentavos: 230025 });
    assert.deepEqual(await e.consultar(`horarios/${original.fecha}/${original.horario}`), {
      fecha: original.fecha, horario: original.horario, estado: 'Liberado', codigoPaciente: null, modalidad: null, sesionId: null,
    });
    assert.deepEqual(await e.consultar('horarios/2026-10-06/16:30'), {
      fecha: '2026-10-06', horario: '16:30', estado: 'Programado', codigoPaciente: 'P-002', modalidad: 'Virtual', sesionId: 1,
    });
    assert.equal((await e.consultar('pacientes/P-001')).proximaSesion, null);
    assert.deepEqual(await e.consultar('pacientes/P-002'), { ...pacienteAntes, proximaSesion: 'MAR 16:30 HS' });
    assert.deepEqual(await e.consultar('sesiones/2'), otra);
    assert.equal((await e.consultar('agenda?fecha=2026-10-06')).dias[1].turnos[0].sesionId, 1);
    const otraConexion = abrirBaseDeDatos(e.ruta);
    try {
      assert.deepEqual(otraConexion.prepare('SELECT * FROM sesiones WHERE id = 1').get(), { id: 1, ...cambios });
      assert.deepEqual(otraConexion.pragma('foreign_key_check'), []);
    } finally { otraConexion.close(); }
  });

  await t.test('editar paciente y modalidad sin mover la sesión también actualiza el turno', async t => {
    const e = await entorno(t);
    const respuesta = await e.guardar(1, { codigoPaciente: 'P-002', modalidad: 'Virtual', estado: 'Realizada', importeCentavos: 100000, pagadoCentavos: 20000 });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.body.id, 1);
    assert.equal(respuesta.body.pendienteCentavos, 80000);
    const turno = await e.consultar('horarios/2026-09-07/15:00');
    assert.equal(turno.codigoPaciente, 'P-002');
    assert.equal(turno.modalidad, 'Virtual');
    assert.equal(turno.sesionId, 1);
    assert.equal((await e.consultar('sesiones/pendientes'))[0].id, 1);
  });

  await t.test('asigna horarios disponibles y liberados, sin duplicar sesiones ni turnos', async t => {
    const e = await entorno(t);
    assert.equal((await e.pedir('horarios', 'POST', { fecha: '2026-10-06', horario: '10:00' })).status, 201);
    assert.equal((await e.guardar(1, { fecha: '2026-10-06', horario: '10:00' })).status, 200);
    assert.equal((await e.guardar(1, { fecha: '2026-10-07', horario: '10:00' })).status, 200);
    assert.equal((await e.consultar('horarios/2026-10-06/10:00')).estado, 'Liberado');
    assert.equal((await e.guardar(2, { fecha: '2026-10-06', horario: '10:00' })).status, 200);
    assert.equal((await e.consultar('horarios/2026-10-06/10:00')).sesionId, 2);
    assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM sesiones').get().n, 2);
    assert.deepEqual(e.db.pragma('foreign_key_check'), []);
  });

  await t.test('un destino ocupado devuelve 409 sin alterar paciente, cobros, turnos ni sesión ajena', async t => {
    const e = await entorno(t);
    const anterior = e.snapshot();
    const respuesta = await e.guardar(1, { fecha: '2026-09-09', horario: '10:30', codigoPaciente: 'P-002',
      estado: 'Realizada', importeCentavos: 900000, pagadoCentavos: 300000 });
    assert.equal(respuesta.status, 409);
    assert.deepEqual(e.snapshot(), anterior);
  });

  await t.test('dos reprogramaciones simultáneas a un horario nuevo producen un ganador', async t => {
    const e = await entorno(t);
    const respuestas = await Promise.all([e.guardar(1, { fecha: '2026-10-08', horario: '17:00' }),
      e.guardar(2, { fecha: '2026-10-08', horario: '17:00' })]);
    assert.deepEqual(respuestas.map(r => r.status).sort(), [200, 409]);
    const ganador = respuestas.find(r => r.status === 200).body.id;
    assert.equal((await e.consultar('horarios/2026-10-08/17:00')).sesionId, ganador);
    const perdedor = ganador === 1 ? 2 : 1;
    assert.equal((await e.consultar(`sesiones/${perdedor}`)).fecha, perdedor === 1 ? '2026-09-07' : '2026-09-09');
    assert.deepEqual(e.db.pragma('foreign_key_check'), []);
  });

  await t.test('un fallo al actualizar la sesión revierte incluso el nuevo día y turno', async t => {
    const e = await entorno(t);
    const anterior = e.snapshot();
    e.db.exec("CREATE TEMP TRIGGER fallo_sesion BEFORE UPDATE ON sesiones BEGIN SELECT RAISE(ABORT, 'fallo de prueba'); END");
    const respuesta = await e.guardar(1, { fecha: '2026-10-20', horario: '11:00', codigoPaciente: 'P-002', importeCentavos: 55000 });
    assert.equal(respuesta.status, 500);
    assert.deepEqual(respuesta.body, { mensaje: 'No se pudo completar la operación' });
    assert.deepEqual(e.snapshot(), anterior);
    assert.deepEqual(e.db.pragma('foreign_key_check'), []);
  });

  await t.test('correcciones de fecha pasada y estado actualizan el histórico y los pendientes', async t => {
    const e = await entorno(t);
    assert.equal((await e.guardar(1, { fecha: '2026-09-30', horario: '09:30', estado: 'Realizada', importeCentavos: 999999999, pagadoCentavos: 999999998 })).status, 200);
    assert.equal((await e.consultar('sesiones/semana?fecha=2026-09-28')).sesiones[0].id, 1);
    assert.equal((await e.consultar('sesiones/pendientes'))[0].pendienteCentavos, 1);
    assert.equal((await e.guardar(1, { estado: 'Programada' })).status, 200);
    assert.deepEqual((await e.consultar('sesiones/semana?fecha=2026-09-28')).sesiones, []);
    assert.deepEqual(await e.consultar('sesiones/pendientes'), []);
    assert.equal((await e.consultar('sesiones/1')).pagadoCentavos, 999999998);
    assert.equal((await e.guardar(1, { estado: 'Realizada', pagadoCentavos: 999999999 })).status, 200);
    assert.deepEqual(await e.consultar('sesiones/pendientes'), []);
    assert.equal((await e.guardar(1, { importeCentavos: 0, pagadoCentavos: 0 })).status, 200);
  });

  await t.test('recalcula la próxima sesión de ambos pacientes al reasignar y al marcar realizada', async t => {
    const e = await entorno(t);
    assert.equal((await e.guardar(1, { fecha: '2026-10-06', horario: '10:00' })).status, 200);
    assert.equal((await e.guardar(2, { fecha: '2026-10-07', horario: '11:00' })).status, 200);
    assert.equal((await e.consultar('pacientes/P-001')).proximaSesion, 'MAR 10:00 HS');
    assert.equal((await e.consultar('pacientes/P-002')).proximaSesion, 'MIÉ 11:00 HS');
    assert.equal((await e.guardar(1, { codigoPaciente: 'P-002' })).status, 200);
    assert.equal((await e.consultar('pacientes/P-001')).proximaSesion, null);
    assert.equal((await e.consultar('pacientes/P-002')).proximaSesion, 'MAR 10:00 HS');
    e.avanzar('2026-10-06T13:01:00Z');
    assert.equal((await e.pedir('sesiones/1/realizar', 'POST')).status, 200);
    assert.equal((await e.consultar('pacientes/P-002')).proximaSesion, 'MIÉ 11:00 HS');
    e.avanzar('2026-10-07T14:00:00Z');
    assert.equal((await e.guardar(2, { estado: 'Realizada' })).status, 200);
    assert.equal((await e.consultar('pacientes/P-002')).proximaSesion, null);
  });

  await t.test('rechaza cuerpos incompletos, campos derivados, valores inválidos y pacientes inexistentes sin cambios', async t => {
    const e = await entorno(t);
    const datos = editable(await e.consultar('sesiones/1'));
    const anterior = e.snapshot();
    for (const cambios of [
      { fecha: '2026-02-29' }, { fecha: '0000-01-01' }, { fecha: null }, { fecha: '2026-9-7' },
      { horario: '24:00' }, { horario: '9:30' }, { horario: null }, { codigoPaciente: '' }, { codigoPaciente: 42 },
      { modalidad: 'Mixta' }, { estado: 'Cancelada' }, { estado: null },
      { importeCentavos: -1 }, { importeCentavos: 1000000000 }, { importeCentavos: 0.5 }, { importeCentavos: '100' },
      { pagadoCentavos: -1 }, { pagadoCentavos: 1000000000 }, { pagadoCentavos: 0.5 }, { pagadoCentavos: '100' },
      { importeCentavos: 10, pagadoCentavos: 11 }, { id: 1 }, { pendienteCentavos: 0 },
    ]) {
      assert.equal((await e.pedir('sesiones/1', 'PUT', { ...datos, ...cambios })).status, 400, JSON.stringify(cambios));
      assert.deepEqual(e.snapshot(), anterior);
    }
    for (const campo of Object.keys(datos)) {
      const incompleto = { ...datos };
      delete incompleto[campo];
      assert.equal((await e.pedir('sesiones/1', 'PUT', incompleto)).status, 400, campo);
    }
    for (const body of [null, [], 'sesión', 12]) assert.equal((await e.pedir('sesiones/1', 'PUT', body)).status, 400);
    assert.equal((await e.guardar(1, { codigoPaciente: 'NoExiste' })).status, 404);
    assert.equal((await e.pedir('sesiones/987654321', 'PUT', datos)).status, 404);
    assert.deepEqual(e.snapshot(), anterior);
  });

  await t.test('usa el reloj de Buenos Aires para impedir Realizada futura, incluso cerca de medianoche UTC', async t => {
    const e = await entorno(t, '2026-10-05T01:00:00Z');
    const anterior = e.snapshot();
    assert.equal((await e.guardar(1, { fecha: '2026-10-04', horario: '22:01', estado: 'Realizada' })).status, 400);
    assert.equal((await e.guardar(1, { fecha: '2026-10-05', horario: '00:00', estado: 'Realizada' })).status, 400);
    assert.deepEqual(e.snapshot(), anterior);
    assert.equal((await e.guardar(1, { fecha: '2026-10-04', horario: '22:00', estado: 'Realizada' })).status, 200);
  });
});

test('Consulta de semanas anteriores con fechas de las sesiones y límites de lunes a domingo', async t => {
  const e = await entorno(t, '2027-01-04T15:00:00Z');
  function insertar(fecha, horario, estado = 'Realizada') {
    e.db.prepare('INSERT OR IGNORE INTO dias_agenda (fecha, nombre, semanaId) VALUES (?, ?, 1)').run(fecha, nombreDia(fecha));
    e.db.prepare("INSERT INTO turnos (fecha, horario, codigoPaciente, modalidad, estado) VALUES (?, ?, 'P-001', 'Virtual', 'Programado')").run(fecha, horario);
    e.db.prepare("INSERT INTO sesiones (fecha, horario, codigoPaciente, modalidad, estado, importeCentavos) VALUES (?, ?, 'P-001', 'Virtual', ?, 10000)").run(fecha, horario, estado);
  }
  insertar('2026-12-27', '23:59');
  insertar('2026-12-28', '00:00');
  insertar('2026-12-31', '09:00');
  insertar('2026-12-31', '10:00');
  insertar('2027-01-02', '15:00', 'Programada');
  insertar('2027-01-03', '23:59');
  insertar('2027-01-04', '00:00');
  const historico = await e.consultar('sesiones/semana?fecha=2027-01-01');
  assert.equal(historico.desde, '2026-12-28');
  assert.equal(historico.hasta, '2027-01-03');
  assert.deepEqual(historico.sesiones.map(s => [s.fecha, s.horario]), [
    ['2027-01-03', '23:59'], ['2026-12-31', '10:00'], ['2026-12-31', '09:00'], ['2026-12-28', '00:00'],
  ]);
  for (const fecha of ['2026-12-28', '2027-01-03']) {
    assert.deepEqual(await e.consultar(`sesiones/semana?fecha=${fecha}`), historico);
  }
  assert.deepEqual((await e.consultar('sesiones/semana')).sesiones.map(s => s.fecha), ['2027-01-04']);
  assert.equal((await e.consultar('dashboard')).sesionesSemana, 1);
  assert.equal((await e.consultar('sesiones/pendientes')).length, 6);
  assert.deepEqual((await e.consultar('sesiones/semana?fecha=2026-11-01')).sesiones, []);
  for (const consulta of ['fecha=2026-02-30', 'fecha=0000-01-01', 'fecha=', 'fecha=incorrecta',
    'fecha=2026-12-28&fecha=2027-01-03', 'fecha[]=2026-12-28', 'desde=2026-12-28']) {
    assert.equal((await e.pedir(`sesiones/semana?${consulta}`)).status, 400, consulta);
  }
});
