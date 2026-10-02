'use client';

import { useState } from 'react';

/**
 * Reasons offered for voiding an envelope, verbatim from the prototype
 * (`01g-oportunidade-assinatura.html`, modal `#modalAnular`).
 *
 * A closed list plus a free-text comment, and not free text alone: the reason
 * is written to the DocuSign envelope and to the SOX trail, and a list is what
 * makes those records comparable later.
 */
export const MOTIVOS_ANULACAO = [
  'Ajuste no documento',
  'Dados incorretos no contrato',
  'Solicitação do cliente',
  'Cliente não vai mais assinar · oportunidade cancelada',
  'Outro',
] as const;

export type AnularEnvioPayload = { motivo: string };

/**
 * "Anular envio" modal (protótipo `01g`).
 *
 * Not `useConfirm`: the criterion for a confirm dialog is an action that
 * deletes, moves a state machine or notifies irreversibly — this one does all
 * three, but it also needs INPUT, and the reason is the payload. A failure
 * keeps the modal open with what the user typed.
 */
export function AnularEnvioDialog({
  envelopeLabel,
  consequencia = 'a oportunidade volta para minutas',
  pending,
  onCancel,
  onConfirm,
}: {
  /** Envelope identifier shown in the sentence, e.g. `ENV-2026-0428`. */
  envelopeLabel: string | null;
  /**
   * O que acontece ALÉM do cancelamento no DocuSign, em uma oração.
   *
   * ⚠️ Parametrizado porque o diálogo serve dois envelopes com consequências
   * DIFERENTES, e a frase fixa mentia no segundo: anular o pacote do Termo de
   * Cessão **não** devolve contrato nenhum para a minuta — o contrato principal
   * já está assinado a essa altura. Medido na tela em 13/09/2026, o modal do
   * Termo prometia "a oportunidade volta para minutas".
   */
  consequencia?: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (payload: AnularEnvioPayload) => void | Promise<void>;
}) {
  const [motivo, setMotivo] = useState<string>(MOTIVOS_ANULACAO[0]);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  function submit() {
    // "Outro" without a comment would write the literal word "Outro" to the
    // envelope and to the audit trail — a reason that explains nothing.
    if (motivo === 'Outro' && !comentario.trim()) {
      setErro('Descreva o motivo da anulação.');
      return;
    }
    setErro(null);
    const texto = comentario.trim() ? `${motivo} — ${comentario.trim()}` : motivo;
    void onConfirm({ motivo: texto });
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="anular-envio-title"
        className="relative w-full max-w-[520px] rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-[var(--shadow-card)]"
      >
        <h3 id="anular-envio-title" className="mb-2.5 text-(length:--t-h4) font-bold">
          Anular envio
        </h3>
        <p className="mb-4 text-(length:--t-caption) leading-relaxed text-(--color-text)">
          O envelope {envelopeLabel ?? 'de assinatura'} será cancelado no DocuSign e{' '}
          {consequencia}. Informe o motivo.
        </p>

        <label className="mb-1 block text-(length:--t-caption) font-bold uppercase tracking-[.3px] text-(--color-text-muted)">
          Motivo
        </label>
        <select
          aria-label="Motivo"
          className="mb-4 w-full rounded-[var(--radius-xxs)] border border-(--color-border) px-3 py-2 text-(length:--t-caption)"
          value={motivo}
          disabled={pending}
          onChange={(e) => setMotivo(e.target.value)}
        >
          {MOTIVOS_ANULACAO.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-(length:--t-caption) font-bold uppercase tracking-[.3px] text-(--color-text-muted)">
          Comentário
        </label>
        <textarea
          aria-label="Comentário"
          rows={3}
          className="w-full rounded-[var(--radius-xxs)] border border-(--color-border) px-3 py-2 text-(length:--t-caption)"
          value={comentario}
          disabled={pending}
          onChange={(e) => setComentario(e.target.value)}
        />

        {erro && (
          <p role="alert" className="mt-2 text-(length:--t-caption) font-bold text-(--color-danger)">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-[var(--radius-xxs)] border border-(--color-border) px-4 py-2 text-(length:--t-caption) font-bold"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="anular-confirmar"
            onClick={submit}
            disabled={pending}
            className="rounded-[var(--radius-xxs)] border border-transparent bg-(--color-danger) px-4 py-2 text-(length:--t-caption) font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? 'Anulando…' : 'Confirmar anulação'}
          </button>
        </div>
      </div>
    </div>
  );
}
