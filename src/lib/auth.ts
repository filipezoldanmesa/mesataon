import type { LoginOptions } from '@/lib/auth-login-options-mapping';
import {
  announceSessionChange,
  clearAuthCache,
  writeAuthCache,
} from '@/lib/auth-session-cache';
import { withBasePath } from '@/lib/base-path';
import { redirecionarNoApp } from '@/lib/navegacao-segura';
import { SSO_CALLBACK_ROUTE, ssoRedirectRoute } from '@/lib/sso-redirect';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  roles: string[];
};

/**
 * Microsoft Entra ID authorize endpoint, when the public credentials are set.
 *
 * Returns `null` in environments without Entra configured — the backend then
 * degrades to a mock, and the flow skips straight to the callback.
 *
 * @param redirectUri - The registered redirect URI.
 * @param state - Optional opaque string forwarded unchanged by Entra and
 *   returned as `?state=` on the callback URL. Used to carry the mock-profile
 *   key when `ACCESS_PROFILE_SOURCE=mock` with real Entra auth (VBR-463).
 */
export function getSsoAuthorizeUrl(
  redirectUri: string,
  state?: string,
): string | null {
  const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID;
  const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;

  if (!tenantId || !clientId) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: [
      'openid',
      'profile',
      'email',
      // Consent is recorded HERE, at /authorize. Without `offline_access` Entra
      // issues no refresh token, so the backend's MSAL cache holds a Graph
      // access token good for ~1h only and the collaborator directory breaks
      // mid-session (not just after a deploy). Mirrors ENTRA_LOGIN_SCOPES.
      'offline_access',
      // Delegated Graph scopes — the collaborator directory is read as the
      // signed-in user. Must match the backend redemption scopes.
      'https://graph.microsoft.com/GroupMember.Read.All',
      'https://graph.microsoft.com/User.Read.All',
    ].join(' '),
  });

  // Carry the mock-profile key through the Entra redirect as OAuth `state`.
  // Entra forwards it unchanged — the callback page reads it back and sends it
  // to the backend as `mockProfileHint`. Safe because `state` is not a secret
  // (it is a profile key, not a credential) and is only trusted by the mock
  // access-profile provider, which refuses to construct in production.
  if (state) {
    params.set('state', state);
  }

  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * The `redirect_uri` for this browser — the registered URI Entra will redirect
 * to, which is not necessarily where the callback page lives (`ssoRedirectRoute`).
 *
 * Used for BOTH /authorize and the code redemption on purpose: Entra checks the
 * value twice and rejects the redemption if the two differ.
 */
function callbackUrl(): string {
  return `${window.location.origin}${withBasePath(ssoRedirectRoute())}`;
}

/**
 * Which profiles the login screen may offer, decided by the backend (the mock
 * lives there — there is no `NEXT_PUBLIC_USE_*` flag in the frontend).
 */
export async function fetchLoginOptions(): Promise<LoginOptions> {
  const res = await fetch(withBasePath('/api/auth/login-options'));

  if (!res.ok) throw new Error(`Login options lookup failed: ${res.status}`);

  return (await res.json()) as LoginOptions;
}

/**
 * Starts the SSO login: redirects to Entra when configured; otherwise goes
 * straight to the callback (mirrors the backend's mock-mode degrade).
 *
 * `profileKey` carries the access profile chosen in the picker:
 * - **Auth mocked** (no Entra credentials): travels as the OAuth `code`. The
 *   backend's mock auth provider reads it as "sign me in as this profile".
 * - **Auth real + profile mocked** (`ACCESS_PROFILE_SOURCE=mock`): travels as
 *   the OAuth `state` parameter. Entra forwards it unchanged to the callback
 *   URL, where the page reads it and sends it as `mockProfileHint` alongside
 *   the real code (VBR-463).
 * - **Production** (real auth + real profile provider): `profileKey` is `null`;
 *   no state or special code is sent.
 */
export function startSsoLogin(profileKey?: string): void {
  const redirectUri = callbackUrl();
  const authorizeUrl = getSsoAuthorizeUrl(
    redirectUri,
    // Pass the profile key as OAuth state so the callback page can recover it
    // after the Entra redirect (only honoured by the mock profile provider).
    profileKey ?? undefined,
  );

  if (authorizeUrl) {
    window.location.href = authorizeUrl;
    return;
  }

  // Auth is mocked — go straight to the callback; the profile key IS the code.
  const code = encodeURIComponent(profileKey ?? 'dev');

  redirecionarNoApp(`${SSO_CALLBACK_ROUTE}?code=${code}`);
}

// The session lives in an httpOnly cookie owned by the BFF Route Handlers under
// `/api/auth/*`. The access token is never exposed to page JavaScript, so these
// helpers only ever move the (non-sensitive) user profile across the boundary.

/**
 * Exchanges the OAuth `code` for a session via the BFF, which sets the cookie.
 *
 * @param code - The OAuth2 authorization code (from Entra or the mock flow).
 * @param mockProfileHint - Optional access-profile key to assume. Only
 *   meaningful when `ACCESS_PROFILE_SOURCE=mock` and the identity is real
 *   (i.e. Entra is configured). Ignored by the backend in production (VBR-463).
 */
