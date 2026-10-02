'use client';

import { DashboardCard, SectionHead } from './dashboard-card';
import { TopByValueTable } from './top-by-value-table';
import { usePipelineData } from './pipeline-data-context';

/**
 * "Principais por valor" card (DASH-F2 · HU-03.1 / RN-F2-01).
 *
 * Half-width card of the bottom grid, holding the sortable top-N table —
 * the prototype's `.card` at 01-visao-geral.html lines 172–178.
 */
export function PrincipaisPorValorCard() {
  const { status, data } = usePipelineData();

  return (
    <DashboardCard>
      <SectionHead
        title="Principais por valor"
        linkHref="/oportunidades"
        linkLabel="Exibir todas ›"
      />
      <TopByValueTable
        loading={status === 'loading'}
        rows={status === 'error' ? null : data?.principaisPorValor}
        errorFonte="pipeline"
      />
    </DashboardCard>
  );
}
