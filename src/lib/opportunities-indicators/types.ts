/**
 * F7 — Indicadores econômicos consolidados da oportunidade (OPP-F7, épico
 * VBR-112) e por proposta/cenário (consumidos pela comparação de cenários,
 * OPP-F5).
 *
 * API Contract — opportunity-level (VBR-112 épico / VBR-117 BE):
 *
 *   GET  /v1/opportunities/{id}/indicators             → 200 | 204 | 404
 *   POST /v1/opportunities/{id}/indicators:recalculate  → 200 | 400 | 404 | 409 | 503
 *
 * API Contract — proposal-level (mesmo épico F7, RN-F7-01/03/05/06 — dona:
 * VBR-114 [BE] / esta issue [FE]):
 *
 *   GET  /v1/proposals/{id}/indicators             → 200 | 204 | 404
 *   POST /v1/proposals/{id}/indicators:recalculate  → 200 | 400 | 404 | 409 | 503
 *
 * 204 significa "nunca calculado" em ambos os casos.
 *
 * **O cálculo é assíncrono (VBR-401).** O 200 do recálculo NÃO traz o resultado:
 * o ARP responde 202 "Processando" ao aceitar o pedido, e o backend devolve o
 * snapshot com `status: "em_calculo"` — os números continuam sendo os do cálculo
 * anterior até o callback chegar. Por isso 503 voltou a significar apenas falha
 * genuína (transporte/timeout/5xx), caso em que o snapshot anterior NÃO é
 * promovido a definitivo (HU-13.2); e 409 significa que já existe um cálculo em
 * andamento para o mesmo alvo (a guarda anti-disparo concorrente do backend).
 *
 * O status muda para "desatualizado" quando um parâmetro financeiro da proposta
 * é alterado após o último cálculo (HU-12.1) — regra do backend; edição
 * não-financeira não afeta o status (HU-12.2).
 */

/**
 * Lifecycle status shared by both proposal and opportunity indicator snapshots.
 * Defined — with its pt-BR labels, pill variants and type guard — in
 * {@link ./indicator-status}, and re-exported here so the snapshot types and
 * the status vocabulary keep arriving from a single import.
 */
import type { IndicatorStatus } from './indicator-status';

export {
  INDICATOR_STATUS_LABEL,
  INDICATOR_STATUS_PILL_VARIANT,
  IndicatorStatus,
  isIndicatorStatus,
  narrowIndicatorStatus,
} from './indicator-status';

/**
 * Consolidated economic indicators snapshot for an opportunity
 * (`OpportunityIndicatorsDto` on the backend). Only the **selected** proposals
 * (`opportunity.proposalIds`) contribute to this snapshot (RN-F7-02).
 */
