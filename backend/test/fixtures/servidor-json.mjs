import { randomBytes } from 'node:crypto';
import { crearAppPostgres } from '../../dist/app-postgres.js';

// El caso de regresión nunca abre PostgreSQL ni usa credenciales del consultorio.
// Un proceso propio permite detectar una caída del parser sin afectar al ejecutor.
const pool = { query: async () => ({ rows: [] }) };
const app = crearAppPostgres(pool, 'http://127.0.0.1:4200', () => new Date(), randomBytes(48).toString('hex'));
const servidor = app.listen(0, '127.0.0.1', () => process.send({ puerto: servidor.address().port }));
process.on('message', mensaje => {
  if (mensaje === 'cerrar') servidor.close(() => process.exit(0));
});
