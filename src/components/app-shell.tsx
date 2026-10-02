import type { ReactNode } from 'react';

import { AuthProvider } from '@/components/auth/auth-provider';
import { HeaderNav } from '@/components/header-nav';

/**
 * Authenticated app shell: global header + a centered content container.
 * Every protected route (guarded by src/middleware.ts) renders inside it.
 *
 * <AuthProvider> is mounted here (not in the root layout) so that /login and
 * other public routes never trigger a GET /api/auth/me call.
 *
 * `breadcrumb` is an optional full-width strip rendered between the header and
 * the centered content (prototype `.breadcrumb`, which spans the viewport while
 * its inner aligns to the grid). Pass a `<Breadcrumb />`.
 */
export function AppShell({
  children,
  breadcrumb,
}: {
  children: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-(--color-bg)">
        <HeaderNav />
        {breadcrumb}
        {/* Prototype `.container`: padding 32px 24px 64px. */}
        <main className="mx-auto max-w-(--grid-max) px-6 pt-8 pb-16">{children}</main>
      </div>
    </AuthProvider>
  );
}
