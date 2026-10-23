import test from 'node:test';
import assert from 'node:assert/strict';
import { entornoApi, ficha, editable } from './api-fixtures.mjs';

const reserva = (codigoPaciente = 'P-001', cambios = {}) => ({ fecha: '2026-10-05', horario: '10:00', duracionMinutos: 60,
  codigoPaciente, modalidad: 'Virtual', importeCentavos: 3000000, ...cambios });

test('calendario, próximas sesiones y bajas sobre PostgreSQL real', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  const pedir = async (ruta, metodo = 'GET', datos, status = 200, cuenta = 0) => {
    const r = await e.pedir(cuenta, ruta, metodo, datos);
    assert.equal(r.status, status, `${metodo} ${ruta}: ${JSON.stringify(r.body)}`); return r.body;
  };
  const crear = async (codigo, cuenta = 0) => (await pedir('pacientes', 'POST', { paciente: { codigo, modalidad: 'Virtual', fechaInicioTratamiento: '2026-10-01', motivoConsulta: '', postIt: '' } }, 201, cuenta)).paciente;
  await crear('P-001'); await crear('P-002'); await crear('P-003'); await crear('P-001', 1);
  let primera, segunda;

  await t.test('alta activa sin frecuencia y contador cuenta pacientes, no sesiones', async () => {
    assert.equal((await pedir('pacientes/P-001')).estado, 'Activo');
    assert.equal((await pedir('dashboard')).pendientesAgendar, 3);
    assert.equal((await pedir('pacientes/pendientes-agendar')).length, 3);
    assert.equal((await pedir('dashboard', 'GET', undefined, 200, 1)).pendientesAgendar, 1);
    await pedir('pacientes', 'POST', { paciente: { ...ficha('INVALIDO'), estado: 'Suspendido' } }, 400);
  });

  await t.test('calendario autenticado muestra dos meses, domingos y fechas pasadas deshabilitados', async () => {
    assert.equal((await e.raw('calendario')).status, 401);
    const calendario = await pedir('calendario');
    assert.equal(calendario.desde, '2026-10-05'); assert.equal(calendario.hasta, '2026-11-30');
    assert.equal(calendario.dias[0].fecha, '2026-10-01');
    assert.equal(calendario.dias[0].habilitado, false);
    assert.equal(calendario.dias.find(d => d.fecha === '2026-10-11').habilitado, false);
    assert.deepEqual(calendario.dias.find(d => d.fecha === '2026-10-06').libres, [{ desde: '08:00', hasta: '22:00' }]);
    await pedir('calendario?usuarioId=2', 'GET', undefined, 400);
    await pedir('horarios', 'POST', { fecha: '2026-10-05', horario: '10:00' }, 410);
  });

  await t.test('reserva directa sin cargar horarios; agrega un segundo bloque consecutivo y rechaza otra fecha o un tercero', async () => {
    primera = await pedir('sesiones', 'POST', reserva(), 201);
    assert.equal(primera.horarioFin, '11:00'); assert.equal(primera.duracionMinutos, 60);
    segunda = await pedir('sesiones', 'POST', reserva('P-001', { horario: '11:00', duracionMinutos: 30 }), 201);
    assert.equal((await pedir('dashboard')).pendientesAgendar, 2);
    assert.equal((await pedir('pacientes/P-001/proximas')).length, 2);
    const antes = await e.snapshot();
    await pedir('sesiones', 'POST', reserva('P-001', { fecha: '2026-10-06' }), 409);
    await pedir('sesiones', 'POST', reserva('P-001', { horario: '11:30', duracionMinutos: 30 }), 409);
    assert.deepEqual(await e.snapshot(), antes);
  });

  await t.test('las tarjetas muestran fecha y hora de la primera reserva real, no una etiqueta antigua ni datos ajenos', async () => {
    await e.pool.query('UPDATE public.pacientes SET "proximaSesion" = $1 WHERE "usuarioId" = $2 AND codigo = $3',
      ['VIE 15:31 HS', e.ids[0], 'P-001']);
    const antes = await e.snapshot();
    assert.equal((await pedir('pacientes/P-001')).proximaSesion, '05/10/2026 · 10:00 hs');
    assert.equal((await pedir('pacientes')).find(p => p.codigo === 'P-001').proximaSesion, '05/10/2026 · 10:00 hs');
    assert.equal((await pedir('pacientes/P-002')).proximaSesion, null);
    assert.equal((await pedir('pacientes/P-001', 'GET', undefined, 200, 1)).proximaSesion, null);
    assert.deepEqual(await e.snapshot(), antes, 'Mostrar la próxima sesión no reescribe registros');
  });

  await t.test('rechaza cruces con distinto inicio y distingue propietarios', async () => {
    await pedir('sesiones', 'POST', reserva('P-002', { horario: '10:30', duracionMinutos: 30 }), 409);
    const ajena = await pedir('sesiones', 'POST', reserva(), 201, 1);
    assert.equal(ajena.horario, primera.horario);
    assert.equal((await pedir('calendario', 'GET', undefined, 200, 1)).dias.find(d => d.fecha === '2026-10-05').ocupadas.length, 1);
    for (const ruta of [`sesiones/${primera.id}`, `pacientes/P-002/proximas`, `calendario?excluirSesion=${primera.id}`]) await pedir(ruta, 'GET', undefined, 404, 1);
    await pedir(`sesiones/${primera.id}/cancelar`, 'POST', {}, 404, 1);
    await pedir('pacientes/P-002/baja', 'POST', {}, 404, 1);
  });

  await t.test('navega semanas completas y solo identifica la próxima reserva para Nota, sin exponer el Post-it', async () => {
    const semana = await pedir('calendario?fecha=2026-10-05');
    assert.equal(semana.dias.length, 7);
    assert.equal(semana.dias[0].fecha, '2026-10-05'); assert.equal(semana.dias.at(-1).fecha, '2026-10-11');
    const ocupadas = semana.dias.flatMap(d => d.ocupadas);
    assert.equal(ocupadas.find(s => s.id === primera.id).esProxima, true);
    assert.equal(ocupadas.find(s => s.id === segunda.id).esProxima, false);
    assert.equal(ocupadas.some(s => 'postIt' in s), false);
    const anterior = await pedir('calendario?fecha=2026-09-30');
    assert.equal(anterior.dias[0].fecha, '2026-09-28'); assert.equal(anterior.dias.at(-1).fecha, '2026-10-04');
    assert.equal(anterior.dias.every(d => !d.habilitado), true);
    const ajena = await pedir('calendario?fecha=2026-10-05', 'GET', undefined, 200, 1);
    assert.equal(ajena.dias.flatMap(d => d.ocupadas).some(s => s.id === primera.id), false);
    for (const consulta of ['fecha=2026-02-30', 'fecha=incorrecta', 'fecha=2026-10-05&fecha=2026-10-06', 'fecha=2026-10-05&usuarioId=2']) await pedir('calendario?' + consulta, 'GET', undefined, 400);
  });

  await t.test('duración, límite mensual, domingos, inicio y final se validan en Express sin escribir', async () => {
    const antes = await e.snapshot();
    for (const cambios of [{ duracionMinutos: 15 }, { duracionMinutos: 90 }, { duracionMinutos: '60' }, { horario: '07:45' },
      { horario: '21:30' }, { horario: '12:01' }, { fecha: '2026-12-01' }, { fecha: '2026-10-11' }, { fecha: '2026-10-04' }, { usuarioId: e.ids[1] }]) {
      await pedir('sesiones', 'POST', reserva('P-002', cambios), 400);
    }
    assert.deepEqual(await e.snapshot(), antes);
  });

  await t.test('aumentar duración comprueba el intervalo completo y conserva el borrador remoto ante conflicto', async () => {
    const s = await pedir('sesiones', 'POST', reserva('P-002', { horario: '12:00', duracionMinutos: 30 }), 201);
    await pedir('sesiones', 'POST', reserva('P-003', { horario: '12:30', duracionMinutos: 30 }), 201);
    const antes = await e.snapshot();
    await pedir(`sesiones/${s.id}`, 'PUT', { ...editable(s), duracionMinutos: 60, resumen: 'No guardar' }, 409);
    assert.deepEqual(await e.snapshot(), antes);
    const excluido = await pedir(`calendario?excluirSesion=${s.id}`);
    assert.equal(excluido.dias.find(d => d.fecha === s.fecha).ocupadas.some(o => o.id === s.id), false);
    assert.deepEqual((await pedir('calendario?fecha=2026-10-05')).dias.find(d => d.fecha === s.fecha).libres, [
      { desde: '09:15', hasta: '10:00' },
      { desde: '11:30', hasta: '12:00' },
      { desde: '13:00', hasta: '22:00' },
    ], 'Hoy conserva todas las franjas posteriores a la hora actual, incluido el hueco intermedio');
  });

  await t.test('desagendar conserva importes y permite reutilizar la misma hora, sin resucitar la sesión cancelada', async () => {
    primera = await pedir(`sesiones/${primera.id}`, 'PUT', { ...editable(primera), pagadoCentavos: 500000, resumen: 'Nota de prueba' });
    const cancelada = await pedir(`sesiones/${primera.id}/cancelar`, 'POST', {});
    assert.equal(cancelada.estado, 'Cancelada'); assert.equal(cancelada.pagadoCentavos, 500000); assert.equal(cancelada.resumen, 'Nota de prueba');
    assert.equal((await pedir('pacientes/P-001')).proximaSesion, '05/10/2026 · 11:00 hs');
    await crear('P-004');
    const nueva = await pedir('sesiones', 'POST', reserva('P-004'), 201);
    assert.notEqual(nueva.id, primera.id);
    await pedir(`sesiones/${primera.id}`, 'PUT', { ...editable(cancelada), estado: 'Programada' }, 400);
  });

  await t.test('baja lógica libera las futuras, conserva historial y cobros y retira al paciente de pendientes', async () => {
    const p = await pedir('pacientes/P-001/baja', 'POST', {});
    assert.equal(p.estado, 'De baja');
    assert.equal(p.proximaSesion, null);
    assert.equal((await pedir(`sesiones/${segunda.id}`)).estado, 'Cancelada');
    assert.equal((await pedir(`sesiones/${primera.id}`)).pagadoCentavos, 500000);
    assert.deepEqual(await pedir('pacientes/P-001/proximas'), []);
    assert.equal((await pedir('pacientes/pendientes-agendar')).some(i => i.paciente.codigo === 'P-001'), false);
    await pedir('sesiones', 'POST', reserva('P-001', { fecha: '2026-10-06' }), 409);
    const propio = await pedir('pacientes/P-001', 'GET', undefined, 200, 1);
    assert.equal(propio.estado, 'Activo');
  });

  await t.test('suspendidos y de vacaciones no integran pendientes ni reciben nuevas reservas', async () => {
    for (const estado of ['Suspendido', 'De vacaciones']) {
      await crear('ESTADO-' + (estado === 'Suspendido' ? 'S' : 'V'));
      const codigo = 'ESTADO-' + (estado === 'Suspendido' ? 'S' : 'V');
      await pedir(`pacientes/${codigo}`, 'PUT', { estado });
      assert.equal((await pedir('pacientes/pendientes-agendar')).some(i => i.paciente.codigo === codigo), false);
      await pedir('sesiones', 'POST', reserva(codigo, { fecha: '2026-10-06' }), 409);
    }
  });

  await t.test('el paciente vuelve a pendientes después del final, con última duración, sin confirmar asistencia automáticamente', async () => {
    e.avanzar('2026-10-05T15:31:00Z'); // 12:31 local: P-002 terminó, P-003 sigue en curso.
    const pendientes = await pedir('pacientes/pendientes-agendar');
    const p = pendientes.find(i => i.paciente.codigo === 'P-002');
    assert.equal(p.ultimaSesion.duracionMinutos, 30); assert.equal(p.ultimaSesion.estado, 'Programada');
    const antes = await e.snapshot();
    assert.equal((await pedir('pacientes/P-002')).proximaSesion, null);
    assert.equal((await pedir('pacientes')).find(p => p.codigo === 'P-002').proximaSesion, null);
    assert.notEqual((await pedir('pacientes/P-003')).proximaSesion, null);
    assert.deepEqual(await e.snapshot(), antes, 'Consultar etiquetas no modifica la base');
    assert.equal(pendientes.some(i => i.paciente.codigo === 'P-003'), false);
    assert.deepEqual((await pedir('sesiones/semana')).sesiones, []);
  });

  await t.test('sesión realizada, cobro parcial, histórico y persistencia después de reabrir Express/pool', async () => {
    const [proxima] = await pedir('pacientes/P-003/proximas');
    e.avanzar('2026-10-05T16:30:00Z');
    const realizada = await pedir(`sesiones/${proxima.id}/realizar`, 'POST', {});
    const cobrada = await pedir(`sesiones/${proxima.id}`, 'PUT', { ...editable(realizada), pagadoCentavos: 1000000, resumen: 'Resumen breve' });
    assert.equal(cobrada.pendienteCentavos, 2000000);
    assert.equal((await pedir('sesiones/pendientes')).some(s => s.id === cobrada.id), true);
    await e.reabrir();
    assert.deepEqual(await pedir(`sesiones/${cobrada.id}`), cobrada);
    assert.equal((await pedir('sesiones/semana')).sesiones.some(s => s.id === cobrada.id), true);
  });
});

