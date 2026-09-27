import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api.ts';
import type { Data, Pesquisa, QuizState } from './types.ts';

interface Store {
  data: Data;
  refresh: () => Promise<void>;
  saveQuiz: (q: QuizState) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setData(await api.data());
  }, []);

  useEffect(() => {
    refresh().catch((e: Error) => setErro(e.message));
  }, [refresh]);

  const saveQuiz = useCallback((q: QuizState) => {
    setData((d) => (d ? { ...d, quiz: q } : d));
    api.saveQuiz(q).catch((e: Error) => setErro(e.message));
  }, []);

  if (erro) return <p className="estado-tela">Não foi possível carregar os dados: {erro}</p>;
  if (!data) return <p className="estado-tela">Carregando...</p>;
  return <Ctx.Provider value={{ data, refresh, saveQuiz }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider ausente');
  return s;
}

export function versoes(data: Data, tipo: 'candidato' | 'partido', id: number): Pesquisa[] {
  return data.research.filter((r) => r.tipo === tipo && r.entidadeId === id);
}

export function pesquisaAtiva(data: Data, tipo: 'candidato', id: number): Extract<Pesquisa, { tipo: 'candidato' }> | undefined;
export function pesquisaAtiva(data: Data, tipo: 'partido', id: number): Extract<Pesquisa, { tipo: 'partido' }> | undefined;
export function pesquisaAtiva(data: Data, tipo: 'candidato' | 'partido', id: number): Pesquisa | undefined {
  return versoes(data, tipo, id).find((r) => r.ativa);
}
