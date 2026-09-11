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
  fechaInicioTratamiento: string;
  motivoConsulta: string;
  postIt: string;
}
