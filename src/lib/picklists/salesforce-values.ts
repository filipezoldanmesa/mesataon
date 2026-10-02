/**
 * Frontend mirror of the Salesforce picklist VALUES the backend persists.
 *
 * Generated from the same source as `apps/api/src/picklists/catalog` — the
 * client-authored analysis "Análise Picklists Vibra Contratos" (05/08/2026),
 * which OVERRIDES the PRDs and the prototype where they disagree.
 *
 * ## Values only — labels come from the API
 *
 * There is deliberately no `Record<X, string>` label map here. Several value
 * sets have 44–316 members and their labels are Salesforce's, not ours; a local
 * copy would be a second source of truth that drifts the moment Vibra renames
 * one. Render options from `GET /api/picklists/:field`, which returns
 * `{ value, label }` already filtered by the controlling picklist — see
 * `lib/picklists/picklists.data.ts` and `hooks/use-picklist.ts`.
 *
 * What this file IS for: the handful of places the UI must compare against a
 * NAMED member (`Finalidade.Implantacao`, `PropriedadeImovel.DeTerceiros`),
 * where a string literal would silently stop matching after a rename.
 */

/** `Quote.Finalidade_Cotacao__c` */
export const Finalidade = {
  Implantacao: "Implantação",
  Renovacao: "Renovação",
  Vinculacao: "Vinculação",
  Revinculacao: "Revinculação",
  Renegociacao: "Renegociação",
  VinculacaoDeBandeiraBranca: "Vinculação de bandeira branca",
  VinculacaoPorTrocaDeBandeira: "Vinculação por troca de bandeira",
  BrManiaImplantacao: "BR Mania - Implantação",
  BrManiaRenegociacao: "BR Mania - Renegociação",
  BrManiaRenovacao: "BR Mania - Renovação",
  LubraxMaisImplantacao: "Lubrax + - Implantação",
  LubraxMaisRenegociacao: "Lubrax + - Renegociação",
  LubraxMaisRenovacao: "Lubrax + - Renovação",
  AquisicaoInstalacaoDeEquipamentoImagem: "Aquisição/Instalação de equipamento / Imagem",
  AquisicaoInstalacaoEquipamentos: "Aquisição / Instalação - Equipamentos",
  AquisicaoInstalacaoImagemBrMania: "Aquisição / Instalação - Imagem BR Mania",
  AquisicaoInstalacaoImagemLubraxMais: "Aquisição / Instalação - Imagem Lubrax+",
  AquisicaoInstalacaoImagemPista: "Aquisição / Instalação - Imagem Pista",
  AposCumprimentoDoVolumeContratado: "Após Cumprimento do Volume Contratado",
  Cessao: "Cessão",
  ConstrucaoBrMania: "Construção BR Mania",
  ConstrucaoDoLubraxMais: "Construção do Lubrax +",
  ConstrucaoDoPosto: "Construção do posto",
  ConstrucaoLojaBrMania: "Construção Loja BR Mania",
  ConstrucaoLubraxMais: "Construção Lubrax+",
  CumprimentoDoVolumeContratado: "Cumprimento do volume contratado",
  IncrementoDasAtividades: "Incremento das atividades",
  PagamentoDeTitulosVencidos: "Pagamento de Títulos Vencidos",
  PostoAConstruir: "Posto a construir",
  Construcao: "Construção",
  ManutencaoImagemPista: "Manutenção - Imagem Pista",
  RefinanciamentoDoMutuo: "Refinanciamento do Mútuo",
  ReformaBrMania: "Reforma BR Mania",
  ReformaDoLubraxMais: "Reforma do Lubrax +",
  ReformaDoPosto: "Reforma do Posto",
  ReformaLojaBrMania: "Reforma Loja BR Mania",
  ReformaLubraxMais: "Reforma Lubrax+",
  Reforma: "Reforma",
  TrocaDeOperador: "Troca de Operador",
  Complementar: "Complementar",
  Financiamento: "Financiamento",
  ComplementarMutuoBr: "Complementar Mutuo BR",
  ServicoEspecializadoEmGarantiaReal: "Serviço Especializado em Garantia Real",
  ImpostosReferentesAImagem: "Impostos referentes a Imagem",
} as const;

export type Finalidade = (typeof Finalidade)[keyof typeof Finalidade];

