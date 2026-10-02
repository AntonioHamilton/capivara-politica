import { forwardRef } from 'react';
import { Avatar } from './ui.tsx';
import type { ColinhaItemPublico } from '../lib/api.ts';
import { CARGOS } from '../lib/types.ts';

function rotuloCargo(item: ColinhaItemPublico): string {
  return `${item.vaga ? `${item.vaga}º ` : ''}${CARGOS[item.cargo]}`;
}

const ehNulo = (numero: string | null) => !!numero && /^0+$/.test(numero);

function Linha({ item }: { item: ColinhaItemPublico }) {
  const nulo = ehNulo(item.numero);
  return (
    <div className="colinha-linha">
      <span className="colinha-linha-cargo">{rotuloCargo(item)}</span>
      <span className="colinha-linha-numero">{nulo ? 'Nulo' : item.numero || '—'}</span>
      <Avatar src={nulo ? null : item.foto} nome={nulo ? 'Nulo' : item.nome || '?'} size={44} />
      <div className="colinha-linha-info">
        <strong>{nulo ? 'Voto nulo' : item.nome || 'Nome não informado'}</strong>
        {item.partido && <span>{item.partido}</span>}
      </div>
    </div>
  );
}

// folha enxuta (cargo, número, foto, nome e partido) — usada no PNG e na página pública
export const ColinhaCompacta = forwardRef<HTMLDivElement, { itens: ColinhaItemPublico[]; formatoImagem?: boolean }>(
  function ColinhaCompacta({ itens, formatoImagem = false }, ref) {
    return (
      <div className={formatoImagem ? 'colinha-compacta colinha-compacta-img' : 'colinha-compacta'} ref={ref}>
        <div className="colinha-compacta-titulo">
          <img src="/capivara.png" alt="" /> Capivara Política
        </div>
        <div className="colinha-compacta-lista">
          {itens.map((item, i) => (
            <Linha key={i} item={item} />
          ))}
        </div>
      </div>
    );
  },
);
