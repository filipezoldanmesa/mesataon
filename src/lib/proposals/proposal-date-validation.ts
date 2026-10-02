import { formatIsoDate } from '@/lib/clients/format';

import type { ProposalDateConstraints } from './proposal-creation.types';

/**
 * Mirrors the backend guard on the proposal's analysis window (`assertValidDateRange`
 * in `apps/api/src/proposals/proposals.service.ts`) AND the org's own rules on
 * `Quote`, so the form can say what is wrong WHILE the user types instead of
 * after `POST .../proposals` replies 400 — or, worse, weeks later when the
 * alçada saga posts the Quote and the org rolls the whole graph back.
 *
 * Four rules:
 *  1. `fim >= inicio` — self-evident from the two inputs, computed locally.
 *  2. `fim >= constraints.minDataFimAnalise` (RN-F5-04) — consumption only starts
 *     on the 1st of the next month, so an analysis ending before that leaves an
 *     EMPTY consumption window and the proposal is born impossible to complete.
 *  3. `inicio >= constraints.minDataInicioAnalise` — the org's
 *     `Data_Inicio_Analise_Mes_Seguite_Criacao` (active, NO profile exemption)
 *     refuses the Quote insert when the analysis starts before the earliest
 *     month the rule allows. Measured against the UAT org on 12/08/2026: this is
 *     what made `alcada:acionar` answer `FIELD_CUSTOM_VALIDATION_EXCEPTION` and
 *     roll back.
 *
 *     ⚠️ The message must NOT name that month. The offset is the org's
 *     (`ANALYSIS_START_MONTH_OFFSET`, `0` since VBR-547, so today it is the
 *     CURRENT month) and it is configuration, not a constant: the sentence used
 *     to promise "1º dia do mês seguinte ao envio" while the very same
 *     `constraints` value allowed the current month, so the hint contradicted
 *     the limit the field was applying and read as a bug in the field.
 *  4. `inicio` on the 1st day of a month and `fim` on the last day of a month —
 *     `Data_Inicio_Analise_Primeiro_Dia` / `Data_Fim_Analise_Ultimo_Dia`. Those
 *     two DO exempt the integration user's profile, so the CRM would accept our
 *     insert; they are enforced here because they are the org's business rule
 *     and any human editing that Quote in Salesforce afterwards WOULD be blocked
 *     by them.
 *
 * Rules 2 and 3's limits are NEVER computed here: they are a function of the
 * API's clock (`GET /api/proposals/date-constraints`) and hardcoding them on the
 * client would silently disagree with the API on the 1st of every month.
 *
 * `constraints === null` (source silent) ⇒ rules 2 and 3 are not evaluated: no
 * hint, no block. A limit invented on the client reads on screen exactly like
 * the real rule. Rules 1 and 4 need no server input and always apply.
 *
 * Lives in one module because BOTH the modal (inline field error) and the page
 * sendbar (a draft restored from localStorage can carry a date that has since
 * become invalid) need the same verdict — two copies would drift.
 *
 * Returns '' when the window is acceptable.
 */
export function analysisWindowError(
  dataInicioAnalise: string,
  dataFimAnalise: string,
  constraints: ProposalDateConstraints | null,
): string {
  if (dataInicioAnalise && dataFimAnalise && dataFimAnalise < dataInicioAnalise) {
    return 'A data de término deve ser igual ou posterior à data de início da análise.';
  }

  const minInicio = constraints?.minDataInicioAnalise;
  if (minInicio && dataInicioAnalise && dataInicioAnalise < minInicio) {
    return (
      `A data início da análise precisa ser igual ou posterior a ${formatIsoDate(minInicio)}. ` +
      'É o 1º dia do mês mais antigo que o CRM aceita para a janela de análise.'
    );
  }

  if (dataInicioAnalise && !isFirstDayOfMonth(dataInicioAnalise)) {
    return 'A data início da análise precisa ser o 1º dia do mês (regra do CRM).';
  }

  const min = constraints?.minDataFimAnalise;
  if (min && dataFimAnalise && dataFimAnalise < min) {
    return (
      `A data fim da análise precisa ser igual ou posterior a ${formatIsoDate(min)}. ` +
      'O consumo só começa no 1º dia do mês subsequente, então uma análise que termina ' +
      'antes disso não deixa nenhum período de consumo possível.'
    );
  }

  if (dataFimAnalise && !isLastDayOfMonth(dataFimAnalise)) {
    return 'A data fim da análise precisa ser o último dia do mês (regra do CRM).';
  }

  return '';
}

/** `true` when the ISO date is the 1st day of its month. */
export function isFirstDayOfMonth(iso: string): boolean {
  return iso.slice(8, 10) === '01';
}

/** `true` when the ISO date is the last day of its month. */
export function isLastDayOfMonth(iso: string): boolean {
  const dayAfter = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dayAfter.getTime())) return false;
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  return dayAfter.toISOString().slice(8, 10) === '01';
}

/**
 * The last day of the month of `iso` — what the picker should snap "fim da
 * análise" to once the user picks any day in the intended month.
 *
 * Snapping beats rejecting here: the rule is "the month you chose", so the day
 * the user clicked carries no information the form has to preserve.
 */
export function snapToLastDayOfMonth(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const firstOfNext = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  firstOfNext.setUTCMonth(firstOfNext.getUTCMonth() + 1);
  firstOfNext.setUTCDate(0);
  return firstOfNext.toISOString().slice(0, 10);
}

/** The 1st day of the month of `iso` — the snap for "início da análise". */
export function snapToFirstDayOfMonth(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${iso.slice(0, 7)}-01`;
}
