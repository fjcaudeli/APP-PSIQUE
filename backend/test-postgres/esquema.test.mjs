import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { ejecutarMigraciones } from '../scripts/migrar.mjs';
import { configuracionPostgres } from '../scripts/postgres-config.mjs';
import { conexionPruebas, conTransaccion, rechazaSql, casoDosProfesionales, paciente } from './fixtures.mjs';

before(async () => { await ejecutarMigraciones({ pruebas: true }); });

test('existen las cuatro tablas, sus claves primarias y los tipos previstos', async () => {
  await conTransaccion(async c => {
    const tablas = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(r => r.tablename);
    assert.deepEqual(tablas, ['migraciones', 'pacientes', 'sesiones', 'turnos', 'usuarios']);
    const claves = (await c.query(`SELECT t.relname AS tabla, ARRAY(
      SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY AS campo(numero, posicion)
      JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=campo.numero ORDER BY campo.posicion
      ) AS columnas FROM pg_constraint k JOIN pg_class t ON t.oid=k.conrelid
      WHERE k.connamespace='public'::regnamespace AND k.contype='p' ORDER BY t.relname`)).rows;
    assert.deepEqual(claves, [
      { tabla: 'migraciones', columnas: ['version'] },
      { tabla: 'pacientes', columnas: ['usuarioId', 'codigo'] },
      { tabla: 'sesiones', columnas: ['id'] },
      { tabla: 'turnos', columnas: ['usuarioId', 'fecha', 'horario'] },
      { tabla: 'usuarios', columnas: ['id'] },
    ]);
    const columnas = (await c.query(`SELECT table_name, column_name, data_type, is_nullable, is_identity, identity_generation
      FROM information_schema.columns WHERE table_schema='public'`)).rows;
    for (const tabla of ['usuarios', 'sesiones']) {
      const id = columnas.find(r => r.table_name === tabla && r.column_name === 'id');
      assert.equal(id.data_type, 'integer'); assert.equal(id.is_identity, 'YES'); assert.equal(id.identity_generation, 'BY DEFAULT');
    }
    for (const [tabla, campo, tipo] of [
      ['usuarios', 'fechaCreacion', 'timestamp with time zone'], ['pacientes', 'fechaCreacion', 'date'],
      ['pacientes', 'fechaInicioTratamiento', 'date'], ['pacientes', 'horarioHabitual', 'time without time zone'],
      ['turnos', 'fecha', 'date'], ['turnos', 'horario', 'time without time zone'],
      ['sesiones', 'importeCentavos', 'integer'], ['sesiones', 'pagadoCentavos', 'integer'], ['sesiones', 'resumen', 'text'],
    ]) assert.equal(columnas.find(r => r.table_name === tabla && r.column_name === campo).data_type, tipo);
    const opcionales = columnas.filter(r => r.is_nullable === 'YES').map(r => r.table_name + '.' + r.column_name).sort();
    assert.deepEqual(opcionales, ['pacientes.diaHabitual', 'pacientes.horarioHabitual', 'pacientes.proximaSesion', 'turnos.codigoPaciente', 'turnos.modalidad']);
  });
});

test('el resumen es opcional y PostgreSQL limita su longitud sin cambiar los importes', async () => {
  await conTransaccion(async c => {
    const { sesionId } = await casoDosProfesionales(c);
    assert.equal((await c.query('SELECT resumen FROM public.sesiones WHERE id=$1', [sesionId])).rows[0].resumen, '');
    await c.query('UPDATE public.sesiones SET resumen=$1 WHERE id=$2', ['x'.repeat(100), sesionId]);
    await rechazaSql(c, 'UPDATE public.sesiones SET resumen=$1 WHERE id=$2', ['x'.repeat(101), sesionId], '23514');
    await rechazaSql(c, 'UPDATE public.sesiones SET resumen=NULL WHERE id=$1', [sesionId], '23502');
    assert.deepEqual((await c.query('SELECT resumen,"importeCentavos","pagadoCentavos" FROM public.sesiones WHERE id=$1', [sesionId])).rows[0],
      { resumen: 'x'.repeat(100), importeCentavos: 2500000, pagadoCentavos: 1000000 });
  });
});

