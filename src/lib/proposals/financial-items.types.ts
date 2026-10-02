/**
 * Types for the "Receitas e Despesas da Oportunidade" block (PRD F9 §7.9 —
 * HU-20/21). This module (FE, VBR-... "[FE] OPP-F9") establishes/refines the
 * "Receitas e Despesas" section of the API Contract in epic VBR-125;
 * `[BE]` VBR-126 implements against it.
 *
 * API contract:
 *
 *   GET  /v1/proposals/:id/financial-item-types
 *        → 200 { items: FinancialItemType[] }
 *        Tipos elegíveis para a proposta (parametrizados por tipoProposta),
 *        já trazendo os defaults de índice/periodicidade (HU-20.1).
 *
 *   GET  /v1/proposals/:id/financial-items
 *        → 200 { items: FinancialItem[], summary: FinancialSummary }
 *
 *   POST /v1/proposals/:id/financial-items
 *        body: CreateFinancialItemInput
 *        → 201 { item: FinancialItem, summary: FinancialSummary }
 *        → 404 (proposta ou tipo de item financeiro não encontrado)
 *        → 422 (datas fora do horizonte de análise, ou tipo já existente na
 *          proposta — RN-F9-03; crítica bloqueante — HU-20.2)
 *        → 400 (volumeGnvCtf ausente/indevido para o tipo — RN-F9-04)
 *
 *   POST /v1/proposals/:id/financial-items/seed-required
 *        → 200 { created, skipped, items: FinancialItem[], summary: FinancialSummary }
 *        Idempotente — cria os itens obrigatórios da parametrização ainda
 *        ausentes (HU-21). Itens GNV/CTF obrigatórios não são auto-criados
 *        (exigem volume) e permanecem pendentes de criação manual.
 *
 *   PUT  /v1/proposals/:id/financial-items/:itemId
 *        body: UpdateFinancialItemInput
 *        → 200 { item: FinancialItem, summary: FinancialSummary }
 *        → 422 quando campos estruturais são enviados com a proposta fora de
 *          EM_PREENCHIMENTO / DEVOLVIDA (fase nomeada na mensagem).
 *        → 422 quando um campo de catálogo de item OBRIGATÓRIO é alterado —
 *          tipo, valor, descrição, índice, periodicidade ou datas (VBR-584,
 *          item nomeado na mensagem). Vale em qualquer fase; só volumeGnvCtf e
 *          bypass seguem editáveis nesses itens.
 *        Em EM_PREENCHIMENTO / DEVOLVIDA todos os campos do item MANUAL são
 *        editáveis. Em EM_ANALISE apenas valor / volumeGnvCtf / bypass.
 *
 *   DELETE /v1/proposals/:id/financial-items/:itemId
 *        → 204
 *        → 409 (item obrigatório sem bypass não pode ser removido — HU-21.1)
 */

export type RecordTypeFinanceiro =
  | 'RECEITA'
  | 'RECEITA_INICIAL'
  | 'OUTRA_RECEITA'
  | 'DESPESA'
  | 'DESPESA_INICIAL'
  | 'OUTRA_DESPESA';

/**
 * Screen labels for the six record types. The two open-ended ones are plural
 * ("Outras Receitas" / "Outras Despesas") because that is the wording Vibra
 * asked for verbatim (ADO 67584 / VBR-594) — the mismatch with the singular
 * "Receita"/"Despesa" beside them is deliberate, not an oversight.
 */
export const RECORD_TYPE_LABELS: Record<RecordTypeFinanceiro, string> = {
  RECEITA: 'Receita',
  RECEITA_INICIAL: 'Receita Inicial',
  OUTRA_RECEITA: 'Outras Receitas',
  DESPESA: 'Despesa',
  DESPESA_INICIAL: 'Despesa Inicial',
  OUTRA_DESPESA: 'Outras Despesas',
};

export type CategoriaFinanceiro = 'RECEITA' | 'DESPESA';

export const CATEGORIA_LABELS: Record<CategoriaFinanceiro, string> = {
  RECEITA: 'Receita',
  DESPESA: 'Despesa',
};

// Same Salesforce value set as the financial RESOURCES index (18 values, default
// `IGP-M`) — financial items and financial resources share
// `Recurso_Financeiro_Da_Cotacao__c.Indice_De_Correcao__c` in the CRM.
import { IndiceCorrecao } from '@/lib/picklists/salesforce-values';

export { IndiceCorrecao };

/**
 * No label map: the 18 index values ARE their own labels in Salesforce
 * (`IGP-M`, `Sem correção`, …), so a map would only be a place for the two to
 * drift. Render options with `usePicklist(PicklistField.RecursoFinanceiroIndiceCorrecao)`
 * and display the stored value directly.
 */

export type PeriodicidadeItem = 'UNICA' | 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

export const PERIODICIDADE_LABELS: Record<PeriodicidadeItem, string> = {
  UNICA: 'Única',
  MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
};

/**
 * An eligible financial-item type for a proposal (HU-20.1). Populates the
 * "Tipo" dropdown in the add-item modal and seeds index/periodicity defaults.
 */