test('duraciones de 40 y 50 minutos persisten, calculan el fin y rechazan ampliar sobre otra sesión', async t => {
  const e = await entornoApi(t);
  for (const codigo of ['D-040', 'D-050']) {
    const r = await e.pedir(0, 'pacientes', 'POST', { paciente: ficha(codigo) }); assert.equal(r.status, 201);
  }
  const primera = await e.pedir(0, 'sesiones', 'POST', reserva('D-040', { horario: '10:00', duracionMinutos: 40 }));
  assert.equal(primera.status, 201); assert.equal(primera.body.horarioFin, '10:40');
  const segunda = await e.pedir(0, 'sesiones', 'POST', reserva('D-050', { horario: '10:45', duracionMinutos: 50 }));
  assert.equal(segunda.status, 201); assert.equal(segunda.body.horarioFin, '11:35');
  const antes = await e.snapshot();
  const cruce = await e.pedir(0, `sesiones/${primera.body.id}`, 'PUT', { ...editable(primera.body), duracionMinutos: 50 });
  assert.equal(cruce.status, 409);
  const invalida = await e.pedir(0, `sesiones/${primera.body.id}`, 'PUT', { ...editable(primera.body), duracionMinutos: 45 });
  assert.equal(invalida.status, 400); assert.deepEqual(await e.snapshot(), antes);
  const editada = await e.pedir(0, `sesiones/${segunda.body.id}`, 'PUT', { ...editable(segunda.body), duracionMinutos: 40 });
  assert.equal(editada.status, 200); assert.equal(editada.body.horarioFin, '11:25');
  await e.reabrir();
  assert.equal((await e.pedir(0, `sesiones/${primera.body.id}`)).body.duracionMinutos, 40);
  assert.equal((await e.pedir(0, `sesiones/${segunda.body.id}`)).body.duracionMinutos, 40);
});

