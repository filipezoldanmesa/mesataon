'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';

type Props = {
  /** Header title (`h4`). */
  title: string;
  /** Header subtitle — the scope being picked from. */
  subtitle: string;
  /** Modal body: normally a {@link DirectoryUserList}. */
  children: ReactNode;
  /**
   * Footer rendered below the body, outside the scroll area.
   *
   * Only the reatribuição uses it (motivo + Cancelar/Confirmar): "Adicionar à
   * equipe" acts on the row click and has nothing to put there.
   */
  footer?: ReactNode;
  /** Closes the modal (×, backdrop click, Escape). */
  onClose: () => void;
};

/**
 * The modal shell of every collaborator picker — backdrop, card, header with
 * title/subtitle/×, Escape and click-outside to close.
 *
 * Reproduces the prototype's `.modal-ov` / `.modal` / `.modal-h` / `.modal-b`
 * (`01a-nova-oportunidade.html:219-227`), which is the design-system pattern for
 * this. Extracted from `add-member-modal.tsx` when the SNEG reassignment adopted
 * the same picker (ADO 67877) — the reassignment modal had been written by hand
 * with a different card width, a different header and no × affordance.
 */
export function DirectoryPickerModal({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: Props) {
  // Close on Escape.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} · ${subtitle}`}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[440px] overflow-hidden rounded-[var(--radius-md)] bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-5 py-[18px]">
          <div>
            <h4 className="text-(length:--t-h4) font-bold">{title}</h4>
            <p className="mt-0.5 text-(length:--t-small) text-(--color-text-muted)">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="text-[22px] leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[380px] overflow-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="border-t border-(--color-border) px-5 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}
