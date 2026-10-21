import type { Paciente, Sesion } from './models.ts';
import { esFechaISO, esHorario, instanteLocal, nombreDia } from './calendario.ts';
import { validarPaciente } from './validar-paciente.ts';

export class ErrorApi extends Error {
  readonly estado: number;
  constructor(estado: number, mensaje: string) {
    super(mensaje);
    this.estado = estado;
  }
}

export function objeto(valor: unknown): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new ErrorApi(400, 'Enviá un objeto JSON válido.');
  }
  return valor as Record<string, unknown>;
}

export function campos(datos: Record<string, unknown>, obligatorios: string[], opcionales: string[] = []): void {
  if (!obligatorios.every(campo => Object.hasOwn(datos, campo))
      || !Object.keys(datos).every(campo => [...obligatorios, ...opcionales].includes(campo))) {
    throw new ErrorApi(400, 'Revisá los campos enviados: hay datos faltantes o desconocidos.');
  }
}

function centavos(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 && valor <= 999999999;
}

export interface Reserva {
  fecha: string;
  horario: string;
  modalidad: Paciente['modalidad'];
  importeCentavos: number;
}

export function validarReserva(valor: unknown, incluyePaciente: boolean): Reserva & { codigoPaciente?: string } {
  const datos = objeto(valor);
  campos(datos, ['fecha', 'horario', 'modalidad', 'importeCentavos', ...(incluyePaciente ? ['codigoPaciente'] : [])]);
  if (!esFechaISO(datos['fecha']) || !esHorario(datos['horario'])) {
    throw new ErrorApi(400, 'La fecha y el horario deben existir y usar YYYY-MM-DD y HH:mm.');
  }
  if (datos['modalidad'] !== 'Presencial' && datos['modalidad'] !== 'Virtual') {
    throw new ErrorApi(400, 'La modalidad debe ser Presencial o Virtual.');
  }
  if (!centavos(datos['importeCentavos'])) {
    throw new ErrorApi(400, 'El importe debe ser un entero entre 0 y 999999999 centavos.');
  }
  if (incluyePaciente && (typeof datos['codigoPaciente'] !== 'string' || !datos['codigoPaciente'].trim())) {
    throw new ErrorApi(400, 'Seleccioná un paciente.');
  }
  return {
    fecha: datos['fecha'], horario: datos['horario'], modalidad: datos['modalidad'],
    importeCentavos: datos['importeCentavos'],
    ...(incluyePaciente ? { codigoPaciente: (datos['codigoPaciente'] as string).trim() } : {}),
  };
}

type DatosSesion = Omit<Sesion, 'id' | 'pendienteCentavos'>;

export function validarSesion(valor: unknown): DatosSesion {
  const datos = objeto(valor);
  campos(datos, ['fecha', 'horario', 'codigoPaciente', 'modalidad', 'estado', 'importeCentavos', 'pagadoCentavos']);
  const reserva = validarReserva({
    fecha: datos['fecha'], horario: datos['horario'], codigoPaciente: datos['codigoPaciente'],
    modalidad: datos['modalidad'], importeCentavos: datos['importeCentavos'],
  }, true);
  if (datos['estado'] !== 'Programada' && datos['estado'] !== 'Realizada') {
    throw new ErrorApi(400, 'El estado debe ser Programada o Realizada.');
  }
  if (!centavos(datos['pagadoCentavos']) || datos['pagadoCentavos'] > reserva.importeCentavos) {
    throw new ErrorApi(400, 'Usá importes enteros en centavos: el total cobrado no puede superar los honorarios.');
  }
  return { ...reserva, codigoPaciente: reserva.codigoPaciente!, estado: datos['estado'], pagadoCentavos: datos['pagadoCentavos'] };
}


export function fechaConsulta(consulta: Record<string, unknown>, reloj: () => Date): string {
  campos(consulta, [], ['fecha']);
  const valor = consulta['fecha'];
  if (valor === undefined) return instanteLocal(reloj()).fecha;
  if (!esFechaISO(valor)) throw new ErrorApi(400, 'La fecha debe existir y usar el formato YYYY-MM-DD.');
  return valor;
}

export function futuros(fecha: string, horario: string, ahora: string): void {
  if (fecha + ' ' + horario <= ahora) throw new ErrorApi(400, 'Elegí una fecha y un horario futuros.');
}

export function idSesion(valor: string): number {
  if (!/^[1-9]\d*$/.test(valor) || !Number.isSafeInteger(Number(valor))) {
    throw new ErrorApi(404, 'Sesión no encontrada');
  }
  return Number(valor);
}

export function etiquetaProxima(proxima: { fecha: string; horario: string } | undefined): string | null {
  const dias: Record<string, string> = { Lunes: 'LUN', Martes: 'MAR', Miércoles: 'MIÉ', Jueves: 'JUE', Viernes: 'VIE', Sábado: 'SÁB', Domingo: 'DOM' };
  return proxima ? dias[nombreDia(proxima.fecha)] + ' ' + proxima.horario + ' HS' : null;
}

export function datosAltaPaciente(cuerpo: unknown) {
  const datos = objeto(cuerpo);
  campos(datos, ['paciente'], ['turno']);
  const ficha = objeto(datos['paciente']);
  if (Object.hasOwn(ficha, 'fechaCreacion')) {
    throw new ErrorApi(400, 'La fecha de creación se asigna automáticamente y no debe enviarse.');
  }
  return { datos, ficha };
}

export function validarFicha(datos: unknown): Paciente {
  const resultado = validarPaciente(datos);
  if (!resultado.valido) throw new ErrorApi(400, resultado.mensaje);
  return resultado.paciente;
}

export function datosEdicionPaciente(cuerpo: unknown, existente: Paciente): Paciente {
  const datos = objeto(cuerpo);
  // Clientes anteriores pueden reenviar la misma fecha; nunca modificarla.
  if (Object.hasOwn(datos, 'fechaCreacion') && (typeof datos['fechaCreacion'] !== 'string'
      || datos['fechaCreacion'].trim() !== existente.fechaCreacion)) {
    throw new ErrorApi(400, 'La fecha de creación del paciente no se puede modificar.');
  }
  return validarFicha({ ...datos, fechaCreacion: existente.fechaCreacion });
}

export function comprobarRealizacion(estado: Sesion['estado'], fecha: string, horario: string, ahora: string): void {
  if (estado === 'Realizada' && `${fecha} ${horario}` > ahora) {
    throw new ErrorApi(400, 'La sesión todavía no comenzó. Podrás marcarla realizada después de su horario.');
  }
}
