// Referencia de la API anterior al calendario. Sus reglas fueron reemplazadas por el rework.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { comprobarContrato } from './contrato-api.mjs';
import { entornoApi, ficha, reserva, editable } from '../api-fixtures.mjs';
import { conexionPruebas } from '../fixtures.mjs';

let cantidadesIniciales;
async function cantidades() {
  const c = await conexionPruebas();
  try {
    return (await c.query(`SELECT 'usuarios' AS tabla, count(*)::integer AS n FROM public.usuarios
      UNION ALL SELECT 'pacientes', count(*)::integer FROM public.pacientes
      UNION ALL SELECT 'turnos', count(*)::integer FROM public.turnos
      UNION ALL SELECT 'sesiones', count(*)::integer FROM public.sesiones ORDER BY tabla`)).rows;
  } finally { await c.end(); }
}
before(async () => { cantidadesIniciales = await cantidades(); });
after(async () => { assert.deepEqual(await cantidades(), cantidadesIniciales); });

test('la API completa PostgreSQL conserva los contratos SQLite con datos equivalentes', async t => {
  const transcripciones = [];
  for (const motor of ['sqlite', 'postgres']) {
    await t.test(motor, async t => {
      transcripciones.push(await comprobarContrato(t, await entornoApi(t, motor)));
    });
  }
  await t.test('mismos códigos HTTP y JSON, normalizando solo IDs autogenerados', () => {
    assert.ok(transcripciones[0].length > 180);
    assert.deepEqual(transcripciones[1], transcripciones[0]);
    t.diagnostic(`Se compararon ${transcripciones[0].length} respuestas HTTP de negocio por motor.`);
  });
});

async function preparar(t, opciones) {
  const e = await entornoApi(t, 'postgres', opciones);
  const crear = async (cuenta, codigo) => {
    const r = await e.pedir(cuenta, 'pacientes', 'POST', { paciente: ficha(codigo) });
    assert.equal(r.status, 201);
    return r.body.paciente;
  };
  const horario = async (hora, cuenta = 0) => {
    const r = await e.pedir(cuenta, 'horarios', 'POST', { fecha: '2026-10-05', horario: hora });
    assert.equal(r.status, 201);
  };
  await crear(0, 'P-001');
  return { ...e, get pool() { return e.pool; }, crear, horario };
}

// Interceptamos solamente un cliente ya abierto en una instancia exclusiva con
// max=1. El SQL real anterior al fallo permanece dentro de la transacción real.
async function conConsultaInterceptada(e, interceptar, operacion) {
  const cliente = await e.pool.connect();
  const original = cliente.query;
  const ejecutar = original.bind(cliente);
  cliente.query = function (sql, ...args) { return interceptar(sql, args, ejecutar, cliente); };
  cliente.release();
  try { return await operacion(); }
  finally { cliente.query = original; }
}

test('reservas simultáneas: un ganador por horario en ambos motores', async t => {
  for (const motor of ['sqlite', 'postgres']) await t.test(motor, async t => {
    const e = await entornoApi(t, motor);
    await e.pedir(0, 'pacientes', 'POST', { paciente: ficha('P-001') });
    await e.pedir(0, 'horarios', 'POST', { fecha: '2026-10-05', horario: '10:00' });
    const resultados = await Promise.all([e.pedir(0, 'sesiones', 'POST', reserva()), e.pedir(0, 'sesiones', 'POST', reserva())]);
    assert.deepEqual(resultados.map(r => r.status).sort(), [201, 409]);
    assert.equal((await e.pedir(0, 'horarios/2026-10-05/10:00')).body.sesionId, resultados.find(r => r.status === 201).body.id);
  });
});

