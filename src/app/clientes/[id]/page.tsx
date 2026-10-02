import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { ClientBreadcrumb } from '@/components/clients/client-breadcrumb';
import { ClientDetailView } from '@/components/clients/client-detail';

export const metadata: Metadata = {
  title: 'Cliente · Visão 360º',
};

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell
      breadcrumb={<ClientBreadcrumb clientId={id} />}
    >
      <ClientDetailView clientId={id} />
    </AppShell>
  );
}
