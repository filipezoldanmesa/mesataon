import { HttpError, throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type { MarketIntelligence } from './types';
import { ProposalInAnalysisError, TableauUnavailableError } from './types';

/**
 * Loads the current market intelligence snapshot for a proposal via the BFF
 * (`GET /api/proposals/:id/market-intelligence`).
 *
 * Returns `null` when the Tableau has never been consulted for this proposal (204).
 * Throws {@link TableauUnavailableError} on 503.
 *
 * API contract — F4 market intelligence (VBR-89 épico / VBR-93 BE):
 *   GET /v1/proposals/{id}/market-intelligence
 *   Response 200: MarketIntelligence
 *   Response 204: (never consulted)
 *   Response 503: { code: "TABLEAU_UNAVAILABLE" }
 */
export async function getMarketIntelligence(
  proposalId: string,
): Promise<MarketIntelligence | null> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/market-intelligence`),
  );

  if (res.status === 204) return null;
  if (res.status === 503) throw new TableauUnavailableError();

  if (!res.ok) {
    throw new HttpError(`Falha ao carregar a inteligência de mercado (${res.status}).`, res.status);
  }

  return (await res.json()) as MarketIntelligence;
}

/**
 * Triggers a Tableau refresh for a proposal's market intelligence via the BFF
 * (`POST /api/proposals/:id/market-intelligence/refresh`).
 *
 * Throws {@link ProposalInAnalysisError} on 409 (proposal already in analysis).
 * Throws {@link TableauUnavailableError} on 503 (Tableau service down).
 *
 * API contract — F4 market intelligence (VBR-89 épico / VBR-93 BE):
 *   POST /v1/proposals/{id}/market-intelligence:refresh
 *   Response 200: MarketIntelligence (fresh snapshot)
 *   Response 409: { code: "PROPOSAL_IN_ANALYSIS" }
 *   Response 503: { code: "TABLEAU_UNAVAILABLE" }
 */
export async function refreshMarketIntelligence(
  proposalId: string,
): Promise<MarketIntelligence> {
  const res = await fetch(
    withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/market-intelligence/refresh`,
    ),
    { method: 'POST' },
  );

  if (res.status === 409) throw new ProposalInAnalysisError(proposalId);
  if (res.status === 503) throw new TableauUnavailableError();

  if (!res.ok) {
    await throwApiError(res, 'Falha ao consultar o Tableau');
  }

  return (await res.json()) as MarketIntelligence;
}
