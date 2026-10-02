/**
 * One supply center (base de fornecimento) — a record of the Salesforce
 * custom object `Centro_Fornecedor__c`, the target of the quote-line LOOKUP
 * `QuoteLineItem.Centro_Fornecedor__c` (VBR-468).
 */
export interface SupplyCenter {
  /** `Codigo_Do_Centro__c` — Text external id, unique (e.g. `"5099"`). */
  code: string;
  /** Record `Name` — the label the LT recognizes. */
  name: string;
}

/** One "Base" option for a proposal: a catalog record plus the suggestion mark. */
export interface ProposalSupplyCenter extends SupplyCenter {
  /**
   * `true` when one of the account's sales areas names this center — the base
   * that comes suggested from SAP. A MARK, never a filter (ADO 67869).
   */
  sugerida: boolean;
}

/** Why no base could be suggested. `null` when at least one was. */
export type SupplyCenterSuggestionGap =
  | 'CONTA_SEM_CENTRO'
  | 'FONTE_INDISPONIVEL'
  | 'SEM_CLIENTE_VINCULADO';

/**
 * "Base" options for one proposal (ADO 67869).
 *
 * `items` is the WHOLE `Centro_Fornecedor__c` catalog, suggested centers first.
 * VBR-643 had narrowed it to the account's own centers so the CPV key could not
 * come from another account; measured in UAT on 24/08/2026 that narrowing left
 * an account with a SINGLE option — `5001 - Administração Central VIBRA` — for
 * which every eligible product read `sem CPV nesta base`, so no product could be
 * added at all. The guard against a wrong base did not go away: it lives in the
 * per-product `sem CPV nesta base` mark and in the save refusal, both of which
 * name the problem instead of hiding the options.
 *
 * `detail` is a pt-BR sentence explaining why nothing is suggested — `null`
 * when there IS a suggestion. Never an empty `items`: the Base is mandatory, so
 * no options would be a dead end the LT cannot leave.
 */
export interface ProposalSupplyCenters {
  reason: SupplyCenterSuggestionGap | null;
  detail: string | null;
  items: ProposalSupplyCenter[];
}
