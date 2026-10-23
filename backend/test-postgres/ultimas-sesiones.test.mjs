import test from 'node:test';
import assert from 'node:assert/strict';
import { entornoApi, ficha, editable } from './api-fixtures.mjs';

test('últimas sesiones elige una realizada por paciente, ordena por fecha y hora y separa profesionales', async t => {
  const e = await entornoApi(t);
  const pedir = async (cuenta, ruta, metodo = 'GET', datos, status = 200) => {
    const r = await e.pedir(cuenta, ruta, metodo, datos);
    assert.equal(r.status, status, `${metodo} ${ruta}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  assert.deepEqual(await pedir(0, 'sesiones/ultimas'), []);
  for (const [cuenta, codigo] of [[0, 'P-A'], [0, 'P-B'], [0, 'ANTIGUO'], [0, 'SIN-SESIONES'], [1, 'P-A']]) {
    await pedir(cuenta, 'pacientes', 'POST', { paciente: { ...ficha(codigo), postIt: 'Nota de próxima sesión' } }, 201);
  }
  const reservar = (codigoPaciente, cuenta = 0) => pedir(cuenta, 'sesiones', 'POST', {
    codigoPaciente, fecha: '2026-10-05', horario: '10:00', modalidad: 'Virtual',
    duracionMinutos: 60, importeCentavos: 3000000,
  }, 201);
  async function historica(codigo, fecha, horario, cuenta = 0, cambios = {}) {
    const creada = await reservar(codigo, cuenta);
    return pedir(cuenta, `sesiones/${creada.id}`, 'PUT', {
      ...editable(creada), fecha, horario, estado: 'Realizada', ...cambios,
    });
  }
  const anterior = await historica('P-A', '2026-10-02', '10:00');
  const ultimaA = await historica('P-A', '2026-10-02', '16:00', 0, { resumen: 'Resumen breve', pagadoCentavos: 1000000 });
  // Se inserta después una fecha anterior: el orden no depende del id.
  await historica('P-A', '2026-09-12', '12:00');
  const sinConfirmar = await historica('P-A', '2026-10-03', '12:00', 0, { estado: 'Programada' });
  const ultimaB = await historica('P-B', '2026-10-02', '18:00', 0, { pagadoCentavos: 3000000 });
  const antigua = await historica('ANTIGUO', '2025-12-20', '10:00', 0, { duracionMinutos: 40 });
  const ajena = await historica('P-A', '2026-10-03', '16:00', 1);
  const cancelada = await reservar('P-A');
  await pedir(0, `sesiones/${cancelada.id}/cancelar`, 'POST', {});
  const futura = await reservar('P-A');

  assert.equal((await e.raw('sesiones/ultimas')).status, 401);
  for (const filtro of ['usuarioId=2', 'fecha=2026-10-02', 'codigoPaciente=P-A']) {
    await pedir(0, `sesiones/ultimas?${filtro}`, 'GET', undefined, 400);
  }
  const antes = await e.snapshot();
  const listado = await pedir(0, 'sesiones/ultimas');
  assert.deepEqual(listado, [ultimaB, ultimaA, antigua]);
  assert.equal(listado[0].pendienteCentavos, 0);
  assert.equal(listado[1].pendienteCentavos, 2000000); assert.equal(listado[1].resumen, 'Resumen breve');
  assert.equal(listado[2].horarioFin, '10:40');
  assert.equal(listado.some(s => [sinConfirmar.id, cancelada.id, futura.id, ajena.id].includes(s.id)), false);
  assert.ok(listado.every(s => !('postIt' in s)), 'La Nota de próxima sesión no pertenece al histórico');
  assert.deepEqual(await pedir(1, 'sesiones/ultimas'), [ajena]);
  assert.deepEqual(await e.snapshot(), antes, 'La consulta no modifica registros');

  await pedir(0, 'pacientes/ANTIGUO', 'PUT', { estado: 'Suspendido' });
  await pedir(0, 'pacientes/ANTIGUO/baja', 'POST', {});
  await e.reabrir();
  assert.deepEqual(await pedir(0, 'sesiones/ultimas'), listado, 'Incluye pacientes no activos y persiste al reiniciar');
  const saldada = await pedir(0, `sesiones/${ultimaA.id}`, 'PUT', { ...editable(ultimaA), pagadoCentavos: 3000000 });
  assert.deepEqual(await pedir(0, 'sesiones/ultimas'), [ultimaB, saldada, antigua]);
  await pedir(0, `sesiones/${ultimaA.id}`, 'PUT', { ...editable(saldada), estado: 'Programada' });
  assert.deepEqual(await pedir(0, 'sesiones/ultimas'), [ultimaB, anterior, antigua], 'Al corregir la asistencia se elige la realizada anterior');
});

test('últimas sesiones conserva errores 500 y 503 sin revelar detalles privados', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  const cliente = await e.pool.connect(); const original = cliente.query;
  cliente.query = function (sql, ...args) {
    if (typeof sql === 'string' && sql.includes('WITH ultimas AS')) throw Object.assign(new Error('Detalle privado'), { code: 'XX000' });
    return original.call(this, sql, ...args);
  }; cliente.release();
  try {
    const r = await e.pedir(0, 'sesiones/ultimas');
    assert.equal(r.status, 500); assert.deepEqual(r.body, { mensaje: 'No se pudo completar la operación' });
  } finally { cliente.query = original; }
  await e.pool.end();
  assert.equal((await e.pedir(0, 'sesiones/ultimas')).status, 503);
});
