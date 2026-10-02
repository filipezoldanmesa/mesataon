import { withBasePath } from '@/lib/base-path';

import { extractErrorMessage, HttpError } from '@/lib/api-errors';

import {
  mapBackendUpdateToMinutaResult,
  mapMinutaPadraoPayloadToBackend,
  type BackendUpdateProposalResponse,
} from './proposal-mapping';
import type {
  ProposalSummary,
  UpdateMinutaPadraoPayload,
  UpdateMinutaPadraoResult,
} from './proposal.types';

/**
 * Loads the proposal's `finalidade` (and id) via the BFF
 * (`GET /api/proposals/:id`), proxying `GET /v1/proposals/:id`.
 *
 * Used by proposal-scoped blocks (e.g. "Recursos financeiros", RN-F6-01) to
 * decide whether they apply to this proposal before rendering anything else.
 */
export async function getProposal(proposalId: string): Promise<ProposalSummary> {
  const res = await fetch(withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}`));

  if (!res.ok) {
    throw new HttpError(`Falha ao carregar a proposta (${res.status}).`, res.status);
  }

  return (await res.json()) as ProposalSummary;
}

/**
 * Reenvia à análise a proposta que a SNEG devolveu (HU-F2-03), via the BFF
 * (`POST /api/proposals/:id/reenviar`).
 *
 * Lives in `proposals` and not in `analise`/`sneg` because the action belongs
 * to the LT: HU-F2-03 assigns the correction and the resubmission to whoever
 * owns the proposal, never to the analyst who returned it.
 *
 * @throws {Error} carrying the backend message on 400 (proposal not returned)
 *   or 409 (analysis sub-phase conflict) — the screen shows the real reason.
 */
export async function reenviarProposal(proposalId: string): Promise<ProposalSummary> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/reenviar`),
    { method: 'POST' },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      extractErrorMessage(body, `Falha ao reenviar a proposta (${res.status}).`),
    );
  }

  return (await res.json()) as ProposalSummary;
}

/**
 * CTR-F1 (HU-02 / RN-F1-03 / RN-F1-05): updates the minuta-padrão flag
 * and optional Netlex consultation code via the BFF
 * (`PATCH /api/proposals/:id`), proxying `PATCH /v1/proposals/:id`.
 *
 * Cross-validation rules enforced by the backend:
 *  - `minutaPadrao: true` + code ⇒ 400.
 *  - `minutaPadrao: false` without code ⇒ 200 with `consultaJuridicaPendente: true`.
 *
 * @throws {Error} on 400 (validation), 403 (role), 404 (not found), or network error.
 */
export async function updateProposal(
  proposalId: string,
  payload: UpdateMinutaPadraoPayload,
): Promise<UpdateMinutaPadraoResult> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapMinutaPadraoPayloadToBackend(payload)),
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      extractErrorMessage(body, `Falha ao atualizar a proposta (${res.status}).`),
    );
  }

  const raw = (await res.json()) as BackendUpdateProposalResponse;
  return mapBackendUpdateToMinutaResult(raw);
}

/**
 * Corrige o período de análise da proposta via a BFF
 * (`PATCH /api/proposals/:id/periodo-analise`).
 *
 * Rota própria, e não o `PATCH /api/proposals/:id` que `updateProposal` usa: o
 * backend recorta os perfis por rota (o BP Financeiro alcança o período e não
 * os demais campos da proposta) — ver `ANALYSIS_WINDOW_EDIT_ROLES`.
 *
 * Devolve a proposta atualizada, para o chamador substituir o estado sem uma
 * releitura que poderia trazer a linha de antes.
 *
 * @throws {Error} com a frase do BACKEND em 400 (janela inválida, ou proposta
 *   já enviada para aprovação), 403 e 404 — é ela que nomeia o limite.
 */
export async function updateProposalAnalysisWindow(
  proposalId: string,
  janela: { dataInicioAnalise: string; dataFimAnalise: string },
): Promise<ProposalSummary> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/periodo-analise`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(janela),
    },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(
      extractErrorMessage(
        body,
        `Falha ao alterar o período da análise (${res.status}).`,
      ),
    );
  }

  return (await res.json()) as ProposalSummary;
}
