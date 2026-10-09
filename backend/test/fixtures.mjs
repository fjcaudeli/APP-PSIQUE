import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { abrirBaseDeDatos } from '../dist/db/database.js';
import { cargarDatosIniciales, SEMANA_INICIAL } from '../dist/db/seed.js';

// Clave efímera exclusiva de este proceso de pruebas, sin secretos en el repo.
export const SECRETO_PRUEBA = randomBytes(48).toString('hex');
export function crearUsuarioFixture(db, id = 1) {
  db.prepare('INSERT INTO usuarios (id, email, passwordHash, fechaCreacion) VALUES (?, ?, ?, ?)')
    .run(id, `profesional-${id}@example.test`, 'fixture-sin-login', '2026-09-01T00:00:00.000Z');
  return id;
}

// Solo las pruebas llaman a este cargador; una base abierta normalmente está vacía.
export function abrirFixtureProfesional(ruta) {
  const db = abrirBaseDeDatos(ruta);
  const usuarioId = crearUsuarioFixture(db);
  cargarDatosIniciales(db, usuarioId);
  return db;
}

// Las pruebas de negocio atraviesan el mismo middleware que las solicitudes reales.
// Se firma con el reloj de cada prueba para que avanzar días no cierre su sesión.
export function fetchAutenticado(reloj, usuarioId = 1) {
  return async (url, opciones = {}) => {
    const iat = Math.floor(reloj().getTime() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(String(usuarioId))
      .setIssuer('psique').setAudience('psique-app').setIssuedAt(iat).setExpirationTime(iat + 3600)
      .sign(new TextEncoder().encode(SECRETO_PRUEBA));
    return fetch(url, { ...opciones, headers: { ...opciones.headers, Authorization: `Bearer ${token}` } });
  };
}

export const RELOJ_FIXTURE = () => new Date('2026-09-07T10:00:00Z');
export const DASHBOARD_FIXTURE = { pacientesActivos: 3, sesionesSemana: 0, pendientesCobro: 0, horariosDisponibles: 12 };
let id = 0;
export const AGENDA_FIXTURE = {
  titulo: '7 de septiembre de 2026 al 13 de septiembre de 2026',
  dias: SEMANA_INICIAL.dias.map(dia => ({
    ...dia, turnos: dia.turnos.map(turno => ({ ...turno, sesionId: turno.estado === 'Programado' ? ++id : null })),
  })),
};