/** `Quote.Tipo_De_Contrato__c` */
export const TipoContrato = {
  CpcvmProduto: "CPCVM Produto",
  CpcvmVolume: "CPCVM Volume",
  CpcvmDisponibilidade: "CPCVM Disponibilidade",
  Comodato: "Comodato",
  CpcvmLocacao: "CPCVM + Locação",
  CpcvmSublocacao: "CPCVM + Sublocação",
  ComissaoMercantil: "Comissão Mercantil",
  ClumLiquido: "CLUM Liquido",
  ClumGnv: "CLUM - GNV",
  BrMania: "BR Mania",
  LubraxMais: "Lubrax +",
  LocacaoPpd: "Locação - PPD",
  LocacaoPpi: "Locação - PPI",
  Pcra: "PCRA",
  Cq: "CQ",
  Mv: "MV",
  Oiu1: "OIU1",
  Wk1: "WK1",
  Wk2: "WK2",
  Wv: "WV",
  Z100: "Z100",
  Z101: "Z101",
  Z103: "Z103",
  Z104: "Z104",
  Z105: "Z105",
  Z120: "Z120",
  Z121: "Z121",
  Z130: "Z130",
  Z131: "Z131",
  Z132: "Z132",
  Z133: "Z133",
  Z134: "Z134",
  Z135: "Z135",
  Z136: "Z136",
  Z137: "Z137",
  Z138: "Z138",
  Z139: "Z139",
  Z140: "Z140",
  Z144: "Z144",
  Z149: "Z149",
  Z150: "Z150",
  Z151: "Z151",
  Z152: "Z152",
  Z153: "Z153",
  Z154: "Z154",
  Z155: "Z155",
  Z156: "Z156",
  Z157: "Z157",
  Z158: "Z158",
  Z159: "Z159",
  Z160: "Z160",
  Z161: "Z161",
  Z162: "Z162",
  Z163: "Z163",
  Z164: "Z164",
  Z165: "Z165",
  Z167: "Z167",
  Z168: "Z168",
  Z170: "Z170",
  Z172: "Z172",
  Z174: "Z174",
  Z191: "Z191",
  Zzcq: "ZZCQ",
  Unico: "Único",
  Individual: "Individual",
} as const;

export type TipoContrato = (typeof TipoContrato)[keyof typeof TipoContrato];

/**
 * API name → catalog LABEL, for the values whose label differs from the API
 * name (picklist document "Análise Picklists Vibra Contratos", GVS
 * `Tipo_De_Contrato`). Everything else renders as itself.
 *
 * The persisted value is the Salesforce API name verbatim (`"CPCVM Volume"`) —
 * that never changes. What changes is the SCREEN: the proposal card, the
 * proposal header and the scenario comparison were printing the API name, so
 * the user read "CPCVM Volume" where the same dropdown he had just used said
 * "CPCVM Volume Total" (CLAUDE.md: "texto de tela nunca é valor de máquina").
 */
const TIPO_CONTRATO_LABEL: Partial<Record<TipoContrato, string>> = {
  [TipoContrato.CpcvmVolume]: "CPCVM Volume Total",
  [TipoContrato.ClumLiquido]: "CLUM Líquidos",
  [TipoContrato.CpcvmLocacao]: "Locação",
  [TipoContrato.CpcvmSublocacao]: "Sublocação",
};

/**
 * pt-BR label of a `Tipo_De_Contrato__c` value.
 *
 * Unmapped/unknown values fall back to the RAW value on purpose (never a
 * generic "—"): a gap has to stay visible, and a legitimate CRM value the
 * catalog mirror has not caught up with is still information.
 */
export function tipoContratoLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return TIPO_CONTRATO_LABEL[value as TipoContrato] ?? value;
}

/** `Quote.Tipo_de_Proposta__c` */
export const TipoProposta = {
  Pcr: "PCR",
  Pcopp: "PCOPP",
  Pcc: "PCC",
  Pca: "PCA",
  /** BR Mania franchise proposal (SAP material code — ADR-0024). Platform-only: absent from `Quote.Tipo_de_Proposta__c`. */
  Zbrm: "ZBRM",
  /** Lubrax+ franchise proposal (SAP material code — ADR-0024). Platform-only: absent from `Quote.Tipo_de_Proposta__c`. */
  Zlub: "ZLUB",
} as const;

export type TipoProposta = (typeof TipoProposta)[keyof typeof TipoProposta];

/** `Quote.Gerencia_Do_Usuario__c` ("Área do Usuário") */
export const AreaUsuario = {
  Dcvim: "DCVIM",
  Dcb2b: "DCB2B",
  Avia: "AVIA",
  Lub: "LUB",
  Dd: "DD",
  Gml: "GML",
  Gme: "GME",
  Gmav: "GMAV",
  Gmc: "GMC",
  Drpv: "DRPV",
} as const;

