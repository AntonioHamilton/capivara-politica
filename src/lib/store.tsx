import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api.ts';
import { invalidarCache } from './cache.ts';
import type { Data, QuizState } from './types.ts';

interface Store {
  data: Data;
  saveQuiz: (q: QuizState) => void;
}

const Ctx = createContext<Store | null>(null);

// os dados já chegam prontos de AuthGate (que faz a única chamada de carregamento inicial,
// junto com a autenticação) — este provider só gerencia o estado local depois disso.
export function StoreProvider({ dataInicial, children }: { dataInicial: Data; children: ReactNode }) {
  const [data, setData] = useState<Data>(dataInicial);
  const [erro, setErro] = useState<string | null>(null);

  const saveQuiz = useCallback((q: QuizState) => {
    setData((d) => ({ ...d, quiz: q }));
    // a compatibilidade cacheada deixa de valer já na resposta seguinte, não só quando o PUT terminar
    invalidarCache();
    api.saveQuiz(q).catch((e: Error) => setErro(e.message));
  }, []);

  if (erro) return <p className="estado-tela">Não foi possível salvar: {erro}</p>;
  return <Ctx.Provider value={{ data, saveQuiz }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider ausente');
  return s;
}
