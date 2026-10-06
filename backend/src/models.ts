// Contratos JSON de la API: conservan los mismos campos que consume Angular.
// Estos tipos comprueban el código TypeScript; las tablas guardan los datos reales.
export interface Paciente {
  codigo: string;
  modalidad: 'Presencial' | 'Virtual';
  estado: string;
  proximaSesion: string | null;
  frecuencia: string;
  diaHabitual: string | null;
  horarioHabitual: string | null;
  fechaCreacion: string;
  fechaInicioTratamiento: string;
  motivoConsulta: string;
  postIt: string;
}

export interface Turno {
  horario: string;
  codigoPaciente: string | null;
  modalidad: 'Presencial' | 'Virtual' | null;
  estado: 'Programado' | 'Disponible' | 'Liberado';
  sesionId?: number | null;
}

export interface Sesion {
  id: number;
  fecha: string;
  horario: string;
  codigoPaciente: string;
  modalidad: 'Presencial' | 'Virtual';
  importeCentavos: number;
  pagadoCentavos: number;
  pendienteCentavos: number;
  estado: 'Programada' | 'Realizada';
}

export interface HorarioDisponible {
  fecha: string;
  horario: string;
  estado: 'Disponible' | 'Liberado';
}

export interface DiaAgenda {
  fecha: string;
  nombre: string;
  turnos: Turno[];
}

export interface SemanaAgenda {
  titulo: string;
  dias: DiaAgenda[];
}

export interface ResumenDashboard {
  pacientesActivos: number;
  sesionesSemana: number;
  pendientesCobro: number;
  horariosDisponibles: number;
}
