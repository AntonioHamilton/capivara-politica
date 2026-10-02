import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { ColinhaCompacta } from '../components/ColinhaCompacta.tsx';
import { Avatar, Loading, PartyBadge } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import type { ColinhaItemPublico, ColinhaPublica, MelhoresColinha, OpcaoColinha, PartidoOpcao } from '../lib/api.ts';
import { estadoMaisProximo } from '../lib/geo.ts';
import { quizCompleto } from '../lib/scoring.ts';
import { useStore } from '../lib/store.tsx';
import { CARGOS, UFS, ufLabel } from '../lib/types.ts';
import type { Cargo } from '../lib/types.ts';

const ORDEM_CARGOS: Cargo[] = ['deputado_federal', 'deputado_estadual', 'senador', 'governador', 'presidente'];

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
const UF_PADRAO = 'SE';

// usado no lugar de fotos externas (bloqueadas por CORS) ao gerar a imagem da colinha
const PLACEHOLDER_FOTO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%232c2c30'/%3E%3Ccircle cx='32' cy='24' r='12' fill='%239b9b94'/%3E%3Cpath d='M12 56c2-14 12-20 20-20s18 6 20 20' fill='%239b9b94'/%3E%3C/svg%3E";

interface Grupo {
  chave: string;
  cargo: Cargo;
  uf: string;
  slot: number | null;
  opcoes: OpcaoColinha[];
}

interface Escolha {
  candidatoId: number | null;
  nomeManual: string;
  numero: string;
}

function rotulo(opcao: OpcaoColinha): string {
  return opcao.numeroUrna ? `${opcao.nome} · ${opcao.numeroUrna}` : opcao.nome;
}

// o número vem da pesquisa em texto livre (pode ter ponto, traço ou espaço) — o campo só aceita dígitos
function soDigitos(numero: string | null | undefined): string {
  return (numero ?? '').replace(/\D/g, '');
}