test('altas automáticas concurrentes se recalculan bajo el bloqueo del profesional', async t => {
  const e = await entornoApi(t);
  const r = await Promise.all(Array.from({ length: 6 }, () => e.pedir(0, 'pacientes', 'POST', { paciente: ficha() })));
  assert.deepEqual(r.map(r => r.status), [201, 201, 201, 201, 201, 201]);
  assert.deepEqual(r.map(r => r.body.paciente.codigo).sort(), ['P-001', 'P-002', 'P-003', 'P-004', 'P-005', 'P-006']);
  assert.equal(e.pool.waitingCount, 0);
  const duplicados = await Promise.all(['Unico', 'uNICO'].map(codigo => e.pedir(0, 'pacientes', 'POST', { paciente: ficha(codigo) })));
  assert.deepEqual(duplicados.map(r => r.status).sort(), [201, 409]);
});

test('dos altas con reserva simultáneas no dejan paciente huérfano', async t => {
  const e = await preparar(t);
  await e.horario('10:00');
  const resultados = await Promise.all(['Ganador-A', 'Ganador-B'].map(codigo => e.pedir(0, 'pacientes', 'POST', {
    paciente: ficha(codigo), turno: { fecha: '2026-10-05', horario: '10:00', modalidad: 'Virtual', importeCentavos: 100 },
  })));
  assert.deepEqual(resultados.map(r => r.status).sort(), [201, 409]);
  const pacientes = (await e.pedir(0, 'pacientes')).body;
  assert.equal(pacientes.length, 2);
  assert.equal(pacientes.filter(p => p.codigo.startsWith('Ganador-')).length, 1);
});

test('reprogramaciones concurrentes hacia un turno nuevo conservan al perdedor', async t => {
  const e = await preparar(t);
  for (const hora of ['10:00', '11:00']) await e.horario(hora);
  const sesiones = [];
  for (const hora of ['10:00', '11:00']) sesiones.push((await e.pedir(0, 'sesiones', 'POST', reserva('P-001', hora))).body);
  const resultados = await Promise.all(sesiones.map(s => e.pedir(0, `sesiones/${s.id}`, 'PUT', { ...editable(s), fecha: '2026-10-06', horario: '15:00' })));
  assert.deepEqual(resultados.map(r => r.status).sort(), [200, 409]);
  const ganador = resultados.find(r => r.status === 200).body;
  assert.equal((await e.pedir(0, 'horarios/2026-10-06/15:00')).body.sesionId, ganador.id);
  const perdedor = sesiones.find(s => s.id !== ganador.id);
  assert.deepEqual((await e.pedir(0, `sesiones/${perdedor.id}`)).body, perdedor);
});

test('horarios duplicados concurrentes producen 201/409 y permiten mismo horario en otra cuenta', async t => {
  const e = await preparar(t);
  const datos = { fecha: '2026-10-05', horario: '10:00' };
  const r = await Promise.all([e.pedir(0, 'horarios', 'POST', datos), e.pedir(0, 'horarios', 'POST', datos)]);
  assert.deepEqual(r.map(r => r.status).sort(), [201, 409]);
  assert.equal((await e.pedir(1, 'horarios', 'POST', datos)).status, 201);
});

test('bloquear A no bloquea las escrituras de B y A continúa al liberar su fila', { timeout: 12000 }, async t => {
  const e = await preparar(t);
  const c = await conexionPruebas();
  let pendiente, temporizador;
  try {
    await c.query('BEGIN');
    await c.query('SELECT id FROM public.usuarios WHERE id = $1 FOR UPDATE', [e.ids[0]]);
    let completo = false;
    pendiente = e.pedir(0, 'pacientes', 'POST', { paciente: ficha('Espera-A') }).then(r => { completo = true; return r; });
    const deB = await Promise.race([
      e.pedir(1, 'pacientes', 'POST', { paciente: ficha('Independ-B') }),
      new Promise((_, reject) => { temporizador = setTimeout(() => reject(new Error('B quedó bloqueado por A')), 2000); }),
    ]);
    clearTimeout(temporizador);
    assert.equal(deB.status, 201);
    assert.equal(completo, false);
    await c.query('COMMIT');
    assert.equal((await pendiente).status, 201);
  } finally {
    clearTimeout(temporizador);
    await c.query('ROLLBACK'); await c.end();
    if (pendiente) await pendiente;
  }
});

