/**
 * Salesforce picklist options served by the backend catalog.
 *
 * The frontend does NOT keep its own copy of a value set (see
 * `salesforce-values.ts` for why): several sets have 44–316 members, their
 * labels belong to Salesforce, and — decisively — the dependency filtering is a
 * derived rule, which this codebase always resolves in the backend.
 *
 * Mirrors `apps/api/src/picklists/dto/picklist.dto.ts`.
 */

/** The picklists the backend catalogues. Mirrors `PicklistField` in the API. */
export const PicklistField = {
  OpportunityTipoNegociacao: 'opportunity-tipo-negociacao',
  OpportunityPimAdesao: 'opportunity-pim-adesao',
  AreaUsuario: 'area-usuario',
  QuoteTipoProposta: 'quote-tipo-proposta',
  QuoteTipoContrato: 'quote-tipo-contrato',
  QuoteFinalidade: 'quote-finalidade',
  QuotePrazoContrato: 'quote-prazo-contrato',
  QuoteResponsavelManutencao: 'quote-responsavel-manutencao',
  QuoteResponsavelManutencaoImagem: 'quote-responsavel-manutencao-imagem',
  QuoteAlteracaoMinutaPadrao: 'quote-alteracao-minuta-padrao',
  QuoteLicencaOnerosa: 'quote-licenca-onerosa',
  ProductLineIncoterm: 'product-line-incoterm',
  ProductLinePrazoPagamento: 'product-line-prazo-pagamento',
  RecursoFinanceiroTipo: 'recurso-financeiro-tipo',
  RecursoFinanceiroFinalidade: 'recurso-financeiro-finalidade',
  RecursoFinanceiroEtapaLiberacao: 'recurso-financeiro-etapa-liberacao',
  RecursoFinanceiroPeriodicidade: 'recurso-financeiro-periodicidade',
  RecursoFinanceiroIndiceCorrecao: 'recurso-financeiro-indice-correcao',
  GarantiaTipo: 'garantia-tipo',
  GarantiaUtilizacao: 'garantia-utilizacao',
  PostoTipo: 'posto-tipo',
  PostoSituacao: 'posto-situacao',
  PostoPropriedade: 'posto-propriedade',
  PostoBandeira: 'posto-bandeira',
  /** `Investimento_Da_Cotacao__c.Equipamento__c` — 40 valores (ADO 68506). */
  InvestimentoEquipamento: 'investimento-equipamento',
  /** `Investimento_Da_Cotacao__c.Elemento_de_Imagem__c` — 38 valores (ADO 68506). */
  InvestimentoElementoImagem: 'investimento-elemento-imagem',
  DocumentoTipo: 'documento-tipo',
} as const;

export type PicklistField = (typeof PicklistField)[keyof typeof PicklistField];

/**
 * Why an option list came back the way it did.
 *
 * `ControladorAusente` is NOT an error: a dependent picklist with no controlling
 * value selected offers nothing, exactly as the Salesforce UI does. Render the
 * select disabled with a hint naming the field to answer first — never fall back
 * to "all values", which would let the user pick a pair the CRM refuses.
 *
 * `DependenciaNaoMapeada` means the source analysis does not publish that
 * field's dependency matrix, so every active value is offered rather than an
 * invented subset.
 */
export const PicklistFilterOutcome = {
  NaoDependente: 'NAO_DEPENDENTE',
  Filtrada: 'FILTRADA',
  ControladorAusente: 'CONTROLADOR_AUSENTE',
  DependenciaNaoMapeada: 'DEPENDENCIA_NAO_MAPEADA',
  /**
   * Matrix is complete and the chosen controlling value enables NOTHING. Every
   * active value comes back and the screen must name the gap — an empty select
   * would be a dead end the user cannot resolve.
   */
  SemValorPublicado: 'SEM_VALOR_PUBLICADO',
} as const;

export type PicklistFilterOutcome =
  (typeof PicklistFilterOutcome)[keyof typeof PicklistFilterOutcome];

export interface PicklistOption {
  /** The value to send back — the Salesforce API name, verbatim. */
  value: string;
  /** The Salesforce label. Frequently different from the value (`BR` → "VIBRA"). */
  label: string;
  isDefault: boolean;
}

export interface PicklistOptions {
  field: PicklistField;
  /** `Objeto.Campo__c` of origin — useful in support conversations. */
  salesforceField: string;
  controlledBy: PicklistField | null;
  controllingValue: string | null;
  outcome: PicklistFilterOutcome;
  options: PicklistOption[];
}

/** Thrown when the picklist could not be loaded — never collapsed into an empty list. */
export class PicklistUnavailableError extends Error {
  constructor(readonly field: PicklistField) {
    super('Não foi possível carregar as opções deste campo. Tente novamente.');
    this.name = 'PicklistUnavailableError';
  }
}
