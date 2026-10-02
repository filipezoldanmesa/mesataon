/**
 * Parsing and validation of the "Padrões de BP" form (RN-F4-01 — ADO 67952).
 *
 * Pure module on purpose: the sentence below is the acceptance criterion of the
 * QA test case (67314 — `[UAT] SNEG-J10-N-001`), and it has to be reachable
 * from a unit test without rendering the screen.
 */

import type { BpPadraoUpdatePayload } from './sneg-admin.types';

/**
 * The message the QA test case 67314 asserts, verbatim.
 *
 * Do not reword it here without changing the test case: it is the contract the
 * UAT script reads on screen.
 */
export const BP_PADRAO_VALIDATION_MESSAGE =
  'Preencha o negócio, metas de antecipação/postecipação entre 0 e 1 e custo ≥ 0.';

/** Raw form state — every field is the string the input holds. */
export interface BpPadraoFormValues {
  negocio: string;
  metaPercentualAntecipacao: string;
  metaPercentualPostecipacao: string;
  metaCustoVinculacaoUnitario: string;
}

/** A form that parsed cleanly, with the negócio kept APART from the metas. */
export interface ParsedBpPadraoForm {
  negocio: string;
  metas: BpPadraoUpdatePayload;
}

/**
 * Parses one numeric field into a number, or `null` when it is not informed.
 *
 * ⚠️ **`null` for empty, never `0`** — `Number('')` is `0`, not `NaN`, and that
 * is how a blank meta used to be persisted as a real `0` with no message at all
 * (ADO 67952): the caller could not tell "não informado" from "zero", and a
 * padrão with `metaPercentualAntecipacao: 0` flags every proposal as
 * `com_desvio`. Same reason `parseMoneyInput` (`lib/franquia/format.ts`) and
 * `parsePercentToBps` return `null` for empty.
 *
 * The comma is accepted because these are pt-BR inputs: `type="number"` lets
 * the browser localize the separator, and a value that reaches here as `"0,45"`
 * is a decimal the user typed — not a parse failure.
 */
export function parseDecimalInput(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFraction(value: number | null): value is number {
  return value !== null && value >= 0 && value <= 1;
}

/**
 * Single predicate for "can this form be saved?" — read by the screen so the
 * message it shows and the payload it sends can never disagree.
 *
 * Returns `null` when the form is not valid; the caller renders
 * {@link BP_PADRAO_VALIDATION_MESSAGE}.
 *
 * ⚠️ `negocio` comes back SEPARATE from `metas` because the backend's
 * `UpdateBpPadraoDto` has no `negocio` property and the API runs with
 * `forbidNonWhitelisted: true` — sending it on `PUT` is a `400 UNKNOWN_FIELD`,
 * which is what made every edit fail (ADO 67952). Keeping the two apart means
 * the update call cannot receive it by accident.
 *
 * Deliberately NOT enforced: `antecipação + postecipação === 1`. There is no
 * such CHECK in `sneg_bp_standards`, no cross-field rule in the DTO (which
 * documents the deferral as "tipicamente 1 − antecipação ... stored explicitly
 * for flexibility"), and inventing it here would refuse the very scenario the
 * bug reports as valid (0 + 0,45).
 */
export function parseBpPadraoForm(
  form: BpPadraoFormValues,
): ParsedBpPadraoForm | null {
  const negocio = form.negocio.trim();
  const antecipacao = parseDecimalInput(form.metaPercentualAntecipacao);
  const postecipacao = parseDecimalInput(form.metaPercentualPostecipacao);
  const custo = parseDecimalInput(form.metaCustoVinculacaoUnitario);

  if (
    negocio === '' ||
    !isFraction(antecipacao) ||
    !isFraction(postecipacao) ||
    custo === null ||
    custo < 0
  ) {
    return null;
  }

  return {
    negocio,
    metas: {
      metaPercentualAntecipacao: antecipacao,
      metaPercentualPostecipacao: postecipacao,
      metaCustoVinculacaoUnitario: custo,
    },
  };
}
