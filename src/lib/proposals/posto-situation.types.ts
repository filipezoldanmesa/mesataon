/**
 * Situação do posto e do imóvel de uma proposta (PRD F4 §7.4, VBR-89).
 * Mirrors the backend enums/DTOs (`apps/api/src/proposals/domain/*-posto*`,
 * `dto/posto-situation*`) — raw values, this module owns the PT-BR labels
 * (see `posto-situation.labels.ts`).
 */

/**
 * The three posto picklists come from the generated Salesforce mirror, not from
 * hand-written unions. The previous unions held this platform's own spellings
 * (`SERVICOS_URBANOS`, `EM_OPERACAO`, `PROPRIA_RAZAO_SOCIAL`) and were missing
 * three of the seven posto types entirely — the mirror is regenerated from the
 * picklist analysis, so it cannot fall behind again.
 *
 * Render options from `GET /api/picklists/posto-*` (labels included); use the
 * named members only where the UI must COMPARE (`SituacaoPosto.AConstruir`).
 */
import {
  PropriedadeImovel,
  SituacaoPosto,
  TipoPosto,
} from '@/lib/picklists/salesforce-values';

// Re-exported so existing imports keep working; each name carries BOTH the
// `as const` object (for named comparisons) and its value union (for types).
export { PropriedadeImovel, SituacaoPosto, TipoPosto };

/** Tipo de contrato de uso do imóvel — só aplicável quando propriedadeImovel=TERCEIRO (RN-F4-02). */
export type TipoContratoUso = 'LOCACAO' | 'ARRENDAMENTO' | 'CONVENIO';

/**
 * Mirror of the backend `BandeiraAnpStatus`
 * (`apps/api/src/proposals/domain/bandeira-anp-status.enum.ts`).
 */
export const BandeiraAnpStatus = {
  /** A ANP respondeu e há bandeira — `bandeiraAnp` está preenchida. */
  Resolvida: 'RESOLVIDA',
  /** A ANP respondeu que este CNPJ não tem registro. Fato de negócio, não falha. */
  SemRegistro: 'SEM_REGISTRO',
  /** Não foi possível consultar. O valor é DESCONHECIDO — nunca renderize como ausência. */
  Indisponivel: 'INDISPONIVEL',
} as const;

export type BandeiraAnpStatus = (typeof BandeiraAnpStatus)[keyof typeof BandeiraAnpStatus];

/**
 * An unknown value degrades to `INDISPONIVEL`, the SAFEST of the three: it
 * claims nothing about the registry. Degrading to `SEM_REGISTRO` would make a
 * value the platform failed to understand read as a confirmed absence.
 */
export function toBandeiraAnpStatus(value: unknown): BandeiraAnpStatus {
  return value === BandeiraAnpStatus.Resolvida || value === BandeiraAnpStatus.SemRegistro
    ? value
    : BandeiraAnpStatus.Indisponivel;
}

/**
 * Mirror of the backend `BandeiraAnpSource`
 * (`apps/api/src/proposals/domain/bandeira-anp-source.enum.ts`, ADR-0041).
 */
export const BandeiraAnpSource = {
  /** Consultada ao vivo na API da ANP. */
  AoVivo: 'AO_VIVO',
  /** Veio do espelho local do cadastro aberto — pode ter alguns dias. */
  CadastroAnp: 'CADASTRO_ANP',
} as const;

export type BandeiraAnpSource = (typeof BandeiraAnpSource)[keyof typeof BandeiraAnpSource];

/**
 * An unrecognized value degrades to `null` — "não sei de onde veio". Guessing
 * `AO_VIVO` would silently claim freshness the payload never asserted.
 */
export function toBandeiraAnpSource(value: unknown): BandeiraAnpSource | null {
  return value === BandeiraAnpSource.AoVivo || value === BandeiraAnpSource.CadastroAnp
    ? value
    : null;
}

/**
 * Situação do posto e do imóvel de uma proposta (F4 §7.4, VBR-89). Recurso
 * singular — no máximo UM por proposta.
 *
 * API contract (VBR-89 BE):
 *
 *   GET /v1/proposals/{id}/posto-situation → 200 PostoSituation | 404 (proposta
 *     não encontrada OU situação ainda não cadastrada) | 503 (ANP indisponível)
 *   PUT /v1/proposals/{id}/posto-situation → 200 PostoSituation | 400 (RN-F4-02)
 *     | 404 | 409 (RN-F4-04/HU-06.1)
 */
