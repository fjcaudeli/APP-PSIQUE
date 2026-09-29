import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { crearApp } from '../dist/app.js';
import { abrirBaseDeDatos } from '../dist/db/database.js';
import { DASHBOARD_INICIAL, PACIENTES_INICIALES, SEMANA_INICIAL } from '../dist/db/seed.js';

const origenFrontend = 'http://127.0.0.1:4200';

// Las pruebas usan un archivo temporal y un puerto asignado por el sistema.
// Nunca leen ni modifican backend/data/psique.sqlite.
test('API REST y persistencia del prototipo', async (t) => {
  const carpeta = mkdtempSync(join(tmpdir(), 'psique-api-'));
  const ruta = join(carpeta, 'prueba.sqlite');
  let db = abrirBaseDeDatos(ruta);
  const servidor = crearApp(db, origenFrontend).listen(0, '127.0.0.1');

  try {
    await once(servidor, 'listening');
    const base = `http://127.0.0.1:${servidor.address().port}/api`;

    await t.test('pacientes conserva todos los campos, textos y valores null', async () => {
      const respuesta = await fetch(`${base}/pacientes`);
      assert.equal(respuesta.status, 200);
      assert.deepEqual(await respuesta.json(), PACIENTES_INICIALES);

      for (const paciente of PACIENTES_INICIALES) {
        const ficha = await fetch(`${base}/pacientes/${paciente.codigo}`);
        assert.equal(ficha.status, 200);
        assert.deepEqual(await ficha.json(), paciente);
      }
    });

    await t.test('el código inexistente y el texto SQL se tratan como búsquedas sin resultado', async () => {
      for (const codigo of ['P-999', "P-001' OR '1'='1"]) {
        const respuesta = await fetch(`${base}/pacientes/${encodeURIComponent(codigo)}`);
        assert.equal(respuesta.status, 404);
        assert.deepEqual(await respuesta.json(), { mensaje: 'Paciente no encontrado' });
      }
    });

    await t.test('agenda conserva semana, orden, horarios liberados y días vacíos', async () => {
      const respuesta = await fetch(`${base}/agenda`);
      assert.equal(respuesta.status, 200);
      const agenda = await respuesta.json();
      assert.deepEqual(agenda, SEMANA_INICIAL);
      assert.equal(agenda.dias.length, 7);
      assert.equal(agenda.dias.flatMap((dia) => dia.turnos).length, 14);
      for (const dia of agenda.dias) {
        const horarios = dia.turnos.map((turno) => turno.horario);
        assert.deepEqual(horarios, [...horarios].sort());
      }
    });

    await t.test('dashboard mantiene 3, 8, 2 y 4 sin calcularlos desde los turnos', async () => {
      const respuesta = await fetch(`${base}/dashboard`);
      assert.equal(respuesta.status, 200);
      assert.deepEqual(await respuesta.json(), DASHBOARD_INICIAL);
      assert.deepEqual(DASHBOARD_INICIAL, {
        pacientesActivos: 3,
        sesionesSemana: 8,
        pendientesCobro: 2,
        horariosDisponibles: 4,
      });
    });

    await t.test('CORS habilita el origen local y anuncia únicamente GET', async () => {
      const respuesta = await fetch(`${base}/dashboard`, { headers: { Origin: origenFrontend } });
      assert.equal(respuesta.headers.get('access-control-allow-origin'), origenFrontend);

      const origenAjeno = 'http://otro-origen.invalid';
      const ajena = await fetch(`${base}/dashboard`, { headers: { Origin: origenAjeno } });
      assert.notEqual(ajena.headers.get('access-control-allow-origin'), origenAjeno);
      assert.notEqual(ajena.headers.get('access-control-allow-origin'), '*');

      const opciones = await fetch(`${base}/dashboard`, {
        method: 'OPTIONS',
        headers: { Origin: origenFrontend, 'Access-Control-Request-Method': 'GET' },
      });
      assert.equal(opciones.headers.get('access-control-allow-methods'), 'GET');
    });

    await t.test('no existen endpoints para crear, editar o borrar pacientes', async () => {
      for (const metodo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const respuesta = await fetch(`${base}/pacientes`, { method: metodo });
        assert.equal(respuesta.status, 404);
      }
      assert.deepEqual(await (await fetch(`${base}/pacientes`)).json(), PACIENTES_INICIALES);
    });

    await t.test('las respuestas leen SQLite y no devuelven las constantes de inicialización', async () => {
      db.prepare('UPDATE pacientes SET postIt = ? WHERE codigo = ?')
        .run('Texto ficticio para comprobar persistencia.', 'P-001');
      db.prepare('UPDATE dashboard SET sesionesSemana = ? WHERE id = 1').run(12);
      const ficha = await (await fetch(`${base}/pacientes/P-001`)).json();
      assert.equal(ficha.postIt, 'Texto ficticio para comprobar persistencia.');
      const dashboard = await (await fetch(`${base}/dashboard`)).json();
      assert.equal(dashboard.sesionesSemana, 12);
    });

    await new Promise((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));

    await t.test('reiniciar la base no duplica registros ni sobreescribe los existentes', () => {
      db.close();
      db = abrirBaseDeDatos(ruta);
      assert.equal(db.prepare('SELECT COUNT(*) AS cantidad FROM pacientes').get().cantidad, 3);
      assert.equal(db.prepare('SELECT COUNT(*) AS cantidad FROM turnos').get().cantidad, 14);
      assert.equal(db.prepare('SELECT COUNT(*) AS cantidad FROM dias_agenda').get().cantidad, 7);
      assert.equal(db.prepare('SELECT COUNT(*) AS cantidad FROM semana_agenda').get().cantidad, 1);
      assert.equal(db.prepare('SELECT COUNT(*) AS cantidad FROM dashboard').get().cantidad, 1);
      assert.equal(db.prepare('SELECT postIt FROM pacientes WHERE codigo = ?').get('P-001').postIt,
        'Texto ficticio para comprobar persistencia.');
      assert.equal(db.prepare('SELECT sesionesSemana FROM dashboard WHERE id = 1').get().sesionesSemana, 12);

      // Una base parcialmente modificada tampoco se repuebla automáticamente.
      db.prepare('DELETE FROM turnos WHERE fecha = ? AND horario = ?').run('2026-09-07', '09:00');
      db.close();
      db = abrirBaseDeDatos(ruta);
      assert.equal(db.prepare('SELECT COUNT(*) AS cantidad FROM turnos').get().cantidad, 13);
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
