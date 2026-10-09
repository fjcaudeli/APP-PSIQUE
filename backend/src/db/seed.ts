import type Database from 'better-sqlite3';
import type { Paciente, SemanaAgenda } from '../models.ts';

// Datos ficticios cargados explícitamente para las pruebas de un profesional.
// La aplicación no importa ni ejecuta esta carga al iniciar.
export const PACIENTES_INICIALES: Paciente[] = [
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

export const SEMANA_INICIAL: SemanaAgenda = {
  titulo: '7 al 13 de septiembre de 2026',
  dias: [
    {
      fecha: '2026-09-07',
      nombre: 'Lunes',
      turnos: [
        { horario: '09:00', codigoPaciente: null, modalidad: null, estado: 'Disponible' },
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
    { fecha: '2026-09-12', nombre: 'Sábado', turnos: [] },
    { fecha: '2026-09-13', nombre: 'Domingo', turnos: [] },
  ],
};

// El profesional se crea en la fixture de test, nunca en el servidor real.
export function cargarDatosIniciales(db: Database.Database, usuarioId: number): void {
  db.transaction(() => {
    const insertarPaciente = db.prepare(`
      INSERT INTO pacientes (usuarioId, codigo, modalidad, estado, proximaSesion, frecuencia, diaHabitual,
        horarioHabitual, fechaCreacion, fechaInicioTratamiento, motivoConsulta, postIt)
      VALUES (@usuarioId, @codigo, @modalidad, @estado, @proximaSesion, @frecuencia, @diaHabitual,
        @horarioHabitual, @fechaCreacion, @fechaInicioTratamiento, @motivoConsulta, @postIt)
    `);
    for (const paciente of PACIENTES_INICIALES) insertarPaciente.run({ ...paciente, usuarioId });
    const insertarTurno = db.prepare(`
      INSERT INTO turnos (usuarioId, fecha, horario, codigoPaciente, modalidad, estado)
      VALUES (@usuarioId, @fecha, @horario, @codigoPaciente, @modalidad, @estado)
    `);
    const insertarSesion = db.prepare(`
      INSERT INTO sesiones (usuarioId, fecha, horario, codigoPaciente, modalidad)
      VALUES (@usuarioId, @fecha, @horario, @codigoPaciente, @modalidad)
    `);
    for (const dia of SEMANA_INICIAL.dias) {
      for (const turno of dia.turnos) {
        const datos = { usuarioId, fecha: dia.fecha, ...turno };
        insertarTurno.run(datos);
        if (turno.estado === 'Programado') insertarSesion.run(datos);
      }
    }
  }).immediate();
}
