/**
 * Catálogo de picklists do Salesforce — cópia do catálogo do BACKEND
 * (`apps/api/src/picklists/catalog/*.catalog.ts`), com os mesmos valores, rótulos
 * e matrizes de dependência. No protótipo não há backend: o mock resolve as
 * opções com a mesma regra de `PicklistCatalogService.options`, então a tela vê
 * exatamente o que a produção vê (inclusive `CONTROLADOR_AUSENTE`).
 *
 * Os arquivos `*.catalog.ts` ao lado são cópia verbatim; só os imports mudaram.
 */

/** Espelho de `apps/api/src/picklists/domain/picklist-field.enum.ts`. */
export enum PicklistField {
  OpportunityTipoNegociacao = 'opportunity-tipo-negociacao',
  OpportunityPimAdesao = 'opportunity-pim-adesao',
  OpportunityAlteracaoMinutaPadrao = 'opportunity-alteracao-minuta-padrao',
  AreaUsuario = 'area-usuario',
  QuoteTipoProposta = 'quote-tipo-proposta',
  QuoteTipoContrato = 'quote-tipo-contrato',
  QuoteFinalidade = 'quote-finalidade',
  QuotePrazoContrato = 'quote-prazo-contrato',
  QuoteResponsavelManutencao = 'quote-responsavel-manutencao',
  QuoteResponsavelManutencaoImagem = 'quote-responsavel-manutencao-imagem',
  QuoteAlteracaoMinutaPadrao = 'quote-alteracao-minuta-padrao',
  QuoteLicencaOnerosa = 'quote-licenca-onerosa',
  ProductLineIncoterm = 'product-line-incoterm',
  ProductLinePrazoPagamento = 'product-line-prazo-pagamento',
  RecursoFinanceiroTipo = 'recurso-financeiro-tipo',
  RecursoFinanceiroFinalidade = 'recurso-financeiro-finalidade',
  RecursoFinanceiroEtapaLiberacao = 'recurso-financeiro-etapa-liberacao',
  RecursoFinanceiroPeriodicidade = 'recurso-financeiro-periodicidade',
  RecursoFinanceiroIndiceCorrecao = 'recurso-financeiro-indice-correcao',
  GarantiaTipo = 'garantia-tipo',
  GarantiaUtilizacao = 'garantia-utilizacao',
  PostoTipo = 'posto-tipo',
  PostoSituacao = 'posto-situacao',
  PostoPropriedade = 'posto-propriedade',
  PostoBandeira = 'posto-bandeira',
  InvestimentoEquipamento = 'investimento-equipamento',
  InvestimentoElementoImagem = 'investimento-elemento-imagem',
  DocumentoTipo = 'documento-tipo',
}

/** Espelho de `apps/api/src/picklists/domain/picklist-definition.ts`. */
export interface PicklistValue {
  apiName: string;
  label?: string;
  active?: boolean;
  isDefault?: boolean;
  legacy?: boolean;
  platformOnly?: boolean;
}

export interface PicklistDefinition {
  field: PicklistField;
  salesforceField: string;
  globalValueSet?: string;
  controlledBy?: PicklistField;
  restricted: boolean;
  values: readonly PicklistValue[];
  valueSettings?: Readonly<Record<string, readonly string[]>>;
  valueSettingsComplete?: boolean;
  offerAllWhenControllerEnablesNone?: boolean;
}

export function isActive(value: PicklistValue): boolean {
  return value.active !== false && !value.legacy && !value.platformOnly;
}

export function picklistLabel(value: PicklistValue): string {
  return value.label ?? value.apiName;
}
