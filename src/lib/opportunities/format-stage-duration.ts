/**
 * Formats a stage duration in days to a human-readable pt-BR string.
 *
 * Rounding rules (explicit — never `toFixed`, never `Math.floor`):
 *  - fractional days are rounded to the nearest integer via `Math.round`.
 *  - months are derived as `Math.round(dias / 30)`.
 *
 * Thresholds:
 *  - `null` input       → `null`   (caller omits the badge; "0 d" would misread as
 *                                   "just entered" when the record simply has no data)
 *  - 0 to < 30 days     → `"{n} d"`    e.g. "6 d"
 *  - ≥ 30 days, n = 1   → `"1 mês"`
 *  - ≥ 30 days, n > 1   → `"{n} meses"`
 */
export function formatStageDuration(dias: number | null): string | null {
  if (dias === null) return null;
  if (dias < 30) {
    return `${Math.round(dias)} d`;
  }
  const meses = Math.round(dias / 30);
  return meses === 1 ? '1 mês' : `${meses} meses`;
}
