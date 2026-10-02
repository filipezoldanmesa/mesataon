'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getDdiResult,
  reclassifyDdi,
  submitDdiDecision,
} from '@/lib/opportunities/ddi.data';
import type {
  DdiDecision,
  DdiDecisionPayload,
  DdiFinding,
  DdiReclassifyPayload,
  DdiResult,
  DdiRiskLevel,
  DdiSituacao,
} from '@/lib/opportunities/ddi.types';
import {
  DdiForbiddenError,
  DdiUnavailableError,
  DdiValidationError,
} from '@/lib/opportunities/ddi.types';
import { DDI_SITUACAO_PILL } from '@/lib/opportunities/ddi-situacao-pill';
import type { PillVariant } from '@/components/status-pill';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { Select } from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error';
type ActionStatus = 'idle' | 'submitting' | 'error';

type Props = {
  opportunityId: string;
  /**
   * Hides the panel's own "Reclassificar" affordance.
   *
   * Set when the panel is mounted inside a pendência ticket: there, the parecer
   * (risk + text + verdict, in one submit) IS the "Resolver pendência" form
   * right below, and a second entry point to the same write would be two
   * surfaces for one decision — the one whose modal cannot record the verdict.
   * Reading stays identical; nothing about authority changes here (the API is
   * the guard either way).
   */
  readOnly?: boolean;
  /**
   * Remove a moldura própria do painel (borda, fundo, padding) e o cabeçalho
   * "DDI · Integridade".
   *
   * Existe para o painel ser o CORPO do modal de detalhamento
   * (`DdiDetalhesTrigger`, ADO 67882), que já traz a sua própria moldura e o
   * seu próprio título — sem isto seria card dentro de card com o mesmo título
   * duas vezes. Mesma razão pela qual o `AlcadaSagaPanel` é montado sem
   * `<Section>` em volta.
   *
   * Só afeta o estado `completed`; os estados de carga/erro/não-elegível têm
   * moldura própria e são raros dentro do modal (o gatilho só é oferecido com
   * a análise já concluída).
   */
  bare?: boolean;
  /** Injectable for tests; defaults to the real BFF client. */
  /** `null` quando não há análise DDI (204 — não iniciada/não elegível). */
  load?: (id: string) => Promise<DdiResult | null>;
  reclassify?: (
    id: string,
    payload: DdiReclassifyPayload,
    roles: string[],
  ) => Promise<DdiResult>;
  decide?: (
    id: string,
    payload: DdiDecisionPayload,
    roles: string[],
  ) => Promise<DdiResult>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** How often to poll when DDI is still running (ms). RN-F10-08. */
const POLL_INTERVAL_MS = 5_000;

const RISK_LABEL: Record<DdiRiskLevel, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

const RISK_SEVERITY_LABEL: Record<string, string> = {
  low: 'Baixo',
  medium: 'Médio',
  high: 'Alto',
};

// ---------------------------------------------------------------------------
// Small helpers / sub-components
// ---------------------------------------------------------------------------

/** Label-value row used inside the DDI panel. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-(--color-border) py-2.5 text-(length:--t-caption) first:border-t-0">
      <span className="text-(--color-text-muted)">{label}</span>
      <span className="text-right font-bold">{children}</span>
    </div>
  );
}

/** Risk badge — coloured pill with semantic variant. */
function RiskBadge({ level }: { level: DdiRiskLevel }) {
  const styles: Record<DdiRiskLevel, string> = {
    low: 'bg-(--color-success-bg) text-(--color-success)',
    medium: 'bg-(--color-warning-bg) text-(--color-warning)',
    high: 'bg-(--color-danger-bg) text-(--color-danger)',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold ${styles[level]}`}
    >
      {RISK_LABEL[level]}
    </span>
  );
}

/** Severity badge for individual findings. */
function SeverityBadge({ severity }: { severity: DdiFinding['severity'] }) {
  const styles: Record<DdiFinding['severity'], string> = {
    low: 'bg-(--color-info-bg) text-(--color-info)',
    medium: 'bg-(--color-warning-bg) text-(--color-warning)',
    high: 'bg-(--color-danger-bg) text-(--color-danger)',
  };
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${styles[severity]}`}
    >
      {RISK_SEVERITY_LABEL[severity]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Reclassify modal (COMPLIANCE only)
// ---------------------------------------------------------------------------

function ReclassifyModal({
  current,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  current: DdiRiskLevel;
  submitting: boolean;
  error: string;
  onSubmit: (payload: DdiReclassifyPayload) => void;
  onClose: () => void;
}) {
  /** Read-only profiles cannot submit (mirrors ReadOnlyProfileGuard). */
  const { canWrite } = usePermissions();
  const [reclassifiedTo, setReclassifiedTo] = useState<DdiRiskLevel>(current);
  const [rationale, setRationale] = useState('');
  const [recommendations, setRecommendations] = useState('');
  /**
   * Local validation error — shown inline in the modal so the analyst sees
   * exactly which field is missing, without relying on the browser's native
   * tooltip (which varies by browser and is invisible in some environments).
   *
   * CA-1: modal stays open with text preserved; `error` prop covers backend
   * errors (CA-2). Both render in the same `role="alert"` element.
   */
  const [fieldError, setFieldError] = useState('');

  /**
   * The verdict is chosen by WHICH button is pressed. A ref is used instead of
   * state because React state updates are asynchronous: setDecision() fires in
   * onClick but handleSubmit runs synchronously in the same event, so the state
   * value would still hold the previous render's decision (stale closure).
   * A ref update is synchronous and immediately visible to the handler.
   */
  const pendingDecisionRef = useRef<DdiDecision>('release');

  function handleSubmit(e: React.FormEvent) {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    e.preventDefault();

    // CA-1 — client-side validation: inline error, modal stays open.
    if (!rationale.trim()) {
      setFieldError('Preencha o parecer / justificativa da reclassificação.');
      return;
    }
    if (rationale.trim().length < 10) {
      setFieldError('A justificativa deve ter pelo menos 10 caracteres.');
      return;
    }

    setFieldError('');
    onSubmit({
      reclassifiedTo,
      rationale,
      recommendations: recommendations || undefined,
      decision: pendingDecisionRef.current,
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reclassify-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[var(--radius-md)] bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-5 py-4">
          <h4 id="reclassify-modal-title" className="text-(length:--t-h4) font-bold">
            Reclassificar DDI · Integridade
          </h4>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="cursor-pointer text-2xl leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label
                htmlFor="reclass-to"
                className="mb-1 block text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Novo nível de risco
              </label>
              <Select
                id="reclass-to"
                value={reclassifiedTo}
                onChange={(v) => setReclassifiedTo(v as DdiRiskLevel)}
                options={[
                  { value: 'low', label: 'Baixo' },
                  { value: 'medium', label: 'Médio' },
                  { value: 'high', label: 'Alto' },
                ]}
                variant="boxed"
              />
            </div>

            <div>
              <label
                htmlFor="reclass-rationale"
                className="mb-1 block text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Parecer / justificativa da reclassificação *
              </label>
              <textarea
                id="reclass-rationale"
                rows={4}
                value={rationale}
                onChange={(e) => { setRationale(e.target.value); setFieldError(''); }}
                placeholder="Descreva o motivo da reclassificação e os critérios de integridade considerados."
                className="w-full resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2 text-(length:--t-caption) font-[inherit]"
              />
            </div>

            <div>
              <label
                htmlFor="reclass-recommendations"
                className="mb-1 block text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Recomendações (opcional)
              </label>
              <textarea
                id="reclass-recommendations"
                rows={3}
                value={recommendations}
                onChange={(e) => setRecommendations(e.target.value)}
                placeholder="Cláusulas contratuais, monitoramento adicional, etc."
                className="w-full resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2 text-(length:--t-caption) font-[inherit]"
              />
            </div>

            {/* CA-1: client-side field errors; CA-2: backend errors — one slot. */}
            {(fieldError || error) && (
              <p role="alert" className="text-(length:--t-caption) text-(--color-danger)">
                {fieldError || error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-(--color-border) px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="cursor-pointer rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-white px-4 py-2 text-(length:--t-caption) font-bold hover:bg-(--neutral-40) disabled:opacity-40"
            >
              Cancelar
            </button>
            {/*
              Two verdicts, two buttons — the outcome is NOT derived from the
              risk level above. Releasing an opportunity whose risk honestly
              stayed "Alto" is a legitimate call (mitigated by contract), and
              while the backend inferred the status from the risk the only way
              to express it was to record a risk nobody believed.
            */}
            <button
              type="submit"
              onClick={() => { pendingDecisionRef.current = 'reject'; }}
              disabled={submitting}
              className="cursor-pointer rounded-[var(--radius-xxs)] border border-(--color-danger) bg-white px-4 py-2 text-(length:--t-caption) font-bold text-(--color-danger) hover:bg-(--color-danger-bg) disabled:opacity-40"
            >
              {submitting ? 'Salvando…' : 'Reprovar'}
            </button>
            <button
              type="submit"
              onClick={() => { pendingDecisionRef.current = 'release'; }}
              disabled={submitting}
              className="cursor-pointer rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-hover) disabled:opacity-40"
            >
              {submitting ? 'Salvando…' : 'Liberar para aprovação'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Where the analysis actually stands, from the uncollapsed backend status.
 *
 * The row used to be the literal word "Concluída" in a green pill for every
 * finished analysis — which meant an opportunity Integridade had REJECTED read
 * as concluded and fine. `DdiResult.status` cannot tell them apart (it collapses
 * five states into `completed`), so this reads `situacao`.
 */
function SituacaoBadge({ situacao }: { situacao: DdiSituacao }) {
  const { label, variant } = DDI_SITUACAO_PILL[situacao];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold ${SITUACAO_CLASS[variant]}`}
    >
      {label}
    </span>
  );
}

/**
 * Classe por variante — o painel pinta a própria pílula.
 *
 * ⚠️ O `neutral` aqui é `--neutral-100`, e o do `StatusPill` é `--neutral-60`:
 * são pílulas de tamanhos e contextos diferentes, e igualá-las mudaria a tela do
 * painel sem ninguém pedir. O que É compartilhado com o card "Análises" é o
 * RÓTULO e a VARIANTE (`DDI_SITUACAO_PILL`), que é onde a divergência custaria —
 * uma linha lendo "Liberada" numa tela e "Concluída" na outra.
 */
const SITUACAO_CLASS: Record<PillVariant, string> = {
  info: 'bg-(--color-info-bg) text-(--color-info)',
  success: 'bg-(--color-success-bg) text-(--color-success)',
  warning: 'bg-(--color-warning-bg) text-(--color-warning)',
  danger: 'bg-(--color-danger-bg) text-(--color-danger)',
  neutral: 'bg-(--neutral-100) text-(--neutral-700)',
};

// ---------------------------------------------------------------------------
// Decision modal (LT, high risk only — RN-F10-06)
// ---------------------------------------------------------------------------

function DecisionModal({
  submitting,
  error,
  onSubmit,
  onClose,
  podeSeguir,
  podeCancelar,
}: {
  submitting: boolean;
  error: string;
  onSubmit: (payload: DdiDecisionPayload) => void;
  onClose: () => void;
  /** `Permission.DdiDecide` — "Seguir com cláusulas" é da Integridade (Matriz RBAC v2.1). */
  podeSeguir: boolean;
  /** `Permission.DdiCancel` — a linha "Cancelar oportunidade" da Matriz RBAC v2.1. */
  podeCancelar: boolean;
}) {
  const [action, setAction] = useState<DdiDecisionPayload['action']>(
    podeSeguir ? 'proceed_with_clauses' : 'cancel',
  );
  const [justification, setJustification] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ action, justification: justification || undefined });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="decision-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[var(--radius-md)] bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-5 py-4">
          <h4 id="decision-modal-title" className="text-(length:--t-h4) font-bold">
            Decisão — DDI Risco Alto
          </h4>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="cursor-pointer text-2xl leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
            <p className="text-(length:--t-caption) text-(--color-text-muted)">
              O resultado da DDI indica <strong>risco alto</strong>. Registre como
              prosseguir com esta oportunidade.
            </p>

            <div className="space-y-2">
              <label className="mb-1 block text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
                Decisão *
              </label>
              {/*
                * Cada opção é uma linha diferente da Matriz RBAC v2.1: seguir com
                * cláusulas é "Análise DDI · Executar" (Integridade), cancelar é
                * "Cancelar oportunidade". O backend recusa a outra com 403, então
                * a opção que o perfil não tem nem é oferecida.
                */}
              {podeSeguir && (
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-xs)] border border-(--color-border) p-3 hover:bg-(--neutral-25)">
                <input
                  type="radio"
                  name="decision-action"
                  value="proceed_with_clauses"
                  checked={action === 'proceed_with_clauses'}
                  onChange={() => setAction('proceed_with_clauses')}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <div className="font-bold">Prosseguir com cláusulas de conformidade</div>
                  <div className="mt-0.5 text-[13px] text-(--color-text-muted)">
                    Avança a oportunidade com cláusulas contratuais adicionais de
                    integridade e monitoramento.
                  </div>
                </div>
              </label>
              )}
              {podeCancelar && (
              <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-xs)] border border-(--color-border) p-3 hover:bg-(--neutral-25)">
                <input
                  type="radio"
                  name="decision-action"
                  value="cancel"
                  checked={action === 'cancel'}
                  onChange={() => setAction('cancel')}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <div className="font-bold">Cancelar oportunidade</div>
                  <div className="mt-0.5 text-[13px] text-(--color-text-muted)">
                    Encerra a oportunidade em razão do risco de integridade. Justificativa
                    obrigatória.
                  </div>
                </div>
              </label>
              )}
            </div>

            <div>
              <label
                htmlFor="decision-justification"
                className="mb-1 block text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)"
              >
                Justificativa{action === 'cancel' ? ' *' : ' (opcional para prosseguir)'}
              </label>
              <textarea
                id="decision-justification"
                rows={3}
                required={action === 'cancel'}
                minLength={action === 'cancel' ? 5 : 0}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder={
                  action === 'cancel'
                    ? 'Descreva o motivo do cancelamento em razão do risco de integridade.'
                    : 'Justificativa adicional (opcional).'
                }
                className="w-full resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2 text-(length:--t-caption) font-[inherit]"
              />
            </div>

            {error && (
              <p role="alert" className="text-(length:--t-caption) text-(--color-danger)">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-(--color-border) px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="cursor-pointer rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-white px-4 py-2 text-(length:--t-caption) font-bold hover:bg-(--neutral-40) disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`cursor-pointer rounded-[var(--radius-xxs)] px-4 py-2 text-(length:--t-caption) font-bold text-white disabled:opacity-40 ${
                action === 'cancel'
                  ? 'bg-(--color-danger) hover:bg-(--red-700)'
                  : 'bg-(--secondary-500) hover:bg-(--secondary-hover)'
              }`}
            >
              {submitting ? 'Registrando…' : 'Confirmar decisão'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * DDI panel — Due Diligência de Integridade (F10 — VBR-129).
 *
 * Covers the four UI states: loading / not_eligible / completed / error.
 *
 * Real-time updates via polling while status is `in_progress` (HU-18.4).
 *
 * Actions:
 *  - COMPLIANCE: reclassify via POST /ddi/reclassify (HU-18.2/.3)
 *  - decisão do risco ALTO via POST /ddi/decision (RN-F10-06) — só enquanto a
 *    análise está em `AGUARDANDO_LT`; "Seguir com cláusulas" exige
 *    `DdiDecide` (Integridade) e "Cancelar oportunidade" exige `DdiCancel`
 *    (Matriz RBAC v2.1). Ver `ltDecisionPending` abaixo.
 *  - sem `DdiView` o painel não busca nem renderiza nada.
 *
 * WHERE it is mounted: inside the pendência ticket (below "O que foi
 * solicitado"), never on the opportunity screen. The analysis reaches whoever
 * owes something through the pendência that asks for it — Integridade for the
 * parecer, the LT for a document — so the card sits next to the request it
 * explains instead of hanging off a screen where nobody was asked for anything.
 *
 * Sensitive data (risk level, score, rationale, findings, opinion) are rendered
 * directly in all environments (masking switch removed — VBR-484).
 */
export function DdiPanel({
  opportunityId,
  readOnly = false,
  bare = false,
  load = getDdiResult,
  reclassify = reclassifyDdi,
  decide = submitDdiDecision,
}: Props) {
  /** Read-only profiles get no write controls (mirrors ReadOnlyProfileGuard). */
  const { canWrite, can, roles } = usePermissions();

  // ---------------------------------------------------------------------------
  // Role checks — derived from the permission layer, never raw role strings.
  // Matriz RBAC v2.1 (28/09/2026): DdiReclassify/DdiDecide → Integridade;
  // DdiCancel → a linha "Cancelar oportunidade". Não há mais "o LT decide": a
  // decisão do risco ALTO são DUAS opções de donos diferentes.
  // ---------------------------------------------------------------------------

  const isCompliance = can(Permission.DdiReclassify);
  const podeSeguir = can(Permission.DdiDecide);
  const podeCancelar = can(Permission.DdiCancel);
  /*
   * `GET .../ddi` é `@Roles(...MATRIZ_DDI_VISUALIZAR)` — Visualizador, CCOB,
   * Gestor de Franquias e Consultor de Expansão recebem 403. Sem a permissão o
   * painel não busca nem renderiza (nada de 403 no log nem de "erro" na tela).
   */
  const podeVer = can(Permission.DdiView);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [ddi, setDdi] = useState<DdiResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Reclassify modal
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const [reclassifyStatus, setReclassifyStatus] = useState<ActionStatus>('idle');
  const [reclassifyError, setReclassifyError] = useState('');

  // Decision modal
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionStatus, setDecisionStatus] = useState<ActionStatus>('idle');
  const [decisionError, setDecisionError] = useState('');

  // Polling ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchDdi = useCallback(async () => {
    try {
      const data = await load(opportunityId);
      setDdi(data);
      setLoadStatus('loaded');

      // Stop polling once completed or terminal state. `null` = 204 (sem
      // análise): não há o que aguardar, então também para.
      if (!data || data.status !== 'in_progress') {
        stopPolling();
      }
    } catch (err) {
      stopPolling();
      if (err instanceof DdiUnavailableError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Erro ao carregar a DDI.',
        );
      }
      setLoadStatus('error');
    }
  }, [load, opportunityId, stopPolling]);

  useEffect(() => {
    if (!podeVer) return;
    setLoadStatus('loading');
    setErrorMsg('');
    void fetchDdi();

    // Start polling — will stop when status is no longer in_progress
    pollRef.current = setInterval(() => {
      void fetchDdi();
    }, POLL_INTERVAL_MS);

    return stopPolling;
  }, [fetchDdi, stopPolling, podeVer]);

  // ---------------------------------------------------------------------------
  // Reclassify handler (COMPLIANCE)
  // ---------------------------------------------------------------------------

  async function handleReclassify(payload: DdiReclassifyPayload) {
    setReclassifyStatus('submitting');
    setReclassifyError('');
    try {
      const updated = await reclassify(opportunityId, payload, roles);
      setDdi(updated);
      setReclassifyOpen(false);
      setReclassifyStatus('idle');
    } catch (err) {
      let msg = 'Erro ao reclassificar a DDI.';
      if (err instanceof DdiForbiddenError) {
        msg = 'Sem permissão. Somente COMPLIANCE pode reclassificar.';
      } else if (err instanceof Error) {
        // CA-2: surface the backend field-level message (DdiValidationError
        // carries it in .message) — never replace with a generic fallback.
        msg = err.message;
      }
      setReclassifyError(msg);
      setReclassifyStatus('error');
    }
  }

  // ---------------------------------------------------------------------------
  // Decision handler (LT — high risk)
  // ---------------------------------------------------------------------------

  async function handleDecision(payload: DdiDecisionPayload) {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    if (payload.action === 'cancel' ? !podeCancelar : !podeSeguir) return;
    setDecisionStatus('submitting');
    setDecisionError('');
    try {
      const updated = await decide(opportunityId, payload, roles);
      setDdi(updated);
      setDecisionOpen(false);
      setDecisionStatus('idle');
    } catch (err) {
      let msg = 'Erro ao registrar a decisão.';
      if (err instanceof DdiForbiddenError) {
        msg = 'Sem permissão para registrar decisão DDI.';
      } else if (err instanceof DdiValidationError) {
        msg = 'Validação falhou. Preencha a justificativa e tente novamente.';
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setDecisionError(msg);
      setDecisionStatus('error');
    }
  }


  // ---------------------------------------------------------------------------
  // Render: loading state
  // ---------------------------------------------------------------------------

  if (!podeVer) return null;

  if (loadStatus === 'loading') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        data-testid="ddi-panel-loading"
        className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
      >
        <span className="sr-only">Carregando DDI…</span>
        <div className="mb-3 h-5 w-40 animate-pulse rounded bg-(--neutral-100)" />
        <div className="space-y-2">
          <div className="h-4 animate-pulse rounded bg-(--neutral-100)" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-(--neutral-100)" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-(--neutral-100)" />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: error state (indisponível)
  // ---------------------------------------------------------------------------

  if (loadStatus === 'error') {
    return (
      <div
        role="alert"
        data-testid="ddi-panel-error"
        className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
      >
        <div className="mb-1 text-(length:--t-caption) font-bold">DDI · Integridade</div>
        <p className="text-(length:--t-caption) text-(--color-danger)">{errorMsg}</p>
        <button
          type="button"
          onClick={() => {
            setLoadStatus('loading');
            void fetchDdi();
          }}
          className="mt-2 cursor-pointer text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!ddi) return null;

  // ---------------------------------------------------------------------------
  // Render: not_eligible state (HU-17.1 — no DDI needed)
  // ---------------------------------------------------------------------------

  if (ddi.status === 'not_eligible') {
    return (
      <div
        data-testid="ddi-panel-not-eligible"
        className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
      >
        <div className="mb-2 text-(length:--t-caption) font-bold">DDI · Integridade</div>
        <span className="inline-flex items-center rounded-full bg-(--neutral-100) px-2.5 py-0.5 text-[12px] font-bold text-(--neutral-600)">
          Não elegível
        </span>
        {/* A frase é do backend quando ele a mandou — é ela que distingue "a
            composição eleita não tem posto" (ADO 67943) de "os critérios de
            elegibilidade não foram atingidos" (RN-F10-01), que levam a
            consertos diferentes. A genérica é o substituto honesto. */}
        <p className="mt-2 text-[13px] text-(--color-text-muted)">
          {ddi.rationale ??
            'Esta oportunidade não requer análise DDI conforme critérios de elegibilidade.'}
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: in_progress state (polling active)
  // ---------------------------------------------------------------------------

  if (ddi.status === 'in_progress') {
    return (
      <div
        data-testid="ddi-panel-in-progress"
        className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-(length:--t-caption) font-bold">DDI · Integridade</div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-(--color-info-bg) px-2.5 py-0.5 text-[12px] font-bold text-(--color-info)">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 animate-pulse rounded-full bg-(--color-info)"
            />
            Em andamento
          </span>
        </div>
        <p className="text-[13px] text-(--color-text-muted)">
          Análise DDI em execução. Os resultados serão atualizados automaticamente.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: completed (low / medium / high risk)
  // ---------------------------------------------------------------------------

  const effectiveRisk = ddi.reclassification?.reclassifiedTo ?? ddi.riskLevel;
  const hasReclassification = Boolean(ddi.reclassification);
  const hasLtDecision = Boolean(ddi.ltDecision);

  /**
   * Pending LT decision — gated on the SITUAÇÃO, not on the risk.
   *
   * `POST /ddi/decision` refuses anything but `AGUARDANDO_LT` (400), and
   * `reclassify` no longer produces that status: Integridade's parecer settles
   * the opportunity itself (`LIBERADA`/`REPROVADA`). While the condition was
   * "risco alto e sem decisão", the CTA was offered on every ALTO — including
   * `PENDENTE_PARECER`, the most common one — and the only thing it could
   * return was that 400. Rows already sitting in `AGUARDANDO_LT` keep the
   * form; nothing else does.
   */
  const aguardandoDecisao = ddi.situacao === 'AGUARDANDO_LT' && !hasLtDecision;
  /*
   * O CTA é de quem tem ao menos UMA das duas opções; o FATO (a análise
   * aguarda decisão) é de todo leitor — ver `aguardandoDecisao` no banner.
   */
  const ltDecisionPending =
    aguardandoDecisao && canWrite && (podeSeguir || podeCancelar);

  /**
   * Does the DDI still hold GATE 2? Mirrors `avaliarDdiParaAprovacao` on the
   * backend for the two states this panel can be in — `LIBERADA` releases even
   * with risk ALTO, which is the whole point of a parecer that mitigates.
   */
  const gateBloqueado =
    ddi.situacao === 'PENDENTE_PARECER' || ddi.situacao === 'AGUARDANDO_LT';

  /*
   * Show reclassify button: COMPLIANCE + a DDI the Integridade can still act on.
   * Suppressed inside the ticket, where the parecer form owns this write.
   *
   * ⚠️ O gate era `ddi.status === 'completed'`, e `completed` é o status
   * COLAPSADO — ele cobre `LIBERADA` junto (ver `DdiStatus` em `ddi.types.ts`).
   * Então o "Reclassificar" aparecia numa DDI já liberada e o modal só podia
   * terminar na recusa do backend: o mesmo botão morto que o formulário do
   * ticket tinha, na segunda superfície (ADO 02/09/2026). `emTratativa` é o
   * veredito do backend, e é `false` só em `LIBERADA` entre os estados que este
   * painel renderiza como concluídos — `REPROVADA` continua reclassificável,
   * que é o que torna a reprovação reversível.
   */
  const showReclassify = !readOnly && isCompliance && ddi.emTratativa;

  return (
    <>
      <div
        data-testid="ddi-panel-completed"
        className={
          bare
            ? undefined
            : 'rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5'
        }
      >
        {/* Header */}
        {/*
         * Suprimido em `bare`: o modal do detalhamento já traz "Análise de
         * integridade (DDI)" no próprio cabeçalho, e repeti-lo aqui poria dois
         * títulos colados um no outro. O botão "Reclassificar" também não
         * aparece — `bare` só é usado pelo gatilho, que passa `readOnly`.
         */}
        {!bare && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-(length:--t-caption) font-bold">DDI · Integridade</div>
          {showReclassify && (
            <button
              type="button"
              onClick={() => {
                setReclassifyStatus('idle');
                setReclassifyError('');
                setReclassifyOpen(true);
              }}
              className="cursor-pointer text-[13px] font-bold text-(--secondary-600) hover:underline"
            >
              Reclassificar
            </button>
          )}
        </div>
        )}

        {/* Status rows */}
        <Row label="Status">
          <SituacaoBadge situacao={ddi.situacao} />
        </Row>

        {effectiveRisk && (
          <Row label="Risco">
            <span className="flex flex-col items-end gap-1">
              <RiskBadge level={effectiveRisk} />
              {hasReclassification && (
                <span className="text-[11px] font-normal text-(--color-text-muted)">
                  Reclassificado pela Integridade
                </span>
              )}
            </span>
          </Row>
        )}

        {/*
          * Score CRU, sem denominador.
          *
          * Havia um `/100` chumbado aqui, e a escala do NeoWay não é essa: medido
          * no stage em 02/09/2026, a tela escrevia "402/100" (OPP-2026-000066) e
          * "1806/100" (OPP-2026-000062) — o payload traz `score: 1806` puro. O
          * `/1000` do modal da análise de perfil é legítimo porque o motor de
          * crédito publica 0..1000; aqui a escala nunca foi informada, e inventar
          * um teto é a mesma classe de mentira do default `CIF` e do CPV fictício.
          *
          * Enquanto o denominador não vier por escrito do fornecedor, o número
          * sozinho é a única leitura honesta.
          */}
        {ddi.score !== null && (
          <Row label="Score">
            <>{ddi.score}</>
          </Row>
        )}

        {/* Racional — low risk: brief; medium/high: full */}
        {ddi.rationale && (
          <div className="mt-3 border-t border-(--color-border) pt-3">
            <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
              Racional / critérios
            </div>
            <p className="text-[13px] text-(--color-text)">{ddi.rationale}</p>
          </div>
        )}

        {/* Findings */}
        {ddi.findings.length > 0 && (
          <div className="mt-3 border-t border-(--color-border) pt-3">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
              Achados ({ddi.findings.length})
            </div>
            <ul className="space-y-2">
              {ddi.findings.map((f) => (
                <li key={f.id} className="flex items-start gap-2 text-[13px]">
                  <SeverityBadge severity={f.severity} />
                  <span>{f.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/*
          Detalhe confidencial da Integridade (24/09/2026). O backend omite
          parecer, achados, critérios e score para quem está fora de
          Integridade, TI Administrador e LT; a nota impede que o vazio leia
          como "a Integridade não escreveu nada".
        */}
        {ddi.detailRestricted && (
          <p
            data-testid="ddi-detalhe-restrito"
            className="mt-3 border-t border-(--color-border) pt-3 text-[13px] text-(--color-text-muted)"
          >
            Parecer, achados e score são restritos à Integridade. Aqui aparece
            apenas o resultado da análise.
          </p>
        )}

        {/* Low risk → no opinion (HU-17.2) */}
        {effectiveRisk === 'low' && !hasReclassification && (
          <div className="mt-3 rounded-[var(--radius-xs)] bg-(--color-success-bg) px-3 py-2.5 text-[13px] font-bold text-(--color-success)">
            ✓ Aprovada — nenhum achado relevante identificado.
          </div>
        )}

        {/* Medium / high → opinion + LT pending warning (HU-18.1) */}
        {(effectiveRisk === 'medium' || effectiveRisk === 'high') && ddi.opinion && (
          <div className="mt-3 border-t border-(--color-border) pt-3">
            <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
              Parecer de integridade
            </div>
            <p className="text-[13px] text-(--color-text)">{ddi.opinion}</p>
          </div>
        )}

        {/*
          O pedido de nova avaliação do LT (14/09/2026).

          É o insumo do parecer seguinte: a Integridade reprovou, o LT tratou os
          apontamentos e devolveu a análise dizendo o quê. Sem isto na tela, o
          analista reabriria o formulário de parecer sem ver a única informação
          nova do ciclo — e a razão pela qual a análise voltou para ele.

          ⚠️ Fica FORA do bloco `Decisão do LT`, que é a decisão sobre risco
          ALTO (`proceed_with_clauses｜cancel`): são dois atos diferentes do
          mesmo ator, e o backend os guarda em colunas separadas justamente para
          a tela não os confundir.
        */}
        {ddi.ltReviewRequestReason && (
          <div
            data-testid="ddi-pedido-revisao-lt"
            className="mt-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-3 py-2.5 text-[13px]"
          >
            <div className="mb-1 font-bold text-(--color-text-muted)">
              Pedido de nova avaliação (LT)
            </div>
            <p className="whitespace-pre-line text-(--color-text)">
              {ddi.ltReviewRequestReason}
            </p>
          </div>
        )}

        {/* Reclassification info */}
        {ddi.reclassification && (
          <div className="mt-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-3 py-2.5 text-[13px]">
            <div className="mb-1 font-bold text-(--color-text-muted)">
              Reclassificado por integridade
            </div>
            <div>
              De{' '}
              <strong>
                {RISK_LABEL[ddi.riskLevel ?? 'low']}
              </strong>{' '}
              → <RiskBadge level={ddi.reclassification.reclassifiedTo} />
            </div>
            {ddi.reclassification.rationale && (
              <p className="mt-1 text-(--color-text-muted)">{ddi.reclassification.rationale}</p>
            )}
            {ddi.reclassification.recommendations && (
              <p className="mt-1">
                <strong>Recomendações:</strong> {ddi.reclassification.recommendations}
              </p>
            )}
            <p className="mt-1 text-[11px] text-(--color-text-muted)">
              Por {ddi.reclassification.reclassifiedBy} em{' '}
              {new Date(ddi.reclassification.reclassifiedAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        )}

        {/*
          High risk — GATE 2 blocked (HU-18.1).
          Gated on the SITUAÇÃO too: once Integridade released, an ALTO risk no
          longer blocks anything (that release is exactly what a mitigated ALTO
          looks like), and the banner kept claiming a block that no longer
          existed.
        */}
        {effectiveRisk === 'high' && !hasLtDecision && gateBloqueado && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-[13px] font-bold text-(--yellow-700)"
          >
            ⚠ Risco alto — avanço para aprovação bloqueado (GATE 2).
            {/*
              Only say the LT owes a decision when the analysis is actually
              waiting for one. On `PENDENTE_PARECER` what unblocks the gate is
              Integridade's parecer, and telling the LT to decide sent them
              after a control that answers 400.
            */}
            <div className="mt-1.5 font-normal">
              {aguardandoDecisao
                ? 'Uma decisão sobre o risco alto deve ser registrada antes que a oportunidade possa avançar.'
                : 'A Integridade deve emitir o parecer antes que a oportunidade possa avançar.'}
            </div>
          </div>
        )}

        {/* Medium risk — bloqueio warning (HU-18.1) */}
        {effectiveRisk === 'medium' && !hasLtDecision && gateBloqueado && (
          <div
            className="mt-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-[13px] text-(--yellow-700)"
          >
            Risco médio — acompanhe o parecer de integridade antes de avançar.
          </div>
        )}

        {/* LT Decision CTA */}
        {ltDecisionPending && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => {
                setDecisionStatus('idle');
                setDecisionError('');
                setDecisionOpen(true);
              }}
              className="w-full cursor-pointer rounded-[var(--radius-xxs)] border border-(--color-danger) bg-white px-4 py-2 text-(length:--t-caption) font-bold text-(--color-danger) hover:bg-(--color-danger-bg)"
            >
              Registrar decisão →
            </button>
          </div>
        )}

        {/* LT Decision — recorded */}
        {hasLtDecision && ddi.ltDecision && (
          <div className="mt-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-3 py-2.5 text-[13px]">
            <div className="mb-1 font-bold text-(--color-text-muted)">Decisão do LT</div>
            <div>
              {ddi.ltDecision.action === 'proceed_with_clauses' ? (
                <span className="font-bold text-(--color-success)">
                  ✓ Prosseguir com cláusulas de conformidade
                </span>
              ) : (
                <span className="font-bold text-(--color-danger)">
                  ✗ Cancelar oportunidade
                </span>
              )}
            </div>
            {ddi.ltDecision.justification && (
              <p className="mt-1 text-(--color-text-muted)">{ddi.ltDecision.justification}</p>
            )}
            <p className="mt-1 text-[11px] text-(--color-text-muted)">
              Em {new Date(ddi.ltDecision.decidedAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        )}
      </div>

      {/* Reclassify modal */}
      {reclassifyOpen && effectiveRisk && (
        <ReclassifyModal
          current={effectiveRisk}
          submitting={reclassifyStatus === 'submitting'}
          error={reclassifyError}
          onSubmit={(payload) => void handleReclassify(payload)}
          onClose={() => setReclassifyOpen(false)}
        />
      )}

      {/* Decision modal */}
      {decisionOpen && (
        <DecisionModal
          podeSeguir={podeSeguir}
          podeCancelar={podeCancelar}
          submitting={decisionStatus === 'submitting'}
          error={decisionError}
          onSubmit={(payload) => void handleDecision(payload)}
          onClose={() => setDecisionOpen(false)}
        />
      )}
    </>
  );
}
