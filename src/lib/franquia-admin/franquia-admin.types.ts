// `BandeiraFranquia` is imported rather than mirrored again: the band drives
// routing and labels across the franquia screens and already lives there. The
// `FormatoLoja` / `ModeloRoyalty` mirrors below predate this file's split and are
// kept as-is to avoid a churn-only rename.
import type { BandeiraFranquia } from '@/lib/franquia/types';

/**
 * Types for the franquia J10 admin screens (FRQ-16):
 *   - Catálogo de royalties / Anexo A (HU-13 / RN-F2-04)
 *   - Taxa de franquia e parcelas por bandeira × formato (67575 / 67594)
 *
 * Enums mirror the backend 1:1 — do not invent new values here.
 * Backend sources: `franquia/domain/modelo-royalty.enum.ts`,
 * `franquia/domain/modelo-negocio.enum.ts`, `franquia/domain/formato-loja.enum.ts`.
 */

// ---------------------------------------------------------------------------
// Shared enums (mirror backend)
// ---------------------------------------------------------------------------

/*
 * As políticas do CATÁLOGO Anexo A. `PERCENTUAL_FIXO` (Lubrax+, 22/09/2026)
 * fica fora de propósito: ele resolve pelo modelo de negócio, e o backend
 * recusa faixa gravada com ele (`IsIn(MODELOS_ROYALTY_ORDEM)`).
 */
export type ModeloRoyalty =
  | 'VALOR_FIXO'
  | 'PERCENTUAL_UNICO'
  | 'PERCENTUAL_ESCALONADO'
  | 'POR_CATEGORIA';

export type ModeloNegocio = 'RODOVIA' | 'URBANO';

export type FormatoLoja = 'PADRAO' | 'PONTO' | 'SUPER_COMPACTA';

export const MODELO_ROYALTY_LABEL: Record<ModeloRoyalty, string> = {
  VALOR_FIXO: 'Valor fixo',
  PERCENTUAL_UNICO: 'Percentual único',
  PERCENTUAL_ESCALONADO: 'Percentual escalonado',
  POR_CATEGORIA: 'Por categoria',
};

export const MODELO_NEGOCIO_LABEL: Record<ModeloNegocio, string> = {
  RODOVIA: 'Rodovia',
  URBANO: 'Urbano',
};

export const FORMATO_LOJA_LABEL: Record<FormatoLoja, string> = {
  PADRAO: 'Padrão',
  PONTO: 'Ponto',
  SUPER_COMPACTA: 'Super compacta',
};

// ---------------------------------------------------------------------------
// Catálogo de royalties / Anexo A (HU-13)
// ---------------------------------------------------------------------------

/** Mirror of `CatalogoRoyaltyDto` from the backend. */
/**
 * Mirror of `CatalogoRoyaltyDto`.
 *
 * ⚠️ The key is `politica × formatoLoja × registroSequencial` — the business
 * model is NOT part of it. Vibra decided on 13/08/2026 that stores of the same
 * format and revenue pay the same percentage regardless of the posto type
 * (backend migration `…074`). `ModeloNegocio` still exists in this module — the
 * franchise proposal screens use it — but it is a different axis: do not wire it
 * back into the catalog.
 */
