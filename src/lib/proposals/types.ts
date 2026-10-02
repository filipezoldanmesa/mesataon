/**
 * A single brand marketshare entry for one geographic scope.
 */
export interface MarketshareEntry {
  /** Brand name, e.g. "Vibra", "Ipiranga", "Bandeira branca". */
  bandeira: string;
  /** Market share percentage (0–100). */
  percentual: number;
}

/**
 * Market intelligence snapshot fetched from Tableau (F4 — RN-F4-05).
 *
 * API contract — F4 market intelligence (VBR-89 épico / VBR-93 BE):
 *
 *   GET  /v1/proposals/{id}/market-intelligence → 200 MarketIntelligence | 204 (never consulted)
 *   POST /v1/proposals/{id}/market-intelligence:refresh → 200 | 409 | 503
 *
 * VMM fields and marketshare arrays may be `null` when the backend has no
 * data yet for this posto (natural absence — not a mask).
 */
export interface MarketIntelligence {
  /** ISO-8601 timestamp of the last Tableau consultation. */
  consultadoEm: string;
  /** Data source label, e.g. "Tableau · Simulador de Volume de Postos". */
  fonte: string;
  /** Average VMM for the neighbourhood (m³/month); null when data is unavailable. */
  vmmMedioBairro: number | null;
  /** Average VMM for the city (m³/month); null when data is unavailable. */
  vmmMedioCidade: number | null;
  /** VMM of the specific posto (m³/month); null when data is unavailable. */
  vmmPosto: number | null;
  /** Count of urban postos in the competitive area. */
  postosUrbanos: number;
  /** Count of road postos in the competitive area. */
  postosRodoviarios: number;
  /** Brand marketshare in the neighbourhood (sorted by percentual desc). */
  marketshareBairro: MarketshareEntry[];
  /** Brand marketshare in the city (sorted by percentual desc). */
  marketshareCidade: MarketshareEntry[];
}

/** Thrown when the Tableau service is unavailable (HTTP 503). */
export class TableauUnavailableError extends Error {
  constructor() {
    super('O Tableau está temporariamente indisponível. Tente novamente mais tarde.');
    this.name = 'TableauUnavailableError';
  }
}

/** Thrown when the proposal is already in analysis and cannot be refreshed (HTTP 409). */
export class ProposalInAnalysisError extends Error {
  constructor(readonly proposalId: string) {
    super(`A proposta já está em análise e não pode ser atualizada.`);
    this.name = 'ProposalInAnalysisError';
  }
}

// ---------------------------------------------------------------------------
// F5 — Produtos e simulação comercial (RN-F5-01/02/03/04, HU-07/08, VBR-100/102)
// ---------------------------------------------------------------------------

/**
 * Incoterm de uma linha de produto — API name do Salesforce
 * (`QuoteLineItem.Incoterms__c`, global value set `Incoterms`, 51 valores).
 *
 * **Deliberadamente `string`, não uma união literal.** O backend já tem o enum
 * completo (`proposals/domain/incoterm.enum.ts`) e o catálogo de picklists é a
 * fonte das opções — duplicar os 51 membros aqui criaria uma segunda lista para
 * apodrecer, exatamente o que o `PicklistSelect` existe para impedir.
 *
 * Até 07/08/2026 este tipo era `'CIF' | 'FOB'` e o formulário oferecia só esses
 * dois. Ambos existem no value set, mas o que o negócio seleciona são os
 * códigos SAP (`Z10 - FOB - Rodoviário`, `ZSF - Com transporte e sem Frete`, …):
 * a tela cobria 2 de 51 opções, e nenhuma delas é a usada na prática.
 */
export type Incoterm = string;

