import type { TipoRegistroRecursoFinanceiro } from '@/lib/picklists/salesforce-values';
import { classifyRecursoFinanceiro } from '@/lib/proposals/financial-resource-rules';
import type { TipoBonificacao } from '@/lib/proposals/financial-resources.types';

/**
 * Derivações sobre os recursos financeiros e os investimentos da proposta para o
 * card "Cálculos automáticos" (ADO — 09/09/2026).
 *
 * Irmão de `product-line-totals.ts`, e pela mesma razão registrada lá: o card é
 * derivação LOCAL no browser, `apps/web` não pode importar de `apps/api`, e os
 * dois lados são presos por testes.
 */

/** Só o que os totais precisam de um recurso — qualquer `FinancialResource` satisfaz. */
export type RecursoParaTotais = {
  tipoRegistro: TipoRegistroRecursoFinanceiro;
  tipoBonificacao: TipoBonificacao | null;
  /** `qtdParcelas × valorParcela`, já derivado pelo backend. */
  valorTotal: number;
};

export interface RecursosTotais {
  /**
   * Bonificações antecipadas + mútuos + novos mútuos + **investimentos**.
   *
   * ⚠️ Os investimentos entram aqui por pedido explícito do negócio, e é isso
   * que faz este número DIVERGIR do `% Antecipação` do card "Painel ao vivo"
   * logo acima — ver {@link RecursosTotais.percentualAntecipados}.
   */
  antecipados: number;
  /** Bonificações postecipadas (por desempenho). */
  postecipados: number;
  /** `antecipados + postecipados`. */
  total: number;
  /**
   * `antecipados / total`, como **fração decimal** (0,75 = 75%) — a mesma
   * convenção de `formatPercentFromDecimal`.
   *
   * `null` — nunca `0` — quando não há denominador: 0 ÷ 0 não é 0%, e um `0%`
   * fabricado se lê na tela como um percentual medido. Mesma regra de
   * `margemMediaPonderada` e de `derivePercentualAntecipacao` no backend.
   *
   * ⚠️ **Deliberadamente DIFERENTE do `percentualAntecipacao`** que o backend
   * persiste em `proposal_indicators.advance_percentage` e que o card "Painel ao
   * vivo" exibe como "% Antecipação": aquele considera SÓ recursos financeiros —
   * é o número que vai ao ARP (TIR/VPL) e à aderência de padrão de BP da SNEG
   * (meta de 40%) — e este soma também os investimentos, por pedido do negócio
   * em 09/09/2026 (*"deve seguir apenas o escopo do que foi pedido … exatamente
   * com os cálculos que estão lá"*). A divergência é decisão de produto e fica
   * registrada aqui em vez de reconciliada em silêncio; se ela incomodar na UAT,
   * o conserto é escolher UMA definição, não alinhar as duas por acidente.
   */
  percentualAntecipados: number | null;
}

/**
 * Reparte os recursos financeiros em antecipados × postecipados e soma os
 * investimentos aos antecipados (ADO — 09/09/2026).
 *
 * As três somas fecham por construção (`total = antecipados + postecipados`),
 * que é o invariante declarado no próprio pedido do negócio.
 *
 * `0` é soma real de nada, e não ausência — é o que a linha "Investimento Vibra"
 * que estas quatro substituem já mostrava (`R$ 0,00`) com a lista vazia. Só o
 * percentual distingue "nada a medir" com `null`.
 *
 * @param totalInvestimentos `totalInvestimentos` da listagem de investimentos —
 * o agregado que o BACKEND deriva (`sumInvestmentsValorFinal`, cuja fórmula foi
 * medida contra 478 linhas do org). Nunca uma soma local de `valorUnitario`.
 */
export function recursosTotais(
  resources: readonly RecursoParaTotais[],
  totalInvestimentos: number,
): RecursosTotais {
  let antecipados = totalInvestimentos;
  let postecipados = 0;

  for (const r of resources) {
    if (classifyRecursoFinanceiro(r.tipoRegistro, r.tipoBonificacao) === 'bonificacao-postecipada') {
      postecipados = round2(postecipados + r.valorTotal);
    } else {
      antecipados = round2(antecipados + r.valorTotal);
    }
  }

  const total = round2(antecipados + postecipados);

  return {
    antecipados,
    postecipados,
    total,
    percentualAntecipados: total > 0 ? antecipados / total : null,
  };
}

/**
 * Arredonda a centavos a cada passo do acúmulo — sem isso dez parcelas de
 * R$ 0,10 somam 0,9999999999999999, e o erro atravessa para o percentual, que é
 * uma divisão. Mesma disciplina de `round2` no backend.
 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
