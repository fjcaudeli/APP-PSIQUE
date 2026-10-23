import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { Consultorio } from '../api.ts';
import type { Paciente, ResumenDashboard, Sesion, SesionAgendada, Turno } from '../models.ts';
import { instanteLocal, nombreDia, semanaDe, sumarDias } from '../calendario.ts';
import {
  ErrorApi, futuros, idSesion,
  datosAltaPaciente, validarFicha, datosEdicionConHorario, comprobarRealizacion,
  asignarHabitual,
} from '../reglas-api.ts';
import { calcularCalendario, comprobarCruces, comprobarProxima, edicionCalendario, finSesion, horaTexto, reservaCalendario, siguePendiente, validarFechaReserva, ventanaCalendario } from '../agenda-calendario.ts';
import type { ReservaCalendario, SesionCalendario } from '../agenda-calendario.ts';
import { objeto, campos } from '../reglas-api.ts';
import { ErrorPostgresNoDisponible, esErrorDisponibilidadPostgres } from './postgres.ts';

// Proyectamos DATE y TIME a texto en SQL. No pasan por Date de JavaScript ni por
// la zona horaria del servidor. Los INTEGER siguen siendo números JSON.
const columnasPaciente = `codigo, modalidad, estado, "proximaSesion", frecuencia, "diaHabitual",
  to_char("horarioHabitual", 'HH24:MI') AS "horarioHabitual",
  to_char("fechaCreacion", 'YYYY-MM-DD') AS "fechaCreacion",
  to_char("fechaInicioTratamiento", 'YYYY-MM-DD') AS "fechaInicioTratamiento", "motivoConsulta", "postIt"`;
const columnasSesion = `id, to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(horario, 'HH24:MI') AS horario,
  "codigoPaciente", modalidad, estado, "importeCentavos", "pagadoCentavos",
  "importeCentavos" - "pagadoCentavos" AS "pendienteCentavos", resumen, "duracionMinutos",
  to_char(fecha + horario + "duracionMinutos" * interval '1 minute', 'HH24:MI') AS "horarioFin"`;
const columnasTurno = `to_char(t.fecha, 'YYYY-MM-DD') AS fecha, to_char(t.horario, 'HH24:MI') AS horario,
  t.estado, t."codigoPaciente", t.modalidad, s.id AS "sesionId"`;
const unionTurnos = `FROM public.turnos t LEFT JOIN public.sesiones s
  ON s."usuarioId" = t."usuarioId" AND s.fecha = t.fecha AND s.horario = t.horario AND s.estado <> 'Cancelada'`;

