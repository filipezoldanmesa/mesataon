/**
 * Recursos financeiros de uma proposta (PRD F6 §7.6, HU-10/11). Mirrors the
 * backend enums/DTOs (`apps/api/src/proposals/domain/*`,
 * `dto/financial-resource*.ts`) — raw values, this module owns the PT-BR
 * labels (see `financial-resources.labels.ts`).
 */

/*
 * The five Salesforce-owned value sets come from the generated mirror. The
 * unions that used to live here were the MVP's invented subsets — 4 of 44
 * purposes, 4 of 37 release milestones, 3 of 18 indices, and three resource
 * types that Salesforce does not have at all. Render options with
 * `usePicklist(PicklistField.RecursoFinanceiro*)`.
 */
import {
  EtapaLiberacaoRecurso,
  FinalidadeRecurso,
  IndiceCorrecao,
  PeriodicidadeRecurso,
  TipoRegistroRecursoFinanceiro,
} from '@/lib/picklists/salesforce-values';

export {
  EtapaLiberacaoRecurso,
  FinalidadeRecurso,
  IndiceCorrecao,
  PeriodicidadeRecurso,
  TipoRegistroRecursoFinanceiro,
};

/**
 * Required for a resource type that carries a bonus; absent otherwise. This one
 * is NOT a Salesforce picklist — it is this platform's own distinction.
 */
export type TipoBonificacao = 'ANTECIPADA' | 'POR_DESEMPENHO';

/** A single financial resource attached to a proposal. */
/**
 * A obra que gerou este item (documento de 09/09/2026, SH-05).
 *
 * ⚠️ **Não-nulo é a definição de "item gerado por obra"** — é ele que acende o
 * selo, esconde a remoção individual e trava os campos automáticos (§6). O
 * `custeadoPelaObra` ao lado é LEGADO: nenhum caminho de escrita o preenche
 * desde esta entrega.
 */
export interface ItemObra {
  estimateId: string;
  tipo: string;
  /** ⚠️ `0` é a parcela de IMPOSTOS, não a primeira. */
  parcelaNumero: number;
  parcelaDescricao: string | null;
  /**
   * Veredito do BACKEND. Não reimplemente `flagsDeImposto` aqui: uma cópia
   * divergiria no retrato anterior a 03/09/2026, que não tem `parcelaDescricao`
   * e só se distingue por `parcelaNumero: 0`.
   */
  imposto: boolean;
}

export interface FinancialResource {
  id: string;
  proposalId: string;
  tipoRegistro: TipoRegistroRecursoFinanceiro;
  tipoBonificacao: TipoBonificacao | null;
  finalidadeRecurso: FinalidadeRecurso;
  etapaLiberacao: EtapaLiberacaoRecurso;
  /** ISO-8601 date. */
  dataLiberacao: string;
  qtdParcelas: number;
  valorParcela: number;
  indiceCorrecao: IndiceCorrecao | null;
  /**
   * Índice de correção das PRESTAÇÕES (ADO 67588). `null` para linhas
   * pré-migração, para bonificações e — desde 03/09/2026 — para o **Novo
   * Mútuo**, cujo índice da prestação é `bonusIndiceCorrecaoPrestacao`.
   */
  indiceCorrecaoParcela: IndiceCorrecao | null;
  periodicidade: PeriodicidadeRecurso;
  /**
   * Esta linha é custeada pela **obra** (estimativa do Converge) da oportunidade
   * — ADR-0048.
   *
   * ⚠️ `true` é a intenção registrada, não a garantia de que existe obra
   * vinculada. O campo `Obra (Converge)` no cartão só aparece na **conjunção**
   * (este flag **e** a oportunidade tem obra), igual ao `(r.obra ? … : '')` do
   * protótipo — nenhuma tela afirma uma obra que não existe.
   */
  custeadoPelaObra: boolean;
  /**
   * A obra que gerou este item, ou `null` quando foi criado diretamente.
   * Ver {@link ItemObra}.
   */
  obra: ItemObra | null;

