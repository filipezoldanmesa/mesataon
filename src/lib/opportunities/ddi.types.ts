/**
 * DDI — Due Diligência de Integridade (F10 · Integrity Analysis)
 *
 * API Contract — F10 DDI (VBR-129 épico):
 *
 *   GET  /v1/opportunities/:id/ddi
 *   Response 200: DdiResult
 *   Response 404: { code: "OPPORTUNITY_NOT_FOUND" }
 *   Response 503: { code: "DDI_SERVICE_UNAVAILABLE" }
 *
 *   POST /v1/opportunities/:id/ddi/reclassify   (role: COMPLIANCE)
 *   Body: DdiReclassifyPayload
 *   Response 200: DdiResult (updated)
 *   Response 403: { code: "FORBIDDEN" }
 *   Response 422: { code: "DDI_RECLASSIFY_INVALID" }
 *
 *   POST /v1/opportunities/:id/ddi/decision     (role: LT, high-risk only)
 *   Body: DdiDecisionPayload
 *   Response 200: DdiResult (updated)
 *   Response 403: { code: "FORBIDDEN" }
 *   Response 422: { code: "DDI_DECISION_INVALID" }
 *
 * GATE 2 note: if the DDI is still in_progress or not yet decided by the LT,
 * attempting to advance the opportunity to 'aprovação' returns:
 *   422: { code: "DDI_PENDING" }
 */

/**
 * Lifecycle status of the DDI execution.
 * - `not_eligible`: client / deal type exempt from DDI (RN-F10-01).
 * - `in_progress`: analysis running; poll until it reaches `completed` or `error`.
 * - `completed`: final result available; check `riskLevel`.
 * - `error`: service error — the DDI engine could not complete the analysis.
 */
export type DdiStatus = 'not_eligible' | 'in_progress' | 'completed' | 'error';

/**
 * 1:1 mirror of the backend `DdiStatus` enum.
 *
 * {@link DdiStatus} above collapses five backend states into `completed`, which
 * is fine for the panel's badge but loses exactly what the parecer flow turns
 * on: whether Integridade released, rejected, or has not ruled yet. Screens that
 * need the verdict read this field; nothing re-derives it.
 */
export type DdiSituacao =
  | 'PENDENTE'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'PENDENTE_PARECER'
  | 'AGUARDANDO_LT'
  | 'LIBERADA'
  | 'REPROVADA'
  | 'CANCELADA'
  | 'ERRO'
  | 'NAO_ELEGIVEL';

/** Integridade's verdict on the opportunity — what drives the status, not the risk. */
export type DdiDecision = 'release' | 'reject';

/** Risk classification assigned by the DDI engine. */
export type DdiRiskLevel = 'low' | 'medium' | 'high';

/** A single integrity finding from the DDI engine. */
export interface DdiFinding {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Reclassification performed by a COMPLIANCE analyst (HU-18.2/.3).
 * Only present when COMPLIANCE has overridden the engine result.
 */
export interface DdiReclassification {
  reclassifiedTo: DdiRiskLevel;
  rationale: string;
  recommendations: string | null;
  reclassifiedAt: string; // ISO-8601
  reclassifiedBy: string;
}

/**
 * LT decision for a high-risk result (RN-F10-06).
 * Required before the opportunity can advance past GATE 2.
 */
export interface DdiLtDecision {
  action: 'proceed_with_clauses' | 'cancel';
  /** Required when action is 'cancel'; optional for 'proceed_with_clauses'. */
  justification: string | null;
  decidedAt: string; // ISO-8601
}

/**
 * Full DDI analysis result — returned by GET /v1/opportunities/:id/ddi.
 * Consumed by `DdiPanel` for rendering and real-time polling (HU-18.4).
 */
export interface DdiResult {
  opportunityId: string;
  status: DdiStatus;

  /** Backend status, uncollapsed — the only way to tell LIBERADA from REPROVADA. */
  situacao: DdiSituacao;

  /**
   * A Integridade ainda pode AGIR sobre esta DDI? Veredito do BACKEND, o mesmo
   * predicado que `reclassify` e `ddi/documento` aplicam.
   *
   * ⚠️ **Nunca derive isto de {@link situacao}.** A lista de status aceitos não é
   * intuitiva — `REPROVADA` aceita (a reprovação é reversível por um novo
   * parecer) e `LIBERADA` não —, e foi exatamente por reimplementá-la de dois
   * jeitos diferentes que as duas telas passaram a oferecer o que a API recusa:
   * o formulário do ticket oferecia os três botões sempre, e o painel gateava o
   * "Reclassificar" por `status === 'completed'`, que é o status COLAPSADO e
   * cobre `LIBERADA` junto (ADO 02/09/2026).
   */
  emTratativa: boolean;

  /** Risk level — null when status is `not_eligible` or `in_progress`. */
  riskLevel: DdiRiskLevel | null;

