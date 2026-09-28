import type { Cargo, Data, QuizState } from './types.ts';

async function req<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ erro: r.statusText }));
    throw new Error(e.erro ?? 'Erro na requisição');
  }
  return r.json();
}

export interface CandidatoInput {
  nome: string;
  cargo: Cargo;
  uf: string;
  partyId: number | null;
  foto: string | null;
}

export interface PartidoInput {
  sigla: string;
  nome: string;
  logo: string | null;
}

export interface UsuarioInfo {
  id: number;
  username: string;
  email: string | null;
  isAdmin: boolean;
  criadoEm: string;
}

export interface NovoAdminInput {
  username: string;
  email: string;
  password: string;
}

export interface FeedbackInfo {
  id: number;
  mensagem: string;
  criadoEm: string;
  username: string;
  email: string | null;
}

export interface ColinhaItemPublico {
  cargo: Cargo;
  uf: string;
  vaga: number | null;
  nome: string;
  numero: string | null;
  foto: string | null;
  partido: string | null;
}

export interface ColinhaPublica {
  itens: ColinhaItemPublico[];
  atualizadoEm: string;
}

export const api = {
  data: () => req<Data>('/api/data'),
  addParty: (p: PartidoInput) => req<{ id: number }>('/api/parties', 'POST', p),
  updateParty: (id: number, p: PartidoInput) => req('/api/parties/' + id, 'PUT', p),
  deleteParty: (id: number) => req('/api/parties/' + id, 'DELETE'),
  addCandidate: (c: CandidatoInput) => req<{ id: number }>('/api/candidates', 'POST', c),
  updateCandidate: (id: number, c: CandidatoInput) => req('/api/candidates/' + id, 'PUT', c),
  deleteCandidate: (id: number) => req('/api/candidates/' + id, 'DELETE'),
  saveResearch: (tipo: 'candidato' | 'partido', entidadeId: number, dados: unknown) =>
    req('/api/research', 'POST', { tipo, entidadeId, dados }),
  activateResearch: (id: number) => req(`/api/research/${id}/activate`, 'POST'),
  deleteResearch: (id: number) => req('/api/research/' + id, 'DELETE'),
  saveQuiz: (q: QuizState) => req('/api/quiz', 'PUT', q),
  importAll: (backup: unknown) => req('/api/import', 'POST', backup),
  listUsers: () => req<UsuarioInfo[]>('/api/admin/users'),
  createAdmin: (u: NovoAdminInput) => req<UsuarioInfo>('/api/admin/users', 'POST', u),
  promoteUser: (id: number) => req('/api/admin/users/' + id + '/promote', 'POST'),
  sendFeedback: (mensagem: string) => req('/api/feedback', 'POST', { mensagem }),
  listFeedback: () => req<FeedbackInfo[]>('/api/feedback'),
  saveColinha: (itens: ColinhaItemPublico[]) => req<{ token: string }>('/api/colinha', 'PUT', { itens }),
  colinhaPublica: (token: string) => req<ColinhaPublica>('/api/colinha/' + token),
};
