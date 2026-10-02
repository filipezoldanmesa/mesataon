'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  getOpportunityDetail as defaultLoad,
} from '@/lib/opportunities/opportunity-detail.data';
import type { OpportunityDetail } from '@/lib/opportunities/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  opportunityId: string;
  /** Injectable for tests; defaults to the real BFF API call. */
  load?: (id: string) => Promise<OpportunityDetail>;
};

// ---------------------------------------------------------------------------
// AnalisePageHeader
// ---------------------------------------------------------------------------

/**
 * Renders the breadcrumb **and** the phase header top section for the Análise
 * page (`/oportunidades/[id]/analise`).
 *
 * Fetches the opportunity code client-side (same pattern as
 * `ProposalOpportunityHeader`) so that the breadcrumb and the subtitle
 * `<code> · Fase 2` both show the business code (e.g. `OPP-0428`) instead of
 * the raw UUID from the route.  Falls back to the uppercased UUID when the
 * code is unavailable.
 *
 * @example
 * <AnalisePageHeader opportunityId={id} />
 */
export function AnalisePageHeader({ opportunityId, load = defaultLoad }: Props) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    load(opportunityId)
      .then((opp) => {
        if (!cancelled) setCode(opp.code ?? null);
      })
      .catch(() => {
        // Fall back silently — the page still renders with the UUID.
      });
    return () => {
      cancelled = true;
    };
  }, [opportunityId, load]);

  const label = code ?? opportunityId.toUpperCase();

  return (
    <>
      {/* Phase header */}
      <div className="mt-2 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-(--color-info-bg) px-2.5 py-0.5 text-[12px] font-bold text-(--color-info)">
                Em análise
              </span>
            </div>
            <h1 className="mt-1.5 text-(length:--t-h3) font-bold">
              Análise da oportunidade
            </h1>
            <p
              data-testid="analise-phase-subtitle"
              className="text-(length:--t-caption) text-(--color-text-muted)"
            >
              {label} · Fase 2
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/oportunidades/${opportunityId}`}
              className="inline-flex cursor-pointer items-center rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-white px-3 py-1.5 text-(length:--t-caption) font-bold hover:bg-(--neutral-40)"
            >
              ← Voltar à oportunidade
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
