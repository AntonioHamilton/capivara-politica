import { PERGUNTAS } from './questions.ts';
import type { Pergunta } from './questions.ts';
import type { QuizState } from './types.ts';

// posição de cada resposta possível (sim/não) no espectro, julgada pelo modelo do TypeSafe:
// 0 = esquerda, 1 = centro, 2 = direita. O julgamento é por pergunta+resposta, não por usuário —
// por isso é calculado uma vez, guardado no banco, e a média do usuário é feita no cliente.
export type TabelaEspectro = Record<string, { sim: number; nao: number }>;

export const CONTEXTO_ESPECTRO =
  'Questionário de posicionamento político de eleitores brasileiros, em 2026. No Brasil, a esquerda é o campo do PT e do governo Lula (mais Estado, redistribuição, pautas progressistas, garantismo penal). A direita é o campo bolsonarista, liberal e conservador (menos Estado e impostos, valores conservadores, rigor penal, armas, críticas ao STF, defesa de Bolsonaro e da anistia aos condenados de 8 de janeiro, alinhamento com os EUA). Classifique a posição que a resposta representa nesse debate, não o que é moralmente certo.';

export const NIVEIS_ESPECTRO = [
  'Posição de esquerda: defende mais Estado, redistribuição, pautas progressistas ou o campo político de esquerda',
  'Posição de centro: não se associa claramente à esquerda nem à direita, ou é consenso entre os dois campos',
  'Posição de direita: defende mercado livre, valores conservadores, rigor penal ou o campo político de direita',
];

export type RespostaEspectro = 'sim' | 'nao';

export function instrucaoEspectro(p: Pergunta, resposta: RespostaEspectro): string {
  return `Um eleitor brasileiro respondeu "${resposta === 'sim' ? 'Sim' : 'Não'}" à pergunta: "${p.usuario}". No debate político brasileiro atual, essa resposta é uma posição de esquerda, de centro ou de direita?`;
}

// média das posições das respostas do usuário, de -1 (esquerda) a +1 (direita). Perguntas
// marcadas como "Não sei" não entram. Devolve null se não houver nenhuma resposta comparável.
export function espectroDoUsuario(quiz: QuizState, tabela: TabelaEspectro): number | null {
  let soma = 0;
  let n = 0;
  for (const p of PERGUNTAS) {
    const r = quiz.respostas[p.id];
    const posicao = r && r.r !== 'pular' ? tabela[p.id]?.[r.r] : undefined;
    if (posicao == null) continue;
    soma += posicao - 1;
    n++;
  }
  return n ? soma / n : null;
}
