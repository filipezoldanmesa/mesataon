import { withBasePath } from '@/lib/base-path';

import type { PerfilCredito } from './types';

/**
 * BFF client for GET /api/opportunities/:id/perfil-credito.
 *
 * Returns `null` when the concessão does not require a perfil analysis (HTTP 204
 * — no antecipação/mútuo). Throws for 5xx / 403 so the caller can render the
 * error state.
 *
 * A 404 from the BFF (resource not found or opportunity unknown) also throws —
 * it is a genuine upstream error, not a "not applicable" state.
 */
export async function getPerfilCredito(
  opportunityId: string,
): Promise<PerfilCredito | null> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/perfil-credito`,
    ),
  );

  // 204 = concessão does not require perfil analysis — not an error.
  if (res.status === 204) return null;

  if (!res.ok) {
    throw new Error(`Falha ao carregar perfil/risco (${res.status}).`);
  }

  return (await res.json()) as PerfilCredito;
}
