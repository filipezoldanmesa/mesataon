import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { OpportunityChecklist } from '@/components/documents/opportunity-checklist';

export const metadata: Metadata = {
  title: 'Documentos & Anexos · Oportunidade',
};

export default async function OportunidadeDocumentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell
      breadcrumb={
        <OpportunityBreadcrumb opportunityId={id} leaf={['Documentos']} />
      }
    >
      <OpportunityChecklist opportunityId={id} />
    </AppShell>
  );
}
