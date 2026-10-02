'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { BTN_GHOST, BTN_PRIMARY } from '@/components/franquia/franquia-ui';

/**
 * "Solicitar ajuste" modal (FRQ-14) — shared by the franchise screen and the
 * posto (PCR) analysis mode, so it receives the block's pt-BR label instead
 * of one vocabulary's enum (the two vocabularies must not be mixed).
 *
 * Not a `useConfirm`: the criterion for a confirmation is an action that
 * deletes data, moves a state machine or notifies someone *irreversibly*.
 * Requesting an adjustment is a comment — it opens (or reuses) a pendência and
 * leaves the proposal in analysis. What it needs is an input, not a warning.
 *
 * Behaviour on failure: the dialog **stays open with the text intact**. The
 * analyst's sentence is the whole payload; closing on error would discard it.
 */
export function SolicitarAjusteDialog({
  blocoLabel,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  /** pt-BR heading of the block under adjustment; `null` ⇒ closed. */
  blocoLabel: string | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (comentario: string) => void;
}) {
  const [comentario, setComentario] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset and focus whenever a new block is opened.
  useEffect(() => {
    if (blocoLabel === null) return;
    setComentario('');
    const id = window.setTimeout(() => textareaRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [blocoLabel]);

  useEffect(() => {
    if (blocoLabel === null) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [blocoLabel, onCancel]);

  const handleSubmit = useCallback(() => {
    // Guarded here too: the form submits on Enter regardless of the button.
    if (busy || comentario.trim() === '') return;
    onSubmit(comentario.trim());
  }, [busy, comentario, onSubmit]);

  if (blocoLabel === null) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 px-4 py-10"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="solicitar-ajuste-title"
        className="w-full max-w-[520px] rounded-[var(--radius-md)] bg-white px-6 py-6 shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
      >
        <h4
          id="solicitar-ajuste-title"
          className="mb-2.5 text-(length:--t-h4) font-bold"
        >
          Solicitar ajuste — {blocoLabel}
        </h4>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <label
            htmlFor="solicitar-ajuste-texto"
            className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            Descreva o ajuste solicitado ao LT
          </label>
          <textarea
            id="solicitar-ajuste-texto"
            ref={textareaRef}
            value={comentario}
            disabled={busy}
            onChange={(e) => setComentario(e.target.value)}
            maxLength={2000}
            /*
             * Domain-neutral example: this dialog is shared by the franquia
             * screen AND by the posto (PCR) proposal panel, where the previous
             * copy ("revisar a taxa de franquia; ajustar o modelo de royalty")
             * pointed the analyst at blocks that do not exist on that screen.
             */
            placeholder="Ex.: revisar os valores informados; anexar o memorial de cálculo…"
            className="min-h-[90px] w-full resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2.5 text-(length:--t-caption)"
            data-testid="solicitar-ajuste-texto"
          />

          {error !== null && (
            <p
              role="alert"
              className="mt-2 text-[14px] text-(--color-danger)"
              data-testid="solicitar-ajuste-erro"
            >
              {error}
            </p>
          )}

          <div className="mt-4 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className={BTN_GHOST}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || comentario.trim() === ''}
              className={BTN_PRIMARY}
              data-testid="solicitar-ajuste-enviar"
            >
              {busy ? 'Enviando…' : 'Enviar solicitação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
