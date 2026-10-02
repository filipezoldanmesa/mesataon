/**
 * View helpers for one Anexo A band (ADO 67572).
 *
 * The band table renders EVERY column the business published, and two of them —
 * the tabaco rates — are absent from most catalogue rows. Absent is not zero
 * there, and it is not "—" either: see {@link taxaTabacoDaFaixa}.
 */

import { formatRatioPercent } from './format';
import type { RoyaltyFaixa } from './proposta-franquia-mapping';

export interface TaxaTabaco {
  /** Formatted pt-BR percentage, or `null` when the band has no rate at all. */
  valor: string | null;
  /**
   * `true` when the catalogue does not distinguish tabaco in this band and the
   * general rate is what gets charged.
   */
  herdado: boolean;
}

/**
 * The tabaco rate the CALCULATION will use for this band.
 *
 * ⚠️ A null tabaco column does NOT render as "—". `splitRates`
 * (`apps/api/src/franquia/domain/royalty-revenue.ts`) makes the tabaco rate
 * **inherit** the general one when the column is null — "a catalogue that does
 * not distinguish tobacco is charging one rate for everything, and reading the
 * absence as 'tobacco is free' would understate the royalty on the very category
 * the policy singles out". Printing "—" beside it would contradict the number
 * the royalty is actually computed with: the tela × cálculo divergence this repo
 * exists to prevent.
 *
 * So the inherited value is shown, flagged, and the table carries one footnote
 * saying where it came from.
 *
 * `0.000000` is NOT inheritance — it is the business saying tabaco pays nothing
 * in this band, which is exactly what the escalonado table declares.
 */
export function taxaTabacoDaFaixa(
  tabaco: string | null,
  geral: string | null,
): TaxaTabaco {
  const proprio = formatRatioPercent(tabaco);
  if (proprio !== null) return { valor: proprio, herdado: false };

  // Neither column has a rate — a VALOR_FIXO band, for instance. Nothing is
  // inherited, so nothing is flagged and the cell falls back to an em dash.
  const geralFormatado = formatRatioPercent(geral);
  if (geralFormatado === null) return { valor: null, herdado: false };

  return { valor: geralFormatado, herdado: true };
}

/**
 * `true` when at least one band of the table inherits a tabaco rate — the
 * footnote only renders when it has something to explain.
 */
export function algumaFaixaHerdaTabaco(faixas: readonly RoyaltyFaixa[]): boolean {
  return faixas.some(
    (faixa) =>
      taxaTabacoDaFaixa(faixa.percRoyaltyTabaco, faixa.percRoyalty).herdado ||
      taxaTabacoDaFaixa(faixa.percFundoDeMktTabaco, faixa.percFundoDeMkt).herdado,
  );
}
