import { createClient, type InArgs } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';

export const dataDir = path.resolve(import.meta.dirname, '..', 'data');

const url = process.env.TURSO_DATABASE_URL || `file:${path.join(dataDir, 'politicos.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

// Sem Turso configurado, usa um arquivo sqlite local (só faz sentido em dev).
if (!process.env.TURSO_DATABASE_URL) fs.mkdirSync(dataDir, { recursive: true });

export const db = createClient({ url, authToken });

export async function get<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  const r = await db.execute({ sql, args });
  return r.rows[0] as unknown as T | undefined;
}

export async function all<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const r = await db.execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function run(sql: string, args: InArgs = []): Promise<{ lastInsertRowid: bigint; changes: number }> {
  const r = await db.execute({ sql, args });
  return { lastInsertRowid: r.lastInsertRowid ?? 0n, changes: r.rowsAffected };
}

interface Executor {
  get<T>(sql: string, args?: InArgs): Promise<T | undefined>;
  all<T>(sql: string, args?: InArgs): Promise<T[]>;
  run(sql: string, args?: InArgs): Promise<{ lastInsertRowid: bigint; changes: number }>;
}

export async function transaction<T>(fn: (t: Executor) => Promise<T>): Promise<T> {
  const tx = await db.transaction('write');
  const t: Executor = {
    get: async (sql, args = []) => (await tx.execute({ sql, args })).rows[0] as never,
    all: async (sql, args = []) => (await tx.execute({ sql, args })).rows as never,
    run: async (sql, args = []) => {
      const r = await tx.execute({ sql, args });
      return { lastInsertRowid: r.lastInsertRowid ?? 0n, changes: r.rowsAffected };
    },
  };
  try {
    const result = await fn(t);
    await tx.commit();
    return result;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

await db.executeMultiple(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expira_em TEXT NOT NULL,
    usado INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL
  );

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

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mensagem TEXT NOT NULL,
    criado_em TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS colinhas (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    itens TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
`);

// Bancos criados antes do campo de email existir não têm a coluna.
const colunasUsers = await all<{ name: string }>("SELECT name FROM pragma_table_info('users')");
if (!colunasUsers.some((c) => c.name === 'email')) {
  await db.executeMultiple('ALTER TABLE users ADD COLUMN email TEXT; CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email);');
}

// O quiz era um único registro global (id fixo = 1). Agora cada usuário tem o seu.
// Se o banco antigo existir, guarda esse registro para herdar no primeiro cadastro (que vira admin).
export let quizLegado: string | null = null;

async function prepararTabelaQuiz() {
  const colunas = await all<{ name: string }>("SELECT name FROM pragma_table_info('quiz')");
  const esquemaAntigo = colunas.length > 0 && !colunas.some((c) => c.name === 'user_id');
  if (esquemaAntigo) {
    const antigo = await get<{ dados: string }>('SELECT dados FROM quiz WHERE id = 1');
    quizLegado = antigo?.dados ?? null;
    await db.execute('DROP TABLE quiz');
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS quiz (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      dados TEXT NOT NULL
    )
  `);
}
await prepararTabelaQuiz();
