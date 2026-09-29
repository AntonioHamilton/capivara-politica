import { useMemo } from 'react';
import { compatibilidade } from './scoring.ts';
import type { Compat } from './scoring.ts';
import { useStore } from './store.tsx';
import type { Party } from './types.ts';
import type { Pesquisa } from './types.ts';

export interface ItemPartido {
  party: Party;
  compat: Compat | null;
  pesquisa: Extract<Pesquisa, { tipo: 'partido' }> | undefined;
}

export function usePartidos(): ItemPartido[] {
  const { data } = useStore();
  return useMemo(
    () =>
      data.parties.map((party) => {
        const pesquisa = data.researchPartidos.filter((r) => r.entidadeId === party.id).find((r) => r.ativa);
        return { party, pesquisa, compat: pesquisa ? compatibilidade(data.quiz, pesquisa.dados.quiz) : null };
      }),
    [data],
  );
}
