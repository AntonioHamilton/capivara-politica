import { ORDEM_EIXOS, PERGUNTAS } from './questions.ts';
import type { Eixo } from './questions.ts';
import type { QuizState } from './types.ts';

const MIN_COMPARADAS = 1;

type RespostasAlvo = Record<string, { resposta: 'sim' | 'nao' | 'sem_info' }>;

export interface Conflito {
  id: string;
  motivo: string;
}

export interface Compat {
  pct: number | null;
  comparadas: number;
  respondidas: number;
  minimo: number;
  conflitos: Conflito[];
}

export function compatibilidade(
  quiz: QuizState,
  alvo: RespostasAlvo,
  polemicas: { status: string; categoria?: string | null }[] = [],
): Compat {
  let pesoTotalUsuario = 0;
  let pesoOk = 0;
  let comparadas = 0;
  let respondidas = 0;
  const conflitos: Conflito[] = [];

  for (const p of PERGUNTAS) {
    const u = quiz.respostas[p.id];
    if (!u || u.r === 'pular') continue;
    respondidas++;
    const peso = u.imp ? 3 : 1;
    pesoTotalUsuario += peso;

    const a = alvo[p.id];
    if (!a || a.resposta === 'sem_info') continue;
    comparadas++;
    if (u.r === a.resposta) pesoOk += peso;
    else if (u.imp) conflitos.push({ id: p.id, motivo: `Diverge em algo inegociável: ${p.usuario}` });
  }

  if (quiz.eticaEliminatoria && polemicas.some((x) => x.status === 'condenado' && x.categoria === 'corrupcao')) {
    conflitos.push({ id: 'etica', motivo: 'Tem condenação por corrupção registrada' });
  }

  const minimo = MIN_COMPARADAS;
  return {
    pct: comparadas >= minimo ? Math.round((100 * pesoOk) / pesoTotalUsuario) : null,
    comparadas,
    respondidas,
    minimo,
    conflitos,
  };
}

export function totalRespondidas(quiz: QuizState): number {
  return PERGUNTAS.filter((p) => quiz.respostas[p.id]).length;
}

export function totalComResposta(quiz: QuizState): number {
  return PERGUNTAS.filter((p) => {
    const r = quiz.respostas[p.id];
    return r && r.r !== 'pular';
  }).length;
}

export function quizCompleto(quiz: QuizState): boolean {
  return quiz.eticaEliminatoria !== null && PERGUNTAS.every((p) => quiz.respostas[p.id]);
}

export function posicaoNosEixos(quiz: QuizState): Record<Eixo, number | null> {
  const out = {} as Record<Eixo, number | null>;
  for (const eixo of ORDEM_EIXOS) {
    let soma = 0;
    let n = 0;
    for (const p of PERGUNTAS) {
      if (p.eixo !== eixo) continue;
      const r = quiz.respostas[p.id];
      if (!r || r.r === 'pular') continue;
      soma += p.sinal * (r.r === 'sim' ? 1 : -1);
      n++;
    }
    out[eixo] = n ? soma / n : null;
  }
  return out;
}
