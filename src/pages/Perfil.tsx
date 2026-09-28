import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CandidateForm } from '../components/Forms.tsx';
import { Posicoes } from '../components/Posicoes.tsx';
import { ResearchModal } from '../components/ResearchModal.tsx';
import { Avatar, Fontes, Icon, PartyBadge, Tabs } from '../components/ui.tsx';
import { Versions } from '../components/Versions.tsx';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { brl, dataBR } from '../lib/format.ts';
import { promptCandidato } from '../lib/prompt.ts';
import { useItens } from '../lib/ranking.ts';
import { useStore } from '../lib/store.tsx';
import { CARGOS, ufLabel } from '../lib/types.ts';

type Aba = 'visao' | 'posicoes' | 'polemicas' | 'pesquisas';

const SITUACAO = { em_exercicio: 'Em exercício', candidato: 'Candidato 2026', ex_ocupante: 'Ex-ocupante' } as const;
const STATUS = { condenado: 'Condenado', investigado: 'Investigado', acusado: 'Acusado', noticia: 'Notícia' } as const;
const REDES: Record<string, string> = { instagram: 'Instagram', x: 'X', facebook: 'Facebook', youtube: 'YouTube', site: 'Site' };

const simNao = (v: boolean | null | undefined) => (v == null ? 'Sem informação' : v ? 'Sim' : 'Não');

function Card({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="card">
      <h3>{titulo}</h3>
      {children}
    </section>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="info">
      <span className="rotulo">{rotulo}</span>
      <span className="valor">{valor ?? '—'}</span>
    </div>
  );
}