test('espera de bloqueo limitada: 503, rollback y recuperación posterior', { timeout: 12000 }, async t => {
  const e = await preparar(t);
  const c = await conexionPruebas();
  try {
    await c.query('BEGIN');
    await c.query('SELECT id FROM public.usuarios WHERE id = $1 FOR UPDATE', [e.ids[0]]);
    const inicio = Date.now();
    const r = await e.pedir(0, 'pacientes', 'POST', { paciente: ficha('Limite') });
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { mensaje: 'El servicio no está disponible. Intentá nuevamente.' });
    assert.ok(Date.now() - inicio < 7000);
  } finally { await c.query('ROLLBACK'); await c.end(); }
  assert.equal((await e.pedir(0, 'pacientes/Limite')).status, 404);
  assert.equal((await e.pedir(0, 'pacientes', 'POST', { paciente: ficha('Limite') })).status, 201);
  assert.equal(e.pool.waitingCount, 0);
});

test('fallo SQL después de insertar paciente y asignar turno revierte todo', async t => {
  const e = await preparar(t, { maximoConexiones: 1 });
  await e.horario('10:00');
  const anterior = await e.snapshot();
  await conConsultaInterceptada(e, (sql, args, ejecutar) => sql.startsWith('INSERT INTO public.sesiones')
    ? ejecutar('SELECT 1 / 0') : ejecutar(sql, ...args), async () => {
    const r = await e.pedir(0, 'pacientes', 'POST', {
      paciente: ficha('Rollback'), turno: { fecha: '2026-10-05', horario: '10:00', modalidad: 'Virtual', importeCentavos: 10000 },
    });
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { mensaje: 'No se pudo completar la operación' });
  });
  assert.deepEqual(await e.snapshot(), anterior);
  assert.equal(e.pool.idleCount, e.pool.totalCount);
});

test('fallo durante renombrado revierte ficha, referencias y notas', async t => {
  const e = await preparar(t, { maximoConexiones: 1 });
  await e.horario('10:00'); await e.pedir(0, 'sesiones', 'POST', reserva());
  const p = (await e.pedir(0, 'pacientes/P-001')).body;
  const anterior = await e.snapshot();
  await conConsultaInterceptada(e, (sql, args, ejecutar) => sql.startsWith('UPDATE public.turnos SET "codigoPaciente" = $1 WHERE')
    ? ejecutar('SELECT 1 / 0') : ejecutar(sql, ...args), async () => {
    assert.equal((await e.pedir(0, 'pacientes/P-001', 'PUT', { ...p, codigo: 'Renombrado', postIt: 'Prueba de rollback.' })).status, 500);
  });
  assert.deepEqual(await e.snapshot(), anterior);
});

test('fallo después de crear destino de reprogramación no deja un turno parcial', async t => {
  const e = await preparar(t, { maximoConexiones: 1 });
  await e.horario('10:00');
  const s = (await e.pedir(0, 'sesiones', 'POST', reserva())).body;
  const anterior = await e.snapshot();
  await conConsultaInterceptada(e, (sql, args, ejecutar) => sql.startsWith('UPDATE public.sesiones SET fecha')
    ? ejecutar('SELECT 1 / 0') : ejecutar(sql, ...args), async () => {
    assert.equal((await e.pedir(0, `sesiones/${s.id}`, 'PUT', { ...editable(s), fecha: '2026-10-06', horario: '15:00' })).status, 500);
  });
  assert.deepEqual(await e.snapshot(), anterior);
});

