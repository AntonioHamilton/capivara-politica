import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loading } from '../components/ui.tsx';
import { ColinhaCompacta } from '../components/ColinhaCompacta.tsx';
import { api } from '../lib/api.ts';
import type { ColinhaItemPublico } from '../lib/api.ts';

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
      <ColinhaCompacta itens={itens ?? []} />
    </div>
  );
}