export interface CatalogoRoyalty {
  id: string;
  politica: ModeloRoyalty;
  formatoLoja: FormatoLoja;
  /** Sequential band number within the policy (≥ 1). */
  registroSequencial: number;
  /** Billing band start (BRL string or null for non-scaled policies). */
  inicioFaixaFaturamento: string | null;
  /** Billing band end (BRL string, null = open band). */
  fimFaixaFaturamento: string | null;
  /** Royalty percentage (decimal 0–1, e.g. "0.050000"). */
  percRoyalty: string | null;
  /** Royalty percentage on tobacco (PT-04). */
  percRoyaltyTabaco: string | null;
  /** Marketing fund percentage (decimal 0–1). */
  percFundoDeMkt: string | null;
  /** Marketing fund percentage on tobacco (PT-04). */
  percFundoDeMktTabaco: string | null;
  /** Fixed royalty value (BRL). Only for VALOR_FIXO. */
  valorFixoRoyalty: string | null;
  /** Fixed marketing fund value (BRL). Only for VALOR_FIXO. */
  valorFixoFundoMkt: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogoRoyaltyList {
  items: CatalogoRoyalty[];
  total: number;
}

/** Payload for POST /api/franquia-parametrizacao/catalogo-royalties */
export interface CreateCatalogoRoyaltyPayload {
  politica: ModeloRoyalty;
  formatoLoja: FormatoLoja;
  registroSequencial: number;
  inicioFaixaFaturamento?: number | null;
  fimFaixaFaturamento?: number | null;
  percRoyalty?: number | null;
  percRoyaltyTabaco?: number | null;
  percFundoDeMkt?: number | null;
  percFundoDeMktTabaco?: number | null;
  valorFixoRoyalty?: number | null;
  valorFixoFundoMkt?: number | null;
}

/** Payload for PUT /api/franquia-parametrizacao/catalogo-royalties/:id */
export interface UpdateCatalogoRoyaltyPayload {
  inicioFaixaFaturamento?: number | null;
  fimFaixaFaturamento?: number | null;
  percRoyalty?: number | null;
  percRoyaltyTabaco?: number | null;
  percFundoDeMkt?: number | null;
  percFundoDeMktTabaco?: number | null;
  valorFixoRoyalty?: number | null;
  valorFixoFundoMkt?: number | null;
}

/** Thrown on 409 so the UI can render the message inline (backend is source of truth). */
export class CatalogoRoyaltyConflictError extends Error {
  constructor(
    message = 'Já existe uma entrada para esta combinação (política × formato de loja × seq).',
  ) {
    super(message);
    this.name = 'CatalogoRoyaltyConflictError';
  }
}

// ---------------------------------------------------------------------------
// Taxa de franquia e parcelas (Bugs 67575 / 67594)
// ---------------------------------------------------------------------------

/**
 * Mirror of `TaxaParametrizacaoDto` — one row of the franchise-fee table, keyed
 * by bandeira × formato de loja.
 *
 * `taxaFranquiaDefaultBrl` is `null` when the combination is not priced, and
 * that is a real answer: the fee field on the proposal then opens empty instead
 * of receiving a number nobody chose.
 */
export interface TaxaParametrizacao {
  bandeira: BandeiraFranquia;
  formatoLoja: FormatoLoja;
  taxaFranquiaDefaultBrl: string | null;
  maxParcelasTaxa: number;
  descricao: string | null;
  atualizadoPorId: string | null;
  updatedAt: string;
}

export interface TaxaParametrizacaoList {
  items: TaxaParametrizacao[];
  total: number;
}

/** Payload for PUT /api/franquia-parametrizacao/taxa-franquia (upsert by key). */
export interface UpsertTaxaParametrizacaoPayload {
  bandeira: BandeiraFranquia;
  formatoLoja: FormatoLoja;
  taxaFranquiaDefaultBrl: number | null;
  maxParcelasTaxa: number;
  /** `null` clears the note; omitted preserves the one on record. */
  descricao?: string | null;
}

// ---------------------------------------------------------------------------
// Estrutura de royalties · limites (ADO 67867)
// ---------------------------------------------------------------------------

/**
 * Mirror of `LimiteRoyaltyParametrizacaoDto` — uma linha da parametrização de
 * limites de royalty, chaveada por **bandeira**.
 *
 * Percentuais em **basis points inteiros** (`350` = 3,50 %), a mesma escala da
 * linha da proposta — nenhuma conversão de escala na borda, que é onde os erros
 * de 100× aparecem.
 *
 * ⚠️ `tetoBrl` é sempre `null` para Lubrax+, que não tem teto máximo (a API
 * recusa com 400 e o schema tem CHECK).
 */
export interface LimiteRoyaltyParametrizacao {
  bandeira: BandeiraFranquia;
  royaltyMinimoBps: number | null;
  fundoMktMinimoBps: number | null;
  valorFixoBrl: string | null;
  fundoMktValorFixoBrl: string | null;
  pisoBrl: string | null;
  tetoBrl: string | null;
  valorMinimoMensalBrl: string | null;
  descricao: string | null;
  atualizadoPorId: string | null;
  updatedAt: string;
}

export interface LimiteRoyaltyParametrizacaoList {
  items: LimiteRoyaltyParametrizacao[];
  total: number;
}

/**
 * Payload do PUT /api/franquia-parametrizacao/limites-royalty (upsert pela
 * bandeira).
 *
 * Todo patamar é **substituição completa**, não merge: mandar `null` limpa. Sem
 * isso, um valor digitado por engano ficaria impossível de desfazer — que é o
 * estado que este ticket veio consertar.
 */
export interface UpsertLimiteRoyaltyParametrizacaoPayload {
  bandeira: BandeiraFranquia;
  royaltyMinimoBps: number | null;
  fundoMktMinimoBps: number | null;
  valorFixoBrl: number | null;
  fundoMktValorFixoBrl: number | null;
  pisoBrl: number | null;
  tetoBrl: number | null;
  valorMinimoMensalBrl: number | null;
  /** `null` apaga a observação; omitido preserva a que está gravada. */
  descricao?: string | null;
}

// ── COF por bandeira (17/09/2026) ───────────────────────────────────────────

/** Uma versão cadastrada da COF de uma bandeira. */
export interface CofTemplate {
  id: string;
  bandeira: string;
  versao: number;
  fileName: string;
  sizeBytes: number;
  observacoes: string | null;
  cadastradaPor: string | null;
  cadastradaEm: string;
  /** A versão que será ENTREGUE nas próximas oportunidades daquela bandeira. */
  vigente: boolean;
}

export interface CofTemplatesDaBandeira {
  bandeira: string;
  bandeiraLabel: string;
  /**
   * Da mais recente para a mais antiga. `[]` significa **bandeira sem COF
   * cadastrada** — a lacuna que a tela precisa mostrar, e não um item a omitir:
   * nenhuma oportunidade daquela bandeira receberá documento nenhum.
   */
  versoes: CofTemplate[];
}

export interface CofTemplateList {
  bandeiras: CofTemplatesDaBandeira[];
}
