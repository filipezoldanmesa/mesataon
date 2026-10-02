import type { TipoContrato } from '@/lib/picklists/salesforce-values';

import type { ProposalFinalidade } from './proposal.types';

export type { ProposalFinalidade };

/**
 * Proposal contract type — `Quote.Tipo_De_Contrato__c`.
 *
 * The previous `'CPCVM' | 'CLUM'` union was neither the picklist nor even valid
 * Salesforce values: the real set has 65 members and the two the MVP used map to
 * `CPCVM Volume` and `CLUM Liquido`. Only 11 are reachable from a given
 * `Tipo_de_Proposta__c` — render options from
 * `GET /api/picklists/quote-tipo-contrato?controllingValue=<tipoProposta>`.
 */
export type ProposalContractType = TipoContrato;

/**
 * Payload for `POST /v1/opportunities/:opportunityId/proposals` (F3).
 * Mirrors the backend `CreateProposalDto` exactly — the global ValidationPipe
 * rejects unknown fields (`forbidNonWhitelisted`), so this must NOT carry any
 * extra keys. The proposal type is always "PCR" (fixed by business rule) and
 * is set by the backend, so it is not sent here.
 *
 * Note: horizonte de vendas e datas de consumo pertencem ao bloco de Produtos
 * (F5), não à criação (F3) — por isso não fazem parte deste payload.
 */
export interface CreateProposalPayload {
  opportunityId: string;
  tipoContrato: ProposalContractType;
  finalidade: ProposalFinalidade;
  /** ISO-8601 date, e.g. "2026-08-01". */
  dataInicioAnalise: string;
  /** ISO-8601 date, must be ≥ dataInicioAnalise. */
  dataFimAnalise: string;
  possuiInvestimentos: boolean;
  /** Adesão ao Programa Acelera+ (backend: `aceleraMais`). */
  aceleraMais: boolean;
  /**
   * Referência do posto (Código SAP) — usada para validar o status do posto na
   * rede (HU-04.2): posto já ATIVO ⇒ 409. Vem do SAP do cliente da oportunidade.
   */
  postoRef: string;
}

/**
 * Successful response of `POST /v1/opportunities/:opportunityId/proposals`.
 *
 * API Contract (VBR-84 épico F3 — "Criação da proposta"):
 *
 *   POST /v1/opportunities/{opportunityId}/proposals
 *   Request:  CreateProposalPayload
 *   Response 201: CreateProposalResult
 *   Response 409: { code: "POSTO_JA_ATIVO" }   → ProposalAlreadyActiveError
 *   Response 503: { code: "..." }              → ProposalServiceUnavailableError
 */
export interface CreateProposalResult {
  id: string;
  /** Display code, e.g. "P-1115". */
  code: string;
  /**
   * True when Acelera+ = No — the proposal will require manager approval
   * before proceeding (HU-04 / Alerta Acelera+).
   */
  requiresManagerApproval: boolean;
}

/**
 * 409 — the posto is already Active on the network.
 * The flow cannot proceed (HU-04.2).
 *
 * `message` defaults to a generic sentence but the caller SHOULD pass the
 * backend's own — it names the date the posto entered the network ("… desde
 * 11/01/2011"), which is exactly what the LT takes to the Gestor do Mapa da Rede.
 */
export class ProposalAlreadyActiveError extends Error {
  constructor(
    message = 'Este posto já está ativo na rede Vibra. Não é possível criar uma nova proposta para ele.',
  ) {
    super(message);
    this.name = 'ProposalAlreadyActiveError';
  }
}

/**
 * 503 — the backend status service is unavailable (HU-04.2).
 */
export class ProposalServiceUnavailableError extends Error {
  constructor(
    message = 'Serviço de criação de proposta temporariamente indisponível. Tente novamente mais tarde.',
  ) {
    super(message);
    this.name = 'ProposalServiceUnavailableError';
  }
}

/**
 * Server-derived date limits for the Nova Proposta form (RN-F5-04), read from
 * `GET /api/proposals/date-constraints`.
 *
 * NEVER computed on the client: the limit is a function of the API's clock and is
 * the same rule `POST .../proposals` enforces. A local copy would silently
 * disagree with the API on the 1st of every month.
 */
export interface ProposalDateConstraints {
  /**
   * Menor `dataInicioAnalise` aceita pelo CRM (ISO `YYYY-MM-DD`) — 1º dia do mês
   * seguinte. Regra do org (`Data_Inicio_Analise_Mes_Seguite_Criacao`), que
   * recusa o insert da Quote no acionamento da alçada quando a análise começa
   * antes disso. Sempre do servidor: o limite muda na virada do mês.
   */
  minDataInicioAnalise: string;
  /** Menor `dataFimAnalise` aceita (ISO `YYYY-MM-DD`). */
  minDataFimAnalise: string;
  /** 1º dia do mês subsequente — o motivo do limite existir. */
  inicioConsumo: string;
}