export type AreaUsuario = (typeof AreaUsuario)[keyof typeof AreaUsuario];

/** `Opportunity.Tipo_De_Negociacao__c` */
export const TipoNegociacao = {
  Neg: "NEG",
  ContratoDeVolume: "Contrato de Volume",
  ContratoDeVolumeCpp: "Contrato de Volume + CPP",
  PedidoSpot: "Pedido SPOT",
  PedidoDireto: "Pedido direto",
  Investimento: "Investimento",
  InvestimentoConjunto: "Investimento Conjunto",
  AguardandoValores: "Aguardando valores",
  Energia: "Energia",
  /** Legacy: never existed in Salesforce; forced on every opportunity before the catalog. */
  Contratacao: "CONTRATACAO",
} as const;

export type TipoNegociacao = (typeof TipoNegociacao)[keyof typeof TipoNegociacao];

/** `Quote.Prazo_Do_Contrato__c` */
export const PrazoContrato = {
  Determinado: "Determinado",
  Indeterminado: "Indeterminado",
} as const;

export type PrazoContrato = (typeof PrazoContrato)[keyof typeof PrazoContrato];

/** `Quote.Responsavel_Manutencao__c` */
export const ResponsavelManutencao = {
  Br: "BR",
  Cliente: "Cliente",
  Parceiro: "Parceiro",
} as const;

export type ResponsavelManutencao = (typeof ResponsavelManutencao)[keyof typeof ResponsavelManutencao];

/** `Quote.Responsavel_Manutencao_Imagem__c` */
export const ResponsavelManutencaoImagem = {
  Br: "BR",
  Cliente: "Cliente",
} as const;

export type ResponsavelManutencaoImagem = (typeof ResponsavelManutencaoImagem)[keyof typeof ResponsavelManutencaoImagem];

/**
 * `Situacao_Atual_Posto_Imovel_Cotacao__c.Bandeira_Posto__c` — a bandeira
 * FÍSICA que o LT informa.
 *
 * ⚠️ Não confundir com `Bandeira__c`, cujo rótulo no layout do org é
 * "Bandeira ANP" e cujo value set é o MESMO: aquela o org deriva do cadastro da
 * agência e uma VR ativa proíbe alterá-la.
 */
export const BandeiraPosto = {
  BR: "BR",
  BandeiraBranca: "Bandeira Branca",
  Ale: "Ale",
  Ipiranga: "Ipiranga",
  Raizen: "Raízen",
  OutrasDistribuidoras: "Outras Distribuidoras",
  NaoInformado: "Não Informado",
} as const;

export type BandeiraPosto = (typeof BandeiraPosto)[keyof typeof BandeiraPosto];

/** `Situacao_Atual_Posto_Imovel_Cotacao__c.Tipo_De_Posto__c` */
export const TipoPosto = {
  Urbano: "Urbano",
  Rodoviario: "Rodoviário",
  Maritimo: "Marítimo",
  PostoEscola: "Posto Escola",
  Servicos: "Serviços",
  PostoDeServicosRodoviarios: "Posto de Serviços Rodoviários",
  PostoDeServicosUrbano: "Posto de Serviços Urbano",
  /** Legacy spelling of `Posto de Serviços Urbano`. */
  ServicosUrbanos: "SERVICOS_URBANOS",
} as const;

export type TipoPosto = (typeof TipoPosto)[keyof typeof TipoPosto];

/** `Situacao_Atual_Posto_Imovel_Cotacao__c.Situacao_Atual_Posto__c` */
export const SituacaoPosto = {
  AConstruir: "A Construir",
  EmConstrucao: "Em Construção",
  EmOperacao: "Em Operação",
  Paralisado: "Paralisado",
  AConstruirEmConstrucao: "A Construir / Em Construção",
} as const;

export type SituacaoPosto = (typeof SituacaoPosto)[keyof typeof SituacaoPosto];

/** `Situacao_Atual_Posto_Imovel_Cotacao__c.Propriedade__c` */
export const PropriedadeImovel = {
  DaRazaoSocialQueExploraOPosto: "Da Razão Social que Explora o Posto",
  DosSociosDaRazaoSocial: "Dos Sócios da Razão Social",
  DeTerceiros: "De Terceiros",
} as const;

export type PropriedadeImovel = (typeof PropriedadeImovel)[keyof typeof PropriedadeImovel];

