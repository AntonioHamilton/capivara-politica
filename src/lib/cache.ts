// cache em memória (client-side) pra evitar refazer a mesma busca de lista ao navegar entre
// telas — some quando a aba fecha, o que é suficiente pro caso de uso (não precisa persistir).
interface Entrada<T> {
  valor: Promise<T>;
  expiraEm: number;
}

const cache = new Map<string, Entrada<unknown>>();

export function cacheado<T>(chave: string, buscar: () => Promise<T>, ttlMs = 30_000): Promise<T> {
  const existente = cache.get(chave);
  if (existente && existente.expiraEm > Date.now()) return existente.valor as Promise<T>;

  const valor = buscar().catch((e) => {
    cache.delete(chave); // não guarda falha em cache — próxima chamada tenta de novo
    throw e;
  });
  cache.set(chave, { valor, expiraEm: Date.now() + ttlMs });
  return valor;
}

// limpa tudo (ou só as chaves com um prefixo) — chamado depois de qualquer escrita que possa
// mudar o resultado de uma lista já cacheada (quiz, candidatos, pesquisas, import de backup)
export function invalidarCache(prefixo?: string): void {
  if (!prefixo) {
    cache.clear();
    return;
  }
  for (const chave of cache.keys()) if (chave.startsWith(prefixo)) cache.delete(chave);
}
