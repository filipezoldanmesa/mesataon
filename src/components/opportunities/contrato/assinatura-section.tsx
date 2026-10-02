'use client';

import { useCallback, useState } from 'react';

import { InfoIcon } from '@/components/icons';
import { StatusPill, type PillVariant } from '@/components/status-pill';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { withBasePath } from '@/lib/base-path';
import type {
  AssinaturaData,
  PacoteItem,
  SignatarioItem,
} from '@/lib/contratos/contrato-mapping';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReenviarFn = (
  opportunityId: string,
  signerId: string,
) => Promise<void>;

type Props = {
  opportunityId: string;
  assinatura: AssinaturaData;
  /** Injectable for tests; defaults to the real BFF call. */
  reenviar?: ReenviarFn;
  /** Called after a successful reenviar so the parent can refetch. */
  onRevalidate?: () => void;
  /** Called to display a toast message. */
  onToast?: (message: string, variant?: 'success' | 'error') => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Maps a backend pill variant string (i / w / s / n / d) to the
 * StatusPill variant expected by the component library.
 *
 * Unknown value → neutral (no destructive CTA gated on it).
 */
function pillVariant(v: string): PillVariant {
  switch (v) {
    case 's': return 'success';
    case 'w': return 'warning';
    case 'd': return 'danger';
    case 'i': return 'info';
    default:  return 'neutral';
  }
}

// ---------------------------------------------------------------------------
// ProgressBar — .bar spec from issue fidelity section
// ---------------------------------------------------------------------------

function ProgressBar({
  concluidas,
  total,
}: {
  concluidas: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  return (
    <div className="mb-3.5">
      <p className="mb-1 text-(length:--t-caption) text-(--color-text-muted)">
        <b>{concluidas}</b>{` de ${total} assinaturas concluídas`}
      </p>
      {/* .bar: height 8px, bg --neutral-100, radius 999px, overflow hidden, margin 6px 0 14px */}
      <div
        aria-hidden="true"
        style={{
          height: 8,
          background: 'var(--neutral-100)',
          borderRadius: 999,
          overflow: 'hidden',
          margin: '6px 0 14px',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--secondary-500)',
            transition: 'width .3s',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Faixa (.att) — informational strip
// ---------------------------------------------------------------------------

function Faixa({ texto, tipo }: { texto: string; tipo: 'info' | 'ok' }) {
  const isOk = tipo === 'ok';
  return (
    <div
      className={`mt-3 flex items-start gap-2 rounded-[var(--radius-xs)] px-3.5 py-2.5 text-(length:--t-caption) ${
        isOk
          ? 'bg-(--color-success-bg) text-(--color-success)'
          : 'bg-(--color-info-bg) text-(--color-info)'
      }`}
    >
      {/*
       * The prototype writes `✓` and `ℹ` as literal characters. `✓` (U+2713) has
       * text presentation and inherits the strip colour, so it stays. `ℹ`
       * (U+2139) defaults to *emoji* presentation on macOS/iOS: it renders as a
       * blue boxed glyph that ignores `--color-info` and is announced by screen
       * readers — the exact failure mode `icons.tsx` exists to avoid. Swapped
       * for the stroke icon, which is the same mark drawn with the DS colour.
       */}
      {isOk ? (
        <span aria-hidden="true" className="leading-[1.35]">
          ✓
        </span>
      ) : (
        <InfoIcon className="mt-[0.15em]" />
      )}
      <span className="min-w-0">{texto}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SignatarioRow (.mrow) — single signatory line
// ---------------------------------------------------------------------------

function SignatarioRow({
  signatario,
  onEnviarLembrete,
  canRemind,
  isSubmitting,
}: {
  signatario: SignatarioItem;
  onEnviarLembrete: (id: string) => void;
  canRemind: boolean;
  isSubmitting: boolean;
}) {
  const showRemind = signatario.podeReenviar && canRemind;

  return (
    // .mrow — standard row class from the new-series shell
    <div className="flex items-start justify-between gap-3 border-b border-(--color-border) py-3 text-(length:--t-caption) last:border-b-0">
      {/* Left: ordem · papelLabel + hint */}
      <div className="min-w-0 flex-1">
        <div className="font-bold">
          {signatario.sequencia} · {signatario.papelLabel}
        </div>
        <div className="mt-0.5 text-(--color-text-muted)">{signatario.hint}</div>
      </div>

      {/* Right: pill + optional action link */}
      <div className="flex shrink-0 items-center gap-3">
        <StatusPill variant={pillVariant(signatario.statusPill)} size="sm">
          {signatario.statusLabel}
        </StatusPill>
        {showRemind && (
          // .lnk — link-style action (the only interactive control here)
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => onEnviarLembrete(signatario.id)}
            className="text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            data-testid={`remind-${signatario.id}`}
          >
            Enviar lembrete
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PackageBlock — one DocuSign envelope package
// ---------------------------------------------------------------------------

function PackageBlock({
  pacote,
  opportunityId,
  reenviarFn,
  onRevalidate,
  onToast,
  canRemind,
}: {
  pacote: PacoteItem;
  opportunityId: string;
  reenviarFn: ReenviarFn;
  onRevalidate?: () => void;
  onToast?: (message: string, variant?: 'success' | 'error') => void;
  canRemind: boolean;
}) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; msg: string } | null>(null);

  const handleLembrete = useCallback(
    async (signerId: string) => {
      setSubmittingId(signerId);
      setRowError(null);
      try {
        await reenviarFn(opportunityId, signerId);
        onToast?.('Lembrete de assinatura enviado.', 'success');
        onRevalidate?.();
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Falha ao enviar o lembrete.';
        setRowError({ id: signerId, msg });
        onToast?.(msg, 'error');
      } finally {
        setSubmittingId(null);
      }
    },
    [opportunityId, reenviarFn, onRevalidate, onToast],
  );

  return (
    <div className="mb-6 last:mb-0">
      {/* Package header — .kv key-value row */}
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1.5 text-(length:--t-caption)">
        {/*
          The package description leads; the DocuSign id is a support
          reference, not a name. It used to be the bold primary text, which put
          a raw UUID where the reader looks for what the thing IS — and the
          repo's own rule is that a UUID does not go to the UI as display text.
          It stays visible in full, muted: support searches the DocuSign console
          by exactly this string, so truncating it would break the one job it has.
        */}
        <div>
          <span className="font-bold">{pacote.descricao}</span>
          {pacote.envelopeExternoId !== '—' && (
            <>
              {' '}
              <span className="text-(--color-text-muted)">
                · ref. DocuSign {pacote.envelopeExternoId}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-(--color-text-muted)">Situação</span>
          {' '}
          <StatusPill variant={pillVariant(pacote.situacaoPill)} size="sm">
            {pacote.situacaoLabel}
          </StatusPill>
        </div>
      </div>

      {/* Progress bar — counts come from the backend, no front-end counting */}
      <ProgressBar
        concluidas={pacote.assinaturasConcluidas}
        total={pacote.assinaturasTotal}
      />

      {/* Signatários — in the order the backend delivers (pre-sorted by sequencia) */}
      <div>
        {pacote.signatarios.map((sig) => (
          <div key={sig.id}>
            <SignatarioRow
              signatario={sig}
              onEnviarLembrete={(id) => void handleLembrete(id)}
              canRemind={canRemind}
              isSubmitting={submittingId === sig.id}
            />
            {rowError?.id === sig.id && (
              <p
                role="alert"
                className="mt-1 text-(length:--t-caption) text-(--color-danger)"
              >
                {rowError.msg}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Informational strip (.att) */}
      {pacote.faixaTexto && pacote.faixaTipo && (
        <Faixa texto={pacote.faixaTexto} tipo={pacote.faixaTipo} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssinaturaSection — main export
// ---------------------------------------------------------------------------

/**
 * CTR-15 — "Bloco Assinatura" section.
 *
 * Renders N signature packages with their signatories in backend order, a
 * progress bar and the reminder action (gated).
 *
 * O card "Acompanhamento do LT" foi REMOVIDO da tela a pedido do negócio
 * (11/09/2026: *"não precisa exibir esse quadro… não faz muito sentido"*). Ele
 * só repetia, em pills fixas, o que o pacote já diz linha a linha, e o
 * "↻ Reenviar link ao cliente" duplicava o "Enviar lembrete" do próprio
 * signatário — que continua onde sempre esteve, por signatário e gated.
 *
 * Does NOT count signatories — all counts come from the backend.
 * Does NOT invent messages for DECLINED/VOIDED — the backend pill is shown as-is.
 * Does NOT include "Simular assinaturas" — that was a demo artefact.
 */
export function AssinaturaSection({
  opportunityId,
  assinatura,
  reenviar: reenviarProp,
  onRevalidate,
  onToast,
}: Props) {
  const { can } = usePermissions();
  const canRemind = can(Permission.ContractSignatureRemind);

  const reenviarFn: ReenviarFn = useCallback(
    async (oppId: string, signerId: string) => {
      const res = await fetch(
        withBasePath(`/api/opportunities/${encodeURIComponent(oppId)}/contrato/assinatura/signatarios/${encodeURIComponent(signerId)}/reenviar`),
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Falha ao enviar lembrete (${res.status}).`);
      }
    },
    [],
  );

  const activeFn = reenviarProp ?? reenviarFn;

  return (
    <div data-testid="assinatura-section">
      {assinatura.pacotes.map((pacote) => (
        <PackageBlock
          key={pacote.id}
          pacote={pacote}
          opportunityId={opportunityId}
          reenviarFn={activeFn}
          onRevalidate={onRevalidate}
          onToast={onToast}
          canRemind={canRemind}
        />
      ))}    </div>
  );
}