/** `Recurso_Financeiro_Da_Cotacao__c.Tipo__c` */
export const TipoRegistroRecursoFinanceiro = {
  Antecipada: "Antecipada",
  Desempenho: "Desempenho",
  Mutuo: "Mútuo",
  ParcelamentoDeDebito: "Parcelamento de Débito",
  NovoMutuo: "Mútuo Enc. Contas",
  /** Legacy: predates the catalog; superseded by `Antecipada`/`Desempenho`. */
  Bonificacao: "BONIFICACAO",
} as const;

export type TipoRegistroRecursoFinanceiro = (typeof TipoRegistroRecursoFinanceiro)[keyof typeof TipoRegistroRecursoFinanceiro];

/** `Recurso_Financeiro_Da_Cotacao__c.Finalidade__c` */
export const FinalidadeRecurso = {
  Implantacao: "Implantação",
  Renovacao: "Renovação",
  Vinculacao: "Vinculação",
  Revinculacao: "Revinculação",
  Renegociacao: "Renegociação",
  VinculacaoDeBandeiraBranca: "Vinculação de bandeira branca",
  VinculacaoPorTrocaDeBandeira: "Vinculação por troca de bandeira",
  BrManiaImplantacao: "BR Mania - Implantação",
  BrManiaRenegociacao: "BR Mania - Renegociação",
  BrManiaRenovacao: "BR Mania - Renovação",
  LubraxMaisImplantacao: "Lubrax + - Implantação",
  LubraxMaisRenegociacao: "Lubrax + - Renegociação",
  LubraxMaisRenovacao: "Lubrax + - Renovação",
  AquisicaoInstalacaoDeEquipamentoImagem: "Aquisição/Instalação de equipamento / Imagem",
  AquisicaoInstalacaoEquipamentos: "Aquisição / Instalação - Equipamentos",
  AquisicaoInstalacaoImagemBrMania: "Aquisição / Instalação - Imagem BR Mania",
  AquisicaoInstalacaoImagemLubraxMais: "Aquisição / Instalação - Imagem Lubrax+",
  AquisicaoInstalacaoImagemPista: "Aquisição / Instalação - Imagem Pista",
  AposCumprimentoDoVolumeContratado: "Após Cumprimento do Volume Contratado",
  Cessao: "Cessão",
  ConstrucaoBrMania: "Construção BR Mania",
  ConstrucaoDoLubraxMais: "Construção do Lubrax +",
  ConstrucaoDoPosto: "Construção do posto",
  ConstrucaoLojaBrMania: "Construção Loja BR Mania",
  ConstrucaoLubraxMais: "Construção Lubrax+",
  CumprimentoDoVolumeContratado: "Cumprimento do volume contratado",
  IncrementoDasAtividades: "Incremento das atividades",
  PagamentoDeTitulosVencidos: "Pagamento de Títulos Vencidos",
  PostoAConstruir: "Posto a construir",
  Construcao: "Construção",
  ManutencaoImagemPista: "Manutenção - Imagem Pista",
  RefinanciamentoDoMutuo: "Refinanciamento do Mútuo",
  ReformaBrMania: "Reforma BR Mania",
  ReformaDoLubraxMais: "Reforma do Lubrax +",
  ReformaDoPosto: "Reforma do Posto",
  ReformaLojaBrMania: "Reforma Loja BR Mania",
  ReformaLubraxMais: "Reforma Lubrax+",
  Reforma: "Reforma",
  TrocaDeOperador: "Troca de Operador",
  Complementar: "Complementar",
  Financiamento: "Financiamento",
  ComplementarMutuoBr: "Complementar Mutuo BR",
  ServicoEspecializadoEmGarantiaReal: "Serviço Especializado em Garantia Real",
  ImpostosReferentesAImagem: "Impostos referentes a Imagem",
  /** Legacy: no Salesforce counterpart. */
  ReformaEEquipamentos: "REFORMA_E_EQUIPAMENTOS",
  /** Legacy: no Salesforce counterpart. */
  ComunicacaoVisual: "COMUNICACAO_VISUAL",
  /** Legacy: no Salesforce counterpart. */
  CapitalDeGiro: "CAPITAL_DE_GIRO",
  /** Legacy: no Salesforce counterpart. */
  Outros: "OUTROS",
} as const;

export type FinalidadeRecurso = (typeof FinalidadeRecurso)[keyof typeof FinalidadeRecurso];

