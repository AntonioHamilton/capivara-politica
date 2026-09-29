import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PartyForm } from '../components/Forms.tsx';
import { Avatar, Icon } from '../components/ui.tsx';
import { useAuth } from '../lib/auth.tsx';
import { usePartidos } from '../lib/ranking.ts';

export function Partidos() {
  const { user } = useAuth();
  const partidos = usePartidos();
  const navigate = useNavigate();
  const [adicionando, setAdicionando] = useState(false);

  const ordenados = [...partidos].sort(
    (a, b) => (b.compat?.pct ?? -1) - (a.compat?.pct ?? -1) || a.party.sigla.localeCompare(b.party.sigla),
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

      {ordenados.length === 0 ? (
        <p className="vazio">Nenhum partido cadastrado. Eles são criados ao adicionar candidatos, ou por aqui.</p>
      ) : (
        <ul className="grade-partidos">
          {ordenados.map(({ party, compat }) => (
            <li key={party.id}>
              <Link to={`/app/partido/${party.id}`} className="card-partido">
                <Avatar src={party.logo} nome={party.sigla} size={56} />
                <span className="nome">
                  {party.sigla}
                  <small>{party.nome}</small>
                </span>
                <span className="col-compat">
                  {compat?.pct != null ? (
                    <span className="nota">{compat.pct}%</span>
                  ) : (
                    <span className="selo-neutro">{compat ? 'Dados insuficientes' : 'Não pesquisado'}</span>
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
