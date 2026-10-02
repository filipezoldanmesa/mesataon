'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { WriteOnly } from '@/components/auth/write-only';
import { ButtonLink } from '@/components/button-link';
import {
  getOpportunityDetail,
  putOpportunityProposals,
} from '@/lib/opportunities/opportunity-detail.data';
import { getScenarioComparison } from '@/lib/opportunities/scenario-comparison.data';
import type { ScenarioComparisonResponse, ScenarioDto } from '@/lib/opportunities/scenario-comparison.types';
import type { OpportunityDetail } from '@/lib/opportunities/types';
import { OpportunityNotFoundError } from '@/lib/opportunities/types';
import { rotaDoApp } from '@/lib/navegacao-segura';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error' | 'not-found';

type Props = {
  opportunityId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  loadOpportunity?: (id: string) => Promise<OpportunityDetail>;
  /** Injectable for tests; defaults to the real API. */
  loadComparison?: (id: string) => Promise<ScenarioComparisonResponse>;
  /** Injectable for tests; defaults to the real BFF client. */
  toggleElect?: (opportunityId: string, proposalIds: string[]) => Promise<OpportunityDetail>;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmtPct(value: number): string {
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function fmtCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtM3(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function fmtYears(value: number): string {
  const formatted = value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${formatted} ${value === 1 ? 'ano' : 'anos'}`;
}

function fmtMonths(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

// ---------------------------------------------------------------------------
// Best-value highlight helpers
// ---------------------------------------------------------------------------

/**
 * Returns the index of the best (highest) numeric value in the array, or -1
 * when there are fewer than 2 non-null values (nothing to compare).
 */
function bestIndex(values: (number | null)[], higherIsBetter = true): number {
  const nums = values.map((v, i) => (v !== null ? { v, i } : null)).filter(Boolean) as {
    v: number;
    i: number;
  }[];
  if (nums.length < 2) return -1;
  const all = nums.every((n) => n.v === nums[0].v);
  if (all) return -1;
  const best = higherIsBetter
    ? nums.reduce((a, b) => (a.v >= b.v ? a : b))
    : nums.reduce((a, b) => (a.v <= b.v ? a : b));
  return best.i;
}

// ---------------------------------------------------------------------------
// Row definition
// ---------------------------------------------------------------------------

type RowDef = {
  key: string;
  label: string;
  /** Extract the raw numeric value from a scenario (used for best comparison). */
  value: (s: ScenarioDto) => number | null;
  /** Format for display. */
  display: (s: ScenarioDto) => string;
  higherIsBetter?: boolean;
};

/**
 * The 13 prototype dimensions in prototype order (02-comparacao-cenarios.html).
 */
function buildRowDefs(): RowDef[] {
  return [
    {
      key: 'tipoContrato',
      label: 'Tipo · contrato',
      value: () => null,
      // Text value — no numeric comparison; format inline.
      display: (s) => (s.tipoProposta && s.tipoContrato ? `${s.tipoProposta} · ${s.tipoContrato}` : '—'),
    },
    {
      key: 'volume',
      label: 'Volume (m³/mês)',
      value: (s) => s.volume,
      display: (s) => (s.volume !== null ? fmtM3(s.volume) : '—'),
    },
    {
      key: 'precoMedio',
      label: 'Preço médio (R$/m³)',
      value: (s) => s.precoMedio,
      display: (s) =>
        s.precoMedio !== null
          ? s.precoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : '—',
    },
    {
      key: 'prazoMeses',
      label: 'Prazo (meses)',
      value: (s) => s.prazoMeses,
      display: (s) => (s.prazoMeses !== null ? fmtMonths(s.prazoMeses) : '—'),
    },
    {
      key: 'receitaPrevista',
      label: 'Receita prevista',
      value: (s) => s.receitaPrevista,
      display: (s) => (s.receitaPrevista !== null ? fmtCurrency(s.receitaPrevista) : '—'),
    },
    {
      key: 'recursosFinanceiros',
      label: 'Recursos financeiros',
      value: (s) => s.recursosFinanceiros,
      display: (s) =>
        s.recursosFinanceiros !== null ? fmtCurrency(s.recursosFinanceiros) : '—',
    },
    {
      key: 'pctAntecipacao',
      label: '% antecipação',
      value: (s) => s.pctAntecipacao,
      display: (s) => (s.pctAntecipacao !== null ? fmtPct(s.pctAntecipacao) : '—'),
    },
    {
      key: 'tir',
      label: 'TIR',
      value: (s) => s.tir,
      display: (s) => {
        if (s.tir === null) return '—';
        const formatted = fmtPct(s.tir);
        return s.indicadorStatus && s.indicadorStatus !== 'atualizado'
          ? `${formatted} *`
          : formatted;
      },
    },
    {
      key: 'vpl',
      label: 'VPL',
      value: (s) => s.vpl,
      display: (s) => {
        if (s.vpl === null) return '—';
        const formatted = fmtCurrency(s.vpl);
        return s.indicadorStatus && s.indicadorStatus !== 'atualizado'
          ? `${formatted} *`
          : formatted;
      },
    },
    {
      key: 'margem',
      label: 'Margem',
      value: (s) => s.margem,
      display: (s) => (s.margem !== null ? fmtM3(s.margem) : '—'),
    },
    {
      key: 'payback',
      label: 'Payback',
      value: (s) => s.payback,
      // Payback: lower is better.
      display: (s) => (s.payback !== null ? fmtYears(s.payback) : '—'),
      higherIsBetter: false,
    },
    {
      key: 'custoVinculacaoUnitario',
      // The unit is in the label because the value is a rate, not an amount:
      // "R$ 8,00" next to a column of totals reads as a total. The prototype
      // carries the BP target here too ("meta R$ 84"); the target is not in this
      // payload, so it is deliberately not implied.
      label: 'Custo vinculação (R$/m³)',
      value: (s) => s.custoVinculacaoUnitario,
      display: (s) =>
        s.custoVinculacaoUnitario !== null ? fmtCurrency(s.custoVinculacaoUnitario) : '—',
      // Lower is better: it is what the proposal costs Vibra per m³ contracted.
      higherIsBetter: false,
    },
    {
      key: 'alcada',
      label: 'Alçada exigida',
      value: () => null,
      display: (s) => s.alcada ?? '—',
    },
  ];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Scenario comparison screen (OPP-F5 — 02-comparacao-cenarios.html).
 *
 * Renders the breadcrumb, page header with ghost "← Voltar" button, and a
 * side-by-side comparison table with the 13 prototype dimensions. Data comes
 * from `GET /v1/opportunities/:id/scenarios/comparison` (VBR-103) via the BFF.
 *
 * Covers 4 states: carregando / vazio (nenhuma proposta) / preenchido / erro.
 */
export function ScenarioComparison({
  opportunityId,
  loadOpportunity = getOpportunityDetail,
  loadComparison = getScenarioComparison,
  toggleElect = putOpportunityProposals,
}: Props) {
  const router = useRouter();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [scenarios, setScenarios] = useState<ScenarioDto[]>([]);
  const [electingId, setElectingId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setStatus('loading');
    setErrorMsg('');

    try {
      const [opportunity, comparison] = await Promise.all([
        loadOpportunity(opportunityId),
        loadComparison(opportunityId),
      ]);

      // Sync the isElected flag from the opportunity's composed set so the
      // table reflects the current election state correctly.
      const elected = new Set(opportunity.proposalIds ?? []);
      setScenarios(
        comparison.scenarios.map((s) => ({ ...s, isElected: elected.has(s.proposalId) })),
      );

      setStatus('loaded');
    } catch (err) {
      if (err instanceof OpportunityNotFoundError) {
        setStatus('not-found');
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Erro ao carregar a comparação de cenários.',
        );
        setStatus('error');
      }
    }
  }, [loadOpportunity, loadComparison, opportunityId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function handleElect(proposalId: string) {
    setElectingId(proposalId);
    try {
      await toggleElect(opportunityId, [proposalId]);
      // Prototype flow (02 → 01b): electing here returns to the fill-in screen
      // with the proposal already elected — the election persisted server-side,
      // so the fill-in reloads it as elected.
      router.push(rotaDoApp('oportunidades', opportunityId));
    } catch {
      // Best-effort — a failed election keeps the user on the comparison screen.
      setElectingId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Shared breadcrumb + header (rendered in every state)
  // ---------------------------------------------------------------------------

  const pageHeader = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-(length:--t-h2) font-bold">Comparação de cenários</h1>
        <ButtonLink href={`/oportunidades/${opportunityId}`} variant="ghost">
          ← Voltar
        </ButtonLink>
      </div>
    </>
  );

  // ---------------------------------------------------------------------------
  // Non-table states
  // ---------------------------------------------------------------------------

  if (status === 'loading') {
    return (
      <div>
        {pageHeader}
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-testid="comparison-loading"
          className="mt-4"
        >
          <span className="sr-only">Carregando comparação de cenários…</span>
          <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        </div>
      </div>
    );
  }

  if (status === 'not-found') {
    return (
      <div>
        {pageHeader}
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-12 text-center"
        >
          <p className="text-(length:--t-h4) font-bold">Oportunidade não encontrada</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div>
        {pageHeader}
        <div
          role="alert"
          className="mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-12 text-center"
        >
          <p className="text-(--color-danger)">{errorMsg}</p>
          <button
            type="button"
            onClick={() => void fetchAll()}
            className="mt-3 cursor-pointer font-bold text-(--secondary-600) hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (scenarios.length === 0) {
    return (
      <div>
        {pageHeader}
        <div
          data-testid="comparison-empty"
          className="mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-12 text-center text-(length:--t-caption) text-(--color-text-muted)"
        >
          Nenhuma proposta associada a esta oportunidade para comparar.
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Table state
  // ---------------------------------------------------------------------------

  const rowDefs = buildRowDefs();

  const hasStaleIndicators = scenarios.some(
    (s) => s.indicadorStatus !== null && s.indicadorStatus !== 'atualizado',
  );

  return (
    <div>
      {pageHeader}
      <div className="mt-4" data-testid="comparison-table">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse overflow-hidden rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface)">
            <colgroup>
              <col style={{ width: '22%' }} />
              {scenarios.map((s) => (
                <col key={s.proposalId} />
              ))}
            </colgroup>
            <tbody>
              {/* Header row — scenario code/title/group */}
              <tr>
                <td className="border-b border-(--color-border) p-3.5" />
                {scenarios.map((s) => (
                  <td key={s.proposalId} className="border-b border-(--color-border) p-3.5 align-top">
                    <div className="text-(length:--t-body) font-bold">
                      {s.codigo ?? s.proposalId}
                    </div>
                    <div className="mt-0.5 text-(length:--t-small) text-(--color-text-muted)">
                      {s.tipoProposta}
                    </div>
                    {s.isElected && (
                      <span className="mt-1 inline-flex items-center rounded-full bg-(--secondary-100) px-2 py-0.5 text-(length:--t-small) font-bold text-(--secondary-600)">
                        ★ Eleita
                      </span>
                    )}
                  </td>
                ))}
              </tr>

              {/* 13 dimension rows */}
              {rowDefs.map((row, rowIdx) => {
                const isAlt = rowIdx % 2 !== 0;
                const values = scenarios.map((s) => row.value(s));
                // Only highlight numeric rows (tipoContrato / alcada are text-only).
                const canHighlight = values.some((v) => v !== null);
                const best = canHighlight
                  ? bestIndex(values, row.higherIsBetter ?? true)
                  : -1;

                return (
                  <tr
                    key={row.key}
                    className={isAlt ? 'bg-(--neutral-25)' : undefined}
                    data-testid={`row-${row.key}`}
                  >
                    <td className="border-b border-(--color-border) p-3.5 text-(length:--t-caption) text-(--color-text-muted)">
                      {row.label}
                    </td>
                    {scenarios.map((s, colIdx) => {
                      const isBest = best === colIdx;
                      return (
                        <td
                          key={s.proposalId}
                          className={`border-b border-(--color-border) p-3.5 text-(length:--t-caption)${isBest ? ' font-bold text-(--secondary-600)' : ''}`}
                        >
                          {isBest ? `✓ ${row.display(s)}` : row.display(s)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Elect action row */}
              <tr>
                <td className="p-3.5" />
                {scenarios.map((s) => (
                  <td key={s.proposalId} className="p-3.5">
                    {/* Electing a scenario is a write (PUT .../proposals) — hidden for a
                        read-only profile, whose click only earned a 403. */}
                    <WriteOnly>
                      <button
                        type="button"
                        onClick={() => void handleElect(s.proposalId)}
                        disabled={electingId === s.proposalId}
                        aria-pressed={s.isElected}
                        className={`w-full cursor-pointer rounded-[var(--radius-xxs)] border px-3 py-1.5 text-(length:--t-caption) font-bold transition disabled:opacity-40 ${
                          s.isElected
                            ? 'border-(--secondary-600) bg-(--secondary-100) text-(--secondary-600)'
                            : 'border-(--secondary-500) bg-(--neutral-25) text-(--secondary-500) hover:bg-(--neutral-50)'
                        }`}
                      >
                        {s.isElected ? '★ Eleita' : 'Eleger'}
                      </button>
                    </WriteOnly>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {hasStaleIndicators && (
        <p
          data-testid="stale-indicators-footnote"
          className="mt-2 text-(length:--t-small) text-(--color-text-muted)"
        >
          * Indicadores (TIR/VPL) do último cálculo disponível — não refletem os valores atuais.
          Recalcule a proposta para obter dados definitivos.
        </p>
      )}
    </div>
  );
}
