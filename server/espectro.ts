import crypto from 'node:crypto';
import { all, run } from './db.ts';
import { CONTEXTO_ESPECTRO, NIVEIS_ESPECTRO, instrucaoEspectro } from '../src/lib/espectro.ts';
import type { RespostaEspectro, TabelaEspectro } from '../src/lib/espectro.ts';
import { PERGUNTAS } from '../src/lib/questions.ts';

const RESPOSTAS: RespostaEspectro[] = ['sim', 'nao'];
const ESPERA_APOS_FALHA_MS = 60_000;

let proximaTentativa = 0;

// muda quando o texto da pergunta, os níveis ou o contexto mudam — aí o julgamento guardado
// deixa de valer e é refeito
const assinatura = (instrucao: string) =>
  crypto.createHash('sha1').update(JSON.stringify([CONTEXTO_ESPECTRO, NIVEIS_ESPECTRO, instrucao])).digest('hex');

async function julgar(pendentes: { chave: string; instrucao: string }[]): Promise<Record<string, number>> {
  const r = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'jev-latest',
      state: { contexto: CONTEXTO_ESPECTRO },
      questions: Object.fromEntries(pendentes.map((p) => [p.chave, { type: 'score', instructions: p.instrucao, criteria: NIVEIS_ESPECTRO }])),
    }),
  });
  if (!r.ok) throw new Error(`TypeSafe respondeu ${r.status}`);
  const j = (await r.json()) as { answers: Record<string, { score: number }> };
  return Object.fromEntries(pendentes.map((p) => [p.chave, j.answers[p.chave].score]));
}

// devolve a posição (0 a 2) de cada resposta de cada pergunta, completando no banco o que falta.
// Sem chave configurada ou com o serviço fora do ar, devolve só o que já está guardado — e o
// cliente cai no cálculo antigo se a tabela não estiver completa.
export async function tabelaEspectro(): Promise<TabelaEspectro> {
  const guardados = await all<{ chave: string; assinatura: string; score: number }>('SELECT chave, assinatura, score FROM espectro_respostas');
  const porChave = new Map(guardados.map((g) => [g.chave, g]));

  const pendentes: { chave: string; instrucao: string; assinatura: string }[] = [];
  for (const p of PERGUNTAS) {
    for (const resposta of RESPOSTAS) {
      const chave = `${p.id}_${resposta}`;
      const instrucao = instrucaoEspectro(p, resposta);
      const ass = assinatura(instrucao);
      if (porChave.get(chave)?.assinatura !== ass) pendentes.push({ chave, instrucao, assinatura: ass });
    }
  }

  if (pendentes.length && process.env.TYPESAFE_API_KEY && Date.now() >= proximaTentativa) {
    try {
      const scores = await julgar(pendentes);
      for (const p of pendentes) {
        await run('INSERT OR REPLACE INTO espectro_respostas (chave, assinatura, score) VALUES (?, ?, ?)', [p.chave, p.assinatura, scores[p.chave]]);
        porChave.set(p.chave, { chave: p.chave, assinatura: p.assinatura, score: scores[p.chave] });
      }
    } catch (e) {
      console.error('Falha ao consultar o TypeSafe:', e);
      proximaTentativa = Date.now() + ESPERA_APOS_FALHA_MS;
    }
  }

  const tabela: TabelaEspectro = {};
  for (const p of PERGUNTAS) {
    const sim = porChave.get(`${p.id}_sim`);
    const nao = porChave.get(`${p.id}_nao`);
    if (sim && nao) tabela[p.id] = { sim: sim.score, nao: nao.score };
  }
  return tabela;
}
