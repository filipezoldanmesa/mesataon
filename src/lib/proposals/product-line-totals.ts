/**
 * Derivations over a proposal's product lines for the "Cálculos automáticos"
 * card (Bug 67537 / VBR-570).
 */

import { volumeTotalDaLinhaM3 } from "@/lib/proposals/maturacao-volume";

/** Only the two fields the weighted average needs — any `ProductLine` satisfies it. */
type VolumeWeightedMargin = {
  /** Commercial volume, in m³/mês. */
  volume: number;
  /** Proposed margin, in R$/m³ (`precoFinal = cpv + margemProposta`). */
  margemProposta: number;
};

/**
 * Volume-weighted average of the proposed margins, in **R$/m³**:
 *
 *   [(volume × margem)₁ + (volume × margem)₂ + …] / Σ volumes
 *
 * Same formula as `weightedAverage` in the API's
 * `proposals/domain/scenario-comparison-calculator.ts`, which aggregates the
 * margin of a scenario. It is repeated here rather than shared because the
 * card is a local derivation on the browser side and `apps/web` cannot import
 * from `apps/api`; the two are pinned by tests on both sides.
 *
 * Returns `null` — never `0` — when there is no volume to weight by: a zero
 * denominator has no weighted average, and `0` would read on screen as a
 * margin of zero ("null ≠ 0"). With the API enforcing `@IsPositive()` on
 * `volume`, that means "no product lines yet".
 *
 * Note this deliberately differs from the API helper, which falls back to a
 * plain (unweighted) average when the total volume is zero. Under a label that
 * promises a volume weighting, a plain average would be the wrong number
 * silently; the scenario comparison has its own reason for that fallback.
 */
export function margemMediaPonderada(lines: readonly VolumeWeightedMargin[]): number | null {
  const totalVolume = lines.reduce((sum, l) => sum + l.volume, 0);
  if (totalVolume === 0) return null;

  return lines.reduce((sum, l) => sum + l.volume * l.margemProposta, 0) / totalVolume;
}

/** Só os campos que o volume total lê — qualquer `ProductLine` satisfaz. */
type VolumeOverHorizon = {
  /** Volume comercial, em m³/**mês**. */
  volume: number;
  /** Horizonte de vendas da linha, em meses (derivado de início/fim de consumo). */
  hvMeses: number;
  /**
   * Veredito do backend: o posto estava em maturação quando a linha foi salva
   * (ADO 68235). Ausente em payload anterior à entrega ⇒ sem escalonamento,
   * que é o comportamento de sempre.
   */
  maturacaoAplicada?: boolean;
};

/**
 * Volume MENSAL somado sobre as linhas, em m³/mês — o **VMM** do card
 * "Cálculos automáticos" (ADO — 11/09/2026).
 *
 * ⚠️ O rótulo era "Volume total (efetivo)" e o número sempre foi este: a soma
 * dos `volume` das linhas, que são m³/**mês**. É o mesmo `monthlyVolumeM3` que
 * o backend grava em `opportunities.vmm` e manda ao ARP. A correção do ticket é
 * de RÓTULO — o número não mudou —, e ela existe porque "Volume total" ao lado
 * de um valor mensal é o tipo de lacuna indistinguível do correto na tela.
 */
export function vmmM3PorMes(lines: readonly { volume: number }[]): number {
  return lines.reduce((sum, l) => sum + l.volume, 0);
}

/**
 * Volume total da proposta, em m³: Σ (volume mensal × horizonte de vendas da
 * própria linha) — "o somatório do volume total de todos os produtos"
 * (ADO — 11/09/2026).
 *
 * ⚠️ O prazo é o **`hvMeses` DE CADA LINHA**, não o prazo do contrato da
 * proposta: cada produto tem a sua janela de consumo (RN-F5-04), e uma linha
 * que só consome em parte do contrato entregaria volume a mais se multiplicada
 * pelo prazo cheio. Mesma composição que a receita prevista do comparativo de
 * cenários no backend (`scenario-comparison-calculator.ts`: `volume ×
 * precoFinal × hvMeses`).
 *
 * ⚠️ **Linha de posto em maturação entra ESCALONADA** (ADO 68235): 50 % do VMM
 * nos 12 primeiros meses de consumo dela, 70 % nos 12 seguintes, 100 % daí em
 * diante — ver `maturacao-volume.ts`. Quem decide é o backend
 * (`maturacaoAplicada`), gravado na linha; aqui só se aplica a aritmética.
 *
 * Sem linhas o resultado é `0` — soma real sobre nada, ao contrário da margem
 * ponderada, cujo denominador não existe.
 */
export function volumeTotalM3(lines: readonly VolumeOverHorizon[]): number {
  return lines.reduce(
    (sum, l) =>
      sum +
      volumeTotalDaLinhaM3(l.volume, l.hvMeses, l.maturacaoAplicada === true),
    0,
  );
}

/**
 * `R$/m³` do card: **Recursos Totais ÷ Volume total**, os dois números que o
 * próprio card já exibe (ADO — 11/09/2026). Quanto a Vibra desembolsa por metro
 * cúbico contratado.
 *
 * ⚠️ **Não confundir com o `R$ / m³` do "Painel ao vivo"**, que é o
 * `indiceRealL` do ARP convertido para R$/m³ — outro número, de outra fonte, e
 * hoje quase sempre vazio ("Não informado pelo ARP"). Este é derivação local,
 * como o resto do card.
 *
 * `null` — nunca `0` — quando não há volume para dividir: um `R$ 0,00 /m³` se
 * leria como desembolso apurado.
 */
export function reaisPorM3(
  recursosTotais: number,
  volumeTotal: number,
): number | null {
  if (volumeTotal <= 0) return null;

  return recursosTotais / volumeTotal;
}
