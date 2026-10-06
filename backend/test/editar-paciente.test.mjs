import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { crearApp } from '../dist/app.js';
import { abrirBaseDeDatos } from '../dist/db/database.js';
import { PACIENTES_INICIALES } from '../dist/db/seed.js';
import { abrirFixtureLegacy, AGENDA_LEGACY, DASHBOARD_LEGACY, RELOJ_LEGACY } from './fixtures.mjs';

// Se prueba la edición contra un archivo aislado: la base usada por la demo no se toca.
test('Edición completa de pacientes y conservación de sus turnos', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'psique-edicion-'));
  const ruta = join(carpeta, 'edicion.sqlite');
  let db = abrirFixtureLegacy(ruta);
  const servidor = crearApp(db, 'http://127.0.0.1:4200', RELOJ_LEGACY).listen(0, '127.0.0.1');
  const original = PACIENTES_INICIALES[0];
  const editado = {
    codigo: 'Fx_01',
    modalidad: 'Virtual',
    estado: 'Suspendido',
    proximaSesion: 'VIE 18:45 HS',
    frecuencia: 'Mensual',
    diaHabitual: 'Viernes',
    horarioHabitual: '18:45',
    fechaCreacion: original.fechaCreacion,
    fechaInicioTratamiento: '2026-08-14',
    motivoConsulta: "Texto ficticio de prueba con apóstrofo: 'ejemplo'.",
    postIt: 'Nota de prueba actualizada.',
  };

  try {
    await once(servidor, 'listening');
    const base = `http://127.0.0.1:${servidor.address().port}/api`;
    const guardar = (codigo, paciente) => fetch(`${base}/pacientes/${encodeURIComponent(codigo)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paciente),
    });
    const consultar = async (recurso) => (await fetch(`${base}/${recurso}`)).json();

    await t.test('rechaza fichas incompletas, tipos incorrectos y campos desconocidos', async () => {
      const incompleto = { ...original };
      delete incompleto.postIt;
      const cuerpos = [null, [], 'texto', incompleto, { ...original, nombre: 'campo no permitido' }];
      for (const cuerpo of cuerpos) {
        const respuesta = await guardar(original.codigo, cuerpo);
        assert.equal(respuesta.status, 400);
        assert.equal(typeof (await respuesta.json()).mensaje, 'string');
      }
      assert.deepEqual(await consultar('pacientes'), PACIENTES_INICIALES);
    });

    await t.test('valida códigos, longitudes, fechas reales, días, horas y null sin escribir cambios', async () => {
      const invalidos = [
        ['codigo', ''], ['codigo', 'ABCDEFGHIJKLM'], ['codigo', '_ABC'], ['codigo', 'AB CD'],
        ['codigo', 'José'], ['codigo', "A' OR 1=1"],
        ['modalidad', 'Mixta'], ['modalidad', null],
        ['estado', '  '], ['estado', 'x'.repeat(41)], ['estado', 2],
        ['frecuencia', ''], ['frecuencia', 'x'.repeat(41)], ['frecuencia', null],
        ['proximaSesion', 'x'.repeat(31)], ['proximaSesion', false],
        ['diaHabitual', 'Otro día'], ['diaHabitual', ''],
        ['horarioHabitual', '24:00'], ['horarioHabitual', '09:60'], ['horarioHabitual', '9:00'],
        ['fechaCreacion', '2026-02-29'], ['fechaCreacion', '2026-02-30'],
        ['fechaCreacion', '2026-13-01'], ['fechaCreacion', '01/09/2026'],
        ['fechaInicioTratamiento', '2026-04-31'], ['fechaInicioTratamiento', null],
        ['motivoConsulta', null], ['motivoConsulta', 'x'.repeat(3001)],
        ['postIt', {}], ['postIt', 'x'.repeat(301)],
      ];
      for (const [campo, valor] of invalidos) {
        const respuesta = await guardar(original.codigo, { ...original, [campo]: valor });
        assert.equal(respuesta.status, 400, `Debe rechazar ${campo}`);
        assert.equal(typeof (await respuesta.json()).mensaje, 'string');
      }
      assert.deepEqual(await consultar('pacientes'), PACIENTES_INICIALES);
      assert.deepEqual(await consultar('agenda'), AGENDA_LEGACY);
    });

    await t.test('informa 404 para el código original inexistente sin crear pacientes', async () => {
      for (const codigo of ['P-999', "P-001' OR '1'='1"]) {
        const respuesta = await guardar(codigo, editado);
        assert.equal(respuesta.status, 404);
        assert.deepEqual(await respuesta.json(), { mensaje: 'Paciente no encontrado' });
      }
      assert.deepEqual(await consultar('pacientes'), PACIENTES_INICIALES);
    });

    await t.test('rechaza códigos duplicados incluso si cambian las mayúsculas', async () => {
      for (const codigo of ['P-002', 'p-002']) {
        const respuesta = await guardar(original.codigo, { ...editado, codigo });
        assert.equal(respuesta.status, 409);
        assert.deepEqual(await respuesta.json(), { mensaje: 'Ya existe un paciente con ese código.' });
      }
      assert.deepEqual(await consultar('pacientes'), PACIENTES_INICIALES);
      assert.deepEqual(await consultar('agenda'), AGENDA_LEGACY);
    });

    await t.test('responde 400 ante JSON malformado y 413 cuando se superan 32 KB', async () => {
      const malformado = await fetch(`${base}/pacientes/P-001`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"codigo":',
      });
      assert.equal(malformado.status, 400);
      assert.deepEqual(await malformado.json(), { mensaje: 'El cuerpo de la solicitud debe contener JSON válido.' });
      const excesivo = await guardar(original.codigo, { ...original, motivoConsulta: 'x'.repeat(33 * 1024) });
      assert.equal(excesivo.status, 413);
      assert.deepEqual(await excesivo.json(), { mensaje: 'La ficha enviada supera el tamaño permitido de 32 KB.' });
      assert.deepEqual(await consultar('pacientes'), PACIENTES_INICIALES);
    });

    await t.test('revierte la ficha si falla la actualización de los turnos asociados', async () => {
      // El fallo se provoca únicamente en esta base de prueba, después de escribir la ficha.
      db.exec(`
        CREATE TEMP TRIGGER simular_fallo_turnos BEFORE UPDATE ON turnos
        BEGIN SELECT RAISE(ABORT, 'Error simulado de prueba'); END;
      `);
      try {
        const respuesta = await guardar(original.codigo, editado);
        assert.equal(respuesta.status, 500);
        assert.deepEqual(await respuesta.json(), { mensaje: 'No se pudo completar la operación' });
        assert.deepEqual(await consultar('pacientes'), PACIENTES_INICIALES);
        assert.deepEqual(await consultar('agenda'), AGENDA_LEGACY);
        assert.deepEqual(db.pragma('foreign_key_check'), []);
        assert.equal(db.pragma('defer_foreign_keys', { simple: true }), 0);
      } finally {
        db.exec('DROP TRIGGER simular_fallo_turnos');
      }
    });

    await t.test('guarda los campos editables, conserva fecha, recorta espacios y renombra turnos y sesiones', async () => {
      const conEspacios = Object.fromEntries(Object.entries(editado).map(([campo, valor]) => [campo, `  ${valor}  `]));
      const respuesta = await guardar(original.codigo, conEspacios);
      assert.equal(respuesta.status, 200);
      assert.deepEqual(await respuesta.json(), editado);
      assert.deepEqual(await consultar(`pacientes/${editado.codigo}`), editado);
      assert.equal((await fetch(`${base}/pacientes/P-001`)).status, 404);
      const listado = await consultar('pacientes');
      assert.equal(listado.length, 3);
      assert.deepEqual(listado.find((paciente) => paciente.codigo === editado.codigo), editado);
      assert.deepEqual(listado.filter((paciente) => paciente.codigo !== editado.codigo), PACIENTES_INICIALES.slice(1));

      const agendaEsperada = structuredClone(AGENDA_LEGACY);
      agendaEsperada.dias[0].turnos[2].codigoPaciente = editado.codigo;
      assert.deepEqual(await consultar('agenda'), agendaEsperada);
      assert.deepEqual(await consultar('dashboard'), { ...DASHBOARD_LEGACY, pacientesActivos: 2 });
      assert.equal((await consultar('sesiones/1')).codigoPaciente, editado.codigo);
      assert.deepEqual(db.pragma('foreign_key_check'), []);
      assert.equal(db.pragma('defer_foreign_keys', { simple: true }), 0);
      const relacion = db.pragma('foreign_key_list(turnos)').find((clave) => clave.table === 'pacientes');
      assert.equal(relacion.on_update, 'NO ACTION');
    });

    await t.test('permite cambiar únicamente las mayúsculas del propio código', async () => {
      const nuevoCodigo = editado.codigo.toLowerCase();
      const respuesta = await guardar(editado.codigo, { ...editado, codigo: nuevoCodigo });
      assert.equal(respuesta.status, 200);
      editado.codigo = nuevoCodigo;
      assert.deepEqual(await respuesta.json(), editado);
      assert.equal((await consultar('agenda')).dias[0].turnos[2].codigoPaciente, nuevoCodigo);
      assert.deepEqual(db.pragma('foreign_key_check'), []);
    });

    await t.test('acepta códigos cortos, límites máximos, una fecha bisiesta y campos opcionales vacíos', async () => {
      const maximos = {
        ...PACIENTES_INICIALES[2], codigo: 'A12345678901', estado: 'x'.repeat(40), frecuencia: 'x'.repeat(40),
        proximaSesion: 'x'.repeat(30), fechaInicioTratamiento: '2024-02-29',
        motivoConsulta: 'x'.repeat(3000), postIt: 'x'.repeat(300),
      };
      const respuesta = await guardar('P-003', maximos);
      assert.equal(respuesta.status, 200);
      assert.deepEqual(await respuesta.json(), maximos);
      const opcionales = {
        ...PACIENTES_INICIALES[2], codigo: 'X', proximaSesion: null, diaHabitual: null,
        horarioHabitual: null, motivoConsulta: '  ', postIt: '',
      };
      const vacios = await guardar(maximos.codigo, opcionales);
      assert.equal(vacios.status, 200);
      assert.deepEqual(await vacios.json(), { ...opcionales, motivoConsulta: '' });
    });

    await t.test('la edición no agrega POST, PATCH ni DELETE sobre una ficha', async () => {
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        const respuesta = await fetch(`${base}/pacientes/${editado.codigo}`, { method });
        assert.equal(respuesta.status, 404);
      }
      assert.deepEqual(await consultar(`pacientes/${editado.codigo}`), editado);
    });

    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
    await t.test('los cambios persisten después de cerrar y volver a abrir el archivo SQLite', () => {
      db.close();
      db = abrirBaseDeDatos(ruta);
      assert.deepEqual(db.prepare('SELECT * FROM pacientes WHERE codigo = ?').get(editado.codigo), editado);
      assert.equal(db.prepare('SELECT COUNT(*) AS cantidad FROM pacientes').get().cantidad, 3);
      assert.equal(db.prepare('SELECT codigoPaciente FROM turnos WHERE fecha = ? AND horario = ?')
        .get('2026-09-07', '15:00').codigoPaciente, editado.codigo);
      assert.deepEqual(db.pragma('foreign_key_check'), []);
    });
  } finally {
    if (servidor.listening) {
      await new Promise((resolve) => servidor.close(resolve));
    }
    if (db.open) {
      db.close();
    }
    unlinkSync(ruta);
    rmdirSync(carpeta);
  }
});
