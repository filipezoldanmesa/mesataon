'use client';

import { useEffect, useState } from 'react';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  variant: ToastVariant;
}

/**
 * Screen-reader prefix per variant (VBR-291). The prototype toast is a single
 * dark strip with no color coding, so the variant is conveyed textually —
 * assistive tech still distinguishes an error from a success.
 */
const VARIANT_PREFIX: Record<ToastVariant, string> = {
  success: '',
  error: 'Erro: ',
  info: '',
};

/** Auto-dismiss duration in milliseconds (prototype: 2400 ms). */
const DISMISS_MS = 2400;

// ---------------------------------------------------------------------------
// ToastItem — single notification (prototype `.toast` spec)
// ---------------------------------------------------------------------------

function ToastItem({
  message,
  variant,
  onDismiss,
}: {
  message: string;
  variant: ToastVariant;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-variant={variant}
      // Clicking the toast dismisses it (no dedicated close button in the
      // prototype). Auto-dismiss covers the no-interaction path.
      onClick={onDismiss}
      className="cursor-pointer rounded-[var(--radius-xs)] bg-(--neutral-900) px-[18px] py-3 text-(length:--t-caption) text-white shadow-[var(--shadow-card)]"
    >
      {VARIANT_PREFIX[variant]}
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToastContainer — fixed bottom-center, single toast (04-analise-sneg.html)
// ---------------------------------------------------------------------------

/**
 * Renders the current toast notification, faithful to the prototype `.toast`:
 * fixed at `bottom: 24px`, horizontally centered, dark (`--neutral-900`),
 * ONE toast at a time (a new toast replaces the previous), 2400 ms
 * auto-dismiss (VBR-291).
 *
 * Usage:
 *   const { toasts, addToast } = useToast();
 *   <ToastContainer toasts={toasts} onDismiss={removeToast} />
 */
export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  // Single-toast rule: only the most recent message renders.
  const current = toasts[toasts.length - 1];
  if (!current) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <ToastItem
        key={current.id}
        message={current.message}
        variant={current.variant}
        onDismiss={() => onDismiss(current.id)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// useToast — state management hook
// ---------------------------------------------------------------------------

let _nextId = 1;

/**
 * Manages toast notifications. The public API is unchanged (VBR-291):
 * `addToast(message, variant)` — but only the latest toast is displayed
 * (prototype shows a single strip; a new call replaces the previous one).
 *
 * @example
 * const { toasts, addToast, removeToast } = useToast();
 * addToast('Analista reatribuído com sucesso!', 'success');
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function addToast(message: string, variant: ToastVariant = 'info') {
    const id = _nextId++;
    // Single-toast rule: replace instead of stacking.
    setToasts([{ id, message, variant }]);
  }

  function removeToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { toasts, addToast, removeToast };
}
