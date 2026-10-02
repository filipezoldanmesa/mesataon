'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  fetchCurrentUser,
  isSessionExpired,
  logout as clearSession,
  resetSessionLookup,
  startSsoLogin,
  type AuthUser,
} from '@/lib/auth';
import { AuthContext } from '@/lib/auth-context';
import { caminhoInternoSeguro, redirecionarNoApp } from '@/lib/navegacao-segura';
import {
  SESSION_EPOCH_KEY,
  announceSessionChange,
  clearAuthCache,
  readAuthCache,
  writeAuthCache,
} from '@/lib/auth-session-cache';
import type { AuthStatus } from '@/hooks/use-auth';

export { clearAuthCache };

// ── Session profile cache ──────────────────────────────────────────────────
// Lives in `lib/auth-session-cache` so `lib/auth` can prime it at login without
// importing a component module. Stores only the non-sensitive profile; the token
// stays in an httpOnly cookie.
//
// The cache is per-tab (`sessionStorage`) but the session cookie is shared by
// every tab on the origin — so a login in ANOTHER tab silently invalidates this
// tab's cache. That is what `SESSION_EPOCH_KEY` exists to announce (VBR-540).

// `sessionStorage` does not exist while the server renders, so reading it in a
// render-phase initialiser makes the first CLIENT render disagree with the SSR
// HTML — React then throws "Hydration failed because the server rendered text
// didn't match the client" and regenerates the subtree. Hydrating in a layout
// effect keeps the render pure: the effect runs after the hydration commit but
// BEFORE the browser paints, so the cached name is still on screen in the first
// visible frame — no "Carregando…" flash, no mismatch.
//
// The `typeof window` guard is what makes it isomorphic: `useLayoutEffect` on
// the server logs a "does nothing on the server" warning, so the server render
// falls back to `useEffect`.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Single-instance auth provider. Mount this once (in {@link AppShell}) to
 * avoid per-component fetches. It:
 *  - Hydrates from `sessionStorage` in a layout effect right after mount (NOT
 *    during the initial render — that would diverge from the server, whose
 *    render has no `sessionStorage`, and break hydration). The layout effect
 *    runs before the browser paints, so the user sees their name instead of
 *    "Carregando…" (stale-while-revalidate).
 *  - Revalidates in the background to keep the profile fresh.
 *  - Clears the cache on logout, and clears it AND redirects to /login when
 *    `/me` answers 401/403.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // Starts equal to the server render (no user, loading) so the first client
  // render matches the SSR markup and hydration never mismatches.
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Seed from the sessionStorage cache AFTER hydration — never during the
  // initial render, which must equal the server's (see
  // `useIsomorphicLayoutEffect`).
  useIsomorphicLayoutEffect(() => {
    const cached = readAuthCache();
    if (!cached) return;
    setUser(cached);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let active = true;
    // Serializes concurrent revalidations (mount + focus firing together) so
    // a slow older response cannot overwrite a newer one.
    let seq = 0;

    const revalidate = () => {
      const mySeq = ++seq;
      fetchCurrentUser()
        .then((current) => {
          if (!active || mySeq !== seq) return;
          setUser(current);
          setStatus('authenticated');
          writeAuthCache(current);
        })
        .catch((error: unknown) => {
          if (!active || mySeq !== seq) return;
          // Any failure invalidates the cached profile — a stale name next to a
          // dead session is worse than no name.
          clearAuthCache();
          setUser(null);
          setStatus('unauthenticated');

          // The session is gone (expired/revoked cookie). The middleware cannot
          // catch this: it only checks that the cookie EXISTS, so an expired one
          // sails past it and leaves the user on a protected page whose every
          // request 401s. Clear the dead cookie FIRST — the middleware bounces
          // authenticated-looking users off /login, so redirecting with the stale
          // cookie still set loops /login → / → /login forever (the user gets
          // stuck on "Carregando…"). Then send them to the login screen. A
          // transport error (5xx, offline) is NOT a reason to log anyone out.
          if (isSessionExpired(error)) {
            // The cookie is shared across tabs, so it just died for all of them.
            announceSessionChange();
            /*
             * Carry the current path so the user comes back to the page they
             * were on instead of the home screen. `clearSession()` drops the
             * cookie first, which is what keeps the /login → / → /login bounce
             * described above from happening.
             */
            const nextPath = caminhoInternoSeguro(
              window.location.pathname + window.location.search,
            );
            const suffix =
              nextPath !== null && nextPath !== '/'
                ? `?next=${encodeURIComponent(nextPath)}`
                : '';
            void Promise.resolve(clearSession()).finally(() => {
              redirecionarNoApp(`/login${suffix}`);
            });
          }
        });
    };

    revalidate();

    // Revalidate when the tab regains focus/visibility: a long-lived tab
    // otherwise keeps the profile fetched at mount forever — if the session
    // died (or its roles changed) meanwhile, the header kept a role-less user
    // and every write control silently misbehaved until a manual reload.
    const onFocus = () => revalidate();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') revalidate();
    };

    // Another tab logged in or out. The session cookie is shared across tabs but
    // this tab's cache and React state are not, so without this it keeps showing
    // the PREVIOUS profile — measured in stage: tab A displayed "SNEG" while the
    // live session belonged to another profile (VBR-540). Waiting for focus is
    // not enough: a background tab left visible on a second monitor never fires
    // one, and the wrong profile sits on screen indefinitely.
    //
    // Drop the cached profile BEFORE revalidating so a failure cannot leave the
    // dead profile behind, and go back to `loading` rather than keeping a name we
    // now know is stale.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SESSION_EPOCH_KEY) return;
      clearAuthCache();
      // A `/me` already in flight is answering for the session that just ended.
      resetSessionLookup();
      setUser(null);
      setStatus('loading');
      revalidate();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);

    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const login = useCallback((profileKey?: string) => {
    startSsoLogin(profileKey);
  }, []);

  const logout = useCallback(() => {
    clearAuthCache();
    // Tell the other tabs before navigating away: this tab is about to unload,
    // and they are still holding a profile whose session no longer exists.
    announceSessionChange();
    void Promise.resolve(clearSession()).finally(() => {
      redirecionarNoApp('/login');
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
