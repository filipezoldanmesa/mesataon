import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  OpportunityDetail,
  OpportunityPatchPayload,
  OpportunityProposal,
  OpportunityTeamMember,
} from './types';
import { OpportunityNotFoundError } from './types';

/**
 * Real opportunity detail via the BFF (`/api/opportunities/:id`), which injects
 * the session Bearer server-side and proxies `GET /v1/opportunities/:id`.
 *
 * API contract — F2 detail (VBR-75 épico / VBR-77 BE):
 *
 *   GET /v1/opportunities/:id
 *   Response 200: OpportunityDetail
 *   Response 404: { code: "OPPORTUNITY_NOT_FOUND" }
 */
export async function getOpportunityDetail(id: string): Promise<OpportunityDetail> {
  const res = await fetch(withBasePath(`/api/opportunities/${encodeURIComponent(id)}`));

  if (res.status === 404) {
    throw new OpportunityNotFoundError(id);
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar a oportunidade (${res.status}).`);
  }

  return (await res.json()) as OpportunityDetail;
}

/**
 * Lists the proposals created for an opportunity via the BFF
 * (`GET /api/opportunities/:id/proposals` → `GET /v1/opportunities/:id/proposals`).
 * Powers the "Propostas desta oportunidade" list — proposals created (F3) appear
 * here even before being composed/elected (PUT).
 *
 * From the análise onwards the backend returns only the ELECTED proposals
 * (RN-F2-04). `incluirNaoEleitas` asks for the others as well, and the backend
 * honours it only for profiles with composition authority — it feeds the LT's
 * collapsed "Propostas não eleitas" section.
 */
export async function getOpportunityProposals(
  id: string,
  options: { incluirNaoEleitas?: boolean } = {},
): Promise<OpportunityProposal[]> {
  const query = options.incluirNaoEleitas ? '?incluirNaoEleitas=true' : '';
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(id)}/proposals${query}`),
  );
  if (!res.ok) {
    throw new Error(`Falha ao listar as propostas (${res.status}).`);
  }
  return (await res.json()) as OpportunityProposal[];
}

/**
 * Edits the mutable fields of an opportunity via the BFF
 * (`PATCH /api/opportunities/:id` → `PATCH /v1/opportunities/:id`).
 */
export async function patchOpportunityDetail(
  id: string,
  patch: OpportunityPatchPayload,
): Promise<OpportunityDetail> {
  const res = await fetch(withBasePath(`/api/opportunities/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

  if (res.status === 404) {
    throw new OpportunityNotFoundError(id);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao salvar as alterações');
  }

  return (await res.json()) as OpportunityDetail;
}

/**
 * Fetches the opportunity team via the BFF
 * (`GET /api/opportunities/:id/team` → `GET /v1/opportunities/:id/team`).
 *
 * Returns the flat `members` array (principal + apoios, already tagged with
 * `isPrincipal`). On any error (auth, network, 404) returns an empty array so
 * the meta-bar header degrades to "—" without crashing the detail screen.
 */
export async function getOpportunityTeam(id: string): Promise<OpportunityTeamMember[]> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(id)}/team`),
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { members: OpportunityTeamMember[] };
  return data.members ?? [];
}

/**
 * Updates the elected proposals for an opportunity via the BFF
 * (`PUT /api/opportunities/:id/proposals` → `PUT /v1/opportunities/:id/proposals`).
 */
export async function putOpportunityProposals(
  id: string,
  proposalIds: string[],
): Promise<OpportunityDetail> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(id)}/proposals`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposalIds }),
    },
  );

  if (res.status === 404) {
    throw new OpportunityNotFoundError(id);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao atualizar as propostas');
  }

  return (await res.json()) as OpportunityDetail;
}
