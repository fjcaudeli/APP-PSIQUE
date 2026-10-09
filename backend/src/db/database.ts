import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function abrirBaseDeDatos(ruta: string): Database.Database {
  mkdirSync(dirname(ruta), { recursive: true });
  const db = new Database(ruta);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    prepararBaseDeDatos(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// La etapa de profesionales comienza en otro archivo, por decisión del usuario.
// Nunca se adjudican los registros anteriores al primero que se registre.
export function prepararBaseDeDatos(db: Database.Database): void {
  db.transaction(() => {
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version === 2) return;
    const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
    if (version !== 0 || tablas.length > 0) {
      throw new Error('La base anterior se conserva sin cambios. Configurá DB_PATH con un archivo nuevo para las cuentas profesionales.');
    }

    // Incluir usuarioId en las claves y relaciones impide enlazar una sesión
    // con un paciente u horario perteneciente a otro profesional, incluso por SQL.
    db.exec(`
      CREATE TABLE usuarios (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        passwordHash TEXT NOT NULL,
        fechaCreacion TEXT NOT NULL
      );
      CREATE TABLE pacientes (
        usuarioId INTEGER NOT NULL REFERENCES usuarios(id),
        codigo TEXT NOT NULL,
        modalidad TEXT NOT NULL CHECK (modalidad IN ('Presencial', 'Virtual')),
        estado TEXT NOT NULL,
        proximaSesion TEXT,
        frecuencia TEXT NOT NULL,
        diaHabitual TEXT,
        horarioHabitual TEXT,
        fechaCreacion TEXT NOT NULL,
        fechaInicioTratamiento TEXT NOT NULL,
        motivoConsulta TEXT NOT NULL,
        postIt TEXT NOT NULL,
        PRIMARY KEY (usuarioId, codigo),
        UNIQUE (usuarioId, codigo COLLATE NOCASE)
      );
      CREATE TABLE turnos (
        usuarioId INTEGER NOT NULL REFERENCES usuarios(id),
        fecha TEXT NOT NULL,
        horario TEXT NOT NULL,
        codigoPaciente TEXT,
        modalidad TEXT CHECK (modalidad IN ('Presencial', 'Virtual')),
        estado TEXT NOT NULL CHECK (estado IN ('Programado', 'Disponible', 'Liberado')),
        PRIMARY KEY (usuarioId, fecha, horario),
        FOREIGN KEY (usuarioId, codigoPaciente) REFERENCES pacientes(usuarioId, codigo),
        CHECK (
          (estado = 'Programado' AND codigoPaciente IS NOT NULL AND modalidad IS NOT NULL)
          OR (estado IN ('Disponible', 'Liberado') AND codigoPaciente IS NULL AND modalidad IS NULL)
        )
      );
      CREATE TABLE sesiones (
        id INTEGER PRIMARY KEY,
        usuarioId INTEGER NOT NULL REFERENCES usuarios(id),
        fecha TEXT NOT NULL,
        horario TEXT NOT NULL,
        codigoPaciente TEXT NOT NULL,
        modalidad TEXT NOT NULL CHECK (modalidad IN ('Presencial', 'Virtual')),
        estado TEXT NOT NULL DEFAULT 'Programada' CHECK (estado IN ('Programada', 'Realizada')),
        importeCentavos INTEGER NOT NULL DEFAULT 0 CHECK (
          typeof(importeCentavos) = 'integer' AND importeCentavos BETWEEN 0 AND 999999999
        ),
        pagadoCentavos INTEGER NOT NULL DEFAULT 0 CHECK (
          typeof(pagadoCentavos) = 'integer' AND pagadoCentavos BETWEEN 0 AND importeCentavos
        ),
        UNIQUE (usuarioId, fecha, horario),
        FOREIGN KEY (usuarioId, codigoPaciente) REFERENCES pacientes(usuarioId, codigo),
        FOREIGN KEY (usuarioId, fecha, horario) REFERENCES turnos(usuarioId, fecha, horario)
      );
      CREATE INDEX sesiones_paciente ON sesiones(usuarioId, codigoPaciente);
      PRAGMA user_version = 2;
    `);
  }).immediate();
}
