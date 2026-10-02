import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { ScenarioComparison } from '@/components/opportunities/scenario-comparison';

export const metadata: Metadata = {
  title: 'Comparação de cenários · Vibra Gestor de Oportunidades',
};

/**
 * Scenario comparison screen (OPP-F5 — 02-comparacao-cenarios.html).
 *
 * The page title and "← Voltar" ghost button are rendered by the client
 * component `ScenarioComparison`; the full-width breadcrumb bar lives in the
 * AppShell slot (route code as label — no extra fetch).
 */
export default async function ComparacaoCenariosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell
      breadcrumb={
        <OpportunityBreadcrumb
          opportunityId={id}
          leaf={['Comparação de cenários']}
        />
      }
    >
      <ScenarioComparison opportunityId={id} />
    </AppShell>
  );
}
