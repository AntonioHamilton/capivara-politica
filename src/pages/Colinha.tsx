import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { Avatar, PartyBadge } from '../components/ui.tsx';
import { chaveGrupo, useItens } from '../lib/ranking.ts';
import type { Item } from '../lib/ranking.ts';
import { quizCompleto } from '../lib/scoring.ts';
import { useStore } from '../lib/store.tsx';
import { CARGOS, ufLabel } from '../lib/types.ts';
import type { Cargo } from '../lib/types.ts';

const ORDEM_CARGOS: Cargo[] = ['presidente', 'governador', 'senador', 'deputado_federal', 'deputado_estadual'];

const DIGITOS_CARGO: Record<Cargo, number> = {
  presidente: 2,
  governador: 2,
  senador: 3,
  deputado_federal: 4,
  deputado_estadual: 5,
};

// usado no lugar de fotos externas (bloqueadas por CORS) ao gerar a imagem da colinha
const PLACEHOLDER_FOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%232c2c30'/%3E%3Ccircle cx='32' cy='24' r='12' fill='%239b9b94'/%3E%3Cpath d='M12 56c2-14 12-20 20-20s18 6 20 20' fill='%239b9b94'/%3E%3C/svg%3E";

interface Grupo {
  chave: string;
  cargo: Cargo;
  uf: string;
  itens: Item[];
}

type Escolha = { tipo: 'candidato'; id: number } | { tipo: 'manual'; nome: string; numero: string };

function rotulo(item: Item): string {
  const numero = item.pesquisa?.dados.basico.numero_urna;
  return numero ? `${item.cand.nome} · ${numero}` : item.cand.nome;
}

function NumeroUrna({ numero }: { numero: string | null | undefined }) {
  if (!numero) return <span className="colinha-sem-numero muted">Número não informado</span>;
  return (
    <div className="colinha-numero">
      {numero.split('').map((d, i) => (
        <span key={i}>{d}</span>
      ))}
    </div>
  );
}

