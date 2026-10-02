import { resolve, type HttpMethod } from './router';
import { naoAutenticado, semPermissao } from './respostas';
import { usuarioDaRequisicao } from './session';
import { configuracao } from './configuracao';
import '../handlers';

async function lerCorpo(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const tipo = request.headers.get('content-type') ?? '';
  try {
    if (tipo.includes('multipart/form-data')) return await request.formData();
    const texto = await request.text();
    if (!texto) return undefined;
    return tipo.includes('json') || /^[[{]/.test(texto.trim()) ? JSON.parse(texto) : texto;
  } catch {
    return undefined;
  }
}

const PAPEIS_SOMENTE_LEITURA = ['VISUALIZADOR'];

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Entrega uma requisição `/api/<path>` à rota mockada correspondente.
 *
 * Rota sem mock ⇒ **501** com a frase que diz o que fazer. É de propósito: a
 * tela mostra o estado de erro dela (que também precisa estar desenhado), e o
 * log do `next dev` aponta exatamente o arquivo a criar.
 */
export async function despachar(request: Request, segmentos: string[]): Promise<Response> {
  const method = request.method.toUpperCase() as HttpMethod;
  const path = `/${segmentos.map(encodeURIComponent).join('/')}`;
  const url = new URL(request.url);
  const achado = resolve(method, path);

  if (!achado) {
    console.warn(
      `[mock] SEM MOCK: ${method} /api${path} — crie a rota em src/mocks/handlers/<dominio>.ts (ver CLAUDE.md, "Como criar um mock")`,
    );
    return Response.json(
      { error: `Protótipo: rota sem mock (${method} /api${path}).` },
      { status: 501 },
    );
  }

  const cfg = configuracao();
  if (cfg.latenciaMs > 0) await espera(cfg.latenciaMs);

  const user = usuarioDaRequisicao(request);
  if (!achado.route.publica && !user) return naoAutenticado();

  // Espelho do `ReadOnlyProfileGuard` global do backend: quem só tem papéis de
  // consulta não muta nada, em rota nenhuma — sem depender de cada mock lembrar.
  if (
    user &&
    method !== 'GET' &&
    !achado.route.publica &&
    user.roles.every((r) => PAPEIS_SOMENTE_LEITURA.includes(r))
  ) {
    return semPermissao();
  }

  // Simulação de falha ligada em /prototipo: toda AÇÃO (não-GET) devolve o erro
  // escolhido — para desenhar e revisar os estados de erro das telas.
  if (cfg.falharAcoes && method !== 'GET' && !achado.route.publica) {
    return Response.json({ error: cfg.mensagemFalha }, { status: cfg.statusFalha });
  }

  return achado.route.handler({
    params: achado.params,
    query: url.searchParams,
    body: await lerCorpo(request),
    user,
    request,
  });
}
