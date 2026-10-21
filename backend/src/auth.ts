import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type Database from 'better-sqlite3';
import type { Express } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { limitarAutenticacion } from './seguridad-http.ts';

const DURACION_TOKEN_SEGUNDOS = 60 * 60;
const EMISOR = 'psique';
const DESTINATARIO = 'psique-app';
const CREDENCIALES_INCORRECTAS = 'El email o la contraseña son incorrectos.';

export interface UsuarioPublico {
  id: number;
  email: string;
  fechaCreacion: string;
}

export interface UsuarioAutenticable extends UsuarioPublico {
  passwordHash: string;
}

// Solo estas tres consultas cambian de motor; validaciones, hashing y JWT se comparten.
export interface AlmacenUsuarios {
  buscarPorEmail(email: string): UsuarioAutenticable | undefined | Promise<UsuarioAutenticable | undefined>;
  crearUsuario(email: string, passwordHash: string, fechaCreacion: string): UsuarioPublico | Promise<UsuarioPublico>;
  existeUsuario(id: number): boolean | Promise<boolean>;
  esEmailDuplicado(error: unknown): boolean;
}

interface Credenciales {
  email: string;
  password: string;
}

// El servidor debe fallar antes de abrir la base si no recibió un secreto propio.
// La longitud es una comprobación mínima; el README explica cómo generarlo al azar.
export function validarSecretoJwt(valor: string | undefined): string {
  if (!valor || Buffer.byteLength(valor, 'utf8') < 32 || !valor.trim()) {
    throw new Error('Configurá JWT_SECRET con un secreto aleatorio de al menos 32 bytes antes de iniciar la API.');
  }
  return valor;
}

function validarCredenciales(cuerpo: unknown, registro: boolean): Credenciales | { mensaje: string } {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    return { mensaje: 'Enviá un objeto JSON con los datos de acceso.' };
  }
  const datos = cuerpo as Record<string, unknown>;
  const requeridos = registro ? ['email', 'password', 'repetirPassword'] : ['email', 'password'];
  if (!requeridos.every(campo => Object.hasOwn(datos, campo))
      || Object.keys(datos).some(campo => !requeridos.includes(campo))) {
    return { mensaje: 'Revisá los campos enviados: hay datos faltantes o desconocidos.' };
  }
  if (typeof datos['email'] !== 'string') return { mensaje: 'Ingresá un email válido.' };
  const email = datos['email'].trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { mensaje: 'Ingresá un email válido.' };
  }
  if (typeof datos['password'] !== 'string' || datos['password'].length < (registro ? 12 : 1)
      || datos['password'].length > 128) {
    return { mensaje: registro
      ? 'La contraseña debe tener entre 12 y 128 caracteres.'
      : 'Ingresá tu contraseña (hasta 128 caracteres).' };
  }
  if (registro && datos['repetirPassword'] !== datos['password']) {
    return { mensaje: 'Las contraseñas no coinciden.' };
  }
  // La contraseña no se recorta ni se normaliza: se verifica exactamente lo escrito.
  return { email, password: datos['password'] };
}

export function configurarAutenticacion(
  app: Express,
  db: Database.Database,
  secretoJwt: string,
  reloj: () => Date,
): void {
  // Adaptador SQLite histórico, conservado para sus pruebas y referencias.
  configurarAutenticacionConAlmacen(app, {
    buscarPorEmail: email => db.prepare('SELECT id, email, passwordHash, fechaCreacion FROM usuarios WHERE email = ? COLLATE NOCASE')
      .get(email) as UsuarioAutenticable | undefined,
    crearUsuario: (email, passwordHash, fechaCreacion) => {
      const resultado = db.prepare('INSERT INTO usuarios (email, passwordHash, fechaCreacion) VALUES (?, ?, ?)')
        .run(email, passwordHash, fechaCreacion);
      return { id: Number(resultado.lastInsertRowid), email, fechaCreacion };
    },
    existeUsuario: id => Boolean(db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id)),
    esEmailDuplicado: error => error instanceof Error && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE',
  }, secretoJwt, reloj);
}

