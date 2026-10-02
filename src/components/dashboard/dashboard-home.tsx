'use client';

import { useEffect, useState } from 'react';

import { ClientSearchBox } from '@/components/clients/client-search-box';
import { Spinner } from '@/components/spinner';
import { WelcomeHeader } from '@/components/welcome-header';
import { getDashboardResumo } from '@/lib/dashboard/dashboard.data';
import type { DashboardResumo } from '@/lib/dashboard/resumo-mapping';

import { DashboardGrid } from './dashboard-grid';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /**
   * Injectable data source for tests. Defaults to the configured BFF client.
   *
   * Injecting this lets each test control the 4 card states (loading, ok,
   * empty, error) without network calls:
   *
   * ```tsx
   * render(<DashboardHome fetchResumo={() => Promise.resolve(mockData)} />);
   * render(<DashboardHome fetchResumo={() => Promise.reject(new Error())} />);
   * ```
   */
  fetchResumo?: () => Promise<DashboardResumo>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Home / Resumo Executivo (DASH-F1 · HU-01/HU-02).
 *
 * Orchestrates the dashboard data fetch and distributes the result to child
 * components:
 * - {@link WelcomeHeader} — greeting + critical-items phrase (CA-4).
 * - {@link ClientSearchBox} — always present (CLI-F1).
 * - {@link DashboardGrid} — widget composition for this persona (CA-1/CA-2/CA-3).
 *
 * Design rule (from AnaliseView precedent): wait for the session/data before
 * committing to a composition.  Rendering the wrong widgets and swapping a tick
 * later flashes the user a wrong screen.  Instead: spinner → data → widgets.
 *
 * The persona composition comes from the backend, not from `if (role === …)`
 * branches in this component.
 */
export function DashboardHome({ fetchResumo = getDashboardResumo }: Props) {
  type FetchStatus = 'loading' | 'ok' | 'error';

  const [status, setStatus] = useState<FetchStatus>('loading');
  const [data, setData] = useState<DashboardResumo | null>(null);

  useEffect(() => {
    let active = true;

    fetchResumo()
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
  }, [fetchResumo]);

  const saudacao = status === 'ok' ? data?.saudacao : null;

  return (
    <>
      {/* Greeting + critical-items phrase (CA-4: phrase hidden while loading or when null) */}
      <WelcomeHeader
        itensCriticos={saudacao?.itensCriticos ?? null}
        tarefasAbertas={saudacao?.tarefasAbertas ?? null}
      />

      {/* Buscar cliente — always visible (CLI-F1) */}
      <ClientSearchBox />

      {/* Dashboard content */}
      {status === 'loading' && (
        <div className="flex justify-center py-16">
          <Spinner label="Carregando resumo…" />
        </div>
      )}

      {status === 'error' && (
        <p
          role="alert"
          className="mt-4 text-center text-(length:--t-caption) text-(--color-text-muted)"
        >
          Não foi possível carregar o resumo executivo. Tente novamente mais tarde.
        </p>
      )}

      {status === 'ok' && (
        <DashboardGrid
          widgets={data?.widgets ?? []}
          data={data}
          loading={false}
        />
      )}
    </>
  );
}
