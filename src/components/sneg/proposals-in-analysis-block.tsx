'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PRIMARY_ACTION_BTN } from '@/components/button';
import { Permission } from '@/lib/auth-permissions';
import { usePermissions } from '@/hooks/use-permissions';
import { separarPropostasNaoEleitas } from '@/lib/opportunities/elected-visibility';
import { getOpportunityProposals as defaultGetProposals } from '@/lib/opportunities/opportunity-detail.data';
import { proposalHref } from '@/lib/proposals/proposal-href';
import type { OpportunityProposal } from '@/lib/opportunities/types';
import { PROPOSAL_STATUS_LABEL, ProposalStatus } from '@/lib/opportunities/types';
import { devolverProposal as defaultDevolver } from '@/lib/sneg/sneg-analysis.data';
import { DevolverValidationError } from '@/lib/sneg/sneg-analysis.types';
import { StatusPill } from '@/components/status-pill';
import type { PillVariant } from '@/components/status-pill';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Pill colour per backend status. Pure presentation keyed by the enum — the
 * status itself is decided by the backend (RN-F2-03), never derived here.
 */
const PROPOSAL_STATUS_VARIANT: Record<ProposalStatus, PillVariant> = {
  [ProposalStatus.EmPreenchimento]: 'neutral',
  [ProposalStatus.EmAnalise]: 'info',
  [ProposalStatus.Devolvida]: 'warning',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error';

type Props = {
  opportunityId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  getProposals?: (
    id: string,
    options?: { incluirNaoEleitas?: boolean },
  ) => Promise<OpportunityProposal[]>;
  /** Injectable for tests; defaults to the real BFF client. */
  devolver?: (proposalId: string, motivo: string) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DevolverModal({
  proposalCode,
  onConfirm,
  onCancel,
  isSubmitting,
  error,
}: {
  proposalCode: string;
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  const [motivo, setMotivo] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    if (!motivo.trim()) {
      setValidationError('O motivo é obrigatório para devolver a proposta.');
      return;
    }

    onConfirm(motivo.trim());
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="devolver-modal-title"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[480px] rounded-[var(--radius-md)] bg-white p-5 shadow-[0_20px_50px_rgba(0,0,0,.3)]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h4 id="devolver-modal-title" className="text-(length:--t-h4) font-bold">
            Devolver proposta {proposalCode}
          </h4>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onCancel}
            className="text-[22px] leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            &times;
          </button>
        </div>

        <p className="mb-3 text-(length:--t-caption) text-(--color-text-muted)">
          Informe o motivo da devolução. Apenas esta proposta mudará de estado — as
          demais permanecem em análise.
        </p>

        <label
          htmlFor="devolver-motivo"
          className="mb-1 block text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
        >
          Motivo *
        </label>
        <textarea
          id="devolver-motivo"
          ref={textareaRef}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Descreva o motivo da devolução…"
          className="w-full min-h-[56px] resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-[10px] py-2 text-(length:--t-caption) font-[inherit]"
        />

        {(validationError ?? error) && (
          <div
            role="alert"
            data-testid="devolver-error"
            className="mt-2 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2 text-(length:--t-small) text-(--red-700)"
          >
            {validationError ?? error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-3 border-t border-(--color-border) pt-3.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-[var(--radius-xxs)] border border-(--color-border) px-4 py-2 text-(length:--t-caption) font-bold text-(--color-text-muted) hover:bg-(--neutral-50) disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-[var(--radius-xxs)] bg-(--secondary-600) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-700) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Devolvendo…' : 'Confirmar devolução'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * "Propostas em análise" block — SNEG F2 (VBR-255).
 *
 * Lists all proposals of the opportunity, each with:
 *  - code · title · group (bandeira; omitted while the backend has none)
 *  - status pill rendering the backend `ProposalStatus` enum as-is
 *  - "Devolver" button → opens confirmation modal with mandatory reason field
 *
 * RN-F2-03: only the devolved proposal changes state; the others remain
 * "em análise". The status shown is always the backend's — the block never
 * derives it, so the row survives a reload (CA-F2-03).
 */
export function ProposalsInAnalysisBlock({
  opportunityId,
  getProposals = defaultGetProposals,
  devolver = defaultDevolver,
}: Props) {
  const { can } = usePermissions();
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [proposals, setProposals] = useState<OpportunityProposal[]>([]);
  const [naoEleitasAbertas, setNaoEleitasAbertas] = useState(false);

  /*
   * A partir do GATE 1 a listagem devolve só as propostas eleitas (RN-F2-04).
   * Quem tem autoridade de composição pede também as que ficaram de fora, para
   * a seção recolhida abaixo — é o único registro de que elas existiram, e sem
   * ele o trabalho descartado simplesmente some da tela. O backend só honra o
   * pedido para esse mesmo conjunto de perfis, então pedir sem poder não
   * devolveria nada.
   */
  const podeVerNaoEleitas = can(Permission.OpportunityCompose);

  // Devolver modal state
  const [devolverTarget, setDevolverTarget] = useState<OpportunityProposal | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devolverError, setDevolverError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadStatus('loading');

    getProposals(opportunityId, { incluirNaoEleitas: podeVerNaoEleitas })
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setProposals(data);
        setLoadStatus('loaded');
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setLoadStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [opportunityId, getProposals, podeVerNaoEleitas]);

  const handleDevolver = useCallback(
    async (motivo: string) => {
      if (!devolverTarget) return;
      setIsSubmitting(true);
      setDevolverError(null);

      try {
        await devolver(devolverTarget.id, motivo);

        if (!mountedRef.current) return;

        // RN-F2-03: only this proposal changes state. Mirrors the transition the
        // backend just applied so the row updates without a refetch; a reload
        // reads the same `DEVOLVIDA` from the backend.
        setProposals((prev) =>
          prev.map((p) =>
            p.id === devolverTarget.id ? { ...p, status: ProposalStatus.Devolvida } : p,
          ),
        );
        setDevolverTarget(null);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof DevolverValidationError) {
          setDevolverError(err.message);
        } else {
          setDevolverError('Falha ao devolver a proposta. Tente novamente.');
        }
      } finally {
        if (mountedRef.current) setIsSubmitting(false);
      }
    },
    [devolverTarget, devolver],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /*
   * `'análise'` é literal porque este bloco só é montado depois do GATE 1 (a
   * rota troca para a `AnaliseView` em `EM_ANALISE`). A regra do split é a
   * mesma que o backend aplica ao esconder — uma segunda regra aqui faria a
   * seção recolhida discordar do que a listagem devolve.
   */
  const { visiveis, naoEleitas } = separarPropostasNaoEleitas(proposals, 'análise');

  return (
    <section
      aria-labelledby="proposals-analysis-title"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      <h2 id="proposals-analysis-title" className="mb-3 text-(length:--t-h4) font-bold">
        Propostas em análise
      </h2>

      {loadStatus === 'loading' && (
        <div
          role="status"
          aria-label="Carregando propostas…"
          className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="loading-state"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
          />
          Carregando…
        </div>
      )}

      {loadStatus === 'error' && (
        <div
          role="alert"
          data-testid="error-state"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
        >
          Falha ao carregar as propostas. Verifique sua conexão e tente novamente.
        </div>
      )}

      {loadStatus === 'loaded' && visiveis.length === 0 && (
        <div
          data-testid="empty-state"
          className="rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
        >
          Nenhuma proposta em análise para esta oportunidade.
        </div>
      )}

      {loadStatus === 'loaded' && visiveis.length > 0 && (
        <div data-testid="proposals-list">
          {visiveis.map((proposal) => (
            /* Prototype `.prop` > `.pt`: pill above the name, `.pacts` on the right. */
            <div
              key={proposal.id}
              data-testid="proposal-row"
              className="mb-[10px] flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) p-[14px]"
            >
              <div className="min-w-0 flex-1">
                {/* `.pill` sits ON TOP of the name (inline-block, margin-bottom 6px) —
                    not beside the actions, where it competed with the CTA. */}
                <div className="mb-1.5">
                  <StatusPill variant={PROPOSAL_STATUS_VARIANT[proposal.status]}>
                    {PROPOSAL_STATUS_LABEL[proposal.status]}
                  </StatusPill>
                </div>

                {/* `.nm` — one bold line, as the prototype writes it. */}
                <div className="text-(length:--t-caption) font-bold">
                  {[proposal.code, proposal.title, proposal.group]
                    .filter((part): part is string => Boolean(part))
                    .join(' · ')}
                </div>

                {/* `.meta2` — omitted when the backend does not name the author,
                    never "Autor: —", which would read as an authorless proposal. */}
                {proposal.authorName && (
                  <div className="mt-0.5 text-(length:--t-caption) text-(--color-text-muted)">
                    Autor: {proposal.authorName}
                  </div>
                )}
              </div>

              {/* `.pacts` */}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {proposal.status === ProposalStatus.EmAnalise && (
                  <>
                    {/*
                     * The prototype's primary CTA. It is NAVIGATIONAL — the
                     * analysis happens on the proposal screen — and the target
                     * depends on the type, exactly as the prototype splits
                     * `03-proposta-analise` from `03-proposta-franquia`.
                     */}
                    <Link
                      href={proposalHref(opportunityId, proposal.id, proposal.tipoProposta)}
                      className={PRIMARY_ACTION_BTN}
                      data-testid={`analisar-link-${proposal.id}`}
                    >
                      Analisar →
                    </Link>

                    {/* `.lnk` */}
                    <button
                      type="button"
                      onClick={() => {
                        setDevolverError(null);
                        setDevolverTarget(proposal);
                      }}
                      className="cursor-pointer whitespace-nowrap border-none bg-none text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
                      data-testid={`devolver-btn-${proposal.id}`}
                    >
                      Devolver
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/*
       * "Propostas não eleitas" — registro do que ficou fora da composição.
       *
       * Só existe para quem pode compor (RN-F2-04): para os demais perfis a
       * lista nem chega do backend. Nasce RECOLHIDA porque o pedido do negócio
       * é que as não eleitas não apareçam a partir da análise; o que ela impede
       * é o outro extremo — trabalho descartado sumir sem deixar rastro, sem
       * ninguém conseguir sequer conferir qual cenário foi preterido.
       *
       * É LEITURA: nenhuma ação de análise ("Analisar", "Devolver") e nenhuma
       * re-eleição. Uma proposta fora da composição nunca entrou em análise
       * (o `marcarEmAnalise` só move as eleitas), então não há de onde devolvê-la
       * — e re-elegê-la aqui a deixaria `EM_PREENCHIMENTO` dentro de uma
       * oportunidade em análise, porque o `opportunity.entered_analysis` não
       * dispara duas vezes.
       */}
      {loadStatus === 'loaded' && naoEleitas.length > 0 && (
        <div className="mt-4 border-t border-(--color-border) pt-3">
          <button
            type="button"
            onClick={() => setNaoEleitasAbertas((aberta) => !aberta)}
            aria-expanded={naoEleitasAbertas}
            aria-controls="propostas-nao-eleitas"
            data-testid="nao-eleitas-toggle"
            className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-(length:--t-caption) font-bold text-(--color-text-muted) hover:text-(--secondary-500)"
          >
            {/* Mesmo chevron 16×16 dos cards recolhíveis; −90° quando fechado. */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              className="shrink-0 transition-transform duration-200"
              style={{ transform: naoEleitasAbertas ? undefined : 'rotate(-90deg)' }}
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Propostas não eleitas ({naoEleitas.length})
          </button>

          {naoEleitasAbertas && (
            <div id="propostas-nao-eleitas" data-testid="nao-eleitas-list" className="mt-2.5">
              <p className="mb-2 text-(length:--t-caption) text-(--color-text-muted)">
                Ficaram fora da composição no envio para análise e não seguem no fluxo.
              </p>
              {naoEleitas.map((proposal) => (
                <div
                  key={proposal.id}
                  data-testid="nao-eleita-row"
                  className="mb-[10px] flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-dashed border-(--color-border) p-[14px]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5">
                      <StatusPill variant={PROPOSAL_STATUS_VARIANT[proposal.status]} size="sm">
                        {PROPOSAL_STATUS_LABEL[proposal.status]}
                      </StatusPill>
                    </div>
                    <div className="text-(length:--t-caption) font-bold text-(--color-text-muted)">
                      {[proposal.code, proposal.title, proposal.group]
                        .filter((part): part is string => Boolean(part))
                        .join(' · ')}
                    </div>
                  </div>

                  {/* Navegacional, não uma ação: ler a linha não distingue dois
                      cenários — os números estão na tela da proposta. */}
                  <Link
                    href={proposalHref(opportunityId, proposal.id, proposal.tipoProposta)}
                    data-testid={`nao-eleita-link-${proposal.id}`}
                    className="shrink-0 whitespace-nowrap text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
                  >
                    Exibir →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {devolverTarget && (
        <DevolverModal
          proposalCode={devolverTarget.code}
          onConfirm={(motivo) => void handleDevolver(motivo)}
          onCancel={() => {
            setDevolverTarget(null);
            setDevolverError(null);
          }}
          isSubmitting={isSubmitting}
          error={devolverError}
        />
      )}
    </section>
  );
}