test('las seis claves foráneas conservan propietarios y referencias compuestas', async () => {
  await conTransaccion(async c => {
    const claves = (await c.query(`SELECT conname, condeferrable, condeferred, confupdtype, confdeltype,
      ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY AS f(n,p)
        JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=f.n ORDER BY f.p) AS columnas,
      ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY AS f(n,p)
        JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=f.n ORDER BY f.p) AS referenciadas
      FROM pg_constraint k WHERE connamespace='public'::regnamespace AND contype='f'`)).rows;
    assert.equal(claves.length, 6);
    for (const nombre of ['turnos_paciente_fk', 'sesiones_paciente_fk']) {
      const fk = claves.find(r => r.conname === nombre);
      assert.deepEqual(fk.columnas, ['usuarioId', 'codigoPaciente']);
      assert.deepEqual(fk.referenciadas, ['usuarioId', 'codigo']);
      assert.equal(fk.condeferrable, true); assert.equal(fk.condeferred, false);
    }
    const turno = claves.find(r => r.conname === 'sesiones_turno_fk');
    assert.deepEqual(turno.columnas, ['usuarioId', 'fecha', 'horario']);
    assert.deepEqual(turno.referenciadas, ['usuarioId', 'fecha', 'horario']);
    assert.ok(claves.every(r => r.confupdtype === 'a' && r.confdeltype === 'a'));
    assert.equal((await c.query("SELECT count(*)::integer AS n FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated")).rows[0].n, 0);
  });
});

test('email único sin distinguir mayúsculas e identificadores autogenerados', async () => {
  await conTransaccion(async c => {
    const { a, b } = await casoDosProfesionales(c);
    assert.equal(typeof a.id, 'number'); assert.ok(a.id > 0 && b.id > a.id);
    await rechazaSql(c, `INSERT INTO public.usuarios (email,"passwordHash","fechaCreacion")
      VALUES ($1, 'hash-ficticio', CURRENT_TIMESTAMP)`, [a.email.toUpperCase()], '23505');
    await rechazaSql(c, 'UPDATE public.usuarios SET "passwordHash"=NULL WHERE id=$1', [a.id], '23502');
    await rechazaSql(c, 'UPDATE public.usuarios SET email=NULL WHERE id=$1', [a.id], '23502');
    await rechazaSql(c, 'UPDATE public.usuarios SET "fechaCreacion"=NULL WHERE id=$1', [a.id], '23502');
  });
});

test('el código se repite entre profesionales y no dentro de una cuenta aunque cambie mayúsculas', async () => {
  await conTransaccion(async c => {
    const { a, b } = await casoDosProfesionales(c);
    assert.equal((await c.query("SELECT count(*)::integer AS n FROM public.pacientes WHERE codigo='P-001'")).rows[0].n, 2);
    await rechazaSql(c, 'UPDATE public.pacientes SET codigo=$1 WHERE "usuarioId"=$2 AND codigo=$3', ['p-001', b.id, 'SOLO-B'], '23505');
    for (const codigo of ['nuevo', 'NUEVO', 'abcdefghijklmn', '-P001', 'Con espacio']) {
      await rechazaSql(c, 'UPDATE public.pacientes SET codigo=$1 WHERE "usuarioId"=$2 AND codigo=$3', [codigo, a.id, 'P-001'], '23514');
    }
  });
});