test('una sesión pasada conserva su paciente aunque cambien la fecha o el estado en el pedido', async t => {
  const e = await entornoApi(t);
  for (const codigo of ['P-001', 'P-002']) {
    assert.equal((await e.pedir(0, 'pacientes', 'POST', { paciente: ficha(codigo) })).status, 201);
  }
  const creada = await e.pedir(0, 'sesiones', 'POST', reserva());
  assert.equal(creada.status, 201);
  // Antes del inicio se conserva la posibilidad de corregir la asignación.
  const futura = await e.pedir(0, `sesiones/${creada.body.id}`, 'PUT', { ...editable(creada.body), codigoPaciente: 'P-002' });
  assert.equal(futura.status, 200);
  assert.equal(futura.body.codigoPaciente, 'P-002');
  e.avanzar('2026-10-05T13:00:00Z'); // 10:00 local, exactamente al inicio.
  const antes = await e.snapshot();
  for (const cambios of [{}, { fecha: '2026-10-06' }, { estado: 'Realizada' }]) {
    const r = await e.pedir(0, `sesiones/${creada.body.id}`, 'PUT', {
      ...editable(futura.body), ...cambios, codigoPaciente: 'P-001', resumen: 'No debe guardarse', pagadoCentavos: 1000000,
    });
    assert.equal(r.status, 409);
    assert.match(r.body.mensaje, /No se puede cambiar el paciente/);
    assert.deepEqual(await e.snapshot(), antes, 'El rechazo no modifica fichas, cobros, notas ni turnos');
  }
  e.avanzar('2026-10-05T15:00:00Z'); // 12:00 local, ya terminó.
  const editada = await e.pedir(0, `sesiones/${creada.body.id}`, 'PUT', {
    ...editable(futura.body), estado: 'Realizada', resumen: 'Resumen actualizado', pagadoCentavos: 1000000,
  });
  assert.equal(editada.status, 200);
  assert.equal(editada.body.codigoPaciente, 'P-002');
  assert.equal(editada.body.pendienteCentavos, 2000000);
  const despues = await e.snapshot();
  assert.equal((await e.pedir(0, `sesiones/${creada.body.id}`, 'PUT', {
    ...editable(editada.body), codigoPaciente: 'P-001', estado: 'Programada',
  })).status, 409);
  assert.deepEqual(await e.snapshot(), despues);
  await e.reabrir();
  assert.deepEqual((await e.pedir(0, `sesiones/${creada.body.id}`)).body, editada.body);
});

