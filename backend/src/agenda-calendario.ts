import { instanteLocal, nombreDia, semanaDe, sumarDias } from './calendario.ts';
import { ErrorApi, futuros, objeto, validarReserva, validarSesion } from './reglas-api.ts';
import type { Reserva } from './reglas-api.ts';
import type { Sesion } from './models.ts';

export type ReservaCalendario = Reserva & { duracionMinutos: number; codigoPaciente?: string };
export type SesionCalendario = Sesion & { duracionMinutos: number };
export const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
export const horaTexto = (valor: number) => `${String(Math.floor(valor / 60)).padStart(2, '0')}:${String(valor % 60).padStart(2, '0')}`;
export const finSesion = (sesion: { horario: string; duracionMinutos: number }) => minutos(sesion.horario) + sesion.duracionMinutos;
export const siguePendiente = (sesion: SesionCalendario, ahora: string) => sesion.estado !== 'Cancelada'
  && `${sesion.fecha} ${horaTexto(finSesion(sesion))}` > ahora;

export function ventanaCalendario(reloj: () => Date) {
  const ahora = instanteLocal(reloj());
  const dia = new Date(`${ahora.fecha}T12:00:00Z`);
  dia.setUTCMonth(dia.getUTCMonth() + 2, 0);
  return { ...ahora, desde: ahora.fecha.slice(0, 7) + '-01', hasta: dia.toISOString().slice(0, 10) };
}

export function duracionValida(valor: unknown): number {
  if (typeof valor !== 'number' || ![30, 40, 50, 60].includes(valor)) {
    throw new ErrorApi(400, 'Elegí una duración de 30, 40, 50 o 60 minutos.');
  }
  return valor;
}

export function reservaCalendario(valor: unknown, incluyePaciente: boolean): ReservaCalendario {
  const { duracionMinutos, ...resto } = objeto(valor);
  return { ...validarReserva(resto, incluyePaciente), duracionMinutos: duracionValida(duracionMinutos) };
}

export function edicionCalendario(valor: unknown, actual: SesionCalendario) {
  const { duracionMinutos = actual.duracionMinutos, ...resto } = objeto(valor);
  // La cancelación tiene una operación explícita, que conserva cobros y libera el intervalo.
  if (resto['estado'] === 'Cancelada' && actual.estado !== 'Cancelada') throw new ErrorApi(400, 'Usá la opción Desagendar para cancelar la sesión.');
  if (actual.estado === 'Cancelada' && resto['estado'] !== 'Cancelada') throw new ErrorApi(400, 'Una sesión cancelada no se puede reactivar. Agendá una nueva.');
  const cancelada = resto['estado'] === 'Cancelada';
  const datos = validarSesion({ ...resto, ...(cancelada ? { estado: 'Programada' } : {}) }, actual.resumen);
  return { ...datos, estado: cancelada ? 'Cancelada' as const : datos.estado, duracionMinutos: duracionValida(duracionMinutos) };
}

export function validarFechaReserva(datos: ReservaCalendario, reloj: () => Date): void {
  const ventana = ventanaCalendario(reloj);
  futuros(datos.fecha, datos.horario, ventana.instante);
  if (datos.fecha > ventana.hasta) throw new ErrorApi(400, 'La próxima sesión debe estar entre hoy y el último día del mes siguiente.');
  if (nombreDia(datos.fecha) === 'Domingo') throw new ErrorApi(400, 'Las sesiones se agendan de lunes a sábado.');
  if (minutos(datos.horario) < 480 || finSesion(datos) > 1320) throw new ErrorApi(400, 'La sesión completa debe estar entre las 08:00 y las 22:00.');
  if (minutos(datos.horario) % 15 !== 0) throw new ErrorApi(400, 'El inicio debe usar minutos 00, 15, 30 o 45.');
}

export function comprobarCruces(datos: { fecha: string; horario: string; duracionMinutos: number }, ocupadas: SesionCalendario[]): void {
  const inicio = minutos(datos.horario), fin = finSesion(datos);
  const conflicto = ocupadas.find(s => s.estado !== 'Cancelada' && s.fecha === datos.fecha && inicio < finSesion(s) && fin > minutos(s.horario));
  if (conflicto) throw new ErrorApi(409, `El intervalo se superpone con una sesión de ${conflicto.horario} a ${horaTexto(finSesion(conflicto))}. Elegí otro horario o reducí la duración.`);
}

export function comprobarProxima(datos: { fecha: string; horario: string; duracionMinutos: number }, existentes: SesionCalendario[], ahora: string): void {
  const pendientes = existentes.filter(s => siguePendiente(s, ahora));
  if (!pendientes.length) return;
  if (pendientes.length !== 1 || pendientes[0]!.fecha !== datos.fecha
      || (finSesion(pendientes[0]!) !== minutos(datos.horario) && finSesion(datos) !== minutos(pendientes[0]!.horario))) {
    throw new ErrorApi(409, 'El paciente ya tiene una próxima fecha reservada. Solo se permiten dos sesiones consecutivas en esa misma fecha.');
  }
}

export function calcularCalendario(sesiones: SesionCalendario[], reloj: () => Date, fecha?: string, proximas = new Set<number>()) {
  const ventana = ventanaCalendario(reloj);
  const periodo = fecha ? semanaDe(fecha) : ventana;
  const dias = [];
  for (let fecha = periodo.desde; fecha <= periodo.hasta; fecha = sumarDias(fecha, 1)) {
    const habilitado = fecha >= ventana.fecha && fecha <= ventana.hasta && nombreDia(fecha) !== 'Domingo';
    const ocupadas = sesiones.filter(s => s.fecha === fecha && s.estado !== 'Cancelada').sort((a, b) => a.horario.localeCompare(b.horario));
    const libres: { desde: string; hasta: string }[] = [];
    let cursor = fecha === ventana.fecha ? Math.max(480, Math.floor(minutos(ventana.horario) / 15) * 15 + 15) : 480;
    // Los intervalos ocupados pueden provenir de versiones anteriores. Recortamos
    // solo la presentación a 08–22 y conservamos los registros originales.
    if (habilitado) {
      for (const sesion of ocupadas) {
        const inicio = Math.min(1320, Math.max(480, minutos(sesion.horario)));
        if (inicio - cursor >= 30) libres.push({ desde: horaTexto(cursor), hasta: horaTexto(inicio) });
        cursor = Math.max(cursor, Math.ceil(finSesion(sesion) / 15) * 15);
      }
      if (1320 - cursor >= 30) libres.push({ desde: horaTexto(cursor), hasta: '22:00' });
    }
    dias.push({ fecha, nombre: nombreDia(fecha), habilitado, libres,
      ocupadas: ocupadas.map(s => ({ id: s.id, codigoPaciente: s.codigoPaciente, horario: s.horario,
        horarioFin: horaTexto(finSesion(s)), duracionMinutos: s.duracionMinutos, estado: s.estado, esProxima: proximas.has(s.id) })) });
  }
  return { desde: ventana.fecha, hasta: ventana.hasta, ahora: ventana.instante, dias };
}
