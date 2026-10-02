'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { SECONDARY_OUTLINE_BTN } from '@/components/button';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';
import { ehAnexoPdf } from '@/lib/proposals/posto-photos.types';

/**
 * Full-size viewer for photos rendered as thumbnails (fotos do ponto, F4/FRQ-11).
 *
 * A 118×86 thumbnail with `object-cover` is a crop: the fachada the LT uploaded
 * to document the ponto is exactly what it cuts off. The grid could only be
 * inspected by downloading the file or opening the stream URL by hand, so the
 * evidence was effectively write-only.
 *
 * Nothing here talks to the network: `url` is already the same-origin BFF
 * stream route (`/api/proposals/:id/posto-photos/:photoId/view`) the thumbnail
 * uses, so the presigned document-store URL never reaches the browser.
 */

/** The projection the viewer needs — `PostoPhoto` is assignable. */
export type ViewablePhoto = {
  id: string;
  fileName: string;
  /** Same-origin stream URL. */
  url: string;
  /**
   * Mime do anexo, quando o chamador o conhece. As dropzones de foto aceitam
   * `application/pdf` desde 10/09/2026, e é este campo que decide entre `<img>`
   * e o leitor de PDF — sem ele, um PDF renderiza como imagem quebrada.
   */
  mimeType?: string;
};