test('reservas concurrentes por intervalo y por paciente: una gana y otra recibe conflicto', async t => {
  const e = await entornoApi(t);
  for (const codigo of ['P-001', 'P-002']) assert.equal((await e.pedir(0, 'pacientes', 'POST', { paciente: ficha(codigo) })).status, 201);
  const resultados = await Promise.all(['P-001', 'P-002'].map(codigo => e.pedir(0, 'sesiones', 'POST', reserva(codigo))));
  assert.deepEqual(resultados.map(r => r.status).sort(), [201, 409]);
  const ganador = resultados.find(r => r.status === 201).body.codigoPaciente;
  const nuevas = await Promise.all(['2026-10-06', '2026-10-07'].map(fecha => e.pedir(0, 'sesiones', 'POST', reserva(ganador, { fecha }))));
  assert.deepEqual(nuevas.map(r => r.status), [409, 409]);
});

test('un fallo SQL o COMMIT rechazado revierte paciente, sesión y ocupación y libera el cliente', async t => {
  const e = await entornoApi(t, 'postgres', { maximoConexiones: 1 });
  for (const fallo of ['INSERT INTO public.sesiones', 'COMMIT']) {
    const antes = await e.snapshot();
    const c = await e.pool.connect(); const original = c.query;
    c.query = function (sql, ...args) {
      if (typeof sql === 'string' && sql.startsWith(fallo)) { const error = new Error('Fallo simulado'); error.code = '23503'; throw error; }
      return original.call(this, sql, ...args);
    }; c.release();
    try {
      const r = await e.pedir(0, 'pacientes', 'POST', { paciente: ficha('ROLLBACK'), turno: reservaCalendarioSinPaciente() });
      assert.equal(r.status, 500);
    } finally { c.query = original; }
    assert.deepEqual(await e.snapshot(), antes); assert.equal(e.pool.waitingCount, 0);
  }
});

function reservaCalendarioSinPaciente() { const { codigoPaciente, ...r } = reserva(); return r; }
