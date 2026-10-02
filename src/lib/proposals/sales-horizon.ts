/**
 * Horizonte de vendas — espelho de `apps/api/src/proposals/domain/sales-horizon.ts`.
 *
 * O valor é **derivado** da janela de análise (meses-calendário, inclusive as
 * duas pontas) e medido em **meses**, como `Quote.Horizonte_De_Vendas__c`. Aqui a
 * derivação existe só para o resumo do card mostrar a referência ao LT enquanto
 * ele preenche — quem grava é o backend, que refaz a conta a partir das mesmas
 * datas. Nenhum valor de horizonte viaja no payload.
 *
 * A contagem é de meses-calendário porque o org restringe a janela ao mês
 * fechado (`Data_Inicio_Analise_Primeiro_Dia` exige o dia 1;
 * `Data_Fim_Analise_Ultimo_Dia` exige o último dia): 01/09 → 30/09 é 1 mês, não
 * 0,97.
 */

/** `YYYY-MM-DD` (formato do `<input type="date">`); vazio ⇒ `null`. */
function toParts(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
}

/**
 * Meses entre início e fim da análise, inclusive ambos.
 *
 * `null` quando falta data ou o fim antecede o início — "não sei", que é
 * diferente de zero.
 */
export function deriveSalesHorizonMonths(
  dataInicioAnalise: string,
  dataFimAnalise: string,
): number | null {
  const start = toParts(dataInicioAnalise);
  const end = toParts(dataFimAnalise);
  if (!start || !end) return null;

  const months = (end.year - start.year) * 12 + (end.month - start.month) + 1;
  return months >= 1 ? months : null;
}

/** Rótulo pt-BR do horizonte; `—` quando não há como calcular (nunca "0 meses"). */
export function formatSalesHorizon(months: number | null): string {
  if (months === null) return '—';
  return months === 1 ? '1 mês' : `${months} meses`;
}
