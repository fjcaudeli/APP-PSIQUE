import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Express } from 'express';
import type { Pool } from 'pg';
import type { Correo } from './correo.ts';
import { ErrorApi, campos, objeto } from './reglas-api.ts';
import { limitarAutenticacion } from './seguridad-http.ts';
import { ErrorPostgresNoDisponible, esErrorDisponibilidadPostgres } from './db/postgres.ts';

const MENSAJE_SOLICITUD = 'Si el email corresponde a una cuenta que necesita este enlace, recibirás un correo. Revisá también spam. Si ya lo solicitaste, esperá un minuto antes de repetir.';
const ENLACE_INVALIDO = 'El enlace no es válido, ya fue utilizado o venció. Solicitá uno nuevo.';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function crearAccionesCuenta(pool: Pool, correo: Correo, reloj: () => Date, origenFrontend: string) {
  const envios = new Set<Promise<boolean>>();
  async function consultar(sql: string, valores: unknown[]) {
    try { return await pool.query(sql, valores); }
    catch (error) {
      if (esErrorDisponibilidadPostgres(error, pool)) throw new ErrorPostgresNoDisponible();
      throw error;
    }
  }
  function comprobarCorreo(): void {
    if (!correo.habilitado) throw new ErrorApi(503, 'El envío de correos no está disponible. Intentá nuevamente más tarde.');
  }
  async function enviarEnlace(email: string, confirmacion: boolean, esperarEnvio = true): Promise<boolean> {
    comprobarCorreo();
    const token = randomBytes(32).toString('base64url');
    const hash = hashToken(token);
    const ahora = reloj();
    const duracion = (confirmacion ? 24 * 60 : 30) * 60000;
    const vence = new Date(ahora.getTime() + duracion);
    // Los nombres provienen de esta elección interna, nunca de la solicitud.
    const campoHash = confirmacion ? 'confirmacionHash' : 'recuperacionHash';
    const campoVence = confirmacion ? 'confirmacionVence' : 'recuperacionVence';
    // UPDATE es atómico: peticiones simultáneas no sortean el minuto de espera.
    const { rows: [usuario] } = await consultar(`UPDATE public.usuarios SET "${campoHash}" = $1, "${campoVence}" = $2
      WHERE lower(email) = lower($3) AND "emailConfirmado" = $4
      AND ("${campoVence}" IS NULL OR "${campoVence}" <= $5)
      RETURNING id, email`, [hash, vence, email, !confirmacion, new Date(vence.getTime() - 60000)]);
    if (!usuario) return false;
    // El origen es el configurado para Angular; no confiamos en Host ni en un
    // destino enviado por el cliente. El fragmento no llega a los logs HTTP.
    const enlace = new URL(confirmacion ? '/confirmar-email' : '/restablecer-contrasenia', origenFrontend);
    enlace.hash = 'token=' + token;
    const envio = (async () => { try {
      await correo.enviar({ para: usuario.email,
        asunto: confirmacion ? 'Confirmá tu email en PSIQUE' : 'Restablecé tu contraseña de PSIQUE',
        texto: `${confirmacion ? 'Confirmá tu dirección de email para habilitar tu cuenta.' : 'Recibimos una solicitud para restablecer tu contraseña.'}\n\n${enlace.href}\n\nEste enlace se puede usar una sola vez y vence en ${confirmacion ? '24 horas' : '30 minutos'}.\n${confirmacion ? 'Si no creaste esta cuenta, ignorá este correo.' : 'Si no solicitaste este cambio, ignorá este correo. Tu contraseña seguirá siendo la misma.'}`,
      });
      return true;
    } catch {
      // No exponemos errores del proveedor, emails ni enlaces en respuestas/logs.
      console.error('No se pudo enviar un correo de acceso de PSIQUE.');
      try {
        await consultar(`UPDATE public.usuarios SET "${campoHash}" = NULL, "${campoVence}" = NULL
          WHERE id = $1 AND "${campoHash}" = $2`, [usuario.id, hash]);
      } catch { console.error('No se pudo retirar un enlace de correo fallido.'); }
      return false;
    } })();
    envios.add(envio);
    void envio.finally(() => envios.delete(envio));
    // Las solicitudes públicas no esperan al proveedor: su tiempo de respuesta
    // no debe delatar una cuenta por la demora de un envío externo.
    return esperarEnvio ? envio : true;
  }
  function leerEmail(cuerpo: unknown): string {
    const datos = objeto(cuerpo); campos(datos, ['email']);
    if (typeof datos['email'] !== 'string') throw new ErrorApi(400, 'Ingresá un email válido.');
    const email = datos['email'].trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorApi(400, 'Ingresá un email válido.');
    return email;
  }
  function leerToken(valor: unknown): string {
    if (typeof valor !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(valor)) throw new ErrorApi(400, ENLACE_INVALIDO);
    return hashToken(valor);
  }
  function configurarRutas(app: Express) {
    for (const confirmacion of [false, true]) {
      app.post('/api/auth/' + (confirmacion ? 'reenviar-confirmacion' : 'recuperar'), limitarAutenticacion(5, 15 * 60000), async (req, res) => {
        const email = leerEmail(req.body);
        // La misma respuesta para direcciones inexistentes, confirmadas, no
        // confirmadas y limitadas por cuenta: no exponemos un padrón de usuarios.
        await enviarEnlace(email, confirmacion, false);
        res.json({ mensaje: MENSAJE_SOLICITUD });
      });
    }
    app.post('/api/auth/confirmar-email', limitarAutenticacion(15, 15 * 60000), async (req, res) => {
      const datos = objeto(req.body); campos(datos, ['token']);
      const hash = leerToken(datos['token']);
      const resultado = await consultar(`UPDATE public.usuarios SET "emailConfirmado" = true,
        "confirmacionHash" = NULL, "confirmacionVence" = NULL
        WHERE "confirmacionHash" = $1 AND "confirmacionVence" > $2 AND NOT "emailConfirmado"`, [hash, reloj()]);
      if (resultado.rowCount !== 1) throw new ErrorApi(400, ENLACE_INVALIDO);
      res.json({ mensaje: 'Tu email fue confirmado. Ya podés iniciar sesión.' });
    });
    app.post('/api/auth/restablecer', limitarAutenticacion(10, 15 * 60000), async (req, res) => {
      const datos = objeto(req.body); campos(datos, ['token', 'password', 'repetirPassword']);
      const hash = leerToken(datos['token']);
      if (typeof datos['password'] !== 'string' || datos['password'].length < 12 || datos['password'].length > 128) {
        throw new ErrorApi(400, 'La contraseña debe tener entre 12 y 128 caracteres.');
      }
      if (datos['password'] !== datos['repetirPassword']) throw new ErrorApi(400, 'Las contraseñas no coinciden.');
      const passwordHash = await argon2.hash(datos['password'], { type: argon2.argon2id });
      // Una única escritura confirma contraseña, consumo del token y revocación
      // de JWT anteriores. Dos usos concurrentes no pueden confirmar dos cambios.
      const resultado = await consultar(`UPDATE public.usuarios SET "passwordHash" = $1,
        "versionCredenciales" = "versionCredenciales" + 1, "recuperacionHash" = NULL, "recuperacionVence" = NULL
        WHERE "recuperacionHash" = $2 AND "recuperacionVence" > $3 AND "emailConfirmado"`, [passwordHash, hash, reloj()]);
      if (resultado.rowCount !== 1) throw new ErrorApi(400, ENLACE_INVALIDO);
      res.json({ mensaje: 'Tu contraseña fue actualizada. Iniciá sesión con la nueva contraseña.' });
    });
  }
  return { comprobarCorreo, enviarConfirmacion: (email: string) => enviarEnlace(email, true), configurarRutas,
    esperarEnvios: async () => { await Promise.all([...envios]); } };
}
