import { despachar } from '@/mocks/core/dispatch';

/**
 * ⚠️ EXCLUSIVO DO PROTÓTIPO — não existe em produção e NUNCA é portado.
 *
 * Em produção, `src/app/api/` tem ~200 Route Handlers (a BFF) que falam com o
 * backend. Aqui, esta rota coringa atende todas elas com os mocks de
 * `src/mocks/handlers/`. A tela não percebe a diferença: chama a mesma URL e
 * recebe o mesmo tipo.
 */
type Ctx = { params: Promise<{ path: string[] }> };

async function handle(request: Request, { params }: Ctx): Promise<Response> {
  const { path } = await params;
  return despachar(request, path);
}

export const dynamic = 'force-dynamic';
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
