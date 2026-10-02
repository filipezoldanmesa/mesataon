import { withBasePath } from '@/lib/base-path';

/** A posto photo as the backend returns it (`PostoPhotoDto`). */
export type BackendPostoPhoto = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

/** A posto photo as the screen consumes it. */
export type PostoPhoto = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Same-origin URL the `<img>` uses; the BFF streams the bytes. */
  url: string;
  createdAt: string;
};

/**
 * Rewrites the storage URL into a same-origin BFF URL.
 *
 * The backend signs a URL for the document store itself. Handing it to the
 * browser breaks for two independent reasons:
 *
 * 1. **dev** — the endpoint is the Docker DNS name (`http://minio:9000`), which
 *    resolves inside the compose network and nowhere else, so every `<img>` fell
 *    back to "Falha ao carregar a foto";
 * 2. **prod** — a signed URL is a bearer credential for that object; it should
 *    not leak into page HTML, browser history or logs.
 *
 * So the photo is served through `/api/proposals/:id/posto-photos/:photoId/view`,
 * which calls the backend's own stream route
 * (`GET /v1/proposals/:id/posto-photos/:photoId/stream`) and pipes the bytes
 * through — no presigned URL is generated or exposed on this path, mirroring
 * the FAP document stream (ADR-0023 §D1). Same "never expose the credential
 * to the page" rule the session cookie follows.
 *
 * ⚠️ The URL goes through {@link withBasePath}. Every deployed environment sets
 * `NEXT_PUBLIC_BASE_PATH` (`/dev/gestor-oportunidades-web`, …); a root-relative
 * `/api/...` string lands outside the ALB's `/prefix/*` rule and outside Next's
 * own basePath, so every thumbnail 404'd in dev/stage/prod while working
 * locally, where the prefix is empty. The FAP link already did this correctly.
 */
export function mapPostoPhoto(
  proposalId: string,
  photo: BackendPostoPhoto,
): PostoPhoto {
  return {
    id: photo.id,
    fileName: photo.fileName,
    mimeType: photo.mimeType,
    sizeBytes: photo.sizeBytes,
    url: withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/posto-photos/${encodeURIComponent(photo.id)}/view`,
    ),
    createdAt: photo.createdAt,
  };
}

export function mapPostoPhotos(
  proposalId: string,
  photos: BackendPostoPhoto[],
): PostoPhoto[] {
  return (photos ?? []).map((photo) => mapPostoPhoto(proposalId, photo));
}
