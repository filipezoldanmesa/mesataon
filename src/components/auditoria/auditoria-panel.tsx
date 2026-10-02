'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { StatusPill } from '@/components/status-pill';
import type { PillVariant } from '@/components/status-pill';
import { exportAuditoria, listAuditoria } from '@/lib/auditoria/auditoria.data';
import type {
  AuditoriaEntry,
  AuditoriaEventTipo,
  AuditoriaFiltroChip,
  ListAuditoriaParams,
  ListAuditoriaResult,
} from '@/lib/auditoria/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FILTRO_CHIPS: Array<{ key: AuditoriaFiltroChip; label: string }> = [
  { key: 'todas', label: 'Todas' },
  { key: 'critica', label: 'Ações críticas' },
  { key: 'transicao', label: 'Transições de workflow' },
  { key: 'acesso', label: 'Acessos (LGPD)' },
];

const TIPO_CONFIG: Record<
  AuditoriaEventTipo,
  { label: string; variant: PillVariant }
> = {
  // `info` (not `danger`): an audit entry records that something happened, it
  // is not a failure. The prototype uses `.pill.i` (--color-info) here, and
  // 9 of 12 rows are `critica` — painting them red made the whole trail read
  // as a system error.
  critica: { label: 'Ação', variant: 'info' },
  transicao: { label: 'Transição', variant: 'neutral' },
  acesso: { label: 'Acesso · LGPD', variant: 'warning' },
};

/** Page size for pagination — a small value keeps initial load fast. */
const PAGE_SIZE = 50;

// Sort column indices
type SortCol = 'dataHora' | 'usuario' | 'acao' | 'objeto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadFn = (params: ListAuditoriaParams) => Promise<ListAuditoriaResult>;
type ExportFn = (
  params: Pick<ListAuditoriaParams, 'tipo' | 'q' | 'de' | 'ate'>,
) => Promise<Blob>;

type Props = {
  /**
   * Loads the audit entry list; injectable for tests.
   * Defaults to `listAuditoria` from `auditoria.data.ts` (real
   * `GET /api/auditoria` BFF).
   */
  load?: LoadFn;
  /**
   * Exports the audit trail as a CSV Blob; injectable for tests.
   * Defaults to `exportAuditoria` from `auditoria.data.ts`.
   */
  doExport?: ExportFn;
  /**
   * Nível do título "Auditoria e logs". `1` (padrão) quando o painel é a página
   * inteira; `2` quando ele é uma seção de uma página que já tem o seu `<h1>` —
   * é o caso da Governança, onde a trilha vem depois dos cartões de
   * parametrização. Dois `<h1>` na mesma página quebram a ordem de leitura de
   * quem navega por títulos.
   */
  headingLevel?: 1 | 2;
};

// ---------------------------------------------------------------------------
// URL state helpers
// ---------------------------------------------------------------------------

/** Builds a new URLSearchParams merging the current params with a patch object. */
function patchParams(
  current: URLSearchParams,
  patch: Record<string, string | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '') {
      next.delete(k);
    } else {
      next.set(k, v);
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * O que a coluna "Objeto" EXIBE (ADO 67958).
 *
 * Fonte única da célula e da ordenação: ordenar por `entry.objeto` enquanto a
 * célula mostra o código da oportunidade faria o clique no cabeçalho ordenar
 * por um valor invisível.
 */
export function objetoExibido(entry: AuditoriaEntry): string | null {
  return entry.objeto ?? entry.oportunidade ?? null;
}

/**
 * Replace → arrow with a styled span. No margin on the arrow: the source text
 * already spaces it ("Em aprovação → Aprovada"), so adding one double-spaced it.
 */
function formatDetalhe(text: string): ReactNode {
  const parts = text.split('→');
  if (parts.length === 1) return text;
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="font-bold text-(--color-text)">→</span>}
          {part}
        </span>
      ))}
    </>
  );
}

function sortEntries(
  items: AuditoriaEntry[],
  col: SortCol,
  dir: 1 | -1,
): AuditoriaEntry[] {
  return [...items].sort((a, b) => {
    let av: string;
    let bv: string;
    if (col === 'dataHora') {
      av = a.dataHoraIso;
      bv = b.dataHoraIso;
    } else if (col === 'objeto') {
      // Ordena pelo valor EXIBIDO — ver `objetoExibido`. Nulo ordena primeiro.
      av = objetoExibido(a) ?? '';
      bv = objetoExibido(b) ?? '';
    } else {
      av = a[col] ?? '';
      bv = b[col] ?? '';
    }
    return av.localeCompare(bv, 'pt') * dir;
  });
}

