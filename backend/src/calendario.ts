export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const relojArgentino = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function instanteLocal(ahora: Date): { fecha: string; horario: string; instante: string } {
  const partes = Object.fromEntries(relojArgentino.formatToParts(ahora).map(p => [p.type, p.value]));
  const fecha = `${partes['year']}-${partes['month']}-${partes['day']}`;
  const horario = `${partes['hour']}:${partes['minute']}`;
  return { fecha, horario, instante: `${fecha} ${horario}` };
}

export function esFechaISO(valor: unknown): valor is string {
  if (typeof valor !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const fecha = new Date(`${valor}T00:00:00.000Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
}

export function esHorario(valor: unknown): valor is string {
  return typeof valor === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}

export function sumarDias(fecha: string, cantidad: number): string {
  const dia = new Date(`${fecha}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + cantidad);
  return dia.toISOString().slice(0, 10);
}

export function nombreDia(fecha: string): string {
  return DIAS[(new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7]!;
}

export function semanaDe(fecha: string): { desde: string; hasta: string; titulo: string } {
  const indice = (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;
  const desde = sumarDias(fecha, -indice);
  const hasta = sumarDias(desde, 6);
  const formato = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
  const titulo = `${formato.format(new Date(`${desde}T12:00:00Z`))} al ${formato.format(new Date(`${hasta}T12:00:00Z`))}`;
  return { desde, hasta, titulo };
}
