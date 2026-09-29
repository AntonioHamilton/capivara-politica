import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api.ts';
import type { Data, QuizState } from './types.ts';

interface Store {
  data: Data;
  refresh: () => Promise<void>;
  saveQuiz: (q: QuizState) => void;
}

const Ctx = createContext<Store | null>(null);

// os dados já chegam prontos de AuthGate (que faz a única chamada de carregamento inicial,
// junto com a autenticação) — este provider só gerencia o estado local depois disso.
export function StoreProvider({ dataInicial, children }: { dataInicial: Data; children: ReactNode }) {
  const [data, setData] = useState<Data>(dataInicial);
  const [erro, setErro] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setData(await api.data());
  }, []);

  const saveQuiz = useCallback((q: QuizState) => {
    setData((d) => ({ ...d, quiz: q }));
    api.saveQuiz(q).catch((e: Error) => setErro(e.message));
  }, []);

  if (erro) return <p className="estado-tela">Não foi possível salvar: {erro}</p>;
  return <Ctx.Provider value={{ data, refresh, saveQuiz }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider ausente');
  return s;
}
