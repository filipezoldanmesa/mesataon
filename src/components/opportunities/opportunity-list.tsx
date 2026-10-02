'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { sapOrProspect, shownSapCode } from '@/lib/clients/customer-reference';
import { FaseAtualFilter } from '@/components/opportunities/fase-atual-filter';
import { NewOpportunityButton } from '@/components/opportunities/new-opportunity-button';
import { StatusPill, type PillVariant } from '@/components/status-pill';
import { formatInstantDateBR } from '@/lib/date-format';
import { getDashboardPipeline } from '@/lib/dashboard/pipeline.api';
import type { PipelineData, PipelinePhase } from '@/lib/dashboard/pipeline-types';
import { listOpportunities } from '@/lib/opportunities/opportunities.data';
import { formatStageDuration } from '@/lib/opportunities/format-stage-duration';
import { FRANQUIA_FILTER_OPTIONS } from '@/lib/opportunities/types';
import type {
  FaseAtual,
  FranquiaFilterValue,
  ListOpportunitiesParams,
  OpportunityCounts,
  OpportunityListResult,
  OpportunitySortField,
  OpportunitySummary,
  OpportunityStatus,
  SortDirection,
} from '@/lib/opportunities/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

// "Quadro" (kanban) loads the whole set unpaginated so every card shows in its
// column. MVP data volumes make a single large fetch fine (same rationale as
// the BFF's unpaginated backend fetch).
const KANBAN_LIMIT = 1000;

// Status pill colors mirror the prototype's `fasePill` mapping (oportunidades.html):
// preenchimento→warning, análise/aprovação→info, contrato→neutral, concluída→success.
const STATUS_VARIANT: Record<OpportunityStatus, PillVariant> = {
  preenchimento: 'warning',
  análise: 'info',
  aprovação: 'info',
  contrato: 'neutral',
  concluída: 'success',
};

