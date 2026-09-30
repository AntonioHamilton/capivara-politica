import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CandidateForm } from '../components/Forms.tsx';
import { Avatar, Icon, Loading, PartyBadge } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import type { ItemCandidatoLista, PartidoOpcao } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { totalRespondidas } from '../lib/scoring.ts';
import { useStore } from '../lib/store.tsx';
import { CARGOS, UFS } from '../lib/types.ts';

type Ordem = 'compat' | 'nome';

const TAMANHO_PAGINA = 20;
// altura aproximada de cada linha (com a folga do gap) — usada só pra decidir o que renderizar,
// uma pequena imprecisão aqui não quebra nada, só ajusta a margem de segurança (overscan)
const ALTURA_SLOT = 96;
const OVERSCAN = 8;

const CHAVE_FILTROS = 'filtrosCandidatos';

interface FiltrosSalvos {
  cargo: string;
  uf: string;
  partido: string;
  ordem: Ordem;
  top3: boolean;
}

function filtrosSalvos(): Partial<FiltrosSalvos> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_FILTROS) ?? '{}');
  } catch {
    return {};
  }
}

export function Lista() {
  const { data } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [adicionando, setAdicionando] = useState(false);
  const [cargo, setCargo] = useState(() => filtrosSalvos().cargo ?? '');
  const [ufEscolhido, setUf] = useState(() => filtrosSalvos().uf ?? '');
  const [partido, setPartido] = useState(() => filtrosSalvos().partido ?? '');
  const [buscaCampo, setBuscaCampo] = useState('');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>(() => filtrosSalvos().ordem ?? 'compat');
  const [top3, setTop3] = useState(() => filtrosSalvos().top3 ?? false);
  // presidente é nacional (uf 'BR' no banco): nesse cargo o filtro de estado não se aplica e
  // fica em "Todos os estados"
  const uf = cargo === 'presidente' || ufEscolhido === 'BR' ? '' : ufEscolhido;

  // lembra os selects (cargo/estado/partido/ordem/top3) entre visitas — não inclui a busca por
  // nome, que é mais transitória
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_FILTROS, JSON.stringify({ cargo, uf, partido, ordem, top3 }));
    } catch {
      // sem armazenamento disponível, os filtros valem só nesta sessão
    }
  }, [cargo, uf, partido, ordem, top3]);

  // opções do filtro de partido: chamada leve (id e sigla), feita depois da primeira lista pra
  // não competir com ela
  const [partidos, setPartidos] = useState<PartidoOpcao[]>([]);

  const [itens, setItens] = useState<ItemCandidatoLista[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  // carregandoFiltro: troca de filtro/ordem — a lista atual fica desatualizada, então some e dá
  // lugar ao loading. carregandoMais: rolagem infinita — a lista atual continua certa, só falta
  // completar, então fica visível e o loading aparece só embaixo.
  const [carregandoFiltro, setCarregandoFiltro] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const carregandoRef = useRef(false); // evita disparar vários "carregar mais" simultâneos durante o scroll
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaViewport, setAlturaViewport] = useState(600);

  // debounça a busca por nome pra não disparar uma requisição a cada tecla
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaCampo), 300);
    return () => clearTimeout(t);
  }, [buscaCampo]);

  useEffect(() => {
    let ativo = true;
    setCarregandoFiltro(true);
    setErro(null);
    api
      .candidatos({ cargo, uf, partido, busca, ordem, top3, offset: 0, limit: TAMANHO_PAGINA })
      .then((r) => {
        if (!ativo) return;
        setItens(r.itens);
        setTotal(r.total);
        scrollRef.current?.scrollTo(0, 0);
        setScrollTop(0);
      })
      .catch((e: Error) => ativo && setErro(e.message))
      .finally(() => ativo && setCarregandoFiltro(false));
    return () => {
      ativo = false;
    };
  }, [cargo, uf, partido, busca, ordem, top3]);

  useEffect(() => {
    if (carregandoFiltro || partidos.length) return;
    api.partidosOpcoes().then(setPartidos).catch(() => {});
  }, [carregandoFiltro, partidos.length]);

  const carregarMais = useCallback(async () => {
    if (carregandoRef.current) return;
    carregandoRef.current = true;
    setCarregandoMais(true);
    try {
      const r = await api.candidatos({ cargo, uf, partido, busca, ordem, top3, offset: itens.length, limit: TAMANHO_PAGINA });
      setItens((atual) => [...atual, ...r.itens]);
      setTotal(r.total);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregandoMais(false);
      carregandoRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargo, uf, partido, busca, ordem, top3, itens.length]);

  // mede a altura visível da área de rolagem (pra saber quantas linhas cabem na tela)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const medir = () => setAlturaViewport(el.clientHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // rolagem infinita: perto do fim do que já foi carregado, pede mais automaticamente.
  // também é aqui que guardamos o scrollTop pra decidir quais linhas renderizar (virtualização).
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const pertoDoFim = el.scrollTop + el.clientHeight >= el.scrollHeight - ALTURA_SLOT * 4;
    if (pertoDoFim && total != null && itens.length < total) carregarMais();
  };

  const inicio = Math.max(0, Math.floor(scrollTop / ALTURA_SLOT) - OVERSCAN);
  const quantidadeVisivel = Math.ceil(alturaViewport / ALTURA_SLOT) + OVERSCAN * 2;
  const fim = Math.min(itens.length, inicio + quantidadeVisivel);
  const visiveis = itens.slice(inicio, fim);

  const quizIncompleto = totalRespondidas(data.quiz) < 30;

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Candidatos</h1>
          <p className="muted">{!carregandoFiltro && total != null ? `${total} encontrados` : 'Carregando...'}</p>
        </div>
        {user.isAdmin && (
          <button className="btn" onClick={() => setAdicionando(true)}>
            <Icon name="plus" /> Adicionar candidato
          </button>
        )}
      </div>

      {quizIncompleto && (
        <div className="aviso">
          <span>
            {totalRespondidas(data.quiz) === 0
              ? 'Faça o quiz do seu perfil político para ver a compatibilidade com cada candidato.'
              : 'Você ainda não terminou o quiz. A compatibilidade pode mudar.'}
          </span>
          <Link className="btn pequeno" to="/app/quiz">
            {totalRespondidas(data.quiz) === 0 ? 'Fazer o quiz' : 'Continuar o quiz'}
          </Link>
        </div>
      )}

      <div className="filtros">
        <select
          value={cargo}
          onChange={(e) => {
            setCargo(e.target.value);
            if (e.target.value === 'presidente') setUf('');
          }}
          aria-label="Cargo"
        >
          <option value="">Todos os cargos</option>
          {Object.entries(CARGOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={uf} onChange={(e) => setUf(e.target.value)} aria-label="Estado" disabled={cargo === 'presidente'}>
          <option value="">Todos os estados</option>
          {Object.entries(UFS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={partido} onChange={(e) => setPartido(e.target.value)} aria-label="Partido">
          <option value="">Todos os partidos</option>
          {partidos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sigla}
            </option>
          ))}
        </select>
        <label className="busca">
          <Icon name="search" size={16} />
          <input placeholder="Pesquisar nome" value={buscaCampo} onChange={(e) => setBuscaCampo(e.target.value)} />
        </label>
      </div>

      <div className="filtros-2">
        <button className={`chip-filtro${top3 ? ' ativo' : ''}`} onClick={() => setTop3(!top3)}>
          Top 3 por cargo e estado
        </button>
        <label className="ordenar">
          <span className="muted">Ordenar por</span>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
            <option value="compat">Compatibilidade</option>
            <option value="nome">Nome</option>
          </select>
        </label>
      </div>

      {erro ? (
        <p className="vazio">Não foi possível carregar: {erro}</p>
      ) : carregandoFiltro ? (
        <Loading texto="Carregando candidatos..." variante="inline" />
      ) : total === 0 ? (
        <p className="vazio">Nenhum candidato com esses filtros.</p>
      ) : (
        <>
          <div className="lista-cab">
            <span>Posição</span>
            <span />
            <span>Nome</span>
            <span className="col-cargo">Cargo</span>
            <span className="col-partido">Partido</span>
            <span className="col-compat">Compatibilidade</span>
            <span />
          </div>
          <div className="lista-scroll" ref={scrollRef} onScroll={onScroll}>
            <ul className="lista">
              {inicio > 0 && <li aria-hidden style={{ height: inicio * ALTURA_SLOT }} />}
              {visiveis.map((it, i) => {
                const idx = inicio + i;
                return (
                  <li key={it.cand.id}>
                    <Link to={`/app/candidato/${it.cand.id}`} className="linha-candidato">
                      <span className="pos">{idx + 1}º</span>
                      <Avatar src={it.cand.foto} nome={it.cand.nome} size={56} />
                      <span className="nome">
                        {it.cand.nome}
                        <small className="so-mobile">
                          {CARGOS[it.cand.cargo]} · {it.party?.sigla ?? 'Sem partido'}
                        </small>
                      </span>
                      <span className="col-cargo">{CARGOS[it.cand.cargo]}</span>
                      <span className="col-partido">
                        <PartyBadge party={it.party} uf={it.cand.uf} />
                      </span>
                      <span className="col-compat">
                        {it.conflito ? (
                          <span className="selo-conflito" title={it.compat!.conflitos.map((c) => c.motivo).join('\n')}>
                            <Icon name="alert" size={14} /> Conflito
                          </span>
                        ) : it.compat?.pct != null ? (
                          <>
                            <span className="nota">{it.compat.pct}%</span>
                            <small className="cobertura" title="Perguntas em que você e o candidato têm resposta, entre as que você respondeu">
                              {it.compat.comparadas} de {it.compat.respondidas} perguntas
                            </small>
                          </>
                        ) : it.temPesquisa ? (
                          <span
                            className="selo-neutro"
                            title={it.compat ? `${it.compat.comparadas} respostas em comum (mínimo ${it.compat.minimo})` : undefined}
                          >
                            Dados insuficientes
                          </span>
                        ) : (
                          <span className="selo-neutro">Não pesquisado</span>
                        )}
                      </span>
                      <span className="mais">
                        <Icon name="plus" size={16} />
                      </span>
                    </Link>
                  </li>
                );
              })}
              {fim < itens.length && <li aria-hidden style={{ height: (itens.length - fim) * ALTURA_SLOT }} />}
            </ul>
            {carregandoMais && <Loading texto="Carregando mais..." variante="inline" />}
          </div>
        </>
      )}

      {user.isAdmin && adicionando && (
        <CandidateForm onClose={() => setAdicionando(false)} onSaved={(id) => navigate(`/app/candidato/${id}`)} />
      )}
    </div>
  );
}
