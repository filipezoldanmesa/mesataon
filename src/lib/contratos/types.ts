/**
 * Frontend mirror of the contract domain types (apps/api/src/contracts/).
 *
 * Declared `as const` so every comparison is against a NAMED member, never a
 * loose string literal. The backend stays the single source of truth; this file
 * only lets the UI display and gate on contract state — the real enforcement is
 * the API (403 / 400), never the absence of a button.
 *
 * NOTE: TipoContratoDocumento (CPCVM | CLUM | CCM) is intentionally DISTINCT
 * from proposals.TipoContrato (the business contract type) — see ADR-0019 and
 * CLAUDE.md §Ciclo do contrato.
 *
 * ## Four enums mandated by CTR-13
 *
 * - `EtapaContrato`       — lifecycle step inside the contract flow (MINUTA→PAGAMENTO)
 * - `StatusMinuta`        — status of a single minuta version
 * - `StatusSignatario`    — status of an individual signer in DocuSign
 * - `EstadoExternoContrato` — CRM/SAP mirror of the contract activation state
 *
 * Unknown values from the wire must pass through the type guard and resolve to
 * the **safest** state (no destructive CTA is gated on it), never `?? firstValue`.
 */

// ---------------------------------------------------------------------------
// EtapaContrato — lifecycle step of a contract (MINUTA → PAGAMENTO)
// ---------------------------------------------------------------------------

/**
 * Internal contract lifecycle step as returned in `etapaAtual` by the read model.
 *
 * Machine (linear, no cancellation): MINUTA → ASSINATURA → CADASTRO → ATIVACAO → PAGAMENTO.
 * Distinct from OpportunityState (EM_MINUTA / EM_ASSINATURA / EM_PAGAMENTO).
 *
 * @see apps/api/src/contracts/domain/etapa-contrato.enum.ts
 */
export const EtapaContrato = {
  Minuta: 'MINUTA',
  Assinatura: 'ASSINATURA',
  Cadastro: 'CADASTRO',
  Ativacao: 'ATIVACAO',
  Pagamento: 'PAGAMENTO',
} as const;

export type EtapaContrato = (typeof EtapaContrato)[keyof typeof EtapaContrato];

export const ETAPA_CONTRATO_LABEL: Record<EtapaContrato, string> = {
  [EtapaContrato.Minuta]: 'Minuta',
  [EtapaContrato.Assinatura]: 'Assinatura',
  [EtapaContrato.Cadastro]: 'Cadastro',
  [EtapaContrato.Ativacao]: 'Ativação',
  [EtapaContrato.Pagamento]: 'Pagamento',
};

export function isEtapaContrato(value: unknown): value is EtapaContrato {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(ETAPA_CONTRATO_LABEL, value)
  );
}

// ---------------------------------------------------------------------------
// StatusMinuta — lifecycle status of a draft (minuta) version
// ---------------------------------------------------------------------------

/**
 * Status of a contract draft version as returned by the backend.
 *
 * @see apps/api/src/contracts/domain/status-minuta.enum.ts
 */
export const StatusMinuta = {
  Pendente: 'PENDENTE',
  Aguardando: 'AGUARDANDO',
  Gerando: 'GERANDO',
  Gerada: 'GERADA',
  Substituida: 'SUBSTITUIDA',
  Assinada: 'ASSINADA',
  Falha: 'FALHA',
} as const;

export type StatusMinuta = (typeof StatusMinuta)[keyof typeof StatusMinuta];

export const STATUS_MINUTA_LABEL: Record<StatusMinuta, string> = {
  [StatusMinuta.Pendente]: 'Pendente',
  [StatusMinuta.Aguardando]: 'Aguardando',
  [StatusMinuta.Gerando]: 'Gerando',
  [StatusMinuta.Gerada]: 'Gerada',
  [StatusMinuta.Substituida]: 'Substituída',
  [StatusMinuta.Assinada]: 'Assinada',
  [StatusMinuta.Falha]: 'Falha',
};

export function isStatusMinuta(value: unknown): value is StatusMinuta {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(STATUS_MINUTA_LABEL, value)
  );
}

// ---------------------------------------------------------------------------
// StatusSignatario — status of an individual signer in DocuSign
// ---------------------------------------------------------------------------

/**
 * Status of a single signatory in the DocuSign envelope.
 *
 * Safe fallback for unknown values: `Pending` (awaiting — no destructive CTA
 * is gated on it).
 */
export const StatusSignatario = {
  Pending: 'PENDING',
  Sent: 'SENT',
  Delivered: 'DELIVERED',
  Completed: 'COMPLETED',
  Declined: 'DECLINED',
  AuthFailed: 'AUTH_FAILED',
} as const;

