import { caminhoInternoSeguro } from './navegacao-segura';

/**
 * Route of the page that finishes the OAuth login. Fixed: it is where the
 * callback UI lives, independent of what Entra is told to redirect to.
 */
export const SSO_CALLBACK_ROUTE = '/auth/callback';

/**
 * Path sent to Entra ID as the OAuth `redirect_uri`.
 *
 * Defaults to the callback route — what a correctly configured app registration
 * trusts. `NEXT_PUBLIC_SSO_REDIRECT_PATH` pins it to another path for tenants
 * whose registration trusts a different URI: Entra matches the redirect URI
 * **exactly** (scheme + host + port + path, no prefix or wildcard matching), so
 * sending anything that is not registered fails with AADSTS50011 — the only URI
 * we may send is one that already exists on the registration.
 *
 * When the pinned path is not the callback route, the middleware forwards the
 * OAuth response (query string intact) from that path to the callback page.
 *
 * A value that is not origin-relative is ignored: a bare `auth/callback` builds
 * a URI Entra cannot match, and `//host` or `https://host` would aim the
 * redirect off-origin (CWE-601) — where the authorization code would leak.
 *
 * ⚠️ A checagem vive em {@link caminhoInternoSeguro}, e não escrita aqui. Este
 * arquivo carregava a TERCEIRA cópia do mesmo predicado no produto
 * (`startsWith('/')` + `startsWith('//')`), com o mesmo buraco das outras duas:
 * o WHATWG resolve `\` como `/` em esquema especial, então `/\host` é outra
 * origem — e o que sai daqui vira `redirect_uri`.
 *
 * Efeito colateral desejado: o valor devolvido é **normalizado**
 * (`/auth/../auth/callback` → `/auth/callback`). O Entra casa a redirect URI
 * EXATAMENTE, então a forma crua produziria `AADSTS50011` — a falha que esta
 * validação existe para evitar.
 */
export function ssoRedirectRoute(): string {
  const configured = process.env.NEXT_PUBLIC_SSO_REDIRECT_PATH?.trim();

  if (!configured) return SSO_CALLBACK_ROUTE;

  return caminhoInternoSeguro(configured) ?? SSO_CALLBACK_ROUTE;
}
