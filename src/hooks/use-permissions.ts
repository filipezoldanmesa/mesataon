'use client';

import { useCallback } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { Permission, hasPermission } from '@/lib/auth-permissions';
import { primaryRoleLabel } from '@/lib/auth-roles';

export type UsePermissionsResult = {
  /**
   * `true` when the profile may change anything at all — mirrors the backend's
   * `ReadOnlyProfileGuard`. A read-only profile (Visualizador, Expansão) must not
   * be offered write controls: the API answers 403 and the click becomes a dead
   * end ("Falha ao atualizar as propostas (403)").
   */
  canWrite: boolean;
  /** `true` when the signed-in user may use the given feature. */
  can: (permission: Permission) => boolean;
  /** Roles resolved by the backend for this session. */
  roles: string[];
  /** pt-BR label of the user's profile (`null` while unresolved/unknown). */
  profileLabel: string | null;
  /** The session is still being resolved — no decision can be trusted yet. */
  isLoading: boolean;
};

/**
 * Permission view of the current session. Components ask this hook instead of
 * inspecting `user.roles` themselves, so the role → feature bindings live in one
 * place ({@link PERMISSION_ROLES}).
 */
export function usePermissions(): UsePermissionsResult {
  const { user, status } = useAuth();
  const roles = user?.roles ?? [];

  const can = useCallback(
    (permission: Permission) => hasPermission(user?.roles, permission),
    [user?.roles],
  );

  return {
    can,
    canWrite: hasPermission(user?.roles, Permission.Write),
    roles,
    profileLabel: primaryRoleLabel(user?.roles),
    isLoading: status === 'loading',
  };
}
