import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  DdiDecisionPayload,
  DdiDocumentRequestPayload,
  DdiReclassifyPayload,
  DdiResult,
  DdiRevisaoPayload,
} from './ddi.types';
import { DdiForbiddenError, DdiUnavailableError, DdiValidationError } from './ddi.types';

/**
 * Real DDI client via the BFF (`/api/opportunities/:id/ddi`).
 *
 * API Contract — F10 DDI (VBR-129 épico):
 *
 *   GET  /v1/opportunities/:id/ddi
 *   Response 200: DdiResult
 *   Response 503: { code: "DDI_SERVICE_UNAVAILABLE" }
 */
/**
 * 204 ⇒ `null`: a oportunidade não tem análise DDI (não iniciada / não
 * elegível). É um ESTADO, não erro — e `204` satisfaz `res.ok`, então sem o
 * guard o `.json()` de corpo vazio estourava `Unexpected end of JSON input`.
 */
export async function getDdiResult(
  opportunityId: string,
): Promise<DdiResult | null> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/ddi`),
  );

  if (res.status === 503) {
    throw new DdiUnavailableError();
  }

  if (res.status === 204) return null;

  if (!res.ok) {
    throw new Error(`Falha ao carregar a DDI (${res.status}).`);
  }

  return (await res.json()) as DdiResult;
}

/**
 * POST /api/opportunities/:id/ddi/run — re-runs the integrity due diligence.
 *
 * Returns the fresh {@link DdiResult}, or `null` when the opportunity is not
 * eligible for DDI (204 — a STATE, not an error).
 *
 * ## Failure is NOT thrown as an opaque error (ADO 67943)
 *
 * A refused run answers 503, and the BFF replaces a 5xx body with its own
 * fallback phrase — so the reason the run failed never survives this hop. It
 * does not need to: the backend has just persisted that reason on the analysis
 * row, so the caller re-reads `GET .../ddi` and renders it. `DdiUnavailableError`
 * carries the "it did not complete" verdict; the WHY comes from the row.
 */
export async function runDdi(opportunityId: string): Promise<DdiResult | null> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/ddi/run`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );

  if (res.status === 503) {
    throw new DdiUnavailableError();
  }

  if (res.status === 403) {
    throw new DdiForbiddenError();
  }

  if (res.status === 204) return null;

  if (!res.ok) {
    await throwApiError(res, 'Falha ao executar a análise de integridade (DDI)');
  }

  return (await res.json()) as DdiResult;
}

/**
 * POST /v1/opportunities/:id/ddi/reclassify — Integridade only (HU-18.2/.3).
 *
 * Carries the verdict (`decision`) alongside the reviewed risk: it is the
 * verdict that releases or blocks GATE 2.
 */
export async function reclassifyDdi(
  opportunityId: string,
  payload: DdiReclassifyPayload,
  _userRoles: string[], // unused in real API — enforced server-side
): Promise<DdiResult> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/ddi/reclassify`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (res.status === 403) {
    throw new DdiForbiddenError();
  }

  if (res.status === 422) {
    const data = (await res.json()) as { code?: string; message?: string | string[] };
    const detail = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new DdiValidationError(data.code ?? 'DDI_RECLASSIFY_INVALID', detail);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao reclassificar DDI');
  }

  return (await res.json()) as DdiResult;
}

/**
 * POST /v1/opportunities/:id/ddi/decision — LT only, high risk (RN-F10-06).
 */
export async function submitDdiDecision(
  opportunityId: string,
  payload: DdiDecisionPayload,
  _userRoles: string[], // unused in real API — enforced server-side
): Promise<DdiResult> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/ddi/decision`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (res.status === 403) {
    throw new DdiForbiddenError();
  }

  if (res.status === 422) {
    const data = (await res.json()) as { code?: string; message?: string | string[] };
    const detail = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new DdiValidationError(data.code ?? 'DDI_DECISION_INVALID', detail);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao registrar decisão DDI');
  }

  return (await res.json()) as DdiResult;
}

/**
 * POST /v1/opportunities/:id/ddi/solicitar-revisao — LT, DDI reprovada.
 *
 * O LT justifica o que foi tratado e devolve a análise à Integridade: o status
 * volta a `PENDENTE_PARECER`, a pendência de parecer reabre e a devolução
 * `ddi:reprovacao` é resolvida.
 *
 * ⚠️ Não libera a oportunidade — o GATE 1 segue bloqueado, agora por
 * `ddi_parecer_integridade`. Quem decide sobre integridade é a Integridade.
 */
export async function solicitarRevisaoDdi(
  opportunityId: string,
  payload: DdiRevisaoPayload,
): Promise<DdiResult> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/ddi/solicitar-revisao`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (res.status === 403) {
    throw new DdiForbiddenError();
  }

  if (res.status === 422) {
    const data = (await res.json()) as { code?: string; message?: string | string[] };
    const detail = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new DdiValidationError(data.code ?? 'DDI_REVISAO_INVALID', detail);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao pedir nova avaliação da DDI');
  }

  return (await res.json()) as DdiResult;
}

/**
 * POST /v1/opportunities/:id/ddi/solicitar-documento — Integridade only.
 *
 * Opens a pendência for the opportunity's LT asking for a document. Returns the
 * id of the pendência that was opened (or reused, when the same document was
 * already requested).
 */
export async function requestDdiDocument(
  opportunityId: string,
  payload: DdiDocumentRequestPayload,
): Promise<{ pendenciaId: string }> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/ddi/solicitar-documento`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (res.status === 403) {
    throw new DdiForbiddenError();
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao solicitar o documento');
  }

  return (await res.json()) as { pendenciaId: string };
}
