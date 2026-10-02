/**
 * Client-side mirror of the backend `ScenarioComparisonDto` (VBR-103).
 *
 * Field names are kept in camelCase matching the backend DTO (the BFF does no
 * field renaming).
 *
 * Prototype reference: `02-comparacao-cenarios.html` (table rows in order).
 */
export interface ScenarioDto {
  proposalId: string;
  /** Business code, e.g. "P-1115"; null until the backend assigns one. */
  codigo: string | null;
  tipoProposta: string;
  tipoContrato: string;
  status: string;
  /** true when this proposal is currently elected (in `opportunity.proposalIds`). */
  isElected: boolean;

  // F5 — commercial dimensions (derived from product lines)
  /** m³/mês */
  volume: number | null;
  /** R$/m³ */
  precoMedio: number | null;
  /** months */
  prazoMeses: number | null;
  /** BRL */
  receitaPrevista: number | null;
  /** R$/m³ */
  margem: number | null;

  // F6 — financial resources
  /** BRL; null when no financial resources are attached. */
  recursosFinanceiros: number | null;
  /** 0–1 decimal fraction; null when no financial resources are attached. */
  pctAntecipacao: number | null;

  // F7 — economic indicator snapshot (proposal_indicators)
  /** decimal fraction (e.g. 0.96 = 96%); null when never calculated. Check `indicadorStatus`. */
  tir: number | null;
  /** BRL; null when never calculated. Check `indicadorStatus`. */
  vpl: number | null;
  /**
   * years; always null — `proposal_indicators` has no payback column and the
   * ARP envelope has no payback field, so no integration fills this.
   */
  payback: number | null;
  /**
   * R$/m³ (unitário, RN-F4-01): recursos financeiros ÷ volume total contratado.
   * `null` — never `0` — when the proposal has no financial resource, no volume,
   * or no analysis window. Lower is better, and it is the same measure the SNEG
   * BP-adherence card compares against the target.
   */
  custoVinculacaoUnitario: number | null;
  /**
   * Status of the indicators snapshot. `null` when never calculated.
   * Values other than `'atualizado'` mean `tir`/`vpl` are from a previous
   * calculation and must be shown as stale.
   */
  indicadorStatus: string | null;

  // F8 — approval slot (out of scope)
  alcada: string | null;
}

/** Response of `GET /api/opportunities/:id/scenarios/comparison`. */
export interface ScenarioComparisonResponse {
  opportunityId: string;
  scenarios: ScenarioDto[];
}