/**
 * Validates the date range. Returns a string error message, or null when valid.
 * An empty `de` or `ate` is always valid (partial ranges are accepted).
 */
function validatePeriod(de: string, ate: string): string | null {
  if (!de || !ate) return null;
  if (new Date(de) > new Date(ate)) {
    return 'O período "de" não pode ser posterior a "até".';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Sort affordance. The glyphs are `aria-hidden` — a screen reader announcing
 * "black up-pointing triangle" is noise; the sort state is exposed as text
 * that becomes part of the header button's accessible name instead.
 */
function SortIcon({ active, dir }: { active: boolean; dir: 1 | -1 }) {
  if (!active) {
    return (
      <span aria-hidden="true" className="text-(length:--t-small) text-(--neutral-500)">
        ↕
      </span>
    );
  }
  return (
    <>
      <span aria-hidden="true" className="text-(length:--t-small) text-(--neutral-800)">
        {dir > 0 ? '▲' : '▼'}
      </span>
      <span className="sr-only">
        {dir > 0 ? ' (ordenado crescente)' : ' (ordenado decrescente)'}
      </span>
    </>
  );
}

function Th({
  col,
  sortCol,
  sortDir,
  onSort,
  children,
}: {
  col: SortCol;
  sortCol: SortCol;
  sortDir: 1 | -1;
  onSort: (col: SortCol) => void;
  children: ReactNode;
}) {
  const active = sortCol === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="flex cursor-pointer select-none items-center gap-1 text-left font-bold hover:text-(--secondary-600)"
    >
      {children}
      <SortIcon active={active} dir={sortDir} />
    </button>
  );
}

/**
 * Renders a single state value from `estadoAnterior` / `estadoPosterior`.
 * The string `"[redacted]"` is rendered with a visual sensitive indicator
 * (CA-5 — the key is always visible; only the value is masked).
 */
function StateValue({ value }: { value: unknown }) {
  if (value === undefined) {
    return <span className="text-(--color-text-muted)">—</span>;
  }
  if (value === '[redacted]') {
    return (
      <span
        data-testid="redacted-value"
        title="Valor sensível — acesso auditado"
        className="rounded-[var(--radius-xxs)] bg-(--neutral-100) px-1 font-mono text-(length:--t-small) text-(--color-text-muted)"
      >
        [redacted]
      </span>
    );
  }
  return (
    <span className="text-(--color-text-muted)">{String(value)}</span>
  );
}

/**
 * Renders a field-by-field diff between `estadoAnterior` and `estadoPosterior`.
 * Only fields whose values differ between the two states are shown.
 * When only one state is present all its fields are shown (creation / deletion).
 * Returns null when both states are null (pre-VBR-451 entries).
 */
function EstadoDiff({
  anterior,
  posterior,
}: {
  anterior: Record<string, unknown> | null;
  posterior: Record<string, unknown> | null;
}) {
  if (!anterior && !posterior) return null;

  const allKeys = Array.from(
    new Set([
      ...Object.keys(anterior ?? {}),
      ...Object.keys(posterior ?? {}),
    ]),
  );

  const changes = allKeys.filter((key) => {
    const antes = anterior ? anterior[key] : undefined;
    const depois = posterior ? posterior[key] : undefined;
    // Always show a field when either value is `[redacted]`: two equal
    // "[redacted]" strings may mask different underlying PII values, so the
    // auditor must see that the sensitive field was touched — even when the
    // display string is identical.
    if (antes === '[redacted]' || depois === '[redacted]') return true;
    return antes !== depois;
  });

  if (changes.length === 0) return null;

  return (
    <div className="mt-1 space-y-0.5" data-testid="estado-diff">
      {changes.map((key) => (
        <div key={key} className="text-(length:--t-small)">
          <span className="font-bold text-(--color-text)">{key}:</span>{' '}
          <StateValue value={anterior ? anterior[key] : undefined} />
          {' '}
          <span className="font-bold text-(--color-text)">→</span>
          {' '}
          <StateValue value={posterior ? posterior[key] : undefined} />
        </div>
      ))}
    </div>
  );
}

function LogRow({ entry }: { entry: AuditoriaEntry }) {
  const tipo = TIPO_CONFIG[entry.tipo];
  return (
    <div
      data-testid="auditoria-row"
      data-usuario={entry.usuario}
      className="grid min-w-[900px] grid-cols-[1.1fr_1.2fr_1.4fr_1fr_1.7fr] items-start gap-3 border-b border-(--color-border) px-4 py-3 text-(length:--t-caption) last:border-b-0 hover:bg-(--neutral-40)"
    >
      {/* Data / hora */}
      <div className="whitespace-nowrap text-(--color-text-muted)">
        {entry.dataHora}
      </div>

      {/* Usuário + perfil (perfil is omitted while the trail does not record it) */}
      <div>
        <span className="font-bold text-(--color-text)">{entry.usuario}</span>
        {entry.perfil !== null && (
          <div className="text-(length:--t-small) text-(--color-text-muted)">
            {entry.perfil}
          </div>
        )}
      </div>

      {/* Ação + pill */}
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill
          data-testid="auditoria-tipo-pill"
          variant={tipo.variant}
          size="sm"
        >
          {tipo.label}
        </StatusPill>
        <span>{entry.acao}</span>
      </div>

      {/*
        Objeto — código do agregado do ato, e sob ele a identificação da
        oportunidade (ADO 67958).

        A linha auxiliar traz o CLIENTE e, quando o objeto do ato é outro
        agregado (uma proposta, uma pendência), também o código da oportunidade.
        Repetir o código quando ele já é o objeto seria ruído.

        Travessão só quando NADA identifica a linha — e não mais "sempre que
        `metadata.code` está ausente", que era o caso de toda transição de
        workflow.
      */}
      <div className="text-(--color-text-muted)">
        <div>{objetoExibido(entry) ?? '—'}</div>
        {(() => {
          /*
           * A comparação é com o valor EXIBIDO, não com `entry.objeto`: quando
           * o objeto é nulo o código da oportunidade já subiu para a linha
           * principal, e comparar com o campo cru o repetiria embaixo.
           */
          const exibido = objetoExibido(entry);
          const auxiliar = [
            entry.oportunidade && entry.oportunidade !== exibido
              ? entry.oportunidade
              : null,
            entry.cliente,
          ].filter(Boolean);
          return auxiliar.length > 0 ? (
            <div
              data-testid="auditoria-objeto-oportunidade"
              className="text-(length:--t-small)"
            >
              {auxiliar.join(' · ')}
            </div>
          ) : null;
        })()}
      </div>

      {/* Detalhe + antes/depois */}
      <div className="text-(--color-text-muted)">
        {formatDetalhe(entry.detalhe)}
        <EstadoDiff
          anterior={entry.estadoAnterior}
          posterior={entry.estadoPosterior}
        />
        {entry.motivo && (
          <div className="mt-0.5 text-(length:--t-small) italic">
            Motivo: {entry.motivo}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-7 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Nenhum registro para os filtros atuais.
    </div>
  );
}

// ---------------------------------------------------------------------------
// AuditoriaPanel
// ---------------------------------------------------------------------------

/**
 * Audit log panel (journey F14 — `/governanca`). Shows the audit trail with:
 * - filter chips (todas / ações críticas / transições de workflow / acessos LGPD)
 * - period filter (de / até) — reflected in URL
 * - free-text search with debounce
 * - sortable table columns
 * - "Carregar mais" pagination using backend `total`
 * - "Exportar" button — streams CSV via `/api/auditoria/export`
 * - structured before/after diffs (`estadoAnterior` → `estadoPosterior`)
 * - `[redacted]` sensitive-value indicator (CA-5)
 *
 * All active filters are reflected in the URL so a shared link restores the
 * same query (CA-1).
 */
export function AuditoriaPanel({
  load = listAuditoria,
  doExport = exportAuditoria,
  headingLevel = 1,
}: Props) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const router = useRouter();
  const searchParams = useSearchParams();

  // ---------------------------------------------------------------------------
  // Read initial filter state from URL (CA-1 — reload restores controls)
  // ---------------------------------------------------------------------------

  const initialFiltroChip = (): AuditoriaFiltroChip => {
    const v = searchParams.get('tipo');
    const known: AuditoriaEventTipo[] = ['critica', 'transicao', 'acesso'];
    return v && known.includes(v as AuditoriaEventTipo)
      ? (v as AuditoriaEventTipo)
      : 'todas';
  };

  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  const [allItems, setAllItems] = useState<AuditoriaEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState('');

  const [filtroChip, setFiltroChip] = useState<AuditoriaFiltroChip>(initialFiltroChip);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get('q') ?? '');
  const [de, setDe] = useState(searchParams.get('de') ?? '');
  const [ate, setAte] = useState(searchParams.get('ate') ?? '');

  /** Client-side period validation error — shown before the API call (CA-2). */
  const periodError = validatePeriod(de, ate);

  const [sortCol, setSortCol] = useState<SortCol>('dataHora');
  const [sortDir, setSortDir] = useState<1 | -1>(-1); // descending by default

  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [exportError, setExportError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Sequence guard: chip clicks and debounced keystrokes fire overlapping
   * loads, and a slower earlier response must not overwrite a newer one.
   */
  const requestSeq = useRef(0);

  // ---------------------------------------------------------------------------
  // URL sync helpers
  // ---------------------------------------------------------------------------

  function pushUrl(patch: Record<string, string | undefined>) {
    const next = patchParams(searchParams, patch);
    const qs = next.toString();
    router.push(qs ? `?${qs}` : '?', { scroll: false });
  }

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
      pushUrl({ q: value || undefined });
    }, 300);
  };

  const handleFiltroChipChange = (key: AuditoriaFiltroChip) => {
    setFiltroChip(key);
    setCurrentPage(1);
    pushUrl({ tipo: key === 'todas' ? undefined : key });
  };

  const handleDeChange = (value: string) => {
    setDe(value);
    setCurrentPage(1);
    pushUrl({ de: value || undefined });
  };

  const handleAteChange = (value: string) => {
    setAte(value);
    setCurrentPage(1);
    pushUrl({ ate: value || undefined });
  };

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortCol(col);
      setSortDir(1);
    }
  };

  // ---------------------------------------------------------------------------
  // Data fetch
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(
    async (page: number, append: boolean) => {
      // CA-2: do not call API with invalid period
      if (validatePeriod(de, ate)) return;

      const seq = ++requestSeq.current;
      if (!append) setLoadStatus('loading');
      setError('');
      try {
        const params: ListAuditoriaParams = {
          tipo: filtroChip === 'todas' ? undefined : filtroChip,
          q: debouncedQuery || undefined,
          de: de || undefined,
          ate: ate || undefined,
          page,
          limit: PAGE_SIZE,
        };
        const result = await load(params);
        if (seq !== requestSeq.current) return; // a newer request already won
        setTotal(result.total);
        if (append) {
          setAllItems((prev) => [...prev, ...result.items]);
        } else {
          setAllItems(result.items);
        }
        setLoadStatus('loaded');
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(
          err instanceof Error ? err.message : 'Erro ao carregar registros.',
        );
        setLoadStatus('error');
      }
    },
    [load, filtroChip, debouncedQuery, de, ate],
  );

  /** Initial load / filter change — reset to page 1 and replace list. */
  useEffect(() => {
    setCurrentPage(1);
    setAllItems([]);
    void fetchData(1, false);
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleLoadMore = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    void fetchData(nextPage, true);
  };

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  const handleExport = async () => {
    setExportStatus('loading');
    setExportError('');
    try {
      const blob = await doExport({
        tipo: filtroChip === 'todas' ? undefined : filtroChip,
        q: debouncedQuery || undefined,
        de: de || undefined,
        ate: ate || undefined,
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportStatus('idle');
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Erro ao exportar registros.',
      );
      setExportStatus('error');
    }
  };

  const items = sortEntries(allItems, sortCol, sortDir);
  const hasMore = total > allItems.length;

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <Heading className="my-1 text-(length:--t-h2) font-bold tracking-[-0.6px]">
          Auditoria e logs
        </Heading>
      </div>

      {/* Toolbar: chips + period filter + search + export */}
      <div className="mb-4 space-y-2">
        {/* Row 1: chips + export */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter chips */}
          <div role="group" aria-label="Filtrar por tipo" className="flex flex-wrap gap-1.5">
            {FILTRO_CHIPS.map(({ key, label }) => {
              const active = filtroChip === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleFiltroChipChange(key)}
                  className={`inline-flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-(length:--t-small) font-bold transition-colors ${
                    active
                      ? 'border-(--neutral-900) bg-(--neutral-900) text-white'
                      : 'border-(--color-border) bg-white text-(--color-text-muted) hover:bg-(--neutral-40)'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Export button */}
          <button
            type="button"
            disabled={exportStatus === 'loading' || !!periodError}
            onClick={() => void handleExport()}
            className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-xxs)] border border-(--secondary-500) px-3 py-1.5 text-(length:--t-small) font-bold text-(--secondary-500) hover:bg-(--neutral-40) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportStatus === 'loading' ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>

        {/* Row 2: period filter + search */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Period: De */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="auditoria-de"
              className="shrink-0 text-(length:--t-small) text-(--color-text-muted)"
            >
              De
            </label>
            <input
              id="auditoria-de"
              type="date"
              aria-label="Data inicial do período"
              value={de}
              max={ate || undefined}
              onChange={(e) => handleDeChange(e.target.value)}
              className="rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white px-2 py-1.5 text-(length:--t-caption)"
            />
          </div>

          {/* Period: Até */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="auditoria-ate"
              className="shrink-0 text-(length:--t-small) text-(--color-text-muted)"
            >
              Até
            </label>
            <input
              id="auditoria-ate"
              type="date"
              aria-label="Data final do período"
              value={ate}
              min={de || undefined}
              onChange={(e) => handleAteChange(e.target.value)}
              className="rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white px-2 py-1.5 text-(length:--t-caption)"
            />
          </div>

          {/* Search */}
          <input
            type="search"
            aria-label="Buscar por usuário, ação ou objeto"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Buscar por usuário, ação ou objeto..."
            className="min-w-[220px] flex-1 rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white px-3 py-2 text-(length:--t-caption)"
          />
        </div>

        {/* Period validation error (CA-2) */}
        {periodError && (
          <p
            role="alert"
            data-testid="period-error"
            className="text-(length:--t-small) text-(--color-danger)"
          >
            {periodError}
          </p>
        )}

        {/* Export error (CA-6) */}
        {exportStatus === 'error' && exportError && (
          <p
            role="alert"
            data-testid="export-error"
            className="text-(length:--t-small) text-(--color-danger)"
          >
            {exportError}
          </p>
        )}
      </div>

      {/* Loading skeleton */}
      {loadStatus === 'loading' && (
        <div role="status" aria-live="polite" aria-busy="true" className="space-y-1.5">
          <span className="sr-only">Carregando registros de auditoria…</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)"
            />
          ))}
        </div>
      )}

      {/* Error state (CA-8: API failure shows error, never empty-state text) */}
      {loadStatus === 'error' && (
        <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-10 text-center text-(length:--t-caption)">
          <p className="text-(--color-danger)">{error}</p>
          <button
            type="button"
            onClick={() => void fetchData(1, false)}
            className="mt-3 cursor-pointer font-bold text-(--secondary-600) hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Loaded state — table */}
      {loadStatus === 'loaded' && (
        <div className="overflow-x-auto rounded-[var(--radius-xs)] border border-(--color-border) bg-white shadow-(--shadow-card)">
          {/* Table header */}
          <div className="grid min-w-[900px] grid-cols-[1.1fr_1.2fr_1.4fr_1fr_1.7fr] items-center gap-3 border-b border-(--color-border) bg-(--neutral-50) px-4 py-2.5 text-(length:--t-caption)">
            <Th col="dataHora" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
              Data / hora
            </Th>
            <Th col="usuario" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
              Usuário
            </Th>
            <Th col="acao" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
              Ação
            </Th>
            <Th col="objeto" sortCol={sortCol} sortDir={sortDir} onSort={handleSort}>
              Objeto
            </Th>
            <div className="font-bold">Detalhe (por quê / estado)</div>
          </div>

          {/* Table body */}
          <div>
            {items.length === 0 ? (
              <EmptyState />
            ) : (
              items.map((entry) => <LogRow key={entry.id} entry={entry} />)
            )}
          </div>

          {/* "Carregar mais" pagination (CA — paginação com total do backend) */}
          {hasMore && (
            <div className="border-t border-(--color-border) px-4 py-3 text-center">
              <button
                type="button"
                data-testid="load-more"
                onClick={handleLoadMore}
                className="cursor-pointer text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
              >
                Carregar mais ({total - allItems.length} restantes)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
