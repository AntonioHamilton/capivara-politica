import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const dataDir = path.resolve(import.meta.dirname, '..', 'data');
export const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'politicos.db'));

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sigla TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    logo TEXT
  );

  CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cargo TEXT NOT NULL,
    uf TEXT NOT NULL,
    party_id INTEGER REFERENCES parties(id),
    foto TEXT
  );

  CREATE TABLE IF NOT EXISTS research (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    entidade_id INTEGER NOT NULL,
    criado_em TEXT NOT NULL,
    ativa INTEGER NOT NULL DEFAULT 0,
    dados TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quiz (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dados TEXT NOT NULL
  );
`);

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
