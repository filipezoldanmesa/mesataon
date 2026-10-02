import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import { PostoPhotoUploadError, type PostoPhoto } from './posto-photos.types';

/**
 * Lists the photos already stored for a proposal
 * (`GET /api/proposals/:id/posto-photos`).
 *
 * The BFF rewrites each `url` to its own stream route, so the signed storage
 * URL never reaches the browser.
 *
 * Throws on network/5xx/403 — a failure must NOT be flattened into `[]`, which
 * the UI reads as "nenhuma foto enviada" (CLAUDE.md §"Erro nunca vira estado
 * vazio"). A 404 is already turned into an empty list by the route handler,
 * because "proposta inexistente" genuinely has no photos.
 *
 * Confirmed API contract — VBR-89 BE / VBR-255:
 *
 *   GET /v1/proposals/{id}/posto-photos
 *   200 Array<PostoPhoto>
 *   401 { error }  — session cookie ausente (BFF guard)
 *   403 { error }  — perfil sem permissão
 */
export async function listPostoPhotos(proposalId: string): Promise<PostoPhoto[]> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/posto-photos`),
    { cache: 'no-store' },
  );

  if (!res.ok) {
    throw new Error(`Falha ao carregar as fotos do ponto (${res.status}).`);
  }

  return (await res.json()) as PostoPhoto[];
}

/**
 * Uploads a posto/imóvel photo via the BFF
 * (`POST /api/proposals/:id/posto-photos`, multipart `file` field).
 *
 * Throws {@link PostoPhotoUploadError} on 400 (arquivo ausente, tipo não
 * aceito, ou tamanho excedido).
 *
 * Confirmed API contract — VBR-89 BE (`PostoPhotoDto`):
 *
 *   POST /v1/proposals/{id}/posto-photos
 *   Body: multipart/form-data — field `file`
 *
 *   201 PostoPhoto { id, fileName, mimeType, sizeBytes, url, createdAt }
 *       `url` is a signed cloud-storage URL (S3/Hub, ADR-0006 §4.5)
 *   400 { statusCode, code: "BAD_REQUEST", message }
 *       arquivo ausente · tipo não aceito (só PNG/JPEG) · tamanho > 10 MB
 *   401 { error }  — session cookie ausente (BFF guard)
 *   404 { error }  — proposta não encontrada
 */
export async function uploadPostoPhoto(proposalId: string, file: File): Promise<PostoPhoto> {
  const body = new FormData();
  body.append('file', file);

  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/posto-photos`),
    { method: 'POST', body },
  );

  if (res.status === 400) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new PostoPhotoUploadError(data?.message);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao enviar a foto');
  }

  return (await res.json()) as PostoPhoto;
}

/**
 * Removes a posto/imóvel photo via the BFF
 * (`DELETE /api/proposals/:id/posto-photos/:photoId`).
 *
 * A 404 is treated as a successful no-op (photo was already deleted).
 *
 * Confirmed API contract — VBR-89 BE:
 *
 *   POST /v1/proposals/{id}/posto-photos:remover  (⚠️ POST, não DELETE — o edge
 *   recusa o método; ADO 67557/67796. A rota BFF ainda aceita DELETE.)
 *
 *   204  — removida com sucesso
 *   401 { error }  — session cookie ausente (BFF guard)
 *   404 { error }  — proposta ou foto não encontrada (no-op aceito pelo cliente)
 */
export async function deletePostoPhoto(proposalId: string, photoId: string): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/posto-photos/${encodeURIComponent(photoId)}`,
    ),
    { method: 'POST' },
  );

  if (!res.ok && res.status !== 404) {
    await throwApiError(res, 'Falha ao remover a foto');
  }
}