function BuscaCandidato({
  grupo,
  valorAtual,
  onEscolher,
}: {
  grupo: Grupo;
  valorAtual: string;
  onEscolher: (escolha: Escolha | null) => void;
}) {
  const [texto, setTexto] = useState(valorAtual);
  const [editando, setEditando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTexto(valorAtual);
    setEditando(false);
  }, [valorAtual]);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener('mousedown', fechar);
    return () => window.removeEventListener('mousedown', fechar);
  }, [aberto]);

  const q = editando ? texto.trim().toLowerCase() : '';
  const sugestoes = q
    ? grupo.itens.filter((i) => {
        const numero = i.pesquisa?.dados.basico.numero_urna ?? '';
        return i.cand.nome.toLowerCase().includes(q) || numero.includes(q);
      })
    : grupo.itens;

  const confirmar = () => {
    setAberto(false);
    if (!editando) return;
    const digitado = texto.trim();
    if (!digitado) {
      onEscolher(null);
      return;
    }
    const exato = grupo.itens.find(
      (i) => i.cand.nome.toLowerCase() === digitado.toLowerCase() || i.pesquisa?.dados.basico.numero_urna === digitado,
    );
    if (exato) {
      onEscolher({ tipo: 'candidato', id: exato.cand.id });
      return;
    }
    if (/^\d+$/.test(digitado)) {
      onEscolher({ tipo: 'manual', nome: '', numero: digitado });
    } else {
      onEscolher({ tipo: 'manual', nome: digitado, numero: '' });
    }
  };

  return (
    <div className="colinha-busca" ref={wrapRef}>
      <input
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setEditando(true);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        placeholder="Buscar por nome ou número"
        aria-label={`Escolher ${CARGOS[grupo.cargo]}`}
      />
      {aberto && sugestoes.length > 0 && (
        <ul className="colinha-sugestoes" role="listbox">
          {sugestoes.map((i) => (
            <li key={i.cand.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onEscolher({ tipo: 'candidato', id: i.cand.id });
                  setTexto(rotulo(i));
                  setEditando(false);
                  setAberto(false);
                }}
              >
                {rotulo(i)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CartaoCargo({
  grupo,
  escolha,
  onEscolher,
}: {
  grupo: Grupo;
  escolha: Escolha | undefined;
  onEscolher: (escolha: Escolha | null) => void;
}) {
  const padrao = grupo.itens[0] as Item | undefined;
  const item = escolha?.tipo === 'candidato' ? (grupo.itens.find((i) => i.cand.id === escolha.id) ?? padrao) : escolha ? undefined : padrao;
  const manual = escolha?.tipo === 'manual' ? escolha : null;

  const valorAtual = manual ? manual.nome || manual.numero : item ? rotulo(item) : '';

  return (
    <div className="card colinha-cargo">
      <div className="colinha-cargo-cab">
        <span className="colinha-cargo-nome">
          {CARGOS[grupo.cargo]}
          {grupo.uf !== 'BR' && ` · ${ufLabel(grupo.uf)}`}
        </span>
        <span className="colinha-digitos-tag">{DIGITOS_CARGO[grupo.cargo]} dígitos</span>
      </div>

      <BuscaCandidato grupo={grupo} valorAtual={valorAtual} onEscolher={onEscolher} />

      <div className="colinha-cargo-corpo">
        {manual ? (
          <>
            <NumeroUrna numero={manual.numero || null} />
            <Avatar src={null} nome={manual.nome || '?'} size={64} />
            <div className="colinha-cargo-info">
              <strong>{manual.nome || 'Nome não informado'}</strong>
              <span className="selo-neutro">Fora da base — escolha manual</span>
            </div>
          </>
        ) : item ? (
          <>
            <NumeroUrna numero={item.pesquisa?.dados.basico.numero_urna} />
            <Avatar src={item.cand.foto} nome={item.cand.nome} size={64} />
            <div className="colinha-cargo-info">
              <strong>{item.cand.nome}</strong>
              <PartyBadge party={item.party} uf={item.cand.uf} />
              {item.compat?.pct != null ? (
                <span className="nota">{item.compat.pct}% de compatibilidade</span>
              ) : (
                <span className="selo-neutro">Dados insuficientes</span>
              )}
            </div>
          </>
        ) : (
          <p className="muted pequeno-texto">Nenhum candidato cadastrado nesse cargo. Busque pelo nome ou digite o número.</p>
        )}
      </div>
    </div>
  );
}

export function Colinha() {
  const { data } = useStore();
  const itens = useItens();
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Grupo>();
    for (const it of itens) {
      const chave = chaveGrupo(it.cand);
      if (!mapa.has(chave)) mapa.set(chave, { chave, cargo: it.cand.cargo, uf: it.cand.uf, itens: [] });
      mapa.get(chave)!.itens.push(it);
    }
    for (const g of mapa.values()) {
      g.itens.sort((a, b) => {
        const pa = a.compat?.pct ?? -1;
        const pb = b.compat?.pct ?? -1;
        return pb - pa || a.cand.nome.localeCompare(b.cand.nome);
      });
    }
    return [...mapa.values()].sort(
      (a, b) => ORDEM_CARGOS.indexOf(a.cargo) - ORDEM_CARGOS.indexOf(b.cargo) || a.uf.localeCompare(b.uf),
    );
  }, [itens]);

  if (!quizCompleto(data.quiz)) {
    return (
      <div className="pagina estreita">
        <div className="pagina-topo">
          <h1>Colinha</h1>
        </div>
        <div className="aviso">
          <span>Termine o quiz do seu perfil político para gerar sua colinha personalizada.</span>
          <Link className="btn pequeno" to="/app/quiz">
            Fazer o quiz
          </Link>
        </div>
      </div>
    );
  }

  const escolher = (chave: string, escolha: Escolha | null) => {
    setEscolhas((e) => {
      const copia = { ...e };
      if (escolha) copia[chave] = escolha;
      else delete copia[chave];
      return copia;
    });
  };

  const salvarImagem = async () => {
    if (!ref.current) return;
    setSalvando(true);
    setMsg(null);
    try {
      const url = await toPng(ref.current, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg'),
        skipFonts: true,
        imagePlaceholder: PLACEHOLDER_FOTO,
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = 'minha-colinha-capivara-politica.png';
      a.click();
    } catch {
      setMsg('Não consegui gerar a imagem. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  const compartilhar = async () => {
    setMsg(null);
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Minha colinha — Capivara Política', url });
      } catch {
        // usuário cancelou o compartilhamento
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setMsg('Link copiado.');
    } catch {
      setMsg('Não consegui copiar o link.');
    }
  };

  return (
    <div className="pagina estreita">
      <div className="pagina-topo">
        <div>
          <h1>Sua colinha</h1>
          <p className="muted">
            O candidato mais compatível com você em cada cargo. Busque outro pelo nome ou número — se não estiver na nossa base, fica
            só o que você digitou.
          </p>
        </div>
      </div>

      <div className="colinha-folha" ref={ref}>
        <div className="colinha-marca">
          <img className="marca-img" src="/capivara.png" alt="" /> Capivara Política
        </div>
        {grupos.map((g) => (
          <CartaoCargo key={g.chave} grupo={g} escolha={escolhas[g.chave]} onEscolher={(escolha) => escolher(g.chave, escolha)} />
        ))}
      </div>

      {msg && <p className="aviso-msg">{msg}</p>}
      <div className="colinha-acoes">
        <button className="btn secundario" onClick={salvarImagem} disabled={salvando}>
          {salvando ? 'Gerando...' : 'Salvar imagem'}
        </button>
        <button className="btn" onClick={compartilhar}>
          Compartilhar
        </button>
      </div>
    </div>
  );
}
