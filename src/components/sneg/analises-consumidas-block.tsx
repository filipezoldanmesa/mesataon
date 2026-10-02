'use client';

import { useEffect, useRef, useState } from 'react';

import { getDdiResult as defaultGetDdi } from '@/lib/opportunities/ddi.data';
import type { DdiResult } from '@/lib/opportunities/ddi.types';
import { getChecklist as defaultGetChecklist } from '@/lib/documents/documents.data';
import type { ChecklistResult } from '@/lib/documents/types';
import { getOpportunityIndicators as defaultGetIndicators } from '@/lib/opportunities-indicators/opportunity-indicators.data';
import type { OpportunityIndicatorsSnapshot } from '@/lib/opportunities-indicators/types';
import { getPerfilCredito } from '@/lib/perfil-credito/perfil-credito.data';
import { resumoPerfilRisco } from '@/lib/perfil-credito/perfil-risco-resumo';
import type { PerfilRiscoResumo } from '@/lib/perfil-credito/perfil-risco-resumo';
import { StatusPill } from '@/components/status-pill';
import type { PillVariant } from '@/components/status-pill';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemStatus = 'loading' | 'loaded' | 'unavailable';

interface ItemState<T> {
  status: ItemStatus;
  data: T | null;
}

type Props = {
  opportunityId: string;
  /** Injectable for tests. */
  getDdi?: (id: string) => Promise<DdiResult | null>;
  /** Injectable for tests. */
  getChecklist?: (id: string) => Promise<ChecklistResult>;
  /** Injectable for tests. */
  getIndicators?: (id: string) => Promise<OpportunityIndicatorsSnapshot | null>;
  /**
   * Injectable for tests — fetches credit/risk profile (Perfil/Risco Serasa).
   *
   * Devolve o resumo já resolvido por `resumoPerfilRisco`: rótulo COM a
   * pontuação ("Alto · 392" — TC 67624), a cor que o backend publicou, e o
   * motivo do encerramento quando há. `null` = a concessão não exige
   * levantamento (a linha mostra "—").
   */
  getCreditRisk?: (id: string) => Promise<PerfilRiscoResumo | null>;
};

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------

const DDI_RISK_LABEL: Record<string, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

const DDI_RISK_VARIANT: Record<string, PillVariant> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
};

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return (
    (value * 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + '%'
  );
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Row wrapper — separating line + label/value layout */
function AnalysisRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  /*
   * A single cell of the prototype's `.kv` grid: 14px uppercase muted label
   * (`.kv .l`) above a `--t-caption` bold value (`.kv .v`). The 1fr/1fr grid is
   * the parent, so the four analyses read as two rows of two — as in
   * `04-analise-sneg.html`, not as a stacked list.
   */
  return (
    <div>
      <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="mt-0.5 text-(length:--t-caption) font-bold">{children}</div>
    </div>
  );
}

/** Loading skeleton inside a row */
function RowLoading() {
  return <span className="h-4 w-20 animate-pulse rounded bg-(--neutral-100)" />;
}

/** Unavailable indicator — shown when the upstream source fails */
function RowUnavailable() {
  return (
    <span
      className="inline-flex items-center rounded-full bg-(--neutral-60) px-2 py-0.5 text-[11px] font-bold text-(--neutral-700)"
      data-testid="unavailable-pill"
    >
      Indisponível
    </span>
  );
}

// ---------------------------------------------------------------------------
// Default credit risk loader (Perfil/Risco read model — GAR-4/VBR-329)
// ---------------------------------------------------------------------------

/**
 * Delega ao predicado único (ADO 67983) — `null` = a concessão não exige
 * levantamento (a linha mostra "—").
 *
 * Era a terceira cópia da mesma derivação, e como as outras duas jogava fora a
 * PONTUAÇÃO que o TC 67624 exige e o motivo do encerramento. Ver
 * `resumoPerfilRisco`.
 */
