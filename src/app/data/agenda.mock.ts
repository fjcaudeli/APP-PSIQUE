import { SemanaAgenda } from '../models/turno';

// Semana fija de ejemplo. Cada día contiene sus horarios en orden cronológico.
// P-001 y P-002 coinciden con los días, horarios y modalidades de sus fichas.
export const SEMANA_AGENDA_MOCK: SemanaAgenda = {
  titulo: '7 al 13 de septiembre de 2026',
  dias: [
    {
      fecha: '2026-09-07',
      nombre: 'Lunes',
      turnos: [
        { horario: '09:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
        // Esta etiqueta representa el concepto de horario liberado, sin ejecutar una cancelación.
        { horario: '11:00', codigoPaciente: null, modalidad: null, estado: 'Liberado' },
        { horario: '15:00', codigoPaciente: 'P-001', modalidad: 'Presencial', estado: 'Programado' },
      ],
    },
    {
      fecha: '2026-09-08',
      nombre: 'Martes',
      turnos: [
        { horario: '09:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
        { horario: '11:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
        { horario: '15:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
      ],
    },
    {
      fecha: '2026-09-09',
      nombre: 'Miércoles',
      turnos: [
        { horario: '09:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
        { horario: '10:30', codigoPaciente: 'P-002', modalidad: 'Virtual', estado: 'Programado' },
        { horario: '12:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
      ],
    },
    {
      fecha: '2026-09-10',
      nombre: 'Jueves',
      turnos: [
        { horario: '09:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
        { horario: '11:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
      ],
    },
    {
      fecha: '2026-09-11',
      nombre: 'Viernes',
      turnos: [
        { horario: '09:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
        { horario: '11:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
        { horario: '15:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
      ],
    },
    // Un día sin horarios cargados es distinto de uno con horarios disponibles.
    { fecha: '2026-09-12', nombre: 'Sábado', turnos: [] },
    { fecha: '2026-09-13', nombre: 'Domingo', turnos: [] },
  ],
};
