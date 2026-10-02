import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { Breadcrumb } from '@/components/breadcrumb';
import { PendenciasPanel } from '@/components/pendencias/pendencias-panel';

export const metadata: Metadata = {
  title: 'Pendências · Vibra Gestor de Oportunidades',
};

export default function PendenciasPage() {
  return (
    <AppShell breadcrumb={<Breadcrumb items={[{ label: 'Pendências' }]} />}>
      {/*
       * Suspense boundary is required because PendenciasPanel calls
       * useSearchParams() — Next.js mandates wrapping client components that
       * read search params in <Suspense> during SSR.
       */}
      <Suspense>
        <PendenciasPanel />
      </Suspense>
    </AppShell>
  );
}
