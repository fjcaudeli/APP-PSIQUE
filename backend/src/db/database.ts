import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function abrirBaseDeDatos(ruta: string): Database.Database {
  mkdirSync(dirname(ruta), { recursive: true });
  const db = new Database(ruta);

  try {
    // Las claves foráneas mantienen las relaciones entre pacientes, días y turnos.
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
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

    migrarBaseDeDatos(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

// La versión 1 agrega sesiones a las bases anteriores conservando cada turno,
// su fecha y paciente. Los honorarios desconocidos permanecen en cero.
// Una instalación nueva comienza vacía; los ejemplos ya no se cargan al iniciar.
export function migrarBaseDeDatos(db: Database.Database): void {
  db.transaction(() => {
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version >= 1) return;
    db.exec(`
      CREATE TABLE sesiones (
        id INTEGER PRIMARY KEY,
        fecha TEXT NOT NULL,
        horario TEXT NOT NULL,
        codigoPaciente TEXT NOT NULL REFERENCES pacientes(codigo),
        modalidad TEXT NOT NULL CHECK (modalidad IN ('Presencial', 'Virtual')),
        estado TEXT NOT NULL DEFAULT 'Programada' CHECK (estado IN ('Programada', 'Realizada')),
        importeCentavos INTEGER NOT NULL DEFAULT 0 CHECK (
          typeof(importeCentavos) = 'integer' AND importeCentavos BETWEEN 0 AND 999999999
        ),
        pagadoCentavos INTEGER NOT NULL DEFAULT 0 CHECK (
          typeof(pagadoCentavos) = 'integer' AND pagadoCentavos BETWEEN 0 AND importeCentavos
        ),
        UNIQUE (fecha, horario),
        FOREIGN KEY (fecha, horario) REFERENCES turnos(fecha, horario)
      );
      INSERT INTO sesiones (fecha, horario, codigoPaciente, modalidad)
        SELECT fecha, horario, codigoPaciente, modalidad FROM turnos
        WHERE estado = 'Programado' ORDER BY fecha, horario;
      CREATE INDEX sesiones_paciente ON sesiones(codigoPaciente);
      PRAGMA user_version = 1;
    `);
  }).immediate();
}
