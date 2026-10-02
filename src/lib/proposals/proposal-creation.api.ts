import { extractErrorMessage } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  CreateProposalPayload,
  CreateProposalResult,
  ProposalDateConstraints,
} from './proposal-creation.types';
import {
  ProposalAlreadyActiveError,
  ProposalServiceUnavailableError,
} from './proposal-creation.types';

/** HU-04.2 pre-flight result. `checked=false` ⇒ inconclusive (never block). */
export interface PostoEligibility {
  postoRef: string | null;
  /**
   * O posto está no Mapa da Rede — `Na rede` OU `Em processo de saída`
   * (revisão da ADR-0026, 09/09/2026). É o MESMO predicado do gate do backend:
   * avisar por um critério e recusar por outro faria tela e API divergirem
   * exatamente no caso ambíguo.
   */
  noMapaDaRede: boolean;
  checked: boolean;
}

/**
 * Pre-flight check (via BFF) of whether the opportunity's posto is already
 * ATIVO on the network — used to warn on the Nova Proposta screen before the
 * user fills the form. Fails open (returns `checked:false`) on any error so a
 * valid posto is never blocked by a flaky/absent signal.
 */
export async function getPostoEligibility(opportunityId: string): Promise<PostoEligibility> {
  try {
    const res = await fetch(
      withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/posto-eligibility`),
    );
    if (!res.ok) return { postoRef: null, noMapaDaRede: false, checked: false };
    return (await res.json()) as PostoEligibility;
  } catch {
    return { postoRef: null, noMapaDaRede: false, checked: false };
  }
}

/**
 * Reads the server-derived date limits for the form (RN-F5-04) via the BFF.
 *
 * Returns `null` on ANY failure so the caller omits the hint instead of inventing
 * a limit: a number made up on the client would be indistinguishable from the
 * real rule on screen, and the rule keeps being enforced on submit either way.
 */
export async function getProposalDateConstraints(): Promise<ProposalDateConstraints | null> {
  try {
    const res = await fetch(withBasePath('/api/proposals/date-constraints'));
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<ProposalDateConstraints>;
    if (!body?.minDataFimAnalise || !body?.inicioConsumo) return null;
    return {
      minDataInicioAnalise: body.minDataInicioAnalise ?? body.minDataFimAnalise,
      minDataFimAnalise: body.minDataFimAnalise,
      inicioConsumo: body.inicioConsumo,
    };
  } catch {
    return null;
  }
}

/**
 * Creates a new proposal via the BFF (`POST /api/proposals`), which proxies
 * `POST /v1/opportunities/{opportunityId}/proposals` server-side.
 *
 * Throws {@link ProposalAlreadyActiveError} on 409 (posto already active).
 * Throws {@link ProposalServiceUnavailableError} on 503.
 *
 * Every rejection carries the BACKEND's own sentence. A template like
 * `Falha ao criar a proposta (400)` tells the user nothing about the business
 * rule they broke — the API already replies with the explanation (e.g. why the
 * analysis window leaves no consumption period), and dropping it on the floor
 * was reported in QA.
 */
export async function createProposal(
  payload: CreateProposalPayload,
): Promise<CreateProposalResult> {
  const res = await fetch(withBasePath('/api/proposals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Parameters<
      typeof extractErrorMessage
    >[0];

    if (res.status === 409) {
      // The canned sentence is the fallback only — the backend one names the
      // date the posto entered the network.
      const message = extractErrorMessage(body, '');
      throw message ? new ProposalAlreadyActiveError(message) : new ProposalAlreadyActiveError();
    }

    if (res.status === 503) {
      const message = extractErrorMessage(body, '');
      throw message
        ? new ProposalServiceUnavailableError(message)
        : new ProposalServiceUnavailableError();
    }

    throw new Error(
      extractErrorMessage(
        body,
        `Não foi possível criar a proposta. Revise os dados e tente novamente (${res.status}).`,
      ),
    );
  }

  return (await res.json()) as CreateProposalResult;
}
