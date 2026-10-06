import { abrirBaseDeDatos, migrarBaseDeDatos } from '../dist/db/database.js';
import { cargarDatosIniciales, SEMANA_INICIAL } from '../dist/db/seed.js';

// Los ejemplos del prototipo se cargan de manera explícita solo en bases temporales.
// Quitar la tabla nueva reproduce una base anterior y permite ejercitar su migración.
export function abrirFixtureLegacy(ruta) {
  const db = abrirBaseDeDatos(ruta);
  cargarDatosIniciales(db);
  db.exec('DROP TABLE sesiones; PRAGMA user_version = 0;');
  migrarBaseDeDatos(db);
  return db;
}

export const RELOJ_LEGACY = () => new Date('2026-09-07T10:00:00Z');
export const DASHBOARD_LEGACY = { pacientesActivos: 3, sesionesSemana: 0, pendientesCobro: 0, horariosDisponibles: 12 };
let id = 0;
export const AGENDA_LEGACY = {
  titulo: '7 de septiembre de 2026 al 13 de septiembre de 2026',
  dias: SEMANA_INICIAL.dias.map(dia => ({
    ...dia, turnos: dia.turnos.map(turno => ({ ...turno, sesionId: turno.estado === 'Programado' ? ++id : null })),
  })),
};
