import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PartyForm } from '../components/Forms.tsx';
import { Posicoes } from '../components/Posicoes.tsx';
import { ResearchModal } from '../components/ResearchModal.tsx';
import { Avatar, Fontes, Icon, Tabs } from '../components/ui.tsx';
import { Versions } from '../components/Versions.tsx';
import { api } from '../lib/api.ts';
import { dataBR } from '../lib/format.ts';
import { promptPartido } from '../lib/prompt.ts';
import { useItens, usePartidos } from '../lib/ranking.ts';
import { useStore } from '../lib/store.tsx';
import { CARGOS, ufLabel } from '../lib/types.ts';

type Aba = 'posicoes' | 'candidatos' | 'pesquisas';

export function PartidoPerfil() {
  const { id } = useParams();
  const { data, refresh } = useStore();
  const partidos = usePartidos();
  const itens = useItens();
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>('posicoes');
  const [pesquisando, setPesquisando] = useState(false);
  const [editando, setEditando] = useState(false);

  const item = partidos.find((p) => String(p.party.id) === id);
  if (!item) {
    return (
      <div className="pagina">
        <Link to="/partidos" className="voltar">
          <Icon name="back" /> Voltar para os partidos
        </Link>
        <p className="vazio">Partido não encontrado.</p>
      </div>
    );
  }

  const { party, pesquisa, compat } = item;
  const d = pesquisa?.dados;
  const candidatos = itens.filter((i) => i.cand.partyId === party.id);

  const remover = async () => {
    if (!window.confirm(`Remover o partido ${party.sigla}? As pesquisas salvas dele também serão apagadas.`)) return;
    try {
      await api.deleteParty(party.id);
      await refresh();
      navigate('/partidos');
    } catch (e) {
      window.alert((e as Error).message);
    }
  };

  return (
    <div className="pagina">
      <Link to="/partidos" className="voltar">
        <Icon name="back" /> Voltar para os partidos
      </Link>

      <header className="perfil-cab">
        <Avatar src={party.logo} nome={party.sigla} size={112} />
        <div className="perfil-id">
          <h1>{party.sigla}</h1>
          <div className="perfil-linha">
            <span>{party.nome}</span>
            {d?.ideologia_declarada && <span className="selo">{d.ideologia_declarada}</span>}
          </div>
          {pesquisa && <div className="perfil-linha muted">Pesquisado em {dataBR(pesquisa.criadoEm)}</div>}
          {d?.resumo && (
            <p className="resumo">
              {d.resumo} <Fontes fontes={d.fontes} />
            </p>
          )}
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
              <span className="selo-neutro">{pesquisa ? 'Dados insuficientes para comparar' : 'Não pesquisado'}</span>
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
        (candidatos.length ? (
          <ul className="lista">
            {candidatos.map((i) => (
              <li key={i.cand.id}>
                <Link to={`/candidato/${i.cand.id}`} className="linha-candidato simples">
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
        ) : (
          <p className="vazio">Nenhum candidato deste partido na sua lista.</p>
        ))}

      {aba === 'pesquisas' && <Versions tipo="partido" entidadeId={party.id} />}

      {pesquisando && (
        <ResearchModal
          tipo="partido"
          entidadeId={party.id}
          titulo={party.sigla}
          prompt={promptPartido(party)}
          onClose={() => setPesquisando(false)}
        />
      )}
      {editando && <PartyForm party={party} onClose={() => setEditando(false)} />}
    </div>
  );
}