/** A product eligible for a proposal's commercial simulation (RN-F5-01). */
export interface EligibleProduct {
  /** Product code, e.g. "7401". */
  codigo: string;
  /** Display name, e.g. "Gasolina Comum". */
  nome: string;
  /**
   * Existe CPV cadastrado para este produto na Base escolhida? (VBR-643)
   *
   * `true` disponível · `false` **ausente** (o save será recusado) · `null` não
   * verificado (nenhuma base informada, ou a checagem falhou).
   *
   * ⚠️ `null` e `false` não podem colapsar na tela: sem base escolhida — o caso
   * majoritário, porque a UI não pré-seleciona quando a conta tem mais de um
   * centro — TODO produto ficaria marcado como sem CPV.
   */
  cpvDisponivel: boolean | null;
  /**
   * Este produto está na allowlist do CLIENTE (`Produtos_Elegiveis__c` no
   * Salesforce)?
   *
   * `true` está · `false` a conta tem allowlist e este produto não está nela ·
   * `null` a conta não tem nenhuma linha cadastrada, ou a leitura falhou.
   *
   * Responde a pergunta "este produto se aplica a ESTE posto": o catálogo por
   * área de venda oferece 2.705 produtos e a allowlist do cliente tem mediana 3
   * (medido em 28/08/2026).
   *
   * ⚠️ Desde o ADO 67951 a allowlist é FILTRO quando existe: com
   * `restritaAoCliente: true` todo item vem `true`, porque a lista já foi
   * restringida na consulta. Com `false` (conta sem cadastro — 81,7% em UAT)
   * todo item vem `null`, e `null` nunca colapsa em `false`: seria acusar de
   * inelegível todo produto dessas contas.
   *
   * ⚠️ **A ordem da lista não é reordenada na tela** — ela é a do backend.
   */
  elegivelParaCliente: boolean | null;
}

/**
 * A lista de produtos e o REGIME com que ela foi montada (ADO 67951).
 *
 * O regime existe por causa da lista vazia: com o filtro ligado, buscar um
 * produto fora da allowlist devolve zero itens, e é aí que o usuário mais
 * precisa do motivo. Sem ele, "nenhum produto encontrado" não distingue "este
 * cliente não tem cadastro" de "tem, e a busca não casou" — e o regime não é
 * derivável dos itens quando não há itens.
 */
export interface EligibleProductListing {
  produtos: EligibleProduct[];
  /**
   * `true` ⇒ a lista mostra SÓ os produtos cadastrados para este cliente em
   * `Produtos_Elegiveis__c`. `false` ⇒ catálogo da área de venda, o fallback
   * deliberado da conta sem cadastro.
   */
  restritaAoCliente: boolean;
  /**
   * O recorte é por **FAMÍLIA** de produto, e não por material (03/09/2026)?
   *
   * O cadastro do cliente em `Produtos_Elegiveis__c` declara elegibilidade de
   * duas formas — um MATERIAL (um SKU) ou uma FAMÍLIA — e qual delas ele usa
   * depende do setor: combustíveis é ~100% material, lubrificantes é **96,9%
   * família**.
   *
   * ⚠️ **A precisão dos dois é muito diferente, e é por isso que a tela precisa
   * saber.** Por material a lista cai de 2.205 para poucas unidades; por família
   * cai para ~1.800 (medido em 7 contas reais). Anunciar "apenas os produtos
   * cadastrados para este cliente" sobre 1.800 itens prometeria uma precisão que
   * o cadastro do Salesforce não tem — e é assim que o usuário conclui que o
   * filtro não está funcionando.
   *
   * `true` implica {@link restritaAoCliente}: é o GRÃO do recorte, não um regime
   * paralelo.
   */
  restritaPorFamilia: boolean;
}

/**
 * A persisted, fully-calculated product line of a proposal (RN-F5-02/HU-08).
 *
 * API contract — F5 produtos e simulação comercial (VBR-100 épico / VBR-102 BE):
 *
 *   GET    /v1/proposals/{id}/eligible-products?q=  → 200 EligibleProduct[]
 *   GET    /v1/proposals/{id}/product-lines          → 200 ProductLine[]
 *   POST   /v1/proposals/{id}/product-lines          → 201 ProductLine | 400 | 422 | 503
 *   PUT    /v1/proposals/{id}/product-lines/{lineId}  → 200 ProductLine | 400 | 404 | 422 | 503
 *   DELETE /v1/proposals/{id}/product-lines/{lineId}  → 204 | 404
 *
 * `cpv`/`margemBp`/`margemSugerida`/`precoFinal` are always server-derived —
 * the response is the source of truth (`precoFinal = cpv + margemProposta`,
 * RN-F5-02). `inicioConsumo` IS sent in the request body since ADO 67795; o 1º
 * dia do mês subsequente virou o valor PADRÃO de quem omite o campo, não o
 * único valor possível (RN-F5-04).
 */
