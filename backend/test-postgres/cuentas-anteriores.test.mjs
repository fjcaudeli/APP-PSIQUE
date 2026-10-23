import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { conTransaccion } from './fixtures.mjs';

test('la excepción de cuentas anteriores no confirma altas posteriores ni cambia el default de registro', async () => {
  const sql = await readFile(new URL('../migrations/008_acceso_cuentas_anteriores.sql', import.meta.url), 'utf8');
  await conTransaccion(async c => {
    const { rows: [activacion] } = await c.query('SELECT "aplicadaEn" FROM public.migraciones WHERE version = 7');
    const fecha = activacion.aplicadaEn.getTime();
    const ids = [];
    for (const diferencia of [-86400000, 86400000]) {
      const { rows: [u] } = await c.query(`INSERT INTO public.usuarios (email, "passwordHash", "fechaCreacion")
        VALUES ($1, $2, $3) RETURNING id`, ['anterior-' + randomUUID() + '@example.test', 'hash-ficticio-sin-credenciales-reales', new Date(fecha + diferencia)]);
      ids.push(u.id);
    }
    await c.query(sql);
    const estados = (await c.query('SELECT id, "emailConfirmado" FROM public.usuarios WHERE id = ANY($1::integer[]) ORDER BY id', [ids])).rows;
    assert.deepEqual(estados.map(e => e.emailConfirmado), [true, false]);
    // Repetir el SQL no debe convertir una cuenta posterior en una excepción.
    await c.query(sql);
    assert.equal((await c.query('SELECT "emailConfirmado" FROM public.usuarios WHERE id=$1', [ids[1]])).rows[0].emailConfirmado, false);
    const { rows: [columna] } = await c.query(`SELECT column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='usuarios' AND column_name='emailConfirmado'`);
    assert.equal(columna.column_default, 'false');
  });
});
