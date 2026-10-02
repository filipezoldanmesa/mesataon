'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { getDashboardPipeline } from '@/lib/dashboard/pipeline.api';
import type { PipelineData } from '@/lib/dashboard/pipeline-types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export type PipelineFetchStatus = 'loading' | 'ok' | 'error';

export type PipelineDataState = {
  status: PipelineFetchStatus;
  data: PipelineData | null;
};

const PipelineDataContext = createContext<PipelineDataState>({
  status: 'loading',
  data: null,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type ProviderProps = {
  children: ReactNode;
  /**
   * Injectable data source for tests.  Defaults to the BFF client
   * (`GET /api/dashboard/pipeline`).
   *
   * **Stability contract:** `fetchData` is listed in the `useEffect` dependency
   * array.  Callers MUST pass a stable reference (module-level function or one
   * wrapped in `useCallback`); an inline arrow function will re-trigger the
   * fetch on every render.
   */
  fetchData?: () => Promise<PipelineData>;
};

/**
 * Single fetch of `/api/dashboard/pipeline` shared by the three sections it
 * feeds — the KPI row, the "Pipeline por fase" card and the "Principais por
 * valor" card.
 *
 * The prototype spreads those three across the page (a full-width KPI band, a
 * full-width phase card, and a half-width table in the bottom grid), so they
 * can no longer live inside one component.  Without this provider each of them
 * would self-fetch and the dashboard would hit the same endpoint three times on
 * every render of the home screen.
 */
export function PipelineDataProvider({
  children,
  fetchData = getDashboardPipeline,
}: ProviderProps) {
  const [state, setState] = useState<PipelineDataState>({ status: 'loading', data: null });

  useEffect(() => {
    let active = true;

    fetchData()
      .then((d) => {
        if (!active) return;
        setState({ status: 'ok', data: d });
      })
      .catch(() => {
        if (!active) return;
        setState({ status: 'error', data: null });
      });

    return () => {
      active = false;
    };
  }, [fetchData]);

  return (
    <PipelineDataContext.Provider value={state}>{children}</PipelineDataContext.Provider>
  );
}

/** Reads the shared pipeline fetch. Returns `loading` when used outside a provider. */
export function usePipelineData(): PipelineDataState {
  return useContext(PipelineDataContext);
}
