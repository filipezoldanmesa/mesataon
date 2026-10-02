'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Confirmation for an action the user cannot simply undo — deletion, status
 * change, releasing/emitting something.
 *
 * Why a component instead of `window.confirm`: the native dialog is unstyled,
 * blocks the whole tab, cannot say WHAT is being changed in DS typography, and is
 * suppressible by the browser. This one names the target of the action, keeps the
 * destructive tone visually distinct, and keeps focus inside itself.
 *
 * Rule of thumb for when to wrap an action: it writes AND (deletes data ‖ moves a
 * state machine ‖ notifies someone). "Comentar" and filters do not qualify;
 * "Marcar como resolvida", "Excluir", "Liberar para aprovação" do.
 */

export type ConfirmTone = 'default' | 'danger';

export type ConfirmRequest = {
  title: string;
  /** One or two sentences naming exactly what changes. */
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  onConfirm: () => void | Promise<void>;
};

const TONE_CLASS: Record<ConfirmTone, string> = {
  default:
    'border-transparent bg-(--secondary-500) text-white hover:bg-(--secondary-600)',
  danger:
    'border-transparent bg-(--color-danger) text-white hover:bg-(--red-700)',
};

export function ConfirmDialog({
  request,
  busy = false,
  error = null,
  onCancel,
}: {
  request: ConfirmRequest | null;
  busy?: boolean;
  /**
   * Mensagem da tentativa que falhou. Renderizada DENTRO do diálogo porque o
   * diálogo é o que está na frente do usuário: com o modal aberto por cima, um
   * banner no card atrás dele não é visto — foi exatamente o sintoma relatado no
   * ADO 67595 ("não apresenta mensagem de erro, apenas não exclui, retornando a
   * exibição do quadro").
   */
  error?: string | null;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the confirm button on open so the dialog is operable from the keyboard
  // right away; Esc cancels (never confirms).
  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [request, onCancel]);

  if (!request) return null;

  const tone = request.tone ?? 'default';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      // Backdrop click cancels — the same affordance as Esc.
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={request.description ? 'confirm-dialog-desc' : undefined}
        data-testid="confirm-dialog"
        className="w-full max-w-[420px] rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="text-(length:--t-h4) font-bold text-(--neutral-900)"
        >
          {request.title}
        </h2>

        {request.description && (
          <p
            id="confirm-dialog-desc"
            className="mt-2 text-(length:--t-caption) text-(--color-text-muted)"
          >
            {request.description}
          </p>
        )}

        {error && (
          <p
            role="alert"
            data-testid="confirm-dialog-error"
            className="mt-3 text-(length:--t-caption) text-(--color-danger)"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid="confirm-dialog-cancel"
            className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2.25 text-(length:--t-caption) font-bold text-(--secondary-500) transition hover:bg-(--neutral-50) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {request.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void request.onConfirm()}
            disabled={busy}
            data-testid="confirm-dialog-confirm"
            className={`inline-flex items-center rounded-[var(--radius-xxs)] border px-4 py-2.25 text-(length:--t-caption) font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${TONE_CLASS[tone]}`}
          >
            {busy ? 'Confirmando…' : request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export type UseConfirmResult = {
  /** Opens the dialog for this request; resolves nothing (the callback runs). */
  ask: (request: ConfirmRequest) => void;
  /** Render this once in the component tree. */
  dialog: React.ReactNode;
};

/**
 * Keeps the dialog state so a call site stays two lines:
 *
 * ```tsx
 * const confirm = useConfirm();
 * <button onClick={() => confirm.ask({ title: 'Excluir produto?', confirmLabel: 'Excluir',
 *   tone: 'danger', onConfirm: () => void handleDelete(line) })}>Excluir</button>
 * {confirm.dialog}
 * ```
 *
 * The dialog closes only after `onConfirm` settles, so a failing action keeps the
 * dialog open — and now shows the rejection's message inside it, instead of
 * leaving the user with an open dialog and no explanation (ADO 67595).
 */
export function useConfirm(): UseConfirmResult {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setRequest(null);
    setBusy(false);
    setError(null);
  }, []);

  const ask = useCallback((next: ConfirmRequest) => {
    setError(null);
    setRequest({
      ...next,
      onConfirm: async () => {
        setBusy(true);
        setError(null);
        try {
          await next.onConfirm();
          setRequest(null);
        } catch (cause) {
          /*
           * A rejeição NÃO propaga (escapar de um handler de clique
           * fire-and-forget produzia unhandled rejection), mas também não é
           * descartada: a frase vai para dentro do próprio diálogo, que
           * permanece aberto.
           *
           * Antes, o `catch` vazio apostava que "a tela da ação já mostra a
           * falha" — e quando a tela não mostrava, o resultado era um diálogo
           * aberto sem explicação nenhuma. Foi o segundo defeito do ADO 67595:
           * a remoção da garantia falhava no edge e nada aparecia. Mensagem no
           * diálogo é o piso; a tela pode continuar mostrando a sua.
           */
          setError(messageOf(cause));
        } finally {
          setBusy(false);
        }
      },
    });
  }, []);

  return {
    ask,
    dialog: <ConfirmDialog request={request} busy={busy} error={error} onCancel={close} />,
  };
}

/**
 * Frase exibível de um motivo de rejeição.
 *
 * `throwApiError` lança `Error` com a frase do backend, que é o que o usuário
 * precisa ler. Valor não-`Error` (ou `Error` sem mensagem) cai numa frase
 * genérica — nunca em `String(cause)`, que renderizaria `[object Object]`.
 */
function messageOf(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim() !== '') return cause.message;
  return 'Não foi possível concluir a ação. Tente novamente.';
}
