'use client';

import type { ReactNode } from 'react';

import { NotFoundScreen } from '@/components/not-found-screen';
import { Spinner } from '@/components/spinner';
import { usePermissions } from '@/hooks/use-permissions';
import type { Permission } from '@/lib/auth-permissions';

/**
 * Renders `children` only for a session that holds `permission`; anything else
 * gets the plain {@link NotFoundScreen}.
 *
 * **It answers "não encontrada", never "sem permissão".** Telling the caller a
 * route exists but is restricted is an information leak: with one ordinary
 * session anyone could map the app's restricted surface (analyst workspace,
 * parametrization, future admin screens) by reading the difference between the
 * two answers. Same reason the screen carries no profile name.
 *
 * This is UX + information hygiene, not the enforcement itself — the API rejects
 * the request regardless of what the UI renders.
 */
export function RequirePermission({
  permission,
  children,
}: {
  /**
   * A single permission, or a list meaning **any of** — for a route that hosts
   * more than one parametrization surface, each with its own authority (the J10
   * screen: Anexo A / roteamento for the franchise team, the franchise-fee table
   * for BP Financeiro too). Gating such a route on one of them would 404 a
   * profile the API lets in; gating it on the union while each card keeps its own
   * check is what matches the backend.
   */
  permission: Permission | readonly Permission[];
  children: ReactNode;
}) {
  const { can, isLoading } = usePermissions();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Carregando…" />
      </div>
    );
  }

  const permitidas = Array.isArray(permission) ? permission : [permission];
  if (!permitidas.some((p) => can(p))) {
    return <NotFoundScreen />;
  }

  return <>{children}</>;
}
