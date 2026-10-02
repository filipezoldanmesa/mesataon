import { cookies } from 'next/headers';

import { SESSION_COOKIE } from '@/lib/auth-guard';

/**
 * Server-side base URL for the backend API. Route Handlers run inside the
 * container, so they use `API_URL` (e.g. `http://api:3001`, the Docker DNS name)
 * rather than `NEXT_PUBLIC_API_URL`, which is the browser-facing origin. Falls
 * back to the public URL and then localhost for local `next dev`.
 */
const BACKEND_URL =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

export function backendUrl(path: string): string {
  return `${BACKEND_URL}${path}`;
}

export { SESSION_COOKIE };

/**
 * Attributes for the session cookie set by the BFF. `httpOnly` is the whole
 * point: the access token is invisible to page JavaScript, so an XSS payload
 * cannot read it. `secure` is on in production (HTTPS only); `sameSite: 'lax'`
 * keeps it from riding cross-site POSTs while still surviving the OAuth
 * top-level redirect back from Entra.
 */
/**
 * Id of the signed-in user, resolved server-side from the httpOnly session
 * cookie (`GET /v1/auth/me`). For Server Components that need the principal's
 * identity for rendering — e.g. highlighting the entries a user authored in a
 * thread — without shipping a second `/me` round-trip to the browser.
 *
 * Returns null when there is no session or the backend rejects the token: an
 * absent id must always degrade to "nothing highlighted", never to an error.
 */
export async function getSessionUserId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const res = await fetch(backendUrl('/v1/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user.id === 'string' ? user.id : null;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge: number): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}