test('pacientes conserva opcionales, frecuencias personalizadas y límites de texto actuales', async () => {
  await conTransaccion(async c => {
    const { a } = await casoDosProfesionales(c);
    await paciente(c, a.id, 'LIBRE');
    await c.query(`UPDATE public.pacientes SET frecuencia='Otra frecuencia', estado='En pausa', "postIt"=$1,
      "motivoConsulta"=$2, "proximaSesion"=NULL, "diaHabitual"=NULL, "horarioHabitual"=NULL
      WHERE "usuarioId"=$3 AND codigo='LIBRE'`, ['x'.repeat(300), 'x'.repeat(3000), a.id]);
    for (const [campo, valor] of [['postIt', 'x'.repeat(301)], ['motivoConsulta', 'x'.repeat(3001)],
      ['frecuencia', ''], ['estado', 'x'.repeat(41)], ['proximaSesion', 'x'.repeat(31)], ['diaHabitual', 'Otro día']]) {
      await rechazaSql(c, `UPDATE public.pacientes SET "${campo}"=$1 WHERE "usuarioId"=$2 AND codigo='LIBRE'`, [valor, a.id], '23514');
    }
  });
});

test('los turnos son únicos por profesional y respetan sus estados y asignaciones', async () => {
  await conTransaccion(async c => {
    const { a } = await casoDosProfesionales(c);
    await rechazaSql(c, `INSERT INTO public.turnos ("usuarioId",fecha,horario,estado)
      VALUES ($1,'2026-10-19','15:00','Disponible')`, [a.id], '23505');
    for (const estado of ['Disponible', 'Liberado']) {
      await c.query(`INSERT INTO public.turnos ("usuarioId",fecha,horario,estado)
        VALUES ($1,'2026-10-21',$2,$3)`, [a.id, estado === 'Disponible' ? '09:00' : '10:00', estado]);
    }
    await rechazaSql(c, "UPDATE public.turnos SET estado='Disponible' WHERE \"usuarioId\"=$1 AND fecha='2026-10-19'", [a.id], '23514');
    await rechazaSql(c, "UPDATE public.turnos SET modalidad=NULL WHERE \"usuarioId\"=$1 AND fecha='2026-10-19'", [a.id], '23514');
    await rechazaSql(c, "UPDATE public.turnos SET estado='Cancelado' WHERE \"usuarioId\"=$1 AND fecha='2026-10-19'", [a.id], '23514');
    await rechazaSql(c, "UPDATE public.turnos SET modalidad='Otra' WHERE \"usuarioId\"=$1 AND fecha='2026-10-19'", [a.id], '23514');
  });
});

test('una sesión por horario dentro de cada cuenta y defaults de estado e importes', async () => {
  await conTransaccion(async c => {
    const { a, b } = await casoDosProfesionales(c);
    await rechazaSql(c, `INSERT INTO public.sesiones ("usuarioId",fecha,horario,"codigoPaciente",modalidad)
      VALUES ($1,'2026-10-19','15:00','P-001','Virtual')`, [a.id], '23505');
    const sesion = (await c.query(`INSERT INTO public.sesiones ("usuarioId",fecha,horario,"codigoPaciente",modalidad)
      VALUES ($1,'2026-10-19','15:00','P-001','Virtual') RETURNING id,estado,"importeCentavos","pagadoCentavos"`, [b.id])).rows[0];
    assert.equal(typeof sesion.id, 'number');
    assert.deepEqual({ ...sesion, id: 0 }, { id: 0, estado: 'Programada', importeCentavos: 0, pagadoCentavos: 0 });
    await rechazaSql(c, "UPDATE public.sesiones SET estado='Ausente' WHERE id=$1", [sesion.id], '23514');
    await rechazaSql(c, "UPDATE public.sesiones SET modalidad='Otra' WHERE id=$1", [sesion.id], '23514');
  });
});

test('SQL directo rechaza usuarios inexistentes y pacientes u horarios exclusivos de otro profesional', async () => {
  await conTransaccion(async c => {
    const { a, sesionId } = await casoDosProfesionales(c);
    await rechazaSql(c, `INSERT INTO public.pacientes ("usuarioId",codigo,modalidad,estado,frecuencia,"fechaCreacion","fechaInicioTratamiento","motivoConsulta","postIt")
      VALUES (2147483647,'HUERFANO','Virtual','Activo','Semanal','2026-10-13','2026-10-13','','')`, [], '23503');
    await rechazaSql(c, `INSERT INTO public.turnos ("usuarioId",fecha,horario,"codigoPaciente",modalidad,estado)
      VALUES ($1,'2026-10-25','13:00','SOLO-B','Virtual','Programado')`, [a.id], '23503');
    await rechazaSql(c, 'UPDATE public.sesiones SET "codigoPaciente"=$1 WHERE id=$2', ['SOLO-B', sesionId], '23503');
    await rechazaSql(c, "UPDATE public.sesiones SET fecha='2026-10-20',horario='16:00' WHERE id=$1", [sesionId], '23503');
    await rechazaSql(c, 'DELETE FROM public.pacientes WHERE "usuarioId"=$1 AND codigo=$2', [a.id, 'P-001'], '23503');
  });
});

