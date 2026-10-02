/**
 * Garantia domain — enum mirrors (frontend ↔ backend).
 *
 * All enums declared `as const` so comparisons target named members, never
 * loose string literals. The backend stays the single source of truth; this
 * file only lets the UI gate controls, display labels and validate unknown
 * values at the boundary.
 *
 * Canonical backend sources (ADR-0023 §D1):
 *   - `EstadoGarantia`  → apps/api/src/garantia/domain/estado-garantia.enum.ts
 *   - `TipoGarantia`    → apps/api/src/garantia/domain/tipo-garantia.enum.ts
 *   - `OrigemGarantia`  → apps/api/src/garantia/domain/origem-garantia.enum.ts
 *   - `CategoriaBem`    → apps/api/src/garantia/domain/categoria-bem.enum.ts
 *   - `ResultadoPrevia` → apps/api/src/garantia/domain/resultado-previa.enum.ts
 *   - `EstadoCivil`     → apps/api/src/garantia/domain/estado-civil.enum.ts
 *
 * `constants.ts` re-exports these types and derives select-option arrays from
 * them — it is no longer an independent source (GAR-17).
 */

// ---------------------------------------------------------------------------
// EstadoGarantia
// ---------------------------------------------------------------------------

/**
 * Mirror of the backend `EstadoGarantia` — all SIX members.
 *
 * ⚠️ `ENCERRADO` was missing, so `isEstadoGarantia` answered `false` for a state
 * the backend legitimately emits (RN-F1-06, when the concession stops requiring
 * a guarantee).
 *
 * There is deliberately NO label map here. The backend composes every pt-BR
 * label (`ESTADO_GARANTIA_LABEL` / `ESTADO_GARANTIA_LABEL_CONJUNTO`, ADR-0018)
 * and ships it in the payload. A second map existed with SHORTER wording
 * ('Em análise prévia' against the backend's 'Garantia · em análise prévia'),
 * had zero call sites, and is exactly the duplicate state→label map VBR-500
 * CA-5 forbids.
 */
export const EstadoGarantia = {
  AGUARDANDO_INDICACAO: 'AGUARDANDO_INDICACAO',
  EM_ANALISE_PREVIA: 'EM_ANALISE_PREVIA',
  PREVIA_APROVADA: 'PREVIA_APROVADA',
  PREVIA_REPROVADA: 'PREVIA_REPROVADA',
  MINUTA_EM_ANDAMENTO: 'MINUTA_EM_ANDAMENTO',
  ENCERRADO: 'ENCERRADO',
} as const;

export type EstadoGarantia = (typeof EstadoGarantia)[keyof typeof EstadoGarantia];

export function isEstadoGarantia(value: unknown): value is EstadoGarantia {
  return (
    typeof value === 'string' &&
    Object.values(EstadoGarantia).includes(value as EstadoGarantia)
  );
}

// ---------------------------------------------------------------------------
// ResultadoPrevia
// ---------------------------------------------------------------------------

export const ResultadoPrevia = {
  APROVADA: 'APROVADA',
  REPROVADA: 'REPROVADA',
} as const;

export type ResultadoPrevia = (typeof ResultadoPrevia)[keyof typeof ResultadoPrevia];

export const RESULTADO_PREVIA_LABEL: Record<ResultadoPrevia, string> = {
  APROVADA: 'Aprovada',
  REPROVADA: 'Reprovada',
};

export function isResultadoPrevia(value: unknown): value is ResultadoPrevia {
  return (
    typeof value === 'string' &&
    Object.values(ResultadoPrevia).includes(value as ResultadoPrevia)
  );
}

// ---------------------------------------------------------------------------
// TipoGarantia (moved from constants.ts — constants.ts now re-exports)
// ---------------------------------------------------------------------------

export const TipoGarantiaEnum = {
  GARANTIA_REAL: 'GARANTIA_REAL',
  FIANCA_BANCARIA: 'FIANCA_BANCARIA',
  FIANCA_COM_LASTRO: 'FIANCA_COM_LASTRO',
  FIANCA_SEM_LASTRO: 'FIANCA_SEM_LASTRO',
} as const;

