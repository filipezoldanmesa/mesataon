import type { PillVariant } from '@/components/status-pill';
import type { Parecer } from '@/lib/opportunities/parecer.types';

/**
 * A linha "Parecer SNEG" do painel de andamento da análise (ADO 67996).
 *
 * ## O que isto conserta
 *
 * *"Conforme história, não aparece a opção não iniciado, em análise e enviado
 * referente ao parecer."* O Test Case filho (**67414** — `[UAT] SNEG-LT-F-004`)
 * é literal sobre os três momentos e os três rótulos:
 *
 * > Dado que o LT está na visão de análise em três momentos: antes do parecer,
 * > durante a elaboração e após a emissão · Quando o usuário observa a linha
 * > **"Parecer SNEG"** do painel "Andamento da análise" · Validar: a linha
 * > exibe, respectivamente, **"Não iniciado"**, **"Em elaboração"** e
 * > **"Emitido"**.
 *
 * A linha existe no protótipo do LT (`01c-oportunidade-analise-lt.html:165`,
 * `<span class="pill i">Em elaboração</span>`) e **não** no do analista
 * (`01c-oportunidade-analise.html`, cujo card "Análises" termina em "Alçada
 * sugerida" e "Recomendação"). Quando as duas telas viraram UMA — o
 * `SnegAnaliseShell`, em 25/08/2026, porque a visão do LT tinha ficado
 * estritamente mais pobre — o painel adotado foi o do analista, e a linha do
 * parecer se perdeu junto: medido em 04/09/2026 na `OPP-2026-000041`, cujo
 * parecer está `concluido`, o card não tinha nenhuma linha sobre ele.
 *
 * ## Por que é um módulo, e não um `switch` no componente
 *
 * "Recomendação" e "Alçada sugerida" já saem do MESMO `parecer` que esta linha
 * lê, na mesma coluna. Uma quarta derivação escrita inline ao lado das outras
 * três é o formato que já custou a este repo três cópias divergentes da linha
 * "Perfil / Risco" (ADO 67983, corrigido no mesmo PR). Aqui a regra tem um dono,
 * e o teste dela é de unidade.
 *
 * ⚠️ **Os rótulos são os do Test Case, verbatim** — não os do enum do backend
 * (`rascunho`/`concluido`) nem os de nenhuma outra tela. Renomeá-los é
 * renegociar o critério de aceite; há teste aferindo as três strings.
 */
export type ParecerAndamento = {
  /** Texto da pill, em pt-BR. */
  label: string;
  variant: PillVariant;
};

/**
 * O andamento do parecer técnico da SNEG, a partir do parecer corrente.
 *
 * `null` — o que `getParecer` devolve no 404 — é **"Não iniciado"**, e não uma
 * lacuna: o parecer só existe depois de `POST .../parecer:gerar`, então a
 * ausência é um estado de negócio legítimo (o primeiro dos três momentos do TC),
 * não "não deu para ler". Falha de leitura é outro ramo, e quem o trata é o
 * `useLoad` do componente (`RowUnavailable`).
 *
 * ⚠️ **Status fora do vocabulário cai em "Em elaboração", nunca em "Não
 * iniciado" nem em "Emitido".** Um parecer existe (a linha veio do backend), e
 * as duas pontas seriam afirmações falsas em direções opostas: "Não iniciado"
 * negaria um documento que está lá, e "Emitido" anunciaria como concluída uma
 * análise cujo estado ninguém leu — e é essa a linha que o LT usa para saber se
 * pode esperar o veredito. O meio é a única leitura honesta.
 */
export function andamentoDoParecer(parecer: Parecer | null): ParecerAndamento {
  if (!parecer) return { label: 'Não iniciado', variant: 'neutral' };

  if (parecer.status === 'concluido') {
    return { label: 'Emitido', variant: 'success' };
  }

  // `rascunho` e qualquer valor desconhecido — ver o aviso do docblock.
  // `pill i` do protótipo = a família informativa do design system.
  return { label: 'Em elaboração', variant: 'info' };
}
