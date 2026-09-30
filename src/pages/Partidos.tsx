import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PartyForm } from '../components/Forms.tsx';
import { Avatar, Icon, Loading } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import type { PartidoLista } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';

export function Partidos() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [adicionando, setAdicionando] = useState(false);
  const [partidos, setPartidos] = useState<PartidoLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api
      .partidos()
      .then(setPartidos)
      .catch((e: Error) => setErro(e.message));
  }, []);

  const ordenados = useMemo(
    () => [...(partidos ?? [])].sort((a, b) => (b.compat?.pct ?? -1) - (a.compat?.pct ?? -1) || a.sigla.localeCompare(b.sigla)),
    [partidos],
  );

  return (
    <div className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>Partidos</h1>
          <p className="muted">Pesquise cada partido para ver quais combinam mais com o seu perfil.</p>
        </div>
        {user.isAdmin && (
          <button className="btn" onClick={() => setAdicionando(true)}>
            <Icon name="plus" /> Adicionar partido
          </button>
        )}
      </div>

      {erro ? (
        <p className="vazio">Não foi possível carregar: {erro}</p>
      ) : partidos === null ? (
        <Loading texto="Carregando partidos..." variante="inline" />
      ) : ordenados.length === 0 ? (
        <p className="vazio">Nenhum partido cadastrado. Eles são criados ao adicionar candidatos, ou por aqui.</p>
      ) : (
        <ul className="grade-partidos">
          {ordenados.map((party) => (
            <li key={party.id}>
              <Link to={`/app/partido/${party.id}`} className="card-partido">
                <Avatar src={party.logo} nome={party.sigla} size={56} />
                <span className="nome">
                  {party.sigla}
                  <small>{party.nome}</small>
                </span>
                <span className="col-compat">
                  {party.compat?.pct != null ? (
                    <span className="nota">{party.compat.pct}%</span>
                  ) : (
                    <span className="selo-neutro">{party.pesquisado ? 'Dados insuficientes' : 'Não pesquisado'}</span>
                  )}
                </span>
                <small className="muted">{party.candidatosCount} candidato(s)</small>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {user.isAdmin && adicionando && <PartyForm onClose={() => setAdicionando(false)} onSaved={(id) => navigate(`/app/partido/${id}`)} />}
    </div>
  );
}
