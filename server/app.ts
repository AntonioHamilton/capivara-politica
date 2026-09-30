import './env.ts';
import express from 'express';
import type { Request } from 'express';
import crypto from 'node:crypto';
import { get, all, run, quizLegado, transaction } from './db.ts';
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
import { compatibilidade } from '../src/lib/scoring.ts';
import type { Compat } from '../src/lib/scoring.ts';
import type { QuizState } from '../src/lib/types.ts';

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

async function quizDoUsuario(userId: number): Promise<QuizState> {
  const q = await get<{ dados: string }>('SELECT dados FROM quiz WHERE user_id = ?', [userId]);
  return q ? JSON.parse(q.dados) : EMPTY_QUIZ;
}

// versão completa (só para backup/restore em /export e /import — nunca para o bootstrap do app,
// que não pode carregar os ~20 mil candidatos e pesquisas de uma vez)
async function listarTudoCompleto(userId: number) {
  const parties = await all<Record<string, unknown>>('SELECT id, sigla, nome, logo FROM parties ORDER BY sigla');
  const candidates = await all<Record<string, unknown>>('SELECT id, nome, cargo, uf, party_id AS partyId, foto FROM candidates ORDER BY nome');
  const research = (
    await all<{ ativa: number; dados: string }>(
      'SELECT id, tipo, entidade_id AS entidadeId, criado_em AS criadoEm, ativa, dados FROM research ORDER BY id DESC',
    )
  ).map((r) => ({ ...r, ativa: r.ativa === 1, dados: JSON.parse(r.dados) }));
  return { parties, candidates, research, quiz: await quizDoUsuario(userId) };
}

// bootstrap do app: só o quiz do usuário. Partidos, candidatos e pesquisas são pedidos sob
// demanda por cada tela (rotas abaixo).

// compatibilidade usuário x partido fica guardada em party_compat (uma linha por usuário e
// partido) pra não recalcular a cada abertura da tela. Linhas ausentes são calculadas na hora
// de ler; são apagadas quando o quiz do usuário ou a pesquisa do partido mudam.
async function compatDosPartidos(userId: number, quiz: QuizState): Promise<Map<number, Compat>> {
  const guardadas = await all<{ partyId: number; dados: string }>('SELECT party_id AS partyId, dados FROM party_compat WHERE user_id = ?', [userId]);
  const mapa = new Map<number, Compat>(guardadas.map((g) => [g.partyId, JSON.parse(g.dados)]));

  const pesquisas = await all<{ entidadeId: number; dados: string }>(
    "SELECT entidade_id AS entidadeId, dados FROM research WHERE tipo = 'partido' AND ativa = 1",
  );
  for (const p of pesquisas) {
    if (mapa.has(p.entidadeId)) continue;
    const compat = compatibilidade(quiz, JSON.parse(p.dados).quiz);
    mapa.set(p.entidadeId, compat);
    await run('INSERT OR REPLACE INTO party_compat (user_id, party_id, dados) VALUES (?, ?, ?)', [userId, p.entidadeId, JSON.stringify(compat)]);
  }
  return mapa;
}

async function pesquisaAtivaDoPartido(partyId: number) {
  const r = await get<{ id: number; criadoEm: string; dados: string }>(
    "SELECT id, criado_em AS criadoEm, dados FROM research WHERE tipo = 'partido' AND entidade_id = ? AND ativa = 1",
    [partyId],
  );
  return r ? { id: r.id, tipo: 'partido' as const, entidadeId: partyId, criadoEm: r.criadoEm, ativa: true, dados: JSON.parse(r.dados) } : undefined;
}

const chaveGrupo = (cargo: string, uf: string) => `${cargo}:${uf}`;

interface LinhaCandidato {
  id: number;
  nome: string;
  cargo: string;
  uf: string;
  partyId: number | null;
  foto: string | null;
  pesquisaId: number | null;
  pesquisaCriadoEm: string | null;
  pesquisaAtiva: number | null;
  pesquisaDados: string | null;
}