export type StatusSignatario =
  (typeof StatusSignatario)[keyof typeof StatusSignatario];

export const STATUS_SIGNATARIO_LABEL: Record<StatusSignatario, string> = {
  [StatusSignatario.Pending]: 'Aguardando',
  [StatusSignatario.Sent]: 'Enviado',
  [StatusSignatario.Delivered]: 'Visualizado',
  [StatusSignatario.Completed]: 'Assinado',
  [StatusSignatario.Declined]: 'Recusado',
  [StatusSignatario.AuthFailed]: 'Falha de autenticação',
};

export function isStatusSignatario(value: unknown): value is StatusSignatario {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(STATUS_SIGNATARIO_LABEL, value)
  );
}

// ---------------------------------------------------------------------------
// EstadoExternoContrato — CRM/SAP mirror of the activation state
// ---------------------------------------------------------------------------

/**
 * External (Salesforce/SAP) state of a contract, mirrored read-only by the platform.
 *
 * Safe fallback for unknown values: `EmElaboracao` (no destructive CTA is gated on it).
 *
 * @see apps/api/src/contracts/domain/estado-externo-contrato.enum.ts
 */
export const EstadoExternoContrato = {
  EmElaboracao: 'EM_ELABORACAO',
  Ativo: 'ATIVO',
  AptoParaPagamento: 'APTO_PARA_PAGAMENTO',
  Pendente: 'PENDENTE',
} as const;

export type EstadoExternoContrato =
  (typeof EstadoExternoContrato)[keyof typeof EstadoExternoContrato];

export const ESTADO_EXTERNO_CONTRATO_LABEL: Record<EstadoExternoContrato, string> = {
  [EstadoExternoContrato.EmElaboracao]: 'Em Elaboração',
  [EstadoExternoContrato.Ativo]: 'Ativo',
  [EstadoExternoContrato.AptoParaPagamento]: 'Apto para Pagamento',
  [EstadoExternoContrato.Pendente]: 'Pendente',
};

export function isEstadoExternoContrato(value: unknown): value is EstadoExternoContrato {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(ESTADO_EXTERNO_CONTRATO_LABEL, value)
  );
}

// ---------------------------------------------------------------------------
// ContratoEtapa — lifecycle state of a contract
// ---------------------------------------------------------------------------

/**
 * Lifecycle stages of a contract as delivered by the backend.
 *
 * Machine: EM_MINUTA → EM_REVISAO → APROVADA → EM_ASSINATURA → ASSINADA
 * Terminal: CANCELADA
 *
 * See ADR-0001 §Ciclo do contrato for guards and transitions.
 */
export const ContratoEtapa = {
  EmMinuta: 'EM_MINUTA',
  EmRevisao: 'EM_REVISAO',
  Aprovada: 'APROVADA',
  EmAssinatura: 'EM_ASSINATURA',
  Assinada: 'ASSINADA',
  Cancelada: 'CANCELADA',
} as const;

export type ContratoEtapa = (typeof ContratoEtapa)[keyof typeof ContratoEtapa];

/** pt-BR label for each ContratoEtapa. */
export const CONTRATO_ETAPA_LABEL: Record<ContratoEtapa, string> = {
  [ContratoEtapa.EmMinuta]: 'Em minuta',
  [ContratoEtapa.EmRevisao]: 'Em revisão',
  [ContratoEtapa.Aprovada]: 'Aprovada',
  [ContratoEtapa.EmAssinatura]: 'Em assinatura',
  [ContratoEtapa.Assinada]: 'Assinada',
  [ContratoEtapa.Cancelada]: 'Cancelada',
};

export function isContratoEtapa(value: string): value is ContratoEtapa {
  return Object.prototype.hasOwnProperty.call(CONTRATO_ETAPA_LABEL, value);
}

// ---------------------------------------------------------------------------
// TipoContratoDocumento — template type for the Netlex draft
// ---------------------------------------------------------------------------

/**
 * Template type for the Netlex contract draft.
 *
 * DISTINCT from proposals.TipoContrato (the business contract type on the
 * proposal). These are different enums in different domains — do NOT collapse.
 */
export const TipoContratoDocumento = {
  Cpcvm: 'CPCVM', // Volume total
  Clum: 'CLUM',   // Líquido
  Ccm: 'CCM',     // Misto
} as const;

export type TipoContratoDocumento =
  (typeof TipoContratoDocumento)[keyof typeof TipoContratoDocumento];

