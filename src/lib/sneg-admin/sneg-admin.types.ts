import type { EtapaDistribuicao } from '@/lib/governanca/distribuicao.types';

/**
 * Types for the SNEG parametrization admin screens (VBR-289 — RN-F1-01,
 * RN-F1-03, RN-F4-01). Mirror the backend DTOs (openapi.yaml `/v1/sneg/*`)
 * — do not hand-invent fields here.
 */

// ---------------------------------------------------------------------------
// Campos obrigatórios por tipo de proposta (RN-F1-03)
// ---------------------------------------------------------------------------

export type TipoPropostaSneg = 'POSTO' | 'FRANQUIA';

/** Mirror of the backend `CAMPO_CATALOG` + `CAMPO_DEFS` labels — keep in sync
 * with `apps/api/src/sneg/domain/campo-catalog.ts` (single vocabulary). */
export interface CampoObrigatorio {
  /** `null` quando o campo é travado — a trava não tem linha no banco. */
  id: string | null;
  tipoProposta: TipoPropostaSneg;
  campo: string;
  travado: boolean;
}

/** Superfícies em que a parametrização é cobrada ao salvar. */
export type SuperficieCobranca = 'PROPOSTA_CRIACAO' | 'PROPOSTA_DADOS';

/**
 * Uma entrada do catálogo, **servida pelo backend**.
 *
 * ⚠️ Havia aqui um `CAMPO_CATALOG_LABEL` chumbado no front, e ele saiu em
 * 22/09/2026: com trava e superfície de cobrança viajando no payload, uma
 * segunda lista de rótulos divergiria do catálogo do domínio no primeiro campo
 * novo — e a tela ofereceria um checkbox que a API recusa (ou esconderia um que
 * ela aceita). O veredito é do backend; a tela renderiza.
 */
export interface CampoCatalogoItem {
  campo: string;
  label: string;
  bloco: string;
  travado: boolean;
  motivoTrava: string | null;
  cobranca: SuperficieCobranca[];
}

export interface CamposObrigatoriosResult {
  campos: CampoObrigatorio[];
  catalogo: CampoCatalogoItem[];
}

// ---------------------------------------------------------------------------
// Distribuição gerência → analista (RN-F1-01)
// ---------------------------------------------------------------------------

export interface Distribuicao {
  /** Etapa da distribuição (ADO 67909) — parte da chave, junto da gerência. */
  etapa: EtapaDistribuicao;
  gerencia: string;
  analistaId: string;
  analistaNome: string | null;
  analistaEmail: string | null;
}

// ---------------------------------------------------------------------------
// Padrões de BP por negócio (RN-F4-01)
// ---------------------------------------------------------------------------

export interface BpPadrao {
  id: string;
  negocio: string;
  /** Decimal 0–1 (0.4 = 40%). */
  metaPercentualAntecipacao: number;
  /** Decimal 0–1. */
  metaPercentualPostecipacao: number;
  /** R$/m³ over total contracted volume. */
  metaCustoVinculacaoUnitario: number;
}

export interface BpPadraoList {
  items: BpPadrao[];
  total: number;
}

/** The three metas — the only thing both routes have in common. */
export interface BpPadraoMetas {
  metaPercentualAntecipacao: number;
  metaPercentualPostecipacao: number;
  metaCustoVinculacaoUnitario: number;
}

/**
 * Body of `POST /v1/sneg/padroes-bp` — mirrors `CreateBpPadraoDto`.
 *
 * `negocio` only exists here: on creation it is the natural key being claimed.
 */
export interface BpPadraoPayload extends BpPadraoMetas {
  negocio: string;
}

/**
 * Body of `PUT /v1/sneg/padroes-bp/:id` — mirrors `UpdateBpPadraoDto`, which
 * declares ONLY the three metas.
 *
 * ⚠️ **`negocio` is absent on purpose, and it is not cosmetic.** `business` is
 * the natural key (`UNIQUE` in `sneg_bp_standards`) and cannot be renamed
 * through this route — which is why the input is `disabled` while editing. The
 * API runs with `whitelist: true, forbidNonWhitelisted: true`, so an extra
 * property is a `400 VALIDATION_ERROR / UNKNOWN_FIELD`, not a field it ignores.
 * Sending the full `BpPadraoPayload` here is exactly what made **every** edit
 * fail with an opaque "Falha ao salvar o padrão de BP." (ADO 67952).
 *
 * ⚠️ The type alone does NOT close the hole: a wider object assigns to it by
 * width subtyping and `JSON.stringify` would still put `negocio` on the wire.
 * What closes it is `parseBpPadraoForm` returning `negocio` and `metas`
 * separately, plus `updateBpPadrao` building the body from explicit keys.
 */
export type BpPadraoUpdatePayload = BpPadraoMetas;

/** Thrown on 409 (negócio duplicado) so the UI can render it inline. */
export class BpPadraoConflictError extends Error {
  constructor(message = 'Já existe um padrão de BP para este negócio.') {
    super(message);
    this.name = 'BpPadraoConflictError';
  }
}