async function defaultGetCreditRisk(
  id: string,
): Promise<PerfilRiscoResumo | null> {
  return resumoPerfilRisco(await getPerfilCredito(id));
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * "Análises consumidas" block — SNEG F2 (VBR-255).
 *
 * Four read-only items, each loaded from an independent upstream source.
 * A source failure makes only that item show "Indisponível" — the others
 * continue normally (isolated degradation, matching the SectionResult pattern
 * from the Visão 360º).
 *
 *   - DDI (Integridade)        — from GET /api/opportunities/:id/ddi
 *   - Perfil / Risco (Serasa)  — from credit risk module (VBR-247/250)
 *   - Documentação validada (Hub) — from GET /api/opportunities/:id/checklist
 *   - TIR / VPL (ARP)          — from GET /api/opportunities/:id/indicators
 */
export function AnalisesConsumidasBlock({
  opportunityId,
  getDdi = defaultGetDdi,
  getChecklist = defaultGetChecklist,
  getIndicators = defaultGetIndicators,
  getCreditRisk = defaultGetCreditRisk,
}: Props) {
  const [ddiState, setDdiState] = useState<ItemState<DdiResult>>({
    status: 'loading',
    data: null,
  });
  const [checklistState, setChecklistState] = useState<ItemState<ChecklistResult>>({
    status: 'loading',
    data: null,
  });
  const [indicatorsState, setIndicatorsState] = useState<ItemState<OpportunityIndicatorsSnapshot>>({
    status: 'loading',
    data: null,
  });
  const [creditRiskState, setCreditRiskState] = useState<
    ItemState<PerfilRiscoResumo>
  >({ status: 'loading', data: null });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    // DDI — isolated failure
    getDdi(opportunityId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setDdiState({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setDdiState({ status: 'unavailable', data: null });
      });

    // Checklist / documentação — isolated failure
    getChecklist(opportunityId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setChecklistState({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setChecklistState({ status: 'unavailable', data: null });
      });

    // Indicators / TIR+VPL — isolated failure
    getIndicators(opportunityId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        // null = never calculated (204)
        setIndicatorsState({ status: 'loaded', data: data ?? null });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setIndicatorsState({ status: 'unavailable', data: null });
      });

    // Credit risk (Perfil/Risco Serasa) — isolated failure
    getCreditRisk(opportunityId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setCreditRiskState({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setCreditRiskState({ status: 'unavailable', data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [opportunityId, getDdi, getChecklist, getIndicators, getCreditRisk]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  // DDI effective risk (considering reclassification)
  const ddi = ddiState.data;
  const ddiEffectiveRisk = ddi?.reclassification?.reclassifiedTo ?? ddi?.riskLevel;

  // Documentação progress — count validados / total required
  const checklist = checklistState.data;
  const requiredDocs = checklist?.docs?.filter((d) => d.required) ?? [];
  const validatedDocs = requiredDocs.filter((d) => d.status === 'validado');
  const pendingDocs = requiredDocs.length - validatedDocs.length;
  const docPill =
    checklist
      ? `${validatedDocs.length}/${requiredDocs.length} · ${pendingDocs} pendente${pendingDocs !== 1 ? 's' : ''}`
      : null;
  const docPillVariant: PillVariant = pendingDocs > 0 ? 'warning' : 'success';

  // Indicators
  const snap = indicatorsState.data;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section
      aria-labelledby="analises-consumidas-title"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      <h2 id="analises-consumidas-title" className="mb-3 text-(length:--t-h4) font-bold">
        Análises consumidas
      </h2>

      {/* `.kv` — grid 1fr 1fr, gap 12px 24px (1 column below 961px) */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 min-[961px]:grid-cols-2">
        {/* DDI (Integridade) */}
        <AnalysisRow label="DDI (Integridade)">
          {ddiState.status === 'loading' && <RowLoading />}
          {ddiState.status === 'unavailable' && (
            <RowUnavailable />
          )}
          {ddiState.status === 'loaded' && (
            <span className="flex items-center gap-2" data-testid="ddi-item">
              {ddiEffectiveRisk ? (
                <StatusPill variant={DDI_RISK_VARIANT[ddiEffectiveRisk] ?? 'neutral'}>
                  {DDI_RISK_LABEL[ddiEffectiveRisk] ?? ddiEffectiveRisk}
                </StatusPill>
              ) : (
                <StatusPill variant="neutral">
                  {ddi?.status === 'in_progress' ? 'Em andamento' : 'Não elegível'}
                </StatusPill>
              )}
              {ddi?.score !== null && ddi?.score !== undefined && (
                <span className="text-(length:--t-small) text-(--color-text-muted)">
                  score {ddi.score}/100
                </span>
              )}
            </span>
          )}
        </AnalysisRow>

        {/* Perfil / Risco (Serasa) */}
        <AnalysisRow label="Perfil / Risco (Serasa)">
          {creditRiskState.status === 'loading' && <RowLoading />}
          {creditRiskState.status === 'unavailable' && (
            <RowUnavailable />
          )}
          {creditRiskState.status === 'loaded' && (
            <span
              data-testid="credit-risk-item"
              className="inline-flex flex-col items-end gap-0.5"
            >
              {creditRiskState.data ? (
                <>
                  {/*
                    * Texto e cor vêm de `resumoPerfilRisco` — inclusive a
                    * PONTUAÇÃO (ADO 67983 / TC 67624). O `CREDIT_RISK_VARIANT`
                    * local saiu junto: era um mapa por RÓTULO ("Baixo" →
                    * success), que nunca casaria "Baixo · 812" e ainda punha a
                    * cor na tela em vez de no read model (RN-F0-03).
                    */}
                  <StatusPill variant={creditRiskState.data.variant}>
                    {creditRiskState.data.label}
                  </StatusPill>
                  {creditRiskState.data.detalhe && (
                    <span
                      data-testid="credit-risk-motivo"
                      className="text-(length:--t-small) text-(--color-text-muted)"
                    >
                      {creditRiskState.data.detalhe}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-(--color-text-muted)">—</span>
              )}
            </span>
          )}
        </AnalysisRow>

        {/* Documentação validada (Hub) — the ratio counts `validado` (VBR-635 §1). */}
        <AnalysisRow label="Documentação validada (Hub)">
          {checklistState.status === 'loading' && <RowLoading />}
          {checklistState.status === 'unavailable' && (
            <RowUnavailable />
          )}
          {checklistState.status === 'loaded' && (
            <span data-testid="docs-item">
              {docPill ? (
                <StatusPill variant={docPillVariant}>{docPill}</StatusPill>
              ) : (
                <span className="text-(--color-text-muted)">—</span>
              )}
            </span>
          )}
        </AnalysisRow>

        {/* TIR / VPL (ARP) */}
        <AnalysisRow label="TIR / VPL (ARP)">
          {indicatorsState.status === 'loading' && <RowLoading />}
          {indicatorsState.status === 'unavailable' && (
            <RowUnavailable />
          )}
          {indicatorsState.status === 'loaded' && (
            <span data-testid="tir-vpl-item">
              {snap ? (
                <>
                  TIR {formatPercent(snap.tir)} · VPL {formatCurrency(snap.vpl)}
                </>
              ) : (
                <span className="text-(--color-text-muted)">Não calculado</span>
              )}
            </span>
          )}
        </AnalysisRow>
      </div>
    </section>
  );
}
