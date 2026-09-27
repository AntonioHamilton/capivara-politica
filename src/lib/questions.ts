export type Eixo = 'economia' | 'costumes' | 'seguranca' | 'instituicoes' | 'alinhamento';

export interface Pergunta {
  id: string;
  eixo: Eixo;
  usuario: string;
  candidato: string;
  sinal: 1 | -1;
}

export const EIXOS: Record<Eixo, { nome: string; negativo: string; positivo: string }> = {
  economia: { nome: 'Economia', negativo: 'Mais Estado', positivo: 'Mais mercado' },
  costumes: { nome: 'Costumes', negativo: 'Progressista', positivo: 'Conservador' },
  seguranca: { nome: 'Segurança e justiça', negativo: 'Garantista', positivo: 'Rigor penal' },
  instituicoes: { nome: 'Instituições', negativo: 'Fortalece instituições', positivo: 'Limita instituições' },
  alinhamento: { nome: 'Espectro político', negativo: 'Esquerda', positivo: 'Direita' },
};

export const ORDEM_EIXOS: Eixo[] = ['economia', 'costumes', 'seguranca', 'instituicoes', 'alinhamento'];

const q = (id: string, eixo: Eixo, sinal: 1 | -1, usuario: string, candidato: string): Pergunta => ({
  id,
  eixo,
  sinal,
  usuario,
  candidato,
});