  /**
   * Risk the integrity TOOL classified, frozen at the run.
   *
   * `riskLevel` is overwritten by Integridade's parecer, so only this one can
   * answer "what did the analysis give?" — and that is what decides whether the
   * classification may be edited at all: a BAIXO analysis locks it, MÉDIO/ALTO
   * lets the analyst change it. `null` on rows reclassified before the backend
   * kept it.
   */
  engineRiskLevel: DdiRiskLevel | null;

  /**
   * Integrity score (0–100). Null until analysis completes.
   * Sensitive — masked outside production.
   */
  score: number | null;

  /**
   * Rationale / criteria explanation. Null until analysis completes.
   * Sensitive — masked outside production.
   */
  rationale: string | null;

  /** List of integrity findings. Empty until analysis completes. */
  findings: DdiFinding[];

  /**
   * Integrity opinion (parecer de integridade).
   * Only set for medium/high risk; null for low/not_eligible/in_progress.
   * Sensitive — masked outside production.
   */
  opinion: string | null;

  /** Reclassification applied by COMPLIANCE — null if none. */
  reclassification: DdiReclassification | null;

  /** LT decision for high risk — null if not yet decided. */
  ltDecision: DdiLtDecision | null;

  /**
   * Justificativa que o LT escreveu ao pedir NOVA AVALIAÇÃO de uma DDI
   * reprovada — o que foi tratado dos apontamentos da Integridade.
   *
   * ⚠️ **Não é `ltDecision.justification`.** Aquele campo carrega a decisão do
   * risco ALTO (`proceed_with_clauses｜cancel`) e o backend o APAGA a cada novo
   * parecer; este sobrevive ao ciclo, porque é o insumo que a Integridade lê ao
   * reavaliar. `null` quando nunca houve pedido de revisão — nunca `''`.
   */
  ltReviewRequestReason: string | null;

  /**
   * O backend omitiu o detalhe confidencial da Integridade (parecer, achados,
   * critérios, score) para este ator — Matriz RBAC v2.1, 24/09/2026. Os campos
   * vazios são RECORTE, não ausência, e a tela precisa dizer isso: sem a nota,
   * "sem parecer" e "parecer que você não vê" renderizariam igual.
   *
   * Veredito do backend; a tela não decide por perfil. Opcional: ausente ⇒
   * `false`.
   */
  detailRestricted?: boolean;
}

// ---------------------------------------------------------------------------
// Action payloads
// ---------------------------------------------------------------------------

/** Payload for POST /v1/opportunities/:id/ddi/reclassify (Integridade only). */
export interface DdiReclassifyPayload {
  reclassifiedTo: DdiRiskLevel;
  rationale: string;
  recommendations?: string;
  /**
   * Integridade's verdict. **It — never the risk — decides the outcome:**
   * `release` unblocks GATE 2 even with a risk that stayed high, `reject`
   * blocks it (reversibly). Required by the backend.
   */
  decision: DdiDecision;
}

/** Payload for POST /v1/opportunities/:id/ddi/solicitar-documento (Integridade only). */
export interface DdiDocumentRequestPayload {
  /** Names the document — it becomes the title of the LT's pendência. */
  documento: string;
  /** Why it is needed / where to get it. */
  motivo: string;
}

/**
 * Payload for POST /v1/opportunities/:id/ddi/decision (LT only, high risk).
 * RN-F10-06: justification is required when action is 'cancel'.
 */
export interface DdiDecisionPayload {
  action: 'proceed_with_clauses' | 'cancel';
  justification?: string;
}

/**
 * Payload para POST /v1/opportunities/:id/ddi/solicitar-revisao (LT, DDI
 * reprovada).
 *
 * ⚠️ **Sem campo de decisão, e a ausência é a regra:** o LT pede a revisão, a
 * Integridade decide (`ddi/reclassify`). O status volta para `PENDENTE_PARECER`,
 * nunca `LIBERADA`.
 */
export interface DdiRevisaoPayload {
  /** O que foi tratado dos apontamentos. Mínimo 20 caracteres no backend. */
  justification: string;
}

/** Piso do backend (`DDI_REVISAO_JUSTIFICATIVA_MIN_LENGTH`) — espelhado aqui. */
export const DDI_REVISAO_JUSTIFICATIVA_MIN_LENGTH = 20;

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Thrown when the user lacks the required role (HTTP 403). */
export class DdiForbiddenError extends Error {
  constructor() {
    super('Você não tem permissão para realizar esta ação na DDI.');
    this.name = 'DdiForbiddenError';
  }
}

/** Thrown when the DDI service cannot be reached (HTTP 503). */
export class DdiUnavailableError extends Error {
  constructor() {
    super('Serviço DDI indisponível. Tente novamente em instantes.');
    this.name = 'DdiUnavailableError';
  }
}

/** Thrown when the payload fails business-rule validation (HTTP 422). */
export class DdiValidationError extends Error {
  /**
   * @param code   Backend error code (e.g. `DDI_RECLASSIFY_INVALID`).
   * @param detail Human-readable field-level message from the backend, when
   *               present. Used verbatim in the modal so the analyst sees
   *               "which field" failed, not a generic fallback.
   */
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ?? `Validação DDI falhou: ${code}`);
    this.name = 'DdiValidationError';
  }
}
