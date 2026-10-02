import { withBasePath } from '@/lib/base-path';
import {
  ALCADA_ACIONAMENTO_EM_ANDAMENTO,
  AlcadaAcionamentoConcorrenteError,
  AlcadaEmAndamentoError,
  AlcadaPreCondicaoError,
  type AcionarAlcadaFase,
  type AlcadaSagaStatus,
} from './alcada.types';

/**
 * Same-origin BFF client for the alçada saga (ADR-0037). The browser NEVER
 * talks to the backend directly — the Route Handlers read the httpOnly
 * session cookie and forward the Bearer.
 *
 * 409 is NOT a generic failure: it means "this step is already in flight" or
 * "a pre-condition is missing", and the backend sentence is actionable — the
 * screen shows it verbatim instead of "falha ao processar".
 */

async function parseActionError(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    code?: string;
  };
  const message = body.error ?? body.message ?? '';
  if (res.status === 409) {
    // Acionamento concorrente (ADO 68253) tem tipo próprio para o painel seguir
    // relendo até o outro acionamento aparecer. Comuta no CÓDIGO, nunca na
    // frase — ela é texto de tela e vai mudar.
    if (body.code === ALCADA_ACIONAMENTO_EM_ANDAMENTO && message) {
      throw new AlcadaAcionamentoConcorrenteError(message);
    }
    throw message
      ? new AlcadaPreCondicaoError(message)
      : new AlcadaEmAndamentoError();
  }
  if (res.status === 422 && message) {
    throw new AlcadaPreCondicaoError(message);
  }
  throw new Error(message || `Falha na operação de alçada (${res.status}).`);
}

export async function getAlcadaStatus(opportunityId: string): Promise<AlcadaSagaStatus> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/alcada`),
    { cache: 'no-store' },
  );
  if (!res.ok) {
    throw new Error(`Falha ao carregar o status da alçada (${res.status}).`);
  }
  return (await res.json()) as AlcadaSagaStatus;
}

export async function acionarAlcada(
  opportunityId: string,
): Promise<{ fase: AcionarAlcadaFase }> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/alcada/acionar`),
    { method: 'POST' },
  );
  if (!res.ok) await parseActionError(res);
  return (await res.json()) as { fase: AcionarAlcadaFase };
}

export async function enviarAlcada(
  opportunityId: string,
  comment?: string,
): Promise<{ verdict: string }> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/alcada/enviar`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comment ? { comment } : {}),
    },
  );
  if (!res.ok) await parseActionError(res);
  return (await res.json()) as { verdict: string };
}
