import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cargarDatosIniciales } from './seed.ts';

export function abrirBaseDeDatos(ruta: string): Database.Database {
  mkdirSync(dirname(ruta), { recursive: true });
  const db = new Database(ruta);

  try {
    // Las claves foráneas mantienen las relaciones entre pacientes, días y turnos.
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS pacientes (
        codigo TEXT PRIMARY KEY NOT NULL,
        modalidad TEXT NOT NULL CHECK (modalidad IN ('Presencial', 'Virtual')),
        estado TEXT NOT NULL,
        proximaSesion TEXT,
        frecuencia TEXT NOT NULL,
        diaHabitual TEXT,
        horarioHabitual TEXT,
        fechaCreacion TEXT NOT NULL,
        fechaInicioTratamiento TEXT NOT NULL,
        motivoConsulta TEXT NOT NULL,
        postIt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS semana_agenda (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        titulo TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dias_agenda (
        fecha TEXT PRIMARY KEY NOT NULL,
        nombre TEXT NOT NULL,
        semanaId INTEGER NOT NULL REFERENCES semana_agenda(id)
      );

      CREATE TABLE IF NOT EXISTS turnos (
        fecha TEXT NOT NULL REFERENCES dias_agenda(fecha),
        horario TEXT NOT NULL,
        codigoPaciente TEXT REFERENCES pacientes(codigo),
        modalidad TEXT CHECK (modalidad IN ('Presencial', 'Virtual')),
        estado TEXT NOT NULL CHECK (estado IN ('Programado', 'Disponible', 'Liberado')),
        PRIMARY KEY (fecha, horario),
        CHECK (
          (estado = 'Programado' AND codigoPaciente IS NOT NULL AND modalidad IS NOT NULL)
          OR (estado IN ('Disponible', 'Liberado') AND codigoPaciente IS NULL AND modalidad IS NULL)
        )
      );

      CREATE TABLE IF NOT EXISTS dashboard (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        pacientesActivos INTEGER NOT NULL,
        sesionesSemana INTEGER NOT NULL,
        pendientesCobro INTEGER NOT NULL,
        horariosDisponibles INTEGER NOT NULL
      );
    `);

    cargarDatosIniciales(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
