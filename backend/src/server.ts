import { resolve } from 'node:path';
import { crearApp } from './app.ts';
import { abrirBaseDeDatos } from './db/database.ts';

const puerto = Number(process.env['PORT'] ?? 3000);
if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
  throw new Error('PORT debe ser un número entero entre 1 y 65535.');
}

// La ruta queda anclada a backend tanto desde src como desde dist. Node carga
// el archivo .env opcional mediante los comandos definidos en package.json.
const carpetaBackend = resolve(import.meta.dirname, '..');
const rutaBase = resolve(carpetaBackend, process.env['DB_PATH'] ?? 'data/psique.sqlite');
const origenFrontend = process.env['FRONTEND_ORIGIN'] ?? 'http://127.0.0.1:4200';
const db = abrirBaseDeDatos(rutaBase);
const app = crearApp(db, origenFrontend);

// Esta etapa se ejecuta únicamente en la propia PC, sin publicar el servidor en la red.
const servidor = app.listen(puerto, '127.0.0.1', () => {
  console.log(`API de PSIQUE disponible en http://127.0.0.1:${puerto}/api`);
});

servidor.on('error', () => {
  console.error('No se pudo iniciar la API. Revisá que el puerto esté disponible.');
  db.close();
  process.exitCode = 1;
});

// Al detener el proceso dejamos de aceptar consultas y cerramos el archivo SQLite.
function detenerServidor(): void {
  servidor.close(() => {
    db.close();
  });
}
process.once('SIGINT', detenerServidor);
process.once('SIGTERM', detenerServidor);