export interface ProductLine {
  id: string;
  proposalId: string;
  produtoCodigo: string;
  produtoNome: string;
  /** Nome da base — o rótulo exibido. */
  base: string;
  /**
   * Código do centro fornecedor (`Centro_Fornecedor__c.Codigo_Do_Centro__c`,
   * ex.: `"5064"`). É este valor, e não {@link base}, que o backend envia ao ARP
   * em `produtoOportunidade[].codigoBase`.
   *
   * `null` em linhas gravadas antes da coluna existir, ou sem base.
   */
  baseCodigo: string | null;
  /** Volume comercial, em m³/mês. */
  volume: number;
  incoterm: Incoterm;
  prazoPagamentoDias: number;
  /**
   * Código SAP do prazo de pagamento (`QuoteLineItem.Prazo_De_Pagamento__c`).
   * `null` ⇒ não informado. Coexiste com `prazoPagamentoDias` e NÃO é derivado
   * dele — `Z030`, `ZB30`, `ZG30` e `ZR30` são todos "30 dias" com encargos
   * diferentes, e `ZM01 - Prazo Múltiplo (28/56)` não tem contagem única.
   */
  prazoPagamento: string | null;
  /**
   * Início do consumo — escolhido pelo usuário dentro do período da análise da
   * proposta (RN-F5-04 / ADO 67795). Omitido no request ⇒ 1º dia do mês
   * subsequente ao corrente.
   */
  inicioConsumo: string;
  fimConsumo: string;
  /** Horizonte de vendas, em meses (derivado de início/fim de consumo). */
  hvMeses: number;
  /**
   * O posto estava em maturação quando a linha foi salva (ADO 68235) —
   * `A Construir`, `Em Construção` ou `Paralisado`.
   *
   * Veredito do BACKEND, nunca rederivado na tela: é ele que escalona o volume
   * total (50 % / 70 % / 100 %, ver `maturacao-volume.ts`) e acende o aviso do
   * bloco de produtos. Opcional porque payload anterior à entrega não o traz —
   * ausente significa "sem escalonamento", o comportamento de sempre.
   *
   * ⚠️ `volume` continua sendo o VMM de regime: a rampa não entra na TIR/VPL.
   */
  maturacaoAplicada?: boolean;
  /** Custo do produto vendido, em R$/m³ (snapshot da referência comercial). */
  cpv: number;
  /**
   * Margem de referência do plano de negócios, em R$/m³.
   *
   * `null` quando a fonte não publica margem neste ponto do fluxo — é o caso
   * do Salesforce, cuja margem nasce da simulação de preço do SAP, depois
   * (ADR-0040). Renderize a lacuna; nunca exiba 0, que é margem válida.
   */
  margemBp: number | null;
  /** Margem sugerida (= margem realizada 6m no momento do snapshot); `null` como `margemBp`. */
  margemSugerida: number | null;
  /** Margem proposta (informada ou, se vazia, igual à margem sugerida — RN-F5-03). */
  margemProposta: number;
  /** Preço final calculado, em R$/m³ (RN-F5-02/HU-08). */
  precoFinal: number;
  createdAt: string;
  updatedAt: string;
}

