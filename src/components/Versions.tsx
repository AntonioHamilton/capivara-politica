import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import type { GrupoCandidatos } from '../lib/cache.ts';
import type { Pesquisa } from '../lib/types.ts';
import { useAuth } from '../lib/auth.tsx';
import { dataHoraBR } from '../lib/format.ts';
import { PERGUNTAS } from '../lib/questions.ts';

const ROTULO: Record<string, string> = { sim: 'Sim', nao: 'Não', sem_info: 'Sem info' };

export function Versions({
  tipo,
  entidadeId,
  grupo,
  onChange,
}: {
  tipo: 'candidato' | 'partido';
  entidadeId: number;
  grupo?: GrupoCandidatos;
  onChange?: () => void;
}) {
  const { user } = useAuth();
  const [lista, setLista] = useState<Pesquisa[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [comparando, setComparando] = useState<number | null>(null);

  const carregar = () => {
    return api.researchVersoes(tipo, entidadeId).then((r) => {
      setLista(r);
      setCarregado(true);
    });
  };

  useEffect(() => {
    setCarregado(false);
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, entidadeId]);

  const ativa = lista.find((v) => v.ativa);

  if (!carregado) return <p className="muted">Carregando...</p>;
  if (!lista.length) return <p className="vazio">Nenhuma pesquisa salva ainda.</p>;

  const acao = async (fn: () => Promise<unknown>) => {
    await fn();
    await carregar();
    onChange?.();
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
                {user.isAdmin && (
                  <button className="btn secundario pequeno" onClick={() => acao(() => api.activateResearch(v.id, tipo, grupo))}>
                    Restaurar
                  </button>
                )}
              </>
            )}
            {user.isAdmin && (
              <button
                className="btn texto pequeno"
                onClick={() => window.confirm('Excluir esta versão da pesquisa?') && acao(() => api.deleteResearch(v.id, tipo, grupo))}
              >
                Excluir
              </button>
            )}
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
