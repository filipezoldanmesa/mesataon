'use client';

import { useState } from 'react';

/**
 * Devolver a OPORTUNIDADE INTEIRA ao LT (`DEVOLVER_AO_LT` — 27/08/2026).
 *
 * Separado do `DevolverModal` do workspace SNEG, que devolve UMA proposta (RN-F2-03), e o
 * que os separa não é estilo: são dois atos com consequências diferentes, e o
 * modal é o único lugar em que o analista lê qual dos dois está prestes a
 * disparar. Um modal só, com um seletor "tudo / esta proposta", faria a escolha
 * mais consequente da tela caber num campo a mais.
 *
 * O aviso é o conteúdo, não decoração: este clique tira a oportunidade da
 * análise e a devolve ao preenchimento — e não existe "desfazer".
 *
 * Compartilhado (28/09/2026) entre o workspace SNEG e a visão regular da
 * oportunidade em análise: a Matriz RBAC v2.1 dá "Rejeitar / devolver" a SPCOM,
 * Gestor de Franquias e TI Sustentação, que não abrem o workspace. Um modal só
 * para o mesmo ato — duas cópias divergiriam no aviso, que é o conteúdo.
 */
export function DevolverOportunidadeModal({
  onConfirm,
  onCancel,
  loading,
  error,
  dicaPorProposta = true,
}: {
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
  loading: boolean;
  /** Recusa da última tentativa, exibida DENTRO do modal (que segue aberto). */
  error?: string | null;
  /**
   * Mostra a dica "use Devolver na linha da proposta". Só faz sentido no
   * workspace da SNEG, onde a devolução por proposta existe; na visão regular
   * da oportunidade (perfis de "Rejeitar / devolver" sem a análise) não há
   * essa linha, e a dica mandaria o usuário procurar um botão inexistente.
   */
  dicaPorProposta?: boolean;
}) {
  const [motivo, setMotivo] = useState('');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="devolver-opp-title"
      data-testid="devolver-oportunidade-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
    >
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-[var(--shadow-card)]">
        <h3 id="devolver-opp-title" className="mb-1 text-(length:--t-h4) font-bold">
          Devolver a oportunidade ao LT
        </h3>

        <div
          data-testid="devolver-oportunidade-aviso"
          className="mb-4 mt-3 rounded-[var(--radius-xs)] border border-(--yellow-700)/40 bg-(--yellow-700)/8 px-3 py-2.5 text-(length:--t-caption)"
        >
          <b>Você está recusando a oportunidade inteira.</b> Ela volta para{' '}
          <b>Em preenchimento</b> e todas as propostas em análise voltam ao LT.
          A análise só recomeça quando ele reenviar.
          {dicaPorProposta && (
            <div className="mt-1.5 text-(--color-text-muted)">
              Para devolver só uma proposta, use “Devolver” na linha dela — as
              demais seguem em análise.
            </div>
          )}
        </div>

        <label
          htmlFor="devolver-opp-motivo"
          className="mb-1 block text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
        >
          Motivo
        </label>
        <textarea
          id="devolver-opp-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          disabled={loading}
          placeholder="Motivo da devolução — visível para o LT"
          className="min-h-[70px] w-full rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2 text-(length:--t-caption) font-[inherit] disabled:opacity-60"
        />

        {error && (
          <p
            role="alert"
            data-testid="devolver-oportunidade-erro"
            className="mt-2 text-(length:--t-caption) text-(--color-danger)"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-1.5 text-(length:--t-caption) font-bold hover:bg-(--neutral-40) disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="devolver-oportunidade-confirm"
            onClick={() => onConfirm(motivo.trim())}
            disabled={loading || !motivo.trim()}
            className="rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-3 py-1.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Devolvendo…' : 'Devolver oportunidade'}
          </button>
        </div>
      </div>
    </div>
  );
}