  /**
   * Carência em meses (`Carencia_meses__c`). `null` fora do bloco Ressarcimento
   * — bonificação e, desde 03/09/2026, **Novo Mútuo**.
   */
  carenciaMeses: number | null;
  /**
   * Juros MENSAIS em **PERCENTUAL** (`Juros__c`) — `1` é 1%, não 0,01. O campo do
   * org é `type: percent`, e a população mede `1` em toda amostra de Mútuo.
   * `null` fora do bloco Ressarcimento (03/09/2026).
   */
  jurosPercentual: number | null;
  /**
   * Justificativa (`Justificativa__c`), máx. 255. Toda a família de Mútuo, Novo
   * Mútuo incluído — é o único campo do bloco que ele mantém.
   */
  justificativa: string | null;
  /**
   * Quantidade de PRESTAÇÕES do ressarcimento (`Qtde_Prestacoes__c`).
   *
   * ⚠️ **Não é `qtdParcelas`.** No layout do org (medido em 27/08/2026) o
   * RecordType `Novo Mútuo` traz `Qtde_De_Parcelas__c` na seção `Valores` **e**
   * `Qtde_Prestacoes__c` na seção `Prestações` — os dois convivem por desenho, e
   * a população registra uma linha em que divergem.
   *
   * ⚠️ Ainda assim, `null` no **Novo Mútuo** desde 03/09/2026: o negócio tirou o
   * campo dele, e a divergência com o layout do org está registrada em
   * `aceitaCamposDeRessarcimento` (backend).
   */
  qtdPrestacoes: number | null;
  /**
   * **Derivado pelo backend, somente leitura** —
   * `ADDMONTHS(dataLiberacao + 30 × carenciaMeses, 1)`, a mesma fórmula de
   * `Data_Inicio_Ressarcimento__c` no org. A tela EXIBE; não há input, porque o
   * CRM recalcula e sobrescreveria uma resposta do usuário.
   */
  dataInicioRessarcimento: string | null;
  /*
   * Bônus do Novo Mútuo (ADO 67587) — `Detalhe_de_Contrato_Mutuo_Enc_Contas__c`.
   * Todos `null` fora do Novo Mútuo.
   */
  /** `Periodicidade_de_Pagamento__c` do bônus. */
  bonusPeriodicidade: string | null;
  /** `Quantidade_de_Parcelas__c` do bônus — máx. 99 (`Número(2,0)` no org). */
  bonusQtdParcelas: number | null;
  /** `Valor_da_Parcela__c` do bônus. */
  bonusValorParcela: number | null;
  /** `Indice_de_Correcao_da_Prestacao__c` do bônus. */
  bonusIndiceCorrecaoPrestacao: string | null;
  /** `Tipo_de_Atualizacao_Monetaria__c` do bônus — o CÓDIGO do org (`04`/`05`). */
  bonusTipoAtualizacaoMonetaria: string | null;
  /**
   * Rótulo pt-BR do código acima, composto pelo BACKEND (ADR-0018): o código é
   * `04`/`05` e o rótulo é uma frase inteira — replicar o mapa aqui seria a
   * segunda cópia a apodrecer.
   */
  bonusTipoAtualizacaoMonetariaLabel: string | null;
  /**
   * **Derivado pelo backend** — `bonusQtdParcelas × bonusValorParcela`. `null`
   * quando falta operando: `0` afirmaria um bônus sem valor.
   */
  bonusValorTotal: number | null;
  /** Calculado: qtdParcelas × valorParcela. */
  valorTotal: number;
  /** Parcelas já vencidas até hoje, dada a periodicidade. */
  parcelasPagas: number;
  /** qtdParcelas - parcelasPagas. */
  parcelasRestantes: number;
  /** Calculado: parcelasRestantes × valorParcela. */
  saldoAPagar: number;
  /**
   * **Derivado pelo backend, somente leitura** — vencimento da ÚLTIMA parcela
   * (`ADDMONTHS(dataLiberacao, (qtdParcelas − 1) × meses(periodicidade))`). É o
   * `Data Final` do bloco "Valores" do recurso financeiro no Salesforce
   * (ADO 67800) e o campo homônimo do protótipo. `null` sem data de liberação
   * válida — e aí o cartão omite a linha, em vez de mostrar um rótulo vazio.
   */
  dataFinal: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Verba (política comercial) × utilizado pela proposta (HU-11/RN-F6-03). */
export interface BpBudget {
  verba: number;
  utilizado: number;
  /** utilizado / verba × 100 (0 quando verba = 0). */
  percentualUtilizado: number;
  /** true quando utilizado > verba — não bloqueia, apenas soma o aviso "BP excedido". */
  excedido: boolean;
}

/** Status ZFPJ do cliente da oportunidade (RN-F6-05). */
export interface SupplierStatus {
  customerRef: string;
  registradoZFPJ: boolean;
}

/** Cross-cutting result shared by list/mutation responses — never blocking. */
interface FinancialResourceWarnings {
  /**
   * ⚠️ **Omitido pelo backend** para perfil fora de `BP_BUDGET_VIEW_ROLES` — BP
   * Financeiro, SNEG, TI Administrador, Gerente Varejo e TI Sustentação (ADO
   * 67805). Ausência aqui é DECISÃO de visibilidade, não falha de carga: a tela
   * simplesmente não renderiza o card da verba (`Permission.BpBudgetView`
   * espelha a mesma lista).
   */
  bpBudget?: BpBudget;
  /** Omitted when the proposal has no financial resource yet, or SAP is unavailable (degrades silently). */
  supplierStatus?: SupplierStatus;
  /** Non-blocking, e.g. "BP excedido" (RN-F6-03) and/or "Conta ZFPJ não registrada" (RN-F6-05). */
  warnings: string[];
}

export interface FinancialResourcesListResult extends FinancialResourceWarnings {
  items: FinancialResource[];
}

export interface FinancialResourceMutationResult extends FinancialResourceWarnings {
  resource: FinancialResource;
}

/** Reference domains for the form fields — raw enum values, this module localizes labels. */
export interface FinancialResourceDomains {
  tipoRegistro: TipoRegistroRecursoFinanceiro[];
  tipoBonificacao: TipoBonificacao[];
  finalidadeRecurso: FinalidadeRecurso[];
  etapaLiberacao: EtapaLiberacaoRecurso[];
  periodicidade: PeriodicidadeRecurso[];
  indiceCorrecao: IndiceCorrecao[];
}

/** Payload for `POST /v1/proposals/{id}/financial-resources`. */
export interface CreateFinancialResourceInput {
  tipoRegistro: TipoRegistroRecursoFinanceiro;
  tipoBonificacao?: TipoBonificacao;
  finalidadeRecurso: FinalidadeRecurso;
  etapaLiberacao: EtapaLiberacaoRecurso;
  dataLiberacao: string;
  qtdParcelas: number;
  valorParcela: number;
  indiceCorrecao?: IndiceCorrecao;
  /**
   * Índice de correção das prestações (ADO 67588). Obrigatório no Mútuo e no
   * Parcelamento de Débito; não se aplica à bonificação nem ao Novo Mútuo
   * (03/09/2026). Mesmo conjunto de valores de `indiceCorrecao`.
   *
   * ⚠️ **É o único campo do bloco cujo tipo não admite `null`**, então omiti-lo
   * NÃO limpa um valor gravado. Quem limpa a linha que trocou de tipo é o
   * `update` do backend, que anula os quatro pelo mesmo predicado.
   */
  indiceCorrecaoParcela?: IndiceCorrecao;
  periodicidade: PeriodicidadeRecurso;
  /**
   * Custeado pela obra do Converge (ADR-0048). Opcional; ausente é `false` no
   * backend. Na edição, omitido mantém o valor gravado.
   */
  custeadoPelaObra?: boolean;
  /*
   * Campos do bloco Ressarcimento (ADO 67799 / 67800). `null` no update é como o
   * usuário LIMPA um valor informado por engano; ausente significa "não mexa".
   *
   * ⚠️ Carência, juros e prestações valem no Mútuo e no Parcelamento de Débito —
   * o **Novo Mútuo** saiu em 03/09/2026; a `justificativa` tem gate próprio e
   * continua na família inteira.
   *
   * `dataInicioRessarcimento` NÃO está aqui de propósito: é derivado no org e no
   * backend, então aceitá-lo como entrada seria oferecer um campo que o CRM
   * sobrescreve.
   */
  carenciaMeses?: number | null;
  jurosPercentual?: number | null;
  justificativa?: string | null;
  /**
   * Prestações do ressarcimento (`Qtde_Prestacoes__c`) — distinto de
   * `qtdParcelas`. `null` limpa; ausente significa "não mexa".
   */
  qtdPrestacoes?: number | null;
  /*
   * Bônus do Novo Mútuo (ADO 67587). `null` limpa; ausente significa "não mexa".
   * `bonusValorTotal` NÃO está aqui: é derivado, e aceitá-lo deixaria o total
   * divergir dos operandos.
   */
  bonusPeriodicidade?: string | null;
  bonusQtdParcelas?: number | null;
  bonusValorParcela?: number | null;
  bonusIndiceCorrecaoPrestacao?: string | null;
  bonusTipoAtualizacaoMonetaria?: string | null;
}

/** Payload for `PUT /v1/proposals/{id}/financial-resources/{resourceId}` — every field optional. */
export type UpdateFinancialResourceInput = Partial<CreateFinancialResourceInput>;

/** Thrown on 409 — RN-F6-01: the proposal's finalidade does not accept financial resources. */
export class FinancialResourceNotApplicableError extends Error {
  constructor() {
    super('Recursos financeiros não se aplicam a esta proposta.');
    this.name = 'FinancialResourceNotApplicableError';
  }
}

/**
 * Thrown on a non-409 save failure (400 validation, 404, 5xx). Carries the
 * backend's `message`/validation crítica so the modal can surface the real
 * cause instead of a generic "tente novamente" — mirrors the F5 product-line
 * error contract (`ConsumptionWindowError`) and `PostoPhotoUploadError`.
 */
export class FinancialResourceSaveError extends Error {
  constructor(message = 'Falha ao salvar o recurso financeiro. Tente novamente.') {
    super(message);
    this.name = 'FinancialResourceSaveError';
  }
}
