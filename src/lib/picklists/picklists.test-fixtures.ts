import {
  BandeiraPosto,
  EtapaLiberacaoRecurso,
  Finalidade,
  FinalidadeRecurso,
  IndiceCorrecao,
  PeriodicidadeRecurso,
  PrazoContrato,
  PropriedadeImovel,
  ResponsavelManutencao,
  ResponsavelManutencaoImagem,
  SituacaoPosto,
  TipoContrato,
  TipoNegociacao,
  TipoPosto,
  TipoProposta,
  UtilizacaoGarantia,
} from './salesforce-values';
import {
  PicklistFilterOutcome,
  type PicklistField,
  type PicklistOption,
  type PicklistOptions,
} from './picklists.types';

/**
 * The picklist catalog a component test sees, wired up globally in
 * `vitest.setup.ts`.
 *
 * These are REAL Salesforce values with the REAL dependency filtering, not
 * placeholders — a test that picks an option is exercising something the API
 * would accept, which is the whole point of having removed the hardcoded
 * `<option>` lists that held values the CRM does not have.
 *
 * Lives in `src/` (not next to the setup file) so it type-checks against the
 * generated mirror: a Salesforce rename fails here too, instead of leaving the
 * suites green against a stale fixture.
 */

/** `dependent → controlling values that enable it`, mirroring `valueSettings`. */
type Dependency = Record<string, readonly string[]>;

interface Fixture {
  values: readonly string[];
  /** Present only for a dependent picklist. */
  controlledBy?: PicklistField;
  dependency?: Dependency;
  /** Labels that differ from the value; the rest label as themselves. */
  labels?: Record<string, string>;
  defaultValue?: string;
  /** `true` when the source analysis publishes no matrix — offer everything. */
  matrixUnknown?: boolean;
}

const TIPO_PROPOSTA_DEP: Dependency = {
  [TipoProposta.Pcr]: ['DCVIM', 'LUB'],
  [TipoProposta.Pcopp]: ['DCVIM', 'LUB'],
  [TipoProposta.Pcc]: ['DCB2B', 'LUB'],
  [TipoProposta.Pca]: ['AVIA'],
};

const TIPO_CONTRATO_DEP: Dependency = {
  [TipoContrato.CpcvmProduto]: ['PCR', 'PCOPP', 'PCC', 'PCA'],
  [TipoContrato.CpcvmVolume]: ['PCR', 'PCC', 'PCA'],
  [TipoContrato.CpcvmSublocacao]: ['PCR', 'PCOPP'],
  [TipoContrato.ClumLiquido]: ['PCR'],
  [TipoContrato.BrMania]: ['PCR'],
  [TipoContrato.LubraxMais]: ['PCR'],
  [TipoContrato.CpcvmLocacao]: ['PCOPP'],
  [TipoContrato.ComissaoMercantil]: ['PCOPP'],
  [TipoContrato.CpcvmDisponibilidade]: ['PCC'],
  [TipoContrato.Comodato]: ['PCC', 'PCA'],
  [TipoContrato.Pcra]: ['PCA'],
};

const FINALIDADE_DEP: Dependency = {
  [Finalidade.Implantacao]: ['PCR', 'PCOPP'],
  [Finalidade.Renovacao]: ['PCR', 'PCOPP'],
  [Finalidade.Vinculacao]: ['PCR', 'PCC', 'PCA'],
  [Finalidade.Renegociacao]: ['PCR', 'PCOPP', 'PCC', 'PCA'],
  [Finalidade.BrManiaImplantacao]: ['PCR'],
  [Finalidade.BrManiaRenovacao]: ['PCR'],
  [Finalidade.LubraxMaisImplantacao]: ['PCR'],
  [Finalidade.LubraxMaisRenovacao]: ['PCR'],
  [Finalidade.Cessao]: ['PCR', 'PCOPP'],
  [Finalidade.Complementar]: ['PCR', 'PCOPP', 'PCC'],
  [Finalidade.ComplementarMutuoBr]: ['PCR', 'PCOPP', 'PCC'],
  [Finalidade.Revinculacao]: ['PCA'],
};

