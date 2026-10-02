import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  AdicionarComentarioPayload,
  PatchPendenciaPayload,
  PendenciaAnexo,
  PendenciaDetalhe,
  ReatribuirPendenciaPayload,
  ResolverPendenciaPayload,
} from './types';
import { PendenciaNotFoundError } from './types';

/**
 * Real pendency detail via the BFF (`/api/pendencias/:id`), which injects
 * the session Bearer server-side and proxies `GET /v1/pendencias/:id`.
 *
 * API contract — F3 (VBR-144 épico / VBR-146 BE):
 *
 *   GET /v1/pendencias/:id
 *   Response 200: PendenciaDetalhe
 *   Response 404: { code: "PENDENCIA_NOT_FOUND" }
 */
export async function getPendenciaDetalhe(id: string): Promise<PendenciaDetalhe> {
  const res = await fetch(withBasePath(`/api/pendencias/${encodeURIComponent(id)}`));

  if (res.status === 404) throw new PendenciaNotFoundError(id);
  if (!res.ok) await throwApiError(res, 'Falha ao carregar a pendência');

  return (await res.json()) as PendenciaDetalhe;
}

/** POST /api/pendencias/:id/comentarios → POST /v1/pendencias/:id/comentarios */
export async function adicionarComentario(
  id: string,
  payload: AdicionarComentarioPayload,
): Promise<PendenciaDetalhe> {
  const res = await fetch(
    withBasePath(`/api/pendencias/${encodeURIComponent(id)}/comentarios`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (res.status === 404) throw new PendenciaNotFoundError(id);
  if (!res.ok) await throwApiError(res, 'Falha ao enviar comentário');

  return (await res.json()) as PendenciaDetalhe;
}

/** POST /api/pendencias/:id/resolver → POST /v1/pendencias/:id/resolver */
export async function resolverPendencia(
  id: string,
  payload: ResolverPendenciaPayload,
): Promise<PendenciaDetalhe> {
  const res = await fetch(
    withBasePath(`/api/pendencias/${encodeURIComponent(id)}/resolver`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (res.status === 404) throw new PendenciaNotFoundError(id);
  if (!res.ok) await throwApiError(res, 'Falha ao resolver a pendência');

  return (await res.json()) as PendenciaDetalhe;
}

/** POST /api/pendencias/:id/reatribuir → POST /v1/pendencias/:id/reatribuir */
export async function reatribuirPendencia(
  id: string,
  payload: ReatribuirPendenciaPayload,
): Promise<PendenciaDetalhe> {
  const res = await fetch(
    withBasePath(`/api/pendencias/${encodeURIComponent(id)}/reatribuir`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (res.status === 404) throw new PendenciaNotFoundError(id);
  if (!res.ok) await throwApiError(res, 'Falha ao reatribuir a pendência');

  return (await res.json()) as PendenciaDetalhe;
}

/** PATCH /api/pendencias/:id → PATCH /v1/pendencias/:id */
export async function patchPendencia(
  id: string,
  payload: PatchPendenciaPayload,
): Promise<PendenciaDetalhe> {
  const res = await fetch(
    withBasePath(`/api/pendencias/${encodeURIComponent(id)}`),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (res.status === 404) throw new PendenciaNotFoundError(id);
  if (!res.ok) await throwApiError(res, 'Falha ao atualizar a pendência');

  return (await res.json()) as PendenciaDetalhe;
}

/**
 * Lists all attachments referenced by a pendência (thread + resolution).
 *
 * Each `id` maps to the existing same-origin view stream:
 * `GET /api/pendencias/:id/anexos/:anexoId/view`.
 * The signed URL never reaches the browser (CA-6).
 */
export async function listPendenciaAnexos(
  pendenciaId: string,
): Promise<PendenciaAnexo[]> {
  const res = await fetch(
    withBasePath(`/api/pendencias/${encodeURIComponent(pendenciaId)}/anexos`),
    { cache: 'no-store' },
  );

  if (res.status === 404) throw new PendenciaNotFoundError(pendenciaId);
  if (!res.ok) await throwApiError(res, 'Falha ao carregar os anexos');

  return (await res.json()) as PendenciaAnexo[];
}

/**
 * Uploads the file that will accompany a comment in the thread.
 *
 * Its own endpoint, not the opportunity checklist: that one is gated to the
 * profiles that own the checklist, so the people who converse in a ticket
 * (Integridade, CCOB) got a 403 — and a thread attachment is not a checklist
 * item anyway.
 */
export async function uploadPendenciaAnexo(
  pendenciaId: string,
  file: File,
): Promise<{ anexoId: string; anexoNome: string }> {
  const body = new FormData();
  body.append('file', file);

  const res = await fetch(
    withBasePath(`/api/pendencias/${encodeURIComponent(pendenciaId)}/anexos`),
    { method: 'POST', body },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao anexar o arquivo');
  }

  return (await res.json()) as { anexoId: string; anexoNome: string };
}
