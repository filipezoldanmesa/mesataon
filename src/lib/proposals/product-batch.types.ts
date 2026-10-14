/**
 * Batch entry of product lines (US 69180).
 *
 * Replaces "add one product at a time" with an editable table pre-filled by the
 * backend. The screen only renders and edits; every suggestion and every verdict
 * (what is eligible, the suggested dates, margins, incoterm, payment term, what
 * is missing on a row) comes from the backend.
 *
 * Contract (all under `/api/proposals/:id/product-batch`):
 *
 *   GET    /                → 200 ProductBatchDraft   (the saved draft, or a fresh one built from the eligible products)
 *   PUT    /                → 200 ProductBatchDraft   (autosave; replaces the draft, returns it recalculated)
 *   DELETE /                → 200 ProductBatchDraft   ("Limpar campos": back to the fresh suggestions)
 *   POST   /rows            → 201 ProductBatchRow     (adds one eligible product to the draft, with its suggestions)
 *   POST   /submit          → 200 ProductLine[] | 400 { errors: ProductBatchRowError[] } (all-or-nothing, selected rows only)
 */

/** One product row of the table. Dates are ISO `yyyy-mm-dd`; empty string = not filled. */
export interface ProductBatchRow {
  produtoCodigo: string;
  produtoNome: string;
  /** Base shown for the product (the account's default supply center). `''` when there is none. */
  base: string;
  baseCodigo: string | null;
  /** The user keeps this product in the proposal. Only selected rows are saved. */
  selecionado: boolean;
  /** Suggested from the proposal's creation date; editable. */
  inicioConsumo: string;
  /** Suggested by the backend; editable. */
  fimConsumo: string;
  /** Sales horizon, in months — derived by the backend from the two dates. `null` while a date is missing. */
  hvMeses: number | null;
  /**
   * "Quantidade de mesa" — the volume the desk expects for the product, m³/month.
   * Read-only. Origin: **not known yet** (mocked); to be confirmed with the business.
   */
  quantidadeMesa: number | null;
  /** Volume of the proposal line, m³/month. Pre-filled with {@link quantidadeMesa}; editable. */
  volume: number | null;
  /**
   * Margem realizada: the product's average margin over the last 12 months in the
   * base and sales zone, R$/m³. Read-only. It is the "margem sugerida" of US 68969.
   * `null` when the backend has no reference for it.
   */
  margemRealizada: number | null;
  /** Margem proposta, R$/m³. Empty ⇒ the backend adopts the margem realizada. */
  margemProposta: number | null;
  /** Incoterm: loaded from the material's registration. SAP code, `''` when absent. */
  incoterm: string;
  /**
   * Payment term (SAP code): pre-filled from the customer's current NEG for the
   * product and base; `''` when there is none. Editable.
   */
  prazoPagamento: string;
}

export interface ProductBatchDraft {
  linhas: ProductBatchRow[];
  /**
   * `true` ⇒ the rows are the products registered for this customer. `false` ⇒ the
   * customer has no registered list, so the table starts empty and the user adds
   * products by search (the catalog has thousands of products).
   */
  restritaAoCliente: boolean;
  /** ISO timestamp of the last autosave; `null` when nothing was saved yet. */
  atualizadoEm: string | null;
}

/** A refusal about one row of the submit. */
export interface ProductBatchRowError {
  produtoCodigo: string;
  field: string;
  message: string;
}

/** The submit refused one or more selected rows; nothing was saved. */
export class ProductBatchValidationError extends Error {
  constructor(
    readonly erros: ProductBatchRowError[],
    message: string,
  ) {
    super(message);
    this.name = 'ProductBatchValidationError';
  }
}