/** `Recurso_Financeiro_Da_Cotacao__c.Etapa_Da_Liberacao__c` */
export const EtapaLiberacaoRecurso = {
  AposObraCivilFundacaoExecucaoDeAlvenariaPredio: "Após obra civil - fundação / execução de alvenaria (prédio)",
  AposObraCivilInfraEstruturaEletricaEHidraulicaAcabamentosPredio: "Após obra civil - infra estrutura elétrica e hidráulica / acabamentos (prédio)",
  AposObraCivilFundacaoExecucaoDeColunasCoberturaDaPista: "Após obra civil - fundação / execução de colunas (cobertura da pista)",
  AposObraCivilExecucaoDeVigasETrelicasCoberturaDaPista: "Após obra civil - execução de vigas e treliças (cobertura da pista)",
  AposObraCivilPavimentacaoDaPista: "Após obra civil - pavimentação da pista",
  AposObraCivilConclusaoDasObras: "Após obra civil - conclusão das obras",
  AposLicencaEmissaoDaLoLicencaDeOperacao: "Após licença - emissão da LO (licença de operação)",
  AposInicioDaOperacaoPosto: "Após início da operação - posto",
  AposInicioDaOperacaoLojaBrMania: "Após início da operação - loja BR Mania",
  AposCumprimentoDoVolumeContratado: "Após cumprimento do volume contratado",
  AposContratacaoFornecedorBombas: "Após Contratação Fornecedor - Bombas",
  AposContratacaoFornecedorTanques: "Após Contratação Fornecedor - Tanques",
  AposEntregaDoMaterialBombas: "Após Entrega do Material - Bombas",
  AposEntregaDoMaterialTanques: "Após Entrega do Material - Tanques",
  AposInstalacaoBombas: "Após Instalação - Bombas",
  AposInstalacaoTanques: "Após Instalação - Tanques",
  AposContratacaoFornecedorImagemBrMania: "Após Contratação Fornecedor - Imagem BR Mania",
  AposEntregaDoMaterialImagemBrMania: "Após Entrega do Material - Imagem BR Mania",
  AposImplantacaoImagemBrMania: "Após Implantação - Imagem BR Mania",
  AposContratacaoFornecedorImagemLubraxMais: "Após Contratação Fornecedor - Imagem Lubrax+",
  AposEntregaDoMaterialImagemLubraxMais: "Após Entrega do Material - Imagem Lubrax+",
  AposImplantacaoImagemLubraxMais: "Após Implantação - Imagem Lubrax+",
  AposContratacaoFornecedorImagemPista: "Após Contratação Fornecedor - Imagem Pista",
  AposEntregaDoMaterialImagemPista: "Após Entrega do Material - Imagem Pista",
  AposImplantacaoImagemPista: "Após Implantação - Imagem Pista",
  AposAssinaturaDoContratoEEfetivacaoDasGarantias: "Após Assinatura do Contrato e Efetivação das Garantias",
  AposInicioDaOperacaoUnidadeLubraxMais: "Após Início da Operação - Unidade Lubrax+",
  Apos30DiasDaAssinaturaDoContratoEEfetivacaoDasGarantias: "Após 30 dias da assinatura do contrato e efetivação das garantias",
  Apos60DiasDaAssinaturaDoContratoEEfetivacaoDasGarantias: "Após 60 dias da assinatura do contrato e efetivação das garantias",
  Apos90DiasDaAssinaturaDoContratoEEfetivacaoDasGarantias: "Após 90 dias da assinatura do contrato e efetivação das garantias",
  Apos120DiasDaAssinaturaDoContratoEEfetivacaoDasGarantias: "Após 120 dias da assinatura do contrato e efetivação das garantias",
  Apos150DiasDaAssinaturaDoContratoEEfetivacaoDasGarantias: "Após 150 dias da assinatura do contrato e efetivação das garantias",
  Apos180DiasDaAssinaturaDoContratoEEfetivacaoDasGarantias: "Após 180 dias da assinatura do contrato e efetivação das garantias",
  AposReformaPosto: "Após reforma - Posto",
  AposReformaBrMania: "Após reforma - BR Mania",
  AposReformaLubraxMais: "Após reforma - Lubrax+",
  AposAdesaoAoProgramaDeManutencaoDeImagemPetrobras: "Será liberada em até 30 dias da adesão do REVENDEDOR ao Programa de Manutenção de Imagem Petrobras",
  /** Legacy: no Salesforce counterpart. */
  AssinaturaDoContrato: "ASSINATURA_DO_CONTRATO",
  /** Legacy: no Salesforce counterpart. */
  AtivacaoDoPosto: "ATIVACAO_DO_POSTO",
  /** Legacy: no Salesforce counterpart. */
  EntregaDaDocumentacao: "ENTREGA_DA_DOCUMENTACAO",
  /** Legacy: no Salesforce counterpart. */
  Outros: "OUTROS",
} as const;