export interface OpportunityIndicatorsSnapshot {
  id: string;
  opportunityId: string;
  status: IndicatorStatus;
  tir: number | null; // decimal, e.g. 0.18 = 18%
  vpl: number | null; // BRL
  tma: number | null; // percentage, e.g. 11.05 = 11.05% a.a.
  rsPorM3: number | null;
  margemEbitda: number | null; // decimal
  margemMedia: number | null; // decimal
  indicadorRentabilidade: number | null;
  percentualAntecipacao: number | null; // decimal
  comprometimento: number | null;
  consolidatedProposalIds: string[] | null;
  calculadoEm: string | null; // ISO-8601
  /**
   * Motivo do status `indisponivel` — a mensagem que o ARP devolveu ao recusar
   * o cálculo, ou a frase de expiração quando ele não respondeu.
   *
   * `null` não é "deu certo": também é linha anterior à coluna. A tela só
   * renderiza o motivo quando ele existe — um rótulo "Motivo:" vazio leria como
   * dado que a tela falhou em carregar.
   */
  mensagemErro: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Economic indicators snapshot for a single proposal/cenário
 * (`ProposalIndicatorsDto` on the backend). Consumed by the scenario
 * comparison screen (OPP-F5) to fill the TIR/VPL rows per proposal.
 */
export interface ProposalIndicatorsSnapshot {
  id: string;
  proposalId: string;
  status: IndicatorStatus;
  tir: number | null;
  vpl: number | null;
  tma: number | null;
  rsPorM3: number | null;
  margemEbitda: number | null;
  margemMedia: number | null;
  indicadorRentabilidade: number | null;
  percentualAntecipacao: number | null;
  comprometimento: number | null;
  /**
   * Payback (anos). NÃO faz parte do contrato atual do backend
   * (`ProposalIndicatorsDto`, OPP-F7/VBR-117) — mantido opcional para que a
   * comparação de cenários já renderize a linha assim que o backend
   * disponibilizar o campo, sem outra mudança de frontend. Renderiza '—'
   * enquanto ausente.
   */
  payback?: number | null;
  calculadoEm: string | null;
  /**
   * Motivo do status `indisponivel` — a mensagem que o ARP devolveu ao recusar
   * o cálculo, ou a frase de expiração quando ele não respondeu.
   *
   * `null` não é "deu certo": também é linha anterior à coluna. A tela só
   * renderiza o motivo quando ele existe — um rótulo "Motivo:" vazio leria como
   * dado que a tela falhou em carregar.
   */
  mensagemErro: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Thrown when the ARP (profitability service) is unavailable during a
 * consolidated recalculation (HTTP 503, HU-13.2). The previous snapshot is
 * NOT promoted as definitive — callers must surface a distinct "indisponível"
 * status rather than silently keeping the old values as current.
 */
export class ArpUnavailableError extends Error {
  constructor() {
    super(
      'O serviço de rentabilidade (ARP) está temporariamente indisponível. Tente novamente em instantes.',
    );
    this.name = 'ArpUnavailableError';
  }
}

/**
 * Thrown when a recalculation is requested while one is already in flight for
 * the same target (HTTP 409 — the backend's concurrent-dispatch guard, VBR-401).
 *
 * Typed apart from a generic failure because **nothing went wrong**: a
 * calculation is running and its result is on the way. The screen must say that
 * and wait, not offer a retry that would 409 again.
 */
export class IndicatorsCalculationInProgressError extends Error {
  constructor() {
    super('Já existe um cálculo em andamento. Aguarde o resultado antes de recalcular.');
    this.name = 'IndicatorsCalculationInProgressError';
  }
}

/**
 * Thrown when the opportunity has no selected proposals or no volume to
 * calculate (HTTP 400).
 *
 * ⚠️ `motivo` é a frase do BACKEND, e ela vence a genérica sempre que existir.
 * O 400 deste endpoint não tem uma causa só: além das propostas eleitas e do
 * volume, ele recusa o investimento sem Descrição (ADO 68425), e a frase fixa
 * mandava o usuário mexer em produto quando o problema estava noutro card.
 */
export class NoProposalsSelectedError extends Error {
  constructor(motivo?: string) {
    super(
      motivo?.trim() ||
        'Selecione ao menos uma proposta com volume para calcular os indicadores consolidados.',
    );
    this.name = 'NoProposalsSelectedError';
  }
}

/** Thrown when an opportunity id returns 404 from the indicators endpoints. */
export class OpportunityNotFoundForIndicatorsError extends Error {
  constructor(readonly opportunityId: string) {
    super(`Oportunidade não encontrada: ${opportunityId}`);
    this.name = 'OpportunityNotFoundForIndicatorsError';
  }
}

/** Thrown when a proposal id returns 404 from the proposal indicators endpoint. */
export class ProposalNotFoundForIndicatorsError extends Error {
  constructor(readonly proposalId: string) {
    super(`Proposta não encontrada: ${proposalId}`);
    this.name = 'ProposalNotFoundForIndicatorsError';
  }
}

/**
 * Thrown when the backend refuses the calculation with HTTP 400 — por padrão a
 * pré-condição F5/F6 do PRD §7.7 (proposta sem produtos e/ou recursos
 * financeiros), mas não só ela.
 *
 * ⚠️ `motivo` é a frase do BACKEND e vence a genérica. Desde o ADO 68425 o
 * mesmo 400 também recusa investimento sem Descrição (o ARP derruba a simulação
 * inteira por causa dele, e sem dizer por quê). Fixar a frase aqui mandava o LT
 * conferir produtos e recursos enquanto o conserto estava no card de
 * Investimentos, sem nada na tela apontando para lá.
 */
export class ProposalNotReadyForIndicatorsError extends Error {
  constructor(motivo?: string) {
    super(
      motivo?.trim() ||
        'Defina os produtos e os recursos financeiros da proposta antes de calcular os indicadores.',
    );
    this.name = 'ProposalNotReadyForIndicatorsError';
  }
}