export interface PostoSituation {
  id: string;
  proposalId: string;
  /** Referência do posto (Código SAP), usada para consultar a bandeira ANP e o status na rede (RN-F4-04). */
  postoRef: string;
  tipoPosto: TipoPosto;
  situacaoPosto: SituacaoPosto;
  /**
   * Bandeira registrada no site da ANP, resolvida ao vivo via `AnpDirectory`
   * (nunca persistida). `null` sozinho é ambíguo — sempre leia junto de
   * {@link PostoSituation.bandeiraAnpStatus}.
   */
  bandeiraAnp: string | null;
  /**
   * Por que `bandeiraAnp` está como está. Existe porque "a ANP não tem
   * registro deste posto" e "não deu para perguntar à ANP" chegavam ambos
   * como `null`, e a tela imprimia o mesmo `—` para os dois — afirmando "sem
   * registro" durante uma indisponibilidade.
   */
  bandeiraAnpStatus: BandeiraAnpStatus;
  /**
   * De onde veio a bandeira (ADR-0041). `null` quando não há bandeira — nomear
   * uma origem para valor ausente sugeriria que algo foi resolvido.
   */
  bandeiraAnpSource: BandeiraAnpSource | null;
  /**
   * Data de publicação do cadastro da ANP (`YYYY-MM-DD`) quando a bandeira veio
   * do espelho; `null` numa consulta ao vivo.
   */
  bandeiraAnpAsOf: string | null;
  /** Bandeira física do posto, informada pelo usuário — pode divergir da `bandeiraAnp`. */
  bandeiraFisica: string;
  propriedadeImovel: PropriedadeImovel;
  /** Só preenchido quando `propriedadeImovel=TERCEIRO` (RN-F4-02). */
  tipoContratoUso: TipoContratoUso | null;
  contratoRenovavel: boolean | null;
  /** Só preenchido (e relevante) quando `contratoRenovavel=true`. */
  prorrogacaoMeses: number | null;
  /** ISO-8601 date. */
  dataInicioUso: string | null;
  /** ISO-8601 date. */
  dataFimUso: string | null;
  /** Críticas não-bloqueantes, ex.: contrato de uso já vencido (RN-F4-03/HU-06.2). */
  criticas: string[];
  createdAt: string;
  updatedAt: string;
}

/** Payload for `PUT /v1/proposals/{id}/posto-situation` — full replace (RN-F4-02). */
export interface UpsertPostoSituationInput {
  tipoPosto: TipoPosto;
  situacaoPosto: SituacaoPosto;
  bandeiraFisica: string;
  propriedadeImovel: PropriedadeImovel;
  /** Obrigatório quando propriedadeImovel=TERCEIRO; omitido caso contrário (RN-F4-02). */
  tipoContratoUso?: TipoContratoUso;
  contratoRenovavel?: boolean;
  /** Só aceito quando contratoRenovavel=true. */
  prorrogacaoMeses?: number;
  dataInicioUso?: string;
  dataFimUso?: string;
}

/** Thrown on 400 — RN-F4-02: inconsistência dos campos de contrato de uso. */
export class PostoSituationValidationError extends Error {
  constructor(message = 'Dados da situação do posto inválidos.') {
    super(message);
    this.name = 'PostoSituationValidationError';
  }
}

/**
 * Thrown on 409 — RN-F4-04/HU-06.1: posto já ATIVO na rede, ou situação do
 * posto incompatível com a finalidade IMPLANTACAO da proposta. Both causes
 * surface the same way to the UI (a blocking, retryable alert in the modal)
 * — the backend's `message` carries the specific reason.
 */
export class PostoActivationConflictError extends Error {
  constructor(message = 'Não é possível registrar esta situação do posto.') {
    super(message);
    this.name = 'PostoActivationConflictError';
  }
}

/** Thrown on 503 (GET only) — ANP indisponível para resolver a bandeira do posto. */
export class AnpUnavailableError extends Error {
  constructor() {
    super('O serviço da ANP está temporariamente indisponível. Tente novamente mais tarde.');
    this.name = 'AnpUnavailableError';
  }
}