export type EtapaLiberacaoRecurso = (typeof EtapaLiberacaoRecurso)[keyof typeof EtapaLiberacaoRecurso];

/** `Recurso_Financeiro_Da_Cotacao__c.Periodicidade_Lancamento__c` */
export const PeriodicidadeRecurso = {
  Unica: "Única",
  Mensal: "Mensal",
  Bimestral: "Bimestral",
  Trimestral: "Trimestral",
  Quadrimestral: "Quadrimestral",
  Semestral: "Semestral",
  Anual: "Anual",
} as const;

export type PeriodicidadeRecurso = (typeof PeriodicidadeRecurso)[keyof typeof PeriodicidadeRecurso];

/** `Recurso_Financeiro_Da_Cotacao__c.Indice_De_Correcao__c` */
export const IndiceCorrecao = {
  Cdi: "CDI",
  IgpDi: "IGP-DI",
  Igpm: "IGP-M",
  Inpc: "INPC",
  Ipc: "IPC",
  Ipca: "IPCA",
  Tr: "TR",
  Ictm: "ICTM",
  Ufir: "UFIR",
  Selic: "SELIC",
  UfirRj: "UFIR-RJ",
  Ufesp: "UFESP",
  SelicM: "SELIC-M",
  BtnTr: "BTN/TR",
  Ipcr: "IPCR",
  Otn: "OTN",
  Urv: "URV",
  SemCorrecao: "Sem correção",
} as const;

export type IndiceCorrecao = (typeof IndiceCorrecao)[keyof typeof IndiceCorrecao];

/** `Garantia_Da_Cotacao__c.Utilizacao__c` */
export const UtilizacaoGarantia = {
  Fornecimento: "Fornecimento",
  ConcessaoFinanceira: "Concessão Financeira",
  Parcelamento: "Parcelamento",
} as const;

export type UtilizacaoGarantia = (typeof UtilizacaoGarantia)[keyof typeof UtilizacaoGarantia];

/** `Garantia_Da_Cotacao__c.Tipo_De_Garantia_Proposta__c` */
export const TipoGarantiaProposta = {
  GarantiaReal: "Garantia Real",
  GarantiaPessoal: "Garantia Pessoal",
  SemGarantia: "Sem Garantia",
  AlienacaoFiduciaria: "Alienação Fiduciária",
  Fianca: "Fiança",
  FiancaBancaria: "Fiança Bancaria",
  Hipoteca: "Hipoteca",
  Outros: "Outros",
} as const;

export type TipoGarantiaProposta = (typeof TipoGarantiaProposta)[keyof typeof TipoGarantiaProposta];

/**
 * PT-BR labels for `Opportunity.Tipo_De_Negociacao__c`.
 *
 * The only Salesforce-owned set with a local label map, and for one reason: it is
 * displayed on the opportunity list and detail (a STORED value), where the raw
 * API name would put a machine value on screen — and one label genuinely differs
 * from its value (`Contrato de Volume + CPP` → "Crédito Pós Performance").
 *
 * For `<select>` options use `usePicklist(PicklistField.OpportunityTipoNegociacao)`
 * instead; the backend already returns these labels.
 */
export const TIPO_NEGOCIACAO_LABEL: Record<TipoNegociacao, string> = {
  [TipoNegociacao.Neg]: 'NEG',
  [TipoNegociacao.ContratoDeVolume]: 'Contrato de Volume',
  [TipoNegociacao.ContratoDeVolumeCpp]: 'Crédito Pós Performance',
  [TipoNegociacao.PedidoSpot]: 'Pedido SPOT',
  [TipoNegociacao.PedidoDireto]: 'Pedido direto',
  [TipoNegociacao.Investimento]: 'Investimento',
  [TipoNegociacao.InvestimentoConjunto]: 'Investimento Conjunto',
  // Inactive in Salesforce — never offered, but a historical row may carry it.
  [TipoNegociacao.AguardandoValores]: 'Aguardando valores',
  [TipoNegociacao.Energia]: 'Energia',
  // Written by this platform before the picklist catalog existed.
  [TipoNegociacao.Contratacao]: 'Contratação',
};
