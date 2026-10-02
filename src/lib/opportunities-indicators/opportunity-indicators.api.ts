import { readBackendSentence, throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type { OpportunityIndicatorsSnapshot } from './types';
import {
  ArpUnavailableError,
  IndicatorsCalculationInProgressError,
  NoProposalsSelectedError,
  OpportunityNotFoundForIndicatorsError,
} from './types';

/**
 * Loads the latest consolidated indicators snapshot for an opportunity via
 * the BFF (`GET /api/opportunities/:id/indicators`).
 *
 * Returns `null` when the opportunity has never been calculated (204).
 *
 * API contract — F7 consolidated indicators (VBR-112 épico / VBR-117 BE):
 *   GET /v1/opportunities/{id}/indicators
 *   Response 200: OpportunityIndicatorsDto
 *   Response 204: (never calculated)
 *   Response 404: { code: "NOT_FOUND" }
 */
export async function getOpportunityIndicators(
  opportunityId: string,
): Promise<OpportunityIndicatorsSnapshot | null> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/indicators`),
  );

  if (res.status === 204) return null;
  if (res.status === 404) {
    throw new OpportunityNotFoundForIndicatorsError(opportunityId);
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar os indicadores consolidados (${res.status}).`);
  }

  return (await res.json()) as OpportunityIndicatorsSnapshot;
}

/**
 * Asks the ARP for a recalculation of the opportunity's CONSOLIDATED
 * indicators via the BFF (`POST /api/opportunities/:id/indicators/recalculate`).
 * Powers the "↻ Recalcular / Simular (ARP)" button of the "Análise financeira"
 * card.
 *
 * **The 200 does not carry the result** (VBR-401): the ARP is asynchronous, so
 * the snapshot comes back with `status: "em_calculo"` and the previous
 * numbers. The definitive values arrive later via callback and have to be
 * re-read — here that means re-reading the opportunity, since the card renders
 * from the `indicadores` slot of its payload.
 *
 * ### The consolidated calculation may be HELD (regra de 04/09/2026)
 * It only runs when EVERY elected proposal's own TIR is `atualizado`. If one is
 * not, the backend recalculates those first and the consolidated follows when
 * the last of them settles. In that case the returned snapshot is NOT
 * `em_calculo` — it is whatever was there — and `null` comes back (204) when
 * the opportunity was never calculated at all. That is how the caller tells
 * "submitted" from "held": `status === em_calculo` ⇒ submitted.
 *
 * Throws {@link ArpUnavailableError} on 503 (HU-13.2 — genuine submit failure;
 * no previously loaded snapshot may be treated as fresh afterwards),
 * {@link IndicatorsCalculationInProgressError} on 409 (already in flight — the
 * backend's concurrent-dispatch guard; nothing went wrong) and
 * {@link NoProposalsSelectedError} on 400.
 *
 * API contract — F7 consolidated indicators:
 *   POST /v1/opportunities/{id}/indicators:recalculate
 *   Response 200: OpportunityIndicatorsDto (status = "em_calculo")
 *   Response 400: sem propostas eleitas ou sem volume
 *   Response 404: { code: "NOT_FOUND" }
 *   Response 409: { code: "CONFLICT" }
 *   Response 503: { code: "SERVICE_UNAVAILABLE" }
 */
export async function recalculateOpportunityIndicators(
  opportunityId: string,
): Promise<OpportunityIndicatorsSnapshot | null> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/indicators/recalculate`,
    ),
    { method: 'POST' },
  );

  if (res.status === 204) return null;
  if (res.status === 503) throw new ArpUnavailableError();
  if (res.status === 409) throw new IndicatorsCalculationInProgressError();
  // A frase do backend nomeia a regra violada (sem proposta eleita, sem volume,
  // investimento sem Descrição…). Só cai na genérica quando não veio nenhuma.
  if (res.status === 400) {
    throw new NoProposalsSelectedError(await readBackendSentence(res));
  }
  if (res.status === 404) {
    throw new OpportunityNotFoundForIndicatorsError(opportunityId);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao recalcular os indicadores consolidados');
  }

  return (await res.json()) as OpportunityIndicatorsSnapshot;
}
