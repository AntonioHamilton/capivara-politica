import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { Avatar, PartyBadge } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import type { ColinhaItemPublico } from '../lib/api.ts';
import { useItens } from '../lib/ranking.ts';
import type { Item } from '../lib/ranking.ts';
import { quizCompleto } from '../lib/scoring.ts';
import { useStore } from '../lib/store.tsx';
import { CARGOS, UFS, ufLabel } from '../lib/types.ts';
import type { Cargo } from '../lib/types.ts';

const ORDEM_CARGOS: Cargo[] = ['presidente', 'governador', 'senador', 'deputado_federal', 'deputado_estadual'];

const DIGITOS_CARGO: Record<Cargo, number> = {
  presidente: 2,
  governador: 2,
  senador: 3,
  deputado_federal: 4,
  deputado_estadual: 5,
};

// o Senado renova por 2 vagas na maioria das eleições — os demais cargos têm 1 vaga só
const SLOTS_CARGO: Record<Cargo, number> = {
  presidente: 1,
  governador: 1,
  senador: 2,
  deputado_federal: 1,
  deputado_estadual: 1,
};

const UFS_ORDENADAS = Object.entries(UFS).sort((a, b) => a[1].localeCompare(b[1]));

// usado no lugar de fotos externas (bloqueadas por CORS) ao gerar a imagem da colinha
const PLACEHOLDER_FOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%232c2c30'/%3E%3Ccircle cx='32' cy='24' r='12' fill='%239b9b94'/%3E%3Cpath d='M12 56c2-14 12-20 20-20s18 6 20 20' fill='%239b9b94'/%3E%3C/svg%3E";

interface Grupo {
  chave: string;
  cargo: Cargo;
  uf: string;
  slot: number | null;
  itens: Item[];
}

interface Escolha {
  candidatoId: number | null;
  nomeManual: string;
  numero: string;
}

function rotulo(item: Item): string {
  const numero = item.pesquisa?.dados.basico.numero_urna;
  return numero ? `${item.cand.nome} · ${numero}` : item.cand.nome;
}

function nomeCargo(grupo: Grupo): string {
  if (!grupo.slot) return CARGOS[grupo.cargo];
  return `${grupo.slot}º ${CARGOS[grupo.cargo]}`;
}

function estadoInicial(grupo: Grupo): Escolha {
  const idx = (grupo.slot ?? 1) - 1;
  const padrao = grupo.itens[idx] as Item | undefined;
  return {
    candidatoId: padrao?.cand.id ?? null,
    nomeManual: '',
    numero: padrao?.pesquisa?.dados.basico.numero_urna ?? '',
  };
}