export function configurarAutenticacionConAlmacen(
  app: Express,
  usuarios: AlmacenUsuarios,
  secretoJwt: string,
  reloj: () => Date,
): void {
  const clave = new TextEncoder().encode(validarSecretoJwt(secretoJwt));
  let hashParaUsuarioInexistente: Promise<string> | undefined;

  app.post('/api/auth/registro', limitarAutenticacion(10, 60 * 60 * 1000), async (req, res) => {
    const datos = validarCredenciales(req.body, true);
    if ('mensaje' in datos) {
      res.status(400).json(datos);
      return;
    }
    if (await usuarios.buscarPorEmail(datos.email)) {
      res.status(409).json({ mensaje: 'Ya existe una cuenta con ese email.' });
      return;
    }
    // Argon2id incorpora una sal aleatoria y sus parámetros al resultado codificado.
    // Se persiste solamente ese hash; nunca la contraseña ni su repetición.
    const passwordHash = await argon2.hash(datos.password, { type: argon2.argon2id });
    const fechaCreacion = reloj().toISOString();
    try {
      const usuario = await usuarios.crearUsuario(datos.email, passwordHash, fechaCreacion);
      res.status(201).json({ usuario });
    } catch (error) {
      // La restricción UNIQUE también cubre dos registros simultáneos del mismo email.
      if (usuarios.esEmailDuplicado(error)) {
        res.status(409).json({ mensaje: 'Ya existe una cuenta con ese email.' });
        return;
      }
      throw error;
    }
  });

  app.post('/api/auth/login', limitarAutenticacion(30, 15 * 60 * 1000), async (req, res) => {
    const datos = validarCredenciales(req.body, false);
    if ('mensaje' in datos) {
      res.status(400).json(datos);
      return;
    }
    const almacenado = await usuarios.buscarPorEmail(datos.email);
    // Para cuentas inexistentes también verificamos un hash, sin revelar por el
    // mensaje si falló el email o la contraseña. El hash auxiliar vive solo en memoria.
    if (!almacenado) {
      hashParaUsuarioInexistente ??= argon2.hash(randomBytes(32).toString('base64'), { type: argon2.argon2id });
    }
    const coincide = await argon2.verify(almacenado?.passwordHash ?? await hashParaUsuarioInexistente!, datos.password);
    if (!almacenado || !coincide) {
      res.status(401).json({ mensaje: CREDENCIALES_INCORRECTAS });
      return;
    }
    const emitido = Math.floor(reloj().getTime() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(String(almacenado.id))
      .setIssuer(EMISOR)
      .setAudience(DESTINATARIO)
      .setIssuedAt(emitido)
      .setExpirationTime(emitido + DURACION_TOKEN_SEGUNDOS)
      .sign(clave);
    const usuario: UsuarioPublico = { id: almacenado.id, email: almacenado.email, fechaCreacion: almacenado.fechaCreacion };
    res.json({ token, usuario, expiraEn: DURACION_TOKEN_SEGUNDOS });
  });

  // Todo endpoint de /api declarado después exige un token firmado, vigente y
  // de un usuario existente. No se acepta una identidad enviada en URL o cuerpo.
  app.use('/api', async (req, res, next) => {
    const encabezado = req.get('Authorization');
    const token = encabezado?.match(/^Bearer ([^\s]+)$/i)?.[1];
    let usuarioId: number;
    try {
      if (!token) throw new Error('Sin token');
      const { payload } = await jwtVerify(token, clave, {
        algorithms: ['HS256'], issuer: EMISOR, audience: DESTINATARIO,
        requiredClaims: ['sub', 'iat', 'exp'], maxTokenAge: DURACION_TOKEN_SEGUNDOS,
        currentDate: reloj(),
      });
      if (!payload.sub || !/^[1-9]\d*$/.test(payload.sub)) throw new Error('Identidad inválida');
      usuarioId = Number(payload.sub);
      if (!Number.isSafeInteger(usuarioId)) throw new Error('Identidad inválida');
    } catch {
      res.status(401).json({ mensaje: 'Iniciá sesión para acceder a PSIQUE.' });
      return;
    }
    // La consulta queda fuera del catch de JWT: una caída de la base no es un token inválido.
    if (!await usuarios.existeUsuario(usuarioId)) {
      res.status(401).json({ mensaje: 'Iniciá sesión para acceder a PSIQUE.' });
      return;
    }
    res.locals['usuarioId'] = usuarioId;
    next();
  });
}
