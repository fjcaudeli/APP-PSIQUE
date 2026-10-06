import type { Paciente } from './models.ts';
import { esFechaISO } from './calendario.ts';

type ResultadoValidacion =
  | { valido: true; paciente: Paciente }
  | { valido: false; mensaje: string };

const camposPaciente = [
  'codigo', 'modalidad', 'estado', 'proximaSesion', 'frecuencia', 'diaHabitual',
  'horarioHabitual', 'fechaCreacion', 'fechaInicioTratamiento', 'motivoConsulta', 'postIt',
];
const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function esTexto(valor: unknown, maximo: number, obligatorio = false): valor is string {
  return typeof valor === 'string' && valor.length <= maximo && (!obligatorio || valor.length > 0);
}

export function validarPaciente(cuerpo: unknown): ResultadoValidacion {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    return { valido: false, mensaje: 'La ficha debe enviarse como un objeto JSON completo.' };
  }

  // PUT reemplaza los once campos: no acepta propiedades faltantes ni campos nuevos.
  const datos: Record<string, unknown> = { ...cuerpo };
  if (Object.keys(datos).length !== camposPaciente.length
    || !camposPaciente.every((campo) => Object.hasOwn(datos, campo))) {
    return { valido: false, mensaje: 'Enviá los once campos de la ficha, sin agregar otros.' };
  }

  // Recortamos espacios exteriores, sin truncar textos ni convertir tipos incorrectos.
  for (const campo of camposPaciente) {
    const valor = datos[campo];
    if (typeof valor === 'string') {
      datos[campo] = valor.trim();
    }
  }

  const {
    codigo, modalidad, estado, proximaSesion, frecuencia, diaHabitual, horarioHabitual,
    fechaCreacion, fechaInicioTratamiento, motivoConsulta, postIt,
  } = datos;

  if (typeof codigo !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,11}$/.test(codigo)) {
    return {
      valido: false,
      mensaje: 'El código debe tener entre 1 y 12 caracteres, comenzar con una letra o un número y usar solo letras, números, guion o guion bajo.',
    };
  }
  if (codigo.toLowerCase() === 'nuevo') {
    return { valido: false, mensaje: 'Elegí otro identificador: nuevo está reservado para crear pacientes.' };
  }
  if (modalidad !== 'Presencial' && modalidad !== 'Virtual') {
    return { valido: false, mensaje: 'La modalidad debe ser Presencial o Virtual.' };
  }
  if (!esTexto(estado, 40, true)) {
    return { valido: false, mensaje: 'El estado del tratamiento es obligatorio y admite hasta 40 caracteres.' };
  }
  if (!esTexto(frecuencia, 40, true)) {
    return { valido: false, mensaje: 'La frecuencia es obligatoria y admite hasta 40 caracteres.' };
  }
  if (proximaSesion !== null && !esTexto(proximaSesion, 30)) {
    return { valido: false, mensaje: 'La próxima sesión debe ser un texto de hasta 30 caracteres o null.' };
  }
  if (diaHabitual !== null && (typeof diaHabitual !== 'string' || !dias.includes(diaHabitual))) {
    return { valido: false, mensaje: 'El día habitual debe ser un día de lunes a domingo o null.' };
  }
  if (horarioHabitual !== null
    && (typeof horarioHabitual !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(horarioHabitual))) {
    return { valido: false, mensaje: 'El horario habitual debe tener el formato HH:mm válido o ser null.' };
  }
  if (!esFechaISO(fechaCreacion) || !esFechaISO(fechaInicioTratamiento)) {
    return { valido: false, mensaje: 'Las fechas deben existir en el calendario y usar el formato YYYY-MM-DD.' };
  }
  if (!esTexto(motivoConsulta, 3000)) {
    return { valido: false, mensaje: 'El motivo de consulta debe ser texto de hasta 3000 caracteres; puede estar vacío.' };
  }
  if (!esTexto(postIt, 300)) {
    return { valido: false, mensaje: 'El Post-it debe ser texto de hasta 300 caracteres; puede estar vacío.' };
  }

  return {
    valido: true,
    paciente: {
      codigo, modalidad, estado, proximaSesion, frecuencia, diaHabitual, horarioHabitual,
      fechaCreacion, fechaInicioTratamiento, motivoConsulta, postIt,
    },
  };
}