export function PhotoViewer({
  photos,
  openPhotoId,
  onClose,
  onNavigate,
}: {
  photos: readonly ViewablePhoto[];
  /** `null` closes the viewer. An id absent from `photos` also closes it. */
  openPhotoId: string | null;
  onClose: () => void;
  /** Called with the id the user navigated to (arrows / prev-next buttons). */
  onNavigate: (photoId: string) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState(false);

  const index = photos.findIndex((photo) => photo.id === openPhotoId);
  const photo = index >= 0 ? photos[index] : null;
  const total = photos.length;

  /*
   * `photo.url` vem de resposta HTTP. Hoje quem a monta é a BFF, com `apiUrl`,
   * mas o tipo é `string` e o sink aqui é um `href` — onde `javascript:…`
   * executa. Recusado, a foto cai no MESMO estado de falha que um byte
   * ilegível produz: a tela não inventa destino, e o "Abrir em nova aba" some
   * junto (um link sem href seria controle morto).
   */
  const fonte = urlDeMidiaSegura(photo?.url);

  const goTo = useCallback(
    (offset: number) => {
      if (index < 0 || total < 2) return;
      // Wraps around: at the last photo, "next" returns to the first — a strip
      // of three photos is not a document with an end.
      const next = (index + offset + total) % total;
      onNavigate(photos[next].id);
    },
    [index, total, photos, onNavigate],
  );

  // A failed load must not survive navigation: the NEXT photo deserves its own
  // attempt, otherwise one broken file poisons the whole strip.
  useEffect(() => {
    setFailed(false);
  }, [openPhotoId]);

  useEffect(() => {
    if (!photo) return;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') goTo(1);
      if (event.key === 'ArrowLeft') goTo(-1);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [photo, onClose, goTo]);

  if (!photo) return null;

  return (
    <div
      /*
       * `z-[200]`, not `z-50`: the screens that host photo grids render a FIXED
       * sendbar at `z-50` as a sibling after `<main>`, and with equal z-index
       * the later element in the DOM paints on top — the same defect that
       * sliced the "Concluir" button of the proposal modal in half.
       */
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
      // Backdrop click closes — the same affordance as Esc and the × button.
      onClick={onClose}
      data-testid="photo-viewer-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Foto: ${photo.fileName}`}
        data-testid="photo-viewer"
        className="flex max-h-[92dvh] w-full max-w-[min(1100px,92vw)] flex-col overflow-hidden rounded-[var(--radius-md)] bg-(--color-surface) shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-(--color-border) px-4 py-3">
          <span
            className="min-w-0 flex-1 truncate text-(length:--t-caption) font-bold"
            title={photo.fileName}
          >
            {photo.fileName}
          </span>

          {total > 1 && (
            <span
              className="shrink-0 text-[12px] tabular-nums text-(--color-text-muted)"
              data-testid="photo-viewer-counter"
            >
              {index + 1} de {total}
            </span>
          )}

          {/*
           * Escape hatch for zoom, rotation and saving — all of which belong to
           * the browser's own image view, not to a viewer we would reimplement.
           *
           * Styled as a button but kept an `<a>`: it NAVIGATES. A `<button>`
           * calling `window.open` would lose ctrl/middle-click, "copy link
           * address" and the popup-blocker's own rules, and would announce an
           * action where the user is getting a new tab.
           */}
          {fonte !== null && (
            <a
              href={fonte}
              target="_blank"
              rel="noopener noreferrer"
              className={`${SECONDARY_OUTLINE_BTN} shrink-0 py-1.5 text-[12px]`}
              data-testid="photo-viewer-open-tab"
            >
              Abrir em nova aba
            </a>
          )}

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="photo-viewer-close"
            className="shrink-0 rounded-full px-2 text-[22px] leading-none text-(--color-text-muted) hover:bg-(--neutral-40) hover:text-(--neutral-900)"
          >
            ×
          </button>
        </header>

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-(--neutral-900) p-2">
          {ehAnexoPdf(photo) && fonte !== null ? (
            /*
             * PDF: o próprio visualizador do browser, no mesmo URL same-origin
             * que a miniatura usa (`Content-Disposition: inline`). Um <img>
             * aqui só produziria o erro de carga.
             */
            <iframe
              src={fonte}
              title={photo.fileName}
              className="h-full w-full bg-white"
              data-testid="photo-viewer-pdf"
            />
          ) : failed || fonte === null ? (
            <p
              className="px-6 py-16 text-center text-(length:--t-caption) text-white"
              data-testid="photo-viewer-failed"
              role="alert"
            >
              Não foi possível carregar esta foto. Tente abrir em nova aba.
            </p>
          ) : (
            /* Plain <img>: the BFF streams the bytes from the document store, so
               next/image would put a second proxy in front of a same-origin,
               already-authorized route. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fonte}
              alt={photo.fileName}
              onError={() => setFailed(true)}
              className="max-h-full max-w-full object-contain"
              data-testid="photo-viewer-image"
            />
          )}

          {total > 1 && (
            <>
              <NavButton side="left" label="Foto anterior" onClick={() => goTo(-1)} />
              <NavButton side="right" label="Próxima foto" onClick={() => goTo(1)} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function NavButton({
  side,
  label,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={`photo-viewer-${side === 'left' ? 'prev' : 'next'}`}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-black/55 px-3 py-2 text-[18px] leading-none text-white hover:bg-black/75 ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      {side === 'left' ? '‹' : '›'}
    </button>
  );
}

export type UsePhotoViewerResult = {
  /** Opens the viewer on this photo. */
  open: (photoId: string) => void;
  /** Render this once in the component tree. */
  viewer: React.ReactNode;
  /**
   * Se o visualizador está aberto agora.
   *
   * Existe para quem hospeda o grid DENTRO de outro modal: o visualizador
   * escuta `Escape` no `document`, e o modal de baixo também. Sem esta guarda um
   * único Esc fecha os dois — e leva junto o formulário que o usuário estava
   * preenchendo.
   */
  isOpen: boolean;
};

/**
 * Keeps the open photo in state so a call site stays two lines:
 *
 * ```tsx
 * const viewer = usePhotoViewer(photos);
 * <button onClick={() => viewer.open(photo.id)}>…</button>
 * {viewer.viewer}
 * ```
 *
 * The open photo is tracked by ID, not by index: the list reloads after every
 * upload and deletion, and an index would silently point at a different photo
 * (or past the end) the moment the strip changes underneath.
 */
export function usePhotoViewer(photos: readonly ViewablePhoto[]): UsePhotoViewerResult {
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  return {
    open: setOpenPhotoId,
    /*
     * Casa com a regra do próprio `PhotoViewer`, que não renderiza nada quando o
     * id aberto sumiu da lista (foto removida com o visualizador aberto): dizer
     * "aberto" ali travaria o Esc do modal de baixo sem nada na tela.
     */
    isOpen: photos.some((photo) => photo.id === openPhotoId),
    viewer: (
      <PhotoViewer
        photos={photos}
        openPhotoId={openPhotoId}
        onClose={() => setOpenPhotoId(null)}
        onNavigate={setOpenPhotoId}
      />
    ),
  };
}
