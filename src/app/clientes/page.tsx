import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { Breadcrumb } from '@/components/breadcrumb';
import { ClientSearch } from '@/components/clients/client-search';

export const metadata: Metadata = {
  title: 'Clientes · Vibra Gestor de Oportunidades',
};

export default function ClientesPage() {
  return (
    <AppShell breadcrumb={<Breadcrumb items={[{ label: 'Clientes' }]} />}>
      <ClientSearch />
    </AppShell>
  );
}
