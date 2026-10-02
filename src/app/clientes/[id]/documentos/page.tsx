import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { ClientBreadcrumb } from '@/components/clients/client-breadcrumb';
import { ClientRepository } from '@/components/documents/client-repository';

export const metadata: Metadata = {
  title: 'Cliente · Documentos (Repositório)',
};

export default async function ClienteDocumentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell
      breadcrumb={<ClientBreadcrumb clientId={id} leaf={['Documentos']} />}
    >
      <ClientRepository clientId={id} />
    </AppShell>
  );
}
