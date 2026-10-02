import type { OpportunityStatus } from '@/lib/opportunities/types';

/**
 * One phase entry as returned by the BFF `/api/dashboard/pipeline` route.
 *
 * The BFF aggregates multiple backend workflow states that share the same UI
 * status (e.g. EM_MINUTA / EM_ASSINATURA / EM_PAGAMENTO → `contrato`) and
 * exposes a weighted-average permanence per UI-level column.
 *
 * (DASH-F2 / VBR-427)
 */
export interface PipelinePhase {
  /** UI canonical status — matches a `KanbanBoard` column key. */
  status: OpportunityStatus;
  /** Total opportunities currently in this UI-level phase. */
  total: number;
  /**
   * Weighted-average permanence in days for this phase.
   * `null` when no opportunity in the phase has a recorded stage-period start
   * date — absent data is never expressed as zero (CA-3).
   */
  avgPermanenciaDias: number | null;
}

/**
 * Operational KPIs for the pipeline dashboard (DASH-F2 / RN-F2-02).
 *
 * - `valorPipeline` and `ticketMedio` are **measures** (ADR-0018) — they use a
 *   neutral presentation, never traffic-light colouring.
 * - `ticketMedio: null` means "no sample / no VPL calculated" — **never** display
 *   as "R$ 0,00" (CA-2).
 * - Both monetary fields are backend-serialised decimal strings (e.g. `"187000000.00"`);
 *   the front-end formats them via `formatCompactBRL`.
 */
export interface PipelineKpis {
  /** Open or in-progress pending tasks in scope — **verdict** (shown with `.crit` border). */
  pendenciasAbertas: number;
  /** Opportunities currently in EM_APROVACAO state. */
  emAprovacao: number;
  /** Opportunities currently in EM_ASSINATURA state — **verdict** (shown with `.warn` border). */
  aguardandoAssinatura: number;
  /** Sum of VPL values (decimal string). Measure — neutral presentation. */
  valorPipeline: string;
  /**
   * Average VPL (decimal string). Measure — neutral presentation.
   * `null` when no opportunity has a calculated VPL — absent data ≠ zero.
   */
  ticketMedio: string | null;
  /** Total opportunities in scope (all states). */
  totalOportunidades: number;
  /**
   * How many of those have a calculated VPL — the denominator of
   * {@link ticketMedio} and the set that actually sums into `valorPipeline`.
   * Never assume it equals `totalOportunidades` (VBR-645).
   */
  oportunidadesComValor: number;
}

/**
 * One row in the "Principais por valor" table (DASH-F2 / RN-F2-01).
 *
 * `valor` is a backend-serialised decimal string; `null` when ARP has not
 * yet calculated the VPL for this opportunity.
 */
export interface TopOportunidade {
  id: string;
  code: string | null;
  customerName: string | null;
  titulo: string | null;
  /** Machine value (`EM_ANALISE`) — for sorting/logic, never for display. */
  fase: string;
  /**
   * pt-BR label of the fase, produced by the backend
   * (`OPPORTUNITY_STATE_LABEL`). The table used to render `fase`, so the "FASE"
   * column printed `EM_ANALISE`.
   */
  faseLabel: string;
  responsavelNome: string | null;
  /** VPL decimal string (e.g. `"12500000.00"`); `null` when not yet calculated. */
  valor: string | null;
}

/** Shape returned by `GET /api/dashboard/pipeline`. */
export interface PipelineData {
  phases: PipelinePhase[];
  /**
   * Operational KPIs. `null` when the backend section is degraded (a `gaps`
   * entry names the source).  The KPI grade card shows an error state naming
   * the source.
   */
  kpis: PipelineKpis | null;
  /**
   * Top opportunities by value. `null` when the backend section is degraded.
   * Sorting by columns other than value is performed client-side on this list.
   */
  principaisPorValor: TopOportunidade[] | null;
}