const PRAZO_CONTRATO_CONTROLLERS = [
  TipoContrato.Comodato,
  TipoContrato.ClumGnv,
  TipoContrato.LocacaoPpd,
  TipoContrato.LocacaoPpi,
  TipoContrato.CpcvmProduto,
  TipoContrato.CpcvmVolume,
  TipoContrato.ComissaoMercantil,
  TipoContrato.CpcvmLocacao,
  TipoContrato.CpcvmSublocacao,
  TipoContrato.CpcvmDisponibilidade,
  TipoContrato.ClumLiquido,
  TipoContrato.BrMania,
  TipoContrato.LubraxMais,
  TipoContrato.Unico,
  TipoContrato.Individual,
] as readonly string[];

const RECURSO_MUTUO_LIKE = ['Antecipada', 'Mútuo', 'Mútuo Enc. Contas'];

const RECURSO_FINALIDADE_DEP: Dependency = {
  [FinalidadeRecurso.AquisicaoInstalacaoEquipamentos]: RECURSO_MUTUO_LIKE,
  [FinalidadeRecurso.AquisicaoInstalacaoImagemPista]: RECURSO_MUTUO_LIKE,
  [FinalidadeRecurso.ConstrucaoDoPosto]: RECURSO_MUTUO_LIKE,
  [FinalidadeRecurso.ReformaDoPosto]: RECURSO_MUTUO_LIKE,
  [FinalidadeRecurso.IncrementoDasAtividades]: RECURSO_MUTUO_LIKE,
  [FinalidadeRecurso.ManutencaoImagemPista]: ['Antecipada'],
  [FinalidadeRecurso.CumprimentoDoVolumeContratado]: ['Desempenho'],
  [FinalidadeRecurso.PagamentoDeTitulosVencidos]: ['Parcelamento de Débito'],
  [FinalidadeRecurso.RefinanciamentoDoMutuo]: ['Parcelamento de Débito'],
  // CA-2 / VBR-463: these two are financial/administrative types — they appear
  // in the catalog with the same valueSettings as the physical-investment ones
  // but do NOT carry an obra confirmada link (Converge).
  [FinalidadeRecurso.ServicoEspecializadoEmGarantiaReal]: RECURSO_MUTUO_LIKE,
  [FinalidadeRecurso.ImpostosReferentesAImagem]: RECURSO_MUTUO_LIKE,
};

const SITUACAO_POSTO_DEP: Dependency = {
  [SituacaoPosto.AConstruir]: [Finalidade.Implantacao],
  [SituacaoPosto.EmConstrucao]: [Finalidade.Implantacao],
  [SituacaoPosto.EmOperacao]: [Finalidade.Vinculacao, Finalidade.Renovacao, Finalidade.Renegociacao],
  [SituacaoPosto.Paralisado]: [Finalidade.Vinculacao, Finalidade.Renovacao, Finalidade.Renegociacao],
};

