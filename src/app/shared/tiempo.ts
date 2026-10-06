// Todos los recorridos usan el calendario del consultorio, incluso en otra PC.
export function ahoraConsultorio(): { fecha: string; horario: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? '';
  return { fecha: `${valor('year')}-${valor('month')}-${valor('day')}`, horario: `${valor('hour')}:${valor('minute')}` };
}

export function yaTranscurrio(fecha: string, horario: string): boolean {
  const ahora = ahoraConsultorio();
  return `${fecha}T${horario}` <= `${ahora.fecha}T${ahora.horario}`;
}

export function desplazarFecha(fecha: string, dias: number): string {
  const dia = new Date(`${fecha}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + dias);
  return dia.toISOString().slice(0, 10);
}
