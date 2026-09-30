// server/env.ts
try {
  process.loadEnvFile();
} catch {
}

// server/app.ts
import express from "express";
import crypto3 from "node:crypto";

// server/db.ts
import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
var dataDir = path.resolve(import.meta.dirname, "..", "data");
var url = process.env.TURSO_DATABASE_URL || `file:${path.join(dataDir, "politicos.db")}`;
var authToken = process.env.TURSO_AUTH_TOKEN || void 0;
if (!process.env.TURSO_DATABASE_URL) fs.mkdirSync(dataDir, { recursive: true });
var db = createClient({ url, authToken });
async function get(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows[0];
}
async function all(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows;
}
async function run(sql, args = []) {
  const r = await db.execute({ sql, args });
  return { lastInsertRowid: r.lastInsertRowid ?? 0n, changes: r.rowsAffected };
}
async function transaction(fn) {
  const tx = await db.transaction("write");
  const t = {
    get: async (sql, args = []) => (await tx.execute({ sql, args })).rows[0],
    all: async (sql, args = []) => (await tx.execute({ sql, args })).rows,
    run: async (sql, args = []) => {
      const r = await tx.execute({ sql, args });
      return { lastInsertRowid: r.lastInsertRowid ?? 0n, changes: r.rowsAffected };
    }
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

  CREATE INDEX IF NOT EXISTS candidates_party ON candidates(party_id);

  CREATE TABLE IF NOT EXISTS party_compat (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    party_id INTEGER NOT NULL,
    dados TEXT NOT NULL,
    PRIMARY KEY (user_id, party_id)
  );

  CREATE TABLE IF NOT EXISTS espectro_respostas (
    chave TEXT PRIMARY KEY,
    assinatura TEXT NOT NULL,
    score REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS colinhas (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    itens TEXT NOT NULL,
    atualizado_em TEXT NOT NULL
  );
`);
var colunasUsers = await all("SELECT name FROM pragma_table_info('users')");
if (!colunasUsers.some((c) => c.name === "email")) {
  await db.executeMultiple("ALTER TABLE users ADD COLUMN email TEXT; CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email);");
}
var quizLegado = null;
async function prepararTabelaQuiz() {
  const colunas = await all("SELECT name FROM pragma_table_info('quiz')");
  const esquemaAntigo = colunas.length > 0 && !colunas.some((c) => c.name === "user_id");
  if (esquemaAntigo) {
    const antigo = await get("SELECT dados FROM quiz WHERE id = 1");
    quizLegado = antigo?.dados ?? null;
    await db.execute("DROP TABLE quiz");
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS quiz (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      dados TEXT NOT NULL
    )
  `);
}
await prepararTabelaQuiz();

// server/auth.ts
import crypto from "node:crypto";
var COOKIE = "sid";
var DURACAO_MS = 30 * 24 * 60 * 60 * 1e3;
var DURACAO_RESET_MS = 60 * 60 * 1e3;
var HttpError = class extends Error {
  status;
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function conferirSenha(senha, armazenado) {
  const [salt, hash] = armazenado.split(":");
  if (!salt || !hash) return false;
  const esperado = Buffer.from(hash, "hex");
  const recebido = crypto.scryptSync(senha, salt, 64);
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}
function lerToken(req) {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(";")) {
    const [k, ...resto] = parte.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(resto.join("="));
  }
  return null;
}
function tokenAtual(req) {
  return lerToken(req);
}
async function criarSessao(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await run("INSERT INTO sessions (token, user_id, criado_em) VALUES (?, ?, ?)", [token, userId, (/* @__PURE__ */ new Date()).toISOString()]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DURACAO_MS,
    path: "/"
  });
}
async function encerrarSessao(req, res) {
  const token = lerToken(req);
  if (token) await run("DELETE FROM sessions WHERE token = ?", [token]);
  res.clearCookie(COOKIE, { path: "/" });
}
async function lerSessao(req) {
  const token = lerToken(req);
  if (!token) return null;
  const row = await get(
    `SELECT u.id AS userId, u.username AS username, u.email AS email, u.is_admin AS isAdmin
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token]
  );
  return row ? { userId: row.userId, username: row.username, email: row.email, isAdmin: row.isAdmin === 1 } : null;
}
function usuario(req) {
  const s = req.sessao;
  if (!s) throw new HttpError(401, "N\xE3o autenticado");
  return s;
}
var exigirLogin = async (req, _res, next) => {
  const sessao = await lerSessao(req);
  if (!sessao) throw new HttpError(401, "N\xE3o autenticado");
  req.sessao = sessao;
  next();
};
var exigirAdmin = (req, _res, next) => {
  if (!usuario(req).isAdmin) throw new HttpError(403, "Apenas o administrador pode fazer isso");
  next();
};
function erroFinal(err, _req, res, _next) {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ erro: status === 500 ? "Erro interno" : err.message });
}
async function criarTokenReset(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + DURACAO_RESET_MS).toISOString();
  await run("INSERT INTO password_reset_tokens (token, user_id, expira_em, criado_em) VALUES (?, ?, ?, ?)", [
    token,
    userId,
    expiraEm,
    (/* @__PURE__ */ new Date()).toISOString()
  ]);
  return token;
}
async function validarTokenReset(token) {
  const row = await get(
    "SELECT user_id AS userId, expira_em AS expiraEm, usado FROM password_reset_tokens WHERE token = ?",
    [token]
  );
  if (!row || row.usado === 1 || new Date(row.expiraEm).getTime() < Date.now()) return null;
  return { userId: row.userId };
}
async function consumirTokenReset(token) {
  await run("UPDATE password_reset_tokens SET usado = 1 WHERE token = ?", [token]);
}

// server/email.ts
var RESEND_API_KEY = process.env.RESEND_API_KEY;
var FROM_EMAIL = process.env.EMAIL_FROM ?? "Capivara Pol\xEDtica <onboarding@resend.dev>";
var PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4310}`;
async function enviarEmail(destinatario, assunto, html) {
  if (!RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY n\xE3o configurada \u2014 email para ${destinatario} n\xE3o foi enviado ("${assunto}")`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM_EMAIL, to: destinatario, subject: assunto, html })
  });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new Error(`Falha ao enviar email (${r.status}): ${corpo}`);
  }
}
function layoutEmail(eyebrow, titulo, corpoHtml) {
  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin: 0; padding: 0; background-color: #0c0c0d; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0c0c0d; padding: 40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #161618; border: 1px solid #2c2c30; border-radius: 20px; overflow: hidden;">
            <tr>
              <td style="background-color: #1f1f22; padding: 36px 32px 8px; text-align: center;">
                <img src="${PUBLIC_URL}/capivara.png" width="120" height="120" alt="Capivara Pol\xEDtica" style="display: block; margin: 0 auto 12px; border-radius: 50%; border: 3px solid #ffc800;" />
                <h2 style="margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #ffc800;">Capivara Pol\xEDtica</h2>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px 32px 36px; text-align: center;">
                <h1 style="margin: 0 0 16px; font-size: 24px; line-height: 1.3; color: #f4f4f0;">${titulo}</h1>
                <div style="font-size: 15px; line-height: 1.6; color: #b8b8b3; text-align: left;">
                  ${corpoHtml}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 32px; background-color: #1f1f22; border-top: 1px solid #2c2c30; text-align: center;">
                <span style="font-size: 12px; color: #9b9b94;">${eyebrow}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}
function botaoEmail(texto2, link) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px auto; width: 100%;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius: 999px; background-color: #ffc800; box-shadow: 0 8px 20px rgba(255, 200, 0, 0.25);">
                <a href="${link}" style="display: inline-block; padding: 14px 36px; font-size: 16px; font-weight: 700; color: #111111; text-decoration: none;">${texto2}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}
function emailRecuperacaoHtml(link) {
  return layoutEmail(
    "Elei\xE7\xF5es 2026 \xB7 Brasil",
    "Redefinir sua senha",
    `
    <p style="margin: 0 0 8px;">Voc\xEA pediu para redefinir sua senha no Capivara Pol\xEDtica.</p>
    <p style="margin: 0;">Clique no bot\xE3o abaixo para criar uma nova senha. O link expira em <strong style="color: #f4f4f0;">1 hora</strong>.</p>
    ${botaoEmail("Criar nova senha", link)}
    <p style="margin: 0; font-size: 13px; color: #7a7a75;">Se n\xE3o foi voc\xEA quem pediu, pode ignorar este email \u2014 sua senha continua a mesma.</p>
    `
  );
}

// src/lib/questions.ts
var q = (id, eixo, sinal, usuario2, candidato) => ({
  id,
  eixo,
  sinal,
  usuario: usuario2,
  candidato
});
var PERGUNTAS = [
  q("q01", "economia", 1, "Voc\xEA \xE9 a favor da reforma da previd\xEAncia?", "O candidato \xE9 a favor da reforma da previd\xEAncia?"),
  q(
    "q02",
    "economia",
    1,
    "Voc\xEA \xE9 a favor de uma reforma administrativa (mudar regras de estabilidade e carreira do funcionalismo)?",
    "O candidato \xE9 a favor de uma reforma administrativa (mudar regras de estabilidade e carreira do funcionalismo)?"
  ),
  q("q03", "economia", 1, "O governo deveria privatizar mais empresas estatais?", "O candidato defende privatizar mais empresas estatais?"),
  q(
    "q04",
    "economia",
    -1,
    "O governo deveria aumentar impostos para ampliar programas sociais?",
    "O candidato defende aumentar impostos para ampliar programas sociais?"
  ),
  q(
    "q05",
    "economia",
    1,
    "O governo deveria seguir regras fiscais r\xEDgidas, mesmo que isso limite investimentos?",
    "O candidato defende regras fiscais r\xEDgidas, mesmo que limitem investimentos?"
  ),
  q(
    "q06",
    "economia",
    -1,
    "O sal\xE1rio m\xEDnimo deveria ter aumento real, acima da infla\xE7\xE3o, garantido por lei?",
    "O candidato defende aumento real do sal\xE1rio m\xEDnimo garantido por lei?"
  ),
  q("q07", "costumes", -1, "Voc\xEA \xE9 a favor da legaliza\xE7\xE3o do aborto?", "O candidato \xE9 a favor da legaliza\xE7\xE3o do aborto?"),
  q("q08", "costumes", -1, "Voc\xEA \xE9 a favor da legaliza\xE7\xE3o da maconha?", "O candidato \xE9 a favor da legaliza\xE7\xE3o da maconha?"),
  q(
    "q09",
    "costumes",
    -1,
    "As escolas devem abordar identidade de g\xEAnero e diversidade sexual?",
    "O candidato defende que as escolas abordem identidade de g\xEAnero e diversidade sexual?"
  ),
  q(
    "q10",
    "costumes",
    -1,
    "Voc\xEA \xE9 a favor do casamento civil entre pessoas do mesmo sexo?",
    "O candidato \xE9 a favor do casamento civil entre pessoas do mesmo sexo?"
  ),
  q(
    "q11",
    "costumes",
    1,
    "A religi\xE3o deveria ter mais influ\xEAncia nas decis\xF5es pol\xEDticas?",
    "O candidato defende maior influ\xEAncia da religi\xE3o nas decis\xF5es pol\xEDticas?"
  ),
  q(
    "q12",
    "costumes",
    -1,
    "Voc\xEA \xE9 a favor de cotas raciais em universidades e concursos p\xFAblicos?",
    "O candidato \xE9 a favor de cotas raciais em universidades e concursos p\xFAblicos?"
  ),
  q("q13", "seguranca", 1, "Voc\xEA \xE9 a favor da redu\xE7\xE3o da maioridade penal?", "O candidato \xE9 a favor da redu\xE7\xE3o da maioridade penal?"),
  q(
    "q14",
    "seguranca",
    1,
    "Voc\xEA \xE9 a favor de ampliar o acesso da popula\xE7\xE3o a armas de fogo?",
    "O candidato \xE9 a favor de ampliar o acesso da popula\xE7\xE3o a armas de fogo?"
  ),
  q(
    "q15",
    "seguranca",
    1,
    "Voc\xEA \xE9 a favor de endurecer as penas para crimes violentos?",
    "O candidato \xE9 a favor de endurecer as penas para crimes violentos?"
  ),
  q(
    "q16",
    "seguranca",
    1,
    "Policiais deveriam ter mais prote\xE7\xE3o jur\xEDdica em opera\xE7\xF5es (ampliar o excludente de ilicitude)?",
    "O candidato defende mais prote\xE7\xE3o jur\xEDdica para policiais em opera\xE7\xF5es (ampliar o excludente de ilicitude)?"
  ),
  q(
    "q17",
    "seguranca",
    -1,
    "Voc\xEA \xE9 a favor das audi\xEAncias de cust\xF3dia e das penas alternativas \xE0 pris\xE3o?",
    "O candidato \xE9 a favor das audi\xEAncias de cust\xF3dia e das penas alternativas \xE0 pris\xE3o?"
  ),
  q(
    "q18",
    "seguranca",
    1,
    "Fac\xE7\xF5es criminosas devem ser classificadas como organiza\xE7\xF5es terroristas?",
    "O candidato defende classificar fac\xE7\xF5es criminosas como organiza\xE7\xF5es terroristas?"
  ),
  q("q19", "instituicoes", 1, "Voc\xEA acha que o STF tem poder demais?", "O candidato afirma que o STF tem poder demais?"),
  q(
    "q20",
    "instituicoes",
    1,
    "Voc\xEA \xE9 a favor de limitar decis\xF5es individuais (monocr\xE1ticas) de ministros do STF?",
    "O candidato \xE9 a favor de limitar decis\xF5es individuais (monocr\xE1ticas) de ministros do STF?"
  ),
  q(
    "q21",
    "instituicoes",
    1,
    "Voc\xEA \xE9 a favor de mandato com prazo fixo para ministros do STF?",
    "O candidato \xE9 a favor de mandato com prazo fixo para ministros do STF?"
  ),
  q("q22", "instituicoes", 1, "Voc\xEA \xE9 a favor do voto impresso audit\xE1vel?", "O candidato \xE9 a favor do voto impresso audit\xE1vel?"),
  q(
    "q23",
    "instituicoes",
    -1,
    "As plataformas digitais deveriam ser responsabilizadas pelo conte\xFAdo publicado por usu\xE1rios?",
    "O candidato defende responsabilizar as plataformas digitais pelo conte\xFAdo publicado por usu\xE1rios?"
  ),
  q(
    "q24",
    "instituicoes",
    1,
    "O Congresso deveria poder anular decis\xF5es do STF?",
    "O candidato defende que o Congresso possa anular decis\xF5es do STF?"
  ),
  q("q25", "alinhamento", -1, "Voc\xEA apoia o governo Lula?", "O candidato apoia o governo Lula? (cite o que defende do governo)"),
  q(
    "q26",
    "alinhamento",
    1,
    "Voc\xEA defende as pautas da fam\xEDlia Bolsonaro?",
    "O candidato defende pautas ou a\xE7\xF5es da fam\xEDlia Bolsonaro? (cite o que defende)"
  ),
  q(
    "q27",
    "alinhamento",
    1,
    "Voc\xEA \xE9 a favor da anistia aos condenados pelos atos de 8 de janeiro?",
    "O candidato \xE9 a favor da anistia aos condenados pelos atos de 8 de janeiro?"
  ),
  q("q28", "alinhamento", -1, "Voc\xEA aprova a pol\xEDtica externa do atual governo?", "O candidato aprova a pol\xEDtica externa do atual governo?"),
  q(
    "q29",
    "alinhamento",
    1,
    "Voc\xEA \xE9 a favor de que Jair Bolsonaro possa voltar a disputar elei\xE7\xF5es?",
    "O candidato \xE9 a favor de que Jair Bolsonaro possa voltar a disputar elei\xE7\xF5es?"
  ),
  q(
    "q30",
    "alinhamento",
    1,
    "O Brasil deveria se aproximar mais dos EUA do que do bloco BRICS?",
    "O candidato defende que o Brasil se aproxime mais dos EUA do que do bloco BRICS?"
  )
];
var PERGUNTAS_POR_ID = Object.fromEntries(PERGUNTAS.map((p) => [p.id, p]));

// src/lib/scoring.ts
var MIN_COMPARADAS = 1;
function compatibilidade(quiz, alvo, polemicas = []) {
  let pesoTotalUsuario = 0;
  let pesoOk = 0;
  let comparadas = 0;
  let respondidas = 0;
  const conflitos = [];
  for (const p of PERGUNTAS) {
    const u = quiz.respostas[p.id];
    if (!u || u.r === "pular") continue;
    respondidas++;
    const peso = u.imp ? 3 : 1;
    pesoTotalUsuario += peso;
    const a = alvo[p.id];
    if (!a || a.resposta === "sem_info") continue;
    comparadas++;
    if (u.r === a.resposta) pesoOk += peso;
    else if (u.imp) conflitos.push({ id: p.id, motivo: `Diverge em algo inegoci\xE1vel: ${p.usuario}` });
  }
  if (quiz.eticaEliminatoria && polemicas.some((x) => x.status === "condenado" && x.categoria === "corrupcao")) {
    conflitos.push({ id: "etica", motivo: "Tem condena\xE7\xE3o por corrup\xE7\xE3o registrada" });
  }
  const minimo = MIN_COMPARADAS;
  return {
    pct: comparadas >= minimo ? Math.round(100 * pesoOk / pesoTotalUsuario) : null,
    comparadas,
    respondidas,
    minimo,
    conflitos
  };
}

// server/espectro.ts
import crypto2 from "node:crypto";

// src/lib/espectro.ts
var CONTEXTO_ESPECTRO = "Question\xE1rio de posicionamento pol\xEDtico de eleitores brasileiros, em 2026. No Brasil, a esquerda \xE9 o campo do PT e do governo Lula (mais Estado, redistribui\xE7\xE3o, pautas progressistas, garantismo penal). A direita \xE9 o campo bolsonarista, liberal e conservador (menos Estado e impostos, valores conservadores, rigor penal, armas, cr\xEDticas ao STF, defesa de Bolsonaro e da anistia aos condenados de 8 de janeiro, alinhamento com os EUA). Classifique a posi\xE7\xE3o que a resposta representa nesse debate, n\xE3o o que \xE9 moralmente certo.";
var NIVEIS_ESPECTRO = [
  "Posi\xE7\xE3o de esquerda: defende mais Estado, redistribui\xE7\xE3o, pautas progressistas ou o campo pol\xEDtico de esquerda",
  "Posi\xE7\xE3o de centro: n\xE3o se associa claramente \xE0 esquerda nem \xE0 direita, ou \xE9 consenso entre os dois campos",
  "Posi\xE7\xE3o de direita: defende mercado livre, valores conservadores, rigor penal ou o campo pol\xEDtico de direita"
];
function instrucaoEspectro(p, resposta) {
  return `Um eleitor brasileiro respondeu "${resposta === "sim" ? "Sim" : "N\xE3o"}" \xE0 pergunta: "${p.usuario}". No debate pol\xEDtico brasileiro atual, essa resposta \xE9 uma posi\xE7\xE3o de esquerda, de centro ou de direita?`;
}

// server/espectro.ts
var RESPOSTAS = ["sim", "nao"];
var ESPERA_APOS_FALHA_MS = 6e4;
var proximaTentativa = 0;
var assinatura = (instrucao) => crypto2.createHash("sha1").update(JSON.stringify([CONTEXTO_ESPECTRO, NIVEIS_ESPECTRO, instrucao])).digest("hex");
async function julgar(pendentes) {
  const r = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "jev-latest",
      state: { contexto: CONTEXTO_ESPECTRO },
      questions: Object.fromEntries(pendentes.map((p) => [p.chave, { type: "score", instructions: p.instrucao, criteria: NIVEIS_ESPECTRO }]))
    })
  });
  if (!r.ok) throw new Error(`TypeSafe respondeu ${r.status}`);
  const j = await r.json();
  return Object.fromEntries(pendentes.map((p) => [p.chave, j.answers[p.chave].score]));
}
async function tabelaEspectro() {
  const guardados = await all("SELECT chave, assinatura, score FROM espectro_respostas");
  const porChave = new Map(guardados.map((g) => [g.chave, g]));
  const pendentes = [];
  for (const p of PERGUNTAS) {
    for (const resposta of RESPOSTAS) {
      const chave = `${p.id}_${resposta}`;
      const instrucao = instrucaoEspectro(p, resposta);
      const ass = assinatura(instrucao);
      if (porChave.get(chave)?.assinatura !== ass) pendentes.push({ chave, instrucao, assinatura: ass });
    }
  }
  if (pendentes.length && process.env.TYPESAFE_API_KEY && Date.now() >= proximaTentativa) {
    try {
      const scores = await julgar(pendentes);
      for (const p of pendentes) {
        await run("INSERT OR REPLACE INTO espectro_respostas (chave, assinatura, score) VALUES (?, ?, ?)", [p.chave, p.assinatura, scores[p.chave]]);
        porChave.set(p.chave, { chave: p.chave, assinatura: p.assinatura, score: scores[p.chave] });
      }
    } catch (e) {
      console.error("Falha ao consultar o TypeSafe:", e);
      proximaTentativa = Date.now() + ESPERA_APOS_FALHA_MS;
    }
  }
  const tabela = {};
  for (const p of PERGUNTAS) {
    const sim = porChave.get(`${p.id}_sim`);
    const nao = porChave.get(`${p.id}_nao`);
    if (sim && nao) tabela[p.id] = { sim: sim.score, nao: nao.score };
  }
  return tabela;
}

// server/app.ts
var PORT = Number(process.env.PORT ?? 4310);
var PUBLIC_URL2 = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
var CARGOS = ["presidente", "governador", "senador", "deputado_federal", "deputado_estadual"];
var EMPTY_QUIZ = { respostas: {}, eticaEliminatoria: null };
var EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function texto(v, campo) {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `${campo} \xE9 obrigat\xF3rio`);
  return v.trim();
}
function opcional(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function lerEmail(v) {
  const email = texto(v, "Email").toLowerCase();
  if (!EMAIL_REGEX.test(email)) throw new HttpError(400, "Email inv\xE1lido");
  return email;
}
function idParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "id inv\xE1lido");
  return id;
}
function lerCandidato(body) {
  const cargo = texto(body.cargo, "Cargo");
  if (!CARGOS.includes(cargo)) throw new HttpError(400, "Cargo inv\xE1lido");
  const uf = cargo === "presidente" ? "BR" : texto(body.uf, "Estado").toUpperCase();
  const partyId = body.partyId == null ? null : Number(body.partyId);
  return { nome: texto(body.nome, "Nome"), cargo, uf, partyId, foto: opcional(body.foto) };
}
async function quizDoUsuario(userId) {
  const q2 = await get("SELECT dados FROM quiz WHERE user_id = ?", [userId]);
  return q2 ? JSON.parse(q2.dados) : EMPTY_QUIZ;
}
async function listarTudoCompleto(userId) {
  const parties = await all("SELECT id, sigla, nome, logo FROM parties ORDER BY sigla");
  const candidates = await all("SELECT id, nome, cargo, uf, party_id AS partyId, foto FROM candidates ORDER BY nome");
  const research = (await all(
    "SELECT id, tipo, entidade_id AS entidadeId, criado_em AS criadoEm, ativa, dados FROM research ORDER BY id DESC"
  )).map((r) => ({ ...r, ativa: r.ativa === 1, dados: JSON.parse(r.dados) }));
  return { parties, candidates, research, quiz: await quizDoUsuario(userId) };
}
async function compatDosPartidos(userId, quiz) {
  const guardadas = await all("SELECT party_id AS partyId, dados FROM party_compat WHERE user_id = ?", [userId]);
  const mapa = new Map(guardadas.map((g) => [g.partyId, JSON.parse(g.dados)]));
  const pesquisas = await all(
    "SELECT entidade_id AS entidadeId, dados FROM research WHERE tipo = 'partido' AND ativa = 1"
  );
  for (const p of pesquisas) {
    if (mapa.has(p.entidadeId)) continue;
    const compat = compatibilidade(quiz, JSON.parse(p.dados).quiz);
    mapa.set(p.entidadeId, compat);
    await run("INSERT OR REPLACE INTO party_compat (user_id, party_id, dados) VALUES (?, ?, ?)", [userId, p.entidadeId, JSON.stringify(compat)]);
  }
  return mapa;
}
async function pesquisaAtivaDoPartido(partyId) {
  const r = await get(
    "SELECT id, criado_em AS criadoEm, dados FROM research WHERE tipo = 'partido' AND entidade_id = ? AND ativa = 1",
    [partyId]
  );
  return r ? { id: r.id, tipo: "partido", entidadeId: partyId, criadoEm: r.criadoEm, ativa: true, dados: JSON.parse(r.dados) } : void 0;
}
var chaveGrupo = (cargo, uf) => `${cargo}:${uf}`;
function montarItensRankeados(linhas, quiz) {
  const itens = linhas.map((l) => {
    const dados = l.pesquisaDados ? JSON.parse(l.pesquisaDados) : null;
    const compat = dados ? compatibilidade(quiz, dados.quiz, dados.polemicas) : null;
    return {
      cand: { id: l.id, nome: l.nome, cargo: l.cargo, uf: l.uf, partyId: l.partyId, foto: l.foto },
      pesquisa: l.pesquisaId != null ? { id: l.pesquisaId, tipo: "candidato", entidadeId: l.id, criadoEm: l.pesquisaCriadoEm, ativa: l.pesquisaAtiva === 1, dados } : void 0,
      compat,
      conflito: !!compat && compat.conflitos.length > 0,
      rank: null,
      totalGrupo: 0
    };
  });
  const grupos = /* @__PURE__ */ new Map();
  for (const it of itens) {
    if (it.compat?.pct == null || it.conflito) continue;
    const k = chaveGrupo(it.cand.cargo, it.cand.uf);
    grupos.set(k, [...grupos.get(k) ?? [], it]);
  }
  for (const membros of grupos.values()) {
    membros.sort((a, b) => b.compat.pct - a.compat.pct || a.cand.nome.localeCompare(b.cand.nome));
    membros.forEach((m, i) => {
      m.rank = i + 1;
      m.totalGrupo = membros.length;
    });
  }
  return itens;
}
function ordenarItens(itens, ordem) {
  if (ordem === "nome") return [...itens].sort((a, b) => a.cand.nome.localeCompare(b.cand.nome));
  const peso = (i) => i.conflito ? 2 : i.compat?.pct != null ? 0 : 1;
  return [...itens].sort((a, b) => peso(a) - peso(b) || (b.compat?.pct ?? 0) - (a.compat?.pct ?? 0) || a.cand.nome.localeCompare(b.cand.nome));
}
var cacheOpcoesColinha = /* @__PURE__ */ new Map();
function invalidarCacheColinha() {
  cacheOpcoesColinha.clear();
}
var api = express.Router();
api.post("/auth/register", async (req, res) => {
  const username = texto(req.body.username, "Usu\xE1rio").toLowerCase();
  const email = lerEmail(req.body.email);
  const senha = texto(req.body.password, "Senha");
  if (senha.length < 6) throw new HttpError(400, "A senha precisa ter pelo menos 6 caracteres");
  const { n } = await get("SELECT COUNT(*) AS n FROM users");
  const isAdmin = n === 0;
  let userId;
  try {
    const r = await run("INSERT INTO users (username, email, password_hash, is_admin, criado_em) VALUES (?, ?, ?, ?, ?)", [
      username,
      email,
      hashSenha(senha),
      isAdmin ? 1 : 0,
      (/* @__PURE__ */ new Date()).toISOString()
    ]);
    userId = Number(r.lastInsertRowid);
  } catch {
    throw new HttpError(409, "Esse nome de usu\xE1rio ou email j\xE1 est\xE1 em uso");
  }
  if (isAdmin && quizLegado) {
    await run("INSERT INTO quiz (user_id, dados) VALUES (?, ?)", [userId, quizLegado]);
  }
  await criarSessao(res, userId);
  res.json({ id: userId, username, email, isAdmin });
});
api.post("/auth/login", async (req, res) => {
  const identificador = texto(req.body.identificador, "Usu\xE1rio ou email").toLowerCase();
  const senha = texto(req.body.password, "Senha");
  const u = await get(
    "SELECT id, username, email, password_hash, is_admin AS isAdmin FROM users WHERE username = ? OR email = ?",
    [identificador, identificador]
  );
  if (!u || !conferirSenha(senha, u.password_hash)) throw new HttpError(401, "Usu\xE1rio/email ou senha incorretos");
  await criarSessao(res, u.id);
  res.json({ id: u.id, username: u.username, email: u.email, isAdmin: u.isAdmin === 1 });
});
api.post("/auth/google", async (req, res) => {
  const accessToken = texto(req.body.accessToken, "accessToken");
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new HttpError(500, "Login com Google n\xE3o est\xE1 configurado");
  const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) throw new HttpError(401, "Token do Google inv\xE1lido ou expirado");
  const payload = await r.json();
  if (!payload.email || !payload.email_verified) throw new HttpError(401, "Email do Google n\xE3o verificado");
  const email = payload.email.toLowerCase();
  const existente = await get(
    "SELECT id, username, email, is_admin AS isAdmin FROM users WHERE email = ?",
    [email]
  );
  let usuarioFinal;
  if (existente) {
    usuarioFinal = existente;
  } else {
    const { n } = await get("SELECT COUNT(*) AS n FROM users");
    const isAdmin = n === 0;
    const base = email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").toLowerCase() || "usuario";
    let username = base;
    let sufixo = 1;
    while (await get("SELECT id FROM users WHERE username = ?", [username])) {
      username = `${base}${++sufixo}`;
    }
    const senhaAleatoria = hashSenha(crypto3.randomBytes(32).toString("hex"));
    const novo = await run("INSERT INTO users (username, email, password_hash, is_admin, criado_em) VALUES (?, ?, ?, ?, ?)", [
      username,
      email,
      senhaAleatoria,
      isAdmin ? 1 : 0,
      (/* @__PURE__ */ new Date()).toISOString()
    ]);
    const userId = Number(novo.lastInsertRowid);
    if (isAdmin && quizLegado) await run("INSERT INTO quiz (user_id, dados) VALUES (?, ?)", [userId, quizLegado]);
    usuarioFinal = { id: userId, username, email, isAdmin: isAdmin ? 1 : 0 };
  }
  await criarSessao(res, usuarioFinal.id);
  res.json({ id: usuarioFinal.id, username: usuarioFinal.username, email: usuarioFinal.email, isAdmin: usuarioFinal.isAdmin === 1 });
});
api.post("/auth/logout", async (req, res) => {
  await encerrarSessao(req, res);
  res.json({ ok: true });
});
api.get("/auth/me", async (req, res) => {
  const sessao = await lerSessao(req);
  if (!sessao) {
    res.status(401).json({ erro: "N\xE3o autenticado" });
    return;
  }
  res.json({ id: sessao.userId, username: sessao.username, email: sessao.email, isAdmin: sessao.isAdmin });
});
api.post("/auth/forgot-password", async (req, res) => {
  const email = lerEmail(req.body.email);
  const u = await get("SELECT id FROM users WHERE email = ?", [email]);
  if (u) {
    const token = await criarTokenReset(u.id);
    const link = `${PUBLIC_URL2}/redefinir-senha?token=${token}`;
    try {
      await enviarEmail(email, "Redefinir senha \u2014 Capivara Pol\xEDtica", emailRecuperacaoHtml(link));
    } catch (e) {
      console.error("Falha ao enviar email de recupera\xE7\xE3o:", e);
    }
  }
  res.json({ ok: true });
});
api.post("/auth/reset-password", async (req, res) => {
  const token = texto(req.body.token, "Token");
  const novaSenha = texto(req.body.novaSenha, "Senha");
  if (novaSenha.length < 6) throw new HttpError(400, "A senha precisa ter pelo menos 6 caracteres");
  const valido = await validarTokenReset(token);
  if (!valido) throw new HttpError(400, "Link inv\xE1lido ou expirado. Pe\xE7a uma nova recupera\xE7\xE3o de senha.");
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [hashSenha(novaSenha), valido.userId]);
  await consumirTokenReset(token);
  await run("DELETE FROM sessions WHERE user_id = ?", [valido.userId]);
  res.json({ ok: true });
});
api.get("/colinha/:token", async (req, res) => {
  const r = await get("SELECT itens, atualizado_em AS atualizadoEm FROM colinhas WHERE token = ?", [
    req.params.token
  ]);
  if (!r) throw new HttpError(404, "Colinha n\xE3o encontrada");
  res.json({ itens: JSON.parse(r.itens), atualizadoEm: r.atualizadoEm });
});
api.use(exigirLogin);
api.post("/auth/change-password", async (req, res) => {
  const senhaAtual = texto(req.body.senhaAtual, "Senha atual");
  const novaSenha = texto(req.body.novaSenha, "Nova senha");
  if (novaSenha.length < 6) throw new HttpError(400, "A nova senha precisa ter pelo menos 6 caracteres");
  const s = usuario(req);
  const u = await get("SELECT password_hash FROM users WHERE id = ?", [s.userId]);
  if (!conferirSenha(senhaAtual, u.password_hash)) throw new HttpError(401, "Senha atual incorreta");
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [hashSenha(novaSenha), s.userId]);
  await run("DELETE FROM sessions WHERE user_id = ? AND token != ?", [s.userId, tokenAtual(req)]);
  res.json({ ok: true });
});
api.get("/admin/users", exigirAdmin, async (_req, res) => {
  const usuarios = await all(
    "SELECT id, username, email, is_admin AS isAdmin, criado_em AS criadoEm FROM users ORDER BY username"
  );
  res.json(usuarios.map((u) => ({ ...u, isAdmin: u.isAdmin === 1 })));
});
api.post("/admin/users", exigirAdmin, async (req, res) => {
  const username = texto(req.body.username, "Usu\xE1rio").toLowerCase();
  const email = lerEmail(req.body.email);
  const senha = texto(req.body.password, "Senha");
  if (senha.length < 6) throw new HttpError(400, "A senha precisa ter pelo menos 6 caracteres");
  let userId;
  try {
    const r = await run("INSERT INTO users (username, email, password_hash, is_admin, criado_em) VALUES (?, ?, ?, 1, ?)", [
      username,
      email,
      hashSenha(senha),
      (/* @__PURE__ */ new Date()).toISOString()
    ]);
    userId = Number(r.lastInsertRowid);
  } catch {
    throw new HttpError(409, "Esse nome de usu\xE1rio ou email j\xE1 est\xE1 em uso");
  }
  res.json({ id: userId, username, email, isAdmin: true });
});
api.post("/admin/users/:id/promote", exigirAdmin, async (req, res) => {
  const id = idParam(req);
  const r = await run("UPDATE users SET is_admin = 1 WHERE id = ?", [id]);
  if (r.changes === 0) throw new HttpError(404, "Usu\xE1rio n\xE3o encontrado");
  res.json({ ok: true });
});
api.post("/feedback", async (req, res) => {
  const mensagem = texto(req.body.mensagem, "Mensagem");
  await run("INSERT INTO feedback (user_id, mensagem, criado_em) VALUES (?, ?, ?)", [
    usuario(req).userId,
    mensagem,
    (/* @__PURE__ */ new Date()).toISOString()
  ]);
  res.json({ ok: true });
});
api.get("/feedback", exigirAdmin, async (_req, res) => {
  const lista = await all(
    `SELECT f.id, f.mensagem, f.criado_em AS criadoEm, u.username, u.email
     FROM feedback f JOIN users u ON u.id = f.user_id
     ORDER BY f.id DESC`
  );
  res.json(lista);
});
api.get("/espectro-respostas", async (_req, res) => {
  res.json(await tabelaEspectro());
});
api.get("/data", async (req, res) => {
  res.json({ quiz: await quizDoUsuario(usuario(req).userId) });
});
api.get("/contagens", exigirAdmin, async (_req, res) => {
  const candidatos = (await get("SELECT COUNT(*) AS n FROM candidates")).n;
  const pesquisas = (await get("SELECT COUNT(*) AS n FROM research")).n;
  const partidos = (await get("SELECT COUNT(*) AS n FROM parties")).n;
  res.json({ candidatos, pesquisas, partidos });
});
api.get("/partidos", async (req, res) => {
  const userId = usuario(req).userId;
  const [partidos, contagens, compats] = await Promise.all([
    all("SELECT id, sigla, nome, logo FROM parties ORDER BY sigla"),
    all("SELECT party_id AS partyId, COUNT(*) AS n FROM candidates WHERE party_id IS NOT NULL GROUP BY party_id"),
    quizDoUsuario(userId).then((quiz) => compatDosPartidos(userId, quiz))
  ]);
  const porPartido = new Map(contagens.map((c) => [c.partyId, c.n]));
  res.json(
    partidos.map((p) => ({ ...p, candidatosCount: porPartido.get(p.id) ?? 0, compat: compats.get(p.id) ?? null, pesquisado: compats.has(p.id) }))
  );
});
api.get("/partidos-opcoes", async (_req, res) => {
  res.json(await all("SELECT id, sigla, nome, logo FROM parties ORDER BY sigla"));
});
api.get("/partidos/:id", async (req, res) => {
  const id = idParam(req);
  const party = await get(
    "SELECT p.id, p.sigla, p.nome, p.logo, (SELECT COUNT(*) FROM candidates c WHERE c.party_id = p.id) AS candidatosCount FROM parties p WHERE p.id = ?",
    [id]
  );
  if (!party) throw new HttpError(404, "Partido n\xE3o encontrado");
  const userId = usuario(req).userId;
  const compats = await compatDosPartidos(userId, await quizDoUsuario(userId));
  res.json({ party, pesquisa: await pesquisaAtivaDoPartido(id), compat: compats.get(id) ?? null });
});
var LIMITE_CALCULO_COMPLETO = 1500;
api.get("/candidatos", async (req, res) => {
  const { cargo, uf, partido, busca, ordem, top3 } = req.query;
  const condicoes = [];
  const args = [];
  if (typeof cargo === "string" && cargo) {
    condicoes.push("c.cargo = ?");
    args.push(cargo);
  }
  if (typeof uf === "string" && uf) {
    condicoes.push("c.uf = ?");
    args.push(uf);
  }
  if (typeof partido === "string" && partido) {
    condicoes.push("c.party_id = ?");
    args.push(Number(partido));
  }
  if (typeof busca === "string" && busca.trim()) {
    condicoes.push("LOWER(c.nome) LIKE ?");
    args.push(`%${busca.trim().toLowerCase()}%`);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const quiz = await quizDoUsuario(usuario(req).userId);
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const limitParam = req.query.limit;
  const partiesRows = await all("SELECT id, sigla, nome, logo FROM parties");
  const partidosPorId = new Map(partiesRows.map((p) => [p.id, p]));
  const montarLeve = (it) => ({
    cand: it.cand,
    party: it.cand.partyId != null ? partidosPorId.get(it.cand.partyId) : void 0,
    compat: it.compat,
    conflito: it.conflito,
    rank: it.rank,
    totalGrupo: it.totalGrupo,
    temPesquisa: !!it.pesquisa,
    numeroUrna: it.pesquisa?.dados.basico.numero_urna ?? null,
    situacao: it.pesquisa?.dados.basico.situacao ?? null
  });
  const { n: totalFiltrado } = await get(`SELECT COUNT(*) AS n FROM candidates c ${where}`, args);
  if (totalFiltrado > LIMITE_CALCULO_COMPLETO) {
    const linhasPagina = await all(
      `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto FROM candidates c ${where} ORDER BY c.nome LIMIT ? OFFSET ?`,
      [...args, Number(limitParam) || LIMITE_CALCULO_COMPLETO, offset]
    );
    const ids = linhasPagina.map((l) => l.id);
    const pesquisas = ids.length ? await all(
      `SELECT entidade_id AS entidadeId, id, criado_em AS criadoEm, ativa, dados FROM research
           WHERE tipo = 'candidato' AND ativa = 1 AND entidade_id IN (${ids.map(() => "?").join(",")})`,
      ids
    ) : [];
    const pesquisaPorCandidato = new Map(pesquisas.map((p) => [p.entidadeId, p]));
    const leve = linhasPagina.map((l) => {
      const p = pesquisaPorCandidato.get(l.id);
      const dados = p ? JSON.parse(p.dados) : null;
      const compat = dados ? compatibilidade(quiz, dados.quiz, dados.polemicas) : null;
      return {
        cand: { id: l.id, nome: l.nome, cargo: l.cargo, uf: l.uf, partyId: l.partyId, foto: l.foto },
        party: l.partyId != null ? partidosPorId.get(l.partyId) : void 0,
        compat,
        conflito: !!compat && compat.conflitos.length > 0,
        rank: null,
        totalGrupo: 0,
        temPesquisa: !!p,
        numeroUrna: dados?.basico.numero_urna ?? null,
        situacao: dados?.basico.situacao ?? null
      };
    });
    res.json({ total: totalFiltrado, itens: leve });
    return;
  }
  const linhas = await all(
    `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto,
            r.id AS pesquisaId, r.criado_em AS pesquisaCriadoEm, r.ativa AS pesquisaAtiva, r.dados AS pesquisaDados
     FROM candidates c
     LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
     ${where}`,
    args
  );
  let itens = montarItensRankeados(linhas, quiz);
  if (top3 === "1" || top3 === "true") itens = itens.filter((i) => i.rank != null && i.rank <= 3);
  itens = ordenarItens(itens, typeof ordem === "string" ? ordem : "compat");
  const total = itens.length;
  const pagina = typeof limitParam === "string" && limitParam ? itens.slice(offset, offset + Number(limitParam)) : itens;
  res.json({ total, itens: pagina.map(montarLeve) });
});
api.get("/candidatos/:id", async (req, res) => {
  const id = idParam(req);
  const [l, quiz] = await Promise.all([
    get(
      `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto,
              p.sigla AS pSigla, p.nome AS pNome, p.logo AS pLogo,
              r.id AS pesquisaId, r.criado_em AS pesquisaCriadoEm, r.ativa AS pesquisaAtiva, r.dados AS pesquisaDados
       FROM candidates c
       LEFT JOIN parties p ON p.id = c.party_id
       LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
       WHERE c.id = ?`,
      [id]
    ),
    quizDoUsuario(usuario(req).userId)
  ]);
  if (!l) throw new HttpError(404, "Candidato n\xE3o encontrado");
  const dados = l.pesquisaDados ? JSON.parse(l.pesquisaDados) : null;
  const compat = dados ? compatibilidade(quiz, dados.quiz, dados.polemicas) : null;
  res.json({
    cand: { id: l.id, nome: l.nome, cargo: l.cargo, uf: l.uf, partyId: l.partyId, foto: l.foto },
    party: l.partyId != null ? { id: l.partyId, sigla: l.pSigla, nome: l.pNome, logo: l.pLogo } : void 0,
    pesquisa: l.pesquisaId != null ? { id: l.pesquisaId, tipo: "candidato", entidadeId: id, criadoEm: l.pesquisaCriadoEm, ativa: l.pesquisaAtiva === 1, dados } : void 0,
    compat,
    conflito: !!compat && compat.conflitos.length > 0
  });
});
api.get("/candidatos/:id/ranking", async (req, res) => {
  const id = idParam(req);
  const [linhas, quiz] = await Promise.all([
    all(
      `SELECT c.id, c.nome, json_extract(r.dados, '$.quiz') AS quiz, json_extract(r.dados, '$.polemicas') AS polemicas
       FROM candidates c
       LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
       WHERE c.cargo = (SELECT cargo FROM candidates WHERE id = ?) AND c.uf = (SELECT uf FROM candidates WHERE id = ?)`,
      [id, id]
    ),
    quizDoUsuario(usuario(req).userId)
  ]);
  if (!linhas.some((l) => l.id === id)) throw new HttpError(404, "Candidato n\xE3o encontrado");
  const classificaveis = [];
  for (const l of linhas) {
    if (!l.quiz) continue;
    const compat = compatibilidade(quiz, JSON.parse(l.quiz), l.polemicas ? JSON.parse(l.polemicas) : []);
    if (compat.pct != null && compat.conflitos.length === 0) classificaveis.push({ id: l.id, nome: l.nome, pct: compat.pct });
  }
  classificaveis.sort((a, b) => b.pct - a.pct || a.nome.localeCompare(b.nome));
  const posicao = classificaveis.findIndex((c) => c.id === id);
  res.json(posicao >= 0 ? { rank: posicao + 1, totalGrupo: classificaveis.length } : { rank: null, totalGrupo: 0 });
});
api.get("/colinha-opcoes", async (req, res) => {
  const { cargo, uf } = req.query;
  const chave = `${typeof cargo === "string" ? cargo : ""}:${typeof uf === "string" ? uf : ""}`;
  const emCache = cacheOpcoesColinha.get(chave);
  if (emCache) {
    res.json(emCache);
    return;
  }
  const condicoes = [];
  const args = [];
  if (typeof cargo === "string" && cargo) {
    condicoes.push("c.cargo = ?");
    args.push(cargo);
  }
  if (typeof uf === "string" && uf) {
    condicoes.push("c.uf = ?");
    args.push(uf);
  }
  const where = condicoes.length ? `WHERE ${condicoes.join(" AND ")}` : "";
  const linhas = await all(
    `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto, r.dados AS dados
     FROM candidates c
     LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
     ${where}
     ORDER BY c.nome`,
    args
  );
  const opcoes = linhas.map((l) => ({
    id: l.id,
    nome: l.nome,
    cargo: l.cargo,
    uf: l.uf,
    partyId: l.partyId,
    foto: l.foto,
    numeroUrna: l.dados ? JSON.parse(l.dados).basico?.numero_urna ?? null : null
  }));
  cacheOpcoesColinha.set(chave, opcoes);
  res.json(opcoes);
});
api.get("/colinha-melhores", async (req, res) => {
  const uf = typeof req.query.uf === "string" ? req.query.uf : "";
  if (!uf) throw new HttpError(400, "uf \xE9 obrigat\xF3rio");
  const quiz = await quizDoUsuario(usuario(req).userId);
  const linhasComum = (where, args) => all(
    `SELECT c.id, c.nome, c.cargo, c.uf, c.party_id AS partyId, c.foto,
              r.id AS pesquisaId, r.criado_em AS pesquisaCriadoEm, r.ativa AS pesquisaAtiva, r.dados AS pesquisaDados
       FROM candidates c
       LEFT JOIN research r ON r.entidade_id = c.id AND r.tipo = 'candidato' AND r.ativa = 1
       ${where}`,
    args
  );
  const [linhasUf, linhasPresidente] = await Promise.all([
    linhasComum("WHERE c.uf = ? AND c.cargo != 'presidente'", [uf]),
    linhasComum("WHERE c.cargo = 'presidente'", [])
  ]);
  const itensUf = montarItensRankeados(linhasUf, quiz);
  const itensPresidente = montarItensRankeados(linhasPresidente, quiz);
  const melhoresDoCargo = (itens, cargo, quantos) => {
    const validos = itens.filter((i) => i.cand.cargo === cargo && i.compat?.pct != null && !i.conflito);
    validos.sort((a, b) => b.compat.pct - a.compat.pct);
    return validos.slice(0, quantos).map((i) => ({ id: i.cand.id, pct: i.compat.pct }));
  };
  res.json({
    presidente: melhoresDoCargo(itensPresidente, "presidente", 1),
    governador: melhoresDoCargo(itensUf, "governador", 1),
    senador: melhoresDoCargo(itensUf, "senador", 2),
    deputado_federal: melhoresDoCargo(itensUf, "deputado_federal", 1),
    deputado_estadual: melhoresDoCargo(itensUf, "deputado_estadual", 1)
  });
});
api.get("/candidato-compat/:id", async (req, res) => {
  const id = idParam(req);
  const pesquisa = await get(
    "SELECT dados FROM research WHERE tipo = 'candidato' AND entidade_id = ? AND ativa = 1",
    [id]
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
api.get("/research", async (req, res) => {
  const { tipo, entidadeId } = req.query;
  if (tipo !== "candidato" && tipo !== "partido") throw new HttpError(400, "Tipo inv\xE1lido");
  const id = Number(entidadeId);
  if (!Number.isInteger(id)) throw new HttpError(400, "entidadeId inv\xE1lido");
  const lista = (await all(
    "SELECT id, tipo, entidade_id AS entidadeId, criado_em AS criadoEm, ativa, dados FROM research WHERE tipo = ? AND entidade_id = ? ORDER BY id DESC",
    [tipo, id]
  )).map((r) => ({ ...r, ativa: r.ativa === 1, dados: JSON.parse(r.dados) }));
  res.json(lista);
});
api.post("/parties", exigirAdmin, async (req, res) => {
  const sigla = texto(req.body.sigla, "Sigla").toUpperCase();
  const nome = texto(req.body.nome, "Nome");
  try {
    const r = await run("INSERT INTO parties (sigla, nome, logo) VALUES (?, ?, ?)", [sigla, nome, opcional(req.body.logo)]);
    res.json({ id: Number(r.lastInsertRowid) });
  } catch {
    throw new HttpError(409, `J\xE1 existe um partido com a sigla ${sigla}`);
  }
});
api.put("/parties/:id", exigirAdmin, async (req, res) => {
  const sigla = texto(req.body.sigla, "Sigla").toUpperCase();
  try {
    await run("UPDATE parties SET sigla = ?, nome = ?, logo = ? WHERE id = ?", [
      sigla,
      texto(req.body.nome, "Nome"),
      opcional(req.body.logo),
      idParam(req)
    ]);
  } catch {
    throw new HttpError(409, `J\xE1 existe um partido com a sigla ${sigla}`);
  }
  res.json({ ok: true });
});
api.delete("/parties/:id", exigirAdmin, async (req, res) => {
  const id = idParam(req);
  const uso = await get("SELECT COUNT(*) AS n FROM candidates WHERE party_id = ?", [id]);
  if (uso.n > 0) throw new HttpError(409, "H\xE1 candidatos usando este partido. Remova ou troque o partido deles antes.");
  await transaction(async (t) => {
    await t.run("DELETE FROM research WHERE tipo = 'partido' AND entidade_id = ?", [id]);
    await t.run("DELETE FROM party_compat WHERE party_id = ?", [id]);
    await t.run("DELETE FROM parties WHERE id = ?", [id]);
  });
  res.json({ ok: true });
});
api.post("/candidates", exigirAdmin, async (req, res) => {
  const c = lerCandidato(req.body);
  const r = await run("INSERT INTO candidates (nome, cargo, uf, party_id, foto) VALUES (?, ?, ?, ?, ?)", [
    c.nome,
    c.cargo,
    c.uf,
    c.partyId,
    c.foto
  ]);
  invalidarCacheColinha();
  res.json({ id: Number(r.lastInsertRowid) });
});
api.put("/candidates/:id", exigirAdmin, async (req, res) => {
  const c = lerCandidato(req.body);
  await run("UPDATE candidates SET nome = ?, cargo = ?, uf = ?, party_id = ?, foto = ? WHERE id = ?", [
    c.nome,
    c.cargo,
    c.uf,
    c.partyId,
    c.foto,
    idParam(req)
  ]);
  invalidarCacheColinha();
  res.json({ ok: true });
});
api.delete("/candidates/:id", exigirAdmin, async (req, res) => {
  const id = idParam(req);
  await transaction(async (t) => {
    await t.run("DELETE FROM research WHERE tipo = 'candidato' AND entidade_id = ?", [id]);
    await t.run("DELETE FROM candidates WHERE id = ?", [id]);
  });
  invalidarCacheColinha();
  res.json({ ok: true });
});
api.post("/research", exigirAdmin, async (req, res) => {
  const tipo = req.body.tipo;
  const entidadeId = Number(req.body.entidadeId);
  if (tipo !== "candidato" && tipo !== "partido") throw new HttpError(400, "Tipo inv\xE1lido");
  if (!Number.isInteger(entidadeId) || typeof req.body.dados !== "object" || req.body.dados === null) {
    throw new HttpError(400, "Pesquisa inv\xE1lida");
  }
  const id = await transaction(async (t) => {
    await t.run("UPDATE research SET ativa = 0 WHERE tipo = ? AND entidade_id = ?", [tipo, entidadeId]);
    const r = await t.run("INSERT INTO research (tipo, entidade_id, criado_em, ativa, dados) VALUES (?, ?, ?, 1, ?)", [
      tipo,
      entidadeId,
      (/* @__PURE__ */ new Date()).toISOString(),
      JSON.stringify(req.body.dados)
    ]);
    if (tipo === "partido") await t.run("DELETE FROM party_compat WHERE party_id = ?", [entidadeId]);
    return Number(r.lastInsertRowid);
  });
  if (tipo === "candidato") invalidarCacheColinha();
  res.json({ id });
});
api.post("/research/:id/activate", exigirAdmin, async (req, res) => {
  const id = idParam(req);
  const r = await get("SELECT tipo, entidade_id AS entidadeId FROM research WHERE id = ?", [id]);
  if (!r) throw new HttpError(404, "Vers\xE3o n\xE3o encontrada");
  await transaction(async (t) => {
    await t.run("UPDATE research SET ativa = 0 WHERE tipo = ? AND entidade_id = ?", [r.tipo, r.entidadeId]);
    await t.run("UPDATE research SET ativa = 1 WHERE id = ?", [id]);
    if (r.tipo === "partido") await t.run("DELETE FROM party_compat WHERE party_id = ?", [r.entidadeId]);
  });
  if (r.tipo === "candidato") invalidarCacheColinha();
  res.json({ ok: true });
});
api.delete("/research/:id", exigirAdmin, async (req, res) => {
  const id = idParam(req);
  const r = await get(
    "SELECT tipo, entidade_id AS entidadeId, ativa FROM research WHERE id = ?",
    [id]
  );
  if (!r) throw new HttpError(404, "Vers\xE3o n\xE3o encontrada");
  await transaction(async (t) => {
    await t.run("DELETE FROM research WHERE id = ?", [id]);
    if (r.ativa === 1) {
      await t.run(
        `UPDATE research SET ativa = 1 WHERE id = (
           SELECT MAX(id) FROM research WHERE tipo = ? AND entidade_id = ?
         )`,
        [r.tipo, r.entidadeId]
      );
    }
    if (r.tipo === "partido") await t.run("DELETE FROM party_compat WHERE party_id = ?", [r.entidadeId]);
  });
  if (r.tipo === "candidato") invalidarCacheColinha();
  res.json({ ok: true });
});
api.put("/quiz", async (req, res) => {
  await run("INSERT INTO quiz (user_id, dados) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET dados = excluded.dados", [
    usuario(req).userId,
    JSON.stringify({
      respostas: req.body.respostas ?? {},
      eticaEliminatoria: req.body.eticaEliminatoria ?? null
    })
  ]);
  await run("DELETE FROM party_compat WHERE user_id = ?", [usuario(req).userId]);
  res.json({ ok: true });
});
api.get("/colinha", async (req, res) => {
  const r = await get(
    "SELECT itens, atualizado_em AS atualizadoEm FROM colinhas WHERE user_id = ?",
    [usuario(req).userId]
  );
  res.json(r ? { itens: JSON.parse(r.itens), atualizadoEm: r.atualizadoEm } : null);
});
api.put("/colinha", async (req, res) => {
  if (!Array.isArray(req.body.itens)) throw new HttpError(400, "Itens inv\xE1lidos");
  const userId = usuario(req).userId;
  const existente = await get("SELECT token FROM colinhas WHERE user_id = ?", [userId]);
  const token = existente?.token ?? crypto3.randomUUID();
  await run(
    `INSERT INTO colinhas (token, user_id, itens, atualizado_em) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET itens = excluded.itens, atualizado_em = excluded.atualizado_em`,
    [token, userId, JSON.stringify(req.body.itens), (/* @__PURE__ */ new Date()).toISOString()]
  );
  res.json({ token });
});
api.get("/export", exigirAdmin, async (req, res) => {
  const tudo = await listarTudoCompleto(usuario(req).userId);
  res.setHeader("Content-Disposition", `attachment; filename="capivara-politica-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json"`);
  res.json({ versao: 1, ...tudo });
});
api.post("/import", exigirAdmin, async (req, res) => {
  const b = req.body;
  if (b?.versao !== 1 || !Array.isArray(b.parties) || !Array.isArray(b.candidates) || !Array.isArray(b.research)) {
    throw new HttpError(400, "Arquivo de backup inv\xE1lido");
  }
  const userId = usuario(req).userId;
  await transaction(async (t) => {
    await t.run("DELETE FROM research");
    await t.run("DELETE FROM party_compat");
    await t.run("DELETE FROM candidates");
    await t.run("DELETE FROM parties");
    for (const p of b.parties) {
      await t.run("INSERT INTO parties (id, sigla, nome, logo) VALUES (?, ?, ?, ?)", [p.id, p.sigla, p.nome, p.logo]);
    }
    for (const c of b.candidates) {
      await t.run("INSERT INTO candidates (id, nome, cargo, uf, party_id, foto) VALUES (?, ?, ?, ?, ?, ?)", [
        c.id,
        c.nome,
        c.cargo,
        c.uf,
        c.partyId,
        c.foto
      ]);
    }
    for (const r of b.research) {
      await t.run("INSERT INTO research (id, tipo, entidade_id, criado_em, ativa, dados) VALUES (?, ?, ?, ?, ?, ?)", [
        r.id,
        r.tipo,
        r.entidadeId,
        r.criadoEm,
        r.ativa ? 1 : 0,
        JSON.stringify(r.dados)
      ]);
    }
    await t.run("DELETE FROM quiz WHERE user_id = ?", [userId]);
    await t.run("INSERT INTO quiz (user_id, dados) VALUES (?, ?)", [userId, JSON.stringify(b.quiz ?? EMPTY_QUIZ)]);
  });
  invalidarCacheColinha();
  res.json({ ok: true });
});
var app = express();
app.use(express.json({ limit: "30mb" }));
app.use("/api", api);
app.use("/api", (_req, res) => {
  res.status(404).json({ erro: "Rota n\xE3o encontrada" });
});
app.use("/api", erroFinal);

// server/serverless.ts
var serverless_default = app;
export {
  serverless_default as default
};