const FIXTURES: Partial<Record<PicklistField, Fixture>> = {
  'opportunity-tipo-negociacao': {
    values: [
      TipoNegociacao.Neg,
      TipoNegociacao.ContratoDeVolume,
      TipoNegociacao.ContratoDeVolumeCpp,
      TipoNegociacao.PedidoSpot,
      TipoNegociacao.PedidoDireto,
      TipoNegociacao.Investimento,
      TipoNegociacao.InvestimentoConjunto,
    ],
    labels: { [TipoNegociacao.ContratoDeVolumeCpp]: 'Crédito Pós Performance' },
    defaultValue: TipoNegociacao.Neg,
  },
  'area-usuario': { values: ['DCVIM', 'DCB2B', 'AVIA', 'LUB', 'DD'] },
  /*
   * `Investimento_Da_Cotacao__c.Equipamento__c` e `.Elemento_de_Imagem__c`
   * (ADO 68506) — um RECORTE dos 40 e dos 38 valores do org, medidos em
   * 19/09/2026. Valores reais, como o resto do arquivo: um teste que escolhe
   * "Tanque" está exercitando algo que a API aceita.
   *
   * `Outro` entra nos dois porque existe nos dois e tem regra própria no org
   * (dispara a VR `Outro_Obrigatorio`).
   */
  'investimento-equipamento': {
    values: ['Tanque', 'Totem', 'Bomba Abastecimento', 'Luminária', 'Outro'],
  },
  'investimento-elemento-imagem': {
    values: ['Letreiro BR', 'Testeira padrão', 'Placa ANP', 'Logo BR', 'Outro'],
  },
  // `Garantia_Da_Cotacao__c.Utilizacao__c` (ADO 67858) — `Parcelamento` está no
  // value set do org porém INATIVO, então não é oferecido (isKnown × isSelectable).
  'garantia-utilizacao': {
    values: [UtilizacaoGarantia.Fornecimento, UtilizacaoGarantia.ConcessaoFinanceira],
    defaultValue: UtilizacaoGarantia.Fornecimento,
  },
  'quote-tipo-proposta': {
    values: Object.values(TipoProposta).filter((v) => v !== 'ZBRM' && v !== 'ZLUB'),
    controlledBy: 'area-usuario',
    dependency: TIPO_PROPOSTA_DEP,
  },
  'quote-tipo-contrato': {
    values: Object.values(TipoContrato),
    controlledBy: 'quote-tipo-proposta',
    dependency: TIPO_CONTRATO_DEP,
    labels: { [TipoContrato.CpcvmVolume]: 'CPCVM Volume Total' },
  },
  'quote-finalidade': {
    values: Object.values(Finalidade),
    controlledBy: 'quote-tipo-proposta',
    dependency: FINALIDADE_DEP,
  },
  'quote-prazo-contrato': {
    values: Object.values(PrazoContrato),
    controlledBy: 'quote-tipo-contrato',
    dependency: {
      [PrazoContrato.Determinado]: PRAZO_CONTRATO_CONTROLLERS,
      [PrazoContrato.Indeterminado]: PRAZO_CONTRATO_CONTROLLERS,
    },
  },
  'quote-responsavel-manutencao': {
    values: Object.values(ResponsavelManutencao),
    labels: { [ResponsavelManutencao.Br]: 'VIBRA' },
  },
  'quote-responsavel-manutencao-imagem': {
    values: Object.values(ResponsavelManutencaoImagem),
    labels: { [ResponsavelManutencaoImagem.Br]: 'VIBRA' },
  },
  'recurso-financeiro-tipo': {
    // `Parcelamento de Débito` is intentionally absent — marked `active: false`
    // in the backend catalog (Bug 67513: no RecordType mapping + contradictory
    // org validFor matrix). The fixture mirrors what the API actually returns.
    values: ['Antecipada', 'Desempenho', 'Mútuo', 'Mútuo Enc. Contas'],
    labels: { 'Mútuo Enc. Contas': 'Novo Mútuo' },
  },
  'recurso-financeiro-finalidade': {
    values: Object.values(FinalidadeRecurso),
    controlledBy: 'recurso-financeiro-tipo',
    dependency: RECURSO_FINALIDADE_DEP,
  },
  'recurso-financeiro-etapa-liberacao': {
    values: Object.values(EtapaLiberacaoRecurso),
    controlledBy: 'recurso-financeiro-finalidade',
    matrixUnknown: true,
  },
  'recurso-financeiro-periodicidade': {
    values: Object.values(PeriodicidadeRecurso),
    defaultValue: PeriodicidadeRecurso.Anual,
  },
  'recurso-financeiro-indice-correcao': {
    values: Object.values(IndiceCorrecao),
    defaultValue: IndiceCorrecao.Igpm,
  },
  'posto-tipo': {
    values: Object.values(TipoPosto).filter((v) => v !== 'SERVICOS_URBANOS'),
    labels: {
      [TipoPosto.Urbano]: 'Posto Urbano',
      [TipoPosto.Rodoviario]: 'Posto Rodoviário',
      [TipoPosto.Maritimo]: 'Posto Marítimo',
      [TipoPosto.Servicos]: 'Posto de Serviços',
    },
  },
  'posto-situacao': {
    values: Object.values(SituacaoPosto).filter((v) => v !== 'A Construir / Em Construção'),
    controlledBy: 'quote-finalidade',
    dependency: SITUACAO_POSTO_DEP,
  },
  'posto-propriedade': { values: Object.values(PropriedadeImovel) },
  'posto-bandeira': { values: Object.values(BandeiraPosto) },

  /*
   * Subconjunto REAL do value set `Incoterms` (51 membros no org). Os códigos
   * SAP são os que o negócio seleciona; `CIF`/`FOB` existem, mas eram os dois
   * únicos que o formulário oferecia até 07/08/2026 — ficam aqui justamente
   * para um teste poder distinguir "escolheu o código certo" de "caiu no
   * default antigo".
   */
  'product-line-incoterm': {
    values: ['Z10', 'Z02', 'ZSF', 'CIF', 'FOB'],
    labels: {
      Z10: 'Z10 - FOB - Rodoviário',
      Z02: 'Z02 - CIF - Rodoviário',
      ZSF: 'ZSF - Com transporte e sem Frete',
      CIF: 'CIF - Custo, seguro & frete',
      FOB: 'FOB - Franco a bordo',
    },
  },

  /*
   * Subconjunto REAL de `Prazo_De_Pagamento__c` (316 membros).
   *
   * Inclui dois códigos de "30 dias" com encargos diferentes (Z030, ZB30) — ambos
   * com contagem determinística → AMBOS aparecem na picklist filtrada (CA-1).
   * Inclui `Y001` ("Antecipado"), que **entrou** na allowlist em 03/09/2026 como
   * 0 dias (ADO 67530) e por isso APARECE. E inclui um código
   * NÃO-determinístico para provar o filtro FE (CA-2):
   *   - ZM01: "Prazo Múltiplo (28/56)" — múltiplas parcelas, sem contagem única.
   */
  'product-line-prazo-pagamento': {
    values: ['Y001', 'Z030', 'ZB30', 'ZM01'],
    labels: {
      // O rótulo VERBATIM do catálogo do org — não "À vista", que é paráfrase.
      Y001: 'Y001 - Antecipado (1º Paga e depois Recebe o produto)',
      Z030: 'Z030 - 30 dias',
      ZB30: 'ZB30 - 30 dias com encargos',
      ZM01: 'ZM01 - Prazo Múltiplo (28/56)',
    },
  },
};

