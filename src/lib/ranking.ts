import { useMemo } from 'react';
import { compatibilidade } from './scoring.ts';
import type { Compat } from './scoring.ts';
import { pesquisaAtiva, useStore } from './store.tsx';
import type { Candidate, Data, Party } from './types.ts';
import type { Pesquisa } from './types.ts';

export interface Item {
  cand: Candidate;
  party: Party | undefined;
  pesquisa: Extract<Pesquisa, { tipo: 'candidato' }> | undefined;
  compat: Compat | null;
  conflito: boolean;
  rank: number | null;
  totalGrupo: number;
}

export interface ItemPartido {
  party: Party;
  compat: Compat | null;
  pesquisa: Extract<Pesquisa, { tipo: 'partido' }> | undefined;
}

export const chaveGrupo = (c: Candidate) => `${c.cargo}:${c.uf}`;

export function calcularItens(data: Data): Item[] {
  const itens: Item[] = data.candidates.map((cand) => {
    const pesquisa = pesquisaAtiva(data, 'candidato', cand.id);
    const compat = pesquisa ? compatibilidade(data.quiz, pesquisa.dados.quiz, pesquisa.dados.polemicas) : null;
    return {
      cand,
      party: data.parties.find((p) => p.id === cand.partyId),
      pesquisa,
      compat,
      conflito: !!compat && compat.conflitos.length > 0,
      rank: null,
      totalGrupo: 0,
    };
  });

  const grupos = new Map<string, Item[]>();
  for (const it of itens) {
    if (it.compat?.pct == null || it.conflito) continue;
    const k = chaveGrupo(it.cand);
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

export function calcularPartidos(data: Data): ItemPartido[] {
  return data.parties.map((party) => {
    const pesquisa = pesquisaAtiva(data, 'partido', party.id);
    return { party, pesquisa, compat: pesquisa ? compatibilidade(data.quiz, pesquisa.dados.quiz) : null };
  });
}

export function useItens(): Item[] {
  const { data } = useStore();
  return useMemo(() => calcularItens(data), [data]);
}

export function usePartidos(): ItemPartido[] {
  const { data } = useStore();
  return useMemo(() => calcularPartidos(data), [data]);
}