// monta os itens (compat + conflito) e calcula o ranking (posição dentro de cada cargo+uf)
// dentro do próprio conjunto recebido — quem chama decide o quanto filtrar antes, pra manter
// o cálculo barato (ex: uma corrida específica) ou aceitar o custo de rodar em tudo (busca ampla)
function montarItensRankeados(linhas: LinhaCandidato[], quiz: QuizState) {
  const itens = linhas.map((l) => {
    const dados = l.pesquisaDados ? JSON.parse(l.pesquisaDados) : null;
    const compat = dados ? compatibilidade(quiz, dados.quiz, dados.polemicas) : null;
    return {
      cand: { id: l.id, nome: l.nome, cargo: l.cargo, uf: l.uf, partyId: l.partyId, foto: l.foto },
      pesquisa:
        l.pesquisaId != null
          ? { id: l.pesquisaId, tipo: 'candidato' as const, entidadeId: l.id, criadoEm: l.pesquisaCriadoEm!, ativa: l.pesquisaAtiva === 1, dados }
          : undefined,
      compat,
      conflito: !!compat && compat.conflitos.length > 0,
      rank: null as number | null,
      totalGrupo: 0,
    };
  });

  const grupos = new Map<string, typeof itens>();
  for (const it of itens) {
    if (it.compat?.pct == null || it.conflito) continue;
    const k = chaveGrupo(it.cand.cargo, it.cand.uf);
    grupos.set(k, [...(grupos.get(k) ?? []), it]);
  }
  for (const membros of grupos.values()) {
    membros.sort((a, b) => b.compat!.pct! - a.compat!.pct! || a.cand.nome.localeCompare(b.cand.nome));
    membros.forEach((m, i) => {
      m.rank = i + 1;
      m.totalGrupo = membros.length;
    });
  }
  return itens;
}

function ordenarItens<T extends { compat: { pct: number | null } | null; conflito: boolean; cand: { nome: string } }>(
  itens: T[],
  ordem: string,
): T[] {
  if (ordem === 'nome') return [...itens].sort((a, b) => a.cand.nome.localeCompare(b.cand.nome));
  const peso = (i: T) => (i.conflito ? 2 : i.compat?.pct != null ? 0 : 1);
  return [...itens].sort((a, b) => peso(a) - peso(b) || (b.compat?.pct ?? 0) - (a.compat?.pct ?? 0) || a.cand.nome.localeCompare(b.cand.nome));
}

