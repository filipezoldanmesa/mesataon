'use client';

import type { ReactNode } from 'react';

import { usePermissions } from '@/hooks/use-permissions';

/**
 * Renders a write control ONLY for a profile that may change data.
 *
 * Read-only profiles (Visualizador, Expansão — mirrored from the backend's
 * `READ_ONLY_ROLES`) get nothing: the API rejects their mutations with 403, so
 * showing the control produced dead ends like "Falha ao atualizar as propostas
 * (403)" on the Eleger button.
 *
 * Use this for any control whose click mutates (`POST/PUT/PATCH/DELETE`). Prefer
 * hiding over disabling: a disabled "Eleger" still tells the viewer the app
 * expects them to elect something. When the control must stay visible for layout
 * or context reasons, read `canWrite` from {@link usePermissions} and disable it
 * explicitly instead.
 *
 * This is UX, not enforcement — `ReadOnlyProfileGuard` on the API is what makes
 * it safe. `components/auth/write-controls.test.tsx` fails the build when a
 * component imports a mutation client without consulting either of the two.
 */
export function WriteOnly({ children }: { children: ReactNode }) {
  const { canWrite } = usePermissions();

  if (!canWrite) return null;

  return <>{children}</>;
}
