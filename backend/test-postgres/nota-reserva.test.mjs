import test from 'node:test';
import assert from 'node:assert/strict';
import { entornoApi, ficha, editable } from './api-fixtures.mjs';

test('Nota al agendar: persistencia, omisión, borrado, límites, conflictos y aislamiento', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  const pedir = async (cuenta, ruta, metodo = 'GET', datos, estado = 200) => {
    const r = await e.pedir(cuenta, ruta, metodo, datos);
    assert.equal(r.status, estado, `${metodo} ${ruta}: ${JSON.stringify(r.body)}`); return r.body;
  };
  for (const [cuenta, codigo] of [[0, 'P-001'], [0, 'P-002'], [0, 'P-003'], [1, 'P-001']]) {
    await pedir(cuenta, 'pacientes', 'POST', { paciente: { ...ficha(codigo), postIt: 'Nota anterior' } }, 201);
  }
  const reserva = (codigoPaciente, horario, nota = {}) => ({ codigoPaciente, fecha: '2026-10-05', horario,
    duracionMinutos: 60, modalidad: 'Virtual', importeCentavos: 3000000, ...nota });
  const nota = async (cuenta, codigo = 'P-001') => (await pedir(cuenta, `pacientes/${codigo}`)).postIt;
  await pedir(0, 'sesiones', 'POST', reserva('P-001', '10:00', { postIt: '  Retomar objetivo\nSegunda línea  ' }), 201);
  assert.equal(await nota(0), 'Retomar objetivo\nSegunda línea'); assert.equal(await nota(1), 'Nota anterior');
  await pedir(0, 'sesiones', 'POST', reserva('P-001', '11:00'), 201);
  assert.equal(await nota(0), 'Retomar objetivo\nSegunda línea');
  const antes = await e.snapshot();
  await pedir(0, 'sesiones', 'POST', reserva('P-002', '10:30', { postIt: 'No se debe guardar' }), 409);
  for (const valor of [null, 123, {}, 'x'.repeat(301)]) {
    await pedir(0, 'sesiones', 'POST', reserva('P-002', '12:00', { postIt: valor }), 400);
  }
  await pedir(0, 'sesiones', 'POST', reserva('P-002', '12:00', { postIt: '', usuarioId: e.ids[1] }), 400);
  assert.deepEqual(await e.snapshot(), antes);
  await pedir(0, 'sesiones', 'POST', reserva('P-002', '12:00', { postIt: '   ' }), 201);
  assert.equal(await nota(0, 'P-002'), '');
  await pedir(1, 'sesiones', 'POST', reserva('P-001', '10:00', { postIt: 'x'.repeat(300) }), 201);
  assert.equal((await nota(1)).length, 300); assert.equal(await nota(0), 'Retomar objetivo\nSegunda línea');

  // Fallar después del INSERT demuestra que la reserva y la Nota se revierten juntas.
  const antesFallo = await e.snapshot();
  const cliente = await e.pool.connect(); const original = cliente.query;
  cliente.query = function(sql, ...args) {
    if (typeof sql === 'string' && sql.includes('SET "postIt" =')) throw Object.assign(new Error('Fallo SQL simulado'), { code: 'XX000' });
    return original.call(this, sql, ...args);
  }; cliente.release();
  try { await pedir(0, 'sesiones', 'POST', reserva('P-003', '14:00', { postIt: 'No confirmar' }), 500); }
  finally { cliente.query = original; }
  assert.deepEqual(await e.snapshot(), antesFallo);
  await e.reabrir();
  const proximas = (await pedir(0, 'sesiones/agendadas')).filter(s => s.esProxima);
  assert.deepEqual(proximas.map(s => [s.codigoPaciente, s.postIt]), [['P-001', 'Retomar objetivo\nSegunda línea'], ['P-002', '']]);
});

test('editar Nota desde la próxima sesión es atómico, privado y no modifica notas desde otros bloques o el histórico', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  const pedir = async (cuenta, ruta, metodo = 'GET', datos, estado = 200) => {
    const r = await e.pedir(cuenta, ruta, metodo, datos); assert.equal(r.status, estado, JSON.stringify(r.body)); return r.body;
  };
  for (const cuenta of [0, 1]) await pedir(cuenta, 'pacientes', 'POST', { paciente: { ...ficha('P-001'), postIt: 'Nota anterior' } }, 201);
  const reserva = horario => ({ codigoPaciente: 'P-001', fecha: '2026-10-05', horario, duracionMinutos: 60, modalidad: 'Virtual', importeCentavos: 3000000 });
  const primera = await pedir(0, 'sesiones', 'POST', reserva('10:00'), 201);
  const segunda = await pedir(0, 'sesiones', 'POST', reserva('11:00'), 201);
  const editar = (sesion, datos, estado = 200, cuenta = 0) => pedir(cuenta, `sesiones/${sesion.id}`, 'PUT', { ...editable(sesion), ...datos }, estado);
  const nota = async cuenta => (await pedir(cuenta, 'pacientes/P-001')).postIt;
  await editar(primera, { postIt: '  Nueva Nota\nSegunda línea  ' });
  assert.equal(await nota(0), 'Nueva Nota\nSegunda línea'); assert.equal(await nota(1), 'Nota anterior');
  const antes = await e.snapshot();
  await editar(segunda, { postIt: 'No es la próxima' }, 409);
  await editar(primera, { horario: '12:00', postIt: 'No trasladar al segundo bloque' }, 409);
  await editar(primera, { postIt: 'Ajena' }, 404, 1);
  for (const postIt of [null, 42, 'x'.repeat(301)]) await editar(primera, { postIt }, 400);
  assert.deepEqual(await e.snapshot(), antes);

  const cliente = await e.pool.connect(); const original = cliente.query;
  cliente.query = function(sql, ...args) {
    if (typeof sql === 'string' && sql.includes('SET "postIt" =')) throw Object.assign(new Error('Fallo simulado'), { code: 'XX000' });
    return original.call(this, sql, ...args);
  }; cliente.release();
  try { await editar(primera, { resumen: 'No confirmar', pagadoCentavos: 1000000, postIt: 'No guardar' }, 500); }
  finally { cliente.query = original; }
  assert.deepEqual(await e.snapshot(), antes);
  await editar(primera, {}); assert.equal(await nota(0), 'Nueva Nota\nSegunda línea');
  await editar(primera, { postIt: '' }); assert.equal(await nota(0), '');
  await editar(primera, { postIt: 'x'.repeat(300) });
  await e.reabrir(); assert.equal((await nota(0)).length, 300);
  e.avanzar('2026-10-05T14:00:00Z');
  await editar(primera, { postIt: 'No desde una sesión terminada' }, 409);
  const realizada = await pedir(0, `sesiones/${primera.id}/realizar`, 'POST', {});
  await editar(realizada, { postIt: 'No desde el histórico' }, 409);
  assert.equal((await nota(0)).length, 300);
});