export const TIPO_CONTRATO_DOCUMENTO_LABEL: Record<
  TipoContratoDocumento,
  string
> = {
  [TipoContratoDocumento.Cpcvm]: 'CPCVM — Volume Total',
  [TipoContratoDocumento.Clum]: 'CLUM — Líquido',
  [TipoContratoDocumento.Ccm]: 'CCM — Misto',
};

// ---------------------------------------------------------------------------
// MinutaStatus — external draft status from Netlex
// ---------------------------------------------------------------------------

export const MinutaStatus = {
  Generating: 'GENERATING',
  Ready: 'READY',
  Failed: 'FAILED',
  Unknown: 'UNKNOWN',
} as const;

export type MinutaStatus = (typeof MinutaStatus)[keyof typeof MinutaStatus];

// ---------------------------------------------------------------------------
// SignatarioStatus — status of an individual signer in DocuSign
// ---------------------------------------------------------------------------

export const SignatarioStatus = {
  Pending: 'PENDING',
  Sent: 'SENT',
  Delivered: 'DELIVERED',
  Completed: 'COMPLETED',
  Declined: 'DECLINED',
  AuthFailed: 'AUTH_FAILED',
} as const;

export type SignatarioStatus =
  (typeof SignatarioStatus)[keyof typeof SignatarioStatus];

export const SIGNATARIO_STATUS_LABEL: Record<SignatarioStatus, string> = {
  [SignatarioStatus.Pending]: 'Aguardando',
  [SignatarioStatus.Sent]: 'Enviado',
  [SignatarioStatus.Delivered]: 'Visualizado',
  [SignatarioStatus.Completed]: 'Assinado',
  [SignatarioStatus.Declined]: 'Recusado',
  [SignatarioStatus.AuthFailed]: 'Falha de autenticação',
};

// ---------------------------------------------------------------------------
// PapelSignatario — role of each signer in the DocuSign envelope
// ---------------------------------------------------------------------------

/**
 * Role of a signatory in the DocuSign envelope, as returned by the backend.
 *
 * @see apps/api/src/contracts/domain/papel-signatario.enum.ts
 */
export const PapelSignatario = {
  Lt: 'LT',
  Cliente: 'CLIENTE',
  RepresentanteVibra: 'REPRESENTANTE_VIBRA',
  Testemunha: 'TESTEMUNHA',
} as const;

export type PapelSignatario =
  (typeof PapelSignatario)[keyof typeof PapelSignatario];

export const PAPEL_SIGNATARIO_LABEL: Record<PapelSignatario, string> = {
  [PapelSignatario.Lt]: 'LT',
  [PapelSignatario.Cliente]: 'Cliente',
  [PapelSignatario.RepresentanteVibra]: 'Representante Vibra',
  [PapelSignatario.Testemunha]: 'Testemunha',
};

export const PAPEL_SIGNATARIO_HINT: Record<PapelSignatario, string> = {
  [PapelSignatario.Lt]: 'Assina primeiro',
  [PapelSignatario.Cliente]: 'Sócios · e-mails do contrato social',
  [PapelSignatario.RepresentanteVibra]: 'Assina após o cliente',
  [PapelSignatario.Testemunha]: 'Encerram o envelope',
};

export function isPapelSignatario(value: unknown): value is PapelSignatario {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(PAPEL_SIGNATARIO_LABEL, value)
  );
}

// ---------------------------------------------------------------------------
// EnvelopeStatus — overall DocuSign envelope status
// ---------------------------------------------------------------------------

export const EnvelopeStatus = {
  Created: 'CREATED',
  Sent: 'SENT',
  Delivered: 'DELIVERED',
  Completed: 'COMPLETED',
  Declined: 'DECLINED',
  Voided: 'VOIDED',
  Unknown: 'UNKNOWN',
} as const;

export type EnvelopeStatus =
  (typeof EnvelopeStatus)[keyof typeof EnvelopeStatus];

export const ENVELOPE_STATUS_LABEL: Record<EnvelopeStatus, string> = {
  [EnvelopeStatus.Created]: 'Criado',
  [EnvelopeStatus.Sent]: 'Enviado',
  [EnvelopeStatus.Delivered]: 'Visualizado',
  [EnvelopeStatus.Completed]: 'Assinado',
  [EnvelopeStatus.Declined]: 'Recusado',
  [EnvelopeStatus.Voided]: 'Cancelado',
  [EnvelopeStatus.Unknown]: 'Desconhecido',
};

export function isEnvelopeStatus(value: unknown): value is EnvelopeStatus {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(ENVELOPE_STATUS_LABEL, value)
  );
}
