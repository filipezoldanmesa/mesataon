/**
 * Compact display label for a proposal, shown in the breadcrumb.
 *
 * Since migration `1783036800072` (backfill) most proposals have a
 * `Proposal.codigo` (e.g. "PCR-GOP-00000055/2026"). Callers should pass that
 * value as the first argument when available — this function returns it as-is.
 *
 * When `codigo` is null or absent (some ZLUB/ZBRM rows that pre-date the
 * sequencer), the function falls back to a derived label: `P-` + the first
 * UUID segment, uppercased.  This fallback is a LAST-RESORT display shortening
 * of the route id, never a fabricated business code. It must never appear for
 * PCR proposals (100% backfilled).
 *
 * - "PCR-GOP-00000055/2026" (business code) → returned verbatim
 * - `null`/`undefined` + `39142f80-1a2b-…`  → `P-39142F80`
 * - `null`/`undefined` + `P-1115` (mock id) → `P-1115` (already a code)
 * - `null`/`undefined` + `abc`              → `P-ABC`
 */
export function shortProposalCode(id: string, codigo?: string | null): string {
  if (codigo) return codigo;
  const upper = id.trim().toUpperCase();
  if (!upper) return '';
  if (upper.startsWith('P-')) return upper;
  const [first] = upper.split('-');
  return `P-${first}`;
}