test('un COMMIT rechazado por FK diferida no devuelve éxito ni deja cambios', async t => {
  const e = await preparar(t, { maximoConexiones: 1 });
  await e.horario('10:00'); await e.pedir(0, 'sesiones', 'POST', reserva());
  const anterior = await e.snapshot();
  const p = (await e.pedir(0, 'pacientes/P-001')).body;
  await conConsultaInterceptada(e, async (sql, args, ejecutar) => {
    if (sql === 'COMMIT') await ejecutar('UPDATE public.turnos SET "codigoPaciente" = $1 WHERE "usuarioId" = $2', ['Fantasma', e.ids[0]]);
    return ejecutar(sql, ...args);
  }, async () => {
    const r = await e.pedir(0, 'pacientes/P-001', 'PUT', { ...p, codigo: 'Nuevo-Codigo' });
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { mensaje: 'No se pudo completar la operación' });
  });
  assert.deepEqual(await e.snapshot(), anterior);
});

test('una respuesta de alta espera al COMMIT efectivo', async t => {
  const e = await preparar(t, { maximoConexiones: 1 });
  const c = await conexionPruebas();
  let liberar, llego;
  const esperando = new Promise(resolve => { llego = resolve; });
  const permiso = new Promise(resolve => { liberar = resolve; });
  try {
    await conConsultaInterceptada(e, async (sql, args, ejecutar) => {
      if (sql === 'COMMIT') { llego(); await permiso; }
      return ejecutar(sql, ...args);
    }, async () => {
      let respondio = false;
      const pendiente = e.pedir(0, 'pacientes', 'POST', { paciente: ficha('Confirmado') }).then(r => { respondio = true; return r; });
      try {
        await esperando;
        assert.equal(respondio, false);
        assert.equal((await c.query('SELECT 1 FROM public.pacientes WHERE "usuarioId" = $1 AND codigo = $2', [e.ids[0], 'Confirmado'])).rowCount, 0);
      } finally { liberar(); }
      assert.equal((await pendiente).status, 201);
      assert.equal((await c.query('SELECT 1 FROM public.pacientes WHERE "usuarioId" = $1 AND codigo = $2', [e.ids[0], 'Confirmado'])).rowCount, 1);
    });
  } finally { liberar(); await c.end(); }
});

test('Dashboard ve una sola instantánea antes y después de un alta con reserva', async t => {
  const e = await preparar(t);
  await e.horario('10:00');
  let liberar, llego;
  const esperando = new Promise(resolve => { llego = resolve; });
  const permiso = new Promise(resolve => { liberar = resolve; });
  await conConsultaInterceptada(e, async (sql, args, ejecutar) => {
    if (sql === 'COMMIT') { llego(); await permiso; }
    return ejecutar(sql, ...args);
  }, async () => {
    const pendiente = e.pedir(0, 'pacientes', 'POST', { paciente: ficha('Atomico'),
      turno: { fecha: '2026-10-05', horario: '10:00', modalidad: 'Virtual', importeCentavos: 100 } });
    try {
      await esperando;
      assert.deepEqual((await e.pedir(0, 'dashboard')).body,
        { pacientesActivos: 1, sesionesSemana: 0, pendientesCobro: 0, horariosDisponibles: 1 });
    } finally { liberar(); }
    assert.equal((await pendiente).status, 201);
  });
  assert.deepEqual((await e.pedir(0, 'dashboard')).body,
    { pacientesActivos: 2, sesionesSemana: 0, pendientesCobro: 0, horariosDisponibles: 0 });
});

test('lecturas clínicas traducen infraestructura a 503 y SQL inesperado a 500', async t => {
  const e = await preparar(t, { maximoConexiones: 1 });
  for (const [code, status] of [['08006', 503], ['42P01', 500]]) {
    await conConsultaInterceptada(e, (sql, args, ejecutar) => {
      if (sql.includes('FROM public.pacientes WHERE "usuarioId" = $1 ORDER BY')) {
        // pool.query usa callback en el cliente; conservamos ese mecanismo para
        // que también libere la conexión al recibir el fallo de lectura.
        const callback = args.at(-1);
        assert.equal(typeof callback, 'function');
        callback(Object.assign(new Error('Fallo ficticio'), { code }));
        return;
      }
      return ejecutar(sql, ...args);
    }, async () => {
      const r = await e.pedir(0, 'pacientes');
      assert.equal(r.status, status);
      assert.deepEqual(r.body, { mensaje: status === 503 ? 'El servicio no está disponible. Intentá nuevamente.' : 'No se pudo completar la operación' });
    });
  }
  assert.equal((await e.pedir(0, 'pacientes')).status, 200);
});

