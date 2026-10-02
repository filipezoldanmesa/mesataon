'use client';

import { useCallback, useContext, useEffect, useState } from 'react';

import {
  fetchCurrentUser,
  logout as clearSession,
  startSsoLogin,
  type AuthUser,
} from '@/lib/auth';
import { redirecionarNoApp } from '@/lib/navegacao-segura';
import { AuthContext } from '@/lib/auth-context';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type UseAuthOptions = {
  /** When false, skips resolving the current user (e.g. on the login screen). */
  loadUser?: boolean;
};

export type UseAuthResult = {
  user: AuthUser | null;
  status: AuthStatus;
  /** `profileKey` selects the mock access profile while SSO is not configured. */
  login: (profileKey?: string) => void;
  logout: () => void;
};

// ── Per-component fallback ─────────────────────────────────────────────────
// Used only when there is no AuthProvider (e.g. /login with loadUser: false).
// When loadUser is false (or suppressed because a context exists) all stateful
// work is skipped, so the extra useState/useEffect are just no-ops.

function useFallbackAuth({ loadUser }: { loadUser: boolean }): UseAuthResult {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    loadUser ? 'loading' : 'unauthenticated',
  );

  useEffect(() => {
    if (!loadUser) return;

    let active = true;

    fetchCurrentUser()
      .then((current) => {
        if (!active) return;
        setUser(current);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setStatus('unauthenticated');
      });

    return () => {
      active = false;
    };
  }, [loadUser]);

  const login = useCallback((profileKey?: string) => {
    startSsoLogin(profileKey);
  }, []);

  const logout = useCallback(() => {
    void Promise.resolve(clearSession()).finally(() => {
      redirecionarNoApp('/login');
    });
  }, []);

  return { user, status, login, logout };
}

/**
 * Client-side auth session.
 *
 * When rendered inside an {@link AuthProvider} (i.e. any protected route via
 * AppShell) this is a zero-cost context read — no fetch, no local state, no
 * flash. A single `GET /api/auth/me` is issued by the provider and the result
 * is shared across every call site.
 *
 * Outside the provider (e.g. the login page with `loadUser: false`) it falls
 * back to per-component state, which is fine because those callers don't need
 * the user object anyway.
 */
export function useAuth({ loadUser = true }: UseAuthOptions = {}): UseAuthResult {
  const ctx = useContext(AuthContext);

  // Suppress the fallback fetch when a provider already owns the session.
  // We must always call useFallbackAuth (hooks cannot be conditional), but we
  // pass loadUser: false so the inner useEffect is a no-op.
  const fallback = useFallbackAuth({ loadUser: loadUser && ctx === null });

  return ctx ?? fallback;
}
