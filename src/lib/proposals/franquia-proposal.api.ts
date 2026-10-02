import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  CreateFranquiaProposalPayload,
  CreateFranquiaProposalResult,
} from './franquia-proposal.types';
import {
  FranquiaServiceUnavailableError,
  FranquiaPostoProposalNotFoundError,
} from './franquia-proposal.types';

/**
 * Creates a franchise proposal (ZBRM/ZLUB) via the BFF
 * (`POST /api/opportunities/:opportunityId/franquia`), which proxies
 * `POST /v1/opportunities/:opportunityId/franquia` server-side.
 *
 * Throws {@link FranquiaServiceUnavailableError} on 503.
 * Throws {@link FranquiaPostoProposalNotFoundError} on 404.
 */
export async function createFranquiaProposal(
  opportunityId: string,
  payload: CreateFranquiaProposalPayload,
): Promise<CreateFranquiaProposalResult> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/franquia`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (res.status === 503) {
    throw new FranquiaServiceUnavailableError();
  }

  if (res.status === 404) {
    throw new FranquiaPostoProposalNotFoundError();
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao criar a proposta de franquia');
  }

  return (await res.json()) as CreateFranquiaProposalResult;
}
