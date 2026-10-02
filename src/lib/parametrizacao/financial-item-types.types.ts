import type { CategoriaFinanceiro, RecordTypeFinanceiro } from '@/lib/proposals/financial-items.types';

/**
 * The "Parâmetros da Oportunidade" catalogue as the parametrization screen sees
 * it — Bug ADO 67585 / VBR-595.
 *
 * Mirrors `FinancialItemTypeParametrizacaoDto` field for field, so the BFF is a
 * passthrough. Distinct from `FinancialItemType`
 * (`lib/proposals/financial-items.types.ts`), which is what the PROPOSAL sees:
 * there the six regional columns are already collapsed into a single
 * `defaultValor` resolved for that account's sales office. Here they are six
 * separate values, because maintaining them is the whole point.
 */
export interface ValorParametrizadoRow {
  id: string;
  tipoProposta: string;
  recordType: RecordTypeFinanceiro;
  categoria: CategoriaFinanceiro;
  nome: string;
  descricao: string | null;
  /** `Valor__c` — applied when the sales office has no regional column. */
  defaultValor: number | null;
  defaultValorVrod: number | null;
  defaultValorVreg1: number | null;
  defaultValorVreg2: number | null;
  defaultValorVreg3: number | null;
  defaultValorVreg4: number | null;
  /** Auto-created on every proposal by `:seed-required` (HU-21). */
  obrigatoria: boolean;
  /** The amount is read-only on the proposal (Bug 67585). */
  cataloguePriced: boolean;
  /** Offered in the LT's "Adicionar item" dropdown (Bug 67517). */
  selectable: boolean;
  updatedAt: string;
}

export interface ValoresParametrizadosPage {
  items: ValorParametrizadoRow[];
  total: number;
}

/**
 * Payload of a save.
 *
 * **An omitted key keeps the stored value; an explicit `null` clears it.** The
 * screen sends all six because it renders all six, but the distinction is part
 * of the contract and must survive any refactor: `null` means "esta região não é
 * precificada", and it is not `0` — a zero on a money field reads as a price and
 * would travel to the ARP as one.
 */
export interface ValorParametrizadoPayload {
  defaultValor?: number | null;
  defaultValorVrod?: number | null;
  defaultValorVreg1?: number | null;
  defaultValorVreg2?: number | null;
  defaultValorVreg3?: number | null;
  defaultValorVreg4?: number | null;
  descricao?: string | null;
}

/** The six amount columns, in the order the table renders them. */
export const COLUNAS_VALOR = [
  { key: 'defaultValor', label: 'Geral' },
  { key: 'defaultValorVrod', label: 'VROD' },
  { key: 'defaultValorVreg1', label: 'VREG1' },
  { key: 'defaultValorVreg2', label: 'VREG2' },
  { key: 'defaultValorVreg3', label: 'VREG3' },
  { key: 'defaultValorVreg4', label: 'VREG4' },
] as const satisfies ReadonlyArray<{ key: keyof ValorParametrizadoPayload; label: string }>;

export type ColunaValor = (typeof COLUNAS_VALOR)[number]['key'];
