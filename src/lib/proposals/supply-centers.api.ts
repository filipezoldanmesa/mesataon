/**
 * BFF client for the supply-center listing (VBR-468) — options of the
 * product-line "Base" select.
 */
import { apiUrl, withBasePath } from '@/lib/base-path';

import type { ProposalSupplyCenters, SupplyCenter } from './supply-centers.types';

export async function listSupplyCenters(): Promise<SupplyCenter[]> {
  const res = await fetch(withBasePath('/api/supply-centers'), {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Falha ao carregar os centros fornecedores (${res.status}).`);
  }
  return (await res.json()) as SupplyCenter[];
}

/**
 * "Base" options for the proposal: the whole catalog with the account's centers
 * flagged `sugerida` and listed first (ADO 67869). Prefer this over
 * {@link listSupplyCenters} anywhere the proposal is known — the unscoped
 * listing carries no suggestion mark, so it cannot tell the LT which base came
 * from SAP.
 */
export async function listProposalSupplyCenters(
  proposalId: string,
): Promise<ProposalSupplyCenters> {
  const res = await fetch(apiUrl('proposals', proposalId, 'supply-centers'), {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Falha ao carregar as bases da proposta (${res.status}).`);
  }
  return (await res.json()) as ProposalSupplyCenters;
}
