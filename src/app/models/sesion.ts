import { Paciente } from './paciente';

export interface Sesion {
  id: number;
  fecha: string;
  horario: string;
  codigoPaciente: string;
  modalidad: Paciente['modalidad'];
  importeCentavos: number;
  pagadoCentavos: number;
  pendienteCentavos: number;
  estado: 'Programada' | 'Realizada' | 'Cancelada';
  duracionMinutos: number;
  horarioFin: string;
  resumen: string;
}

export type EdicionSesion = Omit<Sesion, 'id' | 'pendienteCentavos' | 'horarioFin'> & { postIt?: string };

export interface SesionAgendada extends Sesion {
  esProxima: boolean;
  postIt: string | null;
}

export interface HistorialSemanal {
  desde: string;
  hasta: string;
  sesiones: Sesion[];
}

export interface HorarioDisponible {
  fecha: string;
  horario: string;
  estado: 'Disponible' | 'Liberado';
}

export interface DisponibilidadSemanal {
  desde: string;
  hasta: string;
  horarios: HorarioDisponible[];
}

export interface HorarioConsultado {
  fecha: string;
  horario: string;
  estado: 'Disponible' | 'Liberado' | 'Programado';
  codigoPaciente: string | null;
  modalidad: Paciente['modalidad'] | null;
  sesionId: number | null;
}

export interface ReservaSesion {
  fecha: string;
  horario: string;
  modalidad: Paciente['modalidad'];
  importeCentavos: number;
  duracionMinutos: number;
  postIt?: string;
}

export interface DiaCalendario {
  fecha: string;
  nombre: string;
  habilitado: boolean;
  libres: { desde: string; hasta: string }[];
  ocupadas: (Pick<Sesion, 'id' | 'codigoPaciente' | 'horario' | 'horarioFin' | 'duracionMinutos' | 'estado'> & { esProxima: boolean })[];
}

export interface CalendarioAgenda {
  desde: string;
  hasta: string;
  ahora: string;
  dias: DiaCalendario[];
}