export type TipoGarantiaEnum = (typeof TipoGarantiaEnum)[keyof typeof TipoGarantiaEnum];

export const TIPO_GARANTIA_LABEL_MAP: Record<TipoGarantiaEnum, string> = {
  GARANTIA_REAL: 'Garantia real (hipoteca / alienação fiduciária)',
  FIANCA_BANCARIA: 'Fiança bancária',
  FIANCA_COM_LASTRO: 'Fiança com lastro',
  FIANCA_SEM_LASTRO: 'Fiança sem lastro',
};

export function isTipoGarantia(value: unknown): value is TipoGarantiaEnum {
  return (
    typeof value === 'string' &&
    Object.values(TipoGarantiaEnum).includes(value as TipoGarantiaEnum)
  );
}

// ---------------------------------------------------------------------------
// OrigemGarantia (moved from constants.ts — constants.ts now re-exports)
// ---------------------------------------------------------------------------

export const OrigemGarantiaEnum = {
  NOVA: 'NOVA',
  EXISTENTE: 'EXISTENTE',
} as const;

export type OrigemGarantiaEnum = (typeof OrigemGarantiaEnum)[keyof typeof OrigemGarantiaEnum];

export function isOrigemGarantia(value: unknown): value is OrigemGarantiaEnum {
  return (
    typeof value === 'string' &&
    Object.values(OrigemGarantiaEnum).includes(value as OrigemGarantiaEnum)
  );
}

// ---------------------------------------------------------------------------
// CategoriaBem (moved from constants.ts — constants.ts now re-exports)
// ---------------------------------------------------------------------------

export const CategoriaBemEnum = {
  POSTO: 'POSTO',
  COMERCIAL: 'COMERCIAL',
  RESIDENCIAL: 'RESIDENCIAL',
  RURAL: 'RURAL',
} as const;

export type CategoriaBemEnum = (typeof CategoriaBemEnum)[keyof typeof CategoriaBemEnum];

export const CATEGORIA_BEM_LABEL_MAP: Record<CategoriaBemEnum, string> = {
  POSTO: 'Posto',
  COMERCIAL: 'Comercial',
  RESIDENCIAL: 'Residencial',
  RURAL: 'Rural',
};

export function isCategoriaBem(value: unknown): value is CategoriaBemEnum {
  return (
    typeof value === 'string' &&
    Object.values(CategoriaBemEnum).includes(value as CategoriaBemEnum)
  );
}

// ---------------------------------------------------------------------------
// EstadoCivil (moved from constants.ts — constants.ts now re-exports)
// ---------------------------------------------------------------------------

export const EstadoCivilEnum = {
  SOLTEIRO: 'SOLTEIRO',
  CASADO: 'CASADO',
  DIVORCIADO: 'DIVORCIADO',
  VIUVO: 'VIUVO',
  UNIAO_ESTAVEL: 'UNIAO_ESTAVEL',
} as const;

export type EstadoCivilEnum = (typeof EstadoCivilEnum)[keyof typeof EstadoCivilEnum];

export const ESTADO_CIVIL_LABEL_MAP: Record<EstadoCivilEnum, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  UNIAO_ESTAVEL: 'União estável',
};

export function isEstadoCivil(value: unknown): value is EstadoCivilEnum {
  return (
    typeof value === 'string' &&
    Object.values(EstadoCivilEnum).includes(value as EstadoCivilEnum)
  );
}

// ---------------------------------------------------------------------------
// GarantiaIndicacao (GAR-F1 read model)
// ---------------------------------------------------------------------------

/**
 * Read model for the guarantee indication section in the opportunity detail
 * screen (`GAR-F1` — `GET /v1/opportunities/:id/garantia/indicacao`).
 *
 * All enum fields carry their human-readable label alongside the machine code
 * (the backend resolves them); the frontend never replicates enum-to-label
 * mappings. Null means "absent from the backend response" — the UI omits
 * the element rather than showing a default.
 */
