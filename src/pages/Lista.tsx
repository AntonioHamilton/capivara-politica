import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CandidateForm } from '../components/Forms.tsx';
import { Avatar, Icon, PartyBadge } from '../components/ui.tsx';
import { useItens } from '../lib/ranking.ts';
import type { Item } from '../lib/ranking.ts';
import { useAuth } from '../lib/auth.tsx';
import { totalRespondidas } from '../lib/scoring.ts';
import { useStore } from '../lib/store.tsx';
import { CARGOS, UFS } from '../lib/types.ts';

type Ordem = 'compat' | 'nome';

function ordemCompat(a: Item, b: Item): number {
  const peso = (i: Item) => (i.conflito ? 2 : i.compat?.pct != null ? 0 : 1);
  return peso(a) - peso(b) || (b.compat?.pct ?? 0) - (a.compat?.pct ?? 0) || a.cand.nome.localeCompare(b.cand.nome);
}

export function Lista() {
  const { data } = useStore();
  const { user } = useAuth();
  const itens = useItens();
  const navigate = useNavigate();
  const [adicionando, setAdicionando] = useState(false);
  const [cargo, setCargo] = useState('');
  const [uf, setUf] = useState('');
  const [partido, setPartido] = useState('');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('compat');
  const [top3, setTop3] = useState(false);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens
      .filter((i) => (!cargo || i.cand.cargo === cargo) && (!uf || i.cand.uf === uf))
      .filter((i) => !partido || String(i.cand.partyId) === partido)
      .filter((i) => !q || i.cand.nome.toLowerCase().includes(q))
      .filter((i) => !top3 || (i.rank != null && i.rank <= 3))
      .sort(ordem === 'nome' ? (a, b) => a.cand.nome.localeCompare(b.cand.nome) : ordemCompat);
  }, [itens, cargo, uf, partido, busca, ordem, top3]);

  const quizIncompleto = totalRespondidas(data.quiz) < 30;

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Candidatos</h1>
          <p className="muted">
            {itens.length} na sua lista · {itens.filter((i) => i.pesquisa).length} pesquisados
          </p>
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
          <Link className="btn pequeno" to="/quiz">
            {totalRespondidas(data.quiz) === 0 ? 'Fazer o quiz' : 'Continuar o quiz'}
          </Link>
        </div>
      )}

      <div className="filtros">
        <select value={cargo} onChange={(e) => setCargo(e.target.value)} aria-label="Cargo">
          <option value="">Todos os cargos</option>
          {Object.entries(CARGOS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={uf} onChange={(e) => setUf(e.target.value)} aria-label="Estado">
          <option value="">Todos os estados</option>
          <option value="BR">Brasil (presidente)</option>
          {Object.entries(UFS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={partido} onChange={(e) => setPartido(e.target.value)} aria-label="Partido">
          <option value="">Todos os partidos</option>
          {data.parties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sigla}
            </option>
          ))}
        </select>
        <label className="busca">
          <Icon name="search" size={16} />
          <input placeholder="Pesquisar nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
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

      {itens.length === 0 ? (
        <p className="vazio">Sua lista está vazia. Adicione os candidatos que você quer analisar.</p>
      ) : visiveis.length === 0 ? (
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
          <ul className="lista">
            {visiveis.map((it, idx) => (
              <li key={it.cand.id}>
                <Link to={`/candidato/${it.cand.id}`} className="linha-candidato">
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
                    ) : it.pesquisa ? (
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
            ))}
          </ul>
        </>
      )}

      {user.isAdmin && adicionando && (
        <CandidateForm onClose={() => setAdicionando(false)} onSaved={(id) => navigate(`/candidato/${id}`)} />
      )}
    </div>
  );
}
