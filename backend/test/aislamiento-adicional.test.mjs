import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { crearApp } from '../dist/app.js';
import { abrirBaseDeDatos } from '../dist/db/database.js';
import { crearUsuarioFixture, fetchAutenticado, SECRETO_PRUEBA } from './fixtures.mjs';

async function entorno(t) {
  const carpeta = mkdtempSync(join(tmpdir(), 'psique-aislamiento-adicional-'));
  const db = abrirBaseDeDatos(join(carpeta, 'prueba.sqlite'));
  crearUsuarioFixture(db, 1);
  crearUsuarioFixture(db, 2);
  const reloj = () => new Date('2026-10-05T12:00:00Z');
  const servidor = crearApp(db, 'http://127.0.0.1:4200', reloj, SECRETO_PRUEBA).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(async () => {
    await new Promise(resolve => servidor.close(resolve));
    db.close();
    for (const nombre of readdirSync(carpeta)) unlinkSync(join(carpeta, nombre));
    rmdirSync(carpeta);
  });
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  const clientes = { 1: fetchAutenticado(reloj, 1), 2: fetchAutenticado(reloj, 2) };
  async function api(usuarioId, ruta, method = 'GET', datos, status = 200) {
    const respuesta = await clientes[usuarioId](`${base}/${ruta}`, {
      method,
      ...(datos === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) }),
    });
    assert.equal(respuesta.status, status, `${method} ${ruta}, profesional ${usuarioId}`);
    return respuesta.json();
  }
  const snapshot = usuarioId => Object.fromEntries(['pacientes', 'turnos', 'sesiones'].map(tabla => [
    tabla, db.prepare(`SELECT * FROM ${tabla} WHERE usuarioId = ? ORDER BY rowid`).all(usuarioId),
  ]));
  return { db, api, snapshot };
}

function ficha(codigo, postIt = '') {
  return {
    codigo, modalidad: 'Virtual', estado: 'Activo', proximaSesion: null, frecuencia: 'Quincenal',
    diaHabitual: null, horarioHabitual: null, fechaInicioTratamiento: '2026-10-05', motivoConsulta: '', postIt,
  };
}
const horario = hora => ({ fecha: '2026-10-06', horario: hora });
const reserva = hora => ({ ...horario(hora), codigoPaciente: 'COMUN', modalidad: 'Virtual', importeCentavos: 10000 });

test('reprogramar A al horario ocupado de B crea un turno propio y no modifica a B', async t => {
  const e = await entorno(t);
  const sesiones = [];
  for (const [usuarioId, hora] of [[1, '10:00'], [2, '11:00']]) {
    await e.api(usuarioId, 'pacientes', 'POST', { paciente: ficha('COMUN', `Nota del profesional ${usuarioId}`) }, 201);
    await e.api(usuarioId, 'horarios', 'POST', horario(hora), 201);
    sesiones.push(await e.api(usuarioId, 'sesiones', 'POST', reserva(hora), 201));
  }
  const bAntes = e.snapshot(2);
  const { id, pendienteCentavos, ...datosA } = sesiones[0];
  const editada = await e.api(1, `sesiones/${id}`, 'PUT', { ...datosA, horario: '11:00' });

  assert.equal(editada.id, id);
  assert.equal(editada.horario, '11:00');
  assert.equal((await e.api(1, 'horarios/2026-10-06/10:00')).estado, 'Liberado');
  assert.equal((await e.api(1, 'horarios/2026-10-06/11:00')).sesionId, id);
  assert.equal((await e.api(2, 'horarios/2026-10-06/11:00')).sesionId, sesiones[1].id);
  assert.deepEqual(await e.api(2, `sesiones/${sesiones[1].id}`), sesiones[1]);
  assert.deepEqual(e.snapshot(2), bAntes);
  assert.equal(e.db.prepare("SELECT count(*) cantidad FROM turnos WHERE fecha = '2026-10-06' AND horario = '11:00'").get().cantidad, 2);
  assert.deepEqual(e.db.pragma('foreign_key_check'), []);
});

test('alta con reserva en un horario exclusivo de B revierte el nuevo paciente de A', async t => {
  const e = await entorno(t);
  await e.api(2, 'horarios', 'POST', horario('13:00'), 201);
  const aAntes = e.snapshot(1);
  const bAntes = e.snapshot(2);
  const resultado = await e.api(1, 'pacientes', 'POST', {
    paciente: ficha('SIN-RESERVA'),
    turno: { ...horario('13:00'), modalidad: 'Virtual', importeCentavos: 20000 },
  }, 404);

  assert.deepEqual(resultado, { mensaje: 'Horario no encontrado' });
  assert.deepEqual(e.snapshot(1), aAntes);
  assert.deepEqual(e.snapshot(2), bAntes);
  await e.api(1, 'pacientes/SIN-RESERVA', 'GET', undefined, 404);
  assert.equal((await e.api(2, 'horarios/2026-10-06/13:00')).estado, 'Disponible');
  assert.deepEqual(e.db.pragma('foreign_key_check'), []);
});
