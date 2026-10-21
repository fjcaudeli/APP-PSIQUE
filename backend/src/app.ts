import type Database from 'better-sqlite3';
import { configurarAutenticacion } from './auth.ts';
import { crearApi } from './api.ts';
import type { HorarioDisponible, Paciente, Sesion, Turno } from './models.ts';
import {
  ErrorApi, objeto, campos, validarReserva, validarSesion, futuros, idSesion,
  etiquetaProxima, datosAltaPaciente, validarFicha, datosEdicionPaciente, comprobarRealizacion,
} from './reglas-api.ts';
import type { Reserva } from './reglas-api.ts';
import { esFechaISO, esHorario, instanteLocal, nombreDia, semanaDe, sumarDias } from './calendario.ts';

export function crearApp(db: Database.Database, origenFrontend: string, reloj: () => Date = () => new Date(), secretoJwt = process.env['JWT_SECRET'] ?? '') {
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
    const sesion = buscarSesion.get(usuarioId, idSesion(valor));
    if (!sesion) throw new ErrorApi(404, 'Sesión no encontrada');
    return sesion;
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
    const etiqueta = etiquetaProxima(proxima);
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

  const crearPaciente = db.transaction((usuarioId: number, cuerpo: unknown) => {
    const { datos, ficha } = datosAltaPaciente(cuerpo);
    const ahora = instanteLocal(reloj());
    const codigo = ficha['codigo'] === undefined || (typeof ficha['codigo'] === 'string' && !ficha['codigo'].trim())
      ? siguienteCodigo(usuarioId) : ficha['codigo'];
    const paciente = validarFicha({ ...ficha, codigo, fechaCreacion: ahora.fecha });
    if (db.prepare('SELECT 1 FROM pacientes WHERE usuarioId = ? AND codigo = ? COLLATE NOCASE').get(usuarioId, paciente.codigo)) {
      throw new ErrorApi(409, 'Ya existe un paciente con ese código.');
    }
    const turno = Object.hasOwn(datos, 'turno') ? validarReserva(datos['turno'], false) : null;
    insertarPaciente.run({ ...paciente, usuarioId });
    const sesion = turno ? reservar(usuarioId, turno, paciente.codigo, ahora.instante) : null;
    return { paciente: buscarPaciente.get(usuarioId, paciente.codigo)!, sesion };
  });

  const actualizarPaciente = db.transaction((usuarioId: number, codigoOriginal: string, cuerpo: unknown) => {
    const existente = buscarPaciente.get(usuarioId, codigoOriginal);
    if (!existente) throw new ErrorApi(404, 'Paciente no encontrado');
    const paciente = datosEdicionPaciente(cuerpo, existente);
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

  const crearSesion = db.transaction((usuarioId: number, cuerpo: unknown) => {
    const datos = validarReserva(cuerpo, true);
    return reservar(usuarioId, datos, datos.codigoPaciente!, instanteLocal(reloj()).instante);
  });
  const realizarSesion = db.transaction((usuarioId: number, id: string) => {
    const sesion = sesionPorId(usuarioId, id);
    const ahora = instanteLocal(reloj()).instante;
    comprobarRealizacion('Realizada', sesion.fecha, sesion.horario, ahora);
    db.prepare("UPDATE sesiones SET estado = 'Realizada' WHERE usuarioId = ? AND id = ?").run(usuarioId, sesion.id);
    actualizarProximaSesion(usuarioId, sesion.codigoPaciente, ahora);
    return buscarSesion.get(usuarioId, sesion.id)!;
  });
  const actualizarSesion = db.transaction((usuarioId: number, id: string, cuerpo: unknown) => {
    const sesion = sesionPorId(usuarioId, id);
    const datos = validarSesion(cuerpo);
    if (!buscarPaciente.get(usuarioId, datos.codigoPaciente)) throw new ErrorApi(404, 'Paciente no encontrado');
    const ahora = instanteLocal(reloj()).instante;
    comprobarRealizacion(datos.estado, datos.fecha, datos.horario, ahora);
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

  function consultarHorario(usuarioId: number, fecha: string, horario: string) {
    const turno = db.prepare(`SELECT t.fecha, t.horario, t.estado, t.codigoPaciente, t.modalidad, s.id AS sesionId
      FROM turnos t LEFT JOIN sesiones s ON s.usuarioId = t.usuarioId AND s.fecha = t.fecha AND s.horario = t.horario
      WHERE t.usuarioId = ? AND t.fecha = ? AND t.horario = ?`).get(usuarioId, fecha, horario);
    return turno as (Turno & { fecha: string }) | undefined;
  }

  function agenda(usuarioId: number, fechaConsulta: string) {
    const semana = semanaDe(fechaConsulta);
    const consultar = db.prepare<[number, string], Turno>(`SELECT t.horario, t.codigoPaciente, t.modalidad, t.estado, s.id AS sesionId
      FROM turnos t LEFT JOIN sesiones s ON s.usuarioId = t.usuarioId AND s.fecha = t.fecha AND s.horario = t.horario
      WHERE t.usuarioId = ? AND t.fecha = ? ORDER BY t.horario`);
    return { titulo: semana.titulo, dias: Array.from({ length: 7 }, (_, indice) => {
      const fecha = sumarDias(semana.desde, indice);
      return { fecha, nombre: nombreDia(fecha), turnos: consultar.all(usuarioId, fecha) };
    }) };
  }

  function dashboard(usuarioId: number) {
    const ahora = instanteLocal(reloj());
    const pacientes = db.prepare<[number], { cantidad: number }>("SELECT COUNT(*) AS cantidad FROM pacientes WHERE usuarioId = ? AND estado = 'Activo' COLLATE NOCASE").get(usuarioId)!;
    return { pacientesActivos: pacientes.cantidad, sesionesSemana: sesionesSemana(usuarioId, ahora.fecha).sesiones.length,
      pendientesCobro: pendientes(usuarioId).length, horariosDisponibles: disponibles(usuarioId, ahora.fecha, ahora.instante).horarios.length };
  }

  return crearApi({
    listarPacientes: usuarioId => db.prepare<[number], Paciente>(`SELECT ${columnasPaciente} FROM pacientes WHERE usuarioId = ? ORDER BY codigo`).all(usuarioId),
    buscarPaciente: (usuarioId, codigo) => buscarPaciente.get(usuarioId, codigo),
    siguienteCodigo, sesionesSemana, pendientes, sesionPorId, disponibles, consultarHorario, agenda, dashboard,
    crearPaciente: (usuarioId, cuerpo) => crearPaciente.immediate(usuarioId, cuerpo),
    actualizarPaciente: (usuarioId, codigo, cuerpo) => actualizarPaciente.immediate(usuarioId, codigo, cuerpo),
    crearSesion: (usuarioId, cuerpo) => crearSesion.immediate(usuarioId, cuerpo),
    realizarSesion: (usuarioId, id) => realizarSesion.immediate(usuarioId, id),
    actualizarSesion: (usuarioId, id, cuerpo) => actualizarSesion.immediate(usuarioId, id, cuerpo),
    crearHorario: (usuarioId, cuerpo) => crearHorario.immediate(usuarioId, cuerpo),
  }, app => configurarAutenticacion(app, db, secretoJwt, reloj), origenFrontend, reloj);
}
