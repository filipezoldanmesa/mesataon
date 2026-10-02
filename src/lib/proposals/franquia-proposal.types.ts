import type { Finalidade } from '@/lib/picklists/salesforce-values';

/**
 * Proposal tipo (SAP material code) — mirrors the backend `TipoProposta` enum
 * (`apps/api/src/proposals/domain/tipo-proposta.enum.ts`) value-for-value.
 *
 * PCR  = Posto de Combustíveis Revendedor (posto proposal)
 * ZBRM = Franquia BR Mania
 * ZLUB = Franquia Lubrax+
 *
 * Unknown backend values map to `null` (safe/unknown state) — never to the
 * first enum member, which would silently misidentify a proposal type.
 *
 * API contract — FRQ-F1 (RN-F1-01/02):
 *
 *   POST /v1/opportunities/:opportunityId/franquia
 *   Body: CreateFranquiaProposalPayload
 *   Response 201: CreateFranquiaProposalResult
 *   Response 400: validation error
 *   Response 404: opportunity or postoProposalId not found
 *   Response 503: service unavailable
 */
export const TipoProposta = {
  PCR: 'PCR',
  ZBRM: 'ZBRM',
  ZLUB: 'ZLUB',
} as const;

export type TipoProposta = (typeof TipoProposta)[keyof typeof TipoProposta];

/** pt-BR display labels for each proposal tipo. */
export const TIPO_PROPOSTA_LABEL: Record<TipoProposta, string> = {
  PCR: 'Posto (PCR)',
  ZBRM: 'Franquia BR Mania',
  ZLUB: 'Franquia Lubrax+',
};

/** Narrows an unvalidated backend value to {@link TipoProposta}. */
export function isTipoProposta(value: unknown): value is TipoProposta {
  return (
    typeof value === 'string' &&
    (Object.values(TipoProposta) as string[]).includes(value)
  );
}

/** `true` when the proposal type is a franchise (ZBRM or ZLUB). */
export function isFranquiaTipo(
  tipoProposta: TipoProposta | null | undefined,
): boolean {
  return (
    tipoProposta === TipoProposta.ZBRM ||
    tipoProposta === TipoProposta.ZLUB
  );
}

// ---------------------------------------------------------------------------
// API contract — franquia proposal creation (FRQ-F1)
// ---------------------------------------------------------------------------

/**
 * Payload for `POST /api/opportunities/:opportunityId/franquia`.
 *
 * Minimum required fields to create a franchise proposal (RN-F1-01..05).
 * The `postoProposalId` links the franchise to an existing PCR proposal
 * within the same opportunity (RN-F1-03).
 */
export interface CreateFranquiaProposalPayload {
  /** Franchise band — ZBRM (BR Mania) or ZLUB (Lubrax+). PCR not accepted here. */
  tipoProposta: typeof TipoProposta.ZBRM | typeof TipoProposta.ZLUB;
  /**
   * `Quote.Finalidade_Cotacao__c`. The previous two-value union was the MVP's
   * subset, not the picklist — and neither spelling was a Salesforce value.
   */
  finalidade: Finalidade;
  /** UUID of the posto (PCR) proposal this franchise is linked to (RN-F1-03). */
  postoProposalId: string;
  /** ISO-8601 date, e.g. "2026-08-01". */
  dataInicioAnalise: string;
  /** ISO-8601 date, must be ≥ dataInicioAnalise. */
  dataFimAnalise: string;
}

/**
 * Successful response from `POST /api/opportunities/:opportunityId/franquia`.
 */
export interface CreateFranquiaProposalResult {
  proposalId: string;
  franquiaId: string;
  tipoProposta: TipoProposta;
  opportunityId: string;
}

/** Thrown on 503 — the franchise service is unavailable. */
export class FranquiaServiceUnavailableError extends Error {
  constructor() {
    super(
      'Serviço de criação de proposta de franquia temporariamente indisponível. Tente novamente mais tarde.',
    );
    this.name = 'FranquiaServiceUnavailableError';
  }
}

/**
 * Thrown on 404 — the `postoProposalId` does not exist in this opportunity,
 * or the opportunity itself was not found (RN-F1-03).
 */
export class FranquiaPostoProposalNotFoundError extends Error {
  constructor() {
    super(
      'A proposta de posto indicada não foi encontrada nesta oportunidade.',
    );
    this.name = 'FranquiaPostoProposalNotFoundError';
  }
}
