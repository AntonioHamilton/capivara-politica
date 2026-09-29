import { CARGOS, ufLabel } from './types.ts';
import type { Candidate, Party } from './types.ts';
import { PERGUNTAS } from './questions.ts';
import { candidatoSchema, partidoSchema } from './schema.ts';

const hoje = () => new Date().toISOString().slice(0, 10);

const quizTemplate = () =>
  Object.fromEntries(
    PERGUNTAS.map((p) => [p.id, { resposta: 'sim | nao | sem_info', explicacao: 'até 2 frases', fontes: ['https://...'] }]),
  );

const listaPerguntas = (campo: 'candidato' | 'usuario') => PERGUNTAS.map((p) => `${p.id}: ${p[campo]}`).join('\n');

const regrasComuns = `1. Pesquise na web. Prefira fontes oficiais (TSE, Câmara, Senado, assembleias, Portal da Transparência, sites do partido, Plano de Governo registrado no TSE) e imprensa reconhecida.
2. Não invente nada. Se não encontrar informação confiável, use null nos campos comuns e "sem_info" nas perguntas do quiz.
3. Toda fonte precisa apontar para a matéria, página ou documento específico que comprova a informação — nunca a home genérica de um site (ex: "candidato.com.br" sozinho não vale como fonte; use a URL exata da notícia, proposta, decreto ou lei). Sem uma fonte específica para aquela alegação, não afirme.
4. Seja neutro: descreva fatos e posições declaradas, sem opinar.
5. "explicacao" tem no máximo 2 frases. Prefira sempre dar uma resposta ("sim" ou "nao") a deixar "sem_info" — mesmo uma inferência razoável (pela plataforma do partido, pela coligação, pelo padrão de votos em temas parecidos, por uma declaração antiga e não só da campanha atual) é mais útil que não responder. Deixe claro na explicação quando for inferência e não uma declaração direta. Use "sem_info" só quando não houver nenhum indício razoável, nem direto nem indireto.
6. Valores em reais são números sem aspas (sem "R$" nem separador de milhar). Percentuais vão de 0 a 100. "numero_urna" é sempre string entre aspas, mesmo sendo um número (ex: "numero_urna": "13", nunca "numero_urna": 13).
7. Use exatamente os nomes de campo do modelo JSON abaixo, sem trocar nem inventar nomes (ex: é "resumo" nas polêmicas, não "descricao").
8. Responda somente com um bloco JSON válido, sem texto antes ou depois.`;

export function promptCandidato(c: Candidate, partido: Party | undefined): string {
  const modelo = {
    tipo: 'candidato',
    pesquisado_em: hoje(),
    basico: {
      nome_civil: null,
      idade: null,
      situacao: 'em_exercicio | candidato | ex_ocupante',
      cargo_atual: null,
      numero_urna: null,
      redes: { instagram: null, x: null, facebook: null, youtube: null, site: null },
      cargos_anteriores: [],
      teve_cargo_publico_antes: null,
    },
    fundo_eleitoral: { usou: null, valor_reais: null, detalhe: null, fontes: [] },
    presenca: { percentual: null, detalhe: null, fontes: [] },
    salario: { valor_mensal_reais: null, usa_beneficios: null, detalhe: null, fontes: [] },
    declaracoes_stf: { resumo: null, fontes: [] },
    propostas: [{ titulo: '', descricao: '', fontes: [] }],
    pautas_femininas: { defende: null, itens: [{ titulo: '', descricao: '', fontes: [] }], resumo: null },
    educacao: { resumo: null, propostas: [{ titulo: '', descricao: '', fontes: [] }] },
    polemicas: [
      { titulo: '', resumo: '', categoria: 'corrupcao | outra', status: 'condenado | investigado | acusado | noticia', fontes: [] },
    ],
    quiz: quizTemplate(),
  };

  return `Você é um pesquisador político. Pesquise o candidato abaixo e responda no formato JSON exigido.

CANDIDATO
- Nome: ${c.nome}
- Cargo: ${CARGOS[c.cargo]}
- Estado: ${ufLabel(c.uf)}
- Partido: ${partido ? `${partido.sigla} - ${partido.nome}` : 'não informado'}
- Eleição: 2026
- Data de hoje: ${hoje()}

REGRAS
${regrasComuns}
9. No quiz, responda o que o CANDIDATO defende publicamente. Priorize sempre o que o próprio candidato disse ou fez (votos, projetos, decretos, leis sancionadas, entrevistas, declarações — de qualquer época da vida pública dele, não só da campanha de 2026 atual) sobre esse tema específico. Se o candidato ocupa ou já ocupou cargo eletivo, votos registrados e leis/decretos são a evidência mais forte.
10. Quando não achar posição direta do candidato sobre o tema exato, é válido inferir pela plataforma oficial do partido/coligação, pelo padrão de votos em temas parecidos, ou pela linha que ele nunca contestou publicamente — deixe claro na "explicacao" que é uma inferência (ex: "não há declaração direta, mas o partido/a coligação defende X e ele nunca se posicionou contra"). Use "sem_info" só quando não houver nem evidência direta nem esse tipo de indício razoável.
11. Antes de ir pergunta por pergunta, procure e leia o Plano de Governo do candidato registrado no TSE (busque "[nome do candidato] plano de governo TSE 2026" ou em tse.jus.br/eleicoes/eleicoes-2026-content/propostas-de-governo) e o site oficial de campanha. Isso costuma responder de uma vez várias perguntas de economia, segurança, educação e costumes, já com fonte oficial específica.
12. Nas perguntas q25 e q26, a explicação deve citar exatamente o que o candidato defende do governo Lula e da família Bolsonaro.
13. Corrupção e polêmicas só entram com fonte. Use status "condenado" apenas com condenação que ainda vale (não anulada/revertida), "investigado" para investigação formal, "acusado" para denúncia sem condenação vigente e "noticia" para reportagem sem processo. Use categoria "corrupcao" quando envolver corrupção, desvio ou improbidade. Se não houver nenhuma, deixe a lista vazia.
14. Quem nunca exerceu mandato não tem presença nem salário: use null nesses campos.

CAMPOS
- situacao: "em_exercicio" (ocupa o cargo hoje), "candidato" (disputa 2026 sem ocupar o cargo) ou "ex_ocupante".
- fundo_eleitoral: se recebeu ou usou dinheiro do Fundo Eleitoral (FEFC) e quanto, nas últimas eleições.
- presenca: percentual de presença em votações e sessões do mandato atual.
- salario: remuneração mensal bruta atual do cargo e se usa benefícios (auxílio-paletó, moradia funcional, auxílio-moradia, verba de gabinete e similares).
- declaracoes_stf: resumo das principais declarações do candidato sobre o STF.
- propostas: as 3 principais propostas do candidato.
- pautas_femininas: se o candidato defende pautas femininas e quais, com base em projetos de lei, votos e declarações (por exemplo, aumento de pena para crimes contra a mulher, feminicídio, violência doméstica, igualdade salarial, proteção e acolhimento de vítimas). "defende" é true, false ou null se não houver informação; em "itens" liste cada pauta com título e descrição curta.
- educacao: as principais propostas do candidato para a educação (básica, superior, técnica, financiamento, professores), cada uma com título e descrição curta, e um "resumo" de até 2 frases.
- cargos_anteriores: cargos públicos ou eletivos que já ocupou.

PERGUNTAS DO QUIZ (responda "sim", "nao" ou "sem_info")
${listaPerguntas('candidato')}

FORMATO (preencha e devolva exatamente esta estrutura, com as 30 perguntas q01 a q30)
${JSON.stringify(modelo, null, 2)}`;
}

