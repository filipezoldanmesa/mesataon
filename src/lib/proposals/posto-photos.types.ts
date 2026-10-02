/**
 * Fotos do posto e do imóvel de uma proposta (PRD F4 §7.4 — "Situação do
 * posto e do imóvel" → "Fotos do posto e do imóvel", obrigatórias na
 * análise). Mirrors `apps/api/src/proposals/dto/posto-photo.dto.ts`.
 *
 * API contract (VBR-89 BE):
 *   GET    /v1/proposals/{id}/posto-photos           → 200 PostoPhoto[] | 404
 *   POST   /v1/proposals/{id}/posto-photos           → 201 PostoPhoto | 400 | 404
 *   DELETE /v1/proposals/{id}/posto-photos/{photoId}  → 204 | 404
 *
 * ⚠️ The `GET` is the source of truth for the list — accumulating uploads only
 * in component state (which this doc used to describe as deliberate) made every
 * reload render "Nenhuma foto anexada ainda" over photos that were persisted,
 * so the upload reported success and looked undone.
 */
export interface PostoPhoto {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** URL (assinada, no ACL real) para visualizar/baixar a foto. */
  url: string;
  createdAt: string;
}

/**
 * Accepted mime types for posto/imóvel photo uploads (mirrors the backend's
 * fixed rule, `proposals/domain/accepted-posto-photo-mime-type.ts`).
 *
 * ⚠️ `application/pdf` faz parte da lista desde 10/09/2026 — o LT recebe do
 * posto um PDF único com as fotos compiladas, e recusá-lo obrigava a recortá-lo
 * em imagens. Toda tela que renderiza uma foto tem de perguntar {@link ehAnexoPdf}
 * antes de montar um `<img>`.
 */
export const ACCEPTED_POSTO_PHOTO_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/pdf',
];

/** O atributo `accept` do `<input type="file">` das dropzones de foto. */
export const ACCEPT_POSTO_PHOTO =
  'image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf';

/**
 * Se este anexo de foto é, na verdade, um PDF.
 *
 * Existe porque o `<img>` de um PDF é um thumbnail quebrado — e "quebrado" aqui
 * cairia no mesmo fallback de "Falha ao carregar a foto", que afirmaria um erro
 * sobre um arquivo íntegro. O `mimeType` é a fonte (é o que o backend gravou no
 * upload); a extensão é a rede para o registro antigo cujo mime chegou
 * genérico (`application/octet-stream`).
 */
export function ehAnexoPdf(anexo: {
  mimeType?: string | null;
  fileName?: string | null;
}): boolean {
  return (
    anexo.mimeType?.toLowerCase() === 'application/pdf' ||
    (anexo.fileName ?? '').toLowerCase().endsWith('.pdf')
  );
}

/** Maximum file size for a posto/imóvel photo upload (10 MB, mirrors the backend). */
export const MAX_POSTO_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;

/** Thrown on 400 — arquivo ausente, tipo não aceito (só PDF/PNG/JPEG), ou tamanho excedido (10 MB). */
export class PostoPhotoUploadError extends Error {
  constructor(message = 'Falha ao enviar a foto do posto/imóvel.') {
    super(message);
    this.name = 'PostoPhotoUploadError';
  }
}
