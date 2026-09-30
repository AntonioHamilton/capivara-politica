import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { iniciais } from '../lib/format.ts';
import { api } from '../lib/api.ts';
import type { Party } from '../lib/types.ts';

const ICONES = {
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  star: <polygon points="12 2 15.1 8.6 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.6" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  back: <path d="M15 18l-6-6 6-6" />,
  external: <path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONES;

export function Icon({ name, size = 18, filled = false }: { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONES[name]}
    </svg>
  );
}

export function Avatar({ src, nome, size = 56 }: { src: string | null | undefined; nome: string; size?: number }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [src]);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {src && !falhou ? <img src={src} alt={nome} onError={() => setFalhou(true)} /> : iniciais(nome)}
    </span>
  );
}

export function PartyBadge({ party, uf }: { party: Pick<Party, 'sigla' | 'logo'> | undefined; uf?: string }) {
  if (!party) return <span className="party-badge muted">Sem partido</span>;
  return (
    <span className="party-badge">
      {party.logo && <img src={party.logo} alt="" />}
      <span>
        {party.sigla}
        {uf && uf !== 'BR' ? ` - ${uf}` : ''}
      </span>
    </span>
  );
}

const LOADING_LARGURA_PISTA = 140;
const LOADING_LARGURA_CAPIVARA = 44;

// a barra não tem como saber o progresso real de uma única chamada de API (não há etapas
// para medir) — então ela avança de forma otimista e desacelera perto de 90%, e só quando
// `pronto` chega vai correndo até 100% antes de liberar a próxima tela, pra nunca "travar"
// nem cortar no meio.
export function Loading({
  texto = 'Carregando...',
  pronto = false,
  onCompleto,
  variante = 'tela',
}: {
  texto?: string;
  pronto?: boolean;
  onCompleto?: () => void;
  variante?: 'tela' | 'inline';
}) {
  const [pct, setPct] = useState(0);
  const semAnimacao = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (semAnimacao) {
      if (pronto) {
        setPct(100);
        onCompleto?.();
      } else {
        setPct(90);
      }
      return;
    }

    let frame: number;
    let ultimo = performance.now();

    const tick = (agora: number) => {
      const dt = Math.min(agora - ultimo, 250);
      ultimo = agora;
      setPct((p) => {
        if (pronto) {
          if (p >= 100) {
            onCompleto?.();
            return 100;
          }
          return Math.min(p + dt * 0.4, 100);
        }
        const restante = 90 - p;
        if (restante <= 0.1) return p;
        return p + restante * 0.0018 * dt;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pronto, onCompleto, semAnimacao]);

  const alcance = LOADING_LARGURA_PISTA - LOADING_LARGURA_CAPIVARA;

  return (
    <div className={`loading-tela${variante === 'inline' ? ' inline' : ''}`}>
      <div className="loading-pista" style={{ width: LOADING_LARGURA_PISTA }}>
        <img
          className="loading-capivara"
          style={{ left: (pct / 100) * alcance, width: LOADING_LARGURA_CAPIVARA }}
          src="/capivara.png"
          alt=""
        />
      </div>
      <div className="loading-barra-trilha" style={{ width: LOADING_LARGURA_PISTA }}>
        <div className="loading-barra-preenchimento" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted">{texto}</p>
    </div>
  );
}

export function Modal({ titulo, onClose, children, largo }: { titulo: string; onClose: () => void; children: ReactNode; largo?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${largo ? ' largo' : ''}`} role="dialog" aria-label={titulo}>
        <div className="modal-topo">
          <h2>{titulo}</h2>
          <button className="btn-icone" onClick={onClose} aria-label="Fechar">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={t.id === value} className={t.id === value ? 'ativa' : ''} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Fontes({ fontes }: { fontes: string[] | undefined }) {
  if (!fontes?.length) return null;
  return (
    <span className="fontes">
      {fontes.map((f, i) => (
        <a key={i} href={f} target="_blank" rel="noreferrer noopener">
          fonte {fontes.length > 1 ? i + 1 : ''}
          <Icon name="external" size={12} />
        </a>
      ))}
    </span>
  );
}

export function ImagePicker({
  value,
  onChange,
  nome,
  rotulo,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  nome: string;
  rotulo: string;
}) {
  return (
    <div className="campo">
      <label>{rotulo}</label>
      <div className="image-picker">
        <Avatar src={value} nome={nome || '?'} size={64} />
        <div className="image-picker-campos">
          <input type="url" placeholder="Cole o link da imagem" value={value ?? ''} onChange={(e) => onChange(e.target.value.trim() || null)} />
          {value && (
            <button type="button" className="btn texto pequeno" onClick={() => onChange(null)}>
              Remover
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
