import type { Candidate, Cargo, Data, Party, Pesquisa, QuizState } from './types.ts';
import type { Compat } from './scoring.ts';
import { cacheado, invalidarCache } from './cache.ts';

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

// versão leve de um candidato na lista/colinha: sem o texto completo da pesquisa,
// só o resumo (compat, número, situação) que essas telas mostram
export interface ItemCandidatoLista {
  cand: Candidate;
  party: Party | undefined;
  compat: Compat | null;
  conflito: boolean;
  rank: number | null;
  totalGrupo: number;
  temPesquisa: boolean;
  numeroUrna: string | null;
  situacao: 'em_exercicio' | 'candidato' | 'ex_ocupante' | null;
}

export interface ListaCandidatos {
  total: number;
  itens: ItemCandidatoLista[];
}

export interface FiltrosCandidatos {
  cargo?: string;
  uf?: string;
  partido?: string;
  busca?: string;
  ordem?: 'compat' | 'nome';
  top3?: boolean;
  offset?: number;
  limit?: number;
}

// versão completa, usada no perfil do candidato: com a pesquisa inteira (propostas, polêmicas etc)
export interface ItemCandidatoDetalhe {
  cand: Candidate;
  party: Party | undefined;
  pesquisa: Extract<Pesquisa, { tipo: 'candidato' }> | undefined;
  compat: Compat | null;
  conflito: boolean;
  rank: number | null;
  totalGrupo: number;
}

// opção leve pro <select> da Colinha: sem compat, cacheável no servidor (não depende do usuário)
export interface OpcaoColinha {
  id: number;
  nome: string;
  cargo: Cargo;
  uf: string;
  partyId: number | null;
  foto: string | null;
  numeroUrna: string | null;
}

export interface MelhorCandidato {
  id: number;
  pct: number;
}

export interface MelhoresColinha {
  presidente: MelhorCandidato[];
  governador: MelhorCandidato[];
  senador: MelhorCandidato[];
  deputado_federal: MelhorCandidato[];
  deputado_estadual: MelhorCandidato[];
}

function querystring(f: object): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

// mutações que podem mudar o resultado de uma lista já cacheada (candidatos, opções/melhores
// da Colinha) — limpam o cache inteiro do cliente pra próxima busca vir atualizada
function semCache<T>(p: Promise<T>): Promise<T> {
  return p.then((r) => {
    invalidarCache();
    return r;
  });
}

export const api = {
  data: () => req<Data>('/api/data'),
  addParty: (p: PartidoInput) => semCache(req<{ id: number }>('/api/parties', 'POST', p)),
  updateParty: (id: number, p: PartidoInput) => semCache(req('/api/parties/' + id, 'PUT', p)),
  deleteParty: (id: number) => semCache(req('/api/parties/' + id, 'DELETE')),
  addCandidate: (c: CandidatoInput) => semCache(req<{ id: number }>('/api/candidates', 'POST', c)),
  updateCandidate: (id: number, c: CandidatoInput) => semCache(req('/api/candidates/' + id, 'PUT', c)),
  deleteCandidate: (id: number) => semCache(req('/api/candidates/' + id, 'DELETE')),
  saveResearch: (tipo: 'candidato' | 'partido', entidadeId: number, dados: unknown) =>
    semCache(req('/api/research', 'POST', { tipo, entidadeId, dados })),
  activateResearch: (id: number) => semCache(req(`/api/research/${id}/activate`, 'POST')),
  deleteResearch: (id: number) => semCache(req('/api/research/' + id, 'DELETE')),
  saveQuiz: (q: QuizState) => semCache(req('/api/quiz', 'PUT', q)),
  importAll: (backup: unknown) => semCache(req('/api/import', 'POST', backup)),
  listUsers: () => req<UsuarioInfo[]>('/api/admin/users'),
  createAdmin: (u: NovoAdminInput) => req<UsuarioInfo>('/api/admin/users', 'POST', u),
  promoteUser: (id: number) => req('/api/admin/users/' + id + '/promote', 'POST'),
  sendFeedback: (mensagem: string) => req('/api/feedback', 'POST', { mensagem }),
  listFeedback: () => req<FeedbackInfo[]>('/api/feedback'),
  saveColinha: (itens: ColinhaItemPublico[]) => req<{ token: string }>('/api/colinha', 'PUT', { itens }),
  colinhaSalva: () => req<ColinhaPublica | null>('/api/colinha'),
  colinhaPublica: (token: string) => req<ColinhaPublica>('/api/colinha/' + token),
  candidatos: (f: FiltrosCandidatos = {}) =>
    cacheado('candidatos:' + querystring(f), () => req<ListaCandidatos>('/api/candidatos' + querystring(f))),
  candidato: (id: number) => req<ItemCandidatoDetalhe>('/api/candidatos/' + id),
  researchVersoes: (tipo: 'candidato' | 'partido', entidadeId: number) =>
    req<Pesquisa[]>('/api/research' + querystring({ tipo, entidadeId })),
  contagens: () => req<{ candidatos: number; pesquisas: number }>('/api/contagens'),
  colinhaOpcoes: (f: { cargo?: string; uf?: string } = {}) =>
    cacheado('colinha-opcoes:' + querystring(f), () => req<OpcaoColinha[]>('/api/colinha-opcoes' + querystring(f)), 5 * 60_000),
  colinhaMelhores: (uf: string) =>
    cacheado('colinha-melhores:' + uf, () => req<MelhoresColinha>('/api/colinha-melhores' + querystring({ uf }))),
  candidatoCompat: (id: number) => req<{ pct: number | null }>('/api/candidato-compat/' + id),
};