/** Request body for creating (POST) / replacing (PUT) a product line (RN-F5-01/03/04). */
export interface UpsertProductLineInput {
  produtoCodigo: string;
  /** Nome da base (exibição e filtro da referência comercial). */
  base?: string;
  /**
   * Código do centro fornecedor, do MESMO registro que originou {@link base}.
   * Enviar o nome onde o código é esperado foi o defeito que o time do ARP
   * reportou em 12/08/2026 — por isso os dois viajam, cada um no seu campo.
   */
  baseCodigo?: string;
  volume: number;
  /** Vazio/omitido ⇒ usa a margem realizada nos últimos 6 meses (RN-F5-03/HU-08.2). */
  margemProposta?: number;
  /**
   * Início do consumo (ADO 67795). Opcional porque o backend mantém o default
   * (1º dia do mês subsequente, elevado ao `dataInicioAnalise`): omitir é "use
   * o padrão", nunca "apague a data" — é o único campo do UPSERT em que a
   * ausência não grava vazio.
   */
  inicioConsumo?: string;
  fimConsumo: string;
  incoterm: Incoterm;
  prazoPagamentoDias: number;
  /** Código SAP; omitido quando não respondido. */
  prazoPagamento?: string;
}

/** Thrown when the chosen product is not eligible for this proposal (HTTP 400, RN-F5-01). */
export class ProductNotEligibleError extends Error {
  constructor(
    readonly produtoCodigo: string,
    /**
     * A frase do BACKEND, que nomeia o conserto conforme o regime da lista
     * (ADO 67951): cadastrar em "Produtos Elegíveis" no modo filtrado, ou trocar
     * de produto/área no modo catálogo.
     *
     * ⚠️ Sem repassá-la, a melhoria da mensagem no backend fica invisível — esta
     * classe construía a frase localmente e descartava a do servidor.
     */
    mensagemDoServidor?: string,
  ) {
    super(
      mensagemDoServidor?.trim() ||
        `Produto ${produtoCodigo} não é elegível para esta proposta.`,
    );
    this.name = 'ProductNotEligibleError';
  }
}

/**
 * Thrown on an HTTP 400 whose body is the ValidationPipe envelope
 * (`{ code: "VALIDATION_ERROR", errors: [{ field, message }] }`) — a field-level
 * refusal (picklist value, volume, date), NOT product eligibility. `message`
 * carries the backend's own pt-BR message so the screen names the real field
 * instead of blaming the product.
 */
export class ProductLineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductLineValidationError';
  }
}

/**
 * Thrown when the consumption window violates a domain invariant — fim do
 * consumo posterior ao fim da análise, ou início posterior ao fim (HTTP 422,
 * RN-F5-04/HU-08.3). `message` carries the backend's crítica, rendered as a
 * blocking alert in the modal.
 */
export class ConsumptionWindowError extends Error {
  constructor(message = 'Fim do consumo não pode ser posterior ao fim da análise da proposta.') {
    super(message);
    this.name = 'ConsumptionWindowError';
  }
}

/** Thrown when the pricing reference (commercial ACL) is unavailable (HTTP 503). */
export class PricingReferenceUnavailableError extends Error {
  constructor() {
    super('A referência de precificação está temporariamente indisponível. Tente novamente mais tarde.');
    this.name = 'PricingReferenceUnavailableError';
  }
}

/**
 * A oportunidade não tem área de venda escolhida, então não há de onde derivar
 * o setor dos produtos elegíveis (ADO 67913).
 *
 * Erro TIPADO — e não a frase — porque o seletor de produto oferece um CTA de
 * conserto (preencher a área) e precisa saber quando oferecê-lo. Casar o texto
 * em português quebraria na primeira reescrita da mensagem.
 *
 * ⚠️ Distinto de lista vazia: "esta conta não tem produto nesta área" é o
 * usuário cadastrar em Produtos Elegíveis no Salesforce, e a nota do modal já
 * diz isso. Este é "ninguém disse qual área é".
 */
export class OpportunityWithoutSalesAreaError extends Error {
  constructor(message?: string) {
    super(
      message?.trim() ||
        'Esta oportunidade não tem área de venda escolhida — sem ela não é possível saber quais produtos oferecer.',
    );
    this.name = 'OpportunityWithoutSalesAreaError';
  }
}
