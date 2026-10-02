"use client";

import {
  CardCollapseToggle,
  useCardCollapse,
} from "@/components/proposals/card-collapse";
import { useCallback, useEffect, useRef, useState } from "react";

import { getMarketIntelligence as defaultLoad } from "@/lib/proposals/market-intelligence.data";
import type {
  MarketIntelligence,
  MarketshareEntry,
} from "@/lib/proposals/types";
import { isExpiredSessionError } from "@/lib/api-errors";
import { redirectToLogin } from "@/lib/auth";
import { withOneRetry } from "@/lib/with-retry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = "loading" | "loaded" | "error";

type Props = {
  proposalId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  load?: (id: string) => Promise<MarketIntelligence | null>;
  /** Injectable for tests; defaults to NEXT_PUBLIC_TABLEAU_MARKET_URL. */
  tableauUrl?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formats a number as m³/mês (e.g. "320 m³/mês"). Returns "****" when null (data unavailable). */
function formatVmm(value: number | null): string {
  if (value === null) return "****";
  return `${value.toLocaleString("pt-BR")} m³/mês`;
}

/** Formats an ISO-8601 timestamp as a localised date+time string. */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * External link to the Tableau market-intelligence dashboard.
 * Renders nothing when `url` is absent — satisfies CA-3 (no fallback to `#`).
 */
function TableauLink({ url }: { url: string | undefined }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="tableau-link"
      className="mt-1 inline-block rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--neutral-40) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-600) transition hover:bg-(--neutral-100)"
    >
      ↻ Consultar Tableau
    </a>
  );
}

function VmmGrid({ data }: { data: MarketIntelligence }) {
  const cells: Array<{ label: string; value: string }> = [
    { label: "VMM médio do bairro", value: formatVmm(data.vmmMedioBairro) },
    { label: "VMM médio da cidade", value: formatVmm(data.vmmMedioCidade) },
    { label: "VMM do posto (vinculação)", value: formatVmm(data.vmmPosto) },
    { label: "Postos urbanos", value: String(data.postosUrbanos) },
    { label: "Postos rodoviários", value: String(data.postosRodoviarios) },
  ];

  return (
    <div className="mt-3 grid grid-cols-2 gap-2" data-testid="vmm-grid">
      {cells.map(({ label, value }) => (
        <div
          key={label}
          className="rounded-[var(--radius-xs)] border border-(--color-border) p-2"
        >
          <div className="text-[14px] uppercase tracking-wide text-(--color-text-muted)">
            {label}
          </div>
          <div className="mt-1 text-(length:--t-body) font-bold">{value}</div>
        </div>
      ))}
    </div>
  );
}

function MarketshareBar({
  entry,
  isVibra,
}: {
  entry: MarketshareEntry;
  isVibra: boolean;
}) {
  return (
    <div className="my-1 flex items-center gap-2 text-[14px]">
      <span className="w-28 flex-none text-(--color-text-muted)">
        {entry.bandeira}
      </span>
      <div
        aria-hidden="true"
        className="h-2 flex-1 overflow-hidden rounded-full bg-(--neutral-100)"
      >
        <i
          style={{ width: `${entry.percentual}%` }}
          className={`block h-full rounded-full ${isVibra ? "bg-(--secondary-500)" : "bg-(--neutral-400)"}`}
        />
      </div>
      <span className="w-8 text-right font-bold">{entry.percentual}%</span>
    </div>
  );
}

function MarketshareSection({
  title,
  entries,
  testId,
}: {
  title: string;
  entries: MarketshareEntry[];
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <div className="mb-1.5 text-[14px] font-bold uppercase tracking-wide text-(--color-text-muted)">
        {title}
      </div>
      {entries.length === 0 ? (
        <p className="text-[14px] italic text-(--color-text-muted)">
          Sem dados disponíveis.
        </p>
      ) : (
        entries.map((entry) => (
          <MarketshareBar
            key={entry.bandeira}
            entry={entry}
            isVibra={entry.bandeira.toLowerCase().includes("vibra")}
          />
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MarketIntelligenceBlock({
  proposalId,
  load = defaultLoad,
  tableauUrl = process.env.NEXT_PUBLIC_TABLEAU_MARKET_URL,
}: Props) {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [data, setData] = useState<MarketIntelligence | null>(null);

  // Guard against setting state on an unmounted component
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Incremented on each fetchIntelligence call; lets in-flight .then callbacks
  // detect that a newer fetch has superseded them (e.g. proposalId changed
  // while the component stayed mounted).
  const fetchGenRef = useRef(0);

  // Initial load
  const fetchIntelligence = useCallback(() => {
    setLoadStatus("loading");
    const gen = ++fetchGenRef.current;

    withOneRetry(() => load(proposalId))
      .then((result) => {
        if (!mountedRef.current || fetchGenRef.current !== gen) return;
        setData(result);
        setLoadStatus("loaded");
      })
      .catch((err: unknown) => {
        if (isExpiredSessionError(err)) {
          redirectToLogin();
          return;
        }
        if (!mountedRef.current || fetchGenRef.current !== gen) return;
        setLoadStatus("error");
      });
  }, [proposalId, load]);

  useEffect(() => {
    fetchIntelligence();
  }, [fetchIntelligence]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Prototype: every `.block` card collapses from its own header (ciclo1.js
  // `initCollapse`), starting expanded.
  const collapse = useCardCollapse();
  return (
    <section
      aria-labelledby="market-intelligence-title"
      {...collapse.sectionProps}
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      <h3
        id="market-intelligence-title"
        {...collapse.headProps}
        className="mb-1 flex items-center gap-2.5 text-(length:--t-h4) font-bold"
      >
        Inteligência de mercado
        <CardCollapseToggle {...collapse.toggleProps} />
      </h3>

      {/* Metadata line (only when data is present) */}
      {data && loadStatus === "loaded" && (
        <p className="mb-3 text-(length:--t-small) text-(--color-text-muted)">
          Fonte: {data.fonte} · última consulta{" "}
          <strong>{formatTimestamp(data.consultadoEm)}</strong>
        </p>
      )}

      {/* Loading state */}
      {loadStatus === "loading" && (
        <div
          role="status"
          aria-label="Carregando inteligência de mercado…"
          className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="loading-state"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
          />
          Carregando…
        </div>
      )}

      {/* Error state (initial load failure) */}
      {loadStatus === "error" && (
        <div
          role="alert"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
          data-testid="load-error-state"
        >
          Falha ao carregar a inteligência de mercado. Verifique sua conexão e
          tente novamente.
          <button
            type="button"
            onClick={fetchIntelligence}
            className="ml-2 cursor-pointer font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Loaded — empty (never consulted): show only the Tableau link; no placeholder box */}
      {loadStatus === "loaded" && data === null && (
        <TableauLink url={tableauUrl} />
      )}

      {/* Loaded — data present */}
      {loadStatus === "loaded" && data !== null && (
        <div data-testid="filled-state">
          <VmmGrid data={data} />

          {/* Marketshare bars */}
          <div
            className="mt-4 grid grid-cols-2 gap-6"
            data-testid="marketshare-section"
          >
            <MarketshareSection
              title="Marketshare por bandeira · bairro"
              entries={data.marketshareBairro}
              testId="marketshare-bairro"
            />
            <MarketshareSection
              title="Marketshare por bandeira · cidade"
              entries={data.marketshareCidade}
              testId="marketshare-cidade"
            />
          </div>

          {/* External Tableau link — replaces the old refresh button (CA-4) */}
          <div className="mt-3">
            <TableauLink url={tableauUrl} />
          </div>
        </div>
      )}
    </section>
  );
}
