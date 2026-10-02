import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  SESSION_COOKIE,
  authRedirectTarget,
  loginRedirectNextPath,
  ssoCallbackForwardTarget,
} from '@/lib/auth-guard';
import { withBasePath } from '@/lib/base-path';
import { caminhoInternoSeguro, origemInternaSegura } from '@/lib/navegacao-segura';

// Allowlist dos destinos internos. Só estes literais chegam ao `Location`.
const LOGIN_PATH = '/login';
const ROOT_PATH = '/';
const CALLBACK_PATH = '/auth/callback';

/**
 * Redirect interno — a origem é reconstruída, o caminho é literal da allowlist.
 *
 * ⚠️ **NÃO troque o `Location` por um caminho relativo.** Ele parece a resposta
 * certa para o CWE-601 (a RFC 7231 §7.1.2 admite, e o browser resolveria contra
 * a origem de onde a resposta veio), mas o Next 15 **não deixa**: o adapter de
 * edge relê o header com `new NextURL(location, opts)` **sem base**, e um
 * caminho relativo levanta `TypeError: Invalid URL` em TODA requisição que este
 * gate redireciona — inclusive `/` deslogado. O servidor sobe e responde 500 em
 * tudo; medido no `smoke-e2e`, que ficou 120 s em `Timed out waiting from
 * config.webServer`. Isto já foi tentado uma vez.
 *
 * ⚠️ **Também não volte a `NextResponse.redirect(request.nextUrl.clone())`.**
 * Ali a origem atravessa crua, e o `Location` passa a admitir userinfo e
 * protocol-relative — ver o docblock de {@link origemInternaSegura}, que é
 * quem valida e reconstrói.
 *
 * O `basePath` vem de `withBasePath` (configuração de build), **não** de
 * `request.nextUrl.basePath`: é o que o `NextResponse.redirect` reaplicava por
 * baixo, e sem ele todo redirect deste arquivo cairia fora da regra `/prefix/*`
 * do ALB — 404 invisível no laptop, onde o prefixo é vazio.
 *
 * Origem irreconhecível ⇒ **400**, nunca `NextResponse.next()`: deixar passar
 * abriria o gate de sessão por causa de um header malformado.
 */
function redirecionarInterno(request: NextRequest, caminho: string): NextResponse {
  const origem = origemInternaSegura(request.nextUrl.origin);
  if (origem === null) return new NextResponse(null, { status: 400 });

  return new NextResponse(null, {
    status: 307,
    headers: { Location: `${origem}${withBasePath(caminho)}` },
  });
}

export function middleware(request: NextRequest) {
  // An OAuth response can land on a path other than the callback page when the
  // app registration only trusts another redirect URI. Forward it — query string
  // intact — BEFORE the session check, which would otherwise bounce the (still
  // unauthenticated) landing to /login and drop the authorization code.
  if (ssoCallbackForwardTarget(request.nextUrl.pathname, request.nextUrl.searchParams)) {
    // A query é o único pedaço do pedido que sobrevive ao encaminhamento (é nela
    // que viajam `code`, `state` e `error`), e por isso passa por
    // valida-e-reconstrói: o que sai é montado caractere a caractere a partir do
    // alfabeto constante, então não descende da entrada. Recusa ⇒ encaminha sem
    // a query, e a página de callback mostra a falha — melhor que servir um
    // `Location` que ninguém inspecionou.
    const comQuery = caminhoInternoSeguro(`${CALLBACK_PATH}${request.nextUrl.search}`);
    return redirecionarInterno(request, comQuery ?? CALLBACK_PATH);
  }

  const isAuthenticated = request.cookies.has(SESSION_COOKIE);
  const target = authRedirectTarget(request.nextUrl.pathname, isAuthenticated);

  if (target) {
    // Literal da allowlist, nunca `target` — o valor não descende do pedido.
    const destino = target === LOGIN_PATH ? LOGIN_PATH : ROOT_PATH;
    /*
     * Carrega o destino para que, ao entrar, o usuário volte à página que
     * pediu (ADO 68142). Sem isso um deep link vindo de fora — o link que a
     * nota do Salesforce carrega — sempre caía na home.
     *
     * O valor é QUERY do caminho constante acima, nunca o pathname: é validado
     * como same-origin em `loginRedirectNextPath`, reemitido caractere a
     * caractere por `caminhoInternoSeguro` (CWE-601) e validado de novo antes
     * de qualquer navegação que o use. A query do próprio destino é
     * substituída: ela pertence dentro do `next`, não solta no /login.
     */
    const next =
      target === LOGIN_PATH
        ? loginRedirectNextPath(request.nextUrl.pathname, request.nextUrl.search)
        : null;
    if (next === null) return redirecionarInterno(request, destino);

    const comNext = caminhoInternoSeguro(
      `${destino}?${new URLSearchParams({ next }).toString()}`,
    );
    return redirecionarInterno(request, comNext ?? destino);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every route except Next internals, static assets, and the BFF Route
  // Handlers under /api/* (they enforce their own auth by reading the httpOnly
  // cookie; gating them here would 307 the unauthenticated login POST to /login).
  // "/" is listed explicitly: with basePath set, Next's matcher fails to match
  // the bare root on its own (github.com/vercel/next.js/issues/73786), which
  // silently skipped the auth guard for the home page.
  matcher: ['/', '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
