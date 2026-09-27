import { EIXOS, ORDEM_EIXOS, PERGUNTAS } from '../lib/questions.ts';
import type { RespostaQuiz } from '../lib/schema.ts';
import type { QuizState } from '../lib/types.ts';
import { Fontes, Icon } from './ui.tsx';

const ROTULO = { sim: 'Sim', nao: 'Não', sem_info: 'Sem info' } as const;

export function Posicoes({
  tipo,
  quiz,
  alvo,
}: {
  tipo: 'candidato' | 'partido';
  quiz: QuizState;
  alvo: Record<string, RespostaQuiz> | undefined;
}) {
  if (!alvo) return <p className="vazio">Ainda não há pesquisa. Use o botão Reload para gerar o prompt.</p>;

  return (
    <div className="posicoes">
      {ORDEM_EIXOS.map((eixo) => (
        <section key={eixo}>
          <h3>{EIXOS[eixo].nome}</h3>
          {PERGUNTAS.filter((p) => p.eixo === eixo).map((p) => {
            const a = alvo[p.id];
            const u = quiz.respostas[p.id];
            const voce = u && u.r !== 'pular' ? u : null;
            const comparavel = voce && a && a.resposta !== 'sem_info';
            const concorda = comparavel && voce.r === a.resposta;
            const texto = tipo === 'partido' ? p.candidato.replace('O candidato', 'O partido') : p.candidato;
            return (
              <details key={p.id} className="posicao">
                <summary>
                  <span className="pergunta">{texto}</span>
                  <span className="chips">
                    <span className={`chip resp-${a?.resposta ?? 'sem_info'}`}>{ROTULO[a?.resposta ?? 'sem_info']}</span>
                    {voce && (
                      <span className={`chip voce ${comparavel ? (concorda ? 'concorda' : 'diverge') : ''}`}>
                        Você: {voce.r === 'sim' ? 'Sim' : 'Não'}
                        {voce.imp && <Icon name="star" size={12} filled />}
                      </span>
                    )}
                    {comparavel && (
                      <span className={`marca ${concorda ? 'concorda' : 'diverge'}`} title={concorda ? 'Concordam' : 'Divergem'}>
                        <Icon name={concorda ? 'check' : 'x'} size={16} />
                      </span>
                    )}
                  </span>
                </summary>
                <div className="posicao-corpo">
                  {a?.explicacao ? <p>{a.explicacao}</p> : <p className="muted">Sem explicação.</p>}
                  {a && a.resposta !== 'sem_info' && !a.fontes.length && <span className="selo-aviso">sem fonte</span>}
                  <Fontes fontes={a?.fontes} />
                </div>
              </details>
            );
          })}
        </section>
      ))}
    </div>
  );
}
