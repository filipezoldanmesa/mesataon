import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { Breadcrumb } from '@/components/breadcrumb';
import { PendenciaTicket } from '@/components/pendencias/pendencia-ticket';
import { getSessionUserId } from '@/lib/server/session';

export const metadata: Metadata = {
  title: 'Ticket de pendência · Vibra Gestor de Oportunidades',
};

export default async function PendenciaTicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Resolved server-side so the thread can mark the user's own messages
  // (`.msg.me`) without a second `/me` fetch in the browser.
  const currentUserId = await getSessionUserId();

  return (
    <AppShell
      breadcrumb={
        <Breadcrumb
          items={[
            { label: 'Pendências', href: '/pendencias' },
            { label: 'Ticket' },
          ]}
        />
      }
    >
      <PendenciaTicket pendenciaId={id} currentUserId={currentUserId} />
    </AppShell>
  );
}
