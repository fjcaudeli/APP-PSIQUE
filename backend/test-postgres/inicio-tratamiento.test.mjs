import test from 'node:test';
import assert from 'node:assert/strict';
import { entornoApi, editable } from './api-fixtures.mjs';

test('inicio del tratamiento automático, aislado y persistente desde la primera realizada', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  const pedir = async (ruta, metodo = 'GET', datos, status = 200, cuenta = 0) => {
    const r = await e.pedir(cuenta, ruta, metodo, datos);
    assert.equal(r.status, status, `${metodo} ${ruta}: ${JSON.stringify(r.body)}`); return r.body;
  };
  const crear = async (codigo, cuenta = 0, extra = {}) => (await pedir('pacientes', 'POST', { paciente: { codigo, modalidad: 'Virtual', motivoConsulta: '', postIt: '', ...extra } }, 201, cuenta)).paciente;
  const reservar = async (codigoPaciente, horario, cuenta = 0) => pedir('sesiones', 'POST', {
    codigoPaciente, fecha: '2026-10-05', horario, duracionMinutos: 60, modalidad: 'Virtual', importeCentavos: 3000000,
  }, 201, cuenta);
  await crear('P-A'); await crear('P-B'); await crear('P-A', 1);
  assert.equal((await crear('ANTERIOR', 0, { fechaInicioTratamiento: '2020-01-01' })).fechaInicioTratamiento, null);
  const primera = await reservar('P-A', '10:00');
  const segunda = await reservar('P-A', '11:00');
  const ajena = await reservar('P-A', '10:00', 1);
  assert.equal((await pedir('pacientes/P-A')).fechaInicioTratamiento, null, 'Programar no confirma atención');
  await pedir('pacientes/P-A', 'PUT', { fechaInicioTratamiento: '2020-01-01' }, 400);
  e.avanzar('2026-10-05T16:00:00Z');

  // Una falla después de marcar asistencia revierte también el inicio del tratamiento.
  const antes = await e.snapshot();
  const c = await e.pool.connect(); const consulta = c.query;
  c.query = function (sql, ...args) {
    if (typeof sql === 'string' && sql.includes('UPDATE public.pacientes p SET "fechaInicioTratamiento"')) {
      const error = new Error('Falla ficticia de integridad'); error.code = 'XX000'; throw error;
    }
    return consulta.call(this, sql, ...args);
  }; c.release();
  try { await pedir(`sesiones/${segunda.id}/realizar`, 'POST', {}, 500); }
  finally { c.query = consulta; }
  assert.deepEqual(await e.snapshot(), antes);

  await pedir(`sesiones/${segunda.id}/realizar`, 'POST', {});
  await pedir(`sesiones/${ajena.id}/realizar`, 'POST', {}, 200, 1);
  assert.equal((await pedir('pacientes/P-A')).fechaInicioTratamiento, '2026-10-05');
  let corregida = await pedir(`sesiones/${primera.id}`, 'PUT', { ...editable(primera), fecha: '2026-10-02', estado: 'Realizada' });
  assert.equal((await pedir('pacientes/P-A')).fechaInicioTratamiento, '2026-10-02');
  assert.equal((await pedir('pacientes/P-A', 'GET', undefined, 200, 1)).fechaInicioTratamiento, '2026-10-05');
  corregida = await pedir(`sesiones/${primera.id}`, 'PUT', { ...editable(corregida), fecha: '2026-10-03' });
  assert.equal((await pedir('pacientes/P-A')).fechaInicioTratamiento, '2026-10-03');
  const antesReasignacion = await e.snapshot();
  await pedir(`sesiones/${primera.id}`, 'PUT', { ...editable(corregida), codigoPaciente: 'P-B' }, 409);
  assert.deepEqual(await e.snapshot(), antesReasignacion);
  assert.equal((await pedir('pacientes/P-A')).fechaInicioTratamiento, '2026-10-03');
  assert.equal((await pedir('pacientes/P-B')).fechaInicioTratamiento, null);
  await pedir(`sesiones/${primera.id}`, 'PUT', { ...editable(corregida), estado: 'Programada' });
  assert.equal((await pedir('pacientes/P-A')).fechaInicioTratamiento, '2026-10-05');
  assert.equal((await pedir('pacientes/P-B')).fechaInicioTratamiento, null);
  await pedir('pacientes/P-A', 'PUT', { codigo: 'ALIAS' });
  await e.reabrir();
  assert.equal((await pedir('pacientes/ALIAS')).fechaInicioTratamiento, '2026-10-05');
  const { rows: [fila] } = await e.pool.query('SELECT to_char("fechaInicioTratamiento", \'YYYY-MM-DD\') AS inicio FROM public.pacientes WHERE "usuarioId"=$1 AND codigo=$2', [e.ids[0], 'ALIAS']);
  assert.equal(fila.inicio, '2026-10-05');
});