function etiquetaProximaConFecha(proxima: { fecha: string; horario: string } | undefined): string | null {
  // La fecha completa distingue reservas de distintas semanas sin convertirlas
  // a Date, para conservar el día y la hora local guardados en PostgreSQL.
  return proxima ? `${proxima.fecha.split('-').reverse().join('/')} · ${proxima.horario} hs` : null;
}

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
    const pacientes = (await consultar<Paciente>(`SELECT ${columnasPaciente} FROM public.pacientes
      WHERE "usuarioId" = $1 AND codigo = $2`, [usuarioId, codigo], cliente)).rows;
    return (await completarProximas(usuarioId, pacientes, cliente))[0];
  }
  async function completarProximas(usuarioId: number, pacientes: Paciente[], cliente?: PoolClient): Promise<Paciente[]> {
    if (!pacientes.length) return pacientes;
    // La etiqueta se deriva al leer: al terminar la sesión no queda una próxima
    // fecha vencida en la tarjeta, aunque todavía no se haya confirmado asistencia.
    const proximas = (await consultar<{ codigoPaciente: string; fecha: string; horario: string }>(`SELECT DISTINCT ON ("codigoPaciente")
      "codigoPaciente", to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(horario, 'HH24:MI') AS horario
      FROM public.sesiones WHERE "usuarioId" = $1 AND "codigoPaciente" = ANY($2::text[]) AND estado <> 'Cancelada'
      AND fecha + horario + "duracionMinutos" * interval '1 minute' > $3::timestamp
      ORDER BY "codigoPaciente", fecha, horario, id`, [usuarioId, pacientes.map(p => p.codigo), instanteLocal(reloj()).instante], cliente)).rows;
    return pacientes.map(p => ({ ...p, proximaSesion: etiquetaProximaConFecha(proximas.find(s => s.codigoPaciente === p.codigo)) }));
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
  async function buscarSesion(usuarioId: number, id: number, cliente?: PoolClient): Promise<SesionCalendario | undefined> {
    if (id > 2147483647) return undefined;
    return (await consultar<SesionCalendario>(`SELECT ${columnasSesion} FROM public.sesiones
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
      WHERE "usuarioId" = $1 AND "codigoPaciente" = $2 AND estado <> 'Cancelada'
        AND fecha + horario + "duracionMinutos" * interval '1 minute' > $3::timestamp ORDER BY fecha, horario LIMIT 1`, [usuarioId, codigo, ahora], cliente);
    await cliente.query('UPDATE public.pacientes SET "proximaSesion" = $1 WHERE "usuarioId" = $2 AND codigo = $3',
      [etiquetaProximaConFecha(proxima), usuarioId, codigo]);
  }
  async function sesionesPaciente(usuarioId: number, codigo: string, cliente?: PoolClient) {
    return (await consultar<SesionCalendario>(`SELECT ${columnasSesion} FROM public.sesiones
      WHERE "usuarioId" = $1 AND "codigoPaciente" = $2 ORDER BY fecha, horario, id`, [usuarioId, codigo], cliente)).rows;
  }
  async function actualizarInicioTratamiento(usuarioId: number, codigo: string, cliente: PoolClient) {
    // Se confirma junto con la sesión: editar su fecha, paciente o asistencia
    // vuelve a calcular el inicio sin dejar fechas manuales desactualizadas.
    await cliente.query(`UPDATE public.pacientes p SET "fechaInicioTratamiento" = (
      SELECT min(s.fecha) FROM public.sesiones s WHERE s."usuarioId" = p."usuarioId"
        AND s."codigoPaciente" = p.codigo AND s.estado = 'Realizada'
    ) WHERE p."usuarioId" = $1 AND p.codigo = $2`, [usuarioId, codigo]);
  }
  async function comprobarReserva(usuarioId: number, datos: ReservaCalendario, codigo: string, cliente: PoolClient, excluir?: number, futura = true) {
    const paciente = await buscarPaciente(usuarioId, codigo, cliente);
    if (!paciente) throw new ErrorApi(404, 'Paciente no encontrado');
    if (futura) {
      validarFechaReserva(datos, reloj);
      if (paciente.estado.toLowerCase() !== 'activo') throw new ErrorApi(409, 'Solo se pueden agendar sesiones para pacientes activos.');
      comprobarProxima(datos, (await sesionesPaciente(usuarioId, codigo, cliente)).filter(s => s.id !== excluir), instanteLocal(reloj()).instante);
    }
    const ocupadas = (await cliente.query<SesionCalendario>(`SELECT ${columnasSesion} FROM public.sesiones
      WHERE "usuarioId" = $1 AND fecha = $2 AND estado <> 'Cancelada' AND ($3::integer IS NULL OR id <> $3)`,
      [usuarioId, datos.fecha, excluir ?? null])).rows;
    comprobarCruces(datos, ocupadas);
  }
  async function ocuparTurno(usuarioId: number, datos: ReservaCalendario, codigo: string, cliente: PoolClient) {
    await cliente.query(`INSERT INTO public.turnos ("usuarioId", fecha, horario, "codigoPaciente", modalidad, estado)
      VALUES ($1, $2, $3, $4, $5, 'Programado') ON CONFLICT ("usuarioId", fecha, horario)
      DO UPDATE SET "codigoPaciente" = EXCLUDED."codigoPaciente", modalidad = EXCLUDED.modalidad, estado = 'Programado'`,
      [usuarioId, datos.fecha, datos.horario, codigo, datos.modalidad]);
  }
  async function liberarTurno(usuarioId: number, fecha: string, horario: string, cliente: PoolClient) {
    await cliente.query(`UPDATE public.turnos t SET "codigoPaciente" = NULL, modalidad = NULL, estado = 'Liberado'
      WHERE t."usuarioId" = $1 AND t.fecha = $2 AND t.horario = $3
      AND NOT EXISTS (SELECT 1 FROM public.sesiones s WHERE s."usuarioId" = t."usuarioId"
        AND s.fecha = t.fecha AND s.horario = t.horario AND s.estado <> 'Cancelada')`, [usuarioId, fecha, horario]);
  }
  async function reservar(usuarioId: number, datos: ReservaCalendario, codigo: string, ahora: string, cliente: PoolClient) {
    await comprobarReserva(usuarioId, datos, codigo, cliente);
    await ocuparTurno(usuarioId, datos, codigo, cliente);
    const { rows: [registro] } = await cliente.query<{ id: number }>(`INSERT INTO public.sesiones
      ("usuarioId", fecha, horario, "codigoPaciente", modalidad, "importeCentavos", "duracionMinutos")
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [usuarioId, datos.fecha, datos.horario, codigo, datos.modalidad, datos.importeCentavos, datos.duracionMinutos]);
    await cliente.query(`UPDATE public.pacientes SET "diaHabitual" = $1, "horarioHabitual" = $2 WHERE "usuarioId" = $3 AND codigo = $4`,
      [nombreDia(datos.fecha), datos.horario, usuarioId, codigo]);
    await actualizarProximaSesion(usuarioId, codigo, ahora, cliente);
    return (await buscarSesion(usuarioId, registro!.id, cliente))!;
  }
  function separarNota(cuerpo: unknown) {
    const original = objeto(cuerpo);
    const { postIt, ...datos } = original;
    const incluyeNota = Object.hasOwn(original, 'postIt');
    if (incluyeNota && (typeof postIt !== 'string' || postIt.length > 300)) {
      throw new ErrorApi(400, 'La Nota debe ser texto de hasta 300 caracteres; puede estar vacía.');
    }
    return { datos, nota: incluyeNota ? (postIt as string).trim() : undefined };
  }
  async function comprobarNotaSesion(usuarioId: number, sesion: SesionCalendario, ahora: string, cliente: PoolClient) {
    const { rows: [proxima] } = await cliente.query<{ id: number }>(`SELECT id FROM public.sesiones
      WHERE "usuarioId" = $1 AND "codigoPaciente" = $2 AND estado = 'Programada'
      AND fecha + horario + "duracionMinutos" * interval '1 minute' > $3::timestamp
      ORDER BY fecha, horario, id LIMIT 1`, [usuarioId, sesion.codigoPaciente, ahora]);
    if (proxima?.id !== sesion.id) throw new ErrorApi(409, 'Solo se puede editar la Nota de la próxima sesión programada. Volvé a Notas para actualizar el listado.');
  }
  async function guardarSesion(usuarioId: number, sesion: SesionCalendario, cuerpo: unknown, cliente: PoolClient) {
    const { datos: camposSesion, nota } = separarNota(cuerpo);
    const datos = edicionCalendario(camposSesion, sesion);
    const ahora = instanteLocal(reloj()).instante;
    if (nota !== undefined) {
      if (sesion.estado !== 'Programada' || datos.estado !== 'Programada' || datos.codigoPaciente !== sesion.codigoPaciente) {
        throw new ErrorApi(409, 'Para editar la Nota, conservá el paciente y el estado Programada de la sesión.');
      }
      await comprobarNotaSesion(usuarioId, sesion, ahora, cliente);
    }
    // Usamos la fecha guardada para que editarla en el mismo pedido no permita
    // trasladar a otro paciente una sesión cuyo horario ya pasó.
    if (`${sesion.fecha} ${sesion.horario}` <= ahora && datos.codigoPaciente !== sesion.codigoPaciente) {
      throw new ErrorApi(409, 'No se puede cambiar el paciente de una sesión cuyo horario ya pasó.');
    }
    if (!await buscarPaciente(usuarioId, datos.codigoPaciente, cliente)) throw new ErrorApi(404, 'Paciente no encontrado');
    comprobarRealizacion(datos.estado, datos.fecha, datos.horario, ahora);
    const cambia = datos.fecha !== sesion.fecha || datos.horario !== sesion.horario
      || datos.duracionMinutos !== sesion.duracionMinutos || datos.codigoPaciente !== sesion.codigoPaciente;
    if (sesion.estado === 'Cancelada' && cambia) throw new ErrorApi(400, 'Una sesión cancelada conserva su fecha, paciente y duración.');
    if (cambia) await comprobarReserva(usuarioId, datos, datos.codigoPaciente, cliente, sesion.id, `${datos.fecha} ${horaTexto(finSesion(datos))}` > ahora);
    if (datos.estado !== 'Cancelada') await ocuparTurno(usuarioId, datos, datos.codigoPaciente, cliente);
    await cliente.query(`UPDATE public.sesiones SET fecha = $1, horario = $2, "codigoPaciente" = $3, modalidad = $4, estado = $5,
      "importeCentavos" = $6, "pagadoCentavos" = $7, resumen = $8, "duracionMinutos" = $9 WHERE "usuarioId" = $10 AND id = $11`,
      [datos.fecha, datos.horario, datos.codigoPaciente, datos.modalidad, datos.estado, datos.importeCentavos, datos.pagadoCentavos, datos.resumen, datos.duracionMinutos, usuarioId, sesion.id]);
    if (cambia) await liberarTurno(usuarioId, sesion.fecha, sesion.horario, cliente);
    for (const codigo of new Set([sesion.codigoPaciente, datos.codigoPaciente])) {
      await actualizarProximaSesion(usuarioId, codigo, ahora, cliente);
      await actualizarInicioTratamiento(usuarioId, codigo, cliente);
    }
    if (nota !== undefined) {
      // Reprogramar no debe trasladar la Nota a un bloque que dejó de ser el próximo.
      if (cambia) await comprobarNotaSesion(usuarioId, sesion, ahora, cliente);
      await cliente.query('UPDATE public.pacientes SET "postIt" = $1 WHERE "usuarioId" = $2 AND codigo = $3',
        [nota, usuarioId, sesion.codigoPaciente]);
    }
    return (await buscarSesion(usuarioId, sesion.id, cliente))!;
  }
  async function pendientesDeAgendar(usuarioId: number) {
    const pacientes = (await consultar<Paciente>(`SELECT ${columnasPaciente} FROM public.pacientes p WHERE "usuarioId" = $1
      AND lower(estado COLLATE "C") = 'activo' AND NOT EXISTS (SELECT 1 FROM public.sesiones s
        WHERE s."usuarioId" = p."usuarioId" AND s."codigoPaciente" = p.codigo AND s.estado <> 'Cancelada'
        AND s.fecha + s.horario + s."duracionMinutos" * interval '1 minute' > $2::timestamp) ORDER BY codigo`,
      [usuarioId, instanteLocal(reloj()).instante])).rows;
    const ultimas = (await consultar<SesionCalendario>(`SELECT DISTINCT ON ("codigoPaciente") ${columnasSesion}
      FROM public.sesiones WHERE "usuarioId" = $1 AND estado <> 'Cancelada' ORDER BY "codigoPaciente", fecha DESC, horario DESC, id DESC`, [usuarioId])).rows;
    return pacientes.map(paciente => ({ paciente: { ...paciente, proximaSesion: null }, ultimaSesion: ultimas.find(s => s.codigoPaciente === paciente.codigo) ?? null }));
  }

  const datos: Consultorio = {
    async listarPacientes(usuarioId) {
      const pacientes = (await consultar<Paciente>(`SELECT ${columnasPaciente} FROM public.pacientes WHERE "usuarioId" = $1 ORDER BY codigo`, [usuarioId])).rows;
      return completarProximas(usuarioId, pacientes);
    },
    buscarPaciente, siguienteCodigo, sesionPorId,
    crearPaciente: (usuarioId, cuerpo) => transaccion(usuarioId, async cliente => {
      const { datos, ficha } = datosAltaPaciente(cuerpo);
      const ahora = instanteLocal(reloj());
      const codigo = ficha['codigo'] === undefined || (typeof ficha['codigo'] === 'string' && !ficha['codigo'].trim())
        ? await siguienteCodigo(usuarioId, cliente) : ficha['codigo'];
      if (ficha['estado'] !== undefined && ficha['estado'] !== 'Activo') throw new ErrorApi(400, 'Los pacientes nuevos se crean activos.');
      const p = validarFicha({ proximaSesion: null, frecuencia: 'A confirmar', diaHabitual: null, horarioHabitual: null,
        ...ficha, codigo, estado: 'Activo', fechaCreacion: ahora.fecha, fechaInicioTratamiento: null }, true);
      if (await codigoOcupado(usuarioId, p.codigo, null, cliente)) throw new ErrorApi(409, 'Ya existe un paciente con ese código.');
      const turno = Object.hasOwn(datos, 'turno') ? reservaCalendario(datos['turno'], false) : null;
      if (turno) asignarHabitual(p, turno);
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
      const { turno: seleccion, ...ficha } = objeto(cuerpo);
      if (Object.hasOwn(ficha, 'fechaInicioTratamiento') && ficha['fechaInicioTratamiento'] !== existente.fechaInicioTratamiento) {
        throw new ErrorApi(400, 'El inicio del tratamiento se calcula desde la primera sesión realizada y no se puede modificar.');
      }
      const { paciente: p } = datosEdicionConHorario({ ...existente, ...ficha }, existente, true);
      if (!['Activo', 'Suspendido', 'De vacaciones'].includes(p.estado) && p.estado !== existente.estado) throw new ErrorApi(400, 'Elegí Activo, Suspendido o De vacaciones. Para la baja usá Dar de baja.');
      const turno = seleccion === undefined ? null : objeto(seleccion);
      const ahora = instanteLocal(reloj()).instante;
      if (await codigoOcupado(usuarioId, p.codigo, original, cliente)) throw new ErrorApi(409, 'Ya existe un paciente con ese código.');
      await cliente.query('SET CONSTRAINTS public.turnos_paciente_fk, public.sesiones_paciente_fk DEFERRED');
      await cliente.query(`UPDATE public.pacientes SET codigo = $1, modalidad = $2, estado = $3, "proximaSesion" = $4,
        frecuencia = $5, "diaHabitual" = $6, "horarioHabitual" = $7, "motivoConsulta" = $8, "postIt" = $9
        WHERE "usuarioId" = $10 AND codigo = $11`,
      [p.codigo, p.modalidad, p.estado, p.proximaSesion, p.frecuencia, p.diaHabitual, p.horarioHabitual,
        p.motivoConsulta, p.postIt, usuarioId, original]);
      if (p.codigo !== original) {
        await cliente.query('UPDATE public.turnos SET "codigoPaciente" = $1 WHERE "usuarioId" = $2 AND "codigoPaciente" = $3', [p.codigo, usuarioId, original]);
        await cliente.query('UPDATE public.sesiones SET "codigoPaciente" = $1 WHERE "usuarioId" = $2 AND "codigoPaciente" = $3', [p.codigo, usuarioId, original]);
      }
      if (turno) {
        campos(turno, ['fecha', 'horario', 'duracionMinutos']);
        const proxima = (await sesionesPaciente(usuarioId, p.codigo, cliente)).find(s => siguePendiente(s, ahora));
        if (proxima) {
          await guardarSesion(usuarioId, proxima, { fecha: turno['fecha'], horario: turno['horario'], duracionMinutos: turno['duracionMinutos'],
            codigoPaciente: p.codigo, modalidad: proxima.modalidad, estado: proxima.estado, importeCentavos: proxima.importeCentavos,
            pagadoCentavos: proxima.pagadoCentavos, resumen: proxima.resumen }, cliente);
        } else {
          await reservar(usuarioId, reservaCalendario({ ...turno, modalidad: p.modalidad, importeCentavos: 0 }, false), p.codigo, ahora, cliente);
        }
        await cliente.query('UPDATE public.pacientes SET "diaHabitual" = $1, "horarioHabitual" = $2 WHERE "usuarioId" = $3 AND codigo = $4',
          [nombreDia(turno['fecha'] as string), turno['horario'], usuarioId, p.codigo]);
      }
      return (await buscarPaciente(usuarioId, p.codigo, cliente))!;
    }),
    async sesionesSemana(usuarioId, fecha) {
      const { desde, hasta } = semanaDe(fecha);
      const sesiones = (await consultar<Sesion>(`SELECT ${columnasSesion} FROM public.sesiones WHERE "usuarioId" = $1
        AND estado = 'Realizada' AND fecha BETWEEN $2 AND $3 ORDER BY fecha DESC, horario DESC, id DESC`, [usuarioId, desde, hasta])).rows;
      return { desde, hasta, sesiones };
    },
    async ultimasSesiones(usuarioId) {
      // Elegimos una sola realizada por paciente dentro de la cuenta. Después
      // ordenamos el conjunto por fecha/hora, sin recorte semanal ni mensual.
      return (await consultar<Sesion>(`WITH ultimas AS (
        SELECT DISTINCT ON ("codigoPaciente") * FROM public.sesiones
        WHERE "usuarioId" = $1 AND estado = 'Realizada'
        ORDER BY "codigoPaciente", fecha DESC, horario DESC, id DESC
      ) SELECT ${columnasSesion} FROM ultimas ORDER BY fecha DESC, horario DESC, id DESC`, [usuarioId])).rows;
    },
    async pendientes(usuarioId) {
      return (await consultar<Sesion>(`SELECT ${columnasSesion} FROM public.sesiones WHERE "usuarioId" = $1
        AND estado = 'Realizada' AND "pagadoCentavos" < "importeCentavos" ORDER BY fecha, horario, id`, [usuarioId])).rows;
    },
    async sesionesAgendadas(usuarioId, codigo) {
      if (codigo !== undefined && !await buscarPaciente(usuarioId, codigo)) throw new ErrorApi(404, 'Paciente no encontrado');
      const sesiones = (await consultar<Sesion>(`SELECT ${columnasSesion} FROM public.sesiones
        WHERE "usuarioId" = $1 AND estado = 'Programada'
        AND fecha + horario + "duracionMinutos" * interval '1 minute' > $2::timestamp
        AND ($3::text IS NULL OR "codigoPaciente" = $3) ORDER BY fecha, horario, id`,
      [usuarioId, instanteLocal(reloj()).instante, codigo ?? null])).rows;
      if (!sesiones.length) return [];
      const pacientes = (await consultar<{ codigo: string; postIt: string }>(`SELECT codigo, "postIt" FROM public.pacientes
        WHERE "usuarioId" = $1 AND codigo = ANY($2::text[])`, [usuarioId, sesiones.map(s => s.codigoPaciente)])).rows;
      const notas = new Map(pacientes.map(p => [p.codigo, p.postIt]));
      const vistos = new Set<string>();
      // La Nota vigente pertenece a la próxima sesión del paciente. No se
      // copia al historial ni se repite en el segundo bloque consecutivo.
      return sesiones.map((sesion): SesionAgendada => {
        const esProxima = !vistos.has(sesion.codigoPaciente);
        vistos.add(sesion.codigoPaciente);
        return { ...sesion, esProxima, postIt: esProxima ? notas.get(sesion.codigoPaciente) ?? '' : null };
      });
    },
    crearSesion: (usuarioId, cuerpo) => transaccion(usuarioId, async cliente => {
      const { datos: reserva, nota } = separarNota(cuerpo);
      const datos = reservaCalendario(reserva, true);
      const sesion = await reservar(usuarioId, datos, datos.codigoPaciente!, instanteLocal(reloj()).instante, cliente);
      // La nota vigente se confirma junto con la reserva. Omitirla conserva la
      // existente; enviarla vacía la retira. Un conflicto revierte ambas cosas.
      if (nota !== undefined) await cliente.query('UPDATE public.pacientes SET "postIt" = $1 WHERE "usuarioId" = $2 AND codigo = $3',
        [nota, usuarioId, datos.codigoPaciente]);
      return sesion;
    }),
    realizarSesion: (usuarioId, id) => transaccion(usuarioId, async cliente => {
      const sesion = await sesionPorId(usuarioId, id, cliente);
      const ahora = instanteLocal(reloj()).instante;
      if (sesion.estado === 'Cancelada') throw new ErrorApi(409, 'La sesión está cancelada.');
      comprobarRealizacion('Realizada', sesion.fecha, sesion.horario, ahora);
      await cliente.query("UPDATE public.sesiones SET estado = 'Realizada' WHERE \"usuarioId\" = $1 AND id = $2", [usuarioId, sesion.id]);
      await actualizarInicioTratamiento(usuarioId, sesion.codigoPaciente, cliente);
      await actualizarProximaSesion(usuarioId, sesion.codigoPaciente, ahora, cliente);
      return (await buscarSesion(usuarioId, sesion.id, cliente))!;
    }),
    actualizarSesion: (usuarioId, id, cuerpo) => transaccion(usuarioId, async cliente => guardarSesion(usuarioId, await sesionPorId(usuarioId, id, cliente), cuerpo, cliente)),
    cancelarSesion: (usuarioId, id) => transaccion(usuarioId, async cliente => {
      const sesion = await sesionPorId(usuarioId, id, cliente);
      if (sesion.estado !== 'Programada') throw new ErrorApi(409, 'Solo se puede desagendar una sesión programada.');
      futuros(sesion.fecha, sesion.horario, instanteLocal(reloj()).instante);
      await cliente.query(`UPDATE public.sesiones SET estado = 'Cancelada' WHERE "usuarioId" = $1 AND id = $2`, [usuarioId, sesion.id]);
      await liberarTurno(usuarioId, sesion.fecha, sesion.horario, cliente);
      await actualizarProximaSesion(usuarioId, sesion.codigoPaciente, instanteLocal(reloj()).instante, cliente);
      return (await buscarSesion(usuarioId, sesion.id, cliente))!;
    }),
    bajaPaciente: (usuarioId, codigo) => transaccion(usuarioId, async cliente => {
      if (!await buscarPaciente(usuarioId, codigo, cliente)) throw new ErrorApi(404, 'Paciente no encontrado');
      const ahora = instanteLocal(reloj()).instante;
      const canceladas = (await cliente.query<{ fecha: string; horario: string }>(`UPDATE public.sesiones SET estado = 'Cancelada'
        WHERE "usuarioId" = $1 AND "codigoPaciente" = $2 AND estado = 'Programada' AND fecha + horario > $3::timestamp
        RETURNING to_char(fecha, 'YYYY-MM-DD') AS fecha, to_char(horario, 'HH24:MI') AS horario`, [usuarioId, codigo, ahora])).rows;
      for (const s of canceladas) await liberarTurno(usuarioId, s.fecha, s.horario, cliente);
      await cliente.query(`UPDATE public.pacientes SET estado = 'De baja', "proximaSesion" = NULL WHERE "usuarioId" = $1 AND codigo = $2`, [usuarioId, codigo]);
      return (await buscarPaciente(usuarioId, codigo, cliente))!;
    }),
    pendientesAgendar: pendientesDeAgendar,
    async proximasPaciente(usuarioId, codigo) {
      if (!await buscarPaciente(usuarioId, codigo)) throw new ErrorApi(404, 'Paciente no encontrado');
      return (await sesionesPaciente(usuarioId, codigo)).filter(s => siguePendiente(s, instanteLocal(reloj()).instante));
    },
    async historialPaciente(usuarioId, codigo) {
      if (!await buscarPaciente(usuarioId, codigo)) throw new ErrorApi(404, 'Paciente no encontrado');
      // La asistencia confirmada define el histórico. No limitamos por semana
      // ni creamos copias: leemos las sesiones existentes de esta cuenta y ficha.
      return (await consultar<Sesion>(`SELECT ${columnasSesion} FROM public.sesiones
        WHERE "usuarioId" = $1 AND "codigoPaciente" = $2 AND estado = 'Realizada'
        ORDER BY fecha DESC, horario DESC, id DESC`, [usuarioId, codigo])).rows;
    },
    async calendario(usuarioId, excluir, fecha) {
      const ventana = ventanaCalendario(reloj);
      const periodo = fecha ? semanaDe(fecha) : ventana;
      const id = excluir === undefined ? null : (await sesionPorId(usuarioId, excluir)).id;
      const sesiones = (await consultar<SesionCalendario>(`SELECT ${columnasSesion} FROM public.sesiones
        WHERE "usuarioId" = $1 AND fecha BETWEEN $2 AND $3 AND ($4::integer IS NULL OR id <> $4)`, [usuarioId, periodo.desde, periodo.hasta, id])).rows;
      // La próxima sesión se busca sobre toda la cuenta, no solo en la semana
      // visible. La Nota no debe aparecer también en reservas posteriores.
      const proximas = (await consultar<{ id: number }>(`SELECT DISTINCT ON ("codigoPaciente") id FROM public.sesiones
        WHERE "usuarioId" = $1 AND estado = 'Programada'
        AND fecha + horario + "duracionMinutos" * interval '1 minute' > $2::timestamp
        ORDER BY "codigoPaciente", fecha, horario, id`, [usuarioId, ventana.instante])).rows;
      return calcularCalendario(sesiones, reloj, fecha, new Set(proximas.map(s => s.id)));
    },
    disponibles: () => { throw new ErrorApi(410, 'Consultá el calendario para ver las franjas libres.'); },
    disponiblesTodos: () => { throw new ErrorApi(410, 'Consultá el calendario para ver las franjas libres.'); },
    async consultarHorario(usuarioId, fecha, horario) {
      return (await consultar<Turno & { fecha: string }>(`SELECT ${columnasTurno} ${unionTurnos}
        WHERE t."usuarioId" = $1 AND t.fecha = $2 AND t.horario = $3`, [usuarioId, fecha, horario])).rows[0];
    },
    crearHorario: () => { throw new ErrorApi(410, 'Los horarios disponibles se calculan desde el calendario. Agendá directamente una sesión.'); },
    async agenda(usuarioId, fecha) {
      const semana = semanaDe(fecha);
      // Una consulta consistente para los siete días, incluidos los días vacíos.
      const turnos = (await consultar<Turno & { fecha: string }>(`SELECT ${columnasTurno} ${unionTurnos}
        WHERE t."usuarioId" = $1 AND t.fecha BETWEEN $2 AND $3 AND s.id IS NOT NULL ORDER BY t.fecha, t.horario`, [usuarioId, semana.desde, semana.hasta])).rows;
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
        (SELECT count(*)::integer FROM public.pacientes p WHERE p."usuarioId" = $1 AND lower(p.estado COLLATE "C") = 'activo'
          AND NOT EXISTS (SELECT 1 FROM public.sesiones s WHERE s."usuarioId" = p."usuarioId" AND s."codigoPaciente" = p.codigo
            AND s.estado <> 'Cancelada' AND s.fecha + s.horario + s."duracionMinutos" * interval '1 minute' > $4::timestamp)) AS "pendientesAgendar"`,
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
    calendario: proteger(datos.calendario!), pendientesAgendar: proteger(datos.pendientesAgendar!),
    proximasPaciente: proteger(datos.proximasPaciente!),
    historialPaciente: proteger(datos.historialPaciente!),
    sesionesAgendadas: proteger(datos.sesionesAgendadas!),
    ultimasSesiones: proteger(datos.ultimasSesiones!),
    listarPacientes: proteger(datos.listarPacientes), buscarPaciente: proteger(datos.buscarPaciente), siguienteCodigo: proteger(datos.siguienteCodigo),
    sesionesSemana: proteger(datos.sesionesSemana), pendientes: proteger(datos.pendientes), sesionPorId: proteger(datos.sesionPorId),
    disponibles: proteger(datos.disponibles), disponiblesTodos: proteger(datos.disponiblesTodos), consultarHorario: proteger(datos.consultarHorario), agenda: proteger(datos.agenda), dashboard: proteger(datos.dashboard),
  };
}
