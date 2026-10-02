import { parseIsoUtc } from './obra-cronograma';

/**
 * O prazo da obra e a unidade do SLA — pedido do negócio em 16/09/2026.
 *
 * > "o prazo é determinado pelo SLA, que é em dias. ou seja, nesse exemplo a
 * > data do prazo seria a data inicio + SLA. (…) ao lado do SLA eu preciso
 * > identificar que o valor é em dias, ficando assim, no exemplo: 37 dias"
 *
 * ## ⚠️ Isto REVISA duas divergências deliberadas do card `Obra · <tipo>`
 *
 * Até esta data o card escrevia o SLA **cru** (`47`, não `"47 dias"`) e exibia
 * como prazo o `FlowEndDate` do Converge, porque a **unidade do SLA não tinha
 * sido confirmada** (evidências §9.6: sempre string, sempre numérico puro, sem
 * unidade no texto, e `HoldTimeInDays` ao lado é outro número). A regra do repo
 * é não fabricar unidade — mas ela vale enquanto ninguém a declara. O negócio
 * declarou: **é em dias**, e é dela que sai o prazo.
 *
 * ⚠️ **Consequência medida:** no callback de evidência (`FlowStartDate` 29/04,
 * `FlowEndDate` 19/08, SLA 47) as duas contas **não coincidem** — o derivado dá
 * 15/06. A regra nova é a que o negócio enunciou, então o derivado **vence** o
 * `FlowEndDate` sempre que houver início e SLA. O `FlowEndDate` continua sendo a
 * reserva (obra cujo callback não traz SLA), porque descartá-lo trocaria uma
 * data publicada pela fonte por um travessão.
 *
 * ## Dias CORRIDOS
 *
 * Não há calendário de dias úteis nesta plataforma nem declaração do Converge a
 * respeito. Corridos é a leitura literal de "em dias" — e é por isso que a conta
 * mora aqui, num ponto só: mudá-la depois é uma linha, não uma caçada.
 */

/**
 * O SLA como número de dias. `null` quando o campo não é inteiro não-negativo.
 *
 * ⚠️ `0` é resposta legítima da fonte (6 dos 79 callbacks medidos) e sobrevive —
 * um truthy check o transformaria em ausência, e "o prazo é hoje" é fato, não
 * lacuna.
 */
export function slaEmDias(sla: string | null | undefined): number | null {
  if (sla === null || sla === undefined) return null;
  const texto = String(sla).trim();
  if (!/^\d+$/.test(texto)) return null;
  const dias = Number(texto);
  return Number.isSafeInteger(dias) ? dias : null;
}

/** `"37"` → `"37 dias"`; `"1"` → `"1 dia"`. Valor não numérico sai CRU. */
export function formatSlaEmDias(sla: string | null | undefined): string | null {
  if (sla === null || sla === undefined) return null;
  const dias = slaEmDias(sla);
  // Sem conseguir lê-lo como número, exibir cru é o honesto: acrescentar "dias"
  // a um valor que não entendemos afirmaria mais do que se sabe.
  if (dias === null) return String(sla);
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

/**
 * A data do prazo: **início + SLA dias corridos**, em `YYYY-MM-DD`.
 *
 * `null` quando falta o início ou o SLA não é legível — e aí quem responde é o
 * `FlowEndDate`, no chamador.
 */
export function prazoDaObra(
  inicio: string | null | undefined,
  sla: string | null | undefined,
): string | null {
  const base = parseIsoUtc(inicio);
  const dias = slaEmDias(sla);
  if (!base || dias === null) return null;

  const alvo = new Date(base.getTime());
  alvo.setUTCDate(alvo.getUTCDate() + dias);
  return alvo.toISOString().slice(0, 10);
}
