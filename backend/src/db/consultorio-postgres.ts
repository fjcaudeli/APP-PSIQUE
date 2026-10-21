import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { Consultorio } from '../api.ts';
import type { HorarioDisponible, Paciente, ResumenDashboard, Sesion, Turno } from '../models.ts';
import { esFechaISO, esHorario, instanteLocal, nombreDia, semanaDe, sumarDias } from '../calendario.ts';
import {
  ErrorApi, campos, etiquetaProxima, futuros, idSesion, objeto, validarReserva,
  validarSesion, datosAltaPaciente, validarFicha, datosEdicionPaciente, comprobarRealizacion,
} from '../reglas-api.ts';
import type { Reserva } from '../reglas-api.ts';
import { ErrorPostgresNoDisponible, esErrorDisponibilidadPostgres } from './postgres.ts';

// Proyectamos DATE y TIME a texto en SQL. No pasan por Date de JavaScript ni por
// la zona horaria del servidor. Los INTEGER siguen siendo números JSON.
const columnasPaciente = `codigo, modalidad, estado, "proximaSesion", frecuencia, "diaHabitual",
  to_char("horarioHabitual", 'HH24:MI') AS "horarioHabitual",
  to_char("fechaCreacion", 'YYYY-MM-DD') AS "fechaCreacion",
  to_char("fechaInicioTratamiento", 'YYYY-MM-DD') AS "fechaInicioTratamiento", "motivoConsulta", "postIt"`;
const columnasSesion = `id, to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(horario, 'HH24:MI') AS horario,
  "codigoPaciente", modalidad, estado, "importeCentavos", "pagadoCentavos",
  "importeCentavos" - "pagadoCentavos" AS "pendienteCentavos", resumen`;
const columnasTurno = `to_char(t.fecha, 'YYYY-MM-DD') AS fecha, to_char(t.horario, 'HH24:MI') AS horario,
  t.estado, t."codigoPaciente", t.modalidad, s.id AS "sesionId"`;
const unionTurnos = `FROM public.turnos t LEFT JOIN public.sesiones s
  ON s."usuarioId" = t."usuarioId" AND s.fecha = t.fecha AND s.horario = t.horario`;

