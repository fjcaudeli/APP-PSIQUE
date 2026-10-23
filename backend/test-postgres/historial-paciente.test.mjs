import test from 'node:test';
import assert from 'node:assert/strict';
import { entornoApi, ficha, editable } from './api-fixtures.mjs';

test('histórico del paciente reúne solo realizadas de todas las fechas sin modificar datos ni mezclar cuentas', async t => {
  const e = await entornoApi(t);
  const pedir = async (cuenta, ruta, metodo = 'GET', datos, status = 200) => {
    const r = await e.pedir(cuenta, ruta, metodo, datos);
    assert.equal(r.status, status, `${metodo} ${ruta}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  for (const [cuenta, codigo] of [[0, 'P-A'], [0, 'P-B'], [0, 'SIN-SESIONES'], [1, 'P-A'], [1, 'SOLO-AJENO']]) {
    await pedir(cuenta, 'pacientes', 'POST', { paciente: { ...ficha(codigo), postIt: 'Nota para la próxima sesión' } }, 201);
  }
  const reservar = (codigoPaciente, horario = '10:00', fecha = '2026-10-05', cuenta = 0) => pedir(cuenta, 'sesiones', 'POST', {
    codigoPaciente, fecha, horario, modalidad: 'Virtual', duracionMinutos: 60, importeCentavos: 3000000,
  }, 201);
  async function historica(codigo, fecha, horario, cuenta = 0, cambios = {}) {
    const creada = await reservar(codigo, '10:00', '2026-10-05', cuenta);
    return pedir(cuenta, `sesiones/${creada.id}`, 'PUT', {
      ...editable(creada), fecha, horario, estado: 'Realizada', ...cambios,
    });
  }
  const antigua = await historica('P-A', '2025-12-20', '10:00');
  const septiembre = await historica('P-A', '2026-09-12', '10:00', 0, { duracionMinutos: 40 });
  const reciente = await historica('P-A', '2026-10-02', '10:00');
  const ultima = await historica('P-A', '2026-10-02', '16:00', 0, { resumen: 'Resumen de prueba', pagadoCentavos: 1000000 });
  const sinConfirmar = await historica('P-A', '2026-09-11', '12:00', 0, { estado: 'Programada' });
  await historica('P-B', '2026-10-02', '18:00');
  const ajena = await historica('P-A', '2026-10-02', '16:00', 1);
  const cancelada = await reservar('P-A');
  await pedir(0, `sesiones/${cancelada.id}/cancelar`, 'POST', {});
  const futura = await reservar('P-A', '14:00', '2026-10-06');

  assert.equal((await e.raw('pacientes/P-A/sesiones')).status, 401);
  for (const codigo of ['INEXISTENTE', 'SOLO-AJENO']) await pedir(0, `pacientes/${codigo}/sesiones`, 'GET', undefined, 404);
  await pedir(0, 'pacientes/P-A/sesiones?usuarioId=2', 'GET', undefined, 400);
  assert.deepEqual(await pedir(0, 'pacientes/SIN-SESIONES/sesiones'), []);
  const antes = await e.snapshot();
  const historial = await pedir(0, 'pacientes/P-A/sesiones');
  assert.deepEqual(historial, [ultima, reciente, septiembre, antigua]);
  assert.equal(historial[0].pendienteCentavos, 2000000);
  assert.equal(historial[0].resumen, 'Resumen de prueba');
  assert.equal(historial[2].horarioFin, '10:40');
  assert.equal(historial.some(s => [sinConfirmar.id, cancelada.id, futura.id].includes(s.id)), false);
  assert.ok(historial.every(s => !('postIt' in s)), 'El histórico no incorpora el Post-it vigente');
  assert.deepEqual(await pedir(1, 'pacientes/P-A/sesiones'), [ajena]);
  assert.deepEqual(await e.snapshot(), antes, 'Consultar el histórico no crea ni modifica registros');
  await pedir(0, `sesiones/${ultima.id}`, 'PUT', { ...editable(ultima), codigoPaciente: 'P-B' }, 409);
  assert.deepEqual(await e.snapshot(), antes);

  await pedir(0, 'pacientes/P-A', 'PUT', { estado: 'Suspendido' });
  assert.deepEqual(await pedir(0, 'pacientes/P-A/sesiones'), historial);
  await pedir(0, 'pacientes/P-A/baja', 'POST', {});
  await e.reabrir();
  assert.deepEqual(await pedir(0, 'pacientes/P-A/sesiones'), historial, 'El histórico se conserva para pacientes de baja y después de reiniciar');
});

test('histórico del paciente conserva errores 500 y 503 sin detalles privados', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  assert.equal((await e.pedir(0, 'pacientes', 'POST', { paciente: ficha('P-A') })).status, 201);
  const cliente = await e.pool.connect(); const original = cliente.query;
  cliente.query = function (sql, ...args) {
    if (typeof sql === 'string' && sql.includes("AND estado = 'Realizada'")) throw Object.assign(new Error('Detalle privado'), { code: 'XX000' });
    return original.call(this, sql, ...args);
  }; cliente.release();
  try {
    const r = await e.pedir(0, 'pacientes/P-A/sesiones');
    assert.equal(r.status, 500); assert.deepEqual(r.body, { mensaje: 'No se pudo completar la operación' });
  } finally { cliente.query = original; }
  await e.pool.end();
  assert.equal((await e.pedir(0, 'pacientes/P-A/sesiones')).status, 503);
});
