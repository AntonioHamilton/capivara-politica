import './env.ts';
import express from 'express';
import type { Request } from 'express';
import { createServer as createViteServer } from 'vite';
import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { get, all, run, dataDir, quizLegado, uploadsDir, transaction } from './db.ts';
import {
  HttpError,
  conferirSenha,
  consumirTokenReset,
  criarSessao,
  criarTokenReset,
  encerrarSessao,
  erroFinal,
  exigirAdmin,
  exigirLogin,
  hashSenha,
  lerSessao,
  tokenAtual,
  usuario,
  validarTokenReset,
} from './auth.ts';
import { emailRecuperacaoHtml, enviarEmail } from './email.ts';

const PORT = Number(process.env.PORT ?? 4310);
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const CARGOS = ['presidente', 'governador', 'senador', 'deputado_federal', 'deputado_estadual'];
const EMPTY_QUIZ = { respostas: {}, eticaEliminatoria: null };
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${campo} é obrigatório`);
  return v.trim();
}

function opcional(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function lerEmail(v: unknown): string {
  const email = texto(v, 'Email').toLowerCase();
  if (!EMAIL_REGEX.test(email)) throw new HttpError(400, 'Email inválido');
  return email;
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

async function listarTudo(userId: number) {
  const parties = await all<Record<string, unknown>>('SELECT id, sigla, nome, logo FROM parties ORDER BY sigla');
  const candidates = await all<Record<string, unknown>>('SELECT id, nome, cargo, uf, party_id AS partyId, foto FROM candidates ORDER BY nome');
  const research = (
    await all<{ ativa: number; dados: string }>(
      'SELECT id, tipo, entidade_id AS entidadeId, criado_em AS criadoEm, ativa, dados FROM research ORDER BY id DESC',
    )
  ).map((r) => ({ ...r, ativa: r.ativa === 1, dados: JSON.parse(r.dados) }));
  const q = await get<{ dados: string }>('SELECT dados FROM quiz WHERE user_id = ?', [userId]);
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

// --- Autenticação (sem exigir login) ---

api.post('/auth/register', async (req, res) => {
  const username = texto(req.body.username, 'Usuário').toLowerCase();
  const email = lerEmail(req.body.email);
  const senha = texto(req.body.password, 'Senha');
  if (senha.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres');
  const { n } = (await get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!;
  const isAdmin = n === 0;
  let userId: number;
  try {
    const r = await run('INSERT INTO users (username, email, password_hash, is_admin, criado_em) VALUES (?, ?, ?, ?, ?)', [
      username,
      email,
      hashSenha(senha),
      isAdmin ? 1 : 0,
      new Date().toISOString(),
    ]);
    userId = Number(r.lastInsertRowid);
  } catch {
    throw new HttpError(409, 'Esse nome de usuário ou email já está em uso');
  }
  if (isAdmin && quizLegado) {
    await run('INSERT INTO quiz (user_id, dados) VALUES (?, ?)', [userId, quizLegado]);
  }
  await criarSessao(res, userId);
  res.json({ id: userId, username, email, isAdmin });
});

api.post('/auth/login', async (req, res) => {
  const identificador = texto(req.body.identificador, 'Usuário ou email').toLowerCase();
  const senha = texto(req.body.password, 'Senha');
  const u = await get<{ id: number; username: string; email: string | null; password_hash: string; isAdmin: number }>(
    'SELECT id, username, email, password_hash, is_admin AS isAdmin FROM users WHERE username = ? OR email = ?',
    [identificador, identificador],
  );
  if (!u || !conferirSenha(senha, u.password_hash)) throw new HttpError(401, 'Usuário/email ou senha incorretos');
  await criarSessao(res, u.id);
  res.json({ id: u.id, username: u.username, email: u.email, isAdmin: u.isAdmin === 1 });
});

api.post('/auth/logout', async (req, res) => {
  await encerrarSessao(req, res);
  res.json({ ok: true });
});

api.get('/auth/me', async (req, res) => {
  const sessao = await lerSessao(req);
  if (!sessao) {
    res.status(401).json({ erro: 'Não autenticado' });
    return;
  }
  res.json({ id: sessao.userId, username: sessao.username, email: sessao.email, isAdmin: sessao.isAdmin });
});

api.post('/auth/forgot-password', async (req, res) => {
  const email = lerEmail(req.body.email);
  const u = await get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email]);
  if (u) {
    const token = await criarTokenReset(u.id);
    const link = `${PUBLIC_URL}/redefinir-senha?token=${token}`;
    try {
      await enviarEmail(email, 'Redefinir senha — Capivara Política', emailRecuperacaoHtml(link));
    } catch (e) {
      console.error('Falha ao enviar email de recuperação:', e);
    }
  }
  // Sempre responde a mesma coisa, exista ou não o email, pra não revelar quais emails têm conta.
  res.json({ ok: true });
});

api.post('/auth/reset-password', async (req, res) => {
  const token = texto(req.body.token, 'Token');
  const novaSenha = texto(req.body.novaSenha, 'Senha');
  if (novaSenha.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres');
  const valido = await validarTokenReset(token);
  if (!valido) throw new HttpError(400, 'Link inválido ou expirado. Peça uma nova recuperação de senha.');
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [hashSenha(novaSenha), valido.userId]);
  await consumirTokenReset(token);
  await run('DELETE FROM sessions WHERE user_id = ?', [valido.userId]);
  res.json({ ok: true });
});

// --- Daqui pra baixo exige login ---
api.use(exigirLogin);

api.post('/auth/change-password', async (req, res) => {
  const senhaAtual = texto(req.body.senhaAtual, 'Senha atual');
  const novaSenha = texto(req.body.novaSenha, 'Nova senha');
  if (novaSenha.length < 6) throw new HttpError(400, 'A nova senha precisa ter pelo menos 6 caracteres');
  const s = usuario(req);
  const u = (await get<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', [s.userId]))!;
  if (!conferirSenha(senhaAtual, u.password_hash)) throw new HttpError(401, 'Senha atual incorreta');
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [hashSenha(novaSenha), s.userId]);
  await run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [s.userId, tokenAtual(req)]);
  res.json({ ok: true });
});

// --- Área do admin: gestão de usuários ---

api.get('/admin/users', exigirAdmin, async (_req, res) => {
  const usuarios = await all<{ id: number; username: string; email: string | null; isAdmin: number; criadoEm: string }>(
    'SELECT id, username, email, is_admin AS isAdmin, criado_em AS criadoEm FROM users ORDER BY username',
  );
  res.json(usuarios.map((u) => ({ ...u, isAdmin: u.isAdmin === 1 })));
});

api.post('/admin/users', exigirAdmin, async (req, res) => {
  const username = texto(req.body.username, 'Usuário').toLowerCase();
  const email = lerEmail(req.body.email);
  const senha = texto(req.body.password, 'Senha');
  if (senha.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres');
  let userId: number;
  try {
    const r = await run('INSERT INTO users (username, email, password_hash, is_admin, criado_em) VALUES (?, ?, ?, 1, ?)', [
      username,
      email,
      hashSenha(senha),
      new Date().toISOString(),
    ]);
    userId = Number(r.lastInsertRowid);
  } catch {
    throw new HttpError(409, 'Esse nome de usuário ou email já está em uso');
  }
  res.json({ id: userId, username, email, isAdmin: true });
});

api.post('/admin/users/:id/promote', exigirAdmin, async (req, res) => {
  const id = idParam(req);
  const r = await run('UPDATE users SET is_admin = 1 WHERE id = ?', [id]);
  if (r.changes === 0) throw new HttpError(404, 'Usuário não encontrado');
  res.json({ ok: true });
});

api.get('/data', async (req, res) => {
  res.json(await listarTudo(usuario(req).userId));
});

api.post('/upload', exigirAdmin, (req, res) => {
  res.json({ url: salvarImagem(String(req.body.dataUrl ?? '')) });
});

api.post('/parties', exigirAdmin, async (req, res) => {
  const sigla = texto(req.body.sigla, 'Sigla').toUpperCase();
  const nome = texto(req.body.nome, 'Nome');
  try {
    const r = await run('INSERT INTO parties (sigla, nome, logo) VALUES (?, ?, ?)', [sigla, nome, opcional(req.body.logo)]);
    res.json({ id: Number(r.lastInsertRowid) });
  } catch {
    throw new HttpError(409, `Já existe um partido com a sigla ${sigla}`);
  }
});

api.put('/parties/:id', exigirAdmin, async (req, res) => {
  const sigla = texto(req.body.sigla, 'Sigla').toUpperCase();
  try {
    await run('UPDATE parties SET sigla = ?, nome = ?, logo = ? WHERE id = ?', [
      sigla,
      texto(req.body.nome, 'Nome'),
      opcional(req.body.logo),
      idParam(req),
    ]);
  } catch {
    throw new HttpError(409, `Já existe um partido com a sigla ${sigla}`);
  }
  res.json({ ok: true });
});

api.delete('/parties/:id', exigirAdmin, async (req, res) => {
  const id = idParam(req);
  const uso = (await get<{ n: number }>('SELECT COUNT(*) AS n FROM candidates WHERE party_id = ?', [id]))!;
  if (uso.n > 0) throw new HttpError(409, 'Há candidatos usando este partido. Remova ou troque o partido deles antes.');
  await transaction(async (t) => {
    await t.run("DELETE FROM research WHERE tipo = 'partido' AND entidade_id = ?", [id]);
    await t.run('DELETE FROM parties WHERE id = ?', [id]);
  });
  res.json({ ok: true });
});

api.post('/candidates', exigirAdmin, async (req, res) => {
  const c = lerCandidato(req.body);
  const r = await run('INSERT INTO candidates (nome, cargo, uf, party_id, foto) VALUES (?, ?, ?, ?, ?)', [
    c.nome,
    c.cargo,
    c.uf,
    c.partyId,
    c.foto,
  ]);
  res.json({ id: Number(r.lastInsertRowid) });
});

api.put('/candidates/:id', exigirAdmin, async (req, res) => {
  const c = lerCandidato(req.body);
  await run('UPDATE candidates SET nome = ?, cargo = ?, uf = ?, party_id = ?, foto = ? WHERE id = ?', [
    c.nome,
    c.cargo,
    c.uf,
    c.partyId,
    c.foto,
    idParam(req),
  ]);
  res.json({ ok: true });
});

api.delete('/candidates/:id', exigirAdmin, async (req, res) => {
  const id = idParam(req);
  await transaction(async (t) => {
    await t.run("DELETE FROM research WHERE tipo = 'candidato' AND entidade_id = ?", [id]);
    await t.run('DELETE FROM candidates WHERE id = ?', [id]);
  });
  res.json({ ok: true });
});

api.post('/research', exigirAdmin, async (req, res) => {
  const tipo = req.body.tipo;
  const entidadeId = Number(req.body.entidadeId);
  if (tipo !== 'candidato' && tipo !== 'partido') throw new HttpError(400, 'Tipo inválido');
  if (!Number.isInteger(entidadeId) || typeof req.body.dados !== 'object' || req.body.dados === null) {
    throw new HttpError(400, 'Pesquisa inválida');
  }
  const id = await transaction(async (t) => {
    await t.run('UPDATE research SET ativa = 0 WHERE tipo = ? AND entidade_id = ?', [tipo, entidadeId]);
    const r = await t.run('INSERT INTO research (tipo, entidade_id, criado_em, ativa, dados) VALUES (?, ?, ?, 1, ?)', [
      tipo,
      entidadeId,
      new Date().toISOString(),
      JSON.stringify(req.body.dados),
    ]);
    return Number(r.lastInsertRowid);
  });
  res.json({ id });
});

api.post('/research/:id/activate', exigirAdmin, async (req, res) => {
  const id = idParam(req);
  const r = await get<{ tipo: string; entidadeId: number }>('SELECT tipo, entidade_id AS entidadeId FROM research WHERE id = ?', [id]);
  if (!r) throw new HttpError(404, 'Versão não encontrada');
  await transaction(async (t) => {
    await t.run('UPDATE research SET ativa = 0 WHERE tipo = ? AND entidade_id = ?', [r.tipo, r.entidadeId]);
    await t.run('UPDATE research SET ativa = 1 WHERE id = ?', [id]);
  });
  res.json({ ok: true });
});

api.delete('/research/:id', exigirAdmin, async (req, res) => {
  const id = idParam(req);
  const r = await get<{ tipo: string; entidadeId: number; ativa: number }>(
    'SELECT tipo, entidade_id AS entidadeId, ativa FROM research WHERE id = ?',
    [id],
  );
  if (!r) throw new HttpError(404, 'Versão não encontrada');
  await transaction(async (t) => {
    await t.run('DELETE FROM research WHERE id = ?', [id]);
    if (r.ativa === 1) {
      await t.run(
        `UPDATE research SET ativa = 1 WHERE id = (
           SELECT MAX(id) FROM research WHERE tipo = ? AND entidade_id = ?
         )`,
        [r.tipo, r.entidadeId],
      );
    }
  });
  res.json({ ok: true });
});

api.put('/quiz', async (req, res) => {
  await run('INSERT INTO quiz (user_id, dados) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET dados = excluded.dados', [
    usuario(req).userId,
    JSON.stringify({
      respostas: req.body.respostas ?? {},
      eticaEliminatoria: req.body.eticaEliminatoria ?? null,
    }),
  ]);
  res.json({ ok: true });
});

api.get('/export', exigirAdmin, async (req, res) => {
  const tudo = await listarTudo(usuario(req).userId);
  res.setHeader('Content-Disposition', `attachment; filename="capivara-politica-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ versao: 1, ...tudo, uploads: arquivosUsados(tudo.parties, tudo.candidates) });
});

