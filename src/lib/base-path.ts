// Next's `basePath` (next.config.ts) auto-prefixes <Link>, useRouter and
// internal asset URLs, but not plain string paths passed to fetch()/
// window.location. Those need this helper. Empty locally (docker-compose),
// so behaviour there is unchanged.
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

// Mirrors next.config.ts's trailingSlash (on whenever a basePath is set): the
// ALB's "/prefix/*" rule only matches paths ending in "/" + something, so
// producing the canonical form here avoids an extra 308 round-trip through
// Next's own trailing-slash redirect.
const TRAILING_SLASH = Boolean(BASE_PATH);

/**
 * Prefixes a client-side path with the deployment's `basePath`.
 *
 * **Idempotent by design.** Applying it twice used to double the prefix
 * (`/dev/gestor-oportunidades-web/dev/gestor-oportunidades-web/api/…`), which
 * the ALB rule never matches — a 404 that is invisible locally, because with an
 * empty `BASE_PATH` this function is the identity. That is exactly how the
 * parecer técnico shipped completely broken in dev/stage/prod (VBR-638, and
 * VBR-626 before it). A second application is now a no-op instead of an outage.
 *
 * ⚠️ Idempotency is a safety net, not a licence to compose: **never append a
 * sub-path to an already-prefixed string.** With a basePath configured the
 * result ends in "/" (see {@link TRAILING_SLASH}), so
 * `` `${withBasePath('/api/x')}/y` `` yields `/api/x//y`. Build the whole path
 * first — {@link apiUrl} exists so you never have to think about it.
 */
export function withBasePath(path: string): string {
  // When a basePath is configured, ensure a "/" separator between the prefix
  // and any path that was accidentally passed without a leading slash.
  const normalizedPath = BASE_PATH && !path.startsWith('/') ? `/${path}` : path;
  // Guard against a second application. The `/` in the startsWith is load
  // bearing: it keeps a genuine path that merely shares the prefix's opening
  // characters (e.g. `${BASE_PATH}-foo`) from being mistaken for a prefixed one.
  const alreadyPrefixed =
    Boolean(BASE_PATH) &&
    (normalizedPath === BASE_PATH || normalizedPath.startsWith(`${BASE_PATH}/`));
  const prefixed = alreadyPrefixed ? normalizedPath : `${BASE_PATH}${normalizedPath}`;
  if (!TRAILING_SLASH) return prefixed;
  const q = prefixed.indexOf('?');
  const pathname = q === -1 ? prefixed : prefixed.slice(0, q);
  const suffix = q === -1 ? '' : prefixed.slice(q);
  return pathname.endsWith('/') ? prefixed : `${pathname}/${suffix}`;
}

/**
 * Builds a BFF URL from path segments — the only correct way to reach
 * `/api/**` from client code.
 *
 * Each segment is encoded, the segments are joined, and the `basePath` is
 * applied **once, at the end**. That ordering is the whole point: the two
 * URL bugs this project has shipped both came from prefixing too early.
 *
 * - `withBasePath` per call site plus a helper that also prefixed ⇒ the prefix
 *   appeared twice and every parecer call 404'd (VBR-638).
 * - A helper that prefixed, with the sub-path concatenated afterwards ⇒
 *   `/api/opportunities/<id>/team//principal`, because the prefixed form ends
 *   in "/" (observed in dev; the router tolerated it, which is luck, not design).
 *
 * @example
 * apiUrl('opportunities', id, 'parecer')            // → /api/opportunities/<id>/parecer
 * apiUrl('opportunities', id, 'parecer', 'gerar')   // → …/parecer/gerar
 */
export function apiUrl(...segments: Array<string | number>): string {
  const path = segments
    .map((segment) => encodeURIComponent(String(segment)))
    .join('/');
  return withBasePath(`/api/${path}`);
}
