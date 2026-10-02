import { TipoProposta } from '@/lib/proposals/franquia-proposal.types';

/**
 * Builds the canonical URL for a proposal screen.
 *
 * Franchise proposals (ZBRM / ZLUB) have a dedicated route (`/franquia`).
 * All other proposal types (PCR and any unknown future type) open the generic
 * proposal screen.
 *
 * This is the **single** place in the codebase that constructs
 * `/oportunidades/.../propostas/...` hrefs — every call site MUST go through
 * here so that the routing rule is never duplicated (a duplicated ternary is
 * how the bug that prompted VBR-508 was introduced).
 *
 * @param opportunityId - UUID of the opportunity.
 * @param proposalId    - UUID of the proposal.
 * @param tipoProposta  - SAP material code (PCR / ZBRM / ZLUB), or null/undefined
 *                        for unknown types (falls back to the generic screen).
 */
export function proposalHref(
  opportunityId: string,
  proposalId: string,
  tipoProposta: string | null | undefined,
): string {
  const base = `/oportunidades/${encodeURIComponent(opportunityId)}/propostas/${encodeURIComponent(proposalId)}`;
  const isFranquia =
    tipoProposta === TipoProposta.ZBRM || tipoProposta === TipoProposta.ZLUB;
  return isFranquia ? `${base}/franquia` : base;
}