export function Perfil() {
  const { id } = useParams();
  const { data, refresh } = useStore();
  const { user } = useAuth();
  const itens = useItens();
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>('visao');
  const [pesquisando, setPesquisando] = useState(false);
  const [editando, setEditando] = useState(false);

  const it = itens.find((i) => String(i.cand.id) === id);
  if (!it) {
    return (
      <div className="pagina">
        <Link to="/app" className="voltar">
          <Icon name="back" /> Voltar para a lista
        </Link>
        <p className="vazio">Candidato não encontrado.</p>
      </div>
    );
  }

  const { cand, party, pesquisa, compat } = it;
  const d = pesquisa?.dados;

  const remover = async () => {
    if (!window.confirm(`Remover ${cand.nome} da lista? As pesquisas salvas dele também serão apagadas.`)) return;
    await api.deleteCandidate(cand.id);
    await refresh();
    navigate('/app');
  };

  const redes = Object.entries(d?.basico.redes ?? {}).filter(([, v]) => v);

  return (
    <div className="pagina">
      <Link to="/app" className="voltar">
        <Icon name="back" /> Voltar para a lista
      </Link>

      <header className="perfil-cab">
        <Avatar src={cand.foto} nome={cand.nome} size={128} />
        <div className="perfil-id">
          <h1>{cand.nome}</h1>
          <div className="perfil-linha">
            <span>
              {CARGOS[cand.cargo]} · {ufLabel(cand.uf)}
            </span>
            <PartyBadge party={party} />
            {d?.basico.situacao && <span className="selo">{SITUACAO[d.basico.situacao]}</span>}
          </div>
          <div className="perfil-linha muted">
            {d?.basico.nome_civil && <span>{d.basico.nome_civil}</span>}
            {d?.basico.idade != null && <span>{d.basico.idade} anos</span>}
            {d?.basico.numero_urna && <span>Número {d.basico.numero_urna}</span>}
            {pesquisa && <span>Pesquisado em {dataBR(pesquisa.criadoEm)}</span>}
          </div>
          {redes.length > 0 && (
            <div className="perfil-linha">
              {redes.map(([k, v]) => (
                <a key={k} className="link-rede" href={v!} target="_blank" rel="noreferrer noopener">
                  {REDES[k] ?? k} <Icon name="external" size={12} />
                </a>
              ))}
            </div>
          )}
          {user.isAdmin && (
            <div className="perfil-acoes">
              <button className="btn" onClick={() => setPesquisando(true)}>
                <Icon name="refresh" /> Reload
              </button>
              <button className="btn secundario" onClick={() => setEditando(true)}>
                Editar
              </button>
              <button className="btn texto" onClick={remover}>
                Remover da lista
              </button>
            </div>
          )}
        </div>
        <div className="perfil-nota">
          {it.conflito ? (
            <>
              <span className="selo-conflito grande">
                <Icon name="alert" size={16} /> Conflito
              </span>
              <ul className="conflitos">
                {compat!.conflitos.map((c) => (
                  <li key={c.id}>{c.motivo}</li>
                ))}
              </ul>
            </>
          ) : compat?.pct != null ? (
            <>
              <span className="nota grande">{compat.pct}%</span>
              <span className="rotulo">COMPATIBILIDADE</span>
              <span className="muted pequeno-texto">
                baseada em {compat.comparadas} de {compat.respondidas} perguntas
              </span>
              {it.rank && (
                <span className="muted">
                  {it.rank}º de {it.totalGrupo} em {CARGOS[cand.cargo]} {ufLabel(cand.uf)}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="selo-neutro">{pesquisa ? 'Dados insuficientes para comparar' : 'Sem compatibilidade'}</span>
              {compat && (
                <span className="muted pequeno-texto">
                  {compat.comparadas} respostas em comum, o mínimo é {compat.minimo}
                </span>
              )}
            </>
          )}
        </div>
      </header>

      <Tabs
        tabs={[
          { id: 'visao', label: 'Visão geral' },
          { id: 'posicoes', label: 'Posições' },
          { id: 'polemicas', label: 'Polêmicas' },
          { id: 'pesquisas', label: 'Pesquisas' },
        ]}
        value={aba}
        onChange={setAba}
      />

      {aba === 'visao' &&
        (d ? (
          <div className="grade-cards">
            <Card titulo="Trajetória">
              <Info rotulo="Cargo atual" valor={d.basico.cargo_atual} />
              <Info rotulo="Já teve cargo público antes?" valor={simNao(d.basico.teve_cargo_publico_antes)} />
              {d.basico.cargos_anteriores.length > 0 && (
                <ul className="lista-simples">
                  {d.basico.cargos_anteriores.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
            </Card>
            <Card titulo="Fundo eleitoral">
              <Info rotulo="Usou?" valor={simNao(d.fundo_eleitoral.usou)} />
              <Info rotulo="Valor" valor={brl(d.fundo_eleitoral.valor_reais)} />
              {d.fundo_eleitoral.detalhe && <p>{d.fundo_eleitoral.detalhe}</p>}
              <Fontes fontes={d.fundo_eleitoral.fontes} />
            </Card>
            <Card titulo="Presença">
              <span className="numero-grande">{d.presenca.percentual != null ? `${d.presenca.percentual}%` : '—'}</span>
              {d.presenca.detalhe && <p>{d.presenca.detalhe}</p>}
              <Fontes fontes={d.presenca.fontes} />
            </Card>
            <Card titulo="Salário e benefícios">
              <Info rotulo="Salário mensal" valor={brl(d.salario.valor_mensal_reais)} />
              <Info rotulo="Usa benefícios?" valor={simNao(d.salario.usa_beneficios)} />
              {d.salario.detalhe && <p>{d.salario.detalhe}</p>}
              <Fontes fontes={d.salario.fontes} />
            </Card>
            <Card titulo="Principais propostas">
              {d.propostas.length ? (
                <ol className="propostas">
                  {d.propostas.slice(0, 3).map((p, i) => (
                    <li key={i}>
                      <strong>{p.titulo}</strong>
                      {p.descricao && <p>{p.descricao}</p>}
                      <Fontes fontes={p.fontes} />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">Sem informação.</p>
              )}
            </Card>
            <Card titulo="Pautas femininas">
              {d.pautas_femininas ? (
                <>
                  <Info rotulo="Defende?" valor={simNao(d.pautas_femininas.defende)} />
                  {d.pautas_femininas.resumo && <p>{d.pautas_femininas.resumo}</p>}
                  {d.pautas_femininas.itens.length > 0 && (
                    <ul className="propostas">
                      {d.pautas_femininas.itens.map((p, i) => (
                        <li key={i}>
                          <strong>{p.titulo}</strong>
                          {p.descricao && <p>{p.descricao}</p>}
                          <Fontes fontes={p.fontes} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="muted">Esta pesquisa é anterior a este tema. Use o Reload para atualizar.</p>
              )}
            </Card>
            <Card titulo="Propostas para educação">
              {d.educacao ? (
                <>
                  {d.educacao.resumo && <p>{d.educacao.resumo}</p>}
                  {d.educacao.propostas.length > 0 ? (
                    <ol className="propostas">
                      {d.educacao.propostas.map((p, i) => (
                        <li key={i}>
                          <strong>{p.titulo}</strong>
                          {p.descricao && <p>{p.descricao}</p>}
                          <Fontes fontes={p.fontes} />
                        </li>
                      ))}
                    </ol>
                  ) : (
                    !d.educacao.resumo && <p className="muted">Sem informação.</p>
                  )}
                </>
              ) : (
                <p className="muted">Esta pesquisa é anterior a este tema. Use o Reload para atualizar.</p>
              )}
            </Card>
            <Card titulo="Declarações sobre o STF">
              <p>{d.declaracoes_stf.resumo ?? 'Sem informação.'}</p>
              <Fontes fontes={d.declaracoes_stf.fontes} />
            </Card>
          </div>
        ) : (
          <div className="vazio">
            <p>Este candidato ainda não foi pesquisado.</p>
            {user.isAdmin && (
              <button className="btn" onClick={() => setPesquisando(true)}>
                <Icon name="refresh" /> Gerar prompt de pesquisa
              </button>
            )}
          </div>
        ))}

      {aba === 'posicoes' && <Posicoes tipo="candidato" quiz={data.quiz} alvo={d?.quiz} />}

      {aba === 'polemicas' &&
        (d ? (
          d.polemicas.length ? (
            <ul className="polemicas">
              {d.polemicas.map((p, i) => (
                <li key={i} className="card">
                  <div className="linha">
                    <span className={`selo status-${p.status}`}>{STATUS[p.status]}</span>
                    {p.categoria === 'corrupcao' && <span className="selo">Corrupção</span>}
                    {!p.fontes.length && <span className="selo-aviso">não verificada</span>}
                  </div>
                  <h4>{p.titulo}</h4>
                  {p.resumo && <p>{p.resumo}</p>}
                  <Fontes fontes={p.fontes} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="vazio">Nenhuma polêmica encontrada na pesquisa.</p>
          )
        ) : (
          <p className="vazio">Ainda não há pesquisa. Use o botão Reload.</p>
        ))}

      {aba === 'pesquisas' && <Versions tipo="candidato" entidadeId={cand.id} />}

      {user.isAdmin && pesquisando && (
        <ResearchModal
          tipo="candidato"
          entidadeId={cand.id}
          titulo={cand.nome}
          prompt={promptCandidato(cand, party)}
          onClose={() => setPesquisando(false)}
        />
      )}
      {user.isAdmin && editando && <CandidateForm candidate={cand} onClose={() => setEditando(false)} />}
    </div>
  );
}
