import test from 'node:test';
import assert from 'node:assert/strict';
import { entornoApi, ficha } from './api-fixtures.mjs';

// Los contratos anteriores (horarios cargados y múltiples próximas fechas) se
// conservan en historico/. Esta suite comprueba las reglas del servidor actual.
test('edición general conserva identidad, fecha de creación, datos y aislamiento', async t => {
  const e = await entornoApi(t);
  const crear = await e.pedir(0, 'pacientes', 'POST', { paciente: ficha('P-001') });
  assert.equal(crear.status, 201);
  const paciente = crear.body.paciente;
  let r = await e.pedir(0, 'pacientes/P-001', 'PUT', { ...paciente, codigo: 'ALIAS', estado: 'De vacaciones', postIt: 'Nota ficticia' });
  assert.equal(r.status, 200); assert.equal(r.body.codigo, 'ALIAS'); assert.equal(r.body.postIt, 'Nota ficticia');
  assert.equal((await e.pedir(1, 'pacientes/ALIAS')).status, 404);
  r = await e.pedir(0, 'pacientes/ALIAS', 'PUT', { ...r.body, fechaCreacion: '2020-01-01' });
  assert.equal(r.status, 400);
  assert.equal((await e.pedir(0, 'pacientes/ALIAS')).body.fechaCreacion, paciente.fechaCreacion);
});

test('conexión caída conserva errores 503; SQL inesperado devuelve 500 sin detalles', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  const c = await e.pool.connect(); const original = c.query;
  c.query = function (sql, ...args) {
    if (typeof sql === 'string' && sql.includes('SELECT DISTINCT ON')) { const error = new Error('detalle privado'); error.code = 'XX000'; throw error; }
    return original.call(this, sql, ...args);
  }; c.release();
  try {
    const r = await e.pedir(0, 'pacientes/pendientes-agendar');
    assert.equal(r.status, 500); assert.deepEqual(r.body, { mensaje: 'No se pudo completar la operación' });
  } finally { c.query = original; }
  await e.pool.end();
  assert.equal((await e.pedir(0, 'calendario')).status, 503);
});
