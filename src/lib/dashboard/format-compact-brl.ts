/**
 * Compact BRL currency formatter for dashboard KPI cards (DASH-F2).
 *
 * The backend sends monetary values as exact decimal strings (e.g. `"187000000.00"`).
 * This utility parses the string **once** and formats it using `Intl.NumberFormat`
 * with `notation: 'compact'` — the same notation the prototype uses ("R$ 187M").
 *
 * Rules (from ADR-0018 + issue spec):
 * - Input is a decimal string; never a raw `number` from `parseFloat` used
 *   directly in display — the string is the source of truth from the backend.
 * - `null` input → returns `"—"` (absence of data; never "R$ 0,00").
 * - Non-parseable or non-finite string → returns `"—"` (defensive).
 * - Compact notation: maximumFractionDigits=1 (e.g. "R$ 187,0M").
 *
 * @example
 * formatCompactBRL("187000000.00") // → "R$ 187M"
 * formatCompactBRL("15583333.33")  // → "R$ 15,6M"
 * formatCompactBRL(null)           // → "—"
 */
export function formatCompactBRL(decimalStr: string | null): string {
  if (decimalStr === null) return '—';

  if (decimalStr.trim() === '') return '—';

  const n = Number(decimalStr);
  if (!Number.isFinite(n)) return '—';

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n);
}
