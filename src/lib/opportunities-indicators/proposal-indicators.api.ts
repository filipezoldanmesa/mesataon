import { HttpError, readBackendSentence, throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type { ProposalIndicatorsSnapshot } from './types';
import {
  ArpUnavailableError,
  IndicatorsCalculationInProgressError,
  ProposalNotFoundForIndicatorsError,
  ProposalNotReadyForIndicatorsError,
} from './types';

/**
 * Loads the latest indicators snapshot for a single proposal/cenário via the
 * BFF (`GET /api/proposals/:id/indicators`). Consumed by the scenario
 * comparison screen (OPP-F5) to fill the TIR/VPL/payback rows.
 *
 * Returns `null` when the proposal has never been calculated (204).
 *
 * API contract — F7 proposal indicators (VBR-112 épico):
 *   GET /v1/proposals/{id}/indicators
 *   Response 200: ProposalIndicatorsDto
 *   Response 204: (never calculated)
 *   Response 404: { code: "NOT_FOUND" }
 */
export async function getProposalIndicators(
  proposalId: string,
): Promise<ProposalIndicatorsSnapshot | null> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/indicators`),
  );

  if (res.status === 204) return null;
  if (res.status === 404) {
    throw new ProposalNotFoundForIndicatorsError(proposalId);
  }

  if (!res.ok) {
    // HttpError, not a bare Error: the block's catch handler needs the status to
    // tell an expired session (401 → redirect to login) from a transient
    // failure. A bare Error makes every status look the same and the 401 branch
    // becomes dead code (VBR-489).
    throw new HttpError(
      `Falha ao carregar os indicadores da proposta (${res.status}).`,
      res.status,
    );
  }

  return (await res.json()) as ProposalIndicatorsSnapshot;
}

/**
 * Asks the ARP for a recalculation of the proposal's economic indicators via
 * the BFF (`POST /api/proposals/:id/indicators/recalculate`). Powers the "↻
 * Recalcular / Simular (ARP)" button of the "Painel ao vivo" (OPP-F7,
 * HU-12.1).
 *
 * **The 200 does not carry the result** (VBR-401): the ARP is asynchronous, so
 * the returned snapshot comes back with `status: "em_calculo"` and the previous
 * numbers. The definitive values arrive later via callback and have to be
 * re-read with {@link getProposalIndicators}.
 *
 * Throws {@link ArpUnavailableError} on 503 (HU-13.2) — a genuine failure of the
 * submit; the caller must NOT treat any previously loaded snapshot as
 * definitive/fresh after this.
 * Throws {@link IndicatorsCalculationInProgressError} on 409 (a calculation is
 * already in flight — the backend's concurrent-dispatch guard).
 * Throws {@link ProposalNotReadyForIndicatorsError} on 400 (proposta sem
 * produtos/recursos financeiros definidos ainda — F5/F6).
 *
 * API contract — F7 proposal indicators (VBR-112 épico / VBR-114 BE):
 *   POST /v1/proposals/{id}/indicators:recalculate
 *   Response 200: ProposalIndicatorsDto (status = "em_calculo")
 *   Response 400: { code: "BAD_REQUEST" }
 *   Response 404: { code: "NOT_FOUND" }
 *   Response 409: { code: "CONFLICT" } — cálculo já em andamento
 *   Response 503: { code: "SERVICE_UNAVAILABLE" }
 */
export async function recalculateProposalIndicators(
  proposalId: string,
): Promise<ProposalIndicatorsSnapshot> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/indicators/recalculate`),
    { method: 'POST' },
  );

  if (res.status === 503) throw new ArpUnavailableError();
  if (res.status === 409) throw new IndicatorsCalculationInProgressError();
  // A frase do backend nomeia a regra violada (produtos/recursos ausentes,
  // investimento sem Descrição…). Só cai na genérica quando não veio nenhuma.
  if (res.status === 400) {
    throw new ProposalNotReadyForIndicatorsError(await readBackendSentence(res));
  }
  if (res.status === 404) {
    throw new ProposalNotFoundForIndicatorsError(proposalId);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao recalcular os indicadores da proposta');
  }

  return (await res.json()) as ProposalIndicatorsSnapshot;
}
