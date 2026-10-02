import type { AuthUser } from '@/lib/auth';

/**
 * Per-tab cache of the signed-in user's PROFILE, plus a cross-tab signal that
 * says "the session changed, throw yours away".
 *
 * Only the non-sensitive profile (id, email, name, roles) is stored. The access
 * token stays in an httpOnly cookie and never touches web storage.
 *
 * ### Why the cross-tab signal exists (VBR-540)
 *
 * The cache lives in `sessionStorage`, which is per-tab — and that was assumed
 * to make a session switch harmless. It does not: **the session cookie is shared
 * by every tab on the origin, the cache is not.** Log in as LT in tab A, then
 * log out and back in as CCOB in tab B, and tab A keeps painting LT — its
 * `sessionStorage` still holds LT and its React state was never told anything
 * changed. Measured in stage on 17/08/2026: tab A displayed `SNEG` while the
 * live session was a different profile entirely.
 *
 * `sessionStorage` cannot carry the news (it is per-tab by definition), so the
 * signal goes through `localStorage`, whose `storage` event fires in *other*
 * tabs of the same origin. Only an opaque, monotonically-changing marker is
 * written — never the profile, never anything sensitive.
 */

const CACHE_KEY = 'vibra:session-user';

/**
 * Cross-tab session marker. Its VALUE is meaningless — what matters is that it
 * changes, because `storage` events only fire when the stored value differs.
 * Lives in `localStorage` because `sessionStorage` events never cross tabs.
 */
export const SESSION_EPOCH_KEY = 'vibra:session-epoch';

export function readAuthCache(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function writeAuthCache(user: AuthUser): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(user));
  } catch {
    // sessionStorage may be blocked by privacy settings — degrade gracefully.
  }
}

export function clearAuthCache(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Tells every OTHER tab that the session changed (a login or a logout just
 * happened here), so they drop their cached profile and re-resolve instead of
 * showing a profile that is no longer the session's.
 *
 * The value must differ from the previous one or no `storage` event fires, hence
 * the random suffix alongside the timestamp: two logins inside the same
 * millisecond still produce two distinct values.
 *
 * Never throws — a tab that cannot broadcast must still be able to log in.
 */
export function announceSessionChange(): void {
  try {
    localStorage.setItem(
      SESSION_EPOCH_KEY,
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
  } catch {
    // localStorage may be blocked by privacy settings. The focus/visibility
    // revalidation in AuthProvider still catches up, just later.
  }
}