function InputNumeroUrna({
  digitos,
  valor,
  onChange,
  label,
}: {
  digitos: number;
  valor: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setDigito = (i: number, bruto: string) => {
    const d = bruto.replace(/\D/g, '').slice(-1);
    const arr = valor.padEnd(digitos, ' ').split('');
    arr[i] = d || ' ';
    onChange(arr.join('').trimEnd());
    if (d && i < digitos - 1) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !valor[i] && i > 0) refs.current[i - 1]?.focus();
  };

  return (
    <div className="colinha-numero-otp">
      {Array.from({ length: digitos }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={valor[i] ?? ''}
          onChange={(e) => setDigito(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Dígito ${i + 1} do número da urna para ${label}`}
        />
      ))}
    </div>
  );
}

function CartaoCargo({
  grupo,
  escolha,
  onMudar,
}: {
  grupo: Grupo;
  escolha: Escolha;
  onMudar: (escolha: Escolha) => void;
}) {
  const item = escolha.candidatoId != null ? grupo.itens.find((i) => i.cand.id === escolha.candidatoId) : undefined;
  const digitos = DIGITOS_CARGO[grupo.cargo];

  const selecionarCandidato = (valor: string) => {
    if (!valor) {
      onMudar({ ...escolha, candidatoId: null });
      return;
    }
    const escolhido = grupo.itens.find((i) => i.cand.id === Number(valor));
    onMudar({
      candidatoId: Number(valor),
      nomeManual: '',
      numero: escolhido?.pesquisa?.dados.basico.numero_urna ?? '',
    });
  };

  const mudarNomeManual = (nomeManual: string) => {
    const achado = grupo.itens.find((i) => i.cand.nome.trim().toLowerCase() === nomeManual.trim().toLowerCase());
    if (achado) {
      onMudar({ candidatoId: achado.cand.id, nomeManual: '', numero: achado.pesquisa?.dados.basico.numero_urna ?? '' });
      return;
    }
    onMudar({ ...escolha, candidatoId: null, nomeManual });
  };

  const mudarNumero = (numero: string) => {
    const achado = grupo.itens.find((i) => i.pesquisa?.dados.basico.numero_urna === numero);
    if (achado) {
      onMudar({ candidatoId: achado.cand.id, nomeManual: '', numero });
      return;
    }
    onMudar({ ...escolha, numero });
  };

  return (
    <div className="card colinha-cargo">
      <div className="colinha-cargo-cab">
        <span className="colinha-cargo-nome">
          {nomeCargo(grupo)}
          {grupo.uf !== 'BR' && ` · ${ufLabel(grupo.uf)}`}
        </span>
        <span className="colinha-digitos-tag">{digitos} dígitos</span>
      </div>

      <div className="colinha-campos">
        <select
          className="colinha-select"
          value={escolha.candidatoId != null ? String(escolha.candidatoId) : ''}
          onChange={(e) => selecionarCandidato(e.target.value)}
          aria-label={`Escolher ${nomeCargo(grupo)} na lista`}
        >
          <option value="">Fora da base — digitar nome</option>
          {grupo.itens.map((i) => (
            <option key={i.cand.id} value={i.cand.id}>
              {rotulo(i)}
            </option>
          ))}
        </select>
        <input
          className="colinha-busca-nome"
          type="text"
          value={escolha.candidatoId == null ? escolha.nomeManual : ''}
          onChange={(e) => mudarNomeManual(e.target.value)}
          placeholder="Ou digite o nome de quem não está na lista"
          aria-label={`Nome manual para ${nomeCargo(grupo)}`}
        />
      </div>

      <div className="colinha-numero-campo">
        <span className="colinha-numero-label">Número da urna</span>
        <InputNumeroUrna digitos={digitos} valor={escolha.numero} onChange={mudarNumero} label={nomeCargo(grupo)} />
      </div>

      <div className="colinha-cargo-corpo">
        {item ? (
          <>
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
        ) : escolha.nomeManual ? (
          <>
            <Avatar src={null} nome={escolha.nomeManual} size={64} />
            <div className="colinha-cargo-info">
              <strong>{escolha.nomeManual}</strong>
              <span className="selo-neutro">Fora da base — escolha manual</span>
            </div>
          </>
        ) : (
          <p className="muted pequeno-texto">Nenhum candidato cadastrado nesse cargo. Escolha na lista ou digite o nome e o número.</p>
        )}
      </div>
    </div>
  );
}

export function Colinha() {
  const { data } = useStore();
  const itens = useItens();
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // usa a UF mais comum entre os candidatos já cadastrados como sugestão inicial
  const ufPadrao = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const it of itens) {
      if (it.cand.uf === 'BR') continue;
      contagem.set(it.cand.uf, (contagem.get(it.cand.uf) ?? 0) + 1);
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'SE';
  }, [itens]);
  const [ufEscolhida, setUfEscolhida] = useState<string | null>(null);
  const uf = ufEscolhida ?? ufPadrao;

  const grupos = useMemo(() => {
    const porCargo = new Map<Cargo, Item[]>();
    for (const it of itens) {
      const ufDoCargo = it.cand.cargo === 'presidente' ? 'BR' : uf;
      if (it.cand.uf !== ufDoCargo) continue;
      if (!porCargo.has(it.cand.cargo)) porCargo.set(it.cand.cargo, []);
      porCargo.get(it.cand.cargo)!.push(it);
    }
    for (const lista of porCargo.values()) {
      lista.sort((a, b) => {
        const pa = a.compat?.pct ?? -1;
        const pb = b.compat?.pct ?? -1;
        return pb - pa || a.cand.nome.localeCompare(b.cand.nome);
      });
    }

    const out: Grupo[] = [];
    for (const cargo of ORDEM_CARGOS) {
      const ufDoCargo = cargo === 'presidente' ? 'BR' : uf;
      const itensCargo = porCargo.get(cargo) ?? [];
      const slots = SLOTS_CARGO[cargo];
      for (let slot = 1; slot <= slots; slot++) {
        out.push({
          chave: slots > 1 ? `${cargo}:${ufDoCargo}:${slot}` : `${cargo}:${ufDoCargo}`,
          cargo,
          uf: ufDoCargo,
          slot: slots > 1 ? slot : null,
          itens: itensCargo,
        });
      }
    }
    return out;
  }, [itens, uf]);

  const escolhaDe = (grupo: Grupo): Escolha => escolhas[grupo.chave] ?? estadoInicial(grupo);

  const mudar = (chave: string, escolha: Escolha) => {
    setEscolhas((e) => ({ ...e, [chave]: escolha }));
  };

  const itensPublicos = (): ColinhaItemPublico[] =>
    grupos.map((g) => {
      const escolha = escolhaDe(g);
      const item = escolha.candidatoId != null ? g.itens.find((i) => i.cand.id === escolha.candidatoId) : undefined;
      return {
        cargo: g.cargo,
        uf: g.uf,
        vaga: g.slot,
        nome: item ? item.cand.nome : escolha.nomeManual,
        numero: escolha.numero || null,
        foto: item?.cand.foto ?? null,
        partido: item?.party?.sigla ?? null,
      };
    });

  // ao abrir a página, carrega a colinha já salva do usuário (se existir) em vez de
  // sobrescrever com a sugestão automática por compatibilidade
  useEffect(() => {
    let ativo = true;
    api
      .colinhaSalva()
      .then((salva) => {
        if (!ativo || !salva?.itens.length) return;
        const ufSalva = salva.itens.find((it) => it.uf !== 'BR')?.uf;
        if (ufSalva) setUfEscolhida(ufSalva);
        const novas: Record<string, Escolha> = {};
        for (const it of salva.itens) {
          const chave = it.vaga ? `${it.cargo}:${it.uf}:${it.vaga}` : `${it.cargo}:${it.uf}`;
          const achado = itens.find((i) => i.cand.cargo === it.cargo && i.cand.uf === it.uf && i.cand.nome === it.nome);
          novas[chave] = achado
            ? { candidatoId: achado.cand.id, nomeManual: '', numero: it.numero ?? '' }
            : { candidatoId: null, nomeManual: it.nome, numero: it.numero ?? '' };
        }
        setEscolhas(novas);
      })
      .finally(() => {
        if (ativo) setCarregado(true);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // salva automaticamente qualquer edição do usuário, uma vez que a colinha salva já foi carregada
  useEffect(() => {
    if (!carregado || Object.keys(escolhas).length === 0) return;
    const t = setTimeout(() => {
      api.saveColinha(itensPublicos()).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhas, carregado]);

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

  if (!carregado) {
    return (
      <div className="pagina estreita">
        <div className="pagina-topo">
          <h1>Sua colinha</h1>
        </div>
        <p className="muted">Carregando...</p>
      </div>
    );
  }

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
    setCompartilhando(true);
    try {
      const { token } = await api.saveColinha(itensPublicos());
      const url = `${window.location.origin}/colinha/${token}`;
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
        setMsg('Link público copiado.');
      } catch {
        setMsg('Não consegui copiar o link.');
      }
    } catch {
      setMsg('Não consegui gerar o link público. Tente novamente.');
    } finally {
      setCompartilhando(false);
    }
  };

  return (
    <div className="pagina estreita">
      <div className="pagina-topo">
        <div>
          <h1>Sua colinha</h1>
          <p className="muted">
            O candidato mais compatível com você em cada cargo. Escolha outro na lista ou digite o nome e o número — se não estiver na
            nossa base, fica só o que você digitou.
          </p>
        </div>
      </div>

      <div className="colinha-uf-campo">
        <label htmlFor="colinha-uf">Seu estado</label>
        <select id="colinha-uf" value={uf} onChange={(e) => setUfEscolhida(e.target.value)}>
          {UFS_ORDENADAS.map(([sigla, nome]) => (
            <option key={sigla} value={sigla}>
              {nome}
            </option>
          ))}
        </select>
      </div>

      <div className="colinha-folha" ref={ref}>
        <div className="colinha-marca">
          <img className="marca-img" src="/capivara.png" alt="" /> Capivara Política
        </div>
        {grupos.map((g) => (
          <CartaoCargo key={g.chave} grupo={g} escolha={escolhaDe(g)} onMudar={(escolha) => mudar(g.chave, escolha)} />
        ))}
      </div>

      {msg && <p className="aviso-msg">{msg}</p>}
      <div className="colinha-acoes">
        <button className="btn secundario" onClick={salvarImagem} disabled={salvando}>
          {salvando ? 'Gerando...' : 'Salvar imagem'}
        </button>
        <button className="btn" onClick={compartilhar} disabled={compartilhando}>
          {compartilhando ? 'Gerando link...' : 'Compartilhar'}
        </button>
      </div>
    </div>
  );
}
