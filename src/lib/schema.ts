import { z } from 'zod';
import { PERGUNTAS } from './questions.ts';

const fontes = z.array(z.string()).default([]);

// IAs volta e meia devolvem o número da urna como number em vez de string (é um campo que
// "parece" numérico) — normaliza em vez de rejeitar, já que o valor em si está correto
const numeroUrna = z.preprocess((v) => (typeof v === 'number' ? String(v) : v), z.string().nullish());

// idem para "resumo" das polêmicas: as IAs às vezes usam "descricao" por analogia com propostas
// (mesmo formato titulo+texto), então aceita os dois nomes em vez de perder o conteúdo
const polemicaItem = z.preprocess(
  (v) => {
    if (v && typeof v === 'object' && !('resumo' in v) && 'descricao' in v) {
      const { descricao, ...resto } = v as Record<string, unknown>;
      return { ...resto, resumo: descricao };
    }
    return v;
  },
  z.object({
    titulo: z.string(),
    resumo: z.string().nullish(),
    categoria: z.enum(['corrupcao', 'outra']).nullish(),
    status: z.enum(['condenado', 'investigado', 'acusado', 'noticia']),
    fontes,
  }),
);

const respostaQuiz = z.object({
  resposta: z.enum(['sim', 'nao', 'sem_info']),
  explicacao: z.string().nullish(),
  fontes,
});

const quiz = z.record(z.string(), respostaQuiz);

function exigirTodasAsPerguntas(dados: { quiz: Record<string, unknown> }, ctx: z.RefinementCtx) {
  for (const p of PERGUNTAS) {
    if (!(p.id in dados.quiz)) {
      ctx.addIssue({ code: 'custom', path: ['quiz', p.id], message: 'resposta ausente' });
    }
  }
}

export const candidatoSchema = z
  .object({
    tipo: z.literal('candidato'),
    pesquisado_em: z.string().nullish(),
    basico: z.object({
      nome_civil: z.string().nullish(),
      idade: z.number().nullish(),
      situacao: z.enum(['em_exercicio', 'candidato', 'ex_ocupante']).nullish(),
      cargo_atual: z.string().nullish(),
      numero_urna: numeroUrna,
      redes: z.record(z.string(), z.string().nullable()).nullish(),
      cargos_anteriores: z.array(z.string()).default([]),
      teve_cargo_publico_antes: z.boolean().nullish(),
    }),
    fundo_eleitoral: z.object({
      usou: z.boolean().nullish(),
      valor_reais: z.number().nullish(),
      detalhe: z.string().nullish(),
      fontes,
    }),
    presenca: z.object({
      percentual: z.number().nullish(),
      detalhe: z.string().nullish(),
      fontes,
    }),
    salario: z.object({
      valor_mensal_reais: z.number().nullish(),
      usa_beneficios: z.boolean().nullish(),
      detalhe: z.string().nullish(),
      fontes,
    }),
    declaracoes_stf: z.object({
      resumo: z.string().nullish(),
      fontes,
    }),
    propostas: z
      .array(z.object({ titulo: z.string(), descricao: z.string().nullish(), fontes }))
      .default([]),
    pautas_femininas: z
      .object({
        defende: z.boolean().nullish(),
        itens: z.array(z.object({ titulo: z.string(), descricao: z.string().nullish(), fontes })).default([]),
        resumo: z.string().nullish(),
      })
      .default({ itens: [] }),
    educacao: z
      .object({
        resumo: z.string().nullish(),
        propostas: z.array(z.object({ titulo: z.string(), descricao: z.string().nullish(), fontes })).default([]),
      })
      .default({ propostas: [] }),
    polemicas: z.array(polemicaItem).default([]),
    quiz,
  })
  .superRefine(exigirTodasAsPerguntas);

export const partidoSchema = z
  .object({
    tipo: z.literal('partido'),
    pesquisado_em: z.string().nullish(),
    resumo: z.string().nullish(),
    ideologia_declarada: z.string().nullish(),
    fontes,
    quiz,
  })
  .superRefine(exigirTodasAsPerguntas);

export type CandidatoPesquisa = z.output<typeof candidatoSchema>;
export type PartidoPesquisa = z.output<typeof partidoSchema>;
export type RespostaQuiz = z.output<typeof respostaQuiz>;