export interface GarantiaIndicacao {
  /** Internal guarantee UUID. Null when no indication has been submitted yet. */
  id: string | null;
  /** Current subprocess state (machine code). */
  estado: EstadoGarantia;
  /** Human-readable label for `estado`. */
  estadoLabel: string;
  /** Design-system pill variant code for `estado`. */
  estadoPill: string;
  /** Backend-authoritative list of allowed next states. */
  estadosPermitidos: EstadoGarantia[];
  /** Guarantee type machine code — null when not yet indicated. */
  tipo: string | null;
  /** Human-readable label for `tipo`. */
  tipoLabel: string | null;
  /** Guarantee origin machine code (`NOVA` | `EXISTENTE`). */
  origem: string | null;
  /** Human-readable label for `origem`. */
  origemLabel: string | null;
  /**
   * `Utilizacao__c` — o que a garantia lastreia ("Fornecimento" | "Concessão
   * Financeira"). `null` = "Nenhum". Sem par `*Label`: o API name É o rótulo.
   */
  utilizacao: string | null;
  /** Asset category machine code. */
  categoria: string | null;
  /** Human-readable label for `categoria`. */
  categoriaLabel: string | null;
  /**
   * Composed display string for the collateral property.
   * Format: "Av. Paulista, 1000 · matrícula 45.678 · São Paulo/SP"
   * Null when any underlying field is absent.
   */
  imovelDisplay: string | null;
  /**
   * Raw parts of the property — what the re-indication FORM hydrates from.
   *
   * Kept ALONGSIDE `imovelDisplay`, not derived from it: that is a composed
   * sentence for reading, and an address may contain the "·" separator, so
   * splitting it back apart is not safe. Before VBR-630 the re-indication form
   * opened blank and the LT retyped the whole indication to fix one document.
   */
  imovelEndereco: string | null;
  imovelMatricula: string | null;
  imovelCidade: string | null;
  imovelUf: string | null;
  /** Appraised value formatted as BRL — e.g. "R$ 1.200.000,00". */
  valorAvaliadoBrl: string | null;
  /** Utilisation percentage formatted as a label — e.g. "70%". */
  percentualAproveitamento: string | null;
  /** Free-text observations. */
  observacoes: string | null;
  /** SAP external guarantee id (for `origem = EXISTENTE`). */
  sapGarantiaExternaId: string | null;
  /** ISO-8601 timestamp of the indication submission; null before submission. */
  indicacaoSubmetidaEm: string | null;
}

// ---------------------------------------------------------------------------
// GarantiaIndicacaoResumo (garantia screen — "Garantias indicadas" list)
// ---------------------------------------------------------------------------

/**
 * One row of the "Garantias indicadas" list on the dedicated garantia screen
 * (`GarantiaView.indicacoes`, GET `/v1/opportunities/:id/garantia`).
 *
 * Mirrors the backend `GarantiaIndicacaoItemDto` — the SAME 1:N row the
 * opportunity-detail inline card also consumes (`GarantiaIndicacaoItem`,
 * `indicacoes.types.ts`) — but scoped to what THIS list renders: tipo + meta
 * (endereço · matrícula · categoria · valor), per the 26/08/2026 product
 * decision (list all indications; one análise prévia for the whole set).
 *
 * Deliberately drops the document fields (`certidaoUrl`/`laudoUrl`): this
 * projection never resolves them — they are always `null` here, attached or
 * not (see `GarantiaIndicacaoItemDto`'s own doc on the backend). Not typing
 * them at all avoids inviting a download link built from a field that can
 * never have a value; a working link comes from `GET .../garantia/indicacoes`.
 */
export interface GarantiaIndicacaoResumo {
  id: string;
  tipoLabel: string;
  /** Free-text property/asset description — the "endereço" piece of the meta line. */
  imovel: string | null;
  matricula: string | null;
  categoriaLabel: string | null;
  /** Formatted BRL string ("R$ 1.200.000,00") — money is formatted at the edge, not on the frontend. */
  valorAvaliadoBrl: string | null;
}