// fotos externas costumam bloquear CORS e somem do PNG — baixa antes e embute como data URL
async function fotoEmbutida(url: string | null): Promise<string | null> {
  if (!url || url.startsWith('data:')) return url;
  try {
    const resp = await fetch(`/api/foto?url=${encodeURIComponent(url)}`);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function nomeCargo(grupo: Grupo): string {
  if (!grupo.slot) return CARGOS[grupo.cargo];
  return `${grupo.slot}º ${CARGOS[grupo.cargo]}`;
}

// o "melhor" (maior compatibilidade) de cada cargo já vem calculado do servidor — a opção só
// serve aqui pra pegar o número da urna pro preenchimento inicial
function estadoInicial(grupo: Grupo, melhores: MelhoresColinha | undefined): Escolha {
  const idx = (grupo.slot ?? 1) - 1;
  const melhor = melhores?.[grupo.cargo][idx];
  const opcao = melhor ? grupo.opcoes.find((o) => o.id === melhor.id) : undefined;
  return {
    candidatoId: melhor?.id ?? null,
    nomeManual: '',
    numero: soDigitos(opcao?.numeroUrna),
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
  party,
  pct,
}: {
  grupo: Grupo;
  escolha: Escolha;
  onMudar: (escolha: Escolha) => void;
  party: PartidoOpcao | undefined;
  pct: number | null | undefined;
}) {
  const opcao = escolha.candidatoId != null ? grupo.opcoes.find((o) => o.id === escolha.candidatoId) : undefined;
  const digitos = DIGITOS_CARGO[grupo.cargo];

  const selecionarCandidato = (valor: string) => {
    if (!valor) {
      onMudar({ ...escolha, candidatoId: null });
      return;
    }
    const escolhido = grupo.opcoes.find((o) => o.id === Number(valor));
    onMudar({
      candidatoId: Number(valor),
      nomeManual: '',
      numero: soDigitos(escolhido?.numeroUrna),
    });
  };

  const mudarNomeManual = (nomeManual: string) => {
    const achado = grupo.opcoes.find((o) => o.nome.trim().toLowerCase() === nomeManual.trim().toLowerCase());
    if (achado) {
      onMudar({ candidatoId: achado.id, nomeManual: '', numero: soDigitos(achado.numeroUrna) });
      return;
    }
    onMudar({ ...escolha, candidatoId: null, nomeManual });
  };

  const mudarNumero = (numero: string) => {
    const achado = grupo.opcoes.find((o) => soDigitos(o.numeroUrna) === numero);
    if (achado) {
      onMudar({ candidatoId: achado.id, nomeManual: '', numero });
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
          {grupo.opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {rotulo(o)}
            </option>
          ))}
        </select>
        <input
          className="colinha-busca-nome"
          type="text"
          value={escolha.candidatoId == null ? escolha.nomeManual : ''}
          onChange={(e) => mudarNomeManual(e.target.value)}
          placeholder="Procure o nome do seu candidato"
          aria-label={`Nome manual para ${nomeCargo(grupo)}`}
          list={`sugestoes-${grupo.chave}`}
        />
        <datalist id={`sugestoes-${grupo.chave}`}>
          {grupo.opcoes.map((o) => (
            <option key={o.id} value={o.nome} />
          ))}
        </datalist>
      </div>

      <div className="colinha-numero-campo">
        <span className="colinha-numero-label">Número da urna{/^0+$/.test(escolha.numero) && ' — Nulo'}</span>
        <InputNumeroUrna digitos={digitos} valor={escolha.numero} onChange={mudarNumero} label={nomeCargo(grupo)} />
      </div>

      <div className="colinha-cargo-corpo">
        {opcao ? (
          <>
            <div className="colinha-cargo-topo">
              <Avatar src={opcao.foto} nome={opcao.nome} size={64} />
              <div className="colinha-cargo-info">
                <strong>{opcao.nome}</strong>
                <PartyBadge party={party} uf={opcao.uf} />
              </div>
            </div>
            {pct != null ? (
              <span className="nota">{pct}% de compatibilidade</span>
            ) : (
              <span className="selo-neutro">{pct === undefined ? 'Calculando...' : 'Dados insuficientes'}</span>
            )}
          </>
        ) : escolha.nomeManual ? (
          <>
            <div className="colinha-cargo-topo">
              <Avatar src={null} nome={escolha.nomeManual} size={64} />
              <div className="colinha-cargo-info">
                <strong>{escolha.nomeManual}</strong>
              </div>
            </div>
            <span className="selo-neutro">Fora da base — escolha manual</span>
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
  const [ufEscolhida, setUfEscolhida] = useState<string | null>(null);
  const uf = ufEscolhida ?? UF_PADRAO;

  const [opcoesPresidente, setOpcoesPresidente] = useState<OpcaoColinha[]>([]);
  const [presidenteCarregado, setPresidenteCarregado] = useState(false);
  const [opcoesUf, setOpcoesUf] = useState<OpcaoColinha[]>([]);
  const [melhores, setMelhores] = useState<MelhoresColinha | undefined>(undefined);
  const [racaCarregada, setRacaCarregada] = useState(false);
  // true depois da primeira vez que os cargos do estado carregaram — depois disso, trocar de
  // estado não volta pra tela cheia de novo, só mostra o loading no lugar dos cartões que mudam
  const [primeiraRacaPronta, setPrimeiraRacaPronta] = useState(false);
  const [pctPorId, setPctPorId] = useState<Record<number, number | null>>({});

  const [colinhaSalvaResp, setColinhaSalvaResp] = useState<ColinhaPublica | null | undefined>(undefined);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [carregado, setCarregado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const refPng = useRef<HTMLDivElement>(null);
  const [itensPng, setItensPng] = useState<ColinhaItemPublico[] | null>(null);

  const [partidos, setPartidos] = useState<PartidoOpcao[]>([]);
  const [partidosCarregados, setPartidosCarregados] = useState(false);
  const partidosPorId = useMemo(() => new Map(partidos.map((p) => [p.id, p])), [partidos]);

  useEffect(() => {
    api
      .partidosOpcoes()
      .then(setPartidos)
      .finally(() => setPartidosCarregados(true));
  }, []);

  // presidente é nacional (uf=BR), não muda com o estado escolhido — carrega uma vez só, e a
  // lista de opções fica em cache no servidor (não depende do usuário)
  useEffect(() => {
    api.colinhaOpcoes({ cargo: 'presidente', uf: 'BR' }).then((r) => {
      setOpcoesPresidente(r);
      setPresidenteCarregado(true);
    });
  }, []);

  // os demais cargos (governador, senador, deputados) dependem do estado escolhido — a lista de
  // opções é leve/cacheada, e os "melhores" (compatibilidade) são calculados à parte, só pra
  // pré-selecionar, sem mandar a pesquisa de todo mundo do estado pro cliente
  useEffect(() => {
    let ativo = true;
    setRacaCarregada(false);
    Promise.all([api.colinhaOpcoes({ uf }), api.colinhaMelhores(uf)])
      .then(([opcoes, m]) => {
        if (!ativo) return;
        setOpcoesUf(opcoes);
        setMelhores(m);
      })
      .finally(() => {
        if (!ativo) return;
        setRacaCarregada(true);
        setPrimeiraRacaPronta(true);
      });
    return () => {
      ativo = false;
    };
  }, [uf]);

  // busca a colinha já salva do usuário (se existir) uma vez, ao entrar na página
  useEffect(() => {
    api.colinhaSalva().then(setColinhaSalvaResp);
  }, []);

  // pede a localização só se o usuário ainda não escolheu um estado nem tem uma colinha salva
  // com estado definido — silenciosamente ignora se for negado ou indisponível
  useEffect(() => {
    if (ufEscolhida !== null) return;
    if (colinhaSalvaResp === undefined) return;
    if (colinhaSalvaResp?.itens.some((it) => it.uf !== 'BR')) return;
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUfEscolhida(estadoMaisProximo(pos.coords.latitude, pos.coords.longitude)),
      () => {},
      { timeout: 5000, maximumAge: 3600_000 },
    );
  }, [colinhaSalvaResp, ufEscolhida]);

  const opcoes = useMemo(() => [...opcoesPresidente, ...opcoesUf], [opcoesPresidente, opcoesUf]);

  const grupos = useMemo(() => {
    const porCargo = new Map<Cargo, OpcaoColinha[]>();
    for (const o of opcoes) {
      if (!porCargo.has(o.cargo)) porCargo.set(o.cargo, []);
      porCargo.get(o.cargo)!.push(o);
    }
    for (const lista of porCargo.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome));

    const out: Grupo[] = [];
    for (const cargo of ORDEM_CARGOS) {
      const ufDoCargo = cargo === 'presidente' ? 'BR' : uf;
      const opcoesCargo = porCargo.get(cargo) ?? [];
      const slots = SLOTS_CARGO[cargo];
      for (let slot = 1; slot <= slots; slot++) {
        out.push({
          chave: slots > 1 ? `${cargo}:${ufDoCargo}:${slot}` : `${cargo}:${ufDoCargo}`,
          cargo,
          uf: ufDoCargo,
          slot: slots > 1 ? slot : null,
          opcoes: opcoesCargo,
        });
      }
    }
    return out;
  }, [opcoes, uf]);

  const escolhaDe = (grupo: Grupo): Escolha => escolhas[grupo.chave] ?? estadoInicial(grupo, melhores);

  const mudar = (chave: string, escolha: Escolha) => {
    setEscolhas((e) => ({ ...e, [chave]: escolha }));
  };

  const itensPublicos = (): ColinhaItemPublico[] =>
    grupos.map((g) => {
      const escolha = escolhaDe(g);
      const opcao = escolha.candidatoId != null ? g.opcoes.find((o) => o.id === escolha.candidatoId) : undefined;
      return {
        cargo: g.cargo,
        uf: g.uf,
        vaga: g.slot,
        nome: opcao ? opcao.nome : escolha.nomeManual,
        numero: escolha.numero || null,
        foto: opcao?.foto ?? null,
        partido: opcao?.partyId != null ? (partidosPorId.get(opcao.partyId)?.sigla ?? null) : null,
      };
    });

  // já que o "melhor" de cada cargo vem calculado do servidor, aproveita o % que já veio pronto
  // em vez de pedir de novo — só busca sob demanda quando o usuário troca pra outro candidato
  useEffect(() => {
    if (!melhores) return;
    setPctPorId((p) => {
      const novo = { ...p };
      let mudou = false;
      for (const lista of Object.values(melhores)) {
        for (const m of lista) {
          if (!(m.id in novo)) {
            novo[m.id] = m.pct;
            mudou = true;
          }
        }
      }
      return mudou ? novo : p;
    });
  }, [melhores]);

  // busca a compatibilidade de qualquer candidato escolhido manualmente que ainda não conhecemos
  useEffect(() => {
    const faltando = Object.values(escolhas)
      .map((e) => e.candidatoId)
      .filter((id): id is number => id != null && !(id in pctPorId));
    if (!faltando.length) return;
    let ativo = true;
    Promise.all(
      faltando.map((id) =>
        api
          .candidatoCompat(id)
          .then((r) => [id, r.pct] as const)
          .catch(() => [id, null] as const),
      ),
    ).then((pares) => {
      if (!ativo) return;
      setPctPorId((p) => {
        const novo = { ...p };
        for (const [id, pct] of pares) novo[id] = pct;
        return novo;
      });
    });
    return () => {
      ativo = false;
    };
  }, [escolhas, pctPorId]);

  // aplica a colinha salva assim que ela e os candidatos do estado certo estiverem carregados
  // (roda uma única vez — depois disso o usuário já está editando livremente)
  useEffect(() => {
    if (carregado || colinhaSalvaResp === undefined) return;
    const salva = colinhaSalvaResp;
    if (!salva?.itens.length) {
      setCarregado(true);
      return;
    }
    const ufSalva = salva.itens.find((it) => it.uf !== 'BR')?.uf;
    if (ufSalva && ufSalva !== uf) {
      setUfEscolhida(ufSalva);
      return; // espera recarregar as opções pro estado certo antes de tentar casar os nomes
    }
    if (!racaCarregada) return;
    const novas: Record<string, Escolha> = {};
    for (const it of salva.itens) {
      const chave = it.vaga ? `${it.cargo}:${it.uf}:${it.vaga}` : `${it.cargo}:${it.uf}`;
      const achado = opcoes.find((o) => o.cargo === it.cargo && o.uf === it.uf && o.nome === it.nome);
      novas[chave] = achado
        ? { candidatoId: achado.id, nomeManual: '', numero: soDigitos(it.numero) }
        : { candidatoId: null, nomeManual: it.nome, numero: it.numero ?? '' };
    }
    setEscolhas(novas);
    setCarregado(true);
  }, [colinhaSalvaResp, racaCarregada, opcoes, uf, carregado]);

  // salva automaticamente qualquer edição do usuário, uma vez que a colinha salva já foi carregada
  useEffect(() => {
    if (!carregado || !partidosCarregados || Object.keys(escolhas).length === 0) return;
    const t = setTimeout(() => {
      api.saveColinha(itensPublicos()).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhas, carregado, partidosCarregados]);

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

  if (!carregado || !presidenteCarregado || (!racaCarregada && !primeiraRacaPronta)) {
    return (
      <div className="pagina estreita">
        <div className="pagina-topo">
          <h1>Sua colinha</h1>
        </div>
        <Loading texto="Carregando sua colinha..." variante="inline" />
      </div>
    );
  }

  const salvarImagem = async () => {
    setSalvando(true);
    setMsg(null);
    try {
      const itens = await Promise.all(itensPublicos().map(async (it) => ({ ...it, foto: await fotoEmbutida(it.foto) })));
      flushSync(() => setItensPng(itens));
      if (!refPng.current) throw new Error('folha da imagem indisponível');
      const url = await toPng(refPng.current, {
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

      <div className="colinha-folha">
        {grupos.map((g) => {
          // enquanto troca de estado, os cargos que dependem dele ficam com dado do estado
          // anterior até a resposta nova chegar — melhor mostrar o loading do que o valor errado
          if (g.cargo !== 'presidente' && !racaCarregada) return null;
          const escolha = escolhaDe(g);
          const opcao = escolha.candidatoId != null ? g.opcoes.find((o) => o.id === escolha.candidatoId) : undefined;
          return (
            <CartaoCargo
              key={g.chave}
              grupo={g}
              escolha={escolha}
              onMudar={(nova) => mudar(g.chave, nova)}
              party={opcao?.partyId != null ? partidosPorId.get(opcao.partyId) : undefined}
              pct={escolha.candidatoId != null ? pctPorId[escolha.candidatoId] : undefined}
            />
          );
        })}
        {!racaCarregada && <Loading texto="Atualizando candidatos do estado..." variante="inline" />}
      </div>

      {itensPng && (
        <div style={{ position: 'fixed', left: -10000, top: 0 }} aria-hidden="true">
          <ColinhaCompacta ref={refPng} itens={itensPng} formatoImagem />
        </div>
      )}

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
