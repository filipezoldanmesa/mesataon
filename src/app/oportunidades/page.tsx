import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { Breadcrumb } from '@/components/breadcrumb';
import { OpportunityList } from '@/components/opportunities/opportunity-list';

export const metadata: Metadata = {
  title: 'Oportunidades · Vibra Gestor de Oportunidades',
};

export default function OportunidadesPage() {
  return (
    <AppShell breadcrumb={<Breadcrumb items={[{ label: 'Oportunidades' }]} />}>
      <OpportunityList />
    </AppShell>
  );
}
