'use client';

import { useState } from 'react';
import Link from 'next/link';

import { formatCompactBRL } from '@/lib/dashboard/format-compact-brl';
import type { TopOportunidade } from '@/lib/dashboard/pipeline-types';

// ---------------------------------------------------------------------------
// Sort state
// ---------------------------------------------------------------------------

type SortColumn = 'valor' | 'fase' | 'responsavel';
type SortDir = 'asc' | 'desc';

function sortRows(
  rows: TopOportunidade[],
  col: SortColumn,
  dir: SortDir,
): TopOportunidade[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;

    if (col === 'valor') {
      // null values always go to the bottom regardless of sort direction
      if (a.valor === null && b.valor === null) return 0;
      if (a.valor === null) return 1;
      if (b.valor === null) return -1;
      cmp = Number(a.valor) - Number(b.valor);
    } else if (col === 'fase') {
      cmp = (a.faseLabel ?? '').localeCompare(b.faseLabel ?? '', 'pt-BR');
    } else if (col === 'responsavel') {
      const aName = a.responsavelNome ?? '';
      const bName = b.responsavelNome ?? '';
      cmp = aName.localeCompare(bName, 'pt-BR');
    }

    return dir === 'asc' ? cmp : -cmp;
  });
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
      aria-label="Carregando principais por valor…"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="mb-2 h-10 animate-pulse rounded bg-(--neutral-100)"
        />
      ))}
    </div>
  );
}

function Empty() {
  return (
    <p className="py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Nenhuma oportunidade encontrada.
    </p>
  );
}

function ErrorState({ fonte }: { fonte: string }) {
  return (
    <p className="py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Falha ao carregar dados de{' '}
      <span className="font-bold">{fonte}</span>. Tente novamente mais tarde.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Sortable header cell
// ---------------------------------------------------------------------------

type ThProps = {
  label: string;
  col: SortColumn;
  currentCol: SortColumn;
  currentDir: SortDir;
  onSort: (col: SortColumn) => void;
};

function SortableTh({ label, col, currentCol, currentDir, onSort }: ThProps) {
  const isActive = currentCol === col;
  const arrow = isActive ? (currentDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <th
      className="cursor-pointer select-none border-b border-(--color-border) px-2 py-2 text-left text-(length:--t-small) font-bold uppercase text-(--color-text-muted) hover:text-(--color-text)"
      onClick={() => onSort(col)}
      aria-sort={
        isActive ? (currentDir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      {label}
      <span aria-hidden="true">{arrow}</span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** Loading state — renders skeleton rows. */
  loading?: boolean;
  /**
   * Top opportunity rows.
   * `null` when the backend section is degraded (show error state naming fonte).
   * `undefined` / `[]` for empty.
   */
  rows?: TopOportunidade[] | null;
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
 * "Principais por valor" sortable table (DASH-F2 · HU-03.1 / RN-F2-01).
 *
 * Mirrors prototype `#tblTop` (01-visao-geral.html lines 174–177).
 * Sorting is **client-side** over the top-N rows received from the backend
 * (CA-3: no new request on sort).
 *
 * Columns: Oportunidade, Fase, Responsável, Valor (sortable).
 * Default sort: Valor descending (matches backend order).
 *
 * Tokens:
 *   - link: `--secondary-600`
 *   - header: `--color-text-muted`, uppercase, `--t-small`
 *   - body: `--t-caption`
 */
export function TopByValueTable({
  loading = false,
  rows,
  errorFonte = 'pipeline',
}: Props) {
  const [sortCol, setSortCol] = useState<SortColumn>('valor');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(col: SortColumn) {
    if (col === sortCol) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  if (loading) return <Loading />;
  if (rows === null) return <ErrorState fonte={errorFonte} />;
  if (!rows || rows.length === 0) return <Empty />;

  const sorted = sortRows(rows, sortCol, sortDir);

  return (
    /* A table does not shrink below its min-content width (measured 398px), so
       `w-full` alone let it widen the DOCUMENT on a narrow screen instead of
       fitting. Wide content scrolls inside its own container; the page body
       never scrolls sideways — a horizontally scrolled page drags itself out
       from under every `fixed` modal overlay on it. */
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-(length:--t-caption)">
      <thead>
        <tr>
          <th className="border-b border-(--color-border) px-2 py-2 text-left text-(length:--t-small) font-bold uppercase text-(--color-text-muted)">
            Oportunidade
          </th>
          <SortableTh
            label="Fase"
            col="fase"
            currentCol={sortCol}
            currentDir={sortDir}
            onSort={handleSort}
          />
          <SortableTh
            label="Responsável"
            col="responsavel"
            currentCol={sortCol}
            currentDir={sortDir}
            onSort={handleSort}
          />
          <SortableTh
            label="Valor"
            col="valor"
            currentCol={sortCol}
            currentDir={sortDir}
            onSort={handleSort}
          />
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.id}>
            <td className="border-b border-(--color-border) px-2 py-[9px]">
              <Link
                href={`/oportunidades/${row.id}`}
                className="font-bold text-(--secondary-600) hover:underline"
              >
                {row.code ?? row.id}
              </Link>
              {row.customerName && (
                <div className="text-(length:--t-small) text-(--color-text-muted)">
                  {row.customerName}
                </div>
              )}
            </td>
            <td className="border-b border-(--color-border) px-2 py-[9px] text-(--color-text-muted)">
              {row.faseLabel}
            </td>
            <td className="border-b border-(--color-border) px-2 py-[9px] text-(--color-text-muted)">
              {row.responsavelNome ?? '—'}
            </td>
            <td className="border-b border-(--color-border) px-2 py-[9px] font-bold whitespace-nowrap">
              {formatCompactBRL(row.valor)}
            </td>
          </tr>
        ))}
        </tbody>
      </table>
    </div>
  );
}
