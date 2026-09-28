import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar, Loading } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import type { ColinhaItemPublico } from '../lib/api.ts';
import { CARGOS, ufLabel } from '../lib/types.ts';

function NumeroUrna({ numero }: { numero: string | null }) {
  if (!numero) return <span className="colinha-sem-numero muted">Número não informado</span>;
  return (
    <div className="colinha-numero">
      {numero.split('').map((d, i) => (
        <span key={i}>{d}</span>
      ))}
    </div>
  );
}

function CartaoPublico({ item }: { item: ColinhaItemPublico }) {
  return (
    <div className="card colinha-cargo">
      <div className="colinha-cargo-cab">
        <span className="colinha-cargo-nome">
          {item.vaga ? `${item.vaga}º ` : ''}
          {CARGOS[item.cargo]}
          {item.uf !== 'BR' && ` · ${ufLabel(item.uf)}`}
        </span>
      </div>
      <div className="colinha-cargo-corpo">
        <NumeroUrna numero={item.numero} />
        <Avatar src={item.foto} nome={item.nome || '?'} size={64} />
        <div className="colinha-cargo-info">
          <strong>{item.nome || 'Nome não informado'}</strong>
          {item.partido && <span className="selo-neutro">{item.partido}</span>}
        </div>
      </div>
    </div>
  );
}

export function ColinhaPublica() {
  const { token } = useParams<{ token: string }>();
  const [itens, setItens] = useState<ColinhaItemPublico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarLoading, setMostrarLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .colinhaPublica(token)
      .then((r) => setItens(r.itens))
      .catch(() => setErro('Essa colinha não foi encontrada ou o link expirou.'));
  }, [token]);

  if (erro) {
    return (
      <div className="pagina estreita">
        <p className="estado-tela">{erro}</p>
      </div>
    );
  }

  if (mostrarLoading) {
    return <Loading texto="Carregando colinha..." pronto={!!itens} onCompleto={() => setMostrarLoading(false)} />;
  }

  return (
    <div className="pagina estreita">
      <div className="pagina-topo">
        <h1>Colinha</h1>
      </div>
      <div className="colinha-folha">
        <div className="colinha-marca">
          <img className="marca-img" src="/capivara.png" alt="" /> Capivara Política
        </div>
        {(itens ?? []).map((item, i) => (
          <CartaoPublico key={i} item={item} />
        ))}
      </div>
    </div>
  );
}
