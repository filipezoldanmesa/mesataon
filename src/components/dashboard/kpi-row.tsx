'use client';

import type { Recorte } from '@/lib/dashboard/types';

import { KpiGrade } from './kpi-grade';
import { usePipelineData } from './pipeline-data-context';

type Props = {
  /** Data scope of the current persona — forwarded to {@link KpiGrade} to label "Pendências abertas". */
  recorte?: Recorte | null;
};

/**
 * Full-width KPI band of the home dashboard (DASH-F2 · RN-F2-02).
 *
 * Reads the shared pipeline fetch and renders {@link KpiGrade} directly on the
 * page background — the prototype puts these 5 cards above the "Pendências"
 * card, not inside any panel (01-visao-geral.html lines 113–120).
 */
export function KpiRow({ recorte }: Props) {
  const { status, data } = usePipelineData();

  return (
    <section aria-label="KPIs operacionais">
      <KpiGrade
        loading={status === 'loading'}
        kpis={status === 'error' ? null : data?.kpis}
        errorFonte="pipeline"
        recorte={recorte ?? undefined}
      />
    </section>
  );
}