function toOption(fixture: Fixture, value: string): PicklistOption {
  return {
    value,
    label: fixture.labels?.[value] ?? value,
    isDefault: fixture.defaultValue === value,
  };
}

/** Resolves the options a component test sees for `field`. */
export function PICKLIST_TEST_OPTIONS(
  field: string,
  controllingValue: string | null,
): PicklistOptions {
  const key = field as PicklistField;
  const fixture = FIXTURES[key];

  // An uncatalogued field is a real gap, not something to paper over with an
  // empty list — that would read as "nothing selectable" in the assertion.
  if (!fixture) {
    throw new Error(
      `Picklist "${field}" has no test fixture. Add it to picklists.test-fixtures.ts.`,
    );
  }

  const base = {
    field: key,
    salesforceField: `Test.${field}`,
    controlledBy: fixture.controlledBy ?? null,
    controllingValue,
  };

  if (!fixture.controlledBy) {
    return {
      ...base,
      outcome: PicklistFilterOutcome.NaoDependente,
      options: fixture.values.map((v) => toOption(fixture, v)),
    };
  }
  if (fixture.matrixUnknown) {
    return {
      ...base,
      outcome: PicklistFilterOutcome.DependenciaNaoMapeada,
      options: fixture.values.map((v) => toOption(fixture, v)),
    };
  }
  if (!controllingValue) {
    return { ...base, outcome: PicklistFilterOutcome.ControladorAusente, options: [] };
  }
  return {
    ...base,
    outcome: PicklistFilterOutcome.Filtrada,
    options: fixture.values
      .filter((v) => (fixture.dependency?.[v] ?? []).includes(controllingValue))
      .map((v) => toOption(fixture, v)),
  };
}
