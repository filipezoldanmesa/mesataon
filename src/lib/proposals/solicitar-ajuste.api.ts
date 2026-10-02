/**
 * BFF client core for "Solicitar ajuste" on a proposal block.
 *
 * Reuses the existing engine: `POST /v1/proposals/:id/solicitar-ajuste` opens
 * (or reuses) a pendência for the LT **without changing the proposal status** —
 * the proposal stays in analysis while the block is corrected.
 *
 * Idempotent per block: asking twice for the same block while the first
 * pendência is open returns the SAME pendência and appends the new comment to
 * its thread, instead of colliding on the partial unique index.
 *
 * The `bloco` value is typed by each caller's own vocabulary — posto blocks
 * (`@/lib/proposals/ajuste`) on the PCR screen, franchise blocks
 * (`@/lib/franquia/ajuste`) on the franchise screen. This module carries only
 * the transport, shared by both.
 *
 * API contract (F2 / FRQ-14):
 *   POST /v1/proposals/{id}/solicitar-ajuste
 *   Body: { bloco: BlocoAjuste; comentario: string }
 *   201 { proposalId, bloco, pendenciaId, pendenciaCode }
 *   400 bloco fora do vocabulário · comentário em branco · proposta fora de análise
 *   403 perfil sem permissão de análise (SNEG/ADMIN)
 *   404 proposta não encontrada
 */

import { extractErrorMessage } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

export interface SolicitarAjusteResult {
  proposalId: string;
  bloco: string;
  pendenciaId: string;
  /** Human-readable code (`PN-3012`) — null until numbering is assigned. */
  pendenciaCode: string | null;
}

/**
 * A business rejection (400) — blank comment, or a proposal that is no longer
 * in analysis. Typed apart so the modal keeps the text the analyst wrote and
 * shows the reason inline instead of closing.
 */
export class SolicitarAjusteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolicitarAjusteValidationError';
  }
}

export async function solicitarAjusteBloco(
  proposalId: string,
  bloco: string,
  comentario: string,
): Promise<SolicitarAjusteResult> {
  const res = await fetch(
    withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/solicitar-ajuste`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bloco, comentario }),
      cache: 'no-store',
    },
  );

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string | string[];
  };

  if (res.status === 400) {
    const message = Array.isArray(body.message)
      ? body.message.join(' ')
      : (body.message ?? body.error ?? 'Não foi possível registrar a solicitação.');
    throw new SolicitarAjusteValidationError(message);
  }

  if (res.status === 403) {
    throw new Error('Sem permissão para solicitar ajuste nesta proposta.');
  }

  if (!res.ok) {
    throw new Error(
      extractErrorMessage(body, `Falha ao solicitar o ajuste (${res.status}).`),
    );
  }

  return body as unknown as SolicitarAjusteResult;
}
