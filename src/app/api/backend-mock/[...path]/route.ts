import { SESSION_COOKIE } from '@/lib/auth-guard';
import { propostaPorId } from '@/mocks/elenco';
import { usuarioDaRequisicao } from '@/mocks/core/session';

/**
 * ⚠️ EXCLUSIVO DO PROTÓTIPO — não existe em produção e NUNCA é portado.
 *
 * Dois pontos do código de produção chamam o BACKEND direto de um Server
 * Component, sem passar pela BFF: `getSessionUserId` (`GET /v1/auth/me`, na
 * página de pendência) e `resolveProposalBreadcrumb` (`GET /v1/proposals/:id`,
 * nas páginas de proposta). O `.env` aponta `API_URL` para cá, e esta rota
 * responde só esses dois — assim o `src/lib/server/` fica idêntico ao de
 * produção.
 *
 * Se uma tela nova precisar de outra leitura server-side, prefira fazê-la pela
 * BFF (`/api/...`) no cliente. Só acrescente aqui se a tela de produção também
 * vai ler o backend direto de um Server Component.
 */
type Ctx = { params: Promise<{ path: string[] }> };

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  const { path } = await params;
  const rota = `/${path.join('/')}`;

  // O Server Component repassa o cookie como Bearer — que no protótipo é a
  // própria chave do perfil.
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const comCookie = new Request(request.url, {
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(bearer)}` },
  });
  const user = usuarioDaRequisicao(comCookie);
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 });

  if (rota === '/v1/auth/me') {
    return Response.json({ id: user.id, email: user.email, name: user.name, roles: user.roles });
  }

  const proposta = /^\/v1\/proposals\/([^/]+)$/.exec(rota);
  if (proposta) {
    const achado = propostaPorId(decodeURIComponent(proposta[1]));
    if (!achado) return Response.json({ error: 'Proposta não encontrada.' }, { status: 404 });
    return Response.json({ codigo: achado.proposta.codigo, tipoProposta: achado.proposta.tipo });
  }

  return Response.json({ error: `Protótipo: leitura server-side sem mock (${rota}).` }, { status: 501 });
}
