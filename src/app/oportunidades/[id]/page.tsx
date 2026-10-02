import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { OpportunityDetail } from '@/components/opportunities/opportunity-detail';

export const metadata: Metadata = {
  title: 'Detalhe da oportunidade · Vibra Gestor de Oportunidades',
};

export default async function OportunidadeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell breadcrumb={<OpportunityBreadcrumb opportunityId={id} />}>
      <OpportunityDetail opportunityId={id} />
    </AppShell>
  );
}
