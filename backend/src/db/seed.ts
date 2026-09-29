import type Database from 'better-sqlite3';
import type { Paciente, ResumenDashboard, SemanaAgenda } from '../models.ts';

// Datos ficticios que antes estaban en los mocks de Angular. Solo se usan para
// inicializar una base vacía; las consultas HTTP leen las tablas de SQLite.
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

// Conservamos los indicadores independientes: todavía no se calculan estadísticas.
export const DASHBOARD_INICIAL: ResumenDashboard = {
  pacientesActivos: 3,
  sesionesSemana: 8,
  pendientesCobro: 2,
  horariosDisponibles: 4,
};

export function cargarDatosIniciales(db: Database.Database): void {
  // La transacción carga todo o revierte todo ante un error. El modo immediate
  // evita que dos inicios simultáneos intenten inicializar la misma base vacía.
  const inicializar = db.transaction(() => {
    const registro = db.prepare<[], { cantidad: number }>(`
      SELECT
        (SELECT COUNT(*) FROM pacientes) +
        (SELECT COUNT(*) FROM semana_agenda) +
        (SELECT COUNT(*) FROM dias_agenda) +
        (SELECT COUNT(*) FROM turnos) +
        (SELECT COUNT(*) FROM dashboard) AS cantidad
    `).get();

    // Si ya existe cualquier dato, no restauramos ni sobreescribimos la base.
    if (registro && registro.cantidad > 0) {
      return;
    }

    const insertarPaciente = db.prepare(`
      INSERT INTO pacientes (
        codigo, modalidad, estado, proximaSesion, frecuencia, diaHabitual,
        horarioHabitual, fechaCreacion, fechaInicioTratamiento, motivoConsulta, postIt
      ) VALUES (
        @codigo, @modalidad, @estado, @proximaSesion, @frecuencia, @diaHabitual,
        @horarioHabitual, @fechaCreacion, @fechaInicioTratamiento, @motivoConsulta, @postIt
      )
    `);
    for (const paciente of PACIENTES_INICIALES) {
      insertarPaciente.run(paciente);
    }

    db.prepare('INSERT INTO semana_agenda (id, titulo) VALUES (1, ?)').run(SEMANA_INICIAL.titulo);
    const insertarDia = db.prepare('INSERT INTO dias_agenda (fecha, nombre, semanaId) VALUES (?, ?, 1)');
    const insertarTurno = db.prepare(`
      INSERT INTO turnos (fecha, horario, codigoPaciente, modalidad, estado)
      VALUES (@fecha, @horario, @codigoPaciente, @modalidad, @estado)
    `);
    for (const dia of SEMANA_INICIAL.dias) {
      insertarDia.run(dia.fecha, dia.nombre);
      for (const turno of dia.turnos) {
        insertarTurno.run({ fecha: dia.fecha, ...turno });
      }
    }

    db.prepare(`
      INSERT INTO dashboard (id, pacientesActivos, sesionesSemana, pendientesCobro, horariosDisponibles)
      VALUES (1, @pacientesActivos, @sesionesSemana, @pendientesCobro, @horariosDisponibles)
    `).run(DASHBOARD_INICIAL);
  });

  inicializar.immediate();
}