test('honorarios y cobros respetan centavos enteros, límite máximo y saldo no negativo', async () => {
  await conTransaccion(async c => {
    const { sesionId } = await casoDosProfesionales(c);
    for (const importe of [-1, 1000000000]) {
      await rechazaSql(c, 'UPDATE public.sesiones SET "importeCentavos"=$1,"pagadoCentavos"=0 WHERE id=$2', [importe, sesionId], '23514');
    }
    for (const pagado of [-1, 2500001]) {
      await rechazaSql(c, 'UPDATE public.sesiones SET "pagadoCentavos"=$1 WHERE id=$2', [pagado, sesionId], '23514');
    }
    await rechazaSql(c, 'UPDATE public.sesiones SET "importeCentavos"=$1 WHERE id=$2', [1.5, sesionId], '22P02');
    await rechazaSql(c, 'UPDATE public.sesiones SET "importeCentavos"=NULL WHERE id=$1', [sesionId], '23502');
    const fila = (await c.query(`UPDATE public.sesiones SET "importeCentavos"=999999999,"pagadoCentavos"=999999999
      WHERE id=$1 RETURNING "importeCentavos","pagadoCentavos","importeCentavos"-"pagadoCentavos" AS "pendienteCentavos"`, [sesionId])).rows[0];
    assert.deepEqual(fila, { importeCentavos: 999999999, pagadoCentavos: 999999999, pendienteCentavos: 0 });
  });
});

test('DATE y TIME se pueden proyectar como YYYY-MM-DD y HH:mm; TIMESTAMPTZ conserva el instante', async () => {
  await conTransaccion(async c => {
    const { a, sesionId } = await casoDosProfesionales(c);
    for (const zona of ['UTC', 'America/Argentina/Buenos_Aires']) {
      await c.query("SELECT set_config('TimeZone',$1,true)", [zona]);
      const usuario = (await c.query('SELECT "fechaCreacion" FROM public.usuarios WHERE id=$1', [a.id])).rows[0];
      assert.equal(usuario.fechaCreacion.toISOString(), '2026-10-13T15:12:34.123Z');
      const sesion = (await c.query(`SELECT to_char(fecha,'YYYY-MM-DD') AS fecha,
        to_char(horario,'HH24:MI') AS horario FROM public.sesiones WHERE id=$1`, [sesionId])).rows[0];
      assert.deepEqual(sesion, { fecha: '2026-10-19', horario: '15:00' });
    }
  });
});

test('fechas inválidas, infinitas, segundos y 24:00 no entran en los campos de calendario', async () => {
  await conTransaccion(async c => {
    const { a } = await casoDosProfesionales(c);
    const actualizar = 'UPDATE public.pacientes SET "fechaInicioTratamiento"=$1 WHERE "usuarioId"=$2 AND codigo=$3';
    await rechazaSql(c, actualizar, ['2026-02-30', a.id, 'P-001'], '22008');
    await rechazaSql(c, actualizar, ['infinity', a.id, 'P-001'], '23514');
    for (const hora of ['24:00', '12:00:01', '12:00:00.1']) {
      await rechazaSql(c, 'UPDATE public.pacientes SET "horarioHabitual"=$1 WHERE "usuarioId"=$2 AND codigo=$3', [hora, a.id, 'P-001'], '23514');
    }
    for (const hora of ['00:00', '23:59']) {
      await c.query('UPDATE public.pacientes SET "horarioHabitual"=$1 WHERE "usuarioId"=$2 AND codigo=$3', [hora, a.id, 'P-001']);
    }
    await c.query(actualizar, ['2024-02-29', a.id, 'P-001']);
  });
});

