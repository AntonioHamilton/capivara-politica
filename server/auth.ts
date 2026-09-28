import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { get, run } from './db.ts';

const COOKIE = 'sid';
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;
const DURACAO_RESET_MS = 60 * 60 * 1000;

export interface Sessao {
  userId: number;
  username: string;
  email: string | null;
  isAdmin: boolean;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function conferirSenha(senha: string, armazenado: string): boolean {
  const [salt, hash] = armazenado.split(':');
  if (!salt || !hash) return false;
  const esperado = Buffer.from(hash, 'hex');
  const recebido = crypto.scryptSync(senha, salt, 64);
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

function lerToken(req: Request): string | null {
  const cabecalho = req.headers.cookie;
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const [k, ...resto] = parte.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(resto.join('='));
  }
  return null;
}

export function tokenAtual(req: Request): string | null {
  return lerToken(req);
}

export async function criarSessao(res: Response, userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO sessions (token, user_id, criado_em) VALUES (?, ?, ?)', [token, userId, new Date().toISOString()]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DURACAO_MS,
    path: '/',
  });
}

export async function encerrarSessao(req: Request, res: Response): Promise<void> {
  const token = lerToken(req);
  if (token) await run('DELETE FROM sessions WHERE token = ?', [token]);
  res.clearCookie(COOKIE, { path: '/' });
}

export async function lerSessao(req: Request): Promise<Sessao | null> {
  const token = lerToken(req);
  if (!token) return null;
  const row = await get<{ userId: number; username: string; email: string | null; isAdmin: number }>(
    `SELECT u.id AS userId, u.username AS username, u.email AS email, u.is_admin AS isAdmin
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token],
  );
  return row ? { userId: row.userId, username: row.username, email: row.email, isAdmin: row.isAdmin === 1 } : null;
}

export function usuario(req: Request): Sessao {
  const s = (req as Request & { sessao?: Sessao }).sessao;
  if (!s) throw new HttpError(401, 'Não autenticado');
  return s;
}

export const exigirLogin: RequestHandler = async (req, _res, next) => {
  const sessao = await lerSessao(req);
  if (!sessao) throw new HttpError(401, 'Não autenticado');
  (req as Request & { sessao?: Sessao }).sessao = sessao;
  next();
};

export const exigirAdmin: RequestHandler = (req, _res, next) => {
  if (!usuario(req).isAdmin) throw new HttpError(403, 'Apenas o administrador pode fazer isso');
  next();
};

export function erroFinal(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ erro: status === 500 ? 'Erro interno' : err.message });
}

export async function criarTokenReset(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiraEm = new Date(Date.now() + DURACAO_RESET_MS).toISOString();
  await run('INSERT INTO password_reset_tokens (token, user_id, expira_em, criado_em) VALUES (?, ?, ?, ?)', [
    token,
    userId,
    expiraEm,
    new Date().toISOString(),
  ]);
  return token;
}

export async function validarTokenReset(token: string): Promise<{ userId: number } | null> {
  const row = await get<{ userId: number; expiraEm: string; usado: number }>(
    'SELECT user_id AS userId, expira_em AS expiraEm, usado FROM password_reset_tokens WHERE token = ?',
    [token],
  );
  if (!row || row.usado === 1 || new Date(row.expiraEm).getTime() < Date.now()) return null;
  return { userId: row.userId };
}

export async function consumirTokenReset(token: string): Promise<void> {
  await run('UPDATE password_reset_tokens SET usado = 1 WHERE token = ?', [token]);
}
