/**
 * Escalonamento de volume do posto em maturação — ADO 68235, lado da tela.
 *
 * O posto que ainda não vende (`A Construir`, `Em Construção`, `Paralisado`)
 * não entrega o volume de regime no primeiro mês. O que o LT informa é o VMM
 * **maturado** (100 %); o volume TOTAL do produto entra em rampa a partir do
 * início de consumo daquela linha:
 *
 * ```
 * mês  1–12  →  50 % do VMM
 * mês 13–24  →  70 % do VMM
 * mês 25+    → 100 % do VMM
 * ```
 *
 * ## Quem decide, e quem só calcula
 *
 * **Quem decide é o backend** (`ProductLine.maturacaoAplicada`), resolvido a
 * partir da situação do posto e GRAVADO na linha — a regra é automática mas não
 * retroativa. A tela nunca refaz esse veredito: ela não tem a situação do posto
 * à mão no card, e derivá-la aqui faria a tela e a cotação enviada ao
 * Salesforce discordarem justamente na proposta antiga.
 *
 * O que vive aqui é a **aritmética**, porque o card "Cálculos automáticos" é
 * derivação local do browser. Mesma divisão (e mesma razão) de
 * `margemMediaPonderada`: `apps/web` não importa de `apps/api`, e os dois lados
 * são presos por teste.
 *
 * ⚠️ **Os fatores são espelho de `apps/api/src/proposals/domain/maturacao-volume.ts`.**
 * Mexer num lado sem o outro faz o volume total da tela divergir do
 * `Total Contratado` que o Salesforce calcula com os mesmos três VMM.
 *
 * ⚠️ **A rampa NÃO entra na TIR/VPL** (decisão do negócio, 21/09/2026): o que
 * o ARP recebe é o volume cheio, como no org. Painel ao vivo, alçada e parecer
 * seguem com os números que sempre tiveram.
 */

/** Os três degraus, como fração do VMM informado. */
export const FATOR_MATURACAO = {
  ano1: 0.5,
  ano2: 0.7,
  ano3: 1,
} as const;

/** Meses de cada degrau. */
export const MESES_POR_DEGRAU = 12;

/**
 * O aviso do bloco "Produtos e simulação comercial" — texto definido pelo
 * negócio no ADO 68235, verbatim.
 */
export const AVISO_MATURACAO =
  "Posto a maturar, aplicado o escalonamento de volume 50%, 70% e 100% do VMM.";

/**
 * Volume total de UMA linha, em m³, ao longo do horizonte dela.
 *
 * É a transcrição da fórmula `QuoteLineItem.Total_Contratado__c` do Salesforce,
 * que é a autoridade sobre a regra:
 *
 * ```
 * HV ≤ 12  → VMM_1 × HV
 * HV ≤ 24  → VMM_1 × 12 + VMM_2 × (HV − 12)
 * HV  > 24 → VMM_1 × 12 + VMM_2 × 12 + VMM_3 × (HV − 24)
 * ```
 *
 * Sem maturação ela colapsa em `volume × hvMeses`, que é o que a plataforma
 * sempre exibiu.
 *
 * ⚠️ **O horizonte é o da LINHA** (`hvMeses`, derivado do início/fim de consumo
 * daquele produto), nunca o prazo do contrato: o chamado diz "a contar da data
 * de início de consumo de cada produto", e a fórmula do org usa exatamente o
 * `Horizonte_De_Vendas__c` da própria linha.
 *
 * Horizonte não-positivo devolve `0` — não há janela sobre a qual somar.
 */
export function volumeTotalDaLinhaM3(
  volumeMensal: number,
  hvMeses: number,
  maturacaoAplicada: boolean,
): number {
  if (!Number.isFinite(volumeMensal) || !Number.isFinite(hvMeses)) return 0;
  if (hvMeses <= 0) return 0;

  if (!maturacaoAplicada) return volumeMensal * hvMeses;

  const ano1 = volumeMensal * FATOR_MATURACAO.ano1;
  const ano2 = volumeMensal * FATOR_MATURACAO.ano2;
  const ano3 = volumeMensal * FATOR_MATURACAO.ano3;

  if (hvMeses <= MESES_POR_DEGRAU) return ano1 * hvMeses;

  if (hvMeses <= MESES_POR_DEGRAU * 2) {
    return ano1 * MESES_POR_DEGRAU + ano2 * (hvMeses - MESES_POR_DEGRAU);
  }

  return (
    ano1 * MESES_POR_DEGRAU +
    ano2 * MESES_POR_DEGRAU +
    ano3 * (hvMeses - MESES_POR_DEGRAU * 2)
  );
}

/**
 * Alguma linha desta proposta escalona?
 *
 * É o que acende o aviso no bloco de produtos. Lista vazia ⇒ `false`: o aviso
 * fala de um escalonamento aplicado, e sem produto não há o que escalonar.
 */
export function temMaturacaoAplicada(
  lines: readonly { maturacaoAplicada?: boolean }[],
): boolean {
  return lines.some((line) => line.maturacaoAplicada === true);
}
