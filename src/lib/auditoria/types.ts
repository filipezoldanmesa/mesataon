// ---------------------------------------------------------------------------
// F14 — Auditoria e logs (14-auditoria.html)
// ---------------------------------------------------------------------------

/**
 * Event type driving the row pill and filter chip.
 * - `critica`   → Ação crítica (aprovação, ativação, reserva, etc.)
 * - `transicao` → Transição de estado no workflow
 * - `acesso`    → Acesso a dado pessoal (LGPD)
 */
export type AuditoriaEventTipo = 'critica' | 'transicao' | 'acesso';

/** UI-only chip key ("todas" is never sent to the backend as a filter). */
export type AuditoriaFiltroChip = 'todas' | AuditoriaEventTipo;

/**
 * Single audit log entry, as mapped from `GET /v1/auditoria` by the BFF
 * (`lib/auditoria/auditoria-mapping.ts`).
 */
export interface AuditoriaEntry {
  id: string;
  /** Display date+time string, e.g. "21/07/2026 09:00" */
  dataHora: string;
  /** ISO-8601 timestamp — used for client-side sort */
  dataHoraIso: string;
  /** Actor display name */
  usuario: string;
  /** Actor role/profile label — null while the trail does not record it (V1) */
  perfil: string | null;
  tipo: AuditoriaEventTipo;
  /** Short action label, e.g. "Transição de estado" */
  acao: string;
  /** Object reference (e.g. "OPP-0428") — null when the entry recorded none */
  objeto: string | null;
  /**
   * Código humano da oportunidade a que o registro se refere (ADO 67958).
   *
   * Distinto de {@link objeto}: ali fica o código do agregado do ATO (a
   * pendência `PN-0089`), aqui o da oportunidade em que ele aconteceu. Nos atos
   * cuja oportunidade É o agregado os dois coincidem — e é daí que as transições
   * de workflow deixaram de exibir `—`.
   */
  oportunidade: string | null;
  /** Razão social do cliente daquela oportunidade (ADO 67958). */
  cliente: string | null;
  /** Detail / reason / state change, e.g. "Em aprovação → Aprovada" */
  detalhe: string;
  /**
   * Structured object state **before** the action (allowlisted fields; PII replaced
   * with "[redacted]"). Null for pre-VBR-451 records or actions that record no prior state.
   */
  estadoAnterior: Record<string, unknown> | null;
  /**
   * Structured object state **after** the action (allowlisted fields; PII replaced
   * with "[redacted]"). Null for pre-VBR-451 records or actions that record no posterior state.
   */
  estadoPosterior: Record<string, unknown> | null;
  /**
   * "Why" of the action — populated only when the action requires a justification
   * (e.g. proposal returned). Null when not applicable.
   */
  motivo: string | null;
}

/** Query parameters for the audit log list. */
export interface ListAuditoriaParams {
  tipo?: AuditoriaEventTipo;
  q?: string;
  /** ISO-8601 lower bound (inclusive), e.g. "2026-07-01" */
  de?: string;
  /** ISO-8601 upper bound (inclusive), e.g. "2026-07-31" */
  ate?: string;
  /** 1-based page number (default 1). */
  page?: number;
  /** Max records per page (default server-side, max 500). */
  limit?: number;
}

/** Result of loading the audit log list. */
export interface ListAuditoriaResult {
  items: AuditoriaEntry[];
  total: number;
  /** Current page (1-based). May be absent in older BFF responses. */
  page?: number;
  /** Page size applied. May be absent in older BFF responses. */
  limit?: number;
}
