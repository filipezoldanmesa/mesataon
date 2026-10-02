'use client';

import { DashboardCard, SectionHead } from './dashboard-card';
import { PipelinePhases } from './pipeline-phases';
import { usePipelineData } from './pipeline-data-context';

/**
 * "Pipeline por fase" card (DASH-F2 · HU-03.1 / RN-F2-01).
 *
 * Full-width card holding the phase boxes, with "Exibir no quadro ›" in the
 * header — the prototype's `.card` at 01-visao-geral.html lines 138–149.
 */
export function PipelineFaseCard() {
  const { status, data } = usePipelineData();

  return (
    <DashboardCard>
      <SectionHead
        title="Pipeline por fase"
        linkHref="/oportunidades?view=kanban"
        linkLabel="Exibir no quadro ›"
      />
      <PipelinePhases
        loading={status === 'loading'}
        phases={status === 'error' ? null : data?.phases}
        errorFonte="pipeline"
      />
    </DashboardCard>
  );
}
