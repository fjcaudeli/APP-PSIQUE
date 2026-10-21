import assert from 'node:assert/strict';
import { ficha, editable, reserva } from './api-fixtures.mjs';

// El mismo recorrido HTTP se ejecuta en ambos motores. No accede a SQL ni conoce
// los IDs iniciales: comprueba contratos, reglas y separación desde la API real.
export async function comprobarContrato(t, e) {
  const pedir = async (ruta, metodo = 'GET', datos, status = 200, cuenta = 0) => {
    const r = await e.pedir(cuenta, ruta, metodo, datos);
    assert.equal(r.status, status, metodo + ' ' + ruta);
    return r.body;
  };
  let p, s, b;
  const guardar = async (cambios, status = 200) => {
    const r = await pedir(`sesiones/${s.id}`, 'PUT', { ...editable(s), ...cambios }, status);
    if (status === 200) s = r;
    return r;
  };
  await t.test('todos los endpoints privados requieren JWT; vencidos e inválidos reciben 401', async () => {
    for (const [ruta, metodo] of [
      ['pacientes', 'GET'], ['pacientes/siguiente-codigo', 'GET'], ['pacientes/P-001', 'GET'], ['pacientes', 'POST'], ['pacientes/P-001', 'PUT'],
      ['agenda', 'GET'], ['dashboard', 'GET'], ['horarios/disponibles', 'GET'], ['horarios/2026-10-05/10:00', 'GET'], ['horarios', 'POST'],
      ['sesiones/semana', 'GET'], ['sesiones/pendientes', 'GET'], ['sesiones/1', 'GET'], ['sesiones', 'POST'], ['sesiones/1/realizar', 'POST'], ['sesiones/1', 'PUT'],
    ]) {
      const r = await e.raw(ruta, { metodo });
      assert.equal(r.status, 401);
      assert.deepEqual(r.body, { mensaje: 'Iniciá sesión para acceder a PSIQUE.' });
    }
    for (const bearer of ['invalido', await e.token(0, { iat: 1, exp: 2 })]) assert.equal((await e.raw('dashboard', { bearer })).status, 401);
    assert.equal((await e.raw('dashboard', { bearer: e.cuentas[0].token })).status, 200);
  });
  await t.test('base vacía: siete días, colecciones vacías y cantidades numéricas', async () => {
    assert.deepEqual(await pedir('dashboard'), { pacientesActivos: 0, sesionesSemana: 0, pendientesCobro: 0, horariosDisponibles: 0 });
    assert.deepEqual(await pedir('pacientes'), []);
    const agenda = await pedir('agenda');
    assert.equal(agenda.dias.length, 7);
    assert.equal(agenda.dias[0].fecha, '2026-10-05');
    assert.equal(agenda.dias[6].fecha, '2026-10-11');
    assert.deepEqual(agenda.dias.flatMap(d => d.turnos), []);
    assert.deepEqual(await pedir('sesiones/semana'), { desde: '2026-10-05', hasta: '2026-10-11', sesiones: [] });
    assert.deepEqual(await pedir('horarios/disponibles'), { desde: '2026-10-05', hasta: '2026-10-11', horarios: [] });
    assert.deepEqual(await pedir('sesiones/pendientes'), []);
  });
  await t.test('altas automáticas/personalizadas, null, textos y duplicados por cuenta', async () => {
    assert.deepEqual(await pedir('pacientes/siguiente-codigo'), { codigo: 'P-001' });
    p = (await pedir('pacientes', 'POST', { paciente: ficha() }, 201)).paciente;
    assert.deepEqual(p, { ...ficha('P-001'), fechaCreacion: '2026-10-05' });
    assert.deepEqual(await pedir('pacientes/siguiente-codigo'), { codigo: 'P-002' });
    const personalizado = { ...ficha(' Alias_2 '), horarioHabitual: '00:00', diaHabitual: 'Miércoles', postIt: "  Nota ficticia 'prueba'  " };
    assert.deepEqual((await pedir('pacientes', 'POST', { paciente: personalizado }, 201)).paciente,
      { ...personalizado, codigo: 'Alias_2', postIt: "Nota ficticia 'prueba'", fechaCreacion: '2026-10-05' });
    assert.deepEqual(await pedir('pacientes', 'POST', { paciente: ficha('alias_2') }, 409), { mensaje: 'Ya existe un paciente con ese código.' });
    assert.equal((await pedir('pacientes', 'POST', { paciente: ficha('   ') }, 201)).paciente.codigo, 'P-002');
    b = (await pedir('pacientes', 'POST', { paciente: ficha('P-001') }, 201, 1)).paciente;
    await pedir('pacientes', 'POST', { paciente: ficha('SOLO-B') }, 201, 1);
    await pedir('pacientes', 'POST', { paciente: ficha('SOLO-A') }, 201);
  });
  await t.test('validaciones de paciente y fecha de creación inmutable conservan mensajes', async () => {
    for (const cambios of [
      { codigo: 'ABCDEFGHIJKLM' }, { codigo: 'NUEVO' }, { codigo: 'á' }, { codigo: null }, { usuarioId: e.ids[1] },
      { modalidad: 'Mixta' }, { estado: '' }, { frecuencia: 'x'.repeat(41) }, { diaHabitual: 'Otro' },
      { horarioHabitual: '24:00' }, { fechaInicioTratamiento: '2026-02-29' }, { motivoConsulta: null }, { postIt: 'x'.repeat(301) },
      { proximaSesion: 'x'.repeat(31) }, { fechaCreacion: '2026-10-05' },
    ]) await pedir('pacientes', 'POST', { paciente: { ...ficha('INV'), ...cambios } }, 400);
    await pedir('pacientes/P-001', 'PUT', { ...p, fechaCreacion: '2026-10-04' }, 400);
    const { fechaCreacion: _fecha, ...sinFecha } = p;
    p = await pedir('pacientes/P-001', 'PUT', { ...sinFecha, frecuencia: 'Mensual', postIt: 'Cambio de prueba.' });
    assert.equal(p.fechaCreacion, '2026-10-05');
    assert.equal((await pedir('pacientes')).length, 4);
    await pedir('pacientes/P-001', 'PUT', { ...p, codigo: 'ALIAS_2' }, 409);
  });
  await t.test('fichas ajenas y SQL como dato se tratan como inexistentes', async () => {
    for (const codigo of ['SOLO-B', "P-001' OR '1'='1"]) {
      await pedir('pacientes/' + encodeURIComponent(codigo), 'GET', undefined, 404);
      await pedir('pacientes/' + encodeURIComponent(codigo), 'PUT', p, 404);
    }
    assert.deepEqual(await pedir('pacientes/P-001', 'GET', undefined, 200, 1), b);
  });
  await t.test('horarios futuros, duplicados, misma hora para distintos profesionales', async () => {
    for (const horario of ['10:00', '11:00', '12:00', '13:00', '14:00']) await pedir('horarios', 'POST', { fecha: '2026-10-05', horario }, 201);
    await pedir('horarios', 'POST', { fecha: '2026-10-05', horario: '10:00' }, 201, 1);
    await pedir('horarios', 'POST', { fecha: '2026-10-06', horario: '17:00' }, 201, 1);
    await pedir('horarios', 'POST', { fecha: '2026-10-05', horario: '10:00' }, 409);
    for (const datos of [
      { fecha: '2026-10-05', horario: '09:00' }, { fecha: '2026-10-04', horario: '23:59' },
      { fecha: '2026-02-30', horario: '10:00' }, { fecha: '2026-10-06', horario: '24:00' },
      { fecha: '2026-10-06', horario: '9:00' }, { fecha: '2026-10-06', horario: '15:00', usuarioId: e.ids[1] },
    ]) await pedir('horarios', 'POST', datos, 400);
    assert.deepEqual(await pedir('horarios/2026-10-05/10:00'), { fecha: '2026-10-05', horario: '10:00', estado: 'Disponible', codigoPaciente: null, modalidad: null, sesionId: null });
    assert.equal((await pedir('horarios/disponibles')).horarios.length, 5);
  });
  await t.test('reserva sesión, importes numéricos y próxima sesión; conflictos y referencias ajenas', async () => {
    s = await pedir('sesiones', 'POST', reserva(), 201);
    assert.equal(typeof s.id, 'number');
    assert.deepEqual({ ...s, id: 0 }, { id: 0, ...reserva(), estado: 'Programada', pagadoCentavos: 0, pendienteCentavos: 123456 });
    assert.equal((await pedir('pacientes/P-001')).proximaSesion, 'LUN 10:00 HS');
    assert.equal((await pedir('horarios/2026-10-05/10:00')).sesionId, s.id);
    assert.equal((await pedir('agenda')).dias[0].turnos[0].sesionId, s.id);
    await pedir('sesiones', 'POST', reserva(), 409);
    await pedir('sesiones', 'POST', reserva('SOLO-B', '11:00'), 404);
    await pedir('sesiones', 'POST', reserva('P-001', '17:00', '2026-10-06'), 404);
    await pedir('horarios/2026-10-06/17:00', 'GET', undefined, 404);
    for (const importeCentavos of [-1, 0.5, 1000000000, '100', null]) await pedir('sesiones', 'POST', { ...reserva('P-001', '11:00'), importeCentavos }, 400);
  });
  await t.test('alta con reserva atómica, devolución de ficha actualizada y rollback de conflictos', async () => {
    const turno = { fecha: '2026-10-05', horario: '11:00', modalidad: 'Presencial', importeCentavos: 10000 };
    const alta = await pedir('pacientes', 'POST', { paciente: ficha('Con-Reserva'), turno }, 201);
    assert.equal(alta.paciente.proximaSesion, 'LUN 11:00 HS');
    assert.equal(alta.sesion.codigoPaciente, 'Con-Reserva');
    await pedir('pacientes', 'POST', { paciente: ficha('Sin-Huerfano'), turno }, 409);
    await pedir('pacientes/Sin-Huerfano', 'GET', undefined, 404);
    await pedir('pacientes', 'POST', { paciente: ficha('Ajeno'), turno: { ...turno, fecha: '2026-10-06', horario: '17:00' } }, 404);
    await pedir('pacientes/Ajeno', 'GET', undefined, 404);
  });
  await t.test('cobros validados, sesión futura y realización exclusivamente manual', async () => {
    for (const cambios of [
      { importeCentavos: -1 }, { pagadoCentavos: -1 }, { pagadoCentavos: 123457 }, { importeCentavos: '100' },
      { pagadoCentavos: 0.5 }, { estado: 'Realizada' }, { id: s.id }, { pendienteCentavos: 0 }, { usuarioId: e.ids[1] },
    ]) await guardar(cambios, 400);
    await pedir(`sesiones/${s.id}`, 'PUT', { importeCentavos: 1 }, 400);
    await guardar({ pagadoCentavos: 23456 });
    assert.equal(s.pendienteCentavos, 100000);
    assert.deepEqual(await pedir('sesiones/pendientes'), []);
    await pedir(`sesiones/${s.id}/realizar`, 'POST', undefined, 400);
    e.avanzar('2026-10-05T13:01:00Z');
    assert.equal((await pedir(`sesiones/${s.id}`)).estado, 'Programada');
    assert.deepEqual((await pedir('sesiones/semana')).sesiones, []);
    s = await pedir(`sesiones/${s.id}/realizar`, 'POST');
    assert.equal(s.estado, 'Realizada');
    assert.deepEqual(await pedir(`sesiones/${s.id}/realizar`, 'POST'), s);
    assert.deepEqual((await pedir('sesiones/semana')).sesiones, [s]);
    assert.deepEqual(await pedir('sesiones/pendientes'), [s]);
    assert.deepEqual(await pedir('dashboard'), { pacientesActivos: 5, sesionesSemana: 1, pendientesCobro: 1, horariosDisponibles: 3 });
  });
  await t.test('sesiones y cobros ajenos 404; referencias y contadores filtrados por JWT', async () => {
    const ajena = await pedir('sesiones', 'POST', reserva('P-001', '10:00'), 400, 1); // Ya pasó; el horario no habilita reservas retroactivas.
    assert.equal(typeof ajena.mensaje, 'string');
    const sb = await pedir('sesiones', 'POST', reserva('P-001', '17:00', '2026-10-06'), 201, 1);
    b = { ...b, proximaSesion: 'MAR 17:00 HS' };
    await pedir(`sesiones/${sb.id}`, 'GET', undefined, 404);
    await pedir(`sesiones/${sb.id}`, 'PUT', { ...editable(sb), pagadoCentavos: 1 }, 404);
    await pedir(`sesiones/${sb.id}/realizar`, 'POST', undefined, 404);
    await pedir(`sesiones/${s.id}`, 'GET', undefined, 404, 1);
    await guardar({ codigoPaciente: 'SOLO-B' }, 404);
    assert.deepEqual(await pedir(`sesiones/${sb.id}`, 'GET', undefined, 200, 1), sb);
    assert.deepEqual(await pedir('sesiones/pendientes', 'GET', undefined, 200, 1), []);
    assert.deepEqual(await pedir('dashboard', 'GET', undefined, 200, 1), { pacientesActivos: 2, sesionesSemana: 0, pendientesCobro: 0, horariosDisponibles: 0 });
  });
  await t.test('renombrado diferido, cambio solo de mayúsculas y conservación de relaciones', async () => {
    const original = s;
    p = await pedir('pacientes/P-001');
    p = await pedir('pacientes/P-001', 'PUT', { ...p, codigo: 'Cambio' });
    await pedir('pacientes/P-001', 'GET', undefined, 404);
    s = await pedir(`sesiones/${s.id}`);
    assert.deepEqual(s, { ...original, codigoPaciente: 'Cambio' });
    assert.equal((await pedir('horarios/2026-10-05/10:00')).codigoPaciente, 'Cambio');
    p = await pedir('pacientes/Cambio', 'PUT', { ...p, codigo: 'cambio' });
    s = await pedir(`sesiones/${s.id}`);
    assert.equal(s.codigoPaciente, 'cambio');
    assert.deepEqual(await pedir('pacientes/P-001', 'GET', undefined, 200, 1), b);
  });
  await t.test('reprogramación completa sincroniza ambos pacientes y libera el horario anterior', async () => {
    const viejo = s;
    await guardar({ fecha: '2026-10-06', horario: '16:30', codigoPaciente: 'Alias_2', modalidad: 'Presencial', estado: 'Programada', importeCentavos: 350050, pagadoCentavos: 120025 });
    assert.equal(s.id, viejo.id);
    assert.equal(s.pendienteCentavos, 230025);
    assert.deepEqual(await pedir(`horarios/${viejo.fecha}/${viejo.horario}`), { fecha: viejo.fecha, horario: viejo.horario, estado: 'Liberado', codigoPaciente: null, modalidad: null, sesionId: null });
    assert.equal((await pedir('horarios/2026-10-06/16:30')).sesionId, s.id);
    assert.equal((await pedir('pacientes/cambio')).proximaSesion, null);
    assert.equal((await pedir('pacientes/Alias_2')).proximaSesion, 'MAR 16:30 HS');
    assert.deepEqual(await pedir('sesiones/pendientes'), []);
    await guardar({ fecha: '2026-10-05', horario: '11:00' }, 409);
    assert.deepEqual(await pedir(`sesiones/${s.id}`), s);
    await guardar({ fecha: '2026-10-05', horario: '13:00' }); // Disponible existente.
    await guardar({ fecha: '2026-10-06', horario: '16:30' }); // Liberado existente.
    await guardar({ fecha: '2026-10-06', horario: '17:00' }); // B ocupa ese mismo horario; A crea uno propio.
    assert.equal((await pedir('horarios/2026-10-06/17:00', 'GET', undefined, 200, 1)).codigoPaciente, 'P-001');
  });
  await t.test('histórico anterior, centavos máximos, cobro completo y estado corregido', async () => {
    await guardar({ fecha: '2026-09-30', horario: '09:30', estado: 'Realizada', importeCentavos: 999999999, pagadoCentavos: 999999998 });
    assert.deepEqual((await pedir('sesiones/semana?fecha=2026-09-28')).sesiones, [s]);
    assert.deepEqual((await pedir('sesiones/semana')).sesiones, []);
    assert.equal((await pedir('sesiones/pendientes'))[0].pendienteCentavos, 1);
    assert.equal((await pedir('dashboard')).sesionesSemana, 0);
    await guardar({ estado: 'Programada' });
    assert.deepEqual(await pedir('sesiones/pendientes'), []);
    await guardar({ estado: 'Realizada', pagadoCentavos: 999999999 });
    assert.equal(s.pendienteCentavos, 0);
    assert.deepEqual(await pedir('sesiones/pendientes'), []);
    await guardar({ importeCentavos: 0, pagadoCentavos: 0 });
  });
  await t.test('cerca de medianoche: fechas locales y límites de semana sin conversiones UTC', async () => {
    e.avanzar('2026-10-05T01:00:00Z'); // Domingo 22:00 en Buenos Aires.
    assert.equal((await pedir('pacientes', 'POST', { paciente: ficha('Local') }, 201)).paciente.fechaCreacion, '2026-10-04');
    assert.equal((await pedir('agenda')).dias[6].fecha, '2026-10-04');
    await guardar({ fecha: '2026-10-04', horario: '22:01', estado: 'Realizada' }, 400);
    await guardar({ fecha: '2026-10-05', horario: '00:00', estado: 'Realizada' }, 400);
    await guardar({ fecha: '2026-10-04', horario: '22:00', estado: 'Realizada' });
    assert.equal((await pedir('sesiones/semana')).sesiones.length, 1);
    e.avanzar('2026-10-05T03:01:00Z'); // Lunes 00:01 local.
    assert.deepEqual((await pedir('sesiones/semana')).sesiones, []);
    assert.equal((await pedir('sesiones/semana?fecha=2026-10-04')).sesiones[0].horario, '22:00');
    assert.equal((await pedir('sesiones/pendientes')).length, 0);
  });
  await t.test('histórico cruza año, lunes 00:00 y domingo 23:59 con orden descendente', async () => {
    e.avanzar('2027-01-04T15:00:00Z');
    const citas = [];
    for (const [fecha, horario] of [['2026-12-27', '23:59'], ['2026-12-28', '00:00'], ['2027-01-03', '23:59'], ['2027-01-04', '00:00']]) {
      // La edición permite corregir el pasado: no se necesita sembrar filas por SQL.
      await pedir('horarios', 'POST', { fecha: '2027-01-05', horario: `${10 + citas.length}:00` }, 201);
      const nueva = await pedir('sesiones', 'POST', reserva('Local', `${10 + citas.length}:00`, '2027-01-05'), 201);
      citas.push(await pedir(`sesiones/${nueva.id}`, 'PUT', { ...editable(nueva), fecha, horario, estado: 'Realizada' }));
    }
    assert.deepEqual((await pedir('sesiones/semana?fecha=2027-01-01')).sesiones.map(s => [s.fecha, s.horario]), [['2027-01-03', '23:59'], ['2026-12-28', '00:00']]);
    assert.deepEqual((await pedir('sesiones/semana')).sesiones.map(s => s.fecha), ['2027-01-04']);
    assert.equal((await pedir('dashboard')).sesionesSemana, 1);
  });
  await t.test('errores 400/404/413 mantienen formatos y no revelan SQL', async () => {
    for (const ruta of ['agenda?fecha=2026-02-30', 'agenda?fecha[]=2026-10-05', 'horarios/disponibles?otro=1',
      'sesiones/semana?fecha=0000-01-01', 'sesiones/semana?fecha=2026-10-05&fecha=2026-10-06', 'horarios/2026-02-30/10:00']) await pedir(ruta, 'GET', undefined, 400);
    for (const id of ['0', 'no-numero', '2147483648', '9007199254740991', '999999999999999999999']) {
      await pedir('sesiones/' + id, 'GET', undefined, 404);
      await pedir('sesiones/' + id, 'PUT', {}, 404);
      await pedir('sesiones/' + id + '/realizar', 'POST', undefined, 404);
    }
    for (const [texto, status, mensaje] of [['{"codigo":', 400, 'El cuerpo de la solicitud debe contener JSON válido.'], [JSON.stringify({ postIt: 'x'.repeat(33 * 1024) }), 413, 'La ficha enviada supera el tamaño permitido de 32 KB.']]) {
      const r = await e.raw('pacientes/cambio', { metodo: 'PUT', texto, bearer: await e.token() });
      assert.equal(r.status, status); assert.deepEqual(r.body, { mensaje });
    }
    for (const metodo of ['DELETE', 'PATCH', 'PUT']) await pedir('pacientes', metodo, undefined, 404);
  });
  await t.test('fechas extremas de tratamiento, textos máximos, frecuencia libre y estados sin distinguir mayúsculas', async () => {
    const inicial = await pedir('dashboard');
    const maxima = { ...ficha('A12345678901'), estado: 'aCtIvO', frecuencia: 'x'.repeat(40),
      proximaSesion: 'x'.repeat(30), diaHabitual: 'Sábado', horarioHabitual: '23:59',
      fechaInicioTratamiento: '0001-01-01', motivoConsulta: 'x'.repeat(3000), postIt: 'x'.repeat(300) };
    const creada = (await pedir('pacientes', 'POST', { paciente: maxima }, 201)).paciente;
    assert.deepEqual(creada, { ...maxima, fechaCreacion: '2027-01-04' });
    assert.equal((await pedir('dashboard')).pacientesActivos, inicial.pacientesActivos + 1);
    const editada = await pedir('pacientes/A12345678901', 'PUT', { ...creada, fechaInicioTratamiento: '9999-12-31',
      frecuencia: 'Personalizada', diaHabitual: null, horarioHabitual: null, proximaSesion: null, motivoConsulta: '', postIt: '' });
    assert.equal(editada.fechaInicioTratamiento, '9999-12-31');
    assert.equal(editada.horarioHabitual, null);
    assert.equal(editada.frecuencia, 'Personalizada');
    assert.deepEqual(await pedir('pacientes/A12345678901'), editada);
  });
  return e.transcript;
}