api.post('/import', exigirAdmin, async (req, res) => {
  const b = req.body;
  if (b?.versao !== 1 || !Array.isArray(b.parties) || !Array.isArray(b.candidates) || !Array.isArray(b.research)) {
    throw new HttpError(400, 'Arquivo de backup inválido');
  }
  const userId = usuario(req).userId;
  const mapa: Record<string, string> = {};
  for (const [url, dataUrl] of Object.entries((b.uploads ?? {}) as Record<string, string>)) {
    mapa[url] = salvarImagem(dataUrl);
  }
  const remap = (u: string | null) => (u && mapa[u] ? mapa[u] : u);
  await transaction(async (t) => {
    // Substitui os dados compartilhados (candidatos, partidos, pesquisas). Não mexe em
    // contas de outros usuários nem no perfil (quiz) deles — só o de quem está importando.
    await t.run('DELETE FROM research');
    await t.run('DELETE FROM candidates');
    await t.run('DELETE FROM parties');
    for (const p of b.parties) {
      await t.run('INSERT INTO parties (id, sigla, nome, logo) VALUES (?, ?, ?, ?)', [p.id, p.sigla, p.nome, remap(p.logo)]);
    }
    for (const c of b.candidates) {
      await t.run('INSERT INTO candidates (id, nome, cargo, uf, party_id, foto) VALUES (?, ?, ?, ?, ?, ?)', [
        c.id,
        c.nome,
        c.cargo,
        c.uf,
        c.partyId,
        remap(c.foto),
      ]);
    }
    for (const r of b.research) {
      await t.run('INSERT INTO research (id, tipo, entidade_id, criado_em, ativa, dados) VALUES (?, ?, ?, ?, ?, ?)', [
        r.id,
        r.tipo,
        r.entidadeId,
        r.criadoEm,
        r.ativa ? 1 : 0,
        JSON.stringify(r.dados),
      ]);
    }
    await t.run('DELETE FROM quiz WHERE user_id = ?', [userId]);
    await t.run('INSERT INTO quiz (user_id, dados) VALUES (?, ?)', [userId, JSON.stringify(b.quiz ?? EMPTY_QUIZ)]);
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
app.use('/api', erroFinal);

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
