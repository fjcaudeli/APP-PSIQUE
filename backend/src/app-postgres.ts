import type { Pool } from 'pg';
import { crearApi } from './api.ts';
import { configurarAutenticacionPostgres, manejarDisponibilidadPostgres } from './auth-postgres.ts';
import { crearConsultorioPostgres } from './db/consultorio-postgres.ts';
import { configurarDisponibilidad } from './disponibilidad.ts';
import type { SeguridadHttp } from './seguridad-http.ts';
import type { Correo } from './correo.ts';

// El consumidor abre y comprueba el pool antes de escuchar HTTP y lo cierra al
// terminar. server.ts utiliza esta API como implementación habitual PostgreSQL.
export function crearAppPostgres(pool: Pool, origenFrontend: string, reloj: () => Date, secretoJwt: string,
  opciones: SeguridadHttp & { cerrando?: () => boolean; correo?: Correo } = {}) {
  return crearApi(crearConsultorioPostgres(pool, reloj),
    app => { app.locals['esperarCorreos'] = configurarAutenticacionPostgres(app, pool, secretoJwt, reloj, opciones.correo, origenFrontend); },
    origenFrontend, reloj, manejarDisponibilidadPostgres, { ...opciones, configurarAntesDeAuth: app => {
      configurarDisponibilidad(app, async () => {
        if (opciones.cerrando?.()) throw new Error('Cierre en curso.');
        await pool.query('SELECT 1');
      });
    } });
}
