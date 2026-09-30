import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui.tsx';
import { EIXOS, ORDEM_EIXOS, PERGUNTAS, PERGUNTA_ETICA } from '../lib/questions.ts';
import { api } from '../lib/api.ts';
import type { PartidoLista } from '../lib/api.ts';
import { espectroDoUsuario } from '../lib/espectro.ts';
import type { TabelaEspectro } from '../lib/espectro.ts';
import { posicaoNosEixos, totalComResposta } from '../lib/scoring.ts';
import { useStore } from '../lib/store.tsx';
import type { RespostaUsuario } from '../lib/types.ts';

const PASSO_ETICA = PERGUNTAS.length;
const PASSO_RESULTADO = PERGUNTAS.length + 1;

export function Quiz() {
  const { data, saveQuiz } = useStore();
  const quiz = data.quiz;
  const [passo, setPasso] = useState(() => {
    const i = PERGUNTAS.findIndex((p) => !quiz.respostas[p.id]);
    if (i >= 0) return i;
    return quiz.eticaEliminatoria === null ? PASSO_ETICA : PASSO_RESULTADO;
  });
  const [imp, setImp] = useState(false);

  useEffect(() => {
    if (passo < PASSO_ETICA) setImp(quiz.respostas[PERGUNTAS[passo].id]?.imp ?? false);
  }, [passo]);

  const responder = (r: RespostaUsuario) => {
    const p = PERGUNTAS[passo];
    saveQuiz({ ...quiz, respostas: { ...quiz.respostas, [p.id]: { r, imp: r === 'pular' ? false : imp } } });
    setPasso(passo + 1);
  };

  const responderEtica = (v: boolean) => {
    saveQuiz({ ...quiz, eticaEliminatoria: v });
    setPasso(PASSO_RESULTADO);
  };

  const refazer = () => {
    if (!window.confirm('Apagar todas as suas respostas e refazer o quiz?')) return;
    saveQuiz({ respostas: {}, eticaEliminatoria: null });
    setPasso(0);
  };

  if (passo < PASSO_ETICA) {
    const p = PERGUNTAS[passo];
    const atual = quiz.respostas[p.id];
    return (
      <div className="pagina estreita">
        <div className="progresso-topo">
          <span className="muted">
            Pergunta {passo + 1} de {PERGUNTAS.length} · {EIXOS[p.eixo].nome}
          </span>
          {totalComResposta(quiz) >= 5 && (
            <button className="btn texto pequeno" onClick={() => setPasso(PASSO_RESULTADO)}>
              Ver resultado parcial
            </button>
          )}
        </div>
        <div className="barra">
          <div style={{ width: `${(passo / PERGUNTAS.length) * 100}%` }} />
        </div>

        <div className="card quiz-card">
          <h2>{p.usuario}</h2>
          <div className="quiz-botoes">
            <button className={`btn grande${atual?.r === 'sim' ? ' marcado' : ''}`} onClick={() => responder('sim')}>
              Sim
            </button>
            <button className={`btn grande${atual?.r === 'pular' ? ' marcado' : ''}`} onClick={() => responder('pular')}>
              Não sei
            </button>
            <button className={`btn grande${atual?.r === 'nao' ? ' marcado' : ''}`} onClick={() => responder('nao')}>
              Não
            </button>
          </div>
          <button className={`estrela${imp ? ' ativa' : ''}`} onClick={() => setImp(!imp)} aria-pressed={imp}>
            <Icon name="star" size={18} filled={imp} /> Inegociável para mim
          </button>
          <p className="muted pequeno-texto">
            Marque a estrela antes de responder. Candidatos que discordarem de você nesta pergunta ficam com o selo de conflito.
            Se não souber ou o tema não importa para você, marque Não sei: a pergunta não entra no seu perfil nem na compatibilidade.
          </p>
        </div>

        <div className="quiz-nav">
          <button className="btn texto" disabled={passo === 0} onClick={() => setPasso(passo - 1)}>
            <Icon name="back" size={16} /> Voltar
          </button>
          <button className="btn texto" onClick={() => setPasso(passo + 1)}>
            Próxima
          </button>
        </div>
      </div>
    );
  }

  if (passo === PASSO_ETICA) {
    return (
      <div className="pagina estreita">
        <div className="barra">
          <div style={{ width: '100%' }} />
        </div>
        <div className="card quiz-card">
          <span className="muted">Última pergunta</span>
          <h2>{PERGUNTA_ETICA}</h2>
          <div className="quiz-botoes">
            <button className={`btn grande${quiz.eticaEliminatoria === true ? ' marcado' : ''}`} onClick={() => responderEtica(true)}>
              Sim
            </button>
            <button className={`btn grande${quiz.eticaEliminatoria === false ? ' marcado' : ''}`} onClick={() => responderEtica(false)}>
              Não
            </button>
          </div>
        </div>
        <div className="quiz-nav">
          <button className="btn texto" onClick={() => setPasso(PERGUNTAS.length - 1)}>
            <Icon name="back" size={16} /> Voltar
          </button>
        </div>
      </div>
    );
  }

  return <Resultado onRefazer={refazer} onRevisar={() => setPasso(0)} />;
}

