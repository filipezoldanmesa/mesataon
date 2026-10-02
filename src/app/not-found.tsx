import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { NotFoundScreen } from '@/components/not-found-screen';

export const metadata: Metadata = {
  title: 'Página não encontrada · Vibra Gestor de Oportunidades',
};

/**
 * App-wide 404. Renders the very same {@link NotFoundScreen} a gated route shows,
 * so "does not exist" and "not for your profile" are indistinguishable from the
 * outside (see the component docblock).
 */
export default function NotFound() {
  return (
    <AppShell>
      <NotFoundScreen />
    </AppShell>
  );
}