test('datos y JWT persisten al cerrar y reabrir todas las conexiones de la API', async t => {
  const e = await preparar(t);
  await e.horario('10:00');
  const s = (await e.pedir(0, 'sesiones', 'POST', reserva())).body;
  e.avanzar('2026-10-05T13:01:00Z');
  await e.pedir(0, `sesiones/${s.id}/realizar`, 'POST');
  await e.pedir(0, `sesiones/${s.id}`, 'PUT', { ...editable(s), estado: 'Realizada', pagadoCentavos: 23456 });
  const anterior = await e.snapshot();
  const bearer = await e.token();
  await e.reabrir();
  assert.deepEqual(await e.snapshot(), anterior);
  const r = await e.raw(`sesiones/${s.id}`, { bearer });
  assert.equal(r.status, 200); assert.equal(r.body.pendienteCentavos, 100000);
});

test('pool cerrado devuelve 503; JWT inválido sigue devolviendo 401', async t => {
  const e = await preparar(t);
  await e.pool.end();
  for (const [ruta, metodo, datos] of [['pacientes', 'GET'], ['agenda', 'GET'], ['dashboard', 'GET'], ['pacientes', 'POST', { paciente: ficha('Cerrado') }]]) {
    assert.equal((await e.pedir(0, ruta, metodo, datos)).status, 503);
  }
  assert.equal((await e.raw('dashboard', { bearer: 'invalido' })).status, 401);
});

test('fallo de transporte a mitad de una reserva devuelve 503 y revierte las escrituras', async t => {
  const e = await preparar(t, { maximoConexiones: 1 });
  await e.horario('10:00');
  const anterior = await e.snapshot();
  await conConsultaInterceptada(e, (sql, args, ejecutar) => {
    if (sql.startsWith('INSERT INTO public.sesiones')) return Promise.reject(Object.assign(new Error('Fallo ficticio'), { code: '08006' }));
    return ejecutar(sql, ...args);
  }, async () => { assert.equal((await e.pedir(0, 'sesiones', 'POST', reserva())).status, 503); });
  assert.deepEqual(await e.snapshot(), anterior);
  assert.equal((await e.pedir(0, 'sesiones', 'POST', reserva())).status, 201);
});

test('conexión activa propia interrumpida: rollback del servidor y recuperación del pool', async t => {
  const e = await preparar(t, { maximoConexiones: 1 });
  await e.horario('10:00');
  const anterior = await e.snapshot();
  const control = await conexionPruebas();
  try {
    await conConsultaInterceptada(e, async (sql, args, ejecutar, cliente) => {
      if (sql.startsWith('INSERT INTO public.sesiones')) {
        // Capturamos el rechazo desde el inicio, aunque ocurra antes de que la
        // conexión de control termine de confirmar la interrupción.
        const fallo = ejecutar('SELECT pg_sleep(10)').then(() => null, error => error);
        // El backend propio ya está en una transacción con turno actualizado.
        // No se detiene el servicio ni se interrumpen conexiones de desarrollo.
        await control.query('SELECT pg_terminate_backend($1)', [cliente.processID]);
        const error = await fallo;
        if (error) throw error;
        return ejecutar(sql, ...args);
      }
      return ejecutar(sql, ...args);
    }, async () => { assert.equal((await e.pedir(0, 'sesiones', 'POST', reserva())).status, 503); });
  } finally { await control.end(); }
  assert.deepEqual(await e.snapshot(), anterior);
  assert.equal((await e.pedir(0, 'sesiones', 'POST', reserva())).status, 201);
  assert.equal(e.pool.waitingCount, 0);
});
