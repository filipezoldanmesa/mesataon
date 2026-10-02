"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { NewOpportunityButton } from "@/components/opportunities/new-opportunity-button";
import { Spinner } from "@/components/spinner";
import { StatusPill } from "@/components/status-pill";
import { getPortfolio } from "@/lib/clients/clients.data";
import { SHOW_COMPANY_GROUP_COLUMN } from "@/lib/clients/company-group-visibility";
import type {
  ClientSummary,
  PortfolioCounts,
  PortfolioCarteira,
  PortfolioJanela,
  PortfolioParams,
  PortfolioResult,
  PortfolioTab,
  SortableColumn,
} from "@/lib/clients/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = "loading" | "loaded" | "error";
type SortDir = "asc" | "desc";

interface SortState {
  by: SortableColumn;
  dir: SortDir;
}

/** Combined state that drives each API call (single source of truth). */
interface Params {
  tab: PortfolioTab;
  q: string;
  page: number;
  sort: SortState | null;
}

type Props = {
  /**
   * Loads one page of the client portfolio; injectable for tests.
   * Defaults to `getPortfolio` from `clients.data.ts`, which calls
   * `GET /v1/customers/portfolio` via the BFF.
   */
  load?: (params: PortfolioParams) => Promise<PortfolioResult>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 10;

const EMPTY_COUNTS: PortfolioCounts = {
  all: 0,
  registered: 0,
  prospect: 0,
  inFlowOpportunity: 0,
  franchise: 0,
};

const INITIAL_PARAMS: Params = { tab: "todos", q: "", page: 1, sort: null };

const TABS: Array<{ key: PortfolioTab; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "cadastrado", label: "Cadastrados" },
  { key: "prospect", label: "Prospects" },
  { key: "fluxo", label: "Oportunidades em fluxo" },
  // ADO 67860 — clientes com alguma franquia (BR Mania / Lubrax+). Entra como
  // aba porque a barra de filtros desta tela É o grupo de abas, e "Oportunidades
  // em fluxo" já é o precedente de aba que não descreve situação cadastral.
  { key: "franquia", label: "Com franquia" },
];

/** Maps a tab key to its counter from the backend `counts` envelope. */
function tabCount(key: PortfolioTab, counts: PortfolioCounts): number {
  if (key === "todos") return counts.all;
  if (key === "cadastrado") return counts.registered;
  if (key === "prospect") return counts.prospect;
  if (key === "fluxo") return counts.inFlowOpportunity;
  if (key === "franquia") return counts.franchise;
  return 0;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-(--color-text-muted) italic">{children}</span>;
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-12 text-center text-(length:--t-caption) text-(--color-text-muted)">
      {children}
    </div>
  );
}

/**
 * Column sorting is disabled for now: the portfolio list resolves the ANP
 * bandeira only for the returned page (page-level), so a global sort would
 * force fetching the whole carteira from ANP. Flip {@link SORTING_ENABLED} to
 * `true` to bring the sortable headers back once that cost is acceptable.
 */
const SORTING_ENABLED = false;

/** Sortable column header. Shows ▲/▼ when active, ↕ when idle. */
function SortHeader({
  label,
  colKey,
  sort,
  onSort,
}: {
  label: string;
  colKey: SortableColumn;
  sort: SortState | null;
  onSort: (col: SortableColumn) => void;
}) {
  if (!SORTING_ENABLED) {
    return <span className="font-bold">{label}</span>;
  }

  const active = sort?.by === colKey;
  const arrow = active ? (sort.dir === "asc" ? "▲" : "▼") : "↕";
  return (
    <button
      type="button"
      onClick={() => onSort(colKey)}
      className="flex cursor-pointer select-none items-center gap-1 font-bold hover:text-(--secondary-600)"
      aria-label={`Ordenar por ${label}${active ? (sort.dir === "asc" ? ", crescente" : ", decrescente") : ""}`}
    >
      {label}
      <span className={`text-[11px] ${active ? "opacity-100" : "opacity-50"}`}>
        {arrow}
      </span>
    </button>
  );
}

