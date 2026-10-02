import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';
import type { Aprovacao } from './aprovacao.types';

/**
 * Thrown when the profile may not read the approval (403).
 *
 * Distinct from a failed read: the screen renders the plain "página não
 * encontrada" (CLAUDE.md), because retrying a 403 can never succeed and saying
 * "acesso restrito" confirms the opportunity exists, letting any logged-in user
 * map the restricted surface. Mirrors `ContratoForbiddenError`.
 */
export class AprovacaoForbiddenError extends Error {
  constructor(readonly opportunityId: string) {
    super(`Sem permissão para ler a aprovação: ${opportunityId}`);
    this.name = 'AprovacaoForbiddenError';
  }
}

/**
 * `GET /api/opportunities/:id/aprovacao` — read model of the 01d screen.
 *
 * @throws {AprovacaoForbiddenError} when the profile may not read it (403).
 * @throws {Error} on every other failure.
 */
export async function getAprovacao(opportunityId: string): Promise<Aprovacao> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/aprovacao`),
    { cache: 'no-store' },
  );
  if (res.status === 403) {
    throw new AprovacaoForbiddenError(opportunityId);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao carregar a aprovação da alçada.');
  }
  return (await res.json()) as Aprovacao;
}

/**
 * `POST /api/opportunities/:id/aprovacao/refresh` — re-reads the org NOW.
 *
 * The snapshot is otherwise written only by a worker polling every 5 minutes,
 * so right after GATE 2 the screen could say "não acionada" while the org had
 * already created the approval process, and after an approval it kept
 * "Aguardando decisão" across full navigations — the staleness is persisted,
 * not cached, so reloading did nothing (VBR-629).
 *
 * Idempotent on the backend (same `AprovacaoSyncService.refresh` the worker
 * uses), and a failed org read does not fail the request: it returns the
 * snapshot as it stands, with `lidoEm` showing its age.
 */
export async function refreshAprovacao(opportunityId: string): Promise<Aprovacao> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/aprovacao/refresh`),
    { method: 'POST', cache: 'no-store' },
  );
  if (res.status === 403) {
    throw new AprovacaoForbiddenError(opportunityId);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao reler a aprovação da alçada.');
  }
  return (await res.json()) as Aprovacao;
}
