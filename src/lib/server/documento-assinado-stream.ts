import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { cabecalhosDeArquivo } from './arquivo-response';
import { forwardBackendError, forwardBackendUnreachable } from './backend-error';
import { SESSION_COOKIE, backendUrl } from './session';
import { urlDeArmazenamentoSegura } from './url-armazenamento';

/**
 * Serve um documento do document store **streamando os bytes** — a URL assinada
 * nunca chega ao browser.
 *
 * ## Por que não redirecionar
 *
 * ⚠️ Uma presigned URL é **credencial portadora daquele objeto**: quem a tem lê
 * o arquivo sem sessão nenhuma, até ela expirar. O `CLAUDE.md` registra o
 * invariante ("URL assinada do document store não vai para o browser") e as
 * rotas irmãs de `stream` já o cumpriam; as duas rotas de `download`
 * 302-redirecionavam o browser para ela, colocando-a no `Location`, no histórico
 * de navegação e em qualquer proxy no caminho. Era também o sink de CWE-601 que
 * o Veracode aponta: o destino do redirect vinha de resposta de outro sistema.
 *
 * Em desenvolvimento o redirect nem funcionava — o store só é alcançável dentro
 * da rede do compose (`http://minio:9000`).
 *
 * ## O segundo salto tem trava de origem
 *
 * A URL vem do nosso backend, mas é montada com configuração do document store;
 * {@link urlDeArmazenamentoSegura} recusa esquema não-HTTP e a faixa link-local
 * (onde vive o endpoint de metadados do cloud) antes de qualquer fetch.
 *
 * @param caminhoBackend Rota do backend que devolve `{ url, fileName, mimeType }`.
 */
export async function streamDocumentoAssinado(
  request: NextRequest,
  caminhoBackend: string,
): Promise<NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const alvo = backendUrl(caminhoBackend);

  // Passo 1 — o backend resolve a URL assinada e a metadata do arquivo.
  let metaRes: Response;
  try {
    metaRes = await fetch(alvo, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch (cause) {
    return forwardBackendUnreachable(cause, 'Falha ao obter o link do documento.', {
      method: 'GET',
      url: alvo,
    });
  }

  if (!metaRes.ok) {
    // Regra única do repo: a frase de um 4xx é do backend e atravessa verbatim.
    // A versão anterior colapsava tudo em "Não foi possível gerar o link de
    // download.", que é o defeito COR-5.
    return forwardBackendError(metaRes, 'Não foi possível obter o documento.', {
      method: 'GET',
    });
  }

  // `fileName`/`mimeType` são recentes: um backend anterior a esta entrega manda
  // só `url`, e aí a resposta degrada para download sem nome — nunca para erro.
  const { url, fileName, mimeType } = (await metaRes.json()) as {
    url: string;
    fileName?: string;
    mimeType?: string;
  };

  let urlSegura: URL;
  try {
    urlSegura = urlDeArmazenamentoSegura(url);
  } catch (cause) {
    // ⚠️ NÃO é `forwardBackendUnreachable`: o backend respondeu, e bem. O que
    // houve foi a trava recusando o destino que ele devolveu — rotular isso
    // como "backend inalcançável" mandaria o suporte investigar a rede.
    console.error(
      '[bff] storage URL refused',
      JSON.stringify({
        url: alvo,
        cause: cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
      }),
    );
    return NextResponse.json({ error: 'Documento indisponível.' }, { status: 502 });
  }

  // Passo 2 — os bytes, buscados do lado do servidor.
  let fileRes: Response;
  try {
    fileRes = await fetch(urlSegura);
  } catch (cause) {
    return forwardBackendUnreachable(
      cause,
      'Falha ao carregar o documento no armazenamento.',
      { method: 'GET' },
    );
  }

  if (!fileRes.ok || !fileRes.body) {
    return NextResponse.json(
      { error: 'Falha ao carregar o documento no armazenamento.' },
      { status: 502 },
    );
  }

  // O nome é do NOSSO backend (autoritativo); do storage aproveita-se só o
  // tipo, e mesmo esse passa pela allowlist antes de chegar ao browser.
  return new NextResponse(fileRes.body, {
    status: 200,
    headers: cabecalhosDeArquivo({
      mimeType: fileRes.headers.get('content-type') ?? mimeType,
      fileName,
      cacheControl: 'private, max-age=300',
    }),
  });
}
