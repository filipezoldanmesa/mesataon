import { caminhoInternoSeguro } from '@/lib/navegacao-segura';
import { SSO_CALLBACK_ROUTE, ssoRedirectRoute } from '@/lib/sso-redirect';

/** Name of the session cookie holding the backend access token. */
export const SESSION_COOKIE = 'vibra_session';

const LOGIN_PATH = '/login';

// Routes reachable without authentication (login screen + OAuth callback).
const PUBLIC_PATHS = [LOGIN_PATH, SSO_CALLBACK_ROUTE];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Access-control decision for a request.
 *
 * Returns the path to redirect to, or `null` when the request may proceed:
 * - unauthenticated users are sent to `/login` for any protected route;
 * - authenticated users are kept out of `/login` (sent to `/`).
 */
export function authRedirectTarget(
  pathname: string,
  isAuthenticated: boolean,
): string | null {
  if (!isAuthenticated && !isPublicPath(pathname)) return LOGIN_PATH;
  if (isAuthenticated && pathname === LOGIN_PATH) return '/';

  return null;
}

/**
 * The `?next=` value to attach to a `/login` redirect, or `null` when there is
 * nothing worth carrying.
 *
 * ## Why this exists (ADO 68142 · 11/09/2026)
 *
 * The note this platform attaches to the Salesforce Opportunity carries a deep
 * link back to the opportunity here. Clicking it from the CRM is, by
 * definition, the cold case: another browser, or a browser with no session
 * cookie. The middleware bounced that request to `/login` **and dropped the
 * destination**, so after signing in the user landed on the home screen — the
 * deep link worked exactly like a link to the root. The whole `?next=`
 * machinery (login page → `saveNextPath` → OAuth callback → `consumeNextPath`)
 * already existed; the only producer was the in-app session-expiry path in
 * `auth-provider`, which is the case that never mattered for an external link.
 *
 * - **`/` is not carried.** It is where the callback lands anyway, and an empty
 *   `?next=/` only makes the login URL noisier.
 * - **The query string of the destination travels with it** — a deep link may
 *   carry `?opp=` or a tab, and returning to the path without them is a
 *   different page.
 * - ⚠️ **Same-origin only (CWE-601).** The value is validated here and again
 *   in `saveNextPath`/`consumeNextPath` before anything navigates to it. It is
 *   also never written to the redirect's *pathname* — see the literal
 *   allowlist in `middleware.ts`; it only ever becomes a query parameter of the
 *   constant `/login`.
 * - **basePath is NOT included**, because `nextUrl.pathname` in middleware is
 *   already basePath-relative and the callback re-applies it with
 *   `withBasePath` (which is idempotent either way).
 */
export function loginRedirectNextPath(
  pathname: string,
  search: string,
): string | null {
  if (pathname === '/' || !pathname) return null;
  // `caminhoInternoSeguro` valida-e-RECONSTRÓI (CWE-601): o predicado anterior
  // (`isSameOriginPath`) só olhava `//` e aceitava `/\evil.com`, que o WHATWG
  // resolve para outra origem. O que volta daqui não descende da entrada.
  return caminhoInternoSeguro(`${pathname}${search ?? ''}`);
}

/**
 * Where to forward an OAuth response that landed somewhere other than the
 * callback page, or `null` when the request is not one.
 *
 * Only needed when `NEXT_PUBLIC_SSO_REDIRECT_PATH` pins the `redirect_uri` to a
 * path that is not the callback route (see `ssoRedirectRoute`). The forward has
 * to happen before the session check: the pinned path is typically protected,
 * so the guard would send the still-unauthenticated request to `/login` and the
 * `code` would be lost.
 */
export function ssoCallbackForwardTarget(
  pathname: string,
  params: URLSearchParams,
): string | null {
  const pinned = ssoRedirectRoute();

  if (pinned === SSO_CALLBACK_ROUTE) return null;
  if (pathname !== pinned) return null;
  // `error` travels too, so a denied consent reaches the callback's failure
  // state instead of being bounced to /login with no explanation.
  if (!params.has('code') && !params.has('error')) return null;

  return SSO_CALLBACK_ROUTE;
}
