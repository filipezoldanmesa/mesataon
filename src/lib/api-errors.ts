/**
 * Canonical error helpers for frontend API clients.
 *
 * `extractErrorMessage` is THE single error extractor in this repo.
 * `ApiValidationError` carries field-level detail so forms can map
 * `field` → input-level messages.
 *
 * Import from here; do NOT define a local extractor in feature API files.
 */

export interface FieldError {
  field?: string;
  code?: string;
  message: string;
}

interface ErrorBody {
  error?: string;
  message?: string | string[];
  errors?: Array<FieldError | string>;
  /**
   * Chave opaca emitida pela BFF quando ela teve de descartar a resposta do
   * backend e responder com uma frase genérica (`forwardBackendError`). O mesmo
   * valor está no log do servidor junto com o status e o corpo cru — é o que o
   * suporte usa para achar a falha real a partir do print do usuário (VBR-583).
   */
  correlationId?: string;
}

/**
 * Extracts the most specific human sentence from a backend error body.
 *
 * Priority: `errors[].message` joined > `message` joined (array) >
 * `message` (string) > `error` > `fallback`.
 */
export function extractErrorMessage(body: ErrorBody, fallback: string): string {
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const sentences = body.errors
      .map((item) => (typeof item === 'string' ? item : item?.message))
      .filter((s): s is string => typeof s === 'string' && s.trim() !== '');
    if (sentences.length > 0) return sentences.join(' ');
  }
  if (Array.isArray(body.message)) return body.message.join(' ');
  return (typeof body.message === 'string' ? body.message : undefined) ?? body.error ?? fallback;
}

/**
 * A mutation rejected by the backend with a business/validation rule
 * (HTTP 400, 409, or 422). Typed apart from a transport failure so
 * the UI renders it INLINE next to the offending field instead of as a
 * generic "tente novamente" toast.
 *
 * `fieldErrors` carries per-field detail when the backend replies with
 * `{ code: 'VALIDATION_ERROR', errors: [{ field, code, message }] }`.
 */
export class ApiValidationError extends Error {
  readonly fieldErrors: FieldError[];

  constructor(message: string, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiValidationError';
    this.fieldErrors = fieldErrors;
  }
}

/**
 * A typed HTTP error carrying the response status code.
 *
 * Thrown by API read functions (GET) so consumers can decide whether to
 * retry: 5xx and network errors (TypeError) are transient; 4xx are not.
 *
 * Use {@link isRetryableError} to test an arbitrary `unknown` catch value.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * Returns `true` for errors that may succeed on a second attempt:
 * - Network failures (`TypeError` thrown when `fetch` itself throws)
 * - Server errors (`HttpError` with `status >= 500`)
 *
 * 4xx codes (400/403/404/409/422) are client errors and will not improve
 * with repetition — do **not** retry them.
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof HttpError) return err.status >= 500;
  return err instanceof TypeError; // fetch network failure
}

/**
 * Returns `true` when the error signals an expired or missing session (HTTP
 * 401). The caller should redirect to login — retrying the same request will
 * not help.
 *
 * Distinct from {@link isRetryableError}: a 401 is a hard block, not a
 * transient failure.
 */
export function isExpiredSessionError(err: unknown): boolean {
  return err instanceof HttpError && err.status === 401;
}

/**
 * Reads the error body once and throws {@link ApiValidationError} for
 * business rejections (400/409/422), a plain `Error` for everything else.
 * Always carries the backend's own sentence rather than a template string.
 */
export async function throwApiError(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as ErrorBody;
  const message = withCorrelationRef(
    extractErrorMessage(body, `${fallback} (${res.status}).`),
    body.correlationId,
  );

  if (res.status === 400 || res.status === 409 || res.status === 422) {
    const rawErrors = Array.isArray(body.errors) ? body.errors : [];
    const fieldErrors: FieldError[] = rawErrors.map((e) =>
      typeof e === 'string' ? { message: e } : e,
    );
    throw new ApiValidationError(message, fieldErrors);
  }
  throw new Error(message);
}

/**
 * Anexa à frase a referência de correlação emitida pela BFF, quando houver.
 *
 * Sem isso, um print de tela com a frase genérica não permite localizar a falha
 * real no log do servidor — foi exatamente o que aconteceu no bug 67557
 * ("Falha ao remover o documento.", sem nenhum outro sinal). A referência é
 * opaca: ela não revela detalhe interno, só dá o que grepar.
 */
function withCorrelationRef(message: string, correlationId?: string): string {
  return typeof correlationId === 'string' && correlationId !== ''
    ? `${message} (ref: ${correlationId})`
    : message;
}

/**
 * O motivo em pt-BR de uma falha, para a tela — ou o `fallback` quando não há
 * frase que sirva a quem está preenchendo o formulário.
 *
 * ## Por que existe
 *
 * Os `catch` dos blocos reconheciam só os erros tipados do próprio cliente
 * (`…SaveError`) e mandavam **todo o resto** para uma frase genérica. O que
 * caía nesse "resto" era justamente o `HttpError` — a classe que carrega a
 * frase do backend (`AllExceptionsFilter`) e da BFF. Medido no stage em
 * 27/08/2026: o vínculo da obra respondia `403 "Esta ação exige um dos perfis:
 * …"` e a tela dizia "Falha ao salvar o recurso financeiro. Tente novamente."
 * — a única frase que dizia o que fazer era a descartada, e o 403 não aparecia
 * em log nenhum (rejeição de guard precede o interceptor de log, e a BFF
 * repassa 4xx sem logar). O defeito ficou invisível dos dois lados.
 *
 * ## A regra
 *
 * Mostra `err.message` de qualquer `Error` cuja mensagem tenha sido **escrita
 * para o usuário**. `TypeError` e `SyntaxError` são exceções de RUNTIME —
 * `Failed to fetch`, `Unexpected token < in JSON` — em inglês e sobre o
 * transporte, não sobre a ação: essas caem no `fallback`, que é a frase da
 * tela. Mensagem vazia também.
 */
export function failureReason(err: unknown, fallback: string): string {
  if (err instanceof TypeError || err instanceof SyntaxError) return fallback;
  if (err instanceof Error && err.message.trim() !== '') return err.message;
  return fallback;
}

/**
 * A frase que o backend escreveu para um erro, ou `undefined` quando não veio
 * nenhuma.
 *
 * Existe para os endpoints que traduzem um status em erro TIPADO (o 400 do
 * recálculo de indicadores vira `ProposalNotReadyForIndicatorsError`, e por aí
 * vai): o tipo é o que a tela usa para escolher o banner, e a frase é o que ela
 * precisa mostrar dentro dele. Sem isto, a segunda regra que passar a responder
 * o mesmo status chega ao usuário com o texto da primeira — foi o que
 * aconteceu com o investimento sem Descrição (ADO 68425), que era lido como
 * "defina os produtos e os recursos financeiros da proposta".
 *
 * Nunca lança: corpo ausente, vazio ou não-JSON devolve `undefined`, e aí quem
 * chama fica com a frase própria dele.
 */
export async function readBackendSentence(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as ErrorBody;
    const sentence = extractErrorMessage(body, '');
    return sentence.trim() === '' ? undefined : sentence;
  } catch {
    return undefined;
  }
}
