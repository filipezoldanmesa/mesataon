import { withBasePath } from '@/lib/base-path';

import { extractErrorMessage, HttpError, throwApiError } from '@/lib/api-errors';

import type {
  CreateFinancialResourceInput,
  FinancialResourceDomains,
  FinancialResourceMutationResult,
  FinancialResourcesListResult,
  UpdateFinancialResourceInput,
} from './financial-resources.types';
import {
  FinancialResourceNotApplicableError,
  FinancialResourceSaveError,
} from './financial-resources.types';

/**
 * `GET /v1/proposals/{id}/financial-resources` via the BFF
 * (`/api/proposals/:id/financial-resources`).
 */
export async function getFinancialResources(
  proposalId: string,
): Promise<FinancialResourcesListResult> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/financial-resources`),
  );

  if (!res.ok) {
    throw new HttpError(`Falha ao carregar os recursos financeiros (${res.status}).`, res.status);
  }

  return (await res.json()) as FinancialResourcesListResult;
}

/**
 * `POST /v1/proposals/{id}/financial-resources` via the BFF.
 * Throws {@link FinancialResourceNotApplicableError} on 409 (RN-F6-01).
 */
export async function createFinancialResource(
  proposalId: string,
  input: CreateFinancialResourceInput,
): Promise<FinancialResourceMutationResult> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/financial-resources`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  if (res.status === 409) throw new FinancialResourceNotApplicableError();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new FinancialResourceSaveError(
      extractErrorMessage(body, `Falha ao salvar o recurso financeiro (${res.status}).`),
    );
  }

  return (await res.json()) as FinancialResourceMutationResult;
}

/**
 * `PUT /v1/proposals/{id}/financial-resources/{resourceId}` via the BFF.
 */
export async function updateFinancialResource(
  proposalId: string,
  resourceId: string,
  input: UpdateFinancialResourceInput,
): Promise<FinancialResourceMutationResult> {
  const res = await fetch(
    withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/financial-resources/${encodeURIComponent(resourceId)}`,
    ),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  if (res.status === 409) throw new FinancialResourceNotApplicableError();
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new FinancialResourceSaveError(
      extractErrorMessage(body, `Falha ao salvar o recurso financeiro (${res.status}).`),
    );
  }

  return (await res.json()) as FinancialResourceMutationResult;
}

/**
 * `POST /v1/proposals/{id}/financial-resources:remover` via a BFF.
 *
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: `501 Unsupported Request` em
 * qualquer path, sem consultar o origin (ADO 67557/67796). A rota BFF continua
 * aceitando `DELETE` com a mesma implementação.
 */
export async function deleteFinancialResource(
  proposalId: string,
  resourceId: string,
): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/financial-resources/${encodeURIComponent(resourceId)}`,
    ),
    { method: 'POST' },
  );

  if (!res.ok && res.status !== 204) {
    await throwApiError(res, 'Falha ao remover o recurso financeiro');
  }
}

/**
 * `GET /v1/financial-resources/domains` via the BFF (`/api/financial-resources/domains`).
 */
export async function getFinancialResourceDomains(): Promise<FinancialResourceDomains> {
  const res = await fetch(withBasePath('/api/financial-resources/domains'));

  if (!res.ok) {
    throw new HttpError(`Falha ao carregar os domínios de recursos financeiros (${res.status}).`, res.status);
  }

  return (await res.json()) as FinancialResourceDomains;
}
