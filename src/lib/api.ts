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

export const api = {
  data: () => req<Data>('/api/data'),
  upload: (dataUrl: string) => req<{ url: string }>('/api/upload', 'POST', { dataUrl }),
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
};