export async function completeSsoLogin(
  code: string,
  mockProfileHint?: string,
): Promise<AuthUser> {
  const res = await fetch(withBasePath('/api/auth/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      redirectUri: callbackUrl(),
      ...(mockProfileHint ? { mockProfileHint } : {}),
    }),
  });

  if (!res.ok) throw new Error(`Login failed: ${res.status}`);

  const { user } = (await res.json()) as { user: AuthUser };

  // Prime the per-tab cache with the profile that JUST signed in, and tell the
  // other tabs the session changed.
  //
  // Priming matters because the callback page navigates to `/` right after this
  // resolves: without it the AuthProvider would hydrate from whatever the cache
  // still held — the PREVIOUS profile — and paint it until `/me` answered
  // (VBR-540). Writing the fresh profile makes the first frame correct.
  writeAuthCache(user);
  announceSessionChange();

  return user;
}

/**
 * A `/me` lookup the BFF answered with an HTTP error.
 *
 * Carries the status so callers can tell "the session is gone" (401/403 — the
 * cookie expired or was revoked, the user must log in again) from "the request
 * did not complete" (network blip, 5xx — the session may still be valid). Both
 * used to arrive as an untyped `Error`, so the only safe reaction was to treat
 * every failure as a transient one and leave the user on a page with no session.
 */
export class SessionLookupError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Session lookup failed: ${status}`);
    this.name = 'SessionLookupError';
    this.status = status;
  }
}

/** True when the error means the session itself is gone (not a transport hiccup). */
export function isSessionExpired(error: unknown): boolean {
  return (
    error instanceof SessionLookupError &&
    (error.status === 401 || error.status === 403)
  );
}

// Module-level in-flight promise: if multiple callers race to resolve the
// session before the first response arrives (e.g. SSR + client hydration),
// they all await the same fetch instead of opening N parallel connections.
let _inflight: Promise<AuthUser> | null = null;

/** The current user for the active session, resolved by the BFF from the cookie. */
export async function fetchCurrentUser(): Promise<AuthUser> {
  if (_inflight) return _inflight;

  _inflight = fetch(withBasePath('/api/auth/me'))
    .then((res) => {
      if (!res.ok) throw new SessionLookupError(res.status);
      return res.json() as Promise<AuthUser>;
    })
    .finally(() => {
      _inflight = null;
    });

  return _inflight;
}

/**
 * Drops the in-flight `/me` dedup so the next {@link fetchCurrentUser} opens a
 * fresh request.
 *
 * Needed when the session changes underneath us (another tab logged in or out):
 * a lookup that started before the switch is answering for the OLD session, and
 * reusing it would hand the caller the previous profile — the exact thing the
 * cross-tab signal exists to prevent (VBR-540). The abandoned promise still
 * settles; the caller's sequence guard discards it.
 */
export function resetSessionLookup(): void {
  _inflight = null;
}

/**
 * Clears the session by asking the BFF to expire the httpOnly cookie.
 *
 * Also drops the cached profile and announces the change, so this is safe to
 * call from any logout path — including the ones outside `AuthProvider` (the
 * login screen's fallback), which used to leave the cache behind (VBR-540).
 */
export async function logout(): Promise<void> {
  clearAuthCache();
  announceSessionChange();
  /*
   * ⚠️ `POST /api/auth/session/encerrar`, e não `DELETE /api/auth/session` —
   * esta chamada sai do BROWSER, e o host do web está atrás do edge (Akamai)
   * que recusa o método: `501 Unsupported Request` em qualquer path, sem
   * consultar o origin (ADO 67557/67796). A consequência era séria e invisível:
   * o cookie era esquecido aqui, mas a sessão **nunca era revogada no backend**
   * — o opaque session id seguia válido até a expiração natural.
   *
   * `POST /api/auth/session` já é o login, daí a rota irmã `session/encerrar`,
   * que compartilha a implementação com o `DELETE` mantido.
   */
  await fetch(withBasePath('/api/auth/session/encerrar'), { method: 'POST' });
}

let redirectingToLogin = false;

/**
 * Clears the dead session cookie and navigates to the login screen.
 *
 * Call this from any API error handler that receives a 401 from the BFF (e.g.
 * the backend returned 401 — session expired). The cookie must be cleared
 * first: the Next.js middleware bounces users with a session-looking cookie off
 * /login, so leaving the stale cookie causes a redirect loop (VBR-489).
 */
export function redirectToLogin(): void {
  // Idempotent: the proposal page mounts six independent blocks and a dead
  // session makes all six fail at once. Without this guard each one fires its
  // own DELETE and its own navigation, so the browser races six redirects for
  // one expired session.
  if (redirectingToLogin) return;
  redirectingToLogin = true;

  clearAuthCache();
  announceSessionChange();
  // `POST` na rota irmã, e não `DELETE` — ver a nota em `logout()`.
  void fetch(withBasePath('/api/auth/session/encerrar'), { method: 'POST' }).finally(() => {
    redirecionarNoApp('/login');
  });
}