export interface FinancialItemType {
  id: string;
  recordType: RecordTypeFinanceiro;
  categoria: CategoriaFinanceiro;
  nome: string;
  descricao: string | null;
  defaultIndiceCorrecao: IndiceCorrecao | null;
  defaultPeriodicidade: PeriodicidadeItem | null;
  /**
   * Advisory monetary default (R$) applied when auto-seeding a mandatory item
   * or pre-filling the form on type selection (RN-F9-02 / HU-21).
   * `null` means "use 0 as placeholder" — `0` is a valid business default for
   * items where the amount is station-specific (e.g. Aluguel, Receita GNV).
   * Source for PCR values: ciclo1.js:285-296 + product decision 14/08/2026.
   */
  defaultValor: number | null;
  /**
   * Advisory free-text description pre-filled in the form when the type is
   * selected (RN-F9-02). `null` for open-ended types (OUTRA_RECEITA,
   * OUTRA_DESPESA) where the LT must provide a meaningful description.
   */
  defaultDescricao: string | null;
  obrigatoria: boolean;
  /** Whether the type requires a `volumeGnvCtf` (RN-F9-04). */
  isGnvCtf: boolean;
  /**
   * O VALOR deste tipo é parametrizado pela Vibra (Bug ADO 67585).
   *
   * `true` ⇒ o campo de valor abre somente leitura, pré-preenchido com
   * `defaultValor`; a API responde 422 a qualquer valor diferente, no create e
   * no update. Vale para as quatro faixas `Receita - Royalties GNV …`.
   *
   * ⚠️ Não confundir com `obrigatoria`: aquele trava os SETE campos de catálogo
   * e faz o item nascer em toda proposta (`:seed-required`); este trava **só o
   * valor**. Volume GNV, bypass, datas, periodicidade, índice e descrição
   * continuam do LT (VBR-552).
   */
  cataloguePriced: boolean;
}

export interface FinancialItem {
  id: string;
  proposalId: string;
  financialItemTypeId: string;
  tipoNome: string;
  recordType: RecordTypeFinanceiro;
  categoria: CategoriaFinanceiro;
  descricao: string | null;
  /**
   * Nullable por histórico: o mascaramento de resposta que motivou o tipo foi
   * removido (VBR-484 / VBR-488) e `maskItem`/`maskSummary` não existem mais —
   * a API devolve o valor em todos os ambientes. O `| null` permanece porque a
   * tela já trata o caso e estreitá-lo não conserta nada, mas **`null` aqui não
   * significa mais "oculto"**: renderize "—", não um marcador de máscara.
   */
  valor: number | null;
  valorFinal: number | null;
  indiceCorrecao: IndiceCorrecao | null;
  periodicidade: PeriodicidadeItem;
  dataInicial: string;
  dataFinal: string;
  numMeses: number;
  volumeGnvCtf: number | null;
  obrigatoria: boolean;
  bypass: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialSummary {
  /** `null` fora de produção — mascarado pelo BFF (ver {@link FinancialItem.valor}). */
  totalReceitas: number | null;
  totalDespesas: number | null;
  saldo: number | null;
}

export interface FinancialItemsSnapshot {
  items: FinancialItem[];
  summary: FinancialSummary;
  /** Horizonte de análise da proposta (RN-F9-03). Ausente apenas em stubs de teste antigos. */
  dataInicioAnalise?: string;
  dataFimAnalise?: string;
}

export interface SeedRequiredResult extends FinancialItemsSnapshot {
  created: number;
  skipped: number;
}

/** Response of a single-item mutation (create/update) — mirrors `FinancialItemMutationResponseDto`. */
export interface FinancialItemMutationResult {
  item: FinancialItem;
  summary: FinancialSummary;
}

export interface CreateFinancialItemInput {
  financialItemTypeId: string;
  descricao?: string;
  valor: number;
  indiceCorrecao?: IndiceCorrecao;
  periodicidade: PeriodicidadeItem;
  dataInicial: string;
  dataFinal: string;
  volumeGnvCtf?: number;
  bypass?: boolean;
}

/**
 * PUT /v1/proposals/:id/financial-items/:itemId
 *
 * Structural fields (`financialItemTypeId`, `descricao`, `indiceCorrecao`,
 * `periodicidade`, `dataInicial`, `dataFinal`) are only accepted when the
 * proposal is in `EM_PREENCHIMENTO` or `DEVOLVIDA`.  Sending any of them
 * while the proposal is in `EM_ANALISE` returns 422 (caught as
 * {@link FinancialItemCriticaError}).
 */
export interface UpdateFinancialItemInput {
  financialItemTypeId?: string;
  descricao?: string;
  valor?: number;
  indiceCorrecao?: IndiceCorrecao;
  periodicidade?: PeriodicidadeItem;
  dataInicial?: string;
  dataFinal?: string;
  volumeGnvCtf?: number;
  bypass?: boolean;
}

/**
 * Thrown on 422 — blocking "crítica" (RN-F9-03): item dates fall outside the
 * proposal's analysis horizon, or the item type already exists in this
 * proposal (periodicity/type must be unique). Blocks save until fixed (HU-20.2).
 */
export class FinancialItemCriticaError extends Error {
  constructor(
    message = 'As datas do item devem estar dentro do horizonte de análise da proposta e o tipo não pode se repetir.',
  ) {
    super(message);
    this.name = 'FinancialItemCriticaError';
  }
}

/** Thrown on 400 — `volumeGnvCtf` missing/not applicable for the type (RN-F9-04). */
export class GnvVolumeInvalidError extends Error {
  constructor(message = 'Volume GNV/CTF inválido para este tipo de item.') {
    super(message);
    this.name = 'GnvVolumeInvalidError';
  }
}

/** Thrown on 409 — mandatory item without bypass cannot be removed (HU-21.1). */
export class RequiredItemConflictError extends Error {
  constructor(message = 'Item obrigatório não pode ser removido sem autorização (bypass).') {
    super(message);
    this.name = 'RequiredItemConflictError';
  }
}

/** Thrown on 404 — proposal, item, or item type not found. */
export class FinancialItemNotFoundError extends Error {
  constructor(message = 'Recurso não encontrado.') {
    super(message);
    this.name = 'FinancialItemNotFoundError';
  }
}
