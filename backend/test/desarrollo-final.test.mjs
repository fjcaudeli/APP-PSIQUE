import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { crearApp } from '../dist/app.js';
import { abrirBaseDeDatos, migrarBaseDeDatos } from '../dist/db/database.js';
import { cargarDatosIniciales, PACIENTES_INICIALES } from '../dist/db/seed.js';
import { instanteLocal, semanaDe } from '../dist/calendario.js';

const { codigo: _codigo, fechaCreacion: _fechaCreacion, ...ficha } = PACIENTES_INICIALES[0];
const nuevoPaciente = (codigo) => ({ ...ficha, proximaSesion: null, ...(codigo === undefined ? {} : { codigo }) });

async function entorno(t, fecha = '2026-10-05T12:00:00Z') {
  const carpeta = mkdtempSync(join(tmpdir(), 'psique-final-'));
  const ruta = join(carpeta, 'prueba.sqlite');
  const db = abrirBaseDeDatos(ruta);
  let ahora = new Date(fecha);
  const servidor = crearApp(db, 'http://127.0.0.1:4200', () => ahora).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  const base = `http://127.0.0.1:${servidor.address().port}/api`;
  t.after(async () => {
    await new Promise(resolve => servidor.close(resolve));
    if (db.open) db.close();
    for (const archivo of readdirSync(carpeta)) unlinkSync(join(carpeta, archivo));
    rmdirSync(carpeta);
  });
  async function pedir(recurso, method = 'GET', body) {
    const respuesta = await fetch(`${base}/${recurso}`, {
      method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    return { status: respuesta.status, body: await respuesta.json() };
  }
  return { db, ruta, base, pedir, avanzar: valor => { ahora = new Date(valor); } };
}

test('Migración de archivos anteriores sin pérdida de datos ni carga automática', async t => {
  const e = await entorno(t);
  assert.equal(e.db.pragma('user_version', { simple: true }), 1);
  for (const tabla of ['pacientes', 'turnos', 'dias_agenda', 'semana_agenda', 'dashboard', 'sesiones']) {
    assert.equal(e.db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n, 0);
  }
  cargarDatosIniciales(e.db);
  e.db.exec('DROP TABLE sesiones; PRAGMA user_version = 0;');
  const anteriores = Object.fromEntries(['pacientes', 'turnos', 'dias_agenda', 'semana_agenda', 'dashboard']
    .map(tabla => [tabla, e.db.prepare(`SELECT * FROM ${tabla}`).all()]));
  migrarBaseDeDatos(e.db);
  for (const [tabla, filas] of Object.entries(anteriores)) {
    assert.deepEqual(e.db.prepare(`SELECT * FROM ${tabla}`).all(), filas);
  }
  const sesiones = e.db.prepare('SELECT * FROM sesiones ORDER BY fecha, horario').all();
  assert.equal(sesiones.length, 2);
  assert.deepEqual(sesiones.map(s => [s.fecha, s.horario, s.codigoPaciente, s.importeCentavos, s.pagadoCentavos, s.estado]), [
    ['2026-09-07', '15:00', 'P-001', 0, 0, 'Programada'],
    ['2026-09-09', '10:30', 'P-002', 0, 0, 'Programada'],
  ]);
  migrarBaseDeDatos(e.db);
  const segundaConexion = abrirBaseDeDatos(e.ruta);
  try {
    assert.deepEqual(segundaConexion.prepare('SELECT * FROM sesiones ORDER BY fecha, horario').all(), sesiones);
    assert.deepEqual(segundaConexion.pragma('foreign_key_check'), []);
  } finally { segundaConexion.close(); }
  assert.deepEqual((await e.pedir('sesiones/semana')).body.sesiones, []);
  assert.deepEqual((await e.pedir('sesiones/pendientes')).body, []);
});

test('Creación de pacientes, agenda, sesiones y cobros reales', async t => {
  const e = await entorno(t);
  const postPaciente = paciente => e.pedir('pacientes', 'POST', { paciente });
  const postHorario = (fecha, horario) => e.pedir('horarios', 'POST', { fecha, horario });
  const reservar = (horario, codigoPaciente = 'P-001', importeCentavos = 123456, fecha = '2026-10-05') =>
    e.pedir('sesiones', 'POST', { fecha, horario, codigoPaciente, modalidad: 'Virtual', importeCentavos });
  let paciente;
  let sesion;

  await t.test('una base vacía devuelve contadores cero, siete días y colecciones vacías', async () => {
    assert.deepEqual((await e.pedir('dashboard')).body, { pacientesActivos: 0, sesionesSemana: 0, pendientesCobro: 0, horariosDisponibles: 0 });
    const agenda = (await e.pedir('agenda')).body;
    assert.equal(agenda.dias[0].fecha, '2026-10-05');
    assert.equal(agenda.dias[6].fecha, '2026-10-11');
    assert.equal(agenda.dias.length, 7);
    assert.deepEqual(agenda.dias.flatMap(d => d.turnos), []);
    assert.deepEqual((await e.pedir('sesiones/semana')).body, { desde: '2026-10-05', hasta: '2026-10-11', sesiones: [] });
    assert.deepEqual((await e.pedir('horarios/disponibles')).body, { desde: '2026-10-05', hasta: '2026-10-11', horarios: [] });
  });

  await t.test('crea con código automático o personalizado y fecha asignada por el servidor', async () => {
    assert.deepEqual((await e.pedir('pacientes/siguiente-codigo')).body, { codigo: 'P-001' });
    const respuesta = await postPaciente(nuevoPaciente());
    assert.equal(respuesta.status, 201);
    paciente = respuesta.body.paciente;
    assert.equal(paciente.codigo, 'P-001');
    assert.equal(paciente.fechaCreacion, '2026-10-05');
    assert.equal(respuesta.body.sesion, null);
    assert.deepEqual((await e.pedir('pacientes/siguiente-codigo')).body, { codigo: 'P-002' });
    assert.equal((await postPaciente(nuevoPaciente(' Alias_2 '))).body.paciente.codigo, 'Alias_2');
    assert.equal((await postPaciente(nuevoPaciente('alias_2'))).status, 409);
    assert.equal((await postPaciente(nuevoPaciente('   '))).body.paciente.codigo, 'P-002');
    assert.equal((await e.pedir('pacientes')).body.length, 3);
  });

  await t.test('rechaza fecha de creación falsificada, campos extra, códigos inválidos y ruta reservada', async () => {
    for (const body of [
      { paciente: { ...nuevoPaciente('A'), fechaCreacion: '2026-10-05' } },
      { paciente: nuevoPaciente('A'), fechaCreacion: '2020-01-01' },
      { paciente: { ...nuevoPaciente('A'), nombreReal: 'campo ajeno' } },
      { paciente: nuevoPaciente('ABCDEFGHIJKLM') }, { paciente: nuevoPaciente('NUEVO') },
      { paciente: nuevoPaciente(null) }, { paciente: nuevoPaciente('A'), turno: null },
      { paciente: { ...nuevoPaciente('A'), fechaInicioTratamiento: '2026-02-29' } },
    ]) assert.equal((await e.pedir('pacientes', 'POST', body)).status, 400);
    assert.equal((await e.pedir('pacientes')).body.length, 3);
    assert.equal((await e.pedir('pacientes/P-001', 'PUT', { ...paciente, codigo: 'nuevo' })).status, 400);
  });

  await t.test('la fecha de creación es inmutable y PUT permite omitirla', async () => {
    const alterado = await e.pedir('pacientes/P-001', 'PUT', { ...paciente, fechaCreacion: '2026-10-04' });
    assert.equal(alterado.status, 400);
    assert.match(alterado.body.mensaje, /no se puede modificar/);
    const { fechaCreacion, ...editable } = paciente;
    const guardado = await e.pedir('pacientes/P-001', 'PUT', { ...editable, postIt: 'Cambio permitido.' });
    assert.equal(guardado.status, 200);
    assert.equal(guardado.body.fechaCreacion, fechaCreacion);
    paciente = guardado.body;
  });

  await t.test('agrega horarios futuros y valida fecha, hora y duplicados', async () => {
    for (const horario of ['10:00', '11:00', '12:00', '13:00', '14:00']) {
      assert.equal((await postHorario('2026-10-05', horario)).status, 201);
    }
    assert.equal((await postHorario('2026-10-06', '09:00')).status, 201);
    assert.equal((await postHorario('2026-10-05', '10:00')).status, 409);
    for (const [fecha, horario] of [['2026-10-05', '09:00'], ['2026-10-04', '23:59'], ['2026-02-30', '10:00'], ['2026-10-06', '24:00'], ['2026-10-06', '9:00']]) {
      assert.equal((await postHorario(fecha, horario)).status, 400);
    }
    assert.equal((await e.pedir('horarios/disponibles')).body.horarios.length, 6);
    assert.equal((await e.pedir('dashboard')).body.horariosDisponibles, 6);
    const slot = (await e.pedir('horarios/2026-10-05/10%3A00')).body;
    assert.deepEqual(slot, { fecha: '2026-10-05', horario: '10:00', estado: 'Disponible', codigoPaciente: null, modalidad: null, sesionId: null });
  });

  await t.test('reserva un paciente existente y actualiza solo la próxima sesión, preservando hábitos', async () => {
    const respuesta = await reservar('10:00');
    assert.equal(respuesta.status, 201);
    sesion = respuesta.body;
    assert.equal(sesion.estado, 'Programada');
    assert.equal(sesion.importeCentavos, 123456);
    assert.equal(sesion.pendienteCentavos, 123456);
    assert.equal(sesion.pagadoCentavos, 0);
    assert.deepEqual((await e.pedir('pacientes/P-001')).body, { ...paciente, proximaSesion: 'LUN 10:00 HS' });
    paciente.proximaSesion = 'LUN 10:00 HS';
    const slot = (await e.pedir('horarios/2026-10-05/10:00')).body;
    assert.equal(slot.sesionId, sesion.id);
    assert.equal(slot.codigoPaciente, paciente.codigo);
    assert.equal((await e.pedir('agenda')).body.dias[0].turnos[0].sesionId, sesion.id);
    assert.equal((await e.pedir('horarios/disponibles')).body.horarios.length, 5);
    assert.equal((await reservar('10:00')).status, 409);
    assert.equal((await reservar('11:00', 'No-existe')).status, 404);
    assert.equal((await reservar('23:00')).status, 404);
  });

  await t.test('valida honorarios y cobros como centavos enteros, incluidos importes parciales', async () => {
    for (const importe of [-1, 0.1, 1000000000, '100', null]) {
      assert.equal((await reservar('11:00', 'P-001', importe)).status, 400);
    }
    for (const body of [
      { importeCentavos: -1, pagadoCentavos: 0 }, { importeCentavos: 10.5, pagadoCentavos: 0 },
      { importeCentavos: 10, pagadoCentavos: 11 }, { importeCentavos: 10, pagadoCentavos: -1 },
      { importeCentavos: 10, pagadoCentavos: 1.5 }, { importeCentavos: '10', pagadoCentavos: 0 },
      { importeCentavos: 10, pagadoCentavos: 0, estado: 'Realizada' }, { importeCentavos: 10 },
    ]) assert.equal((await e.pedir(`sesiones/${sesion.id}`, 'PUT', body)).status, 400);
    const parcial = await e.pedir(`sesiones/${sesion.id}`, 'PUT', { importeCentavos: 123456, pagadoCentavos: 23456 });
    assert.equal(parcial.status, 200);
    assert.equal(parcial.body.pendienteCentavos, 100000);
    assert.equal(parcial.body.estado, 'Programada');
    assert.deepEqual((await e.pedir('sesiones/pendientes')).body, []);
  });

  await t.test('una sesión futura no se puede marcar realizada y las pasadas no cambian solas', async () => {
    assert.equal((await e.pedir(`sesiones/${sesion.id}/realizar`, 'POST')).status, 400);
    e.avanzar('2026-10-05T13:01:00Z');
    assert.equal((await e.pedir(`sesiones/${sesion.id}`)).body.estado, 'Programada');
    assert.deepEqual((await e.pedir('sesiones/semana')).body.sesiones, []);
    assert.deepEqual((await e.pedir('sesiones/pendientes')).body, []);
    assert.equal((await e.pedir('dashboard')).body.sesionesSemana, 0);
    const realizada = await e.pedir(`sesiones/${sesion.id}/realizar`, 'POST');
    assert.equal(realizada.status, 200);
    assert.equal(realizada.body.estado, 'Realizada');
    assert.deepEqual((await e.pedir(`sesiones/${sesion.id}/realizar`, 'POST')).body, realizada.body);
    assert.equal((await e.pedir('sesiones/semana')).body.sesiones.length, 1);
    assert.equal((await e.pedir('sesiones/pendientes')).body[0].pendienteCentavos, 100000);
    assert.deepEqual((await e.pedir('dashboard')).body, { pacientesActivos: 3, sesionesSemana: 1, pendientesCobro: 1, horariosDisponibles: 5 });
  });

  await t.test('crear paciente y asignarle horario confirma ambas operaciones o ninguna', async () => {
    const turno = { fecha: '2026-10-05', horario: '11:00', modalidad: 'Presencial', importeCentavos: 50000 };
    const creado = await e.pedir('pacientes', 'POST', { paciente: nuevoPaciente('Alias-3'), turno });
    assert.equal(creado.status, 201);
    assert.equal(creado.body.paciente.codigo, 'Alias-3');
    assert.equal(creado.body.paciente.proximaSesion, 'LUN 11:00 HS');
    assert.equal(creado.body.sesion.codigoPaciente, 'Alias-3');
    const fallido = await e.pedir('pacientes', 'POST', { paciente: nuevoPaciente('Sin-huerfano'), turno });
    assert.equal(fallido.status, 409);
    assert.equal((await e.pedir('pacientes/Sin-huerfano')).status, 404);
    const sinHorario = await e.pedir('pacientes', 'POST', { paciente: nuevoPaciente('Sin-horario'), turno: { ...turno, horario: '23:00' } });
    assert.equal(sinHorario.status, 404);
    assert.equal((await e.pedir('pacientes/Sin-horario')).status, 404);
  });

  await t.test('un fallo de SQLite revierte paciente nuevo, turno y sesión de la misma reserva', async () => {
    e.db.exec(`CREATE TEMP TRIGGER fallar_sesion BEFORE INSERT ON sesiones BEGIN SELECT RAISE(ABORT, 'fallo de prueba'); END;`);
    try {
      const respuesta = await e.pedir('pacientes', 'POST', {
        paciente: nuevoPaciente('Rollback'),
        turno: { fecha: '2026-10-05', horario: '12:00', modalidad: 'Virtual', importeCentavos: 10000 },
      });
      assert.equal(respuesta.status, 500);
      assert.deepEqual(respuesta.body, { mensaje: 'No se pudo completar la operación' });
      assert.equal((await e.pedir('pacientes/Rollback')).status, 404);
      assert.equal((await e.pedir('horarios/2026-10-05/12:00')).body.estado, 'Disponible');
      assert.deepEqual(e.db.pragma('foreign_key_check'), []);
    } finally { e.db.exec('DROP TRIGGER fallar_sesion'); }
  });

  await t.test('dos reservas simultáneas del mismo horario producen un único ganador', async () => {
    const respuestas = await Promise.all([reservar('12:00'), reservar('12:00', 'Alias_2')]);
    assert.deepEqual(respuestas.map(r => r.status).sort(), [201, 409]);
    assert.equal(e.db.prepare("SELECT COUNT(*) AS n FROM sesiones WHERE fecha = '2026-10-05' AND horario = '12:00'").get().n, 1);
    const intentos = await Promise.all(['Conc-A', 'Conc-B'].map(codigo => e.pedir('pacientes', 'POST', {
      paciente: nuevoPaciente(codigo), turno: { fecha: '2026-10-05', horario: '13:00', modalidad: 'Virtual', importeCentavos: 10 },
    })));
    assert.deepEqual(intentos.map(r => r.status).sort(), [201, 409]);
    assert.equal(e.db.prepare("SELECT COUNT(*) AS n FROM pacientes WHERE codigo IN ('Conc-A', 'Conc-B')").get().n, 1);
  });

  await t.test('agendar una fecha posterior conserva como próxima la reserva futura más cercana', async () => {
    assert.equal((await reservar('14:00')).status, 201);
    const proximaAntes = (await e.pedir('pacientes/P-001')).body.proximaSesion;
    assert.match(proximaAntes, /^LUN /);
    assert.equal((await reservar('09:00', 'P-001', 50000, '2026-10-06')).status, 201);
    assert.equal((await e.pedir('pacientes/P-001')).body.proximaSesion, proximaAntes);
    assert.equal((await e.pedir('pacientes/P-001')).body.horarioHabitual, paciente.horarioHabitual);
  });

  await t.test('renombrar actualiza turnos y sesiones, manteniendo fecha, estado, importes e identificador de sesión', async () => {
    const actual = (await e.pedir('pacientes/P-001')).body;
    const anterior = (await e.pedir(`sesiones/${sesion.id}`)).body;
    assert.equal((await e.pedir('pacientes/P-001', 'PUT', { ...actual, codigo: 'Cambio' })).status, 200);
    assert.deepEqual((await e.pedir(`sesiones/${sesion.id}`)).body, { ...anterior, codigoPaciente: 'Cambio' });
    assert.equal((await e.pedir('horarios/2026-10-05/10:00')).body.codigoPaciente, 'Cambio');
    assert.deepEqual(e.db.pragma('foreign_key_check'), []);
  });

  await t.test('un cobro completo quita el pendiente y persiste después de reabrir SQLite', async () => {
    const respuesta = await e.pedir(`sesiones/${sesion.id}`, 'PUT', { importeCentavos: 123456, pagadoCentavos: 123456 });
    assert.equal(respuesta.body.pendienteCentavos, 0);
    assert.deepEqual((await e.pedir('sesiones/pendientes')).body, []);
    assert.equal((await e.pedir('dashboard')).body.pendientesCobro, 0);
    const otra = abrirBaseDeDatos(e.ruta);
    try {
      const guardada = otra.prepare('SELECT * FROM sesiones WHERE id = ?').get(sesion.id);
      assert.equal(guardada.estado, 'Realizada');
      assert.equal(guardada.pagadoCentavos, 123456);
      assert.equal(guardada.codigoPaciente, 'Cambio');
      assert.equal(otra.pragma('user_version', { simple: true }), 1);
    } finally { otra.close(); }
  });

  await t.test('errores 404 y consultas con fechas inválidas no exponen detalles internos', async () => {
    for (const recurso of ['sesiones/no-numero', 'sesiones/0', 'sesiones/999999999999999999999', 'horarios/2026-10-08/08:00']) {
      assert.equal((await e.pedir(recurso)).status, 404);
    }
    assert.equal((await e.pedir('sesiones/999999/realizar', 'POST')).status, 404);
    for (const recurso of ['agenda?fecha=incorrecta', 'agenda?fecha=2026-02-30', 'agenda?fecha[]=2026-10-05', 'horarios/disponibles?fecha=0000-01-01', 'horarios/2026-02-30/10:00']) {
      assert.equal((await e.pedir(recurso)).status, 400);
    }
  });
});

test('Calendario de Buenos Aires y alcance del histórico y los pendientes', async t => {
  // Ya es lunes en UTC, pero todavía domingo en Argentina.
  const e = await entorno(t, '2026-10-05T01:00:00Z');
  assert.deepEqual(instanteLocal(new Date('2026-10-05T01:00:00Z')), { fecha: '2026-10-04', horario: '22:00', instante: '2026-10-04 22:00' });
  assert.equal(semanaDe('2027-01-01').desde, '2026-12-28');
  assert.equal(semanaDe('2027-01-01').hasta, '2027-01-03');
  const creacion = await e.pedir('pacientes', 'POST', { paciente: nuevoPaciente('FechaLocal') });
  assert.equal(creacion.body.paciente.fechaCreacion, '2026-10-04');
  assert.equal((await e.pedir('agenda')).body.dias[0].fecha, '2026-09-28');
  assert.equal((await e.pedir('sesiones/semana')).body.hasta, '2026-10-04');
  assert.equal((await e.pedir('horarios', 'POST', { fecha: '2026-10-04', horario: '23:00' })).status, 201);
  const reserva = await e.pedir('sesiones', 'POST', {
    fecha: '2026-10-04', horario: '23:00', codigoPaciente: 'FechaLocal', modalidad: 'Virtual', importeCentavos: 25000,
  });
  assert.equal(reserva.status, 201);
  // Marcarla el lunes usa la fecha del turno para el histórico, no la fecha del clic.
  e.avanzar('2026-10-05T03:01:00Z');
  assert.equal((await e.pedir(`sesiones/${reserva.body.id}/realizar`, 'POST')).status, 200);
  assert.deepEqual((await e.pedir('sesiones/semana')).body, { desde: '2026-10-05', hasta: '2026-10-11', sesiones: [] });
  assert.equal((await e.pedir('sesiones/pendientes')).body[0].fecha, '2026-10-04');
  assert.deepEqual((await e.pedir('dashboard')).body, { pacientesActivos: 1, sesionesSemana: 0, pendientesCobro: 1, horariosDisponibles: 0 });
  assert.equal((await e.pedir('agenda?fecha=2026-10-04')).body.dias[6].turnos[0].sesionId, reserva.body.id);
});
