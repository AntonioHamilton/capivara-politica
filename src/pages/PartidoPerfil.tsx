import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PartyForm } from '../components/Forms.tsx';
import { Posicoes } from '../components/Posicoes.tsx';
import { ResearchModal } from '../components/ResearchModal.tsx';
import { Avatar, Fontes, Icon, Loading, Tabs } from '../components/ui.tsx';
import { Versions } from '../components/Versions.tsx';
import { api } from '../lib/api.ts';
import type { ItemCandidatoLista, PartidoDetalhe } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { dataBR } from '../lib/format.ts';
import { promptPartido } from '../lib/prompt.ts';
import { useStore } from '../lib/store.tsx';
import { CARGOS, ufLabel } from '../lib/types.ts';

type Aba = 'posicoes' | 'candidatos' | 'pesquisas';
const LIMITE_CANDIDATOS = 200;

export function PartidoPerfil() {
  const { id } = useParams();
  const { data } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>('posicoes');
  const [pesquisando, setPesquisando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [candidatos, setCandidatos] = useState<ItemCandidatoLista[]>([]);
  const [totalCandidatos, setTotalCandidatos] = useState<number | null>(null);

  const [item, setItem] = useState<PartidoDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(() => {
    api
      .partido(Number(id))
      .then(setItem)
      .catch(() => setItem(null))
      .finally(() => setCarregando(false));
  }, [id]);

  useEffect(() => {
    setItem(null);
    setCandidatos([]);
    setTotalCandidatos(null);
    setCarregando(true);
    recarregar();
  }, [recarregar]);

  // a lista de candidatos só é pedida quando a aba é aberta
  useEffect(() => {
    if (aba !== 'candidatos') return;
    api.candidatos({ partido: String(id), ordem: 'compat', limit: LIMITE_CANDIDATOS }).then((r) => {
      setCandidatos(r.itens);
      setTotalCandidatos(r.total);
    });
  }, [aba, id]);

  if (carregando) {
    return (
      <div className="pagina">
        <Loading texto="Carregando partido..." variante="inline" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="pagina">
        <Link to="/app/partidos" className="voltar">
          <Icon name="back" /> Voltar para os partidos
        </Link>
        <p className="vazio">Partido não encontrado.</p>
      </div>
    );
  }

  const { party, pesquisa, compat } = item;
  const d = pesquisa?.dados;

  const remover = async () => {
    if (!window.confirm(`Remover o partido ${party.sigla}? As pesquisas salvas dele também serão apagadas.`)) return;
    try {
      await api.deleteParty(party.id);
      navigate('/app/partidos');
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  return (
    <div className="pagina">
      <Link to="/app/partidos" className="voltar">
        <Icon name="back" /> Voltar para os partidos
      </Link>

      <header className="perfil-cab">
        <Avatar src={party.logo} nome={party.sigla} size={112} />
        <div className="perfil-id">
          <h1>{party.sigla}</h1>
          <div className="perfil-linha">
            <span>{party.nome}</span>
            {d?.ideologia_declarada && <span className="selo envolve">{d.ideologia_declarada}</span>}
          </div>
          {pesquisa && <div className="perfil-linha muted">Pesquisado em {dataBR(pesquisa.criadoEm)}</div>}
          {d?.resumo && (
            <p className="resumo">
              {d.resumo} <Fontes fontes={d.fontes} />
            </p>
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
                Remover partido
              </button>
            </div>
          )}
        </div>
        <div className="perfil-nota">
          {compat?.pct != null ? (
            <>
              <span className="nota grande">{compat.pct}%</span>
              <span className="rotulo">COMPATIBILIDADE</span>
              <span className="muted pequeno-texto">
                baseada em {compat.comparadas} de {compat.respondidas} perguntas
              </span>
            </>
          ) : (
            <>
              <span className="selo-neutro envolve">{pesquisa ? 'Dados insuficientes para comparar' : 'Não pesquisado'}</span>
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
          { id: 'posicoes', label: 'Posições' },
          { id: 'candidatos', label: 'Candidatos na lista' },
          { id: 'pesquisas', label: 'Pesquisas' },
        ]}
        value={aba}
        onChange={setAba}
      />

      {aba === 'posicoes' && <Posicoes tipo="partido" quiz={data.quiz} alvo={d?.quiz} />}

      {aba === 'candidatos' &&
        (totalCandidatos === null ? (
          <Loading texto="Carregando candidatos..." variante="inline" />
        ) : candidatos.length ? (
          <>
            <ul className="lista">
              {candidatos.map((i) => (
                <li key={i.cand.id}>
                  <Link to={`/app/candidato/${i.cand.id}`} className="linha-candidato simples">
                    <Avatar src={i.cand.foto} nome={i.cand.nome} size={48} />
                    <span className="nome">{i.cand.nome}</span>
                    <span className="col-cargo">
                      {CARGOS[i.cand.cargo]} · {ufLabel(i.cand.uf)}
                    </span>
                    <span className="col-compat">
                      {i.compat?.pct != null ? <span className="nota">{i.compat.pct}%</span> : <span className="selo-neutro">Sem nota</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {totalCandidatos != null && totalCandidatos > candidatos.length && (
              <p className="muted pequeno-texto">
                Mostrando {candidatos.length} de {totalCandidatos} candidatos deste partido.
              </p>
            )}
          </>
        ) : (
          <p className="vazio">Nenhum candidato deste partido.</p>
        ))}

      {aba === 'pesquisas' && <Versions tipo="partido" entidadeId={party.id} onChange={recarregar} />}

      {user.isAdmin && pesquisando && (
        <ResearchModal
          tipo="partido"
          entidadeId={party.id}
          titulo={party.sigla}
          prompt={promptPartido(party)}
          onClose={() => setPesquisando(false)}
          onSaved={recarregar}
        />
      )}
      {user.isAdmin && editando && <PartyForm party={party} onClose={() => setEditando(false)} onSaved={recarregar} />}
    </div>
  );
}
