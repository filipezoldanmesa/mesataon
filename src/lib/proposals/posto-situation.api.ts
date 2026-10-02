import { HttpError, throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type { PostoSituation, UpsertPostoSituationInput } from './posto-situation.types';
import {
  AnpUnavailableError,
  PostoActivationConflictError,
  PostoSituationValidationError,
  toBandeiraAnpStatus,
} from './posto-situation.types';

/**
 * Loads the current "situação do posto e do imóvel" for a proposal via the
 * BFF (`GET /api/proposals/:id/posto-situation`).
 *
 * Returns `null` when no situation has been registered yet (404).
 *
 * API contract — F4 posto-situation (VBR-89 BE):
 *   GET /v1/proposals/{id}/posto-situation
 *   Response 200: PostoSituation
 *   Response 404: { code: "NOT_FOUND" } — proposta não encontrada OU situação ainda não cadastrada
 *
 * There is NO 503 here: an ANP failure no longer degrades this read — the
 * situação comes back with `bandeiraAnpStatus: INDISPONIVEL`. Any 5xx that does
 * arrive is infrastructure, and belongs in the generic load error.
 */
export async function getPostoSituation(proposalId: string): Promise<PostoSituation | null> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/posto-situation`),
  );

  if (res.status === 404) return null;

  if (!res.ok) {
    throw new HttpError(`Falha ao carregar a situação do posto (${res.status}).`, res.status);
  }

  return normalizeSituation(await res.json());
}

/**
 * `bandeiraAnpStatus` is normalized at the boundary so an API that predates it
 * (a rolling deploy serving the old shape) degrades to `INDISPONIVEL` — never
 * to `undefined` reaching the render, and never to `SEM_REGISTRO`, which would
 * assert an absence nobody confirmed.
 */
function normalizeSituation(body: unknown): PostoSituation {
  const situation = body as PostoSituation;
  return { ...situation, bandeiraAnpStatus: toBandeiraAnpStatus(situation.bandeiraAnpStatus) };
}

/**
 * Registers or replaces the "situação do posto e do imóvel" via the BFF
 * (`PUT /api/proposals/:id/posto-situation`).
 *
 * Throws {@link PostoSituationValidationError} on 400 (RN-F4-02).
 * Throws {@link PostoActivationConflictError} on 409 (RN-F4-04/HU-06.1).
 *
 * API contract — F4 posto-situation (VBR-89 BE):
 *   PUT /v1/proposals/{id}/posto-situation
 *   Response 200: PostoSituation
 *   Response 400: { code: "BAD_REQUEST", message }
 *   Response 409: { code: "CONFLICT", message }
 */
export async function upsertPostoSituation(
  proposalId: string,
  input: UpsertPostoSituationInput,
): Promise<PostoSituation> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/posto-situation`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new PostoSituationValidationError(body?.message);
  }

  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new PostoActivationConflictError(body?.message);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao salvar a situação do posto');
  }

  return normalizeSituation(await res.json());
}

/**
 * Resolves the posto's ANP flag BEFORE any situação is registered, via the BFF
 * (`GET /api/proposals/:id/posto-situation/bandeira-anp`). Feeds the modal's
 * read-only "Bandeira ANP" field on first register.
 *
 * Returns `null` when the posto has no ANP registration (business fact).
 * Throws {@link AnpUnavailableError} on 503.
 */
export async function getBandeiraAnp(proposalId: string): Promise<string | null> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/posto-situation/bandeira-anp`),
  );

  if (res.status === 503) throw new AnpUnavailableError();
  if (!res.ok) {
    throw new Error(`Falha ao consultar a bandeira na ANP (${res.status}).`);
  }

  const body = (await res.json()) as { bandeiraAnp: string | null };
  return body.bandeiraAnp;
}
