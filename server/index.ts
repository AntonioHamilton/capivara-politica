import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, dataDir, uploadsDir, transaction } from './db.ts';

const PORT = Number(process.env.PORT ?? 4310);
const CARGOS = ['presidente', 'governador', 'senador', 'deputado_federal', 'deputado_estadual'];
const EMPTY_QUIZ = { respostas: {}, eticaEliminatoria: null };

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function texto(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${campo} é obrigatório`);
  return v.trim();
}

function opcional(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function idParam(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'id inválido');
  return id;
}

function lerCandidato(body: Record<string, unknown>) {
  const cargo = texto(body.cargo, 'Cargo');
  if (!CARGOS.includes(cargo)) throw new HttpError(400, 'Cargo inválido');
  const uf = cargo === 'presidente' ? 'BR' : texto(body.uf, 'Estado').toUpperCase();
  const partyId = body.partyId == null ? null : Number(body.partyId);
  return { nome: texto(body.nome, 'Nome'), cargo, uf, partyId, foto: opcional(body.foto) };
}

function salvarImagem(dataUrl: string): string {
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Imagem inválida');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const nome = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(uploadsDir, nome), Buffer.from(m[2], 'base64'));
  return `/uploads/${nome}`;
}

function listarTudo() {
  const parties = db.prepare('SELECT id, sigla, nome, logo FROM parties ORDER BY sigla').all();
  const candidates = db
    .prepare('SELECT id, nome, cargo, uf, party_id AS partyId, foto FROM candidates ORDER BY nome')
    .all();
  const research = (
    db
      .prepare('SELECT id, tipo, entidade_id AS entidadeId, criado_em AS criadoEm, ativa, dados FROM research ORDER BY id DESC')
      .all() as { ativa: number; dados: string }[]
  ).map((r) => ({ ...r, ativa: r.ativa === 1, dados: JSON.parse(r.dados) }));
  const q = db.prepare('SELECT dados FROM quiz WHERE id = 1').get() as { dados: string } | undefined;
  return { parties, candidates, research, quiz: q ? JSON.parse(q.dados) : EMPTY_QUIZ };
}

function arquivosUsados(parties: Record<string, unknown>[], candidates: Record<string, unknown>[]) {
  const urls = [...parties.map((p) => p.logo), ...candidates.map((c) => c.foto)];
  const out: Record<string, string> = {};
  for (const u of urls) {
    if (typeof u !== 'string' || !u.startsWith('/uploads/')) continue;
    const arq = path.join(uploadsDir, path.basename(u));
    if (!fs.existsSync(arq)) continue;
    const ext = path.extname(arq).slice(1);
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    out[u] = `data:image/${mime};base64,${fs.readFileSync(arq).toString('base64')}`;
  }
  return out;
}

const api = express.Router();

api.get('/data', (_req, res) => {
  res.json(listarTudo());
});

api.post('/upload', (req, res) => {
  res.json({ url: salvarImagem(String(req.body.dataUrl ?? '')) });
});

api.post('/parties', (req, res) => {
  const sigla = texto(req.body.sigla, 'Sigla').toUpperCase();
  const nome = texto(req.body.nome, 'Nome');
  try {
    const r = db
      .prepare('INSERT INTO parties (sigla, nome, logo) VALUES (?, ?, ?)')
      .run(sigla, nome, opcional(req.body.logo));
    res.json({ id: Number(r.lastInsertRowid) });
  } catch {
    throw new HttpError(409, `Já existe um partido com a sigla ${sigla}`);
  }
});

api.put('/parties/:id', (req, res) => {
  const sigla = texto(req.body.sigla, 'Sigla').toUpperCase();
  try {
    db.prepare('UPDATE parties SET sigla = ?, nome = ?, logo = ? WHERE id = ?').run(
      sigla,
      texto(req.body.nome, 'Nome'),
      opcional(req.body.logo),
      idParam(req),
    );
  } catch {
    throw new HttpError(409, `Já existe um partido com a sigla ${sigla}`);
  }
  res.json({ ok: true });
});

api.delete('/parties/:id', (req, res) => {
  const id = idParam(req);
  const uso = db.prepare('SELECT COUNT(*) AS n FROM candidates WHERE party_id = ?').get(id) as { n: number };
  if (uso.n > 0) throw new HttpError(409, 'Há candidatos usando este partido. Remova ou troque o partido deles antes.');
  transaction(() => {
    db.prepare("DELETE FROM research WHERE tipo = 'partido' AND entidade_id = ?").run(id);
    db.prepare('DELETE FROM parties WHERE id = ?').run(id);
  });
  res.json({ ok: true });
});

api.post('/candidates', (req, res) => {
  const c = lerCandidato(req.body);
  const r = db
    .prepare('INSERT INTO candidates (nome, cargo, uf, party_id, foto) VALUES (?, ?, ?, ?, ?)')
    .run(c.nome, c.cargo, c.uf, c.partyId, c.foto);
  res.json({ id: Number(r.lastInsertRowid) });
});

api.put('/candidates/:id', (req, res) => {
  const c = lerCandidato(req.body);
  db.prepare('UPDATE candidates SET nome = ?, cargo = ?, uf = ?, party_id = ?, foto = ? WHERE id = ?').run(
    c.nome,
    c.cargo,
    c.uf,
    c.partyId,
    c.foto,
    idParam(req),
  );
  res.json({ ok: true });
});

api.delete('/candidates/:id', (req, res) => {
  const id = idParam(req);
  transaction(() => {
    db.prepare("DELETE FROM research WHERE tipo = 'candidato' AND entidade_id = ?").run(id);
    db.prepare('DELETE FROM candidates WHERE id = ?').run(id);
  });
  res.json({ ok: true });
});

api.post('/research', (req, res) => {
  const tipo = req.body.tipo;
  const entidadeId = Number(req.body.entidadeId);
  if (tipo !== 'candidato' && tipo !== 'partido') throw new HttpError(400, 'Tipo inválido');
  if (!Number.isInteger(entidadeId) || typeof req.body.dados !== 'object' || req.body.dados === null) {
    throw new HttpError(400, 'Pesquisa inválida');
  }
  const id = transaction(() => {
    db.prepare('UPDATE research SET ativa = 0 WHERE tipo = ? AND entidade_id = ?').run(tipo, entidadeId);
    const r = db
      .prepare('INSERT INTO research (tipo, entidade_id, criado_em, ativa, dados) VALUES (?, ?, ?, 1, ?)')
      .run(tipo, entidadeId, new Date().toISOString(), JSON.stringify(req.body.dados));
    return Number(r.lastInsertRowid);
  });
  res.json({ id });
});

api.post('/research/:id/activate', (req, res) => {
  const id = idParam(req);
  const r = db.prepare('SELECT tipo, entidade_id AS entidadeId FROM research WHERE id = ?').get(id) as
    | { tipo: string; entidadeId: number }
    | undefined;
  if (!r) throw new HttpError(404, 'Versão não encontrada');
  transaction(() => {
    db.prepare('UPDATE research SET ativa = 0 WHERE tipo = ? AND entidade_id = ?').run(r.tipo, r.entidadeId);
    db.prepare('UPDATE research SET ativa = 1 WHERE id = ?').run(id);
  });
  res.json({ ok: true });
});

api.delete('/research/:id', (req, res) => {
  const id = idParam(req);
  const r = db.prepare('SELECT tipo, entidade_id AS entidadeId, ativa FROM research WHERE id = ?').get(id) as
    | { tipo: string; entidadeId: number; ativa: number }
    | undefined;
  if (!r) throw new HttpError(404, 'Versão não encontrada');
  transaction(() => {
    db.prepare('DELETE FROM research WHERE id = ?').run(id);
    if (r.ativa === 1) {
      db.prepare(
        `UPDATE research SET ativa = 1 WHERE id = (
           SELECT MAX(id) FROM research WHERE tipo = ? AND entidade_id = ?
         )`,
      ).run(r.tipo, r.entidadeId);
    }
  });
  res.json({ ok: true });
});

api.put('/quiz', (req, res) => {
  db.prepare('INSERT INTO quiz (id, dados) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET dados = excluded.dados').run(
    JSON.stringify({
      respostas: req.body.respostas ?? {},
      eticaEliminatoria: req.body.eticaEliminatoria ?? null,
    }),
  );
  res.json({ ok: true });
});

api.get('/export', (_req, res) => {
  const tudo = listarTudo();
  res.setHeader('Content-Disposition', `attachment; filename="capivara-politica-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ versao: 1, ...tudo, uploads: arquivosUsados(tudo.parties, tudo.candidates) });
});

