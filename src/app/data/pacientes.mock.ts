import { Paciente } from '../models/paciente';

// Fuente de ejemplo para el servicio. Las pantallas no importan este arreglo.
// Todos los textos y fechas son ficticios y no se guardan en una base de datos.
export const PACIENTES_MOCK: Paciente[] = [
  {
    codigo: 'P-001',
    modalidad: 'Presencial',
    estado: 'Activo',
    proximaSesion: 'LUN 15 HS',
    frecuencia: 'Semanal',
    diaHabitual: 'Lunes',
    horarioHabitual: '15:00',
    fechaCreacion: '2026-09-01',
    fechaInicioTratamiento: '2026-09-01',
    motivoConsulta: 'Dificultades vinculadas a situaciones de ansiedad.',
    postIt: 'Retomar situaciones que generan mayor ansiedad durante la semana.',
  },
  {
    codigo: 'P-002',
    modalidad: 'Virtual',
    estado: 'Activo',
    proximaSesion: 'MIÉ 10:30 HS',
    frecuencia: 'Semanal',
    diaHabitual: 'Miércoles',
    horarioHabitual: '10:30',
    fechaCreacion: '2026-09-02',
    fechaInicioTratamiento: '2026-09-02',
    motivoConsulta: 'Dificultades en vínculos interpersonales.',
    postIt: 'Preguntar cómo resultó la conversación pendiente.',
  },
  {
    codigo: 'P-003',
    modalidad: 'Presencial',
    estado: 'Activo',
    proximaSesion: null,
    frecuencia: 'Quincenal',
    diaHabitual: null,
    horarioHabitual: null,
    fechaCreacion: '2026-09-05',
    fechaInicioTratamiento: '2026-09-05',
    motivoConsulta: 'Malestar relacionado con cambios recientes.',
    postIt: 'Retomar cómo transitó los últimos días.',
  },
];
