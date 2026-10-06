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
  estado: 'Programada' | 'Realizada';
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
}