export function promptPartido(p: Party): string {
  const modelo = {
    tipo: 'partido',
    pesquisado_em: hoje(),
    resumo: 'até 3 frases sobre o partido',
    ideologia_declarada: null,
    fontes: [],
    quiz: quizTemplate(),
  };

  return `Você é um pesquisador político. Pesquise o partido abaixo e responda no formato JSON exigido.

PARTIDO
- Sigla: ${p.sigla}
- Nome: ${p.nome}
- Data de hoje: ${hoje()}

REGRAS
${regrasComuns}
9. No quiz, responda o que o PARTIDO defende oficialmente (programa, estatuto, manifestos) e a orientação de voto da sua bancada no Congresso. Não use posições isoladas de um único filiado.

PERGUNTAS DO QUIZ (responda "sim", "nao" ou "sem_info")
${listaPerguntas('candidato').replaceAll('O candidato', 'O partido')}

FORMATO (preencha e devolva exatamente esta estrutura, com as 30 perguntas q01 a q30)
${JSON.stringify(modelo, null, 2)}`;
}

export function promptCorrecao(erros: string[]): string {
  return `O JSON que você enviou não passou na validação do app. Corrija apenas os problemas abaixo, mantenha o restante e responda somente com o JSON completo e válido, sem texto fora dele.

PROBLEMAS
${erros.map((e) => `- ${e}`).join('\n')}`;
}

function extrairJson(texto: string): unknown {
  const limpo = texto.trim();
  const candidatos = [limpo];
  const cerca = /```(?:json)?\s*([\s\S]*?)```/i.exec(limpo);
  if (cerca) candidatos.push(cerca[1].trim());
  const ini = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (ini >= 0 && fim > ini) candidatos.push(limpo.slice(ini, fim + 1));
  for (const c of candidatos) {
    try {
      return JSON.parse(c);
    } catch {
      continue;
    }
  }
  throw new Error('Não encontrei um JSON válido no texto colado.');
}

export type Leitura<T> = { ok: true; dados: T } | { ok: false; erros: string[] };

export function lerPesquisa(tipo: 'candidato', texto: string): Leitura<import('./schema.ts').CandidatoPesquisa>;
export function lerPesquisa(tipo: 'partido', texto: string): Leitura<import('./schema.ts').PartidoPesquisa>;
export function lerPesquisa(tipo: 'candidato' | 'partido', texto: string): Leitura<any> {
  let bruto: unknown;
  try {
    bruto = extrairJson(texto);
  } catch (e) {
    return { ok: false, erros: [(e as Error).message] };
  }
  const r = (tipo === 'candidato' ? candidatoSchema : partidoSchema).safeParse(bruto);
  if (r.success) return { ok: true, dados: r.data };
  const erros = r.error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(raiz)'}: ${i.message}`);
  const quiz = (bruto as { quiz?: unknown } | null)?.quiz;
  if (quiz && typeof quiz === 'object') {
    for (const p of PERGUNTAS) {
      const msg = `quiz.${p.id}: resposta ausente`;
      if (!(p.id in quiz) && !erros.includes(msg)) erros.push(msg);
    }
  }
  return { ok: false, erros };
}