// Status labels mirror the prototype's `statusLabel` mapping (prefixed "Em ...").
const STATUS_LABEL: Record<OpportunityStatus, string> = {
  preenchimento: 'Em preenchimento',
  análise: 'Em análise',
  aprovação: 'Em aprovação',
  contrato: 'Em contrato',
  concluída: 'Concluída',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Cabeçalho de coluna ordenável — o `.th` do protótipo `oportunidades.html`:
 *
 *   .th{cursor:pointer;user-select:none;display:flex;align-items:center;gap:4px}
 *   .th:hover{color:#418020}            → `--secondary-500` (valor idêntico)
 *   .ar{font-size:12px}                 → `↕` a 60% de opacidade, `▲`/`▼` a 100%
 *
 * **Desvio deliberado (ADR-0018):** no CSS do protótipo o verde é só `:hover` —
 * a coluna ativa volta ao `--neutral-800` quando o mouse sai. Aqui a coluna
 * ativa FICA verde. É o que as capturas de referência do pedido mostram, e é o
 * que responde "qual coluna está ordenando?" sem depender de onde está o
 * cursor; com o verde só no hover, sair do cabeçalho apaga a única marca de
 * cor e sobra a seta de 12px como indício.
 *
 * As setas são marcas TIPOGRÁFICAS do protótipo, não emoji — a mesma classe de
 * `★ Eleita`, `↻ Recalcular` e `→`, que o CLAUDE.md isenta da regra "emoji não é
 * ícone". Ficam `aria-hidden`: quem carrega o significado para leitor de tela é
 * o `aria-sort` do `<th>`.
 *
 * O protótipo põe `onclick` num `<div>`; aqui é um `<button>` de verdade, para o
 * controle ser alcançável por teclado. O visual é o mesmo.
 */
function SortableHeader({
  label,
  active,
  dir,
  onSort,
  className = '',
}: {
  label: string;
  /** Esta coluna é a que ordena agora? */
  active: boolean;
  dir: SortDirection;
  onSort: () => void;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-3 font-bold ${className}`}
      // `none` enquanto a coluna não ordena — é o estado neutro do protótipo,
      // antes do primeiro clique.
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={onSort}
        className={`flex cursor-pointer items-center gap-1 font-bold select-none hover:text-(--secondary-500) ${
          active ? 'text-(--secondary-500)' : ''
        }`}
      >
        {label}
        <span aria-hidden="true" className={`text-[12px] ${active ? '' : 'opacity-60'}`}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-12 text-center text-(length:--t-caption) text-(--color-text-muted)">
      {children}
    </div>
  );
}

/**
 * Renderiza a coluna "Finalidade" — uma pill neutra, ou travessão.
 *
 * **Substituiu a coluna "Tipo"**, que exibia `tipoNegociacao`: aquele campo é
 * `CONTRATACAO` em praticamente toda oportunidade desta plataforma, então a
 * coluna pintava a MESMA pill em todas as linhas e não distinguia nada. A
 * finalidade (`Implantação`/`Vinculação`) é a resposta que varia por
 * oportunidade — é a informação que o negócio pediu no lugar.
 *
 * Mantém a pill (e não texto solto) porque o slot é o mesmo que o protótipo
 * `oportunidades.html` desenhou como pill, e o card do "Quadro" tem o layout
 * construído em torno dela. `neutral` sempre: finalidade é um ATRIBUTO, não um
 * veredito — o `variant` colorido fica para o "Status" ao lado.
 *
 * ⚠️ Valor ÚNICO, nunca lista: o `tipoPills` do protótipo separava por vírgula
 * porque a mock carregava tokens de classe de ativo (`Posto,BR Mania,Lubrax+`);
 * nenhum membro de `Finalidade` tem vírgula, e dividir sugeriria uma semântica
 * multivalor que o campo não tem.
 *
 * `null` é "ninguém respondeu" (RN-F2-03 — o campo nunca é defaultado) e vira
 * travessão. String em branco cai no mesmo ramo: um chip vazio leria como dado
 * que a tela falhou em carregar.
 */
function FinalidadePill({ finalidade }: { finalidade: string | null }) {
  const value = finalidade?.trim() ?? '';

  if (value === '') {
    return <span className="text-(--color-text-muted)">—</span>;
  }

  return <StatusPill variant="neutral">{value}</StatusPill>;
}

/**
 * Formats an ISO date as dd/mm/yyyy (pt-BR); em dash when absent/invalid.
 * Pinned to UTC so the displayed calendar day is deterministic regardless of
 * the viewer's timezone (a `…T00:00:00Z` value must not shift a day back).
 */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}


/** Compact BRL for the kanban card (e.g. "R$ 6 mi"); em dash when absent. */
function formatValue(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

/** Board columns (F2 "Quadro" view) — the five workflow phases, in order. */
const KANBAN_COLUMNS: Array<{ status: OpportunityStatus; label: string }> = [
  { status: 'preenchimento', label: 'Preenchimento' },
  { status: 'análise', label: 'Análise' },
  { status: 'aprovação', label: 'Aprovação' },
  { status: 'contrato', label: 'Contrato' },
  { status: 'concluída', label: 'Concluída' },
];

/**
 * Kanban board mirroring the prototype's "Quadro" view: one column per phase,
 * each with a count badge, average phase permanence (from the pipeline endpoint),
 * and clickable cards that show the card-level permanence when available.
 *
 * Both permanence slots degrade gracefully:
 *  - If the pipeline fetch failed, `pipelinePhases` is empty → column avg is hidden.
 *  - If a card has `permanenciaFaseAtualDias: null` → the card badge is omitted (CA-2).
 */
function KanbanBoard({
  items,
  pipelinePhases,
}: {
  items: OpportunitySummary[];
  pipelinePhases: PipelinePhase[];
}) {
  /** Look up the avg permanence for a UI-status column. */
  function columnAvg(colStatus: OpportunityStatus): number | null {
    return pipelinePhases.find((p) => p.status === colStatus)?.avgPermanenciaDias ?? null;
  }

  return (
    <div className="mt-1 flex gap-3 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map(({ status: colStatus, label }) => {
        const cards = items.filter((o) => o.status === colStatus);
        const avgDuration = formatStageDuration(columnAvg(colStatus));
        return (
          <div
            key={colStatus}
            className="min-w-60 flex-1 rounded-[var(--radius-md)] border border-(--color-border) bg-(--neutral-40) px-2.5 pt-2.5 pb-1"
          >
            {/* Column header — count badge + optional avg permanence (CA-1, CA-3) */}
            <div className="mb-2.5 flex items-center justify-between border-b-2 border-(--color-border) px-1 pb-2.5 text-(length:--t-caption) font-bold text-(--neutral-800)">
              <span>{label}</span>
              <div className="flex items-center gap-1.5">
                {avgDuration !== null && (
                  <span
                    aria-label={`Permanência média: ${avgDuration}`}
                    className="text-[11px] font-normal text-(--color-text-muted)"
                  >
                    ⌀ {avgDuration}
                  </span>
                )}
                <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border border-(--color-border) bg-white px-1.5 text-[12px] font-bold text-(--neutral-700)">
                  {cards.length}
                </span>
              </div>
            </div>
            {cards.length === 0 ? (
              <div className="px-1.5 py-4 text-center text-[12px] text-(--color-text-muted)">
                Nenhuma
              </div>
            ) : (
              cards.map((o) => {
                const cardDuration = formatStageDuration(o.permanenciaFaseAtualDias);
                return (
                  <Link
                    key={o.id}
                    href={`/oportunidades/${o.id}`}
                    className="mb-2 block rounded-[var(--radius-xs)] border border-(--color-border) bg-white p-3 shadow-(--shadow-card) hover:border-(--secondary-300) hover:bg-(--secondary-100)"
                  >
                    <div className="text-[12px] text-(--color-text-muted)">
                      {o.code} · {sapOrProspect(shownSapCode(o))}
                    </div>
                    <div className="mt-1 mb-2 text-(length:--t-caption) font-bold leading-tight text-(--neutral-900)">
                      {o.clientName}
                    </div>
                    <div className="mb-2">
                      <FinalidadePill finalidade={o.finalidade} />
                    </div>
                    <div className="flex items-center justify-between border-t border-(--color-border) pt-2 text-[12px] text-(--color-text-muted)">
                      <StatusPill variant={STATUS_VARIANT[o.status]}>
                        {STATUS_LABEL[o.status]}
                      </StatusPill>
                      <div className="flex items-center gap-2">
                        {/* Card permanence badge — omitted when null (CA-2) */}
                        {cardDuration !== null && (
                          <span
                            aria-label={`Nesta fase há ${cardDuration}`}
                            className="text-[11px] text-(--color-text-muted)"
                          >
                            {cardDuration}
                          </span>
                        )}
                        <span className="font-bold text-(--neutral-900)">
                          {formatValue(o.value)}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type LoadFn = (params: ListOpportunitiesParams) => Promise<OpportunityListResult>;
type LoadPipelineFn = () => Promise<PipelineData>;

type Props = {
  /**
   * Loads a page of opportunities (items + tab counts + pagination metadata);
   * injectable for tests. Defaults to `listOpportunities` from
   * `opportunities.data.ts`, which calls the real API via the BFF
   * (`/api/opportunities/list`).
   */
  load?: LoadFn;
  /**
   * Loads pipeline phase data (avg permanence per phase) for the "Quadro"
   * column headers; injectable for tests. Defaults to `getDashboardPipeline`
   * from `pipeline.api.ts`. Failures degrade the column headers silently
   * without affecting card rendering (CA-4).
   */
  loadPipeline?: LoadPipelineFn;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Opportunity list screen (journey J2 — `/oportunidades`). Loads opportunity
 * data from the backend and offers two views (aligned to the prototype
 * `oportunidades.html`):
 *
 *  - **Lista:** table (Código, Cliente + SAP, Título, LT, Diretoria, Gerência,
 *    Finalidade, Status, Data de criação, Data de ativação) with the "Fase
 *    atual" multi-select + "Contratos ativos" toggle (both with counts),
 *    free-text search and pagination (10 items/page).
 *  - **Quadro:** kanban board — one column per phase — loading the whole
 *    search-filtered set unpaginated and grouping by status (the phase filters
 *    don't apply here, so they are hidden).
 *
 * Covers all four UI states: carregando, preenchido, vazio (no results) and erro.
 */
export function OpportunityList({
  load = listOpportunities,
  loadPipeline = getDashboardPipeline,
}: Props) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [items, setItems] = useState<OpportunitySummary[]>([]);
  // `null` até a primeira carga voltar — o select mostra travessão em vez de
  // afirmar "0" numa fase que ninguém contou ainda.
  const [counts, setCounts] = useState<OpportunityCounts | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  // Pipeline data for Kanban column headers; empty array = no data / degraded (CA-4).
  const [pipelinePhases, setPipelinePhases] = useState<PipelinePhase[]>([]);

  /** Fases marcadas no select "Fase atual" — vazio = todas. */
  const [fases, setFases] = useState<FaseAtual[]>([]);
  /** Botão "Contratos ativos" (23/09/2026). */
  const [contratosAtivos, setContratosAtivos] = useState(false);
  const [query, setQuery] = useState('');
  /** Filtro de franquia (ADO 67860) — `''` = sem recorte. */
  const [franquia, setFranquia] = useState<FranquiaFilterValue>('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<'lista' | 'quadro'>('lista');
  /*
   * `null` = estado neutro: nenhuma coluna ordena e vale a ordem padrão do
   * backend. É o estado inicial do protótipo (`sortCol=null`) e, como ele, não
   * há volta para cá — depois do primeiro clique a coluna alterna asc ↔ desc.
   */
  const [sort, setSort] = useState<{
    field: OpportunitySortField;
    dir: SortDirection;
  } | null>(null);

  const handleFranquiaChange = (value: FranquiaFilterValue) => {
    setFranquia(value);
    // Volta à primeira página: manter a página 3 sobre um conjunto recortado
    // mostraria uma fatia sem relação com o filtro que o usuário acabou de
    // escolher — mesma razão da troca de aba e da busca.
    setPage(1);
  };

  const handleSort = (field: OpportunitySortField) => {
    setSort((prev) =>
      prev?.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' },
    );
    // Volta à primeira página: manter a página 3 sobre um conjunto reordenado
    // mostraria uma fatia sem relação com o que o usuário acabou de pedir —
    // mesma razão da troca de aba e da busca.
    setPage(1);
  };

  // Debounce the search input by 300 ms.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(value);
      setPage(1);
    }, 300);
  };

  /*
   * "Fase atual" e "Contratos ativos" são mutuamente exclusivos.
   *
   * O pedido define o botão como "todas as oportunidades que têm contrato
   * ativo, independente de estar Em Pagamento ou Concluída" — ou seja, um
   * recorte que ATRAVESSA fases. Combiná-lo por AND com as fases marcadas
   * produziria "Em análise + Contratos ativos" = vazio sempre, e a tela
   * afirmaria que não existe nada. Ligar um desliga o outro, e o controle
   * desligado mostra por quê: o select volta a "Todas".
   *
   * Página volta à 1 nos dois casos: manter a página 3 sobre um conjunto
   * recortado mostraria uma fatia sem relação com o filtro escolhido.
   */
  const handleFasesChange = (next: FaseAtual[]) => {
    setFases(next);
    if (next.length > 0) setContratosAtivos(false);
    setPage(1);
  };

  const handleContratosAtivosToggle = () => {
    const next = !contratosAtivos;
    setContratosAtivos(next);
    if (next) setFases([]);
    setPage(1);
  };

  const handleViewChange = (next: 'lista' | 'quadro') => {
    setView(next);
    setPage(1);
  };

  // Fetch pipeline phase avg permanence data for Kanban column headers.
  // Runs only when the board view is active; failures are swallowed so the
  // board degrades gracefully (CA-4) without taking down the whole screen.
  const fetchPipeline = useCallback(async () => {
    try {
      const data = await loadPipeline();
      setPipelinePhases(data.phases);
    } catch {
      // Isolated degradation: column headers simply show no avg permanence.
      setPipelinePhases([]);
    }
  }, [loadPipeline]);

  const fetchData = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      // "Quadro" shows every opportunity grouped by phase, so it loads the whole
      // (search-filtered) set unpaginated and ignores the status tab; "Lista"
      // keeps the tab filter + pagination.
      const params: ListOpportunitiesParams =
        view === 'quadro'
          ? /*
             * O quadro NÃO recebe a ordenação: o cabeçalho ordenável só existe
             * na tabela, então aplicá-la aqui mudaria a ordem dos cartões a
             * partir de um estado que o usuário não vê nem alcança nesta visão.
             * O quadro mantém a ordem padrão do backend, previsível.
             */
            {
              q: debouncedQuery || undefined,
              // O recorte de franquia vale nas DUAS visões: ele não é fase, e
              // um quadro que ignorasse o filtro mostraria cartões que a lista
              // acabou de esconder.
              franquia: franquia || undefined,
              page: 1,
              limit: KANBAN_LIMIT,
            }
          : {
              q: debouncedQuery || undefined,
              franquia: franquia || undefined,
              fases,
              contratosAtivos,
              page,
              limit: PAGE_SIZE,
              sort: sort?.field,
              dir: sort?.dir,
            };
      const result = await load(params);
      setItems(result.items);
      setCounts(result.counts);
      setTotal(result.total);
      setHasMore(result.hasMore);
      setStatus('loaded');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao carregar oportunidades.',
      );
      setStatus('error');
    }
  }, [load, fases, contratosAtivos, debouncedQuery, franquia, page, view, sort]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Fetch pipeline data whenever the board view becomes active.
  useEffect(() => {
    if (view === 'quadro') {
      void fetchPipeline();
    }
  }, [view, fetchPipeline]);

  // Clear any pending debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="my-1 text-(length:--t-h2) font-bold tracking-[-0.6px]">
            Oportunidades
          </h1>
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            {status === 'loaded' && counts ? (
              <>
                <b>{counts.all}</b> oportunidades no total.
              </>
            ) : (
              'Carteira de oportunidades — listagem e gestão.'
            )}
          </p>
        </div>
        <NewOpportunityButton />
      </div>

      {/* Tabs + search — always visible so filters and search focus survive
          while a new request is in flight (status flips to 'loading'). */}
      <div className="my-4 flex flex-wrap items-center gap-3">
        {/* "Fase atual" + "Contratos ativos" — only in "Lista"; the "Quadro"
            board splits by phase itself, so a phase filter doesn't apply there
            (same rule the old status tabs followed). */}
        {view === 'lista' && (
          <>
            <FaseAtualFilter
              value={fases}
              counts={counts?.porFase ?? null}
              onChange={handleFasesChange}
            />
            <button
              type="button"
              aria-pressed={contratosAtivos}
              onClick={handleContratosAtivosToggle}
              data-testid="filtro-contratos-ativos"
              className={`rounded-[var(--radius-xs)] border px-3.5 py-2.5 text-(length:--t-caption) font-bold ${
                contratosAtivos
                  ? 'border-(--neutral-900) bg-(--neutral-900) text-white'
                  : 'border-(--color-border) bg-white text-(--color-text-muted) hover:bg-(--neutral-40)'
              }`}
            >
              Contratos ativos{' '}
              <span className="ml-1 text-[12px] opacity-70">
                {counts ? counts.contratosAtivos : '—'}
              </span>
            </button>
          </>
        )}

        {/*
          * ⚠️ O placeholder não promete mais do que o backend procura. O `q` vai
          * direto para `OpportunitiesService.list`, que casa `titulo`, `code`,
          * `customer_name` e o LT (`created_by_name` MAIS o `lt_principal` da
          * equipe) — e mais nada. O "ou tipo" que já esteve aqui era falso (não
          * está nem no protótipo, cujo placeholder é "título, cliente ou OPP") e
          * nomeava uma coluna que saiu da tela; "LT" só entrou porque o backend
          * passou a casá-lo de fato (09/09/2026), e a coluna homônima existe
          * para o resultado ser conferível.
          */}
        <input
          type="search"
          aria-label="Buscar oportunidade"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Buscar por título, código, cliente ou LT..."
          className="min-w-55 flex-1 rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white px-3 py-2.5 text-(length:--t-caption)"
        />

        {/* Filtro de franquia (ADO 67860) — segundo eixo, ao lado da busca.
            Segue a forma dos selects do `.fluxpanel` do protótipo
            (`oportunidades.html`): a primeira opção é o rótulo neutro
            ("Franquia: todas"), não um placeholder vazio. */}
        <select
          aria-label="Filtrar por franquia"
          data-testid="filtro-franquia"
          value={franquia}
          onChange={(e) => handleFranquiaChange(e.target.value as FranquiaFilterValue)}
          className="cursor-pointer rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white px-3 py-2.5 text-(length:--t-caption)"
        >
          {FRANQUIA_FILTER_OPTIONS.map((o) => (
            <option key={o.value || 'todas'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* View toggle — Lista / Quadro (prototype `.viewtog`). */}
        <div
          role="group"
          aria-label="Alternar visualização"
          className="inline-flex overflow-hidden rounded-[var(--radius-xs)] border border-(--color-border)"
        >
          {(['lista', 'quadro'] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={active}
                onClick={() => handleViewChange(v)}
                className={`cursor-pointer px-[18px] py-[9px] text-(length:--t-caption) font-bold not-first:border-l not-first:border-(--color-border) ${
                  active
                    ? 'bg-(--secondary-500) text-white'
                    : 'bg-white text-(--color-text-muted) hover:bg-(--neutral-40)'
                }`}
              >
                {v === 'lista' ? 'Lista' : 'Quadro'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading skeleton */}
      {status === 'loading' && (
        <div role="status" aria-live="polite" aria-busy="true" className="space-y-2">
          <span className="sr-only">Carregando oportunidades…</span>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <Message>
          <p className="text-(--color-danger)">{error}</p>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="mt-3 cursor-pointer font-bold text-(--secondary-600) hover:underline"
          >
            Tentar novamente
          </button>
        </Message>
      )}

      {/* Loaded state */}
      {status === 'loaded' && (
        <>
          {/* "Quadro" board, empty state, or the list table */}
          {view === 'quadro' ? (
            <KanbanBoard items={items} pipelinePhases={pipelinePhases} />
          ) : items.length === 0 ? (
            <Message>Nenhuma oportunidade para os filtros atuais.</Message>
          ) : (
            <>
              {/* Table */}
              {/* Horizontal scroll, like the client list: with 11 columns the
                  table outgrows the container, and `overflow-hidden` clipped
                  the trailing "Abrir ›" column off the page. */}
              <div className="overflow-x-auto rounded-[var(--radius-xs)] border border-(--color-border) bg-(--color-surface) shadow-(--shadow-card)">
                <table className="w-full min-w-[1200px] border-collapse text-(length:--t-caption)">
                  <thead>
                    <tr className="bg-(--neutral-50) text-left text-(length:--t-caption) tracking-[0.2px] text-(--neutral-800)">
                      <th className="px-4 py-3 font-bold">Código</th>
                      <th className="px-4 py-3 font-bold">Cliente</th>
                      <th className="px-4 py-3 font-bold">Título</th>
                      {/* LT (09/09/2026) — a busca livre passou a casar o nome do
                          LT, e sem a coluna o resultado é inverificável: quem
                          procura "Ana Ribeiro" recebe linhas sem nada explicando
                          por que elas casaram. */}
                      <th className="px-4 py-3 font-bold">LT</th>
                      {/* Diretoria (escritório de venda) e Gerência (equipe de
                          vendas) — snapshots da criação, pedido de 23/09/2026. */}
                      <th className="px-4 py-3 font-bold">Diretoria</th>
                      <th className="px-4 py-3 font-bold">Gerência</th>
                      <th className="px-4 py-3 font-bold">Finalidade</th>
                      <th className="px-4 py-3 font-bold">Status</th>
                      <SortableHeader
                        label="Data de criação"
                        active={sort?.field === 'createdAt'}
                        dir={sort?.dir ?? 'asc'}
                        onSort={() => handleSort('createdAt')}
                        className="whitespace-nowrap"
                      />
                      <th className="px-4 py-3 font-bold whitespace-nowrap">Data de ativação</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((opp) => (
                      <tr
                        key={opp.id}
                        className="border-t border-(--color-border) hover:bg-(--neutral-40)"
                      >
                        <td className="px-4 py-3">
                          <span className="font-bold text-(--neutral-900)">
                            {opp.code}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-(--neutral-900)">
                            {opp.clientName}
                          </div>
                          {opp.clientId ? (
                            <div className="text-[12px] text-(--color-text-muted)">
                              {sapOrProspect(shownSapCode(opp))}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/oportunidades/${opp.id}`}
                            className="block text-(--neutral-900) hover:text-(--secondary-600)"
                          >
                            {opp.title}
                          </Link>
                        </td>
                        {/* `—` quando a oportunidade não registra o responsável:
                            nome derivado de outra fonte seria indistinguível de
                            um real. */}
                        <td className="px-4 py-3 whitespace-nowrap text-(--neutral-900)">
                          {opp.ltNome ?? '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-(--neutral-900)">
                          {opp.diretoria?.trim() || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-(--neutral-900)">
                          {opp.gerencia?.trim() || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <FinalidadePill finalidade={opp.finalidade} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {/* O rótulo é a FASE ATUAL do backend — a mesma que
                              o filtro usa, senão a linha trazida por "Em
                              ativação" diria "Em contrato". A cor segue o
                              status grosso; backend sem o campo cai no rótulo
                              antigo em vez de ficar em branco. */}
                          <StatusPill variant={STATUS_VARIANT[opp.status]}>
                            {opp.faseAtualLabel ?? STATUS_LABEL[opp.status]}
                          </StatusPill>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-(--neutral-900)">
                          {formatDate(opp.createdAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-(--neutral-900)">
                          {/* Instante (o `ActivatedDate` do org), não data de
                              calendário: fuso de Brasília, senão um contrato
                              ativado às 22h cairia no dia seguinte. */}
                          {formatInstantDateBR(opp.dataAtivacao)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/oportunidades/${opp.id}`}
                            className="font-bold whitespace-nowrap text-(--secondary-600) hover:underline"
                          >
                            Abrir ›
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination — shown whenever there are (or were) multiple pages */}
              {(page > 1 || hasMore) && (
                <div className="mt-4 flex items-center justify-between text-(length:--t-caption) text-(--color-text-muted)">
                  <span>
                    Página <b>{page}</b>
                    {totalPages > 1 ? (
                      <>
                        {' '}de <b>{totalPages}</b>
                      </>
                    ) : null}
                    {' '}· <b>{total}</b> resultado{total !== 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="cursor-pointer rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40 hover:not-disabled:bg-(--neutral-40)"
                    >
                      ← Anterior
                    </button>
                    <button
                      type="button"
                      disabled={!hasMore}
                      onClick={() => setPage((p) => p + 1)}
                      className="cursor-pointer rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40 hover:not-disabled:bg-(--neutral-40)"
                    >
                      Próxima →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
