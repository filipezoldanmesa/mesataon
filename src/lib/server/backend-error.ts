import { NextResponse } from 'next/server';

/**
 * Single rule for turning a non-ok backend response into the BFF's response.
 *
 * The contract, in one sentence: **a 4xx body is never rewritten**. The backend's
 * `AllExceptionsFilter` already produces the sentence the screen must show —
 * either `{ statusCode, code, message }` or `{ statusCode, code:
 * 'VALIDATION_ERROR', errors: [{ field, code, message }] }` — and replacing it
 * with a hardcoded phrase is how "Falha ao criar a oportunidade (400)." reached
 * users instead of the violated rule (COR-5).
 *
 * Two things are deliberately NOT passed through:
 *
 *  - **5xx** → collapsed to `502` with `fallback`. A server-side stack trace or
 *    driver message is internal detail and must not reach the browser.
 *  - **a 4xx whose body is not JSON** → `fallback` at the original status, since
 *    there is no backend sentence to forward.
 *
 * **`503` é a exceção ao colapso dos 5xx.** O status (não o corpo) é o veredito
 * "fonte lenta/indisponível, tente de novo" — é o que o backend responde quando
 * uma integração estoura o timeout (`IntegrationErrorKind.Timeout` →
 * `ServiceUnavailableAppException`). Colapsá-lo em `502` apagava a única
 * informação que diz ao usuário que repetir resolve, e `502` lê como gateway
 * quebrado: foi assim que um timeout do Salesforce na busca de clientes chegou à
 * tela como "502 em alguns momentos". O corpo continua sendo o `fallback` — o
 * status atravessa, o detalhe interno não.
 *
 * ## Toda vez que o fallback é usado, o servidor LOGA o que descartou (VBR-583)
 *
 * O fallback existe justamente para os casos em que o backend não mandou frase
 * nenhuma — e até 19/08/2026 essa informação era **jogada fora**: o usuário via
 * "Falha ao remover o documento." e o desenvolvedor não tinha como saber se
 * aquilo foi um 500 do nosso serviço, um 502 do ALB ou um corpo em HTML. Isso
 * tornou o bug 67557 indiagnosticável a partir da evidência.
 *
 * Agora, no caminho de fallback (e SÓ nele — um 4xx com frase própria não é
 * incidente), o helper:
 *
 *  1. lê o corpo cru, trunca e emite `console.error` com status, método, URL do
 *     backend e o corpo — server-side, onde já vai para o CloudWatch;
 *  2. devolve ao browser um `correlationId` curto, o **mesmo** que foi logado.
 *
 * O `correlationId` é opaco de propósito: ele não conta nada sobre a falha (o
 * detalhe interno continua sem sair do servidor), mas dá ao suporte uma chave
 * para grep. `throwApiError` o anexa à frase do toast.
 *
 * Do NOT reimplement this per route. A route that needs a friendlier phrase for
 * ONE specific status should special-case that status *before* calling this
 * helper (e.g. a 404 that means "this record was never created"), and let every
 * other status fall through here.
 */
export async function forwardBackendError(
  backendRes: Response,
  fallback: string,
  context: { method?: string } = {},
): Promise<NextResponse> {
  const status = backendRes.status;

  // Read the body ONCE, as text: `json()` would consume the stream and leave
  // nothing to log on the branch where parsing fails — which is exactly the
  // branch worth logging.
  const raw = await backendRes.text().catch(() => '');

  const parsed = safeJsonObject(raw);

  // 4xx com envelope legível: a frase é do backend e atravessa verbatim. Não é
  // incidente, então não loga e não gera correlação.
  if (status < 500 && parsed !== null) {
    return NextResponse.json(parsed, { status });
  }

  const correlationId = newCorrelationId();
  logDiscardedBackendFailure({ correlationId, status, raw, backendRes, context });

  // 503 atravessa; os demais 5xx colapsam em 502; um 4xx sem corpo legível
  // mantém o próprio status (não há frase do backend, mas o status é dele).
  const outStatus = status === 503 ? 503 : status >= 500 ? 502 : status;

  return NextResponse.json({ error: fallback, correlationId }, { status: outStatus });
}

/** Máximo de caracteres do corpo do backend levados ao log. */
const MAX_LOGGED_BODY = 1000;

/**
 * Parses `raw` as a JSON **object** — a corpo vazio, JSON malformado, escalar ou
 * array devolvem null, e portanto caem no fallback.
 *
 * Array é recusado de propósito (o par anterior `json().catch()` + `typeof !==
 * 'object'` o aceitava): o `AllExceptionsFilter` só emite objeto
 * (`{ statusCode, code, message | errors }`), então um array na resposta de erro
 * não é uma frase que a tela possa mostrar — é sinal de que quem respondeu não
 * foi o backend.
 */
/**
 * O `fetch` da BFF para o backend NEM CHEGOU a ter resposta — DNS, rota
 * bloqueada, conexão recusada, TLS. Sem isto o handler lança, o Next devolve um
 * `500` genérico e a tela mostra `… (500).`: nada diz se o problema é a
 * aplicação ou o caminho de rede até ela, e não há nada para o suporte procurar
 * no log — a mesma cegueira que o `correlationId` do VBR-583 veio resolver.
 *
 * Devolve **502** (o gateway não alcançou o upstream) com o mesmo envelope
 * `{ error, correlationId }` do fallback de `forwardBackendError`, e loga a
 * causa real do lado do servidor. A frase do erro do transporte NUNCA vai ao
 * browser: pode carregar host e porta internos.
 */
export function forwardBackendUnreachable(
  cause: unknown,
  fallback: string,
  context: { method?: string; url?: string } = {},
): NextResponse {
  const correlationId = newCorrelationId();

  console.error(
    '[bff] backend unreachable',
    JSON.stringify({
      correlationId,
      method: context.method ?? null,
      url: context.url ?? null,
      cause: cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause),
    }),
  );

  return NextResponse.json({ error: fallback, correlationId }, { status: 502 });
}

function safeJsonObject(raw: string): Record<string, unknown> | null {
  if (raw.trim() === '') return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function newCorrelationId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

function logDiscardedBackendFailure(args: {
  correlationId: string;
  status: number;
  raw: string;
  backendRes: Response;
  context: { method?: string };
}): void {
  const { correlationId, status, raw, backendRes, context } = args;
  const body =
    raw.length > MAX_LOGGED_BODY ? `${raw.slice(0, MAX_LOGGED_BODY)}…[truncated]` : raw;

  console.error(
    '[bff] backend failure swallowed by fallback',
    JSON.stringify({
      correlationId,
      status,
      method: context.method ?? null,
      // `Response.url` is set by fetch; empty for synthetic responses.
      url: backendRes.url || null,
      body: body === '' ? null : body,
    }),
  );
}
