'use client';

import Link from 'next/link';

import type { PipelinePhase } from '@/lib/dashboard/pipeline-types';
import type { OpportunityStatus } from '@/lib/opportunities/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** pt-BR labels for each UI-level status (mirrors prototype .phases boxes). */
const STATUS_LABEL: Record<OpportunityStatus, string> = {
  preenchimento: 'Em preenchimento',
  'análise': 'Em análise',
  'aprovação': 'Em aprovação',
  contrato: 'Contrato',
  'concluída': 'Concluídas',
};

/** All 7 workflow phases shown in the prototype (some collapse into UI columns).
 *  These are the backend-level fase values used as `status` query params. */
const ALL_UI_STATUSES: OpportunityStatus[] = [
  'preenchimento',
  'análise',
  'aprovação',
  'contrato',
  'concluída',
];

/**
 * Prototype `.phases` grid: `repeat(7,1fr)`, collapsing to 4 below 980px and 2
 * below 768px (lines 48, 66, 67).  We render the 5 UI-level statuses the
 * backend actually produces, so the wide track is `repeat(5,1fr)`.
 */
const GRID = 'grid grid-cols-2 gap-2 min-[769px]:grid-cols-3 min-[981px]:grid-cols-5';

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando pipeline…"
      className={GRID}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-[64px] animate-pulse rounded-(--radius-xs) bg-(--neutral-100)"
        />
      ))}
    </div>
  );
}

function ErrorState({ fonte }: { fonte: string }) {
  return (
    <p className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Falha ao carregar pipeline de{' '}
      <span className="font-bold">{fonte}</span>. Tente novamente mais tarde.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Phase box
// ---------------------------------------------------------------------------

type PhaseBoxProps = {
  status: OpportunityStatus;
  total: number;
};

/**
 * One phase box — mirrors the prototype `.phases .phase` element.
 * Links to `/oportunidades?status=<fase>` (CA-4).
 */
function PhaseBox({ status, total }: PhaseBoxProps) {
  const label = STATUS_LABEL[status];
  const href = `/oportunidades?status=${encodeURIComponent(status)}`;

  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-center gap-1 rounded-(--radius-xs) border border-(--color-border) bg-(--color-surface) px-2 py-3 text-center hover:border-(--secondary-500) hover:bg-(--secondary-100)"
    >
      {/* Count — large bold number */}
      <b className="block text-(length:--t-h3) font-bold leading-none">{total}</b>
      {/* Label — small muted */}
      <span className="text-(length:--t-small) text-(--color-text-muted) group-hover:text-(--secondary-700)">
        {label}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** Loading state — renders skeleton placeholders. */
  loading?: boolean;
  /**
   * Phase entries from the pipeline section.
   * Pass `null` when the backend section is degraded.
   * Pass `undefined` or `[]` when not yet loaded.
   */
  phases?: PipelinePhase[] | null;
  /**
   * Integration name for the error state (CA-5).
   * Defaults to `"pipeline"`.
   */
  errorFonte?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Pipeline phase boxes (DASH-F2 · HU-03.1 / RN-F2-01).
 *
 * Mirrors the prototype `.phases` grid (01-visao-geral.html lines 140–148):
 * one box per UI-level column (preenchimento → concluída), each linking to the
 * filtered opportunity list (CA-4).  The "Exibir no quadro ›" link belongs to
 * the card header ({@link PipelineFaseCard}), as in the prototype `.sec-head` —
 * it is not rendered here.
 *
 * Phase data is keyed by `status` (UI-level column).  Missing phases render as
 * 0 — the structure never disappears for an empty scope (RN-F2-01).
 *
 * Tokens:
 *   - card: `--color-surface`, `--color-border`
 *   - hover: `--secondary-500` border + `--secondary-100` fill
 */
export function PipelinePhases({
  loading = false,
  phases,
  errorFonte = 'pipeline',
}: Props) {
  if (loading) return <Loading />;
  if (phases === null) return <ErrorState fonte={errorFonte} />;

  // Build a lookup by status so missing phases default to 0.
  const byStatus = new Map<OpportunityStatus, number>(
    (phases ?? []).map((p) => [p.status, p.total]),
  );

  return (
    <div className={GRID}>
      {ALL_UI_STATUSES.map((status) => (
        <PhaseBox key={status} status={status} total={byStatus.get(status) ?? 0} />
      ))}
    </div>
  );
}