api.post('/import', (req, res) => {
  const b = req.body;
  if (b?.versao !== 1 || !Array.isArray(b.parties) || !Array.isArray(b.candidates) || !Array.isArray(b.research)) {
    throw new HttpError(400, 'Arquivo de backup inválido');
  }
  const mapa: Record<string, string> = {};
  for (const [url, dataUrl] of Object.entries((b.uploads ?? {}) as Record<string, string>)) {
    mapa[url] = salvarImagem(dataUrl);
  }
  const remap = (u: string | null) => (u && mapa[u] ? mapa[u] : u);
  transaction(() => {
    db.exec('DELETE FROM research; DELETE FROM candidates; DELETE FROM parties; DELETE FROM quiz;');
    for (const p of b.parties) {
      db.prepare('INSERT INTO parties (id, sigla, nome, logo) VALUES (?, ?, ?, ?)').run(p.id, p.sigla, p.nome, remap(p.logo));
    }
    for (const c of b.candidates) {
      db.prepare('INSERT INTO candidates (id, nome, cargo, uf, party_id, foto) VALUES (?, ?, ?, ?, ?, ?)').run(
        c.id,
        c.nome,
        c.cargo,
        c.uf,
        c.partyId,
        remap(c.foto),
      );
    }
    for (const r of b.research) {
      db.prepare('INSERT INTO research (id, tipo, entidade_id, criado_em, ativa, dados) VALUES (?, ?, ?, ?, ?, ?)').run(
        r.id,
        r.tipo,
        r.entidadeId,
        r.criadoEm,
        r.ativa ? 1 : 0,
        JSON.stringify(r.dados),
      );
    }
    db.prepare('INSERT INTO quiz (id, dados) VALUES (1, ?)').run(JSON.stringify(b.quiz ?? EMPTY_QUIZ));
  });
  res.json({ ok: true });
});

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/api', api);
app.use('/api', (_req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
});
app.use('/api', (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ erro: status === 500 ? 'Erro interno' : err.message });
});

const vite = await createViteServer({
  root: path.resolve(import.meta.dirname, '..'),
  server: { middlewareMode: true },
  appType: 'spa',
});
app.use(vite.middlewares);

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Capivara Política rodando em ${url}  (dados em ${dataDir})`);
  if (process.platform === 'win32' && !process.env.NO_OPEN) exec(`start "" ${url}`);
});
