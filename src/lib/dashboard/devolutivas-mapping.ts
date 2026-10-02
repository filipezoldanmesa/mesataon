/**
 * Mapper for `GET /v1/dashboard/devolutivas` → `DevolutivasData`.
 *
 * The backend sends:
 * - `tempoMedioDevolutivaDias` as a string decimal (e.g. `"3.50"`) or `null`.
 * - `taxaReaberturas` as a fraction `[0, 1]` or `null` when amostra = 0.
 * - `resolvidasPrimeiroRetorno` as a fraction `[0, 1]` or `null` when no proposal was returned.
 * - `amostra` as an integer ≥ 0.
 *
 * Invariants:
 * - `null` metrics are never replaced with `0` — `null` means "no data for this period".
 * - `amostra` must always be displayed alongside the rate KPIs (RN-F2-03).
 * - Formatting (percentages, decimal days) is the front-end's responsibility (ADR-0018).
 *
 * (DASH-F2 / VBR-428)
 */

// ---------------------------------------------------------------------------
// Backend shapes (explicit)
// ---------------------------------------------------------------------------

/**
 * Raw shape of the `kpis` object inside `GET /v1/dashboard/devolutivas`.
 */
export interface BackendDevolutivasKpis {
  /** Decimal string or null. */
  tempoMedioDevolutivaDias: string | null;
  /** Fraction [0, 1] or null when amostra = 0. */
  taxaReaberturas: number | null;
  /** Fraction [0, 1] or null when no proposal was returned. */
  resolvidasPrimeiroRetorno: number | null;
  /** Base sample size: proposals with ≥ 1 `entrou_em_analise` event. */
  amostra: number;
}

export interface BackendGap {
  secao: string;
  fonte: string;
  mensagem?: string;
}

/**
 * Raw shape of `GET /v1/dashboard/devolutivas`.
 *
 * API Contract — VBR-428:
 *
 *   GET /v1/dashboard/devolutivas
 *   Response 200: DashboardDevolutivasDto
 *   Response 401: { code: "UNAUTHORIZED" }
 *   Response 403: { code: "FORBIDDEN" } — widget not available for this persona
 */
export interface BackendDashboardDevolutivas {
  recorte: string;
  /** null when the section is degraded — `gaps` names the source. */
  kpis: BackendDevolutivasKpis | null;
  gaps: BackendGap[];
}

// ---------------------------------------------------------------------------
// Frontend shapes (mapped)
// ---------------------------------------------------------------------------

/**
 * Devolutivas quality KPIs as presented to the front-end (DASH-F2 / RN-F2-03).
 *
 * All three metrics are **measures** (ADR-0018): neutral typography, no
 * traffic-light colouring on the numbers.
 *
 * `amostra` must always be visible alongside the rates — "92% sobre 3 casos"
 * and "92% sobre 300 casos" are different statements.
 */
export interface DevolutivasKpis {
  /** Decimal string or null — format as days on the front-end (e.g. "3,5 d"). */
  tempoMedioDevolutivaDias: string | null;
  /** Fraction [0, 1] or null — format as percentage (e.g. "6%"). */
  taxaReaberturas: number | null;
  /** Fraction [0, 1] or null — format as percentage (e.g. "78%"). */
  resolvidasPrimeiroRetorno: number | null;
  /** Sample size; always shown with the rates. */
  amostra: number;
}

/**
 * Frontend contract for the devolutivas dashboard section (DASH-F2 / RN-F2-03).
 *
 * `kpis` is `null` when the backend section is degraded; the card must render
 * an error state naming the source (CA-5).
 * `errorFonte` is set when `kpis` is null and `gaps` names a source.
 */
export interface DevolutivasData {
  /** Mapped KPIs; null when the section is degraded. */
  kpis: DevolutivasKpis | null;
  /**
   * Integration name to display in the error state (CA-5).
   * `null` when `kpis` is present (no degradation).
   */
  errorFonte: string | null;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function mapKpis(b: BackendDevolutivasKpis): DevolutivasKpis {
  return {
    tempoMedioDevolutivaDias: b.tempoMedioDevolutivaDias ?? null,
    taxaReaberturas: b.taxaReaberturas ?? null,
    resolvidasPrimeiroRetorno: b.resolvidasPrimeiroRetorno ?? null,
    amostra: b.amostra,
  };
}

/**
 * Maps the raw `GET /v1/dashboard/devolutivas` payload to the typed
 * {@link DevolutivasData} frontend contract.
 *
 * Invariants:
 * - `null` metrics are never defaulted to `0` — the UI omits the value, not zeroes it.
 * - When `kpis` is null, `errorFonte` is taken from the first gap entry that
 *   names the devolutivas section, or defaults to `"dashboard/devolutivas"`.
 */
export function mapDashboardDevolutivas(raw: BackendDashboardDevolutivas): DevolutivasData {
  if (raw.kpis === null) {
    const gap = raw.gaps?.find((g) => g.secao === 'kpis' || g.secao === 'devolutivas');
    return {
      kpis: null,
      errorFonte: gap?.fonte ?? 'dashboard/devolutivas',
    };
  }

  return {
    kpis: mapKpis(raw.kpis),
    errorFonte: null,
  };
}
