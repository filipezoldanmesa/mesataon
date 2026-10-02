/**
 * Formatting helpers for economic indicators (TIR/VPL/margens).
 *
 * Single source for the decimal→percent conversion: the backend sends ratios
 * (`tir: 0.35` = 35%, see `OpportunityIndicatorsDto`), while `tma` already
 * arrives in percent. Three call sites had byte-identical private copies of
 * this function and a fourth formatted the ratio raw, rendering `0,35%` for the
 * same value the panel showed as `35%`. Keep the conversion here so the unit
 * convention is stated once.
 */

/** Renders a decimal ratio (0.35) as a pt-BR percentage (`35%`). */
export function formatPercentFromDecimal(value: number): string {
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
