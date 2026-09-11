// Un turno representa un horario de la agenda, con o sin paciente asignado.
// Los horarios disponibles o liberados no tienen código ni modalidad.
export interface Turno {
  horario: string;
  codigoPaciente: string | null;
  modalidad: 'Presencial' | 'Virtual' | null;
  estado: 'Programado' | 'Disponible' | 'Liberado';
}

// Agrupamos los horarios por fecha para consultar una semana completa.
export interface DiaAgenda {
  fecha: string;
  nombre: string;
  turnos: Turno[];
}

export interface SemanaAgenda {
  titulo: string;
  dias: DiaAgenda[];
}
