import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { SESSION_COOKIE, backendUrl } from '@/lib/server/session';

/**
 * Shared plumbing for the franchise mutation Route Handlers (FRQ-12).
 *
 * It owns only what is identical across them — reading the session cookie,
 * attaching the Bearer, and translating transport failures. **It does not map
 * the payload**: each route still declares its `Backend*` shape and its mapper,
 * so a renamed field breaks the build instead of rendering an empty cell
 * (CLAUDE.md §"BFF nunca faz passthrough cru").
 *
 * Business errors (400/409/422) are forwarded with the backend's own body: the
 * screen renders the violated rule inline, next to the offending field, and a
 * paraphrase here would lose it.
 */
export type ProxyOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function proxyFranquiaMutation<TBackend>(
  request: NextRequest,
  {
    path,
    method,
    body,
    fallbackError,
    expectsNoContent,
  }: {
    /** Backend path after `/v1/`, already URL-encoded by the caller. */
    path: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Omitted for DELETE. */
    body?: unknown;
    fallbackError: string;
    /**
     * The backend answers **200 with an empty body** — the shape of every
     * action route (`<resource>:remover`), because `@ActionPost` fixes
     * `HttpCode(200)`. Without this the success path below would call `.json()`
     * on an empty body and a successful removal would surface as an error.
     * Explicit, never inferred from the body, so a response that should have
     * carried content is not swallowed in silence.
     */
    expectsNoContent?: boolean;
  },
): Promise<ProxyOutcome<TBackend>> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }),
    };
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(backendUrl(`/v1/${path}`), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Falha de comunicação com o servidor.' },
        { status: 502 },
      ),
    };
  }

  if (backendRes.status === 404) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Proposta de franquia não encontrada.' },
        { status: 404 },
      ),
    };
  }

  if (!backendRes.ok) {
    const status = backendRes.status >= 500 ? 502 : backendRes.status;
    const errorBody = (await backendRes
      .json()
      .catch(() => ({ error: fallbackError }))) as unknown;
    return { ok: false, response: NextResponse.json(errorBody, { status }) };
  }

  // 204 (and the action routes' empty 200) carry no body — the caller decides
  // what to answer.
  if (backendRes.status === 204 || expectsNoContent) {
    return { ok: true, data: undefined as TBackend };
  }

  return { ok: true, data: (await backendRes.json()) as TBackend };
}

/** Parses the JSON body, answering 400 instead of throwing on malformed input. */
export async function readJsonBody(
  request: NextRequest,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Payload inválido.' }, { status: 400 }),
    };
  }
}
