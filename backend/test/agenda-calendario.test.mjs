import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularCalendario, comprobarCruces, comprobarProxima, reservaCalendario, siguePendiente, validarFechaReserva, ventanaCalendario } from '../dist/agenda-calendario.js';

const reloj = () => new Date('2026-10-21T15:07:00Z'); // 12:07 Buenos Aires.
const reserva = (cambios = {}) => ({ fecha: '2026-10-22', horario: '10:00', modalidad: 'Virtual', importeCentavos: 0, duracionMinutos: 60, ...cambios });
const sesion = (cambios = {}) => ({ ...reserva(), id: 1, codigoPaciente: 'P-001', estado: 'Programada', resumen: '', pagadoCentavos: 0, pendienteCentavos: 0, ...cambios });

test('ventana del calendario incluye el mes siguiente y atraviesa año y febrero bisiesto', () => {
  assert.equal(ventanaCalendario(reloj).hasta, '2026-11-30');
  assert.equal(ventanaCalendario(() => new Date('2026-12-31T15:00:00Z')).hasta, '2027-01-31');
  assert.equal(ventanaCalendario(() => new Date('2028-01-31T15:00:00Z')).hasta, '2028-02-29');
});

test('reserva exige duración explícita, enteros de 30/40/50/60 y rechaza identidad enviada por el cliente', () => {
  for (const duracionMinutos of [undefined, null, '60', 15, 45, 90, 30.5]) assert.throws(() => reservaCalendario(reserva({ duracionMinutos }), false));
  for (const duracionMinutos of [30, 40, 50, 60]) assert.equal(reservaCalendario(reserva({ duracionMinutos }), false).duracionMinutos, duracionMinutos);
  assert.throws(() => reservaCalendario({ ...reserva(), usuarioId: 2 }, false));
});

test('solo lunes a sábado, entre hoy y fin del mes siguiente, inicio cada quince y fin hasta 22', () => {
  for (const r of [reserva({ fecha: '2026-10-20' }), reserva({ fecha: '2026-10-25' }), reserva({ fecha: '2026-12-01' }),
    reserva({ horario: '07:45' }), reserva({ horario: '10:01' }), reserva({ horario: '21:15' }), reserva({ fecha: '2026-10-21', horario: '12:00' })]) {
    assert.throws(() => validarFechaReserva(r, reloj));
  }
  for (const r of [reserva({ fecha: '2026-11-30' }), reserva({ horario: '21:00' }), reserva({ horario: '21:30', duracionMinutos: 30 })]) assert.doesNotThrow(() => validarFechaReserva(r, reloj));
});

test('detecta cruces aunque los inicios sean distintos y permite extremos pegados y otras fechas', () => {
  const ocupada = sesion({ horario: '17:00' });
  assert.doesNotThrow(() => comprobarCruces(reserva({ horario: '16:30', duracionMinutos: 30 }), [ocupada]));
  assert.throws(() => comprobarCruces(reserva({ horario: '16:30', duracionMinutos: 40 }), [ocupada]), /17:00/);
  assert.throws(() => comprobarCruces(reserva({ horario: '17:15', duracionMinutos: 30 }), [ocupada]));
  assert.doesNotThrow(() => comprobarCruces(reserva({ horario: '18:00' }), [ocupada]));
  assert.doesNotThrow(() => comprobarCruces(reserva({ fecha: '2026-10-23', horario: '17:00' }), [ocupada]));
  assert.doesNotThrow(() => comprobarCruces(reserva({ horario: '17:00' }), [{ ...ocupada, estado: 'Cancelada' }]));
});

test('una próxima fecha admite exactamente dos bloques consecutivos y excluye canceladas o terminadas', () => {
  const ahora = '2026-10-21 12:07'; const primera = sesion();
  assert.doesNotThrow(() => comprobarProxima(reserva({ horario: '11:00' }), [primera], ahora));
  assert.doesNotThrow(() => comprobarProxima(reserva({ horario: '09:00' }), [primera], ahora));
  assert.throws(() => comprobarProxima(reserva({ horario: '12:00' }), [primera], ahora));
  assert.throws(() => comprobarProxima(reserva({ fecha: '2026-10-23' }), [primera], ahora));
  assert.throws(() => comprobarProxima(reserva({ horario: '12:00' }), [primera, sesion({ id: 2, horario: '11:00' })], ahora));
  assert.doesNotThrow(() => comprobarProxima(reserva(), [sesion({ estado: 'Cancelada' }), sesion({ fecha: '2026-10-20' })], ahora));
  assert.equal(siguePendiente(sesion({ fecha: '2026-10-21', horario: '12:00', estado: 'Realizada' }), ahora), true);
  assert.equal(siguePendiente(sesion({ fecha: '2026-10-21', horario: '11:00' }), ahora), false);
});

test('calendario muestra ocupación y huecos continuos; hoy excluye lo transcurrido y omite huecos de 15 min', () => {
  const c = calcularCalendario([sesion({ horario: '10:00' }), sesion({ id: 2, horario: '11:15' }), sesion({ id: 3, horario: '13:00', estado: 'Cancelada' })], reloj);
  assert.deepEqual(c.dias.find(d => d.fecha === '2026-10-22').libres, [{ desde: '08:00', hasta: '10:00' }, { desde: '12:15', hasta: '22:00' }]);
  assert.equal(c.dias.find(d => d.fecha === '2026-10-21').libres[0].desde, '12:15');
  assert.deepEqual(c.dias.find(d => d.fecha === '2026-10-25').libres, []);
  assert.equal(c.dias.find(d => d.fecha === '2026-10-20').habilitado, false);
  assert.equal(c.dias.at(-1).fecha, '2026-11-30');
});

test('la semana puede cruzar de mes sin ampliar el plazo de reservas ni ofrecer días pasados', () => {
  const c = calcularCalendario([], reloj, '2026-11-30');
  assert.equal(c.dias.length, 7); assert.equal(c.dias[0].fecha, '2026-11-30'); assert.equal(c.dias.at(-1).fecha, '2026-12-06');
  assert.equal(c.dias[0].habilitado, true); assert.equal(c.dias.slice(1).every(d => !d.habilitado && d.libres.length === 0), true);
  assert.equal(c.hasta, '2026-11-30');
});

test('ofrece franjas antes, entre y después de sesiones de 40 y 50 minutos, aunque lleguen desordenadas', () => {
  const c = calcularCalendario([
    sesion({ id: 2, horario: '13:00', duracionMinutos: 50 }),
    sesion({ horario: '10:00', duracionMinutos: 40 }),
    sesion({ id: 3, horario: '11:00', estado: 'Cancelada' }),
  ], reloj, '2026-10-22');
  const dia = c.dias.find(d => d.fecha === '2026-10-22');
  assert.deepEqual(dia.libres, [
    { desde: '08:00', hasta: '10:00' },
    { desde: '10:45', hasta: '13:00' },
    { desde: '14:00', hasta: '22:00' },
  ]);
  assert.deepEqual(dia.ocupadas.map(s => s.horario), ['10:00', '13:00']);
});
