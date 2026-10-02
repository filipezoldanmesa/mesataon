/**
 * Anti-corruption mapping between the backend `PATCH /v1/proposals/:id`
 * contract and the frontend's `UpdateMinutaPadraoPayload`/`UpdateMinutaPadraoResult`.
 *
 * The BFF NEVER passes through the raw backend payload — this mapper ensures
 * field names/shapes are explicit and fail loudly at compile time when the
 * contract changes (a passthrough compiles but renders empty fields at runtime).
 *
 * Pattern: same as `pendencia-mapping.ts` / `customer-mapping.ts`.
 */

import type { UpdateMinutaPadraoPayload, UpdateMinutaPadraoResult } from './proposal.types';

// ---------------------------------------------------------------------------
// Backend contract (as returned by PATCH /v1/proposals/:id)
// ---------------------------------------------------------------------------

export interface BackendUpdateProposalResponse {
  id: string;
  minutaPadrao: boolean;
  netlexConsultaCodigo: string | null;
  netlexConsultaStatus: string | null;
  consultaJuridicaPendente: boolean;
  requiresReapproval: boolean;
}

// ---------------------------------------------------------------------------
// Request: frontend payload → backend DTO
// ---------------------------------------------------------------------------

/**
 * Maps the frontend `UpdateMinutaPadraoPayload` to the backend PATCH DTO
 * shape. Field names match 1:1 today; the explicit mapping ensures a backend
 * rename is caught at compile time.
 */
export function mapMinutaPadraoPayloadToBackend(
  payload: UpdateMinutaPadraoPayload,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    minutaPadrao: payload.minutaPadrao,
  };
  if (payload.netlexConsultaCodigo !== undefined) {
    body['netlexConsultaCodigo'] = payload.netlexConsultaCodigo;
  }
  return body;
}

// ---------------------------------------------------------------------------
// Response: backend DTO → frontend result
// ---------------------------------------------------------------------------

/**
 * Maps the backend `UpdateProposalResponseDto` to the frontend
 * `UpdateMinutaPadraoResult` shape.
 */
export function mapBackendUpdateToMinutaResult(
  raw: BackendUpdateProposalResponse,
): UpdateMinutaPadraoResult {
  return {
    minutaPadrao: raw.minutaPadrao,
    netlexConsultaCodigo: raw.netlexConsultaCodigo,
    consultaJuridicaPendente: raw.consultaJuridicaPendente,
  };
}
