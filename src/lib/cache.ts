// cache em memória (client-side) pra evitar refazer a mesma busca ao navegar entre telas —
// vale enquanto a aba estiver aberta. Guarda só as últimas MAX_ENTRADAS chamadas (as mais
// antigas saem primeiro), e cada entrada expira depois do TTL.
interface Entrada<T> {
  valor: Promise<T>;
  expiraEm: number;
}

const MAX_ENTRADAS = 60;
const TTL_PADRAO_MS = 10 * 60_000;

const cache = new Map<string, Entrada<unknown>>();

export function cacheado<T>(chave: string, buscar: () => Promise<T>, ttlMs = TTL_PADRAO_MS): Promise<T> {
  const existente = cache.get(chave);
  if (existente && existente.expiraEm > Date.now()) {
    // reinsere no fim do Map: as entradas usadas recentemente sobrevivem à poda
    cache.delete(chave);
    cache.set(chave, existente);
    return existente.valor as Promise<T>;
  }

  const valor = buscar().catch((e) => {
    cache.delete(chave); // não guarda falha em cache — próxima chamada tenta de novo
    throw e;
  });
  cache.delete(chave);
  cache.set(chave, { valor, expiraEm: Date.now() + ttlMs });
  if (cache.size > MAX_ENTRADAS) cache.delete(cache.keys().next().value!);
  return valor;
}

// limpa tudo (ou só as chaves com um prefixo)
export function invalidarCache(prefixo?: string): void {
  if (!prefixo) {
    cache.clear();
    return;
  }
  for (const chave of cache.keys()) if (chave.startsWith(prefixo)) cache.delete(chave);
}

export interface GrupoCandidatos {
  cargo: string;
  uf: string;
}

// invalida as listas de candidatos afetadas por uma mudança em candidatos do(s) grupo(s)
// (cargo+uf) informado(s) — uma lista é afetada se o filtro dela não exclui o grupo. Sem grupo,
// invalida todas. As opções/melhores da Colinha saem junto.
export function invalidarCandidatos(...grupos: GrupoCandidatos[]): void {
  for (const chave of [...cache.keys()]) {
    if (chave.startsWith('colinha-')) {
      cache.delete(chave);
      continue;
    }
    if (!chave.startsWith('candidatos:')) continue;
    if (!grupos.length) {
      cache.delete(chave);
      continue;
    }
    const filtro = new URLSearchParams(chave.slice('candidatos:'.length).replace(/^\?/, ''));
    const afetada = grupos.some((g) => {
      const cargo = filtro.get('cargo');
      const uf = filtro.get('uf');
      return (!cargo || cargo === g.cargo) && (!uf || uf === g.uf);
    });
    if (afetada) cache.delete(chave);
  }
}
