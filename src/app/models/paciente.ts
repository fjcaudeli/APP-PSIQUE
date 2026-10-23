// Este modelo define los datos compartidos por el listado, la ficha y el servicio.
// Una interfaz comprueba la estructura durante la compilación; no almacena datos.
export interface Paciente {
  codigo: string;
  modalidad: 'Presencial' | 'Virtual';
  estado: string;
  // Estos campos admiten null cuando todavía no se definió un próximo turno u horario.
  proximaSesion: string | null;
  frecuencia: string;
  diaHabitual: string | null;
  horarioHabitual: string | null;
  // Usamos fechas ISO para conservar el dato separado de su presentación dd/MM/yyyy.
  fechaCreacion: string;
  fechaInicioTratamiento: string | null;
  motivoConsulta: string;
  postIt: string;
}

// El servidor asigna creación e inicio (este último, al confirmar la primera sesión).
// Un código vacío solicita uno automático.
export type NuevoPaciente = Omit<Paciente, 'fechaCreacion' | 'fechaInicioTratamiento' | 'codigo'> & { codigo?: string };
