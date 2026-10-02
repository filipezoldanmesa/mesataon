'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { BlocoFranquia } from '@/lib/franquia/ajuste';

/**
 * Analysis (read-only) mode for the franchise proposal screen (FRQ-14).
 *
 * ## Who decides the mode
 *
 * The **audience**, not a query string. The prototype switches with
 * `?preenchida=1`/`?modo=analise` because a static page had no session; here the
 * mode is "a profile holding the analysis permission is opening a proposal that
 * is in analysis". Same reasoning as `AnaliseView` resolving LT × SNEG, and the
 * same reason the "Ver como SNEG →" link was removed in ADR-0018.
 *
 * The mode does **not** grant or remove authority: the write controls were
 * already closed by `editavelPorFranquia` (the backend marks every block
 * non-editable once the proposal leaves EM_PREENCHIMENTO/DEVOLVIDA). What it
 * adds is the analyst's own affordances — collapsible cards and a per-block
 * "Solicitar ajuste".
 *
 * Passed through context rather than five levels of props: every block needs
 * the same three things, and `Block` is the single place that renders them.
 */
export interface AnaliseModeValue {
  /** Blocks already flagged in this session — drives the "ajuste solicitado" tag. */
  blocosSolicitados: ReadonlySet<BlocoFranquia>;
  /** Opens the "Solicitar ajuste" modal for a block. */
  onSolicitarAjuste: (bloco: BlocoFranquia) => void;
}

const AnaliseModeContext = createContext<AnaliseModeValue | null>(null);

export function AnaliseModeProvider({
  value,
  children,
}: {
  /** `null` ⇒ the screen is NOT in analysis mode; blocks render plainly. */
  value: AnaliseModeValue | null;
  children: ReactNode;
}) {
  return (
    <AnaliseModeContext.Provider value={value}>
      {children}
    </AnaliseModeContext.Provider>
  );
}

/** `null` when the screen is not in analysis mode. */
export function useAnaliseMode(): AnaliseModeValue | null {
  return useContext(AnaliseModeContext);
}
