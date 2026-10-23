import type { Pool, QueryResultRow } from 'pg';
import type { Express, ErrorRequestHandler } from 'express';
import { configurarAutenticacionConAlmacen } from './auth.ts';
import type { AlmacenUsuarios, UsuarioPublico } from './auth.ts';
import { ErrorPostgresNoDisponible, esErrorDisponibilidadPostgres } from './db/postgres.ts';
import { crearAccionesCuenta } from './cuenta-correo.ts';
import { correoSinConfigurar } from './correo.ts';
import type { Correo } from './correo.ts';

interface FilaUsuarioPublico extends QueryResultRow {
  id: number;
  email: string;
  fechaCreacion: Date;
}

interface FilaUsuario extends FilaUsuarioPublico {
  passwordHash: string;
  emailConfirmado: boolean;
  versionCredenciales: number;
}

function usuarioPublico(fila: FilaUsuarioPublico): UsuarioPublico {
  return { id: fila.id, email: fila.email, fechaCreacion: fila.fechaCreacion.toISOString() };
}

export function configurarAutenticacionPostgres(app: Express, pool: Pool, secretoJwt: string, reloj: () => Date,
  correo: Correo = correoSinConfigurar, origenFrontend = 'http://127.0.0.1:4200') {
  const acciones = crearAccionesCuenta(pool, correo, reloj, origenFrontend);
  acciones.configurarRutas(app);
  async function consultar<T extends QueryResultRow>(sql: string, valores: unknown[]) {
    try {
      return await pool.query<T>(sql, valores);
    } catch (error) {
      if (esErrorDisponibilidadPostgres(error, pool)) throw new ErrorPostgresNoDisponible();
      throw error;
    }
  }
  const usuarios: AlmacenUsuarios = {
    async buscarPorEmail(email) {
      const { rows: [fila] } = await consultar<FilaUsuario>(`SELECT id, email, "passwordHash", "fechaCreacion", "emailConfirmado", "versionCredenciales"
        FROM public.usuarios WHERE lower(email) = lower($1)`, [email]);
      return fila ? { ...usuarioPublico(fila), passwordHash: fila.passwordHash, emailConfirmado: fila.emailConfirmado, versionCredenciales: fila.versionCredenciales } : undefined;
    },
    async crearUsuario(email, passwordHash, fechaCreacion) {
      const { rows: [fila] } = await consultar<FilaUsuarioPublico>(`INSERT INTO public.usuarios (email, "passwordHash", "fechaCreacion")
        VALUES ($1, $2, $3) RETURNING id, email, "fechaCreacion"`, [email, passwordHash, fechaCreacion]);
      return usuarioPublico(fila!);
    },
    async existeUsuario(id, version) {
      // INTEGER es de 32 bits; un sub seguro pero fuera de rango representa un usuario inexistente.
      if (id > 2147483647 || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0 || version > 2147483647) return false;
      return (await consultar('SELECT id FROM public.usuarios WHERE id = $1 AND "emailConfirmado" AND "versionCredenciales" = $2', [id, version])).rowCount === 1;
    },
    esEmailDuplicado: error => error instanceof Error && 'code' in error && error.code === '23505'
      && 'constraint' in error && error.constraint === 'usuarios_email_unico',
    comprobarRegistro: acciones.comprobarCorreo,
    enviarConfirmacion: acciones.enviarConfirmacion,
  };
  configurarAutenticacionConAlmacen(app, usuarios, secretoJwt, reloj);
  return acciones.esperarEnvios;
}

// Debe montarse después de las rutas. Los demás fallos siguen al manejador general.
export const manejarDisponibilidadPostgres: ErrorRequestHandler = (error, _req, res, next) => {
  if (error instanceof ErrorPostgresNoDisponible) {
    res.status(503).json({ mensaje: error.message });
    return;
  }
  next(error);
};