export const PERGUNTAS: Pergunta[] = [
  q('q01', 'economia', 1, 'Você é a favor da reforma da previdência?', 'O candidato é a favor da reforma da previdência?'),
  q(
    'q02',
    'economia',
    1,
    'Você é a favor de uma reforma administrativa (mudar regras de estabilidade e carreira do funcionalismo)?',
    'O candidato é a favor de uma reforma administrativa (mudar regras de estabilidade e carreira do funcionalismo)?',
  ),
  q('q03', 'economia', 1, 'O governo deveria privatizar mais empresas estatais?', 'O candidato defende privatizar mais empresas estatais?'),
  q(
    'q04',
    'economia',
    -1,
    'O governo deveria aumentar impostos para ampliar programas sociais?',
    'O candidato defende aumentar impostos para ampliar programas sociais?',
  ),
  q(
    'q05',
    'economia',
    1,
    'O governo deveria seguir regras fiscais rígidas, mesmo que isso limite investimentos?',
    'O candidato defende regras fiscais rígidas, mesmo que limitem investimentos?',
  ),
  q(
    'q06',
    'economia',
    -1,
    'O salário mínimo deveria ter aumento real, acima da inflação, garantido por lei?',
    'O candidato defende aumento real do salário mínimo garantido por lei?',
  ),

  q('q07', 'costumes', -1, 'Você é a favor da legalização do aborto?', 'O candidato é a favor da legalização do aborto?'),
  q('q08', 'costumes', -1, 'Você é a favor da legalização da maconha?', 'O candidato é a favor da legalização da maconha?'),
  q(
    'q09',
    'costumes',
    -1,
    'As escolas devem abordar identidade de gênero e diversidade sexual?',
    'O candidato defende que as escolas abordem identidade de gênero e diversidade sexual?',
  ),
  q(
    'q10',
    'costumes',
    -1,
    'Você é a favor do casamento civil entre pessoas do mesmo sexo?',
    'O candidato é a favor do casamento civil entre pessoas do mesmo sexo?',
  ),
  q(
    'q11',
    'costumes',
    1,
    'A religião deveria ter mais influência nas decisões políticas?',
    'O candidato defende maior influência da religião nas decisões políticas?',
  ),
  q(
    'q12',
    'costumes',
    -1,
    'Você é a favor de cotas raciais em universidades e concursos públicos?',
    'O candidato é a favor de cotas raciais em universidades e concursos públicos?',
  ),

  q('q13', 'seguranca', 1, 'Você é a favor da redução da maioridade penal?', 'O candidato é a favor da redução da maioridade penal?'),
  q(
    'q14',
    'seguranca',
    1,
    'Você é a favor de ampliar o acesso da população a armas de fogo?',
    'O candidato é a favor de ampliar o acesso da população a armas de fogo?',
  ),
  q(
    'q15',
    'seguranca',
    1,
    'Você é a favor de endurecer as penas para crimes violentos?',
    'O candidato é a favor de endurecer as penas para crimes violentos?',
  ),
  q(
    'q16',
    'seguranca',
    1,
    'Policiais deveriam ter mais proteção jurídica em operações (ampliar o excludente de ilicitude)?',
    'O candidato defende mais proteção jurídica para policiais em operações (ampliar o excludente de ilicitude)?',
  ),
  q(
    'q17',
    'seguranca',
    -1,
    'Você é a favor das audiências de custódia e das penas alternativas à prisão?',
    'O candidato é a favor das audiências de custódia e das penas alternativas à prisão?',
  ),
  q(
    'q18',
    'seguranca',
    1,
    'Facções criminosas devem ser classificadas como organizações terroristas?',
    'O candidato defende classificar facções criminosas como organizações terroristas?',
  ),

  q('q19', 'instituicoes', 1, 'Você acha que o STF tem poder demais?', 'O candidato afirma que o STF tem poder demais?'),
  q(
    'q20',
    'instituicoes',
    1,
    'Você é a favor de limitar decisões individuais (monocráticas) de ministros do STF?',
    'O candidato é a favor de limitar decisões individuais (monocráticas) de ministros do STF?',
  ),
  q(
    'q21',
    'instituicoes',
    1,
    'Você é a favor de mandato com prazo fixo para ministros do STF?',
    'O candidato é a favor de mandato com prazo fixo para ministros do STF?',
  ),
  q('q22', 'instituicoes', 1, 'Você é a favor do voto impresso auditável?', 'O candidato é a favor do voto impresso auditável?'),
  q(
    'q23',
    'instituicoes',
    -1,
    'As plataformas digitais deveriam ser responsabilizadas pelo conteúdo publicado por usuários?',
    'O candidato defende responsabilizar as plataformas digitais pelo conteúdo publicado por usuários?',
  ),
  q(
    'q24',
    'instituicoes',
    1,
    'O Congresso deveria poder anular decisões do STF?',
    'O candidato defende que o Congresso possa anular decisões do STF?',
  ),

  q('q25', 'alinhamento', -1, 'Você apoia o governo Lula?', 'O candidato apoia o governo Lula? (cite o que defende do governo)'),
  q(
    'q26',
    'alinhamento',
    1,
    'Você defende as pautas da família Bolsonaro?',
    'O candidato defende pautas ou ações da família Bolsonaro? (cite o que defende)',
  ),
  q(
    'q27',
    'alinhamento',
    1,
    'Você é a favor da anistia aos condenados pelos atos de 8 de janeiro?',
    'O candidato é a favor da anistia aos condenados pelos atos de 8 de janeiro?',
  ),
  q('q28', 'alinhamento', -1, 'Você aprova a política externa do atual governo?', 'O candidato aprova a política externa do atual governo?'),
  q(
    'q29',
    'alinhamento',
    1,
    'Você é a favor de que Jair Bolsonaro possa voltar a disputar eleições?',
    'O candidato é a favor de que Jair Bolsonaro possa voltar a disputar eleições?',
  ),
  q(
    'q30',
    'alinhamento',
    1,
    'O Brasil deveria se aproximar mais dos EUA do que do bloco BRICS?',
    'O candidato defende que o Brasil se aproxime mais dos EUA do que do bloco BRICS?',
  ),
];

export const PERGUNTA_ETICA =
  'Um histórico de corrupção comprovada (condenação) deve eliminar um candidato para você?';

export const PERGUNTAS_POR_ID: Record<string, Pergunta> = Object.fromEntries(PERGUNTAS.map((p) => [p.id, p]));
