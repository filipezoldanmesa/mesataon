"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { BlocoProposta } from "@/lib/proposals/ajuste";

/**
 * View mode for the posto (PCR) proposal blocks — the PCR mirror of the
 * franchise `AnaliseModeProvider` (FRQ-14), extended with an explicit
 * read-only flag because the PCR blocks gate their edit controls by ROLE
 * (`canWrite`) rather than by a backend `editavelPorFranquia` map.
 *
 * ## Who decides the mode
 *
 * The **audience and the phase**, not a query string: the prototype layer
 * `analise-proposta.js` (loaded by `03-proposta-analise.html`) switches with
 * `?role=` only because a static page had no session. Here:
 *
 * - proposal `EM_ANALISE` ⇒ `readOnly` for EVERY profile — the prototype
 *   disables all fields and hides every edit CTA for the LT too ("Somente-
 *   leitura · oportunidade em análise pela SNEG");
 * - profile holding `Permission.SnegAnalysis` ⇒ `analise` affordances on top:
 *   the per-block "Solicitar ajuste" that opens (or reuses) a pendência to
 *   the LT (RN-F3-01/F2-03).
 *
 * Hiding controls is UX, not security: the backend already refuses writes on
 * a proposal outside EM_PREENCHIMENTO/DEVOLVIDA — the mode makes the screen
 * tell the truth about it.
 *
 * Passed through context rather than seven levels of props: every block needs
 * the same flags, and each block header is the single place that renders the
 * affordances.
 */
export interface ProposalAnaliseAffordances {
  /** Blocks already flagged in this session — drives the "ajuste solicitado" tag. */
  blocosSolicitados: ReadonlySet<BlocoProposta>;
  /** Opens the "Solicitar ajuste" modal for a block. */
  onSolicitarAjuste: (bloco: BlocoProposta) => void;
}

export interface ProposalViewMode {
  /** true ⇒ every edit control is hidden (proposal under analysis). */
  readOnly: boolean;
  /** Analyst affordances; `null` for every profile without SnegAnalysis. */
  analise: ProposalAnaliseAffordances | null;
}

const DEFAULT_MODE: ProposalViewMode = { readOnly: false, analise: null };

const ProposalViewModeContext = createContext<ProposalViewMode>(DEFAULT_MODE);

export function ProposalViewModeProvider({
  value,
  children,
}: {
  value: ProposalViewMode;
  children: ReactNode;
}) {
  return (
    <ProposalViewModeContext.Provider value={value}>
      {children}
    </ProposalViewModeContext.Provider>
  );
}

/**
 * Defaults to editable outside a provider so the blocks keep working on the
 * creation flow (`propostas/nova`), which renders them without the panel.
 */
export function useProposalViewMode(): ProposalViewMode {
  return useContext(ProposalViewModeContext);
}

/**
 * Header affordances of one PCR block in analysis mode: the "ajuste
 * solicitado" tag and the "Solicitar ajuste" button. Renders nothing outside
 * analysis mode, so blocks can mount it unconditionally in their header row.
 *
 * ## `[&+button]:ml-0` — why the chevron has to give up its `ml-auto`
 *
 * The header row is `[h3] [this] [CardCollapseToggle]`, and the toggle carries
 * its own `ml-auto` (it needs it on the cards that have no adjust button).
 * Flexbox splits the free space EQUALLY between every auto margin, so with two
 * of them the button landed halfway between the title and the chevron instead
 * of beside it. Zeroing the next sibling's margin leaves a single auto margin —
 * this one — so the pair sits flush right, as the prototype draws it.
 *
 * The variant is on THIS element on purpose: it is the one that knows it is
 * taking over the right-alignment. `+button` (not `~*`) also outranks the
 * `.ml-auto` utility by specificity, instead of depending on rule order.
 */
export function BlocoAjusteAction({ bloco }: { bloco: BlocoProposta }) {
  const { analise } = useProposalViewMode();
  if (analise === null) return null;

  const jaSolicitado = analise.blocosSolicitados.has(bloco);

  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 [&+button]:ml-0">
      {jaSolicitado && (
        <span
          className="rounded-[var(--radius-xxs)] border border-(--yellow-300) bg-(--yellow-100) px-2 py-0.5 text-[12px] font-bold text-(--yellow-700)"
          data-testid={`ajuste-solicitado-${bloco}`}
        >
          ajuste solicitado
        </span>
      )}
      {/*
       * Prototype `.btn.btn-ghost` — `--neutral-25` fill, `--secondary-500`
       * border and text, `--radius-xxs`, `--t-caption` (14px), hover
       * `--neutral-50`. The hand-rolled recipe this replaces was a different
       * button: 12px text, half the padding, `--radius-xs` and `--secondary-600`
       * on a transparent fill.
       *
       * Same recipe as `BTN_GHOST` in `franquia-ui.tsx`, so the two analysis
       * screens render identical CTAs; inlined rather than imported so a
       * proposals component does not depend on a franquia primitive.
       */}
      <button
        type="button"
        onClick={() => analise.onSolicitarAjuste(bloco)}
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2.25 text-(length:--t-caption) font-bold text-(--secondary-500) transition hover:bg-(--neutral-50)"
        data-testid={`solicitar-ajuste-${bloco}`}
      >
        Solicitar ajuste
      </button>
    </span>
  );
}
