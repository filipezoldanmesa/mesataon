import { withBasePath } from '@/lib/base-path';

import { throwApiError } from '@/lib/api-errors';

import type {
  CreateOpportunityPayload,
  CreateOpportunityResult,
  OpportunityPrefill,
} from './types';
import {
  OpportunityForbiddenError,
  PrefillUnavailableError,
} from './types';

/**
 * Fetches pre-fill data for a new opportunity from the BFF
 * (`GET /api/opportunities/prefill?customerId=<id>`), which proxies
 * `GET /v1/opportunities/prefill` and injects the session Bearer server-side.
 *
 * Throws {@link PrefillUnavailableError} when the CRM is unavailable (503).
 */
export async function getOpportunityPrefill(
  customerId: string,
): Promise<OpportunityPrefill> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/prefill?customerId=${encodeURIComponent(customerId)}`,
    ),
  );

  if (res.status === 503) {
    throw new PrefillUnavailableError();
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar dados do cliente (${res.status}).`);
  }

  return (await res.json()) as OpportunityPrefill;
}

/**
 * Creates a new opportunity via the BFF (`POST /api/opportunities`), which
 * proxies `POST /v1/opportunities` and injects the session Bearer server-side.
 *
 * Throws {@link OpportunityForbiddenError} when the user lacks permission (403).
 */
export async function createOpportunity(
  payload: CreateOpportunityPayload,
): Promise<CreateOpportunityResult> {
  const res = await fetch(withBasePath('/api/opportunities'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 403) {
    throw new OpportunityForbiddenError();
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao criar a oportunidade');
  }

  return (await res.json()) as CreateOpportunityResult;
}

/**
 * Preenche a área de venda de uma oportunidade que não tem nenhuma
 * (ADO 67913) — `POST /api/opportunities/:id/area-venda`.
 *
 * Preenchimento ÚNICO: o backend recusa com 409 quando a oportunidade já tem
 * área. A frase da recusa vem dele (a BFF preserva o corpo dos 4xx), porque é
 * ela que nomeia o conserto.
 */
export async function definirAreaVendaOportunidade(
  opportunityId: string,
  areaVendaCode: string,
): Promise<void> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/area-venda`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ areaVendaCode }),
    },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao definir a área de venda');
  }
}