/** Docs cell — simple document count for the client portfolio listing. */
function DocsCell({ count }: { count: number }) {
  return (
    <span
      data-testid="docs-cell"
      className="font-bold whitespace-nowrap text-(--neutral-900)"
    >
      {count}
    </span>
  );
}

/**
 * Bandeira badge pill.
 *
 * With no flag, the cell NAMES the gap ("Sem registro na ANP" / "ANP
 * indisponível") instead of a mute dash — those are different answers and only
 * one of them is worth calling support about (VBR-539). The text is visually
 * subordinated (same `pending` treatment as the 360º fields) so it cannot be
 * read as a bandeira. A dash survives only when the backend reports no gap,
 * where it keeps its meaning: "this client has no bandeira".
 */
function FlagBadge({
  flag,
  gap,
}: {
  flag: string;
  gap?: { label: string; title: string } | null;
}) {
  if (!flag) {
    if (!gap) return <Muted>—</Muted>;
    return (
      <span
        data-testid="flag-gap"
        data-pending="true"
        title={gap.title}
        className="whitespace-nowrap font-normal text-(--neutral-700) opacity-40"
      >
        {gap.label}
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center whitespace-nowrap rounded-full bg-(--neutral-60) px-2.5 py-0.5 text-(length:--t-small) font-bold text-(--neutral-700)">
      {flag}
    </span>
  );
}

/** Pagination controls (previous / page numbers / next). */
function Paginator({
  page,
  total,
  pageSize,
  limiteJanela,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  /**
   * The source's row ceiling. `total` is only a real total when it stayed BELOW
   * it; once it reaches the ceiling the result set was truncated and the number
   * describes the window, not the carteira — the same false total the header
   * used to assert, just moved to the footer (VBR-487).
   *
   * This is a different question from the subtitle's `janela.amostra`, which
   * describes the BASE (always truncated today). Here the subject is the
   * CURRENT result: a search narrow enough to fit reports a true count, and
   * withholding it would throw away useful information.
   *
   * Known residual: a free-text search is separately capped at 50 rows by the
   * source, and that cap does not travel in the payload — a term matching more
   * than 50 accounts still reports "de 50". Pre-existing, and two orders of
   * magnitude smaller than the 200-of-1.055.564 case this guards.
   */
  limiteJanela: number;
  onPage: (p: number) => void;
}) {
  const truncado = limiteJanela > 0 && total >= limiteJanela;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  /** Generate page number list with ellipsis compression. */
  function pageList(): Array<number | "..."> {
    if (lastPage <= 7) return Array.from({ length: lastPage }, (_, i) => i + 1);
    const out: Array<number | "..."> = [1];
    if (page > 3) out.push("...");
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(lastPage - 1, page + 1);
      i++
    ) {
      out.push(i);
    }
    if (page < lastPage - 2) out.push("...");
    out.push(lastPage);
    return out;
  }

  // Layout only — no bg/text/border here so the active variant can set them
  // without a Tailwind utility-conflict (two `bg-*` on one element resolve by
  // stylesheet order, not class-string order, which was blanking the number).
  const pgBtnBase =
    "inline-flex h-8 min-w-[2rem] cursor-pointer items-center justify-center rounded-[var(--radius-xs)] border px-2 text-(length:--t-caption) font-bold";
  const pgBtnNormal =
    "border-(--color-border) bg-white text-(--color-text) hover:bg-(--neutral-40)";
  const pgBtnActive =
    "border-(--secondary-600) bg-(--secondary-600) text-white";
  const pgBtnDisabled = "cursor-not-allowed opacity-45 pointer-events-none";

  if (total === 0) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-(length:--t-caption) text-(--color-text-muted)">
        Mostrando {total > 0 ? start : 0}–{end}
        {truncado ? " desta amostra" : ` de ${total} clientes`}
      </p>
      {lastPage > 1 && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page === 1}
            className={`${pgBtnBase} ${pgBtnNormal} ${page === 1 ? pgBtnDisabled : ""}`}
            aria-label="Página anterior"
          >
            ‹ Anterior
          </button>

          {pageList().map((p, idx) =>
            p === "..." ? (
              <span
                key={`ell-${idx}`}
                className="px-1 text-(--color-text-muted)"
              >
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={`${pgBtnBase} ${p === page ? pgBtnActive : pgBtnNormal}`}
              >
                {p}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page === lastPage}
            className={`${pgBtnBase} ${pgBtnNormal} ${page === lastPage ? pgBtnDisabled : ""}`}
            aria-label="Próxima página"
          >
            Próxima ›
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Clients screen (journey J1 · `10-clientes`). Loads one page at a time from
 * the backend (server-side pagination), with tab filtering (Todos / Cadastrados
 * / Prospects / Oportunidades em fluxo), free-text search, and sortable columns.
 * Covers the four UI states: carregando / preenchido / vazio / erro.
 */
export function ClientSearch({ load = getPortfolio }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [items, setItems] = useState<ClientSummary[]>([]);
  const [counts, setCounts] = useState<PortfolioCounts>(EMPTY_COUNTS);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  // Backend-owned: whether prospects are exposed. Default false (tab disabled)
  // until the first response says otherwise — the front only reacts.
  const [prospectsEnabled, setProspectsEnabled] = useState(false);
  /*
   * Backend-owned: whether the counters describe the portfolio or only the
   * window the CRM returned. Starts as a sample — the counters are shown as
   * totals only when the backend says they are.
   */
  const [janela, setJanela] = useState<PortfolioJanela>({
    amostra: true,
    limiteJanela: 0,
  });
  /*
   * ADO 67860 — quantos clientes desta aba a fonte de OPORTUNIDADES conhece e o
   * diretório de clientes não serve no recorte atual.
   *
   * Backend-owned, como `janela` e `carteira`. Sem ele o contador da aba e o
   * rodapé da tabela afirmavam números diferentes sem nada explicar a
   * diferença — medido em 26/08/2026: badge `4`, "Mostrando 1–3 de 3".
   */
  const [foraDoRecorte, setForaDoRecorte] = useState(0);
  /*
   * Backend-owned: a listagem é a carteira do usuário ou a base do escopo
   * (ADO 67597). Nasce em `completa` SEM motivo — antes da primeira resposta a
   * tela não sabe, e afirmar "minha carteira" ali seria afirmar um recorte que
   * talvez não tenha acontecido.
   */
  const [carteira, setCarteira] = useState<PortfolioCarteira>({
    modo: 'completa',
    motivo: null,
    motivoLabel: null,
    executivoDeVenda: null,
  });

  // Single params object drives each API call — all changes go through setParams.
  const [params, setParams] = useState<Params>(INITIAL_PARAMS);

  // Separate raw query state for the controlled input (debounced into params.q).
  const [rawQuery, setRawQuery] = useState("");

  // Sequence counter to discard stale responses.
  const seqRef = useRef(0);

  // Keep a stable ref to the latest `load` prop so doLoad never depends on
  // it directly — prevents infinite re-fetch when callers pass inline arrows.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  // ------------- data loading -------------------------------------------

  const doLoad = useCallback(
    (p: Params) => {
      const seq = ++seqRef.current;
      setStatus("loading");
      setError("");

      const apiParams: PortfolioParams = {
        page: p.page,
        limit: PAGE_SIZE,
        tab: p.tab,
        q: p.q,
        sortBy: p.sort?.by,
        sortOrder: p.sort?.dir,
      };

      loadRef
        .current(apiParams)
        .then((result) => {
          if (seq !== seqRef.current) return; // stale
          setItems(result.items);
          setCounts(result.counts);
          setTotal(result.total);
          setProspectsEnabled(result.prospectsEnabled);
          setJanela(result.janela);
          setCarteira(result.carteira);
          setForaDoRecorte(result.foraDoRecorte ?? 0);
          setStatus("loaded");
        })
        .catch((err: unknown) => {
          if (seq !== seqRef.current) return;
          setError(
            err instanceof Error ? err.message : "Erro ao carregar clientes.",
          );
          setStatus("error");
        });
    },
    [], // stable — reads load via loadRef so identity changes never re-trigger
  );

  // Re-load whenever params change.
  useEffect(() => {
    doLoad(params);
  }, [doLoad, params]);

  // ------------- debounce rawQuery → params.q ---------------------------

  useEffect(() => {
    const id = setTimeout(() => {
      setParams((prev) => {
        const newQ = rawQuery.trim();
        if (newQ === prev.q) return prev; // no change → avoid re-fetch
        return { ...prev, q: newQ, page: 1 };
      });
    }, 300);
    return () => clearTimeout(id);
  }, [rawQuery]);

  // ------------- event handlers -----------------------------------------

  const handleTabChange = (tab: PortfolioTab) => {
    setParams((prev) => ({ ...prev, tab, page: 1 }));
  };

  const handleSort = (col: SortableColumn) => {
    setParams((prev) => {
      const active = prev.sort?.by === col;
      return {
        ...prev,
        sort: active
          ? { by: col, dir: prev.sort!.dir === "asc" ? "desc" : "asc" }
          : { by: col, dir: "asc" },
        page: 1,
      };
    });
  };

  const handlePage = (p: number) => {
    setParams((prev) => ({ ...prev, page: p }));
  };

  const handleRetry = () => doLoad(params);

  // ------------- render -------------------------------------------------

  const isLoading = status === "loading";

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="my-1 text-(length:--t-h2) font-bold tracking-[-0.6px]">
            Clientes
          </h1>
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            {/*
              * ADO 67597 — o subtítulo diz QUAL lista está na tela.
              *
              * O protótipo (`10-clientes.html:66`) chama a tela de "Carteira", e
              * até aqui ela mostrava a base do escopo inteira sob esse nome. As
              * duas listas renderizavam idênticas, então o usuário não tinha como
              * saber qual estava lendo — e "trazer os clientes da carteira" é
              * justamente o que o ticket pede.
              *
              * A frase do motivo vem do BACKEND (`motivoLabel`), não de uma
              * tabela local: o recorte é decisão dele, e um motivo novo apareceria
              * aqui como código cru.
              */}
            {carteira.modo === 'propria' ? (
              <span data-testid="carteira-propria">
                Minha carteira
                {carteira.executivoDeVenda === null
                  ? ''
                  : ` · ${carteira.executivoDeVenda}`}{' '}
                · <b>{counts.registered}</b> cadastrados.
              </span>
            ) : status === "loaded" || (isLoading && counts.all > 0) ? (
              /*
               * `amostra` ⇒ the CRM truncated the base, so `counts` is NOT the
               * portfolio. NO number is shown at all in this state: the listing
               * is not scoped to the LT yet (VBR-487), so every count available
               * here describes an arbitrary 200-row window out of 1.055.564
               * accounts — and counting the real base costs 8,5 s per request.
               *
               * Reverting is a one-line change: `janela.limiteJanela` still
               * travels in the payload, so putting the number back is putting
               * the `<b>` back.
               */
              janela.amostra ? (
                <>
                  Carteira VAR · amostra dos clientes cadastrados mais recentes.
                  Use a busca para encontrar um cliente específico.
                </>
              ) : (
                <>
                  Carteira VAR · <b>{counts.registered}</b> cadastrados ·{" "}
                  <b>{counts.prospect}</b> prospects.
                </>
              )
            ) : (
              "Carteira VAR · consulta e visão 360º do cliente."
            )}
            {/*
              * O motivo só aparece quando a lista NÃO é a carteira: numa carteira
              * própria não há lacuna a nomear, e a frase seria ruído.
              */}
            {carteira.modo === 'completa' && carteira.motivoLabel !== null && (
              <span
                className="mt-0.5 block text-(--yellow-700)"
                data-testid="carteira-motivo"
              >
                {carteira.motivoLabel}
              </span>
            )}
          </p>
        </div>
        <NewOpportunityButton />
      </div>

      {/* Loading skeleton */}
      {isLoading && items.length === 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="space-y-2"
        >
          <span className="sr-only">Carregando clientes…</span>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <Message>
          <p className="text-(--color-danger)">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-3 cursor-pointer font-bold text-(--secondary-600) hover:underline"
          >
            Tentar novamente
          </button>
        </Message>
      )}

      {/* Loaded / subsequent loading (keeps toolbar + table visible) */}
      {(status === "loaded" || (isLoading && items.length > 0)) && (
        <>
          {/* Toolbar: tabs + search */}
          <div className="my-4 flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label="Filtrar por tipo"
              className="flex flex-wrap gap-1.5"
            >
              {TABS.map(({ key, label }) => {
                const active = params.tab === key;
                const count = tabCount(key, counts);
                // Prospects hidden "por ora": the backend owns the decision
                // (`prospectsEnabled` in the payload); the tab stays visible but
                // disabled while it is false.
                const disabled = key === "prospect" && !prospectsEnabled;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    disabled={disabled}
                    aria-disabled={disabled}
                    title={
                      disabled
                        ? "Prospects indisponíveis no momento"
                        : undefined
                    }
                    onClick={() => {
                      if (!disabled) handleTabChange(key);
                    }}
                    className={`rounded-[var(--radius-xs)] border px-3.5 py-2 text-(length:--t-caption) font-bold ${
                      disabled
                        ? "cursor-not-allowed border-(--color-border) bg-white text-(--color-text-muted) opacity-50"
                        : active
                          ? "cursor-pointer border-(--neutral-900) bg-(--neutral-900) text-white"
                          : "cursor-pointer border-(--color-border) bg-white text-(--color-text-muted) hover:bg-(--neutral-40)"
                    }`}
                  >
                    {label}
                    {/* Same reason as the subtitle: a count over a truncated,
                        unscoped window reads as a portfolio total. The tabs stay
                        as filters; only the badge is withheld (VBR-487).

                        The leading space is INSIDE the branch on purpose: JSX
                        drops whitespace that sits alone on a line, so writing it
                        outside makes the accessible name "Todos3". */}
                    {!janela.amostra && (
                      <>
                        {" "}
                        <span className="ml-1 text-[11px] opacity-70">{count}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <input
              type="search"
              aria-label="Buscar cliente"
              value={rawQuery}
              onChange={(e) => setRawQuery(e.target.value)}
              placeholder="Buscar por Código SAP, CNPJ, nome ou cidade..."
              // Prototype `.search.in`: filled gray field, no border except a 2px
              // bottom (green on focus), no radius — flex:1, min-width 220px.
              className="min-w-55 flex-1 rounded-none border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) px-3 py-2.75 text-(length:--t-caption) text-(--neutral-800) placeholder:text-(--neutral-500) focus:border-(--secondary-600) focus:outline-none"
            />
          </div>

          {/* Table or empty state */}
          {items.length === 0 && !isLoading ? (
            <Message>Nenhum cliente encontrado para os filtros atuais.</Message>
          ) : (
            <div className="relative overflow-x-auto rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface)">
              {/* While refreshing, dim + disable the table and center a spinner
                  over it (keeps layout stable, blocks interaction). */}
              {isLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/30">
                  <Spinner size="lg" label="Atualizando clientes…" />
                  <span
                    aria-hidden
                    className="text-(length:--t-caption) font-bold text-(--color-text-muted) italic"
                  >
                    Atualizando…
                  </span>
                </div>
              )}
              <table
                aria-busy={isLoading}
                className={`w-full min-w-[900px] border-collapse text-(length:--t-caption) transition-opacity ${
                  isLoading ? "pointer-events-none select-none opacity-50" : ""
                }`}
                aria-label="Carteira de clientes"
              >
                <thead>
                  <tr className="bg-(--neutral-50) text-left text-(length:--t-caption) font-bold tracking-wide whitespace-nowrap text-(--neutral-800)">
                    {/* Fixed minimum width so long legal names don't get
                        squeezed by the other columns. */}
                    <th className="min-w-50 px-4 py-3">
                      <SortHeader
                        label="Cliente"
                        colKey="name"
                        sort={params.sort}
                        onSort={handleSort}
                      />
                    </th>
                    {/* ADO 68073 — a coluna do protótipo (`10-clientes.html`).
                        O CARD da 360º segue oculto: eixo próprio. */}
                    {SHOW_COMPANY_GROUP_COLUMN && (
                      <th className="px-4 py-3 font-bold">Grupo empresa</th>
                    )}
                    <th className="px-4 py-3">
                      <SortHeader
                        label="Bandeira"
                        colKey="flag"
                        sort={params.sort}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader
                        label="Localização"
                        colKey="location"
                        sort={params.sort}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-4 py-3 font-bold">VMM</th>
                    <th className="px-4 py-3 font-bold">Vigência</th>
                    <th className="px-4 py-3">
                      <SortHeader
                        label="Oportunidade em fluxo"
                        colKey="inFlowOpportunity"
                        sort={params.sort}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-4 py-3">
                      <SortHeader
                        label="Docs anexados"
                        colKey="docsCount"
                        sort={params.sort}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((client) => (
                    <tr
                      key={client.id}
                      className="border-t border-(--color-border) hover:bg-(--neutral-40)"
                    >
                      {/* Cliente */}
                      <td className="px-4 py-3">
                        <Link href={`/clientes/${client.id}`} className="block">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-(--neutral-900)">
                              {client.name}
                            </span>
                            {client.kind === "prospect" && (
                              <StatusPill variant="warning">
                                Prospect
                              </StatusPill>
                            )}
                            {client.franchiseOf && (
                              <StatusPill variant="info">
                                Franquia
                              </StatusPill>
                            )}
                          </span>
                          <span className="block text-(length:--t-small) text-(--color-text-muted)">
                            {client.sapCode !== "—" ? (
                              <span className="rounded-[4px] bg-(--secondary-100) px-1.5 py-px font-bold text-(--secondary-700)">
                                SAP {client.sapCode}
                              </span>
                            ) : (
                              <span>SAP —</span>
                            )}{" "}
                            · {client.document}
                          </span>
                          {client.franchiseOf && (
                            <span className="block text-(length:--t-small) text-(--color-text-muted)">
                              Franquia de {client.franchiseOf.legalName} (SAP{" "}
                              {client.franchiseOf.sapCode})
                            </span>
                          )}
                        </Link>
                      </td>

                      {/*
                       * Grupo empresa — dado cadastral do Salesforce. `—` é a
                       * resposta de negócio ("conta sem grupo"), não lacuna de
                       * integração: ~97% das contas não têm o lookup (ADR-0021).
                       */}
                      {SHOW_COMPANY_GROUP_COLUMN && (
                        <td className="px-4 py-3 text-(--neutral-900)">
                          {client.empresaGroup ?? <Muted>—</Muted>}
                        </td>
                      )}

                      {/* Bandeira */}
                      <td className="px-4 py-3">
                        <FlagBadge flag={client.flag} gap={client.flagGap} />
                      </td>

                      {/* Localização */}
                      <td className="px-4 py-3 text-(--neutral-900)">
                        {client.location || <Muted>—</Muted>}
                      </td>

                      {/* VMM — source: Salesforce Account.VMM__c (Bug 67505).
                          Gap-aware: vmmGap distinguishes "sem VMM no cadastro"
                          (SEM_REGISTRO) from a source outage (INDISPONIVEL),
                          mirroring the flagGap pattern from the Bandeira column. */}
                      <td className="whitespace-nowrap px-4 py-3 text-(--neutral-900)">
                        {client.vmm != null ? (
                          `${client.vmm.toLocaleString("pt-BR")} m³/mês`
                        ) : client.vmmGap ? (
                          <span
                            title={client.vmmGap.title}
                            className="text-(--color-text-muted) italic"
                          >
                            {client.vmmGap.label}
                          </span>
                        ) : (
                          <Muted>—</Muted>
                        )}
                      </td>

                      {/* Vigência — contrato de FORNECIMENTO ativo e vigente,
                          do `Contract` do Salesforce (o espelho do SAP).
                          Gap-aware pelo mesmo padrão de Bandeira e VMM: a
                          célula vazia diz POR QUÊ em vez de repetir o traço
                          mudo que ela exibia enquanto a coluna dependia de uma
                          integração que nunca existiu (VBR-98). */}
                      <td className="whitespace-nowrap px-4 py-3 text-(--neutral-900)">
                        {client.vigencia ? (
                          client.vigencia
                        ) : client.vigenciaGap ? (
                          <span
                            title={client.vigenciaGap.title}
                            className="text-(--color-text-muted) italic"
                          >
                            {client.vigenciaGap.label}
                          </span>
                        ) : (
                          <Muted>—</Muted>
                        )}
                      </td>

                      {/* Oportunidade em fluxo */}
                      <td className="px-4 py-3">
                        {client.inFlowOpportunity ?? <Muted>—</Muted>}
                      </td>

                      {/* Docs */}
                      <td className="px-4 py-3">
                        <DocsCell count={client.docsCount} />
                      </td>

                      {/* Action */}
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Link
                          href={`/clientes/${client.id}`}
                          className="whitespace-nowrap font-bold text-(--secondary-600) hover:underline"
                          aria-label={`Abrir ${client.name}`}
                        >
                          Abrir ›
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/*
            NOTA (09/09/2026): a nota de rodapé "* Vigência indisponível —
            aguardando integração SAP" foi REMOVIDA.

            Ela era verdadeira enquanto a coluna vinha do `ErpProvider`
            (SAP/MuleSoft, canal nunca contratado — VBR-98) e chegava vazia em
            100% das linhas. Com a Vigência lida do `Contract` do Salesforce, a
            frase passaria a acusar integração pendente sobre uma coluna que
            responde — e apareceria em TODA página, porque o adapter do ERP
            segue recusando o que resta daquela porta.

            Quem explica a célula vazia agora é `vigenciaGap`, POR LINHA: a
            causa não é uniforme (93% das contas simplesmente não têm contrato
            de fornecimento vigente), e um flag de página não sabe dizer qual
            linha é qual — que é o mesmo raciocínio da VBR-539 na Bandeira.
          */}

          {/*
            ADO 67860 — a diferença entre o contador da aba e as linhas é
            NOMEADA, nunca deixada para o leitor descobrir.

            O contador é a contagem real da fonte de oportunidades (o Bug 67550
            proibiu interseccioná-lo com a janela da carteira, que não é
            superconjunto); as linhas aplicam o recorte de cliente. Quando os
            dois discordam, a frase diz por quê — sem ela, a tela afirma dois
            números e não explica nenhum.

            É informativa, não um alerta: nada falhou, e o `tone` de erro
            acusaria defeito onde há recorte.
          */}
          {foraDoRecorte > 0 && (
            <p
              data-testid="clientes-fora-do-recorte"
              className="mt-2 text-(length:--t-small) text-(--color-text-muted) italic"
            >
              {foraDoRecorte === 1
                ? "1 cliente desta aba está fora do recorte atual e não é exibido na tabela"
                : `${foraDoRecorte} clientes desta aba estão fora do recorte atual e não são exibidos na tabela`}{" "}
              — por isso o contador da aba é maior.
            </p>
          )}

          {/* Pagination */}
          <Paginator
            page={params.page}
            total={total}
            pageSize={PAGE_SIZE}
            limiteJanela={janela.limiteJanela}
            onPage={handlePage}
          />
        </>
      )}
    </div>
  );
}
