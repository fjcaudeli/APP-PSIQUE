import type Database from 'better-sqlite3';
import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import type { DiaAgenda, Paciente, ResumenDashboard, SemanaAgenda, Turno } from './models.ts';

export function crearApp(db: Database.Database, origenFrontend: string) {
  const app = express();
  app.disable('x-powered-by');

  // CORS permite al navegador leer respuestas desde el origen local de Angular.
  // No autentica usuarios ni impide que otros clientes consulten la API.
  app.use(cors({ origin: origenFrontend, methods: ['GET'] }));

  const columnasPaciente = `
    codigo, modalidad, estado, proximaSesion, frecuencia, diaHabitual,
    horarioHabitual, fechaCreacion, fechaInicioTratamiento, motivoConsulta, postIt
  `;

  app.get('/api/pacientes', (_req, res) => {
    const pacientes = db.prepare<[], Paciente>(`
      SELECT ${columnasPaciente} FROM pacientes ORDER BY codigo
    `).all();
    res.json(pacientes);
  });

  app.get('/api/pacientes/:codigo', (req, res) => {
    // El parámetro se envía separado del SQL para tratarlo como dato y no como código.
    const paciente = db.prepare<[string], Paciente>(`
      SELECT ${columnasPaciente} FROM pacientes WHERE codigo = ?
    `).get(req.params.codigo);

    if (!paciente) {
      res.status(404).json({ mensaje: 'Paciente no encontrado' });
      return;
    }
    res.json(paciente);
  });

  app.get('/api/agenda', (_req, res) => {
    const semana = db.prepare<[], Pick<SemanaAgenda, 'titulo'>>(
      'SELECT titulo FROM semana_agenda WHERE id = 1',
    ).get();
    if (!semana) {
      res.status(500).json({ mensaje: 'No se pudo obtener la agenda' });
      return;
    }

    const dias = db.prepare<[], Omit<DiaAgenda, 'turnos'>>(
      'SELECT fecha, nombre FROM dias_agenda WHERE semanaId = 1 ORDER BY fecha',
    ).all();
    const consultarTurnos = db.prepare<[string], Turno>(`
      SELECT horario, codigoPaciente, modalidad, estado
      FROM turnos WHERE fecha = ? ORDER BY horario
    `);

    // Agrupamos las filas en el mismo JSON que ya esperaba Angular. Las fechas ISO
    // y horas HH:mm permiten ordenar cronológicamente sin calcular nuevos turnos.
    const agenda: SemanaAgenda = {
      titulo: semana.titulo,
      dias: dias.map((dia) => ({ ...dia, turnos: consultarTurnos.all(dia.fecha) })),
    };
    res.json(agenda);
  });

  app.get('/api/dashboard', (_req, res) => {
    // Estos cuatro valores almacenados siguen siendo independientes de la agenda.
    const resumen = db.prepare<[], ResumenDashboard>(`
      SELECT pacientesActivos, sesionesSemana, pendientesCobro, horariosDisponibles
      FROM dashboard WHERE id = 1
    `).get();
    if (!resumen) {
      res.status(500).json({ mensaje: 'No se pudo obtener el resumen' });
      return;
    }
    res.json(resumen);
  });

  app.use((_req, res) => {
    res.status(404).json({ mensaje: 'Recurso no encontrado' });
  });

  // Los errores inesperados no exponen consultas SQL ni información clínica.
  const manejarError: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.status(500).json({ mensaje: 'No se pudo completar la consulta' });
  };
  app.use(manejarError);
  return app;
}
