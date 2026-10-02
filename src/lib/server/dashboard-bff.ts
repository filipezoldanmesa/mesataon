import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { forwardBackendError, forwardBackendUnreachable } from '@/lib/server/backend-error';
import { SESSION_COOKIE, backendUrl } from '@/lib/server/session';

/**
 * Proxy de LEITURA dos quadros do dashboard — a implementação única das rotas
 * BFF da Evolução do Dashboard SNEG (`distribuicao-por-fase`,
 * `distribuicao-por-analista`, `indicadores-sneg`).
 *
 * - Sem cookie ⇒ 401 sem chamar o backend; o token nunca chega ao browser.
 * - Query string: repassa SÓ os parâmetros declarados, sem validar — o DTO do
 *   backend é a régua (uma segunda divergiria dele no valor de borda).
 * - Erro do backend ⇒ `forwardBackendError` (4xx verbatim, 503 como 503, resto
 *   em 502). O 403 atravessa como 403: é "o widget não é deste perfil", e o
 *   cliente o traduz em card ausente.
 * - Sucesso ⇒ SEMPRE pelo mapper — nunca passthrough cru.
 */
export async function proxyDashboardRead<B, F>(
  request: NextRequest,
  opts: {
    path: string;
    params: readonly string[];
    map: (raw: B) => F;
    fallback: string;
  },
): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const qs = new URLSearchParams();
  for (const param of opts.params) {
    const value = request.nextUrl.searchParams.get(param);
    if (value) qs.set(param, value);
  }
  const url = backendUrl(`${opts.path}${qs.size > 0 ? `?${qs.toString()}` : ''}`);

  let backendRes: Response;
  try {
    backendRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch (cause) {
    return forwardBackendUnreachable(cause, opts.fallback, { method: 'GET', url });
  }

  if (!backendRes.ok) {
    return forwardBackendError(backendRes, opts.fallback, { method: 'GET' });
  }

  return NextResponse.json(opts.map((await backendRes.json()) as B));
}