export function crearConsultorioPostgres(pool: Pool, reloj: () => Date): Consultorio {
  // Fuera de transacciones usamos el pool. Dentro recibimos obligatoriamente el
  // cliente prestado: BEGIN, lecturas, escrituras y COMMIT usan la misma conexión.
  async function consultar<T extends QueryResultRow>(sql: string, valores: unknown[], cliente?: PoolClient) {
    return (cliente ?? pool).query<T>(sql, valores);
  }

  function traducir(error: unknown, mensajeHorario = 'Ese horario ya está ocupado. Elegí otro.'): never {
    const sql = error as { code?: string; constraint?: string } | null;
    if (sql?.code === '23505') {
      if (['pacientes_pk', 'pacientes_codigo_unico'].includes(sql.constraint ?? '')) {
        throw new ErrorApi(409, 'Ya existe un paciente con ese código.');
      }
      if (['turnos_pk', 'sesiones_horario_unico'].includes(sql.constraint ?? '')) throw new ErrorApi(409, mensajeHorario);
    }
    if (esErrorDisponibilidadPostgres(error, pool) || sql?.code === '55P03' || sql?.code === '40P01') {
      throw new ErrorPostgresNoDisponible('El servicio no está disponible. Intentá nuevamente.');
    }
    throw error;
  }

  async function transaccion<T>(usuarioId: number, operacion: (cliente: PoolClient) => Promise<T>, mensajeHorario?: string): Promise<T> {
    let cliente: PoolClient | undefined;
    let descartar = false;
    const conexionInterrumpida = () => { descartar = true; };
    try {
      cliente = await pool.connect();
      // El pool escucha errores de conexiones ociosas. Mientras el cliente está
      // prestado escuchamos también errores de socket y luego lo descartamos.
      cliente.on('error', conexionInterrumpida);
      await cliente.query('BEGIN');
      await cliente.query("SET LOCAL lock_timeout = '3s'");
      await cliente.query("SET LOCAL idle_in_transaction_session_timeout = '10s'");
      const propietario = await cliente.query('SELECT id FROM public.usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);
      if (propietario.rowCount !== 1) throw new ErrorApi(401, 'Iniciá sesión para acceder a PSIQUE.');
      const resultado = await operacion(cliente);
      await cliente.query('COMMIT');
      // La ruta recibe el resultado únicamente después de confirmar el conjunto.
      return resultado;
    } catch (error) {
      if (cliente) {
        try { await cliente.query('ROLLBACK'); }
        catch { descartar = true; }
      }
      return traducir(error, mensajeHorario);
    } finally {
      cliente?.release(descartar);
      cliente?.removeListener('error', conexionInterrumpida);
    }
  }

  async function buscarPaciente(usuarioId: number, codigo: string, cliente?: PoolClient): Promise<Paciente | undefined> {
    return (await consultar<Paciente>(`SELECT ${columnasPaciente} FROM public.pacientes
      WHERE "usuarioId" = $1 AND codigo = $2`, [usuarioId, codigo], cliente)).rows[0];
  }
  async function codigoOcupado(usuarioId: number, codigo: string, original: string | null, cliente?: PoolClient) {
    return (await consultar(`SELECT 1 FROM public.pacientes WHERE "usuarioId" = $1
      AND lower(codigo) = lower($2) AND ($3::text IS NULL OR codigo <> $3)`, [usuarioId, codigo, original], cliente)).rowCount !== 0;
  }
  async function siguienteCodigo(usuarioId: number, cliente?: PoolClient) {
    // Una lectura evita un viaje de red por cada código ya ocupado. El alta vuelve
    // a calcularlo después de tomar el bloqueo; una sugerencia no reserva el código.
    const existentes = new Set((await consultar<{ codigo: string }>(`SELECT lower(codigo) AS codigo
      FROM public.pacientes WHERE "usuarioId" = $1`, [usuarioId], cliente)).rows.map(p => p.codigo));
    for (let numero = 1; numero <= 9999999999; numero += 1) {
      const codigo = `P-${String(numero).padStart(3, '0')}`;
      if (!existentes.has(codigo.toLowerCase())) return codigo;
    }
    throw new ErrorApi(409, 'No quedan identificadores automáticos disponibles.');
  }
  async function buscarSesion(usuarioId: number, id: number, cliente?: PoolClient): Promise<Sesion | undefined> {
    if (id > 2147483647) return undefined;
    return (await consultar<Sesion>(`SELECT ${columnasSesion} FROM public.sesiones
      WHERE "usuarioId" = $1 AND id = $2`, [usuarioId, id], cliente)).rows[0];
  }
  async function sesionPorId(usuarioId: number, valor: string, cliente?: PoolClient) {
    const sesion = await buscarSesion(usuarioId, idSesion(valor), cliente);
    if (!sesion) throw new ErrorApi(404, 'Sesión no encontrada');
    return sesion;
  }
  async function actualizarProximaSesion(usuarioId: number, codigo: string, ahora: string, cliente: PoolClient) {
    const { rows: [proxima] } = await consultar<{ fecha: string; horario: string }>(`SELECT
      to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(horario, 'HH24:MI') AS horario FROM public.sesiones
      WHERE "usuarioId" = $1 AND "codigoPaciente" = $2 AND estado = 'Programada'
        AND fecha + horario > $3::timestamp ORDER BY fecha, horario LIMIT 1`, [usuarioId, codigo, ahora], cliente);
    await cliente.query('UPDATE public.pacientes SET "proximaSesion" = $1 WHERE "usuarioId" = $2 AND codigo = $3',
      [etiquetaProxima(proxima), usuarioId, codigo]);
  }
  async function reservar(usuarioId: number, datos: Reserva, codigo: string, ahora: string, cliente: PoolClient) {
    futuros(datos.fecha, datos.horario, ahora);
    if (!await buscarPaciente(usuarioId, codigo, cliente)) throw new ErrorApi(404, 'Paciente no encontrado');
    const { rows: [turno] } = await cliente.query('SELECT estado FROM public.turnos WHERE "usuarioId" = $1 AND fecha = $2 AND horario = $3',
      [usuarioId, datos.fecha, datos.horario]);
    if (!turno) throw new ErrorApi(404, 'Horario no encontrado');
    if (turno.estado === 'Programado') throw new ErrorApi(409, 'Ese horario ya está ocupado. Elegí otro.');
    const asignado = await cliente.query(`UPDATE public.turnos SET "codigoPaciente" = $1, modalidad = $2, estado = 'Programado'
      WHERE "usuarioId" = $3 AND fecha = $4 AND horario = $5 AND estado IN ('Disponible', 'Liberado') AND "codigoPaciente" IS NULL`,
    [codigo, datos.modalidad, usuarioId, datos.fecha, datos.horario]);
    if (asignado.rowCount !== 1) throw new ErrorApi(409, 'Ese horario ya no está disponible.');
    const { rows: [registro] } = await cliente.query<{ id: number }>(`INSERT INTO public.sesiones
      ("usuarioId", fecha, horario, "codigoPaciente", modalidad, "importeCentavos") VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [usuarioId, datos.fecha, datos.horario, codigo, datos.modalidad, datos.importeCentavos]);
    await actualizarProximaSesion(usuarioId, codigo, ahora, cliente);
    return (await buscarSesion(usuarioId, registro!.id, cliente))!;
  }

  const datos: Consultorio = {
    async listarPacientes(usuarioId) {
      return (await consultar<Paciente>(`SELECT ${columnasPaciente} FROM public.pacientes WHERE "usuarioId" = $1 ORDER BY codigo`, [usuarioId])).rows;
    },
    buscarPaciente, siguienteCodigo, sesionPorId,
    crearPaciente: (usuarioId, cuerpo) => transaccion(usuarioId, async cliente => {
      const { datos, ficha } = datosAltaPaciente(cuerpo);
      const ahora = instanteLocal(reloj());
      const codigo = ficha['codigo'] === undefined || (typeof ficha['codigo'] === 'string' && !ficha['codigo'].trim())
        ? await siguienteCodigo(usuarioId, cliente) : ficha['codigo'];
      const p = validarFicha({ ...ficha, codigo, fechaCreacion: ahora.fecha });
      if (await codigoOcupado(usuarioId, p.codigo, null, cliente)) throw new ErrorApi(409, 'Ya existe un paciente con ese código.');
      const turno = Object.hasOwn(datos, 'turno') ? validarReserva(datos['turno'], false) : null;
      await cliente.query(`INSERT INTO public.pacientes ("usuarioId", codigo, modalidad, estado, "proximaSesion", frecuencia,
        "diaHabitual", "horarioHabitual", "fechaCreacion", "fechaInicioTratamiento", "motivoConsulta", "postIt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [usuarioId, p.codigo, p.modalidad, p.estado, p.proximaSesion, p.frecuencia, p.diaHabitual,
        p.horarioHabitual, p.fechaCreacion, p.fechaInicioTratamiento, p.motivoConsulta, p.postIt]);
      const sesion = turno ? await reservar(usuarioId, turno, p.codigo, ahora.instante, cliente) : null;
      return { paciente: (await buscarPaciente(usuarioId, p.codigo, cliente))!, sesion };
    }),
    actualizarPaciente: (usuarioId, original, cuerpo) => transaccion(usuarioId, async cliente => {
      const existente = await buscarPaciente(usuarioId, original, cliente);
      if (!existente) throw new ErrorApi(404, 'Paciente no encontrado');
      const p = datosEdicionPaciente(cuerpo, existente);
      if (await codigoOcupado(usuarioId, p.codigo, original, cliente)) throw new ErrorApi(409, 'Ya existe un paciente con ese código.');
      await cliente.query('SET CONSTRAINTS public.turnos_paciente_fk, public.sesiones_paciente_fk DEFERRED');
      await cliente.query(`UPDATE public.pacientes SET codigo = $1, modalidad = $2, estado = $3, "proximaSesion" = $4,
        frecuencia = $5, "diaHabitual" = $6, "horarioHabitual" = $7, "fechaInicioTratamiento" = $8, "motivoConsulta" = $9, "postIt" = $10
        WHERE "usuarioId" = $11 AND codigo = $12`,
      [p.codigo, p.modalidad, p.estado, p.proximaSesion, p.frecuencia, p.diaHabitual, p.horarioHabitual,
        p.fechaInicioTratamiento, p.motivoConsulta, p.postIt, usuarioId, original]);
      if (p.codigo !== original) {
        await cliente.query('UPDATE public.turnos SET "codigoPaciente" = $1 WHERE "usuarioId" = $2 AND "codigoPaciente" = $3', [p.codigo, usuarioId, original]);
        await cliente.query('UPDATE public.sesiones SET "codigoPaciente" = $1 WHERE "usuarioId" = $2 AND "codigoPaciente" = $3', [p.codigo, usuarioId, original]);
      }
      return p;
    }),
    async sesionesSemana(usuarioId, fecha) {
      const { desde, hasta } = semanaDe(fecha);
      const sesiones = (await consultar<Sesion>(`SELECT ${columnasSesion} FROM public.sesiones WHERE "usuarioId" = $1
        AND estado = 'Realizada' AND fecha BETWEEN $2 AND $3 ORDER BY fecha DESC, horario DESC, id DESC`, [usuarioId, desde, hasta])).rows;
      return { desde, hasta, sesiones };
    },
    async pendientes(usuarioId) {
      return (await consultar<Sesion>(`SELECT ${columnasSesion} FROM public.sesiones WHERE "usuarioId" = $1
        AND estado = 'Realizada' AND "pagadoCentavos" < "importeCentavos" ORDER BY fecha, horario, id`, [usuarioId])).rows;
    },
    crearSesion: (usuarioId, cuerpo) => transaccion(usuarioId, async cliente => {
      const datos = validarReserva(cuerpo, true);
      return reservar(usuarioId, datos, datos.codigoPaciente!, instanteLocal(reloj()).instante, cliente);
    }),
    realizarSesion: (usuarioId, id) => transaccion(usuarioId, async cliente => {
      const sesion = await sesionPorId(usuarioId, id, cliente);
      const ahora = instanteLocal(reloj()).instante;
      comprobarRealizacion('Realizada', sesion.fecha, sesion.horario, ahora);
      await cliente.query("UPDATE public.sesiones SET estado = 'Realizada' WHERE \"usuarioId\" = $1 AND id = $2", [usuarioId, sesion.id]);
      await actualizarProximaSesion(usuarioId, sesion.codigoPaciente, ahora, cliente);
      return (await buscarSesion(usuarioId, sesion.id, cliente))!;
    }),
    actualizarSesion: (usuarioId, id, cuerpo) => transaccion(usuarioId, async cliente => {
      const sesion = await sesionPorId(usuarioId, id, cliente);
      const datos = validarSesion(cuerpo, sesion.resumen);
      if (!await buscarPaciente(usuarioId, datos.codigoPaciente, cliente)) throw new ErrorApi(404, 'Paciente no encontrado');
      const ahora = instanteLocal(reloj()).instante;
      comprobarRealizacion(datos.estado, datos.fecha, datos.horario, ahora);
      const cambiaHorario = datos.fecha !== sesion.fecha || datos.horario !== sesion.horario;
      if (cambiaHorario) {
        const ocupante = await cliente.query('SELECT id FROM public.sesiones WHERE "usuarioId" = $1 AND fecha = $2 AND horario = $3', [usuarioId, datos.fecha, datos.horario]);
        const { rows: [destino] } = await cliente.query('SELECT estado, "codigoPaciente" FROM public.turnos WHERE "usuarioId" = $1 AND fecha = $2 AND horario = $3', [usuarioId, datos.fecha, datos.horario]);
        if (ocupante.rowCount || (destino && (destino.estado === 'Programado' || destino.codigoPaciente !== null))) throw new ErrorApi(409, 'Ese horario ya está ocupado. Elegí otro.');
        if (!destino) {
          await cliente.query(`INSERT INTO public.turnos ("usuarioId", fecha, horario, "codigoPaciente", modalidad, estado)
            VALUES ($1, $2, $3, $4, $5, 'Programado')`, [usuarioId, datos.fecha, datos.horario, datos.codigoPaciente, datos.modalidad]);
        } else {
          const asignado = await cliente.query(`UPDATE public.turnos SET "codigoPaciente" = $1, modalidad = $2, estado = 'Programado'
            WHERE "usuarioId" = $3 AND fecha = $4 AND horario = $5 AND estado IN ('Disponible', 'Liberado') AND "codigoPaciente" IS NULL`,
          [datos.codigoPaciente, datos.modalidad, usuarioId, datos.fecha, datos.horario]);
          if (asignado.rowCount !== 1) throw new ErrorApi(409, 'Ese horario ya no está disponible.');
        }
      } else {
        await cliente.query('UPDATE public.turnos SET "codigoPaciente" = $1, modalidad = $2 WHERE "usuarioId" = $3 AND fecha = $4 AND horario = $5', [datos.codigoPaciente, datos.modalidad, usuarioId, datos.fecha, datos.horario]);
      }
      await cliente.query(`UPDATE public.sesiones SET fecha = $1, horario = $2, "codigoPaciente" = $3, modalidad = $4, estado = $5,
        "importeCentavos" = $6, "pagadoCentavos" = $7, resumen = $8 WHERE "usuarioId" = $9 AND id = $10`,
      [datos.fecha, datos.horario, datos.codigoPaciente, datos.modalidad, datos.estado, datos.importeCentavos, datos.pagadoCentavos, datos.resumen, usuarioId, sesion.id]);
      if (cambiaHorario) await cliente.query(`UPDATE public.turnos SET "codigoPaciente" = NULL, modalidad = NULL, estado = 'Liberado'
        WHERE "usuarioId" = $1 AND fecha = $2 AND horario = $3`, [usuarioId, sesion.fecha, sesion.horario]);
      for (const codigo of new Set([sesion.codigoPaciente, datos.codigoPaciente])) await actualizarProximaSesion(usuarioId, codigo, ahora, cliente);
      return (await buscarSesion(usuarioId, sesion.id, cliente))!;
    }),
    async disponibles(usuarioId, fecha, ahora) {
      const { desde, hasta } = semanaDe(fecha);
      const horarios = (await consultar<HorarioDisponible>(`SELECT to_char(fecha, 'YYYY-MM-DD') AS fecha,
        to_char(horario, 'HH24:MI') AS horario, estado FROM public.turnos WHERE "usuarioId" = $1 AND fecha BETWEEN $2 AND $3
        AND estado IN ('Disponible', 'Liberado') AND fecha + horario > $4::timestamp ORDER BY fecha, horario`, [usuarioId, desde, hasta, ahora])).rows;
      return { desde, hasta, horarios };
    },
    async consultarHorario(usuarioId, fecha, horario) {
      return (await consultar<Turno & { fecha: string }>(`SELECT ${columnasTurno} ${unionTurnos}
        WHERE t."usuarioId" = $1 AND t.fecha = $2 AND t.horario = $3`, [usuarioId, fecha, horario])).rows[0];
    },
    crearHorario: (usuarioId, cuerpo) => transaccion(usuarioId, async cliente => {
      const datos = objeto(cuerpo);
      campos(datos, ['fecha', 'horario']);
      if (!esFechaISO(datos['fecha']) || !esHorario(datos['horario'])) throw new ErrorApi(400, 'La fecha y el horario deben existir y usar YYYY-MM-DD y HH:mm.');
      const fecha = datos['fecha'], horario = datos['horario'];
      futuros(fecha, horario, instanteLocal(reloj()).instante);
      if ((await cliente.query('SELECT 1 FROM public.turnos WHERE "usuarioId" = $1 AND fecha = $2 AND horario = $3', [usuarioId, fecha, horario])).rowCount) {
        throw new ErrorApi(409, 'Ya existe un turno para esa fecha y horario.');
      }
      await cliente.query(`INSERT INTO public.turnos ("usuarioId", fecha, horario, "codigoPaciente", modalidad, estado)
        VALUES ($1, $2, $3, NULL, NULL, 'Disponible')`, [usuarioId, fecha, horario]);
      return { fecha, horario, estado: 'Disponible' };
    }, 'Ya existe un turno para esa fecha y horario.'),
    async agenda(usuarioId, fecha) {
      const semana = semanaDe(fecha);
      // Una consulta consistente para los siete días, incluidos los días vacíos.
      const turnos = (await consultar<Turno & { fecha: string }>(`SELECT ${columnasTurno} ${unionTurnos}
        WHERE t."usuarioId" = $1 AND t.fecha BETWEEN $2 AND $3 ORDER BY t.fecha, t.horario`, [usuarioId, semana.desde, semana.hasta])).rows;
      return { titulo: semana.titulo, dias: Array.from({ length: 7 }, (_, indice) => {
        const dia = sumarDias(semana.desde, indice);
        return { fecha: dia, nombre: nombreDia(dia), turnos: turnos.filter(t => t.fecha === dia).map(({ fecha: _fecha, ...turno }) => turno) };
      }) };
    },
    async dashboard(usuarioId) {
      const ahora = instanteLocal(reloj());
      const { desde, hasta } = semanaDe(ahora.fecha);
      // Las cuatro subconsultas comparten la instantánea de una única sentencia.
      // COUNT devuelve int8; ::integer conserva los contadores numéricos de la API.
      return (await consultar<ResumenDashboard>(`SELECT
        (SELECT count(*)::integer FROM public.pacientes WHERE "usuarioId" = $1 AND lower(estado COLLATE "C") = 'activo') AS "pacientesActivos",
        (SELECT count(*)::integer FROM public.sesiones WHERE "usuarioId" = $1 AND estado = 'Realizada' AND fecha BETWEEN $2 AND $3) AS "sesionesSemana",
        (SELECT count(*)::integer FROM public.sesiones WHERE "usuarioId" = $1 AND estado = 'Realizada' AND "pagadoCentavos" < "importeCentavos") AS "pendientesCobro",
        (SELECT count(*)::integer FROM public.turnos WHERE "usuarioId" = $1 AND fecha BETWEEN $2 AND $3 AND estado IN ('Disponible', 'Liberado') AND fecha + horario > $4::timestamp) AS "horariosDisponibles"`,
      [usuarioId, desde, hasta, ahora.instante])).rows[0]!;
    },
  };
  // Los fallos de lecturas independientes también se traducen. Las escrituras
  // ya pasan por transaccion(), que revierte antes de propagar el error HTTP.
  const proteger = <A extends unknown[], R>(operacion: (...args: A) => R) => async (...args: A): Promise<Awaited<R>> => {
    try { return await operacion(...args); }
    catch (error) { traducir(error); }
  };
  return {
    ...datos,
    listarPacientes: proteger(datos.listarPacientes), buscarPaciente: proteger(datos.buscarPaciente), siguienteCodigo: proteger(datos.siguienteCodigo),
    sesionesSemana: proteger(datos.sesionesSemana), pendientes: proteger(datos.pendientes), sesionPorId: proteger(datos.sesionPorId),
    disponibles: proteger(datos.disponibles), consultarHorario: proteger(datos.consultarHorario), agenda: proteger(datos.agenda), dashboard: proteger(datos.dashboard),
  };
}
