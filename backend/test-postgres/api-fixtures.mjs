import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { abrirPoolPostgres } from '../dist/db/postgres.js';
import { crearAppPostgres } from '../dist/app-postgres.js';
import { crearApp } from '../dist/app.js';
import { abrirBaseDeDatos } from '../dist/db/database.js';
import { SignJWT } from 'jose';
import { conexionPruebas } from './fixtures.mjs';

export const ficha = codigo => ({
  ...(codigo === undefined ? {} : { codigo }), modalidad: 'Virtual', estado: 'Activo',
  proximaSesion: null, frecuencia: 'Quincenal', diaHabitual: null, horarioHabitual: null,
  fechaInicioTratamiento: '2026-10-05', motivoConsulta: '', postIt: '',
});
export const editable = ({ id: _id, pendienteCentavos: _saldo, ...datos }) => datos;
export const reserva = (codigoPaciente = 'P-001', horario = '10:00', fecha = '2026-10-05') =>
  ({ fecha, horario, codigoPaciente, modalidad: 'Virtual', importeCentavos: 123456 });

export async function entornoApi(t, motor = 'postgres', opciones = {}) {
  const prefijo = 'psique-api-' + randomUUID() + '-';
  const secreto = randomBytes(48).toString('hex');
  const password = 'Clave ficticia para la API 2026';
  let ahora = new Date('2026-10-05T12:00:00Z');
  const reloj = () => new Date(ahora);
  let pool = motor === 'postgres' ? await abrirPoolPostgres({ pruebas: true, ...opciones }) : undefined;
  const db = motor === 'sqlite' ? abrirBaseDeDatos(':memory:') : undefined;
  let servidor;
  const ids = [];
  async function iniciar() {
    const app = pool ? crearAppPostgres(pool, 'http://127.0.0.1:4200', reloj, secreto)
      : crearApp(db, 'http://127.0.0.1:4200', reloj, secreto);
    servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
  }
  await iniciar();
  t.after(async () => {
    try { if (servidor.listening) await new Promise(resolve => servidor.close(resolve)); }
    finally {
      if (pool && !pool.ending) await pool.end();
      if (db?.open) db.close();
      if (motor === 'postgres') {
        // La conexión verifica psique_test/psique_test antes de borrar. Se limita
        // a los IDs cuyo email tiene el UUID de esta instancia, nunca a toda la base.
        const c = await conexionPruebas();
        try {
          await c.query('BEGIN');
          const propios = (await c.query('SELECT id FROM public.usuarios WHERE email LIKE $1', [prefijo + '%'])).rows.map(u => u.id);
          for (const tabla of ['sesiones', 'turnos', 'pacientes']) {
            await c.query(`DELETE FROM public.${tabla} WHERE "usuarioId" = ANY($1::integer[])`, [propios]);
          }
          await c.query('DELETE FROM public.usuarios WHERE id = ANY($1::integer[])', [propios]);
          await c.query('COMMIT');
        } catch (error) { await c.query('ROLLBACK'); throw error; }
        finally { await c.end(); }
      }
    }
  });
  async function token(cuenta = 0, cambios = {}) {
    const iat = Math.floor(reloj().getTime() / 1000);
    return new SignJWT({ sub: String(ids[cuenta]), iss: 'psique', aud: 'psique-app', iat, exp: iat + 3600, ...cambios })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(new TextEncoder().encode(secreto));
  }
  async function raw(ruta, { metodo = 'GET', datos, bearer, texto } = {}) {
    const r = await fetch(`http://127.0.0.1:${servidor.address().port}/api/${ruta}`, {
      method: metodo,
      headers: { ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
        ...(datos !== undefined || texto !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(texto !== undefined ? { body: texto } : datos !== undefined ? { body: JSON.stringify(datos) } : {}),
    });
    return { status: r.status, body: await r.json() };
  }
  const transcript = [];
  const sesiones = new Map();
  function normalizar(valor, clave = '') {
    if (Array.isArray(valor)) return valor.map(v => normalizar(v));
    if (valor !== null && typeof valor === 'object') return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, normalizar(v, k)]));
    if (['id', 'sesionId'].includes(clave) && typeof valor === 'number') {
      if (!sesiones.has(valor)) sesiones.set(valor, sesiones.size + 1);
      return sesiones.get(valor);
    }
    return valor;
  }
  async function pedir(cuenta, ruta, metodo = 'GET', datos) {
    const r = await raw(ruta, { metodo, datos, bearer: await token(cuenta) });
    transcript.push({ cuenta, metodo, respuesta: normalizar(r) });
    return r;
  }
  const cuentas = [];
  for (const sufijo of ['a', 'b']) {
    const email = prefijo + sufijo + '@example.test';
    const registro = await raw('auth/registro', { metodo: 'POST', datos: { email, password, repetirPassword: password } });
    assert.equal(registro.status, 201);
    ids.push(registro.body.usuario.id);
    const login = await raw('auth/login', { metodo: 'POST', datos: { email, password } });
    assert.equal(login.status, 200);
    assert.deepEqual(login.body.usuario, registro.body.usuario);
    assert.equal(login.body.expiraEn, 3600);
    cuentas.push(login.body);
  }
  async function snapshot() {
    if (pool) {
      const resultado = {};
      for (const tabla of ['pacientes', 'turnos', 'sesiones']) {
        resultado[tabla] = (await pool.query(`SELECT row_to_json(t) AS fila FROM public.${tabla} t
          WHERE "usuarioId" = ANY($1::integer[]) ORDER BY "usuarioId", ${tabla === 'pacientes' ? 'codigo' : tabla === 'turnos' ? 'fecha, horario' : 'id'}`, [ids])).rows;
      }
      return resultado;
    }
    return Object.fromEntries(['pacientes', 'turnos', 'sesiones'].map(tabla => [tabla, db.prepare(`SELECT * FROM ${tabla} ORDER BY rowid`).all()]));
  }
  return { get pool() { return pool; }, db, ids, cuentas, raw, token, pedir, transcript, snapshot,
    avanzar: valor => { ahora = new Date(valor); },
    async reabrir() {
      assert.ok(pool, 'Solo se reabre el pool PostgreSQL');
      await new Promise(resolve => servidor.close(resolve));
      await pool.end();
      pool = await abrirPoolPostgres({ pruebas: true, ...opciones });
      await iniciar();
    },
  };
}
