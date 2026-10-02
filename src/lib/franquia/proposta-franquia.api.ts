/**
 * BFF client for the franchise proposal screen (`03-proposta-franquia`).
 *
 * Every call targets a same-origin Route Handler under `/api/*` — never the
 * backend directly. The handler reads the httpOnly `vibra_session` cookie
 * server-side and forwards the Bearer, so no access token reaches page JS.
 *
 * API contract (FRQ-9 read model + FRQ-F3/F4 mutations):
 *
 *   GET    /v1/opportunities/{oppId}/franquia/{proposalId}/contrato   → 200 | 403 | 404
 *   PATCH  /v1/opportunities/{oppId}/franquia/{proposalId}/potencial  → 200 | 400 | 404
 *   POST   /v1/opportunities/{oppId}/franquia/{proposalId}/fap        → 201 | 400 | 404
 *   DELETE /v1/opportunities/{oppId}/franquia/{proposalId}/fap/{docId} → 204 | 404
 */

import { extractErrorMessage, throwApiError } from '@/lib/api-errors';
import { apiUrl } from '@/lib/base-path';

import {
  type PropostaFranquiaReadModel,
} from './proposta-franquia-mapping';

/** The proposal does not exist, or is not a franchise proposal (404). */
export class PropostaFranquiaNotFoundError extends Error {
  constructor(readonly proposalId: string) {
    super(`Proposta de franquia não encontrada: ${proposalId}`);
    this.name = 'PropostaFranquiaNotFoundError';
  }
}

/**
 * The profile may not read this franchise proposal (403).
 *
 * Typed apart from a generic failure because the two need OPPOSITE screens: a
 * transient failure gets "Tentar novamente"; a 403 renders the plain
 * "página não encontrada" screen — retrying can never succeed, and naming the
 * restriction confirms the resource exists (CLAUDE.md).
 */
export class PropostaFranquiaForbiddenError extends Error {
  constructor(readonly proposalId: string) {
    super(`Sem permissão para ler a proposta de franquia: ${proposalId}`);
    this.name = 'PropostaFranquiaForbiddenError';
  }
}

/** Upload rejected by the backend (400) — wrong type, too large, missing file. */
export class FapUploadError extends Error {
  constructor(message?: string) {
    super(message ?? 'Falha ao anexar a FAP.');
    this.name = 'FapUploadError';
  }
}

/**
 * Segmentos comuns das rotas BFF desta proposta de franquia.
 *
 * ⚠️ Devolve SEGMENTOS, não uma URL — e é isso que conserta o defeito. Este
 * helper aplicava `withBasePath` e cada call site reaplicava sobre a
 * concatenação (`` withBasePath(`${basePath(...)}/fap`) ``), que é exatamente o
 * que o docblock de `withBasePath` proíbe por escrito: com `NEXT_PUBLIC_BASE_PATH`
 * configurado o resultado termina em "/", então a composição produzia
 * `…/franquia/<id>//fap`. `withBasePath` é idempotente contra o prefixo dobrado,
 * mas não contra a barra dupla — e a barra dupla não casa a regra `/prefix/*` do
 * ALB. Invisível no laptop, onde `BASE_PATH` é vazio e a função é a identidade;
 * 404 em dev/stage/prod, que foi como o parecer técnico (VBR-638) e o download de
 * minuta (VBR-626) foram parar em produção quebrados.
 *
 * `apiUrl` monta o caminho inteiro de uma vez e faz o `encodeURIComponent` de
 * cada segmento — existe justamente para ninguém ter de pensar nisso.
 */
function baseSegments(opportunityId: string, proposalId: string): Array<string | number> {
  return ['opportunities', opportunityId, 'franquia', proposalId];
}

/**
 * Loads the composite franchise proposal read model.
 *
 * Sections carrying `status: 'unavailable'` are NOT an error here — the screen
 * degrades that card alone. Only transport-level failures throw.
 *
 * @throws {PropostaFranquiaNotFoundError} 404.
 * @throws {PropostaFranquiaForbiddenError} 403.
 * @throws {Error} network / 5xx.
 */
export async function getPropostaFranquia(
  opportunityId: string,
  proposalId: string,
): Promise<PropostaFranquiaReadModel> {
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'contrato'),
    { cache: 'no-store' },
  );

  if (res.status === 404) {
    throw new PropostaFranquiaNotFoundError(proposalId);
  }
  if (res.status === 403) {
    throw new PropostaFranquiaForbiddenError(proposalId);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      extractErrorMessage(body, `Falha ao carregar a proposta de franquia (${res.status}).`),
    );
  }

  return (await res.json()) as PropostaFranquiaReadModel;
}

export interface SetPotencialResult {
  proposalId: string;
  potencialBrl: string;
  /** Backend verdict (RN-F4-02) — the screen never compares against a limit. */
  coordenadorParecerRequerido: boolean;
}

/**
 * Persists the franchise potential (BRL) and returns the J10 verdict.
 *
 * The threshold comparison is the backend's (RN-F4-02): the screen renders
 * `coordenadorParecerRequerido`, it does not evaluate a limit of its own.
 */
export async function setPotencial(
  opportunityId: string,
  proposalId: string,
  potencialBrl: number,
): Promise<SetPotencialResult> {
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'potencial'),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ potencialBrl }),
      cache: 'no-store',
    },
  );

  if (res.status === 404) {
    throw new PropostaFranquiaNotFoundError(proposalId);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new Error(
      body.error ?? body.message ?? `Falha ao salvar o potencial (${res.status}).`,
    );
  }

  return (await res.json()) as SetPotencialResult;
}

export interface FapDocumentoUploaded {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * Uploads the FAP (PDF) through the BFF as multipart `file`.
 *
 * @throws {FapUploadError} 400 — missing file, wrong type or size exceeded.
 */
export async function uploadFap(
  opportunityId: string,
  proposalId: string,
  file: File,
): Promise<FapDocumentoUploaded> {
  const body = new FormData();
  body.append('file', file);

  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'fap'),
    { method: 'POST', body },
  );

  if (res.status === 400) {
    const data = (await res.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new FapUploadError(data?.message ?? data?.error);
  }
  if (res.status === 404) {
    throw new PropostaFranquiaNotFoundError(proposalId);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao anexar a FAP');
  }

  return (await res.json()) as FapDocumentoUploaded;
}

/**
 * Removes the FAP document. A 404 is a successful no-op (already removed).
 *
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: `501 Unsupported Request` em
 * qualquer path, sem consultar o origin (ADO 67557/67796). A rota BFF continua
 * aceitando `DELETE` com a mesma implementação.
 */
export async function deleteFap(
  opportunityId: string,
  proposalId: string,
  docId: string,
): Promise<void> {
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'fap', docId),
    { method: 'POST' },
  );

  if (!res.ok && res.status !== 404) {
    await throwApiError(res, 'Falha ao remover a FAP');
  }
}

/**
 * Same-origin URL that streams the FAP bytes through the BFF.
 *
 * The backend signs for its own storage (in dev the endpoint is the Docker DNS
 * name, in production the signed URL is a credential for that object), so the
 * signed URL must never reach the browser — the BFF streams instead
 * (CLAUDE.md §"URL assinada do document store não vai para o browser").
 */
export function fapStreamUrl(
  opportunityId: string,
  proposalId: string,
  docId: string,
): string {
  return apiUrl(...baseSegments(opportunityId, proposalId), 'fap', docId, 'stream');
}