function Resultado({ onRefazer, onRevisar }: { onRefazer: () => void; onRevisar: () => void }) {
  const { data } = useStore();
  const [partidos, setPartidos] = useState<PartidoLista[] | null>(null);
  useEffect(() => {
    api.partidos().then(setPartidos);
  }, []);
  const [tabelaEspectro, setTabelaEspectro] = useState<TabelaEspectro | null>(null);
  useEffect(() => {
    api.espectroRespostas().then(setTabelaEspectro).catch(() => {});
  }, []);
  const posicoes = posicaoNosEixos(data.quiz);
  // o espectro político vem da média do julgamento de todas as respostas (respostas "Não sei" ficam de
  // fora); enquanto a tabela não chega completa, vale o cálculo antigo, só das perguntas de alinhamento
  if (tabelaEspectro && Object.keys(tabelaEspectro).length === PERGUNTAS.length) {
    posicoes.alinhamento = espectroDoUsuario(data.quiz, tabelaEspectro);
  }
  const ranking = (partidos ?? [])
    .filter((p) => p.compat?.pct != null)
    .sort((a, b) => b.compat!.pct! - a.compat!.pct!)
    .slice(0, 5);
  const naoPesquisados = (partidos ?? []).filter((p) => p.compat?.pct == null).length;

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Seu perfil político</h1>
          <p className="muted">{totalComResposta(data.quiz)} de {PERGUNTAS.length} perguntas respondidas</p>
        </div>
        <div className="linha">
          <button className="btn secundario" onClick={onRevisar}>
            Revisar respostas
          </button>
          <button className="btn texto" onClick={onRefazer}>
            Refazer o quiz
          </button>
        </div>
      </div>

      <div className="grade-cards largos">
        <section className="card">
          <h3>Seu mapa</h3>
          <div className="eixos">
            {ORDEM_EIXOS.map((e) => {
              const v = posicoes[e];
              return (
                <div key={e} className="eixo">
                  <div className="eixo-nome">{EIXOS[e].nome}</div>
                  <div className="eixo-barra">
                    <span>{EIXOS[e].negativo}</span>
                    <div className="trilho">
                      {v != null && <i style={{ left: `${((v + 1) / 2) * 100}%` }} />}
                    </div>
                    <span>{EIXOS[e].positivo}</span>
                  </div>
                  {v == null && <small className="muted">Sem respostas neste eixo</small>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <h3>Partidos mais alinhados</h3>
          {partidos === null ? (
            <p className="muted">Carregando...</p>
          ) : ranking.length > 0 ? (
            <ol className="ranking-partidos">
              {ranking.map((p, i) => (
                <li key={p.id} className={i === 0 ? 'primeiro' : ''}>
                  <Link to={`/app/partido/${p.id}`}>
                    <span className="pos">{i + 1}º</span>
                    {p.logo && <img src={p.logo} alt="" />}
                    <span className="nome">
                      {p.sigla}
                      <small>{p.nome}</small>
                    </span>
                    <span className="nota">{p.compat!.pct}%</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              Nenhum partido pesquisado ainda. Abra a tela de <Link to="/app/partidos">Partidos</Link> e use o Reload em cada um para
              descobrir qual mais combina com você.
            </p>
          )}
          {ranking.length > 0 && naoPesquisados > 0 && (
            <p className="muted pequeno-texto">{naoPesquisados} partido(s) ainda sem pesquisa ficaram de fora.</p>
          )}
        </section>
      </div>

      <div className="aviso">
        <span>
          {data.quiz.eticaEliminatoria == null
            ? 'Você não respondeu sobre corrupção.'
            : data.quiz.eticaEliminatoria
              ? 'Para você, condenação por corrupção elimina o candidato.'
              : 'Para você, condenação por corrupção não elimina o candidato.'}
        </span>
        <Link className="btn pequeno" to="/app">
          Ver candidatos
        </Link>
      </div>
    </div>
  );
}
