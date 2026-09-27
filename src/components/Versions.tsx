import { useState } from 'react';
import { api } from '../lib/api.ts';
import { dataHoraBR } from '../lib/format.ts';
import { PERGUNTAS } from '../lib/questions.ts';
import { useStore, versoes } from '../lib/store.tsx';

const ROTULO: Record<string, string> = { sim: 'Sim', nao: 'Não', sem_info: 'Sem info' };

export function Versions({ tipo, entidadeId }: { tipo: 'candidato' | 'partido'; entidadeId: number }) {
  const { data, refresh } = useStore();
  const lista = versoes(data, tipo, entidadeId);
  const ativa = lista.find((v) => v.ativa);
  const [comparando, setComparando] = useState<number | null>(null);

  if (!lista.length) return <p className="vazio">Nenhuma pesquisa salva ainda.</p>;

  const acao = async (fn: () => Promise<unknown>) => {
    await fn();
    await refresh();
  };

  const alvo = lista.find((v) => v.id === comparando);
  const diferencas =
    alvo && ativa
      ? PERGUNTAS.map((p) => ({ p, de: alvo.dados.quiz[p.id]?.resposta, para: ativa.dados.quiz[p.id]?.resposta })).filter(
          (d) => d.de !== d.para,
        )
      : [];

  return (
    <div className="versoes">
      {lista.map((v, i) => (
        <div key={v.id} className={`versao${v.ativa ? ' ativa' : ''}`}>
          <div>
            <strong>{dataHoraBR(v.criadoEm)}</strong>
            <span className="muted"> · versão {lista.length - i}</span>
            {v.ativa && <span className="selo">em uso</span>}
          </div>
          <div className="linha">
            {!v.ativa && (
              <>
                <button className="btn secundario pequeno" onClick={() => setComparando(comparando === v.id ? null : v.id)}>
                  {comparando === v.id ? 'Fechar comparação' : 'Comparar com a atual'}
                </button>
                <button className="btn secundario pequeno" onClick={() => acao(() => api.activateResearch(v.id))}>
                  Restaurar
                </button>
              </>
            )}
            <button
              className="btn texto pequeno"
              onClick={() => window.confirm('Excluir esta versão da pesquisa?') && acao(() => api.deleteResearch(v.id))}
            >
              Excluir
            </button>
          </div>
        </div>
      ))}

      {alvo && (
        <div className="comparacao">
          <h4>Diferenças entre esta versão e a atual (respostas do quiz)</h4>
          {diferencas.length === 0 ? (
            <p className="muted">Nenhuma resposta do quiz mudou.</p>
          ) : (
            <ul>
              {diferencas.map(({ p, de, para }) => (
                <li key={p.id}>
                  <span>{p.candidato}</span>
                  <span className="muted">
                    {ROTULO[de ?? 'sem_info']} → {ROTULO[para ?? 'sem_info']}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