test('renombrar sin diferir las referencias falla y conserva los datos', async () => {
  await conTransaccion(async c => {
    const { a } = await casoDosProfesionales(c);
    await rechazaSql(c, "UPDATE public.pacientes SET codigo='NUEVO-COD' WHERE \"usuarioId\"=$1 AND codigo='P-001'", [a.id], '23503');
    assert.equal((await c.query('SELECT codigo FROM public.pacientes WHERE "usuarioId"=$1', [a.id])).rows[0].codigo, 'P-001');
  });
});

test('renombrado diferido actualiza paciente, turnos y sesiones sin afectar al otro profesional', async () => {
  await conTransaccion(async c => {
    const { a, b, sesionId } = await casoDosProfesionales(c);
    await c.query('SET CONSTRAINTS turnos_paciente_fk, sesiones_paciente_fk DEFERRED');
    await c.query("UPDATE public.pacientes SET codigo='p-001' WHERE \"usuarioId\"=$1 AND codigo='P-001'", [a.id]);
    for (const tabla of ['turnos', 'sesiones']) {
      await c.query(`UPDATE public.${tabla} SET "codigoPaciente"='p-001' WHERE "usuarioId"=$1 AND "codigoPaciente"='P-001'`, [a.id]);
    }
    await c.query('SET CONSTRAINTS turnos_paciente_fk, sesiones_paciente_fk IMMEDIATE');
    const sesion = (await c.query('SELECT id,"codigoPaciente","importeCentavos","pagadoCentavos" FROM public.sesiones WHERE id=$1', [sesionId])).rows[0];
    assert.deepEqual(sesion, { id: sesionId, codigoPaciente: 'p-001', importeCentavos: 2500000, pagadoCentavos: 1000000 });
    assert.equal((await c.query("SELECT codigo FROM public.pacientes WHERE \"usuarioId\"=$1 AND codigo='P-001'", [b.id])).rowCount, 1);
    assert.equal((await c.query("SELECT \"codigoPaciente\" FROM public.turnos WHERE \"usuarioId\"=$1 AND fecha='2026-10-19'", [b.id])).rows[0].codigoPaciente, 'P-001');
  });
});

test('COMMIT rechaza un renombrado diferido incompleto y revierte toda la transacción', async () => {
  const c = await conexionPruebas();
  try {
    const antes = (await c.query('SELECT count(*)::integer AS n FROM public.usuarios')).rows[0].n;
    await c.query('BEGIN');
    const { a } = await casoDosProfesionales(c);
    await c.query('SET CONSTRAINTS turnos_paciente_fk, sesiones_paciente_fk DEFERRED');
    await c.query("UPDATE public.pacientes SET codigo='INCOMPLETO' WHERE \"usuarioId\"=$1 AND codigo='P-001'", [a.id]);
    await assert.rejects(c.query('COMMIT'), error => error.code === '23503');
    assert.equal((await c.query('SELECT count(*)::integer AS n FROM public.usuarios')).rows[0].n, antes);
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
});

test('el rol de pruebas no es administrador y PostgreSQL le niega conexión a desarrollo', async () => {
  const c = await conexionPruebas();
  try {
    const flags = (await c.query(`SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
      FROM pg_roles WHERE rolname=current_user`)).rows[0];
    assert.ok(Object.values(flags).every(valor => valor === false));
    assert.equal((await c.query("SELECT has_database_privilege(current_user,'psique','CONNECT') AS conectar")).rows[0].conectar, false);
    const url = new URL(configuracionPostgres('pruebas').connectionString);
    url.pathname = '/psique';
    const prohibida = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
    try { await assert.rejects(prohibida.connect(), error => error.code === '42501'); }
    finally { await prohibida.end().catch(() => {}); }
  } finally { await c.end(); }
});
