'use client';

import { useEffect, useState } from 'react';

import { getDashboardDevolutivas } from '@/lib/dashboard/devolutivas.api';
import type { DevolutivasData, DevolutivasKpis } from '@/lib/dashboard/devolutivas-mapping';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Formats a decimal-string number of days for display (e.g. "3.50" → "3,5 d").
 * Returns "—" for null (no sample).
 */
function formatDays(decimalStr: string | null): string {
  if (decimalStr === null) return '—';
  const n = Number(decimalStr);
  if (!Number.isFinite(n)) return '—';
  // Format with up to 1 decimal place, pt-BR locale
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n)} d`;
}

/**
 * Formats a fraction [0, 1] as a percentage string (e.g. 0.06 → "6%").
 * Returns "—" for null (no sample).
 */
function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando devolutivas…"
      className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-3"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-[72px] animate-pulse rounded-(--radius-md) bg-(--neutral-100)"
        />
      ))}
    </div>
  );
}

function ErrorState({ fonte }: { fonte: string }) {
  return (
    <p
      role="alert"
      className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)"
    >
      Falha ao carregar dados de{' '}
      <span className="font-bold">{fonte}</span>. Tente novamente mais tarde.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Mini-card
// ---------------------------------------------------------------------------

type MiniCardProps = {
  label: string;
  value: string;
  /** Optional secondary line — used to display `amostra`. */
  sub?: string;
};

/**
 * One mini-card inside the devolutivas section.
 * Mirrors the prototype `#cardDevol` mini-cards (01-visao-geral.html 198–205).
 *
 * ADR-0018: these are **measures** — no traffic-light colour on the values.
 */
function MiniCard({ label, value, sub }: MiniCardProps) {
  return (
    <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-[14px_16px]">
      <b className="block text-(length:--t-h3) font-bold leading-tight">{value}</b>
      <span className="mt-1 block text-(length:--t-caption) text-(--color-text-muted)">
        {label}
      </span>
      {sub && (
        <span className="mt-[2px] block text-(length:--t-small) text-(--color-text-muted)">
          {sub}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPIs content
// ---------------------------------------------------------------------------

function KpisContent({ kpis }: { kpis: DevolutivasKpis }) {
  const amostraLabel = `sobre ${kpis.amostra} proposta${kpis.amostra === 1 ? '' : 's'}`;

  return (
    <div className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-3">
      {/* Tempo médio de devolutiva */}
      <MiniCard
        label="Tempo médio de devolutiva"
        value={formatDays(kpis.tempoMedioDevolutivaDias)}
        sub={amostraLabel}
      />
      {/* Taxa de reaberturas */}
      <MiniCard
        label="Taxa de reaberturas"
        value={formatPercent(kpis.taxaReaberturas)}
        sub={amostraLabel}
      />
      {/* Resolvidas no 1º retorno */}
      <MiniCard
        label="Resolvidas no 1º retorno"
        value={formatPercent(kpis.resolvidasPrimeiroRetorno)}
        sub={amostraLabel}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /**
   * Injectable data source for tests.
   * Defaults to the configured BFF client (`getDashboardDevolutivas`).
   *
   * ```tsx
   * render(<DevolutivasCard fetchData={() => Promise.resolve(mockData)} />);
   * render(<DevolutivasCard fetchData={() => Promise.reject(new Error())} />);
   * ```
   */
  fetchData?: () => Promise<DevolutivasData>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * "Qualidade das devolutivas" card (DEVOLUTIVAS widget · DASH-F2 / RN-F2-03).
 *
 * Fetches from `/api/dashboard/devolutivas` independently — isolated from
 * the pipeline section.  A failure here shows only this card in error state;
 * KPIs and phase boxes continue normally (CA-5).
 *
 * 3 mini-cards:
 *   - Tempo médio de devolutiva (days)
 *   - Taxa de reaberturas (%)
 *   - Resolvidas no 1º retorno (%)
 *
 * All values are **measures** — no traffic-light colouring (ADR-0018).
 * `amostra` is always displayed alongside rates (RN-F2-03).
 *
 * Tokens:
 *   - card: `--color-surface`, `--color-border`
 *   - value typography: `--t-h3` bold
 *   - label typography: `--t-caption` muted
 */
export function DevolutivasCard({ fetchData = getDashboardDevolutivas }: Props) {
  type FetchStatus = 'loading' | 'ok' | 'error';

  const [status, setStatus] = useState<FetchStatus>('loading');
  const [data, setData] = useState<DevolutivasData | null>(null);

  useEffect(() => {
    let active = true;

    fetchData()
      .then((d) => {
        if (!active) return;
        setData(d);
        setStatus('ok');
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [fetchData]);

  return (
    <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-[18px_20px]">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-(length:--t-h3) font-bold">Qualidade das devolutivas</h2>
      </div>

      {status === 'loading' && <Loading />}

      {status === 'error' && (
        <ErrorState fonte="dashboard/devolutivas" />
      )}

      {status === 'ok' && data?.kpis === null && (
        <ErrorState fonte={data.errorFonte ?? 'dashboard/devolutivas'} />
      )}

      {status === 'ok' && data?.kpis != null && (
        <KpisContent kpis={data.kpis} />
      )}
    </div>
  );
}
