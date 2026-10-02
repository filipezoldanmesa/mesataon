import { withBasePath } from '@/lib/base-path';

import type { ScenarioComparisonResponse } from './scenario-comparison.types';
import { OpportunityNotFoundError } from './types';

/**
 * Fetches the side-by-side scenario comparison for an opportunity via the BFF
 * (`GET /api/opportunities/:id/scenarios/comparison`), which proxies
 * `GET /v1/opportunities/:id/scenarios/comparison` (VBR-103) and forwards the
 * Bearer via the server-side `vibra_session` cookie.
 *
 * Returns the full `ScenarioComparisonResponse` — the 13 prototype dimensions
 * per scenario, with `null` for slots not yet filled by F6/F7/F8.
 */
export async function getScenarioComparison(
  opportunityId: string,
): Promise<ScenarioComparisonResponse> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/scenarios/comparison`),
  );

  if (res.status === 404) {
    throw new OpportunityNotFoundError(opportunityId);
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar a comparação de cenários (${res.status}).`);
  }

  return (await res.json()) as ScenarioComparisonResponse;
}
