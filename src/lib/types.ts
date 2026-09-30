import type { CandidatoPesquisa, PartidoPesquisa } from './schema.ts';

export type Cargo = 'presidente' | 'governador' | 'senador' | 'deputado_federal' | 'deputado_estadual';

export const CARGOS: Record<Cargo, string> = {
  presidente: 'Presidente',
  governador: 'Governador',
  senador: 'Senador',
  deputado_federal: 'Deputado Federal',
  deputado_estadual: 'Deputado Estadual',
};

export const UFS: Record<string, string> = {
  AC: 'Acre',
  AL: 'Alagoas',
  AP: 'Amapá',
  AM: 'Amazonas',
  BA: 'Bahia',
  CE: 'Ceará',
  DF: 'Distrito Federal',
  ES: 'Espírito Santo',
  GO: 'Goiás',
  MA: 'Maranhão',
  MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul',
  MG: 'Minas Gerais',
  PA: 'Pará',
  PB: 'Paraíba',
  PR: 'Paraná',
  PE: 'Pernambuco',
  PI: 'Piauí',
  RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul',
  RO: 'Rondônia',
  RR: 'Roraima',
  SC: 'Santa Catarina',
  SP: 'São Paulo',
  SE: 'Sergipe',
  TO: 'Tocantins',
};

export interface Party {
  id: number;
  sigla: string;
  nome: string;
  logo: string | null;
  candidatosCount: number;
}

export interface Candidate {
  id: number;
  nome: string;
  cargo: Cargo;
  uf: string;
  partyId: number | null;
  foto: string | null;
}

export type RespostaUsuario = 'sim' | 'nao' | 'pular';

export interface QuizState {
  respostas: Record<string, { r: RespostaUsuario; imp: boolean }>;
  eticaEliminatoria: boolean | null;
}

interface PesquisaBase {
  id: number;
  entidadeId: number;
  criadoEm: string;
  ativa: boolean;
}

export type Pesquisa =
  | (PesquisaBase & { tipo: 'candidato'; dados: CandidatoPesquisa })
  | (PesquisaBase & { tipo: 'partido'; dados: PartidoPesquisa });

export interface Data {
  quiz: QuizState;
}

export function ufLabel(uf: string): string {
  return uf === 'BR' ? 'Brasil' : uf;
}
