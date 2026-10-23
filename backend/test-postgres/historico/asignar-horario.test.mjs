// Referencia de la API anterior al calendario. Sus reglas fueron reemplazadas por el rework.
import test from 'node:test';
import assert from 'node:assert/strict';
import { entornoApi, ficha, reserva, editable } from '../api-fixtures.mjs';

for (const motor of ['postgres', 'sqlite']) {
  test(`asignación de horarios disponibles y reprogramación atómica (${motor})`, async t => {
    const e = await entornoApi(t, motor, { maximoConexiones: 1 });
    const pedir = async (ruta, metodo = 'GET', datos, status = 200, cuenta = 0) => {
      const r = await e.pedir(cuenta, ruta, metodo, datos);
      assert.equal(r.status, status, `${metodo} ${ruta}: ${JSON.stringify(r.body)}`);
      return r.body;
    };
    const horario = (fecha, hora, cuenta = 0) => pedir('horarios', 'POST', { fecha, horario: hora }, 201, cuenta);
    const crear = async (codigo, cuenta = 0) => (await pedir('pacientes', 'POST', { paciente: ficha(codigo) }, 201, cuenta)).paciente;
    let paciente = await crear('P-001');
    await crear('P-001', 1);
    await crear('P-002');

    await t.test('rechaza minutos escritos fuera de los intervalos de quince sin crear turnos', async () => {
      const antes = await e.snapshot();
      for (const hora of ['10:01', '10:14', '10:29', '10:46', '10:59', '10:60', '24:00']) {
        await pedir('horarios', 'POST', { fecha: '2026-10-06', horario: hora }, 400);
      }
      assert.deepEqual(await e.snapshot(), antes);
      for (const minuto of ['00', '15', '30', '45']) await horario('2026-10-06', '10:' + minuto);
    });

    await t.test('lista todas las semanas futuras, ordenadas y aisladas por profesional', async () => {
      await horario('2026-11-02', '18:00');
      await horario('2026-10-05', '09:15');
      await horario('2026-12-01', '20:00', 1);
      e.avanzar('2026-10-05T12:30:00Z'); // 09:30: el turno 09:15 ya no se ofrece.
      const disponibles = await pedir('horarios/disponibles/todos');
      assert.deepEqual(disponibles.map(t => t.fecha + ' ' + t.horario), [
        '2026-10-06 10:00', '2026-10-06 10:15', '2026-10-06 10:30', '2026-10-06 10:45', '2026-11-02 18:00',
      ]);
      assert.deepEqual((await pedir('horarios/disponibles/todos', 'GET', undefined, 200, 1)).map(t => t.fecha), ['2026-12-01']);
      assert.equal((await e.raw('horarios/disponibles/todos')).status, 401);
    });

    await t.test('el alta con turno deriva día y hora aunque la ficha envíe otro día', async () => {
      const creado = await pedir('pacientes', 'POST', {
        paciente: { ...ficha('ALTA'), diaHabitual: 'Viernes', horarioHabitual: '22:30' },
        turno: { fecha: '2026-11-02', horario: '18:00', modalidad: 'Virtual', importeCentavos: 3000000 },
      }, 201);
      assert.equal(creado.paciente.diaHabitual, 'Lunes');
      assert.equal(creado.paciente.horarioHabitual, '18:00');
      assert.equal(creado.sesion.importeCentavos, 3000000);
    });

    let sesion;
    await t.test('asigna desde la ficha sin próxima sesión, sin modificar otras cuentas', async () => {
      paciente = await pedir('pacientes/P-001', 'PUT', { ...paciente, turno: { fecha: '2026-10-06', horario: '10:00' } });
      assert.equal(paciente.diaHabitual, 'Martes');
      assert.equal(paciente.horarioHabitual, '10:00');
      assert.equal(paciente.proximaSesion, 'MAR 10:00 HS');
      const turno = await pedir('horarios/2026-10-06/10:00');
      sesion = await pedir('sesiones/' + turno.sesionId);
      assert.equal(sesion.importeCentavos, 0);
      assert.equal((await pedir('pacientes/P-001', 'GET', undefined, 200, 1)).horarioHabitual, null);
      sesion = await pedir('sesiones/' + sesion.id, 'PUT', { ...editable(sesion), importeCentavos: 3000000, pagadoCentavos: 500000, resumen: 'Nota ficticia breve.' });
    });

    await t.test('reprograma solo la próxima, renombra y conserva ID, notas, cobros e histórico', async () => {
      await pedir('sesiones', 'POST', reserva('P-001', '10:45', '2026-10-06'), 201);
      // Un registro anterior realizado permanece ajeno a la reprogramación futura.
      await horario('2026-10-05', '11:00');
      const anterior = await pedir('sesiones', 'POST', reserva('P-001', '11:00', '2026-10-05'), 201);
      e.avanzar('2026-10-05T15:00:00Z');
      const historica = await pedir(`sesiones/${anterior.id}/realizar`, 'POST', {}, 200);
      paciente = await pedir('pacientes/P-001');
      paciente = await pedir('pacientes/P-001', 'PUT', { ...paciente, codigo: 'ALIAS', turno: { fecha: '2026-10-06', horario: '10:30' } });
      const movida = await pedir('sesiones/' + sesion.id);
      assert.deepEqual(movida, { ...sesion, codigoPaciente: 'ALIAS', horario: '10:30' });
      assert.deepEqual(await pedir('sesiones/' + historica.id), { ...historica, codigoPaciente: 'ALIAS' });
      assert.equal((await pedir('horarios/2026-10-06/10:00')).estado, 'Liberado');
      assert.equal((await pedir('horarios/2026-10-06/10:30')).sesionId, sesion.id);
      assert.equal((await pedir('horarios/2026-10-06/10:45')).codigoPaciente, 'ALIAS');
      assert.equal(paciente.proximaSesion, 'MAR 10:30 HS');
      assert.equal((await pedir('horarios/disponibles/todos')).some(t => t.horario === '10:00'), true);
    });

    await t.test('un destino ocupado, ajeno, inexistente o pasado revierte toda la ficha', async () => {
      const antes = await e.snapshot();
      for (const turno of [
        { fecha: '2026-10-06', horario: '10:45' }, { fecha: '2026-12-01', horario: '20:00' },
        { fecha: '2026-10-07', horario: '21:00' },
      ]) {
        await pedir('pacientes/ALIAS', 'PUT', { ...paciente, codigo: 'CAMBIO', postIt: 'No debe guardarse', turno }, 409);
        assert.deepEqual(await e.snapshot(), antes);
      }
      await pedir('pacientes/ALIAS', 'PUT', { ...paciente, turno: { fecha: '2026-10-05', horario: '09:15' } }, 400);
      await pedir('pacientes/ALIAS', 'PUT', { ...paciente, diaHabitual: 'Viernes', horarioHabitual: '19:30' }, 400);
      await pedir('pacientes/ALIAS', 'PUT', { ...paciente, turno: { fecha: '2026-10-06', horario: '10:15', usuarioId: e.ids[1] } }, 400);
      assert.deepEqual(await e.snapshot(), antes);
    });

    await t.test('rechaza pacientes no activos al agendar y al asignar desde su ficha', async () => {
      const p = await pedir('pacientes/P-002');
      const pausado = await pedir('pacientes/P-002', 'PUT', { ...p, estado: 'En pausa' });
      const antes = await e.snapshot();
      await pedir('sesiones', 'POST', reserva('P-002', '10:15', '2026-10-06'), 409);
      await pedir('pacientes/P-002', 'PUT', { ...pausado, turno: { fecha: '2026-10-06', horario: '10:15' } }, 409);
      assert.deepEqual(await e.snapshot(), antes);
    });

    await t.test('un error SQL después de ocupar el destino revierte ficha, sesión y ambos turnos', async () => {
      const antes = await e.snapshot();
      let restaurar;
      if (motor === 'postgres') {
        const cliente = await e.pool.connect();
        const original = cliente.query;
        cliente.query = function (sql, ...args) {
          if (typeof sql === 'string' && sql.startsWith('UPDATE public.sesiones SET fecha')) throw new Error('Fallo simulado');
          return original.call(this, sql, ...args);
        };
        cliente.release();
        restaurar = () => { cliente.query = original; };
      } else {
        e.db.exec(`CREATE TEMP TRIGGER fallar_reprogramacion BEFORE UPDATE OF fecha, horario ON sesiones
          BEGIN SELECT RAISE(ABORT, 'Fallo simulado'); END;`);
        restaurar = () => e.db.exec('DROP TRIGGER fallar_reprogramacion');
      }
      try {
        await pedir('pacientes/ALIAS', 'PUT', { ...paciente, postIt: 'No debe guardarse', turno: { fecha: '2026-10-06', horario: '10:15' } }, 500);
      } finally { restaurar(); }
      assert.deepEqual(await e.snapshot(), antes);
    });

    await t.test('dos asignaciones simultáneas a un horario dejan un único ganador', async () => {
      const nuevo = await crear('OTRO');
      const resultados = await Promise.all([paciente, nuevo].map(p => e.pedir(0, `pacientes/${p.codigo}`, 'PUT', {
        ...p, turno: { fecha: '2026-10-06', horario: '10:15' },
      })));
      assert.deepEqual(resultados.map(r => r.status).sort(), [200, 409]);
      assert.equal((await pedir('horarios/disponibles/todos')).some(t => t.horario === '10:15'), false);
    });
  });
}
