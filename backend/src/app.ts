import type Database from 'better-sqlite3';
import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { configurarAutenticacion } from './auth.ts';
import type { HorarioDisponible, Paciente, Sesion, Turno } from './models.ts';
import { validarPaciente } from './validar-paciente.ts';
import { esFechaISO, esHorario, instanteLocal, nombreDia, semanaDe, sumarDias } from './calendario.ts';

class ErrorApi extends Error {
  readonly estado: number;
  constructor(estado: number, mensaje: string) {
    super(mensaje);
    this.estado = estado;
  }
}

function objeto(valor: unknown): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new ErrorApi(400, 'Enviá un objeto JSON válido.');
  }
  return valor as Record<string, unknown>;
}

function campos(datos: Record<string, unknown>, obligatorios: string[], opcionales: string[] = []): void {
  if (!obligatorios.every(campo => Object.hasOwn(datos, campo))
      || !Object.keys(datos).every(campo => [...obligatorios, ...opcionales].includes(campo))) {
    throw new ErrorApi(400, 'Revisá los campos enviados: hay datos faltantes o desconocidos.');
  }
}

function centavos(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor >= 0 && valor <= 999999999;
}

interface Reserva {
  fecha: string;
  horario: string;
  modalidad: Paciente['modalidad'];
  importeCentavos: number;
}

function validarReserva(valor: unknown, incluyePaciente: boolean): Reserva & { codigoPaciente?: string } {
  const datos = objeto(valor);
  campos(datos, ['fecha', 'horario', 'modalidad', 'importeCentavos', ...(incluyePaciente ? ['codigoPaciente'] : [])]);
  if (!esFechaISO(datos['fecha']) || !esHorario(datos['horario'])) {
    throw new ErrorApi(400, 'La fecha y el horario deben existir y usar YYYY-MM-DD y HH:mm.');
  }
  if (datos['modalidad'] !== 'Presencial' && datos['modalidad'] !== 'Virtual') {
    throw new ErrorApi(400, 'La modalidad debe ser Presencial o Virtual.');
  }
  if (!centavos(datos['importeCentavos'])) {
    throw new ErrorApi(400, 'El importe debe ser un entero entre 0 y 999999999 centavos.');
  }
  if (incluyePaciente && (typeof datos['codigoPaciente'] !== 'string' || !datos['codigoPaciente'].trim())) {
    throw new ErrorApi(400, 'Seleccioná un paciente.');
  }
  return {
    fecha: datos['fecha'], horario: datos['horario'], modalidad: datos['modalidad'],
    importeCentavos: datos['importeCentavos'],
    ...(incluyePaciente ? { codigoPaciente: (datos['codigoPaciente'] as string).trim() } : {}),
  };
}

type DatosSesion = Omit<Sesion, 'id' | 'pendienteCentavos'>;

function validarSesion(valor: unknown): DatosSesion {
  const datos = objeto(valor);
  campos(datos, ['fecha', 'horario', 'codigoPaciente', 'modalidad', 'estado', 'importeCentavos', 'pagadoCentavos']);
  const reserva = validarReserva({
    fecha: datos['fecha'], horario: datos['horario'], codigoPaciente: datos['codigoPaciente'],
    modalidad: datos['modalidad'], importeCentavos: datos['importeCentavos'],
  }, true);
  if (datos['estado'] !== 'Programada' && datos['estado'] !== 'Realizada') {
    throw new ErrorApi(400, 'El estado debe ser Programada o Realizada.');
  }
  if (!centavos(datos['pagadoCentavos']) || datos['pagadoCentavos'] > reserva.importeCentavos) {
    throw new ErrorApi(400, 'Usá importes enteros en centavos: el total cobrado no puede superar los honorarios.');
  }
  return { ...reserva, codigoPaciente: reserva.codigoPaciente!, estado: datos['estado'], pagadoCentavos: datos['pagadoCentavos'] };
}

