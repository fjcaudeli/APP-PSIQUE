import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash, argon2id } from 'argon2';
import { abrirConexion, configuracionPostgres } from '../scripts/postgres-config.mjs';

// Solo se conoce esta clave ficticia. Los usuarios de prueba se revierten al terminar.
const hashFicticio = await hash('Clave exclusivamente ficticia de pruebas', { type: argon2id });

export async function conexionPruebas() {
  return abrirConexion(configuracionPostgres('pruebas'));
}

export async function conTransaccion(prueba) {
  const cliente = await conexionPruebas();
  try {
    await cliente.query('BEGIN');
    await prueba(cliente);
  } finally {
    await cliente.query('ROLLBACK');
    await cliente.end();
  }
}

export async function rechazaSql(cliente, sql, valores, codigo) {
  // Un error SQL aborta la transacción PostgreSQL. El savepoint permite continuar la prueba.
  await cliente.query('SAVEPOINT rechazo_esperado');
  try {
    await assert.rejects(cliente.query(sql, valores), error => {
      assert.equal(error.code, codigo);
      return true;
    });
  } finally {
    await cliente.query('ROLLBACK TO SAVEPOINT rechazo_esperado');
    await cliente.query('RELEASE SAVEPOINT rechazo_esperado');
  }
}

export async function paciente(cliente, usuarioId, codigo = 'P-001') {
  await cliente.query(`INSERT INTO public.pacientes
    ("usuarioId", codigo, modalidad, estado, frecuencia, "fechaCreacion", "fechaInicioTratamiento", "motivoConsulta", "postIt")
    VALUES ($1, $2, 'Virtual', 'Activo', 'Quincenal', '2026-10-13', '2026-10-12', '', '')`, [usuarioId, codigo]);
}

export async function casoDosProfesionales(cliente) {
  const ids = [];
  for (const letra of ['a', 'b']) {
    const { rows: [usuario] } = await cliente.query(`INSERT INTO public.usuarios (email, "passwordHash", "fechaCreacion")
      VALUES ($1, $2, $3) RETURNING id, email`, [`fixture-${letra}-${randomUUID()}@example.test`, hashFicticio, '2026-10-13T15:12:34.123Z']);
    ids.push(usuario);
    await paciente(cliente, usuario.id);
  }
  const [a, b] = ids;
  await paciente(cliente, b.id, 'SOLO-B');
  for (const id of [a.id, b.id]) {
    await cliente.query(`INSERT INTO public.turnos ("usuarioId", fecha, horario, "codigoPaciente", modalidad, estado)
      VALUES ($1, '2026-10-19', '15:00', 'P-001', 'Virtual', 'Programado')`, [id]);
  }
  await cliente.query(`INSERT INTO public.turnos ("usuarioId", fecha, horario, "codigoPaciente", modalidad, estado)
    VALUES ($1, '2026-10-20', '16:00', 'SOLO-B', 'Virtual', 'Programado')`, [b.id]);
  const { rows: [sesion] } = await cliente.query(`INSERT INTO public.sesiones
    ("usuarioId", fecha, horario, "codigoPaciente", modalidad, "importeCentavos", "pagadoCentavos")
    VALUES ($1, '2026-10-19', '15:00', 'P-001', 'Virtual', 2500000, 1000000) RETURNING id`, [a.id]);
  return { a, b, sesionId: sesion.id };
}
