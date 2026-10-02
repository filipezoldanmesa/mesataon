import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type { Gate1Readiness, TriggerTransitionResult } from './types';
import {
  GateNotReadyError,
  OpportunityNotFoundError,
  TransitionConflictError,
  TransitionForbiddenError,
  TransitionRefusedError,
} from './types';

/**
 * Fallback `currentState` for `ENVIAR_PARA_ANALISE`.
 *
 * ⚠️ Prefer passing the opportunity's ACTUAL backend state. `currentState` is
 * the optimistic-lock token: hardcoding it both defeats the lock (a concurrent
 * change is no longer detected) and produced a hard failure — an opportunity
 * sitting in `NOVOS` sent `EM_PREENCHIMENTO` and got
 * `422 No transition found for event 'ENVIAR_PARA_ANALISE' from state 'NOVOS'`.
 * The backend accepts BOTH states as GATE 1 sources; the caller must say which
 * one it actually read.
 */
export const GATE1_SOURCE_STATE = 'EM_PREENCHIMENTO';

/**
 * Real GATE 1 pre-flight completeness check via the BFF
 * (`/api/opportunities/:id/gate1-readiness`), which proxies
 * `GET /v1/opportunities/:id/gate1-readiness` (F8, HU-14.1).
 */
export async function getGate1Readiness(id: string): Promise<Gate1Readiness> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(id)}/gate1-readiness`),
  );

  if (res.status === 404) {
    throw new OpportunityNotFoundError(id);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao verificar a completude da oportunidade');
  }

  return (await res.json()) as Gate1Readiness;
}

/**
 * Triggers the `ENVIAR_PARA_ANALISE` transition (GATE 1, F8, HU-14.2) via the
 * BFF (`/api/opportunities/:id/transitions`), which proxies
 * `POST /v1/opportunities/:id/transitions`.
 */
export async function sendToAnalysis(
  id: string,
  currentState: string = GATE1_SOURCE_STATE,
): Promise<TriggerTransitionResult> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(id)}/transitions`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'ENVIAR_PARA_ANALISE', currentState }),
    },
  );

  if (res.status === 404) {
    throw new OpportunityNotFoundError(id);
  }

  if (res.status === 403) {
    throw new TransitionForbiddenError();
  }

  if (res.status === 409) {
    throw new TransitionConflictError();
  }

  if (res.status === 422) {
    /*
     * ADO 68189 — um 422 SEM `missing[]` não é "faltam itens", é uma RECUSA
     * com motivo.
     *
     * A rota é uma só para a cadeia inteira de guards do GATE 1
     * (`GATE1_COMPLETENESS_GUARD` + `FRANQUIA_GATE_GUARD`) e para o pre-commit
     * effect do Converge, e só o primeiro produz `GATE_NOT_READY` com lista.
     * Todo o resto chega como `{ statusCode: 422, code?, message }`, onde
     * `message` é a frase que nomeia o conserto.
     *
     * Traduzir tudo em `GateNotReadyError(missing ?? [])` descartava essa
     * frase e levava a tela ao estado "bloqueado" com lista vazia — o rodapé
     * prometendo "complete os itens abaixo" e não listando nada.
     */
    const body = (await res.json().catch(() => null)) as {
      missing?: Gate1Readiness['missing'];
      message?: unknown;
      code?: unknown;
    } | null;

    const missing = Array.isArray(body?.missing) ? body.missing : [];
    if (missing.length > 0) {
      throw new GateNotReadyError(missing);
    }

    const message =
      typeof body?.message === 'string' && body.message.trim() !== ''
        ? body.message
        : 'A oportunidade não atende aos requisitos para seguir para a análise.';
    throw new TransitionRefusedError(
      message,
      typeof body?.code === 'string' ? body.code : undefined,
    );
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao enviar a oportunidade para análise');
  }

  return (await res.json()) as TriggerTransitionResult;
}
