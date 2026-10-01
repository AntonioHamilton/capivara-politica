const TAMANHO_BLOCO = 1500;
const LIMIAR = 0.7;
const SIMULTANEAS = 8;

export function dividirEmBlocos(texto: string, tamanho = TAMANHO_BLOCO): string[] {
  const limpo = texto.replace(/\s+/g, ' ').trim();
  const blocos: string[] = [];
  for (let i = 0; i < limpo.length; i += tamanho) blocos.push(limpo.slice(i, i + tamanho));
  return blocos;
}

async function relevancia(bloco: string, politico: string): Promise<number> {
  const r = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'jev-latest',
      state: { politico, texto: bloco },
      questions: {
        relevante: {
          type: 'noul',
          instructions: 'O texto traz informação concreta sobre o político indicado?',
          criteria: {
            true: 'Fala de posições, projetos, votos, histórico, patrimônio, processos, controvérsias ou ações do político',
            false: 'Menu, propaganda, rodapé, texto genérico ou assunto sobre outra pessoa',
          },
        },
      },
    }),
  });
  if (!r.ok) throw new Error(`TypeSafe respondeu ${r.status}`);
  const j = (await r.json()) as { answers: { relevante: { noul: number } } };
  return j.answers.relevante.noul;
}

// devolve só os blocos que o Jev julga relevantes para o político, na ordem original
export async function filtrarPorPolitico(texto: string, politico: string, limiar = LIMIAR): Promise<string> {
  const blocos = dividirEmBlocos(texto);
  const notas: number[] = new Array(blocos.length);
  let proximo = 0;

  async function trabalhador() {
    while (proximo < blocos.length) {
      const i = proximo++;
      notas[i] = await relevancia(blocos[i], politico);
    }
  }
  await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, blocos.length) }, trabalhador));

  return blocos.filter((_, i) => notas[i] >= limiar).join('\n');
}
