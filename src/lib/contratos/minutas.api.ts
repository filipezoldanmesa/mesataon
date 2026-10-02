/**
 * BFF client for minuta mutations on the contract flow.
 *
 * All calls target the Next.js Route Handlers (same-origin BFF), which inject
 * the httpOnly session cookie as a Bearer token. S3 / Netlex URLs never reach
 * the browser — the BFF downloads files server-side and streams them.
 */

import { extractErrorMessage } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

export type MinutaApiError = {
  error: string;
  field?: string;
};

/**
 * Delegates to the canonical extractor instead of reading `body.error` only.
 *
 * Reading a single field silently dropped the backend's own sentence whenever it
 * arrived in `message` (the shape `AllExceptionsFilter` produces) or in
 * `errors[]` (the ValidationPipe shape) — the user then got
 * "Falha ao gerar as minutas (400)" instead of the rule they broke.
 */
function parseError(body: unknown, fallback: string): string {
  return extractErrorMessage((body ?? {}) as Parameters<typeof extractErrorMessage>[0], fallback);
}

// ---------------------------------------------------------------------------
// Gerar minutas
// ---------------------------------------------------------------------------

/**
 * Triggers Netlex generation for all pending minutas on the opportunity.
 *
 * ⚠️ SEM CALL SITE hoje (10/09/2026): a geração automática está desativada
 * enquanto a integração com o Netlex está em desenvolvimento, então o backend
 * não emite mais o CTA `contrato:gerar` e a tela não chama esta função. O
 * cliente, a rota BFF e `POST .../contrato/minutas:gerar` seguem publicados e
 * intactos — religar a geração é voltar a emitir o CTA no read model do
 * contrato e restaurar o handler em `contrato-view.tsx`.
 *
 * @throws {Error} with a localised message on 4xx/5xx.
 */
export async function gerarMinutas(opportunityId: string): Promise<void> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/minutas/gerar`),
    { method: 'POST', cache: 'no-store' },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      parseError(body, `Falha ao gerar as minutas (${res.status}).`),
    );
  }
}

// ---------------------------------------------------------------------------
// Substituir minuta
// ---------------------------------------------------------------------------

export type SubstituirMinutaPayload = {
  file: File;
  justificativa: string;
  /**
   * Código da consulta Netlex — **opcional** (13/09/2026).
   *
   * Ausente ou em branco simplesmente não viaja no multipart: mandar a chave
   * com string vazia faria o backend gravar `""`, que é indistinguível de um
   * código em branco de verdade.
   */
  netlexConsultaCodigo?: string;
};

/**
 * Replaces a generated minuta with a new file, with a mandatory justification
 * and an OPTIONAL Netlex consultation code (HU-02b).
 *
 * @throws {Error} with a localised message on 4xx/5xx.
 */
export async function substituirMinuta(
  opportunityId: string,
  minutaId: string,
  payload: SubstituirMinutaPayload,
): Promise<void> {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('justificativa', payload.justificativa);
  const codigo = payload.netlexConsultaCodigo?.trim();
  if (codigo) form.append('netlexConsultaCodigo', codigo);

  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/minutas/${encodeURIComponent(minutaId)}/substituir`),
    { method: 'POST', body: form, cache: 'no-store' },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      parseError(body, `Falha ao substituir a minuta (${res.status}).`),
    );
  }
}

// ---------------------------------------------------------------------------
// Anexar documento (tipo + arquivo)
// ---------------------------------------------------------------------------

/** One option of the "Tipo do documento" select — served by the backend. */
export type MinutaTipoAnexavel = {
  tipo: string;
  tipoLabel: string;
  /** True when the type already belongs to the negotiation package. */
  noPacote: boolean;
  /** True when a document is already stored for the type (route to Substituir). */
  jaAnexado: boolean;
};

/**
 * Loads the attachable document types for the opportunity.
 *
 * The catalogue is NOT duplicated on the client: which types belong to this
 * opportunity's package is a business reading, and a local copy would offer
 * types the API refuses.
 *
 * @throws {Error} with a localised message on 4xx/5xx — never an empty list,
 * which would read as "this opportunity accepts no documents".
 */
export async function listarTiposAnexaveis(
  opportunityId: string,
): Promise<MinutaTipoAnexavel[]> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/minutas/tipos-anexaveis`,
    ),
    { cache: 'no-store' },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      parseError(body, `Falha ao carregar os tipos de documento (${res.status}).`),
    );
  }

  const body = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(body) ? (body as MinutaTipoAnexavel[]) : [];
}

export type AnexarMinutaPayload = {
  tipo: string;
  file: File;
};

/**
 * Attaches a document to the minuta package with the type chosen by the user
 * (alignment of 25/08/2026 — the manual return leg of the Netlex flow).
 *
 * @throws {Error} with a localised message on 4xx/5xx. The 409 that routes the
 * user to "Substituir" arrives with the backend's own sentence.
 */
export async function anexarMinuta(
  opportunityId: string,
  payload: AnexarMinutaPayload,
): Promise<void> {
  const form = new FormData();
  form.append('tipo', payload.tipo);
  form.append('file', payload.file);

  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/minutas/anexar`,
    ),
    { method: 'POST', body: form, cache: 'no-store' },
  );

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      parseError(body, `Falha ao anexar o documento (${res.status}).`),
    );
  }
}

// ---------------------------------------------------------------------------
// Download (no fetch — uses anchor to trigger browser download)
// ---------------------------------------------------------------------------

/**
 * Returns the same-origin BFF URL for the minuta download. The BFF streams the
 * file bytes from the backend — never a presigned S3 URL.
 *
 * The caller should set this as the `href` of an `<a download>` element.
 */
export function minutaDownloadUrl(
  opportunityId: string,
  minutaId: string,
): string {
  return withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/minutas/${encodeURIComponent(minutaId)}/download`);
}
