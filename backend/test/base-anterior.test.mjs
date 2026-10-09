import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { abrirBaseDeDatos } from '../dist/db/database.js';

function archivoTemporal(t) {
  const carpeta = mkdtempSync(join(tmpdir(), 'psique-conservar-base-'));
  t.after(() => {
    for (const nombre of readdirSync(carpeta)) unlinkSync(join(carpeta, nombre));
    rmdirSync(carpeta);
  });
  return join(carpeta, 'prueba.sqlite');
}

const hashArchivo = ruta => createHash('sha256').update(readFileSync(ruta)).digest('hex');
function contenido(ruta) {
  const db = new Database(ruta, { readonly: true });
  try {
    const esquema = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    return {
      version: db.pragma('user_version', { simple: true }),
      esquema,
      pacientes: db.prepare('SELECT * FROM pacientes ORDER BY codigo').all(),
      turnos: db.prepare('SELECT * FROM turnos ORDER BY fecha, horario').all(),
    };
  } finally { db.close(); }
}

// Abrir por error el archivo antiguo debe fallar antes de crear tablas, migrar
// o asignar sus datos. También se protege una versión futura no reconocida.
for (const version of [0, 1, 3]) {
  test(`rechaza la base con versión ${version} conservando esquema, filas y bytes`, t => {
    const ruta = archivoTemporal(t);
    const anterior = new Database(ruta);
    anterior.exec(`
      CREATE TABLE pacientes (codigo TEXT PRIMARY KEY, postIt TEXT NOT NULL);
      CREATE TABLE turnos (fecha TEXT, horario TEXT, codigoPaciente TEXT REFERENCES pacientes(codigo));
      INSERT INTO pacientes VALUES ('ANTERIOR', 'Nota ficticia que debe conservarse.');
      INSERT INTO turnos VALUES ('2026-10-05', '10:00', 'ANTERIOR');
      PRAGMA user_version = ${version};
    `);
    anterior.close();
    const estadoAntes = contenido(ruta);
    const hashAntes = hashArchivo(ruta);

    assert.throws(() => abrirBaseDeDatos(ruta), /base anterior se conserva sin cambios.*DB_PATH/);

    assert.deepEqual(contenido(ruta), estadoAntes);
    assert.equal(hashArchivo(ruta), hashAntes, 'Ni siquiera los bytes del archivo se modificaron.');
  });
}

test('una base profesional nueva comienza vacía y reabrirla no carga ejemplos', t => {
  const ruta = archivoTemporal(t);
  for (let apertura = 0; apertura < 2; apertura += 1) {
    const db = abrirBaseDeDatos(ruta);
    try {
      assert.equal(db.pragma('user_version', { simple: true }), 2);
      const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
      assert.deepEqual(tablas.map(tabla => tabla.name), ['pacientes', 'sesiones', 'turnos', 'usuarios']);
      for (const tabla of ['usuarios', 'pacientes', 'turnos', 'sesiones']) {
        assert.equal(db.prepare(`SELECT count(*) cantidad FROM ${tabla}`).get().cantidad, 0);
      }
      assert.deepEqual(db.pragma('foreign_key_check'), []);
    } finally { db.close(); }
  }
});