// opções (nome, número, partido, foto) pra popular o <select> da Colinha — sem compatibilidade,
// que depende do quiz de cada usuário. Como só muda quando um admin edita candidato/pesquisa,
// fica em cache em memória por cargo+uf (a Colinha nunca filtra por outra coisa).
interface OpcaoColinha {
  id: number;
  nome: string;
  cargo: string;
  uf: string;
  partyId: number | null;
  foto: string | null;
  numeroUrna: string | null;
}
const cacheOpcoesColinha = new Map<string, OpcaoColinha[]>();
function invalidarCacheColinha() {
  cacheOpcoesColinha.clear();
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

// login com Google: o botão é nosso (não o do Google), então usamos o modo "token client" do
// Google Identity Services — o clique abre o popup do Google e devolve um access token, que
// aqui a gente confere chamando o userinfo do Google (sem precisar de client secret).
api.post('/auth/google', async (req, res) => {
  const accessToken = texto(req.body.accessToken, 'accessToken');
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(500, 'Login com Google não está configurado');

  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new HttpError(401, 'Token do Google inválido ou expirado');
  const payload = (await r.json()) as { email?: string; email_verified?: boolean };
  if (!payload.email || !payload.email_verified) throw new HttpError(401, 'Email do Google não verificado');

  const email = payload.email.toLowerCase();
  const existente = await get<{ id: number; username: string; email: string | null; isAdmin: number }>(
    'SELECT id, username, email, is_admin AS isAdmin FROM users WHERE email = ?',
    [email],
  );

  let usuarioFinal: { id: number; username: string; email: string | null; isAdmin: number };
  if (existente) {
    usuarioFinal = existente;
  } else {
    const { n } = (await get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))!;
    const isAdmin = n === 0;
    const base = email.split('@')[0].replace(/[^a-z0-9._-]/gi, '').toLowerCase() || 'usuario';
    let username = base;
    let sufixo = 1;
    while (await get('SELECT id FROM users WHERE username = ?', [username])) {
      username = `${base}${++sufixo}`;
    }
    const senhaAleatoria = hashSenha(crypto.randomBytes(32).toString('hex'));
    const novo = await run('INSERT INTO users (username, email, password_hash, is_admin, criado_em) VALUES (?, ?, ?, ?, ?)', [
      username,
      email,
      senhaAleatoria,
      isAdmin ? 1 : 0,
      new Date().toISOString(),
    ]);
    const userId = Number(novo.lastInsertRowid);
    if (isAdmin && quizLegado) await run('INSERT INTO quiz (user_id, dados) VALUES (?, ?)', [userId, quizLegado]);
    usuarioFinal = { id: userId, username, email, isAdmin: isAdmin ? 1 : 0 };
  }

  await criarSessao(res, usuarioFinal.id);
  res.json({ id: usuarioFinal.id, username: usuarioFinal.username, email: usuarioFinal.email, isAdmin: usuarioFinal.isAdmin === 1 });
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

api.get('/colinha/:token', async (req, res) => {
  const r = await get<{ itens: string; atualizadoEm: string }>('SELECT itens, atualizado_em AS atualizadoEm FROM colinhas WHERE token = ?', [
    req.params.token,
  ]);
  if (!r) throw new HttpError(404, 'Colinha não encontrada');
  res.json({ itens: JSON.parse(r.itens), atualizadoEm: r.atualizadoEm });
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

api.post('/feedback', async (req, res) => {
  const mensagem = texto(req.body.mensagem, 'Mensagem');
  await run('INSERT INTO feedback (user_id, mensagem, criado_em) VALUES (?, ?, ?)', [
    usuario(req).userId,
    mensagem,
    new Date().toISOString(),
  ]);
  res.json({ ok: true });
});

api.get('/feedback', exigirAdmin, async (_req, res) => {
  const lista = await all<{ id: number; mensagem: string; criadoEm: string; username: string; email: string | null }>(
    `SELECT f.id, f.mensagem, f.criado_em AS criadoEm, u.username, u.email
     FROM feedback f JOIN users u ON u.id = f.user_id
     ORDER BY f.id DESC`,
  );
  res.json(lista);
});

api.get('/data', async (req, res) => {
  res.json({ quiz: await quizDoUsuario(usuario(req).userId) });
});

api.get('/contagens', exigirAdmin, async (_req, res) => {
  const candidatos = (await get<{ n: number }>('SELECT COUNT(*) AS n FROM candidates'))!.n;
  const pesquisas = (await get<{ n: number }>('SELECT COUNT(*) AS n FROM research'))!.n;
  const partidos = (await get<{ n: number }>('SELECT COUNT(*) AS n FROM parties'))!.n;
  res.json({ candidatos, pesquisas, partidos });
});

// tela de Partidos: só o que os cards mostram (logo, sigla, nome, quantidade de candidatos e
// compatibilidade já guardada) — sem o texto das pesquisas
api.get('/partidos', async (req, res) => {
  const userId = usuario(req).userId;
  const [partidos, contagens, compats] = await Promise.all([
    all<{ id: number; sigla: string; nome: string; logo: string | null }>('SELECT id, sigla, nome, logo FROM parties ORDER BY sigla'),
    all<{ partyId: number; n: number }>('SELECT party_id AS partyId, COUNT(*) AS n FROM candidates WHERE party_id IS NOT NULL GROUP BY party_id'),
    quizDoUsuario(userId).then((quiz) => compatDosPartidos(userId, quiz)),
  ]);
  const porPartido = new Map(contagens.map((c) => [c.partyId, c.n]));
  res.json(
    partidos.map((p) => ({ ...p, candidatosCount: porPartido.get(p.id) ?? 0, compat: compats.get(p.id) ?? null, pesquisado: compats.has(p.id) })),
  );
});

// opções leves de partido (select de filtro, formulário de candidato, colinha)
api.get('/partidos-opcoes', async (_req, res) => {
  res.json(await all('SELECT id, sigla, nome, logo FROM parties ORDER BY sigla'));
});

api.get('/partidos/:id', async (req, res) => {
  const id = idParam(req);
  const party = await get<Record<string, unknown>>(
    'SELECT p.id, p.sigla, p.nome, p.logo, (SELECT COUNT(*) FROM candidates c WHERE c.party_id = p.id) AS candidatosCount FROM parties p WHERE p.id = ?',
    [id],
  );
  if (!party) throw new HttpError(404, 'Partido não encontrado');
  const userId = usuario(req).userId;
  const compats = await compatDosPartidos(userId, await quizDoUsuario(userId));
  res.json({ party, pesquisa: await pesquisaAtivaDoPartido(id), compat: compats.get(id) ?? null });
});

// acima disso, buscar a pesquisa (texto grande) de todo mundo pra ordenar por compatibilidade
// fica caro demais (a base tem ~20 mil candidatos) — nesse caso cai pro caminho rápido abaixo
const LIMITE_CALCULO_COMPLETO = 1500;

// lista/busca paginada de candidatos, já com compatibilidade e ranking calculados no servidor.
// sem `limit`, devolve tudo que casar com o filtro (uso da Colinha, que já filtra por cargo/uf
// e sempre lida com conjuntos pequenos); com `limit`, pagina (uso da tela de Lista).
api.get('/candidatos', async (req, res) => {
  const { cargo, uf, partido, busca, ordem, top3 } = req.query;
  const condicoes: string[] = [];
  const args: (string | number)[] = [];
  if (typeof cargo === 'string' && cargo) {
    condicoes.push('c.cargo = ?');
    args.push(cargo);
  }
  if (typeof uf === 'string' && uf) {
    condicoes.push('c.uf = ?');
    args.push(uf);
  }
  if (typeof partido === 'string' && partido) {
    condicoes.push('c.party_id = ?');
    args.push(Number(partido));
  }
  if (typeof busca === 'string' && busca.trim()) {
    condicoes.push('LOWER(c.nome) LIKE ?');
    args.push(`%${busca.trim().toLowerCase()}%`);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const quiz = await quizDoUsuario(usuario(req).userId);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limitParam = req.query.limit;
  const partiesRows = await all<{ id: number; sigla: string; nome: string; logo: string | null }>('SELECT id, sigla, nome, logo FROM parties');
  const partidosPorId = new Map(partiesRows.map((p) => [p.id, p]));
  const montarLeve = (it: ReturnType<typeof montarItensRankeados>[number]) => ({
    cand: it.cand,
    party: it.cand.partyId != null ? partidosPorId.get(it.cand.partyId) : undefined,
    compat: it.compat,
    conflito: it.conflito,
    rank: it.rank,
    totalGrupo: it.totalGrupo,
    temPesquisa: !!it.pesquisa,
    numeroUrna: it.pesquisa?.dados.basico.numero_urna ?? null,
    situacao: it.pesquisa?.dados.basico.situacao ?? null,
  });

  const { n: totalFiltrado } = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM candidates c ${where}`, args))!;

  if (totalFiltrado > LIMITE_CALCULO_COMPLETO) {
    // caminho rápido: pagina primeiro no SQL (só nome, sem tocar na pesquisa de todo mundo) e
    // calcula compat/ranking só de quem entra na página — ordenar por compatibilidade ou o
    // filtro "top 3" exigem o grupo inteiro carregado, então só valem com um filtro mais estreito
    const linhasPagina = await all<{ id: number; nome: string; cargo: string; uf: string; partyId: number | null; foto: string | null }>(
      `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto FROM candidates c ${where} ORDER BY c.nome LIMIT ? OFFSET ?`,
      [...args, Number(limitParam) || LIMITE_CALCULO_COMPLETO, offset],
    );
    const ids = linhasPagina.map((l) => l.id);
    const pesquisas = ids.length
      ? await all<{ entidadeId: number; id: number; criadoEm: string; ativa: number; dados: string }>(
          `SELECT entidade_id AS entidadeId, id, criado_em AS criadoEm, ativa, dados FROM research
           WHERE tipo = 'candidato' AND ativa = 1 AND entidade_id IN (${ids.map(() => '?').join(',')})`,
          ids,
        )
      : [];
    const pesquisaPorCandidato = new Map(pesquisas.map((p) => [p.entidadeId, p]));
    const leve = linhasPagina.map((l) => {
      const p = pesquisaPorCandidato.get(l.id);
      const dados = p ? JSON.parse(p.dados) : null;
      const compat = dados ? compatibilidade(quiz, dados.quiz, dados.polemicas) : null;
      return {
        cand: { id: l.id, nome: l.nome, cargo: l.cargo, uf: l.uf, partyId: l.partyId, foto: l.foto },
        party: l.partyId != null ? partidosPorId.get(l.partyId) : undefined,
        compat,
        conflito: !!compat && compat.conflitos.length > 0,
        rank: null,
        totalGrupo: 0,
        temPesquisa: !!p,
        numeroUrna: dados?.basico.numero_urna ?? null,
        situacao: dados?.basico.situacao ?? null,
      };
    });
    res.json({ total: totalFiltrado, itens: leve });
    return;
  }

  const linhas = await all<LinhaCandidato>(
    `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto,
            r.id AS pesquisaId, r.criado_em AS pesquisaCriadoEm, r.ativa AS pesquisaAtiva, r.dados AS pesquisaDados
     FROM candidates c
     LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
     ${where}`,
    args,
  );

  let itens = montarItensRankeados(linhas, quiz);
  if (top3 === '1' || top3 === 'true') itens = itens.filter((i) => i.rank != null && i.rank <= 3);
  itens = ordenarItens(itens, typeof ordem === 'string' ? ordem : 'compat');

  const total = itens.length;
  const pagina = typeof limitParam === 'string' && limitParam ? itens.slice(offset, offset + Number(limitParam)) : itens;

  res.json({ total, itens: pagina.map(montarLeve) });
});

// perfil do candidato: só ele (candidato, partido e pesquisa ativa numa consulta, em paralelo
// com o quiz do usuário). A posição no ranking exige olhar o grupo todo e vem à parte, em
// /candidatos/:id/ranking, pra não atrasar a abertura do perfil.
api.get('/candidatos/:id', async (req, res) => {
  const id = idParam(req);
  const [l, quiz] = await Promise.all([
    get<Record<string, unknown> & { pesquisaDados: string | null; pesquisaId: number | null }>(
      `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto,
              p.sigla AS pSigla, p.nome AS pNome, p.logo AS pLogo,
              r.id AS pesquisaId, r.criado_em AS pesquisaCriadoEm, r.ativa AS pesquisaAtiva, r.dados AS pesquisaDados
       FROM candidates c
       LEFT JOIN parties p ON p.id = c.party_id
       LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
       WHERE c.id = ?`,
      [id],
    ),
    quizDoUsuario(usuario(req).userId),
  ]);
  if (!l) throw new HttpError(404, 'Candidato não encontrado');

  const dados = l.pesquisaDados ? JSON.parse(l.pesquisaDados) : null;
  const compat = dados ? compatibilidade(quiz, dados.quiz, dados.polemicas) : null;
  res.json({
    cand: { id: l.id, nome: l.nome, cargo: l.cargo, uf: l.uf, partyId: l.partyId, foto: l.foto },
    party: l.partyId != null ? { id: l.partyId, sigla: l.pSigla, nome: l.pNome, logo: l.pLogo } : undefined,
    pesquisa:
      l.pesquisaId != null
        ? { id: l.pesquisaId, tipo: 'candidato', entidadeId: id, criadoEm: l.pesquisaCriadoEm, ativa: l.pesquisaAtiva === 1, dados }
        : undefined,
    compat,
    conflito: !!compat && compat.conflitos.length > 0,
  });
});

// posição do candidato entre os do mesmo cargo+uf. Lê do banco só o quiz e as polêmicas de cada
// pesquisa (json_extract), não o documento inteiro, que é o que pesava na resposta.
api.get('/candidatos/:id/ranking', async (req, res) => {
  const id = idParam(req);
  const [linhas, quiz] = await Promise.all([
    all<{ id: number; nome: string; quiz: string | null; polemicas: string | null }>(
      `SELECT c.id, c.nome, json_extract(r.dados, '$.quiz') AS quiz, json_extract(r.dados, '$.polemicas') AS polemicas
       FROM candidates c
       LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
       WHERE c.cargo = (SELECT cargo FROM candidates WHERE id = ?) AND c.uf = (SELECT uf FROM candidates WHERE id = ?)`,
      [id, id],
    ),
    quizDoUsuario(usuario(req).userId),
  ]);
  if (!linhas.some((l) => l.id === id)) throw new HttpError(404, 'Candidato não encontrado');

  const classificaveis: { id: number; nome: string; pct: number }[] = [];
  for (const l of linhas) {
    if (!l.quiz) continue;
    const compat = compatibilidade(quiz, JSON.parse(l.quiz), l.polemicas ? JSON.parse(l.polemicas) : []);
    if (compat.pct != null && compat.conflitos.length === 0) classificaveis.push({ id: l.id, nome: l.nome, pct: compat.pct });
  }
  classificaveis.sort((a, b) => b.pct - a.pct || a.nome.localeCompare(b.nome));
  const posicao = classificaveis.findIndex((c) => c.id === id);
  res.json(posicao >= 0 ? { rank: posicao + 1, totalGrupo: classificaveis.length } : { rank: null, totalGrupo: 0 });
});

// opções pro <select> da Colinha: leve (sem compat) e cacheável, já que não depende do usuário.
api.get('/colinha-opcoes', async (req, res) => {
  const { cargo, uf } = req.query;
  const chave = `${typeof cargo === 'string' ? cargo : ''}:${typeof uf === 'string' ? uf : ''}`;
  const emCache = cacheOpcoesColinha.get(chave);
  if (emCache) {
    res.json(emCache);
    return;
  }
  const condicoes: string[] = [];
  const args: (string | number)[] = [];
  if (typeof cargo === 'string' && cargo) {
    condicoes.push('c.cargo = ?');
    args.push(cargo);
  }
  if (typeof uf === 'string' && uf) {
    condicoes.push('c.uf = ?');
    args.push(uf);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const linhas = await all<{ id: number; nome: string; cargo: string; uf: string; partyId: number | null; foto: string | null; dados: string | null }>(
    `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto, r.dados AS dados
     FROM candidates c
     LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
     ${where}
     ORDER BY c.nome`,
    args,
  );
  const opcoes: OpcaoColinha[] = linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    cargo: l.cargo,
    uf: l.uf,
    partyId: l.partyId,
    foto: l.foto,
    numeroUrna: l.dados ? (JSON.parse(l.dados).basico?.numero_urna ?? null) : null,
  }));
  cacheOpcoesColinha.set(chave, opcoes);
  res.json(opcoes);
});

// candidato com maior compatibilidade em cada cargo do estado (+ presidente, que é nacional) —
// só os ids e o %, pra pré-selecionar a Colinha sem mandar a pesquisa de todo mundo pro cliente.
// só 2 consultas (o estado inteiro de um lado, presidente do outro) em vez de uma por cargo.
api.get('/colinha-melhores', async (req, res) => {
  const uf = typeof req.query.uf === 'string' ? req.query.uf : '';
  if (!uf) throw new HttpError(400, 'uf é obrigatório');
  const quiz = await quizDoUsuario(usuario(req).userId);

  const linhasComum = (where: string, args: (string | number)[]) =>
    all<LinhaCandidato>(
      `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto,
              r.id AS pesquisaId, r.criado_em AS pesquisaCriadoEm, r.ativa AS pesquisaAtiva, r.dados AS pesquisaDados
       FROM candidates c
       LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
       ${where}`,
      args,
    );

  const [linhasUf, linhasPresidente] = await Promise.all([
    linhasComum("WHERE c.uf = ? AND c.cargo != 'presidente'", [uf]),
    linhasComum("WHERE c.cargo = 'presidente'", []),
  ]);

  const itensUf = montarItensRankeados(linhasUf, quiz);
  const itensPresidente = montarItensRankeados(linhasPresidente, quiz);

  const melhoresDoCargo = (itens: typeof itensUf, cargo: string, quantos: number) => {
    const validos = itens.filter((i) => i.cand.cargo === cargo && i.compat?.pct != null && !i.conflito);
    validos.sort((a, b) => b.compat!.pct! - a.compat!.pct!);
    return validos.slice(0, quantos).map((i) => ({ id: i.cand.id, pct: i.compat!.pct! }));
  };

  res.json({
    presidente: melhoresDoCargo(itensPresidente, 'presidente', 1),
    governador: melhoresDoCargo(itensUf, 'governador', 1),
    senador: melhoresDoCargo(itensUf, 'senador', 2),
    deputado_federal: melhoresDoCargo(itensUf, 'deputado_federal', 1),
    deputado_estadual: melhoresDoCargo(itensUf, 'deputado_estadual', 1),
  });
});

// compatibilidade de um único candidato — sem carregar o grupo inteiro (usado pra escolhas
// manuais/restauradas na Colinha, que não vêm no cálculo dos "melhores" de cima)
api.get('/candidato-compat/:id', async (req, res) => {
  const id = idParam(req);
  const pesquisa = await get<{ dados: string }>(
    "SELECT dados FROM research WHERE tipo = 'candidato' AND entidade_id = ? AND ativa = 1",
    [id],
  );
  if (!pesquisa) {
    res.json({ pct: null });
    return;
  }
  const dados = JSON.parse(pesquisa.dados);
  const quiz = await quizDoUsuario(usuario(req).userId);
  const compat = compatibilidade(quiz, dados.quiz, dados.polemicas);
  res.json({ pct: compat.pct });
});

api.get('/research', async (req, res) => {
  const { tipo, entidadeId } = req.query;
  if (tipo !== 'candidato' && tipo !== 'partido') throw new HttpError(400, 'Tipo inválido');
  const id = Number(entidadeId);
  if (!Number.isInteger(id)) throw new HttpError(400, 'entidadeId inválido');
  const lista = (
    await all<{ ativa: number; dados: string }>(
      'SELECT id, tipo, entidade_id AS entidadeId, criado_em AS criadoEm, ativa, dados FROM research WHERE tipo = ? AND entidade_id = ? ORDER BY id DESC',
      [tipo, id],
    )
  ).map((r) => ({ ...r, ativa: r.ativa === 1, dados: JSON.parse(r.dados) }));
  res.json(lista);
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
    await t.run('DELETE FROM party_compat WHERE party_id = ?', [id]);
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
  invalidarCacheColinha();
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
  invalidarCacheColinha();
  res.json({ ok: true });
});

api.delete('/candidates/:id', exigirAdmin, async (req, res) => {
  const id = idParam(req);
  await transaction(async (t) => {
    await t.run("DELETE FROM research WHERE tipo = 'candidato' AND entidade_id = ?", [id]);
    await t.run('DELETE FROM candidates WHERE id = ?', [id]);
  });
  invalidarCacheColinha();
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
    if (tipo === 'partido') await t.run('DELETE FROM party_compat WHERE party_id = ?', [entidadeId]);
    return Number(r.lastInsertRowid);
  });
  if (tipo === 'candidato') invalidarCacheColinha();
  res.json({ id });
});

api.post('/research/:id/activate', exigirAdmin, async (req, res) => {
  const id = idParam(req);
  const r = await get<{ tipo: string; entidadeId: number }>('SELECT tipo, entidade_id AS entidadeId FROM research WHERE id = ?', [id]);
  if (!r) throw new HttpError(404, 'Versão não encontrada');
  await transaction(async (t) => {
    await t.run('UPDATE research SET ativa = 0 WHERE tipo = ? AND entidade_id = ?', [r.tipo, r.entidadeId]);
    await t.run('UPDATE research SET ativa = 1 WHERE id = ?', [id]);
    if (r.tipo === 'partido') await t.run('DELETE FROM party_compat WHERE party_id = ?', [r.entidadeId]);
  });
  if (r.tipo === 'candidato') invalidarCacheColinha();
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
    if (r.tipo === 'partido') await t.run('DELETE FROM party_compat WHERE party_id = ?', [r.entidadeId]);
  });
  if (r.tipo === 'candidato') invalidarCacheColinha();
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
  await run('DELETE FROM party_compat WHERE user_id = ?', [usuario(req).userId]);
  res.json({ ok: true });
});

api.get('/colinha', async (req, res) => {
  const r = await get<{ itens: string; atualizadoEm: string }>(
    'SELECT itens, atualizado_em AS atualizadoEm FROM colinhas WHERE user_id = ?',
    [usuario(req).userId],
  );
  res.json(r ? { itens: JSON.parse(r.itens), atualizadoEm: r.atualizadoEm } : null);
});

api.put('/colinha', async (req, res) => {
  if (!Array.isArray(req.body.itens)) throw new HttpError(400, 'Itens inválidos');
  const userId = usuario(req).userId;
  const existente = await get<{ token: string }>('SELECT token FROM colinhas WHERE user_id = ?', [userId]);
  const token = existente?.token ?? crypto.randomUUID();
  await run(
    `INSERT INTO colinhas (token, user_id, itens, atualizado_em) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET itens = excluded.itens, atualizado_em = excluded.atualizado_em`,
    [token, userId, JSON.stringify(req.body.itens), new Date().toISOString()],
  );
  res.json({ token });
});

api.get('/export', exigirAdmin, async (req, res) => {
  const tudo = await listarTudoCompleto(usuario(req).userId);
  res.setHeader('Content-Disposition', `attachment; filename="capivara-politica-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ versao: 1, ...tudo });
});

api.post('/import', exigirAdmin, async (req, res) => {
  const b = req.body;
  if (b?.versao !== 1 || !Array.isArray(b.parties) || !Array.isArray(b.candidates) || !Array.isArray(b.research)) {
    throw new HttpError(400, 'Arquivo de backup inválido');
  }
  const userId = usuario(req).userId;
  await transaction(async (t) => {
    // Substitui os dados compartilhados (candidatos, partidos, pesquisas). Não mexe em
    // contas de outros usuários nem no perfil (quiz) deles — só o de quem está importando.
    await t.run('DELETE FROM research');
    await t.run('DELETE FROM party_compat');
    await t.run('DELETE FROM candidates');
    await t.run('DELETE FROM parties');
    for (const p of b.parties) {
      await t.run('INSERT INTO parties (id, sigla, nome, logo) VALUES (?, ?, ?, ?)', [p.id, p.sigla, p.nome, p.logo]);
    }
    for (const c of b.candidates) {
      await t.run('INSERT INTO candidates (id, nome, cargo, uf, party_id, foto) VALUES (?, ?, ?, ?, ?, ?)', [
        c.id,
        c.nome,
        c.cargo,
        c.uf,
        c.partyId,
        c.foto,
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
  invalidarCacheColinha();
  res.json({ ok: true });
});

export const app = express();
app.use(express.json({ limit: '30mb' }));
app.use('/api', api);
app.use('/api', (_req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada' });
});
app.use('/api', erroFinal);