export function crearApp(db: Database.Database, origenFrontend: string, reloj: () => Date = () => new Date(), secretoJwt = process.env['JWT_SECRET'] ?? '') {
  const app = express();
  app.disable('x-powered-by');
  // CORS controla el acceso del navegador; no reemplaza la autenticación.
  app.use(cors({ origin: origenFrontend, methods: ['GET', 'POST', 'PUT'] }));
  app.use(express.json({ limit: '32kb' }));
  configurarAutenticacion(app, db, secretoJwt, reloj);

  // El propietario siempre proviene del JWT verificado. Se pasa explícitamente
  // a cada consulta y transacción: nunca se toma del cuerpo ni de la URL.

  const columnasPaciente = `codigo, modalidad, estado, proximaSesion, frecuencia, diaHabitual,
    horarioHabitual, fechaCreacion, fechaInicioTratamiento, motivoConsulta, postIt`;
  const columnasSesion = `id, fecha, horario, codigoPaciente, modalidad, estado,
    importeCentavos, pagadoCentavos, importeCentavos - pagadoCentavos AS pendienteCentavos`;
  const buscarPaciente = db.prepare<[number, string], Paciente>(`SELECT ${columnasPaciente} FROM pacientes WHERE usuarioId = ? AND codigo = ?`);
  const buscarSesion = db.prepare<[number, number], Sesion>(`SELECT ${columnasSesion} FROM sesiones WHERE usuarioId = ? AND id = ?`);
  const insertarPaciente = db.prepare(`INSERT INTO pacientes (usuarioId, ${columnasPaciente}) VALUES (
    @usuarioId, @codigo, @modalidad, @estado, @proximaSesion, @frecuencia, @diaHabitual,
    @horarioHabitual, @fechaCreacion, @fechaInicioTratamiento, @motivoConsulta, @postIt
  )`);

  function siguienteCodigo(usuarioId: number): string {
    const buscar = db.prepare('SELECT 1 FROM pacientes WHERE usuarioId = ? AND codigo = ? COLLATE NOCASE');
    for (let numero = 1; numero <= 9999999999; numero += 1) {
      const codigo = `P-${String(numero).padStart(3, '0')}`;
      if (!buscar.get(usuarioId, codigo)) return codigo;
    }
    throw new ErrorApi(409, 'No quedan identificadores automáticos disponibles.');
  }

  function sesionPorId(usuarioId: number, valor: string): Sesion {
    if (!/^[1-9]\d*$/.test(valor) || !Number.isSafeInteger(Number(valor))) {
      throw new ErrorApi(404, 'Sesión no encontrada');
    }
    const sesion = buscarSesion.get(usuarioId, Number(valor));
    if (!sesion) throw new ErrorApi(404, 'Sesión no encontrada');
    return sesion;
  }

  function fechaConsulta(consulta: Record<string, unknown>): string {
    campos(consulta, [], ['fecha']);
    const valor = consulta['fecha'];
    if (valor === undefined) return instanteLocal(reloj()).fecha;
    if (!esFechaISO(valor)) throw new ErrorApi(400, 'La fecha debe existir y usar el formato YYYY-MM-DD.');
    return valor;
  }

  function futuros(fecha: string, horario: string, ahora: string): void {
    if (`${fecha} ${horario}` <= ahora) throw new ErrorApi(400, 'Elegí una fecha y un horario futuros.');
  }

  function disponibles(usuarioId: number, fecha: string, ahora: string) {
    const { desde, hasta } = semanaDe(fecha);
    const horarios = db.prepare<[number, string, string, string], HorarioDisponible>(`
      SELECT fecha, horario, estado FROM turnos
      WHERE usuarioId = ? AND fecha BETWEEN ? AND ? AND estado IN ('Disponible', 'Liberado')
        AND fecha || ' ' || horario > ? ORDER BY fecha, horario
    `).all(usuarioId, desde, hasta, ahora);
    return { desde, hasta, horarios };
  }

  function sesionesSemana(usuarioId: number, fecha: string) {
    const { desde, hasta } = semanaDe(fecha);
    const sesiones = db.prepare<[number, string, string], Sesion>(`
      SELECT ${columnasSesion} FROM sesiones WHERE usuarioId = ? AND estado = 'Realizada'
        AND fecha BETWEEN ? AND ? ORDER BY fecha DESC, horario DESC, id DESC
    `).all(usuarioId, desde, hasta);
    return { desde, hasta, sesiones };
  }

  function pendientes(usuarioId: number): Sesion[] {
    return db.prepare<[number], Sesion>(`SELECT ${columnasSesion} FROM sesiones
      WHERE usuarioId = ? AND estado = 'Realizada' AND pagadoCentavos < importeCentavos ORDER BY fecha, horario, id`).all(usuarioId);
  }

  function actualizarProximaSesion(usuarioId: number, codigoPaciente: string, ahora: string): void {
    const proxima = db.prepare<[number, string, string], { fecha: string; horario: string }>(`
      SELECT fecha, horario FROM sesiones WHERE usuarioId = ? AND codigoPaciente = ? AND estado = 'Programada'
        AND fecha || ' ' || horario > ? ORDER BY fecha, horario LIMIT 1
    `).get(usuarioId, codigoPaciente, ahora);
    const diasCortos: Record<string, string> = { Lunes: 'LUN', Martes: 'MAR', Miércoles: 'MIÉ', Jueves: 'JUE', Viernes: 'VIE', Sábado: 'SÁB', Domingo: 'DOM' };
    const etiqueta = proxima ? `${diasCortos[nombreDia(proxima.fecha)]} ${proxima.horario} HS` : null;
    db.prepare('UPDATE pacientes SET proximaSesion = ? WHERE usuarioId = ? AND codigo = ?').run(etiqueta, usuarioId, codigoPaciente);
  }

  // Se llama dentro de una transacción inmediata. Un conflicto lanza una excepción
  // y revierte también el paciente cuando ambos se crean en la misma operación.
  function reservar(usuarioId: number, datos: Reserva, codigoPaciente: string, ahora: string): Sesion {
    futuros(datos.fecha, datos.horario, ahora);
    if (!buscarPaciente.get(usuarioId, codigoPaciente)) throw new ErrorApi(404, 'Paciente no encontrado');
    const turno = db.prepare('SELECT estado FROM turnos WHERE usuarioId = ? AND fecha = ? AND horario = ?').get(usuarioId, datos.fecha, datos.horario) as { estado: string } | undefined;
    if (!turno) throw new ErrorApi(404, 'Horario no encontrado');
    if (turno.estado === 'Programado') throw new ErrorApi(409, 'Ese horario ya está ocupado. Elegí otro.');
    const actualizado = db.prepare(`UPDATE turnos SET codigoPaciente = ?, modalidad = ?, estado = 'Programado'
      WHERE usuarioId = ? AND fecha = ? AND horario = ? AND estado IN ('Disponible', 'Liberado') AND codigoPaciente IS NULL`)
      .run(codigoPaciente, datos.modalidad, usuarioId, datos.fecha, datos.horario);
    if (actualizado.changes !== 1) throw new ErrorApi(409, 'Ese horario ya no está disponible.');
    const registro = db.prepare(`INSERT INTO sesiones (usuarioId, fecha, horario, codigoPaciente, modalidad, importeCentavos)
      VALUES (?, ?, ?, ?, ?, ?)`).run(usuarioId, datos.fecha, datos.horario, codigoPaciente, datos.modalidad, datos.importeCentavos);
    actualizarProximaSesion(usuarioId, codigoPaciente, ahora);
    return buscarSesion.get(usuarioId, Number(registro.lastInsertRowid))!;
  }

  app.get('/api/pacientes', (_req, res) => {
    res.json(db.prepare<[number], Paciente>(`SELECT ${columnasPaciente} FROM pacientes WHERE usuarioId = ? ORDER BY codigo`).all(res.locals['usuarioId']));
  });
  app.get('/api/pacientes/siguiente-codigo', (_req, res) => { res.json({ codigo: siguienteCodigo(res.locals['usuarioId']) }); });

  const crearPaciente = db.transaction((usuarioId: number, cuerpo: unknown) => {
    const datos = objeto(cuerpo);
    campos(datos, ['paciente'], ['turno']);
    const ficha = objeto(datos['paciente']);
    if (Object.hasOwn(ficha, 'fechaCreacion')) {
      throw new ErrorApi(400, 'La fecha de creación se asigna automáticamente y no debe enviarse.');
    }
    const ahora = instanteLocal(reloj());
    const codigo = ficha['codigo'] === undefined || (typeof ficha['codigo'] === 'string' && !ficha['codigo'].trim())
      ? siguienteCodigo(usuarioId) : ficha['codigo'];
    const resultado = validarPaciente({ ...ficha, codigo, fechaCreacion: ahora.fecha });
    if (!resultado.valido) throw new ErrorApi(400, resultado.mensaje);
    const paciente = resultado.paciente;
    if (db.prepare('SELECT 1 FROM pacientes WHERE usuarioId = ? AND codigo = ? COLLATE NOCASE').get(usuarioId, paciente.codigo)) {
      throw new ErrorApi(409, 'Ya existe un paciente con ese código.');
    }
    const turno = Object.hasOwn(datos, 'turno') ? validarReserva(datos['turno'], false) : null;
    insertarPaciente.run({ ...paciente, usuarioId });
    const sesion = turno ? reservar(usuarioId, turno, paciente.codigo, ahora.instante) : null;
    return { paciente: buscarPaciente.get(usuarioId, paciente.codigo)!, sesion };
  });
  app.post('/api/pacientes', (req, res) => { res.status(201).json(crearPaciente.immediate(res.locals['usuarioId'], req.body)); });

  app.get('/api/pacientes/:codigo', (req, res) => {
    const paciente = buscarPaciente.get(res.locals['usuarioId'], req.params.codigo);
    if (!paciente) throw new ErrorApi(404, 'Paciente no encontrado');
    res.json(paciente);
  });

  const actualizarPaciente = db.transaction((usuarioId: number, codigoOriginal: string, cuerpo: unknown) => {
    const existente = buscarPaciente.get(usuarioId, codigoOriginal);
    if (!existente) throw new ErrorApi(404, 'Paciente no encontrado');
    const datos = objeto(cuerpo);
    // Aceptamos omitir la fecha o reenviar el mismo valor para clientes anteriores.
    if (Object.hasOwn(datos, 'fechaCreacion') && (typeof datos['fechaCreacion'] !== 'string'
        || datos['fechaCreacion'].trim() !== existente.fechaCreacion)) {
      throw new ErrorApi(400, 'La fecha de creación del paciente no se puede modificar.');
    }
    const resultado = validarPaciente({ ...datos, fechaCreacion: existente.fechaCreacion });
    if (!resultado.valido) throw new ErrorApi(400, resultado.mensaje);
    const paciente = resultado.paciente;
    if (db.prepare('SELECT 1 FROM pacientes WHERE usuarioId = ? AND codigo = ? COLLATE NOCASE AND codigo <> ?').get(usuarioId, paciente.codigo, codigoOriginal)) {
      throw new ErrorApi(409, 'Ya existe un paciente con ese código.');
    }
    db.pragma('defer_foreign_keys = ON');
    db.prepare(`UPDATE pacientes SET codigo = @codigo, modalidad = @modalidad, estado = @estado,
      proximaSesion = @proximaSesion, frecuencia = @frecuencia, diaHabitual = @diaHabitual,
      horarioHabitual = @horarioHabitual, fechaInicioTratamiento = @fechaInicioTratamiento,
      motivoConsulta = @motivoConsulta, postIt = @postIt WHERE usuarioId = @usuarioId AND codigo = @codigoOriginal`)
      .run({ ...paciente, usuarioId, codigoOriginal });
    if (paciente.codigo !== codigoOriginal) {
      db.prepare('UPDATE turnos SET codigoPaciente = ? WHERE usuarioId = ? AND codigoPaciente = ?').run(paciente.codigo, usuarioId, codigoOriginal);
      db.prepare('UPDATE sesiones SET codigoPaciente = ? WHERE usuarioId = ? AND codigoPaciente = ?').run(paciente.codigo, usuarioId, codigoOriginal);
    }
    return paciente;
  });
  app.put('/api/pacientes/:codigo', (req, res) => { res.json(actualizarPaciente.immediate(res.locals['usuarioId'], req.params.codigo, req.body)); });

  app.get('/api/sesiones/semana', (req, res) => { res.json(sesionesSemana(res.locals['usuarioId'], fechaConsulta(req.query))); });
  app.get('/api/sesiones/pendientes', (_req, res) => { res.json(pendientes(res.locals['usuarioId'])); });
  app.get('/api/sesiones/:id', (req, res) => { res.json(sesionPorId(res.locals['usuarioId'], req.params.id)); });
  const crearSesion = db.transaction((usuarioId: number, cuerpo: unknown) => {
    const datos = validarReserva(cuerpo, true);
    return reservar(usuarioId, datos, datos.codigoPaciente!, instanteLocal(reloj()).instante);
  });
  app.post('/api/sesiones', (req, res) => { res.status(201).json(crearSesion.immediate(res.locals['usuarioId'], req.body)); });
  const realizarSesion = db.transaction((usuarioId: number, id: string) => {
    const sesion = sesionPorId(usuarioId, id);
    const ahora = instanteLocal(reloj()).instante;
    if (`${sesion.fecha} ${sesion.horario}` > ahora) {
      throw new ErrorApi(400, 'La sesión todavía no comenzó. Podrás marcarla realizada después de su horario.');
    }
    db.prepare("UPDATE sesiones SET estado = 'Realizada' WHERE usuarioId = ? AND id = ?").run(usuarioId, sesion.id);
    actualizarProximaSesion(usuarioId, sesion.codigoPaciente, ahora);
    return buscarSesion.get(usuarioId, sesion.id)!;
  });
  app.post('/api/sesiones/:id/realizar', (req, res) => { res.json(realizarSesion.immediate(res.locals['usuarioId'], req.params.id)); });
  const actualizarSesion = db.transaction((usuarioId: number, id: string, cuerpo: unknown) => {
    const sesion = sesionPorId(usuarioId, id);
    const datos = validarSesion(cuerpo);
    if (!buscarPaciente.get(usuarioId, datos.codigoPaciente)) throw new ErrorApi(404, 'Paciente no encontrado');
    const ahora = instanteLocal(reloj()).instante;
    if (datos.estado === 'Realizada' && `${datos.fecha} ${datos.horario}` > ahora) {
      throw new ErrorApi(400, 'La sesión todavía no comenzó. Podrás marcarla realizada después de su horario.');
    }
    const cambiaHorario = datos.fecha !== sesion.fecha || datos.horario !== sesion.horario;
    if (cambiaHorario) {
      const ocupante = db.prepare('SELECT id FROM sesiones WHERE usuarioId = ? AND fecha = ? AND horario = ?').get(usuarioId, datos.fecha, datos.horario);
      const destino = db.prepare<[number, string, string], { estado: Turno['estado']; codigoPaciente: string | null }>(
        'SELECT estado, codigoPaciente FROM turnos WHERE usuarioId = ? AND fecha = ? AND horario = ?',
      ).get(usuarioId, datos.fecha, datos.horario);
      if (ocupante || (destino && (destino.estado === 'Programado' || destino.codigoPaciente !== null))) {
        throw new ErrorApi(409, 'Ese horario ya está ocupado. Elegí otro.');
      }
      if (!destino) {
        db.prepare("INSERT INTO turnos (usuarioId, fecha, horario, codigoPaciente, modalidad, estado) VALUES (?, ?, ?, ?, ?, 'Programado')")
          .run(usuarioId, datos.fecha, datos.horario, datos.codigoPaciente, datos.modalidad);
      } else {
        const asignado = db.prepare(`UPDATE turnos SET codigoPaciente = ?, modalidad = ?, estado = 'Programado'
          WHERE usuarioId = ? AND fecha = ? AND horario = ? AND estado IN ('Disponible', 'Liberado') AND codigoPaciente IS NULL`)
          .run(datos.codigoPaciente, datos.modalidad, usuarioId, datos.fecha, datos.horario);
        if (asignado.changes !== 1) throw new ErrorApi(409, 'Ese horario ya no está disponible.');
      }
    } else {
      db.prepare('UPDATE turnos SET codigoPaciente = ?, modalidad = ? WHERE usuarioId = ? AND fecha = ? AND horario = ?')
        .run(datos.codigoPaciente, datos.modalidad, usuarioId, datos.fecha, datos.horario);
    }
    db.prepare(`UPDATE sesiones SET fecha = @fecha, horario = @horario, codigoPaciente = @codigoPaciente,
      modalidad = @modalidad, estado = @estado, importeCentavos = @importeCentavos,
      pagadoCentavos = @pagadoCentavos WHERE usuarioId = @usuarioId AND id = @id`).run({ ...datos, usuarioId, id: sesion.id });
    if (cambiaHorario) {
      db.prepare("UPDATE turnos SET codigoPaciente = NULL, modalidad = NULL, estado = 'Liberado' WHERE usuarioId = ? AND fecha = ? AND horario = ?")
        .run(usuarioId, sesion.fecha, sesion.horario);
    }
    for (const codigo of new Set([sesion.codigoPaciente, datos.codigoPaciente])) actualizarProximaSesion(usuarioId, codigo, ahora);
    return buscarSesion.get(usuarioId, sesion.id)!;
  });
  app.put('/api/sesiones/:id', (req, res) => { res.json(actualizarSesion.immediate(res.locals['usuarioId'], req.params.id, req.body)); });

  app.get('/api/horarios/disponibles', (req, res) => {
    res.json(disponibles(res.locals['usuarioId'], fechaConsulta(req.query), instanteLocal(reloj()).instante));
  });
  app.get('/api/horarios/:fecha/:horario', (req, res) => {
    if (!esFechaISO(req.params.fecha) || !esHorario(req.params.horario)) throw new ErrorApi(400, 'La fecha o el horario no son válidos.');
    const turno = db.prepare(`SELECT t.fecha, t.horario, t.estado, t.codigoPaciente, t.modalidad, s.id AS sesionId
      FROM turnos t LEFT JOIN sesiones s ON s.usuarioId = t.usuarioId AND s.fecha = t.fecha AND s.horario = t.horario
      WHERE t.usuarioId = ? AND t.fecha = ? AND t.horario = ?`).get(res.locals['usuarioId'], req.params.fecha, req.params.horario);
    if (!turno) throw new ErrorApi(404, 'Horario no encontrado');
    res.json(turno);
  });
  const crearHorario = db.transaction((usuarioId: number, cuerpo: unknown) => {
    const datos = objeto(cuerpo);
    campos(datos, ['fecha', 'horario']);
    if (!esFechaISO(datos['fecha']) || !esHorario(datos['horario'])) {
      throw new ErrorApi(400, 'La fecha y el horario deben existir y usar YYYY-MM-DD y HH:mm.');
    }
    const fecha = datos['fecha'];
    const horario = datos['horario'];
    futuros(fecha, horario, instanteLocal(reloj()).instante);
    if (db.prepare('SELECT 1 FROM turnos WHERE usuarioId = ? AND fecha = ? AND horario = ?').get(usuarioId, fecha, horario)) {
      throw new ErrorApi(409, 'Ya existe un turno para esa fecha y horario.');
    }
    db.prepare("INSERT INTO turnos (usuarioId, fecha, horario, codigoPaciente, modalidad, estado) VALUES (?, ?, ?, NULL, NULL, 'Disponible')").run(usuarioId, fecha, horario);
    return { fecha, horario, estado: 'Disponible' };
  });
  app.post('/api/horarios', (req, res) => { res.status(201).json(crearHorario.immediate(res.locals['usuarioId'], req.body)); });

  app.get('/api/agenda', (req, res) => {
    const semana = semanaDe(fechaConsulta(req.query));
    const consultar = db.prepare<[number, string], Turno>(`SELECT t.horario, t.codigoPaciente, t.modalidad, t.estado, s.id AS sesionId
      FROM turnos t LEFT JOIN sesiones s ON s.usuarioId = t.usuarioId AND s.fecha = t.fecha AND s.horario = t.horario
      WHERE t.usuarioId = ? AND t.fecha = ? ORDER BY t.horario`);
    res.json({ titulo: semana.titulo, dias: Array.from({ length: 7 }, (_, indice) => {
      const fecha = sumarDias(semana.desde, indice);
      return { fecha, nombre: nombreDia(fecha), turnos: consultar.all(res.locals['usuarioId'], fecha) };
    }) });
  });
  app.get('/api/dashboard', (_req, res) => {
    const ahora = instanteLocal(reloj());
    const pacientes = db.prepare<[number], { cantidad: number }>("SELECT COUNT(*) AS cantidad FROM pacientes WHERE usuarioId = ? AND estado = 'Activo' COLLATE NOCASE").get(res.locals['usuarioId'])!;
    res.json({ pacientesActivos: pacientes.cantidad, sesionesSemana: sesionesSemana(res.locals['usuarioId'], ahora.fecha).sesiones.length,
      pendientesCobro: pendientes(res.locals['usuarioId']).length, horariosDisponibles: disponibles(res.locals['usuarioId'], ahora.fecha, ahora.instante).horarios.length });
  });

  app.use((_req, res) => { res.status(404).json({ mensaje: 'Recurso no encontrado' }); });
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
