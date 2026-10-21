import express from 'express';
import { configurarSeguridadHttp } from './seguridad-http.ts';
import type { SeguridadHttp } from './seguridad-http.ts';
import type { Express, ErrorRequestHandler } from 'express';
import type { HorarioDisponible, Paciente, ResumenDashboard, SemanaAgenda, Sesion, Turno } from './models.ts';
import { esFechaISO, esHorario, instanteLocal } from './calendario.ts';
import { ErrorApi, fechaConsulta } from './reglas-api.ts';

type Resultado<T> = T | Promise<T>;
type AltaPaciente = { paciente: Paciente; sesion: Sesion | null };

// Son las operaciones que ya ofrece la API. Cada motor conserva su SQL y su
// mecanismo de transacciones; las rutas y sus contratos se definen una sola vez.
export interface Consultorio {
  listarPacientes(usuarioId: number): Resultado<Paciente[]>;
  buscarPaciente(usuarioId: number, codigo: string): Resultado<Paciente | undefined>;
  siguienteCodigo(usuarioId: number): Resultado<string>;
  crearPaciente(usuarioId: number, cuerpo: unknown): Resultado<AltaPaciente>;
  actualizarPaciente(usuarioId: number, codigo: string, cuerpo: unknown): Resultado<Paciente>;
  sesionesSemana(usuarioId: number, fecha: string): Resultado<{ desde: string; hasta: string; sesiones: Sesion[] }>;
  pendientes(usuarioId: number): Resultado<Sesion[]>;
  sesionPorId(usuarioId: number, id: string): Resultado<Sesion>;
  crearSesion(usuarioId: number, cuerpo: unknown): Resultado<Sesion>;
  realizarSesion(usuarioId: number, id: string): Resultado<Sesion>;
  actualizarSesion(usuarioId: number, id: string, cuerpo: unknown): Resultado<Sesion>;
  disponibles(usuarioId: number, fecha: string, ahora: string): Resultado<{ desde: string; hasta: string; horarios: HorarioDisponible[] }>;
  consultarHorario(usuarioId: number, fecha: string, horario: string): Resultado<(Turno & { fecha: string }) | undefined>;
  crearHorario(usuarioId: number, cuerpo: unknown): Resultado<{ fecha: string; horario: string; estado: string }>;
  agenda(usuarioId: number, fecha: string): Resultado<SemanaAgenda>;
  dashboard(usuarioId: number): Resultado<ResumenDashboard>;
}

export function crearApi(
  datos: Consultorio,
  autenticar: (app: Express) => void,
  origenFrontend: string,
  reloj: () => Date,
  manejarErrorMotor?: ErrorRequestHandler,
  opciones: SeguridadHttp & { configurarAntesDeAuth?: (app: Express) => void } = {},
): Express {
  const app = express();
  configurarSeguridadHttp(app, origenFrontend, opciones);
  app.use(express.json({ limit: '32kb' }));
  opciones.configurarAntesDeAuth?.(app);
  autenticar(app);

  // El JWT decide el propietario. await también acepta los resultados síncronos
  // de SQLite, sin convertir sus transacciones inmediatas en funciones asíncronas.
  app.get('/api/pacientes', async (_req, res) => { res.json(await datos.listarPacientes(res.locals['usuarioId'])); });
  app.get('/api/pacientes/siguiente-codigo', async (_req, res) => {
    res.json({ codigo: await datos.siguienteCodigo(res.locals['usuarioId']) });
  });
  app.post('/api/pacientes', async (req, res) => {
    res.status(201).json(await datos.crearPaciente(res.locals['usuarioId'], req.body));
  });
  app.get('/api/pacientes/:codigo', async (req, res) => {
    const paciente = await datos.buscarPaciente(res.locals['usuarioId'], req.params.codigo);
    if (!paciente) throw new ErrorApi(404, 'Paciente no encontrado');
    res.json(paciente);
  });
  app.put('/api/pacientes/:codigo', async (req, res) => {
    res.json(await datos.actualizarPaciente(res.locals['usuarioId'], req.params.codigo, req.body));
  });
  app.get('/api/sesiones/semana', async (req, res) => {
    res.json(await datos.sesionesSemana(res.locals['usuarioId'], fechaConsulta(req.query, reloj)));
  });
  app.get('/api/sesiones/pendientes', async (_req, res) => { res.json(await datos.pendientes(res.locals['usuarioId'])); });
  app.get('/api/sesiones/:id', async (req, res) => { res.json(await datos.sesionPorId(res.locals['usuarioId'], req.params.id)); });
  app.post('/api/sesiones', async (req, res) => {
    res.status(201).json(await datos.crearSesion(res.locals['usuarioId'], req.body));
  });
  app.post('/api/sesiones/:id/realizar', async (req, res) => { res.json(await datos.realizarSesion(res.locals['usuarioId'], req.params.id)); });
  app.put('/api/sesiones/:id', async (req, res) => { res.json(await datos.actualizarSesion(res.locals['usuarioId'], req.params.id, req.body)); });
  app.get('/api/horarios/disponibles', async (req, res) => {
    res.json(await datos.disponibles(res.locals['usuarioId'], fechaConsulta(req.query, reloj), instanteLocal(reloj()).instante));
  });
  app.get('/api/horarios/:fecha/:horario', async (req, res) => {
    if (!esFechaISO(req.params.fecha) || !esHorario(req.params.horario)) throw new ErrorApi(400, 'La fecha o el horario no son válidos.');
    const turno = await datos.consultarHorario(res.locals['usuarioId'], req.params.fecha, req.params.horario);
    if (!turno) throw new ErrorApi(404, 'Horario no encontrado');
    res.json(turno);
  });
  app.post('/api/horarios', async (req, res) => { res.status(201).json(await datos.crearHorario(res.locals['usuarioId'], req.body)); });
  app.get('/api/agenda', async (req, res) => { res.json(await datos.agenda(res.locals['usuarioId'], fechaConsulta(req.query, reloj))); });
  app.get('/api/dashboard', async (_req, res) => { res.json(await datos.dashboard(res.locals['usuarioId'])); });

  app.use((_req, res) => { res.status(404).json({ mensaje: 'Recurso no encontrado' }); });
  if (manejarErrorMotor) app.use(manejarErrorMotor);
  const manejarError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ErrorApi) {
      res.status(error.estado).json({ mensaje: error.message });
      return;
    }
    if (error?.type === 'entity.parse.failed') {
      res.status(400).json({ mensaje: 'El cuerpo de la solicitud debe contener JSON válido.' });
      return;
    }
    if (error?.type === 'entity.too.large') {
      res.status(413).json({ mensaje: 'La ficha enviada supera el tamaño permitido de 32 KB.' });
      return;
    }
    res.status(500).json({ mensaje: 'No se pudo completar la operación' });
  };
  app.use(manejarError);
  return app;
}
