import { abrirPoolPostgres, ErrorConfiguracionPostgres, ErrorPostgresNoDisponible } from '../src/db/postgres.ts';

let pool;
try {
  pool = await abrirPoolPostgres();
  const { rows: [identidad] } = await pool.query('SELECT current_database() AS base, current_user AS rol');
  console.log(`Pool disponible: base ${identidad.base}; rol ${identidad.rol}.`);
} catch (error) {
  // No se imprime el error de pg, que podría contener información de conexión.
  console.error(error instanceof ErrorConfiguracionPostgres || error instanceof ErrorPostgresNoDisponible
    ? error.message : 'No se pudo comprobar el pool PostgreSQL.');
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
