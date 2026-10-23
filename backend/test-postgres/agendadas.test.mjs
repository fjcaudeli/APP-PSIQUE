import test from 'node:test';
import assert from 'node:assert/strict';
import { entornoApi, ficha, editable } from './api-fixtures.mjs';

test('sesiones agendadas: orden, filtro, Post-it vigente y separación entre profesionales', async t => {
  const e = await entornoApi(t);
  const pedir = async (cuenta, ruta, metodo = 'GET', datos, status = 200) => {
    const r = await e.pedir(cuenta, ruta, metodo, datos);
    assert.equal(r.status, status, `${metodo} ${ruta}: ${JSON.stringify(r.body)}`);
    return r.body;
  };
  for (const [cuenta, codigo, postIt] of [[0, 'P-001', 'Nota primera cuenta'], [0, 'P-002', ''], [1, 'P-001', 'Nota otra cuenta'], [1, 'SOLO-AJENO', 'Privado']]) {
    await pedir(cuenta, 'pacientes', 'POST', { paciente: { ...ficha(codigo), postIt } }, 201);
  }
  const reserva = (codigoPaciente, fecha, horario, duracionMinutos = 60) => ({ codigoPaciente, fecha, horario, duracionMinutos, modalidad: 'Virtual', importeCentavos: 3000000 });
  const primero = await pedir(0, 'sesiones', 'POST', reserva('P-001', '2026-10-05', '10:00'), 201);
  const segundo = await pedir(0, 'sesiones', 'POST', reserva('P-001', '2026-10-05', '11:00', 30), 201);
  const otro = await pedir(0, 'sesiones', 'POST', reserva('P-002', '2026-10-06', '09:00'), 201);
  const ajeno = await pedir(1, 'sesiones', 'POST', reserva('P-001', '2026-10-05', '10:00'), 201);
  await pedir(0, `sesiones/${primero.id}`, 'PUT', { ...editable(primero), pagadoCentavos: 1000000, resumen: 'Resumen de prueba' });

  assert.equal((await e.raw('sesiones/agendadas')).status, 401);
  for (const consulta of ['usuarioId=1', 'codigoPaciente=', 'codigoPaciente=a&codigoPaciente=b', 'codigoPaciente=' + 'x'.repeat(13)]) {
    await pedir(0, 'sesiones/agendadas?' + consulta, 'GET', undefined, 400);
  }
  for (const codigo of ['INEXISTENTE', 'SOLO-AJENO']) {
    await pedir(0, 'sesiones/agendadas?codigoPaciente=' + codigo, 'GET', undefined, 404);
  }
  const antes = await e.snapshot();
  let listado = await pedir(0, 'sesiones/agendadas');
  assert.deepEqual(listado.map(s => s.id), [primero.id, segundo.id, otro.id]);
  assert.deepEqual(listado.map(s => [s.esProxima, s.postIt]), [[true, 'Nota primera cuenta'], [false, null], [true, '']]);
  assert.equal(listado[0].pendienteCentavos, 2000000);
  assert.equal(listado[0].resumen, 'Resumen de prueba');
  assert.equal(listado[0].horarioFin, '11:00');
  assert.deepEqual((await pedir(0, 'sesiones/agendadas?codigoPaciente=P-001')).map(s => s.id), [primero.id, segundo.id]);
  const listadoAjeno = await pedir(1, 'sesiones/agendadas');
  assert.deepEqual(listadoAjeno.map(s => [s.id, s.postIt]), [[ajeno.id, 'Nota otra cuenta']]);
  assert.deepEqual(await e.snapshot(), antes, 'Consultar no modifica ni copia el Post-it a las sesiones');

  await pedir(0, 'pacientes/P-001', 'PUT', { postIt: 'Nota actualizada' });
  listado = await pedir(0, 'sesiones/agendadas');
  assert.equal(listado[0].postIt, 'Nota actualizada');
  assert.equal(listado[0].resumen, 'Resumen de prueba');
  assert.equal(listado[1].postIt, null);
  e.avanzar('2026-10-05T13:30:00Z'); // 10:30 local: el primer bloque sigue en curso.
  assert.equal((await pedir(0, 'sesiones/agendadas'))[0].id, primero.id);
  e.avanzar('2026-10-05T14:00:00Z'); // 11:00 local: terminó el primero.
  listado = await pedir(0, 'sesiones/agendadas');
  assert.deepEqual(listado.map(s => s.id), [segundo.id, otro.id]);
  assert.equal(listado[0].postIt, 'Nota actualizada');
  await pedir(0, `sesiones/${segundo.id}/realizar`, 'POST', {});
  assert.deepEqual(await pedir(0, 'sesiones/agendadas?codigoPaciente=P-001'), []);
  await pedir(0, `sesiones/${otro.id}/cancelar`, 'POST', {});
  assert.deepEqual(await pedir(0, 'sesiones/agendadas'), []);
});

test('agendadas conserva respuestas seguras ante errores SQL y caída de PostgreSQL', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  const cliente = await e.pool.connect(); const original = cliente.query;
  cliente.query = function (sql, ...args) {
    if (typeof sql === 'string' && sql.includes("estado = 'Programada'")) throw Object.assign(new Error('Detalle privado'), { code: 'XX000' });
    return original.call(this, sql, ...args);
  }; cliente.release();
  try {
    const r = await e.pedir(0, 'sesiones/agendadas');
    assert.equal(r.status, 500); assert.deepEqual(r.body, { mensaje: 'No se pudo completar la operación' });
  } finally { cliente.query = original; }
  await e.pool.end();
  assert.equal((await e.pedir(0, 'sesiones/agendadas')).status, 503);
});
