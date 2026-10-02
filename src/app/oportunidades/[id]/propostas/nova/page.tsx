'use client';

import Link from 'next/link';
import { Finalidade } from '@/lib/picklists/salesforce-values';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { RequirePermission } from '@/components/auth/require-permission';
import { Breadcrumb } from '@/components/breadcrumb';
import { HeaderNav } from '@/components/header-nav';
import { Permission } from '@/lib/auth-permissions';
import { StatusPill } from '@/components/status-pill';
import { AlcadaAlertBanner } from '@/components/proposals/alcada-alert-banner';
import { NovaPropostaBlock, type ProposalFormData } from '@/components/proposals/nova-proposta-block';
import { PostoSituationBlock } from '@/components/proposals/posto-situation-block';
import { TableauLinkCard } from '@/components/proposals/tableau-link-card';
import { ProductLinesBlock } from '@/components/proposals/product-lines-block';
import { FinancialResourcesBlock } from '@/components/proposals/financial-resources-block';
import { InvestmentsBlock } from '@/components/proposals/investments-block';
import { FinancialItemsBlock } from '@/components/proposals/financial-items-block';
import { ProposalAutoCalcBlock } from '@/components/proposals/proposal-auto-calc-block';
import { ProposalIndicatorsBlock } from '@/components/proposals/proposal-indicators-block';
import {
  createProposal,
  getPostoEligibility,
  getProposalDateConstraints,
} from '@/lib/proposals/proposal-creation.data';
import type { CreateProposalPayload, CreateProposalResult, ProposalContractType, ProposalDateConstraints, ProposalFinalidade } from '@/lib/proposals/proposal-creation.types';
import {
  ProposalAlreadyActiveError,
  ProposalServiceUnavailableError,
} from '@/lib/proposals/proposal-creation.types';
import { analysisWindowError } from '@/lib/proposals/proposal-date-validation';
import { getOpportunityDetail } from '@/lib/opportunities/opportunity-detail.data';
import { responsavelDaOportunidade } from '@/lib/opportunities/responsavel';
import { getTeam } from '@/lib/opportunities/team.data';
import type { OpportunityTeam } from '@/lib/opportunities/team.types';
import type { OpportunityDetail } from '@/lib/opportunities/types';
import { rotaDoApp } from '@/lib/navegacao-segura';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SendStatus = 'idle' | 'sending' | 'error';

// ---------------------------------------------------------------------------
// Static live-panel placeholder
// (becomes a real ProposalIndicatorsBlock only after proposal is created)
// ---------------------------------------------------------------------------

function LivePanelPlaceholder() {
  function CalcRow({ label }: { label: string }) {
    return (
      <div className="flex justify-between border-b border-(--color-border) py-1.5 text-(length:--t-caption) last:border-b-0">
        <span className="text-(--color-text-muted)">{label}</span>
        <b className="text-(--neutral-400)">—</b>
      </div>
    );
  }

  function IndexCard({ label }: { label: string }) {
    return (
      <div className="rounded-[var(--radius-xs)] border border-(--color-border) px-2.5 py-2">
        <div className="text-[14px] tracking-[0.3px] text-(--color-text-muted)">{label}</div>
        <div className="mt-0.5 text-(length:--t-h4) font-bold text-(--neutral-400)">—</div>
      </div>
    );
  }

  return (
    <aside className="sticky top-4 flex flex-col gap-3.5 self-start max-[920px]:static">
      {/* Painel ao vivo */}
      <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-[rgba(65,128,32,0.06)] border-[rgba(65,128,32,0.2)] px-5 py-[18px]">
        <div className="mb-3 font-bold text-(length:--t-caption)">Painel ao vivo</div>
        <div className="grid grid-cols-2 gap-2">
          <IndexCard label="TIR proposta (a.a.)" />
          <IndexCard label="VPL proposta" />
          <IndexCard label="TMA" />
          <IndexCard label="% Antecipação" />
        </div>
        <div className="mt-2.5">
          <CalcRow label="R$ / m³" />
          <CalcRow label="Margem EBITDA (R$/m³)" />
          <CalcRow label="Margem média (R$/m³)" />
          <CalcRow label="Indicador de rentabilidade" />
          <CalcRow label="Comprometimento da margem" />
          <CalcRow label="Alçada sugerida" />
        </div>
        <button
          type="button"
          disabled
          className="mt-3 w-full cursor-not-allowed rounded-[var(--radius-xxs)] border border-transparent bg-(--neutral-40) px-4 py-2.5 text-center text-(length:--t-caption) font-bold text-(--neutral-500)"
        >
          ↻ Recalcular / Simular (ARP)
        </button>
        <p className="mt-2 text-center text-[14px] text-(--color-text-muted)">
          Disponível após preencher os produtos e recursos financeiros.
        </p>
      </div>

      {/* Cálculos automáticos */}
      <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-[rgba(65,128,32,0.06)] border-[rgba(65,128,32,0.2)] px-5 py-[18px]">
        <div className="mb-2 font-bold text-(length:--t-caption)">Cálculos automáticos</div>
        <CalcRow label="VMM" />
        <CalcRow label="Volume total" />
        <CalcRow label="Receita total" />
        {/* Os rótulos têm de acompanhar `ProposalAutoCalcBlock`, que substitui
            este placeholder quando a proposta passa a existir — senão a tela
            troca de conteúdo ao salvar (Bug 67537 / VBR-570 na margem, e as
            quatro linhas de recursos no ADO — 09/09/2026; VMM × Volume total e
            R$/m³ no ADO — 11/09/2026). */}
        <CalcRow label="Margem média ponderada" />
        <CalcRow label="Recursos Antecipados" />
        <CalcRow label="Recursos Postecipados" />
        <CalcRow label="Recursos Totais" />
        <CalcRow label="Percentual de Recursos Antecipados" />
        <CalcRow label="R$/m³" />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Opportunity meta header
// ---------------------------------------------------------------------------

interface MetaItem {
  label: string;
  value: string;
}

/**
 * Live "time ago" label that refreshes every 30s, so "Rascunho salvo · agora"
 * ages into "há N min" instead of staying frozen.
 */
function RelativeTime({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((now - since) / 1000));
  let label: string;
  if (secs < 45) label = 'agora';
  else if (secs < 3600) label = `há ${Math.round(secs / 60)} min`;
  else if (secs < 86400) label = `há ${Math.round(secs / 3600)} h`;
  else label = `há ${Math.round(secs / 86400)} d`;
  return <>{label}</>;
}

function PropostaHeader({
  opportunityId,
  opportunity,
  team,
  savedAt,
}: {
  opportunityId: string;
  opportunity: OpportunityDetail | null;
  team: OpportunityTeam | null;
  savedAt: number | null;
}) {
  const clienteName = opportunity?.clientName ?? '—';
  const oportunidadeLabel = opportunity
    ? `${opportunity.code} · ${opportunity.title}`
    : opportunityId.toUpperCase();
  /*
   * LT principal da equipe — a mesma fonte da tela da proposta já salva.
   *
   * O valor saía de `opportunity.owner`, que a projeção F2 devolve como o `oid`
   * cru do criador; um guard (`looksLikeRawId`) o trocava por "—" para não
   * imprimir id na tela. O guard estava certo e o campo, permanentemente vazio.
   */
  const responsavel = responsavelDaOportunidade(team?.members) ?? '—';

  const metaItems: MetaItem[] = [
    { label: 'Responsável', value: responsavel },
    { label: 'Cliente', value: clienteName },
    { label: 'Oportunidade', value: oportunidadeLabel },
    { label: 'Tipo de proposta', value: 'PCR · Posto' },
  ];

  return (
    <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-5 mt-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          {/* Status badges (prototype `.head .top` — 03-proposta-nova.html:127) */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill variant="neutral">POSTO</StatusPill>
            <StatusPill variant="warning">Em preenchimento</StatusPill>
            <StatusPill variant="success">Nova proposta</StatusPill>
          </div>
          <h1 className="text-(length:--t-h2) font-bold tracking-[-0.6px] mt-1.5 mb-0.5">
            Nova proposta
          </h1>
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Oportunidade&nbsp;
            <strong className="text-(--neutral-900)">{opportunity?.code ?? opportunityId.toUpperCase()}</strong>
            &nbsp;· Tipo PCR
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {savedAt !== null && (
            <span
              data-testid="autosave-status"
              className="text-[14px] text-(--color-text-muted)"
            >
              Rascunho salvo · <RelativeTime since={savedAt} />
            </span>
          )}
          <Link
            href={`/oportunidades/${opportunityId}`}
            className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-3 py-1.5 text-(length:--t-caption) font-bold text-(--secondary-600) hover:bg-(--neutral-40)"
          >
            ← Oportunidade
          </Link>
        </div>
      </div>

      <div className="flex gap-9 flex-wrap mt-4 pt-4 border-t border-(--color-border)">
        {metaItems.map(({ label, value }) => (
          <div key={label}>
            <div className="text-[14px] uppercase tracking-[0.3px] text-(--color-text-muted)">
              {label}
            </div>
            <div className="text-(length:--t-caption) font-bold mt-0.5">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sendbar
// ---------------------------------------------------------------------------

function Sendbar({
  canSend,
  onConcluir,
  sendStatus,
  sendError,
  isAlreadyActive,
  created,
  opportunityId,
  postoBlocked,
  datesError,
}: {
  canSend: boolean;
  onConcluir: () => void;
  sendStatus: SendStatus;
  sendError: string;
  isAlreadyActive: boolean;
  /** True once the proposal has been created — the sendbar switches to a done state. */
  created: boolean;
  opportunityId: string;
  /**
   * HU-04.2 — the posto is DEFINITIVELY in the Mapa da Rede. It is one of the two
   * reasons `canSend` can be false, and the only one the user cannot fix by
   * typing, so the hint must name it. See the hint below.
   */
  postoBlocked: boolean;
  /**
   * RN-F5-04 — the saved analysis window is invalid against the API's current
   * limit (typically a draft restored across a month boundary). Like
   * `postoBlocked`, it is a reason the CTA is disabled that "preencha os dados"
   * would describe falsely: the form IS filled.
   */
  datesError: string;
}) {
  const isSending = sendStatus === 'sending';

  return (
    <div
      data-testid="sendbar"
      className="fixed left-0 right-0 bottom-0 z-50 flex justify-between items-center gap-6 border-t border-(--color-border) bg-white shadow-[0_-2px_8px_rgba(0,0,0,0.08)] px-6 py-3"
      style={{
        paddingLeft: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
        paddingRight: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
      }}
    >
      <div className="text-(length:--t-caption) min-w-0">
        {created ? (
          <span data-testid="sendbar-created" className="text-(--secondary-600) font-semibold">
            Proposta criada. Detalhe os blocos abaixo — cada bloco salva ao editar.
          </span>
        ) : sendStatus === 'error' ? (
          <span
            role="alert"
            data-testid="sendbar-error"
            className={
              isAlreadyActive
                ? 'text-orange-700 font-semibold'
                : 'text-(--color-danger) font-semibold'
            }
          >
            {sendError}
          </span>
        ) : (
          !canSend && (
            /*
             * The hint must say what is actually missing. "Preencha os dados da
             * proposta" is the right hint for an incomplete form — but with the
             * posto ATIVO na rede (HU-04.2) the form can be COMPLETE and the CTA
             * still disabled, and then that text is simply false: it sends the
             * LT back to fill fields that are already filled, contradicting the
             * banner above. Name the blocking reason instead.
             */
            <span
              data-testid={
                postoBlocked
                  ? 'sendbar-posto-blocked'
                  : datesError
                    ? 'sendbar-dates-invalid'
                    : 'sendbar-incomplete'
              }
              /* Atenção, não danger: the data is fixable by editing, nothing failed. */
              className={datesError ? 'text-(--yellow-700)' : 'text-(--color-text-muted)'}
            >
              {postoBlocked
                ? 'Posto já ativo na rede — esta proposta não segue o fluxo normal de criação.'
                : datesError
                  ? `${datesError} Edite os dados da proposta.`
                  : 'Preencha os dados da proposta para concluir.'}
            </span>
          )
        )}
      </div>
      {created ? (
        <Link
          href={`/oportunidades/${opportunityId}`}
          data-testid="sendbar-goto-opportunity"
          className="flex-shrink-0 cursor-pointer rounded-[var(--radius-xxs)] bg-(--secondary-500) px-8 py-2.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600)"
        >
          Ir para a oportunidade
        </Link>
      ) : (
        <button
          type="button"
          data-testid="sendbar-concluir-btn"
          onClick={onConcluir}
          disabled={!canSend || isSending}
          aria-disabled={!canSend || isSending}
          className="flex-shrink-0 cursor-pointer rounded-[var(--radius-xxs)] bg-(--secondary-500) px-8 py-2.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:bg-(--neutral-40) disabled:text-(--neutral-500)"
        >
          {isSending ? 'Criando proposta…' : 'Concluir'}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * `/oportunidades/[id]/propostas/nova` — Nova Proposta mega-screen.
 *
 * Layout: 2-column grid (main blocks | live panel), fixed sendbar, autosave
 * indicator, opportunity header card with Salesforce meta (gracefully mocked
 * when the API is unavailable).
 *
 * Business rules:
 *  - RN-F3-02: tipoProposta is fixed as PCR; contrato restricted to CPCVM/CLUM
 *    (enforced inside `NovaPropostaBlock`).
 *  - RN-F3-03: `finalidade` conditions which downstream blocks (F4–F6) appear.
 *    Blocks are shown as placeholders when finalidade has not been set.
 *    When set to VINCULACAO, all blocks (F4/F5/F6) apply.
 *    When set to IMPLANTACAO, all blocks (F4/F5/F6) apply.
 *    (The conditional rendering will be wired when those blocks are implemented.)
 *
 * The actual `POST /v1/opportunities/:id/proposals` call is issued here (not
 * inside `NovaPropostaBlock`) when the user clicks "Concluir" in the sendbar,
 * matching the `03-proposta-nova.html` prototype flow.
 */
/**
 * Criar proposta é uma rota EXCLUSIVAMENTE de escrita — para quem não a tem ela
 * responde "página não encontrada" (sem revelar que a rota existe, ver
 * {@link RequirePermission}).
 *
 * ⚠️ O gate é `ProposalManage`, não `Permission.Write` (ADO 67914).
 * `Write` é "todos menos Visualizador e Expansão", e a rota que esta tela chama
 * no fim — `POST opportunities/:id/proposals` — é `POSTO_PROPOSAL_WRITE_ROLES`:
 * CCOB, SPCOM, BP Financeiro e Integridade abriam a mega-tela, preenchiam a
 * proposta inteira e só levavam **403 no "Concluir"**, com o rascunho perdido.
 * É a divergência tela × gate, e o CTA que leva aqui já usa `ProposalManage`.
 */
export default function NovaPropostaPage() {
  return (
    <RequirePermission permission={Permission.ProposalManage}>
      <NovaPropostaScreen />
    </RequirePermission>
  );
}

function NovaPropostaScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const opportunityId = params?.id ?? '';

  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  const [team, setTeam] = useState<OpportunityTeam | null>(null);
  const [proposalData, setProposalData] = useState<ProposalFormData | null>(null);
  // Local draft (browser localStorage) — `savedAt` is the epoch-ms of the last
  // save; `restoredDraft` seeds the Dados block from a draft found on reload.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [restoredDraft, setRestoredDraft] = useState<ProposalFormData | null>(null);
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [sendError, setSendError] = useState('');
  const [isAlreadyActive, setIsAlreadyActive] = useState(false);
  // Always null after the navigation change — kept as state (not a constant) so
  // the auto-create guard in handleDataSaved and the canSend check do not need
  // to change. The value is set during the brief window between proposal creation
  // and router.replace unmounting the component, which is why no setter call is
  // needed here: navigation supersedes the state transition.
  const [createdProposalId] = useState<string | null>(null);
  // HU-04.2 pre-flight: true only when the posto is DEFINITIVELY ATIVO (fail-open).
  const [postoBlocked, setPostoBlocked] = useState(false);
  // RN-F5-04: server-derived date floor for `dataFimAnalise`, so the form warns
  // during filling instead of the user discovering the rule in a 400. `null`
  // until it answers (and forever if it fails) — never a client-side guess.
  const [dateConstraints, setDateConstraints] = useState<ProposalDateConstraints | null>(null);
  // RN-F7-03 (VBR-290): bumped on every block save so the alçada alert
  // re-evaluates against the saved data (never per keystroke).
  const [alcadaRefresh, setAlcadaRefresh] = useState(0);
  // Bug 67533: bumped by any sibling block mutation so ProposalAutoCalcBlock
  // re-fetches without a page reload. Counter (not boolean) — two mutations
  // are two events.
  const [autoCalcRefreshSignal, setAutoCalcRefreshSignal] = useState(0);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch opportunity data for header (gracefully degraded on error)
  useEffect(() => {
    if (!opportunityId) return;
    getOpportunityDetail(opportunityId).then((opp) => {
      if (mountedRef.current) setOpportunity(opp);
    }).catch(() => {
      // Header degrades to placeholders — non-blocking
    });
  }, [opportunityId]);

  /*
   * Equipe — alimenta o "Responsável" do cabeçalho. Ele saía de
   * `opportunity.owner`, que é o `oid` cru do Entra: um guard trocava o id por
   * "—" (certo — id em tela é valor de máquina) e o campo ficava sempre vazio.
   * O LT principal é a mesma fonte que a tela da proposta já salva usa.
   */
  useEffect(() => {
    if (!opportunityId) return;
    getTeam(opportunityId).then((t) => {
      if (mountedRef.current) setTeam(t);
    }).catch(() => {
      // Header degrades to "—" — non-blocking
    });
  }, [opportunityId]);

  // HU-04.2 pre-flight — warn/block BEFORE the user fills the form when the
  // posto is already in the Mapa da Rede. Fail-open: only block on a DEFINITIVE
  // `noMapaDaRede` (checked=true); an inconclusive/unavailable signal never
  // blocks a valid posto.
  useEffect(() => {
    if (!opportunityId) return;
    void getPostoEligibility(opportunityId).then((res) => {
      if (mountedRef.current && res.checked && res.noMapaDaRede) {
        setPostoBlocked(true);
      }
    });
  }, [opportunityId]);

  // RN-F5-04 — the same limit `POST .../proposals` enforces, fetched once so the
  // "Data fim da análise" field can validate inline. Failure is silent by design
  // (the client returns null): the hint disappears, the API keeps enforcing.
  useEffect(() => {
    void getProposalDateConstraints().then((res) => {
      if (mountedRef.current) setDateConstraints(res);
    });
  }, []);

  // Restore a locally-saved draft (browser localStorage) on mount, so
  // "Rascunho salvo" reflects a real persisted draft that survives reload.
  useEffect(() => {
    if (!opportunityId) return;
    try {
      const raw = window.localStorage.getItem(`vibra:proposal-draft:${opportunityId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { data?: ProposalFormData; savedAt?: number };
      if (parsed?.data) {
        setRestoredDraft(parsed.data);
        setProposalData(parsed.data);
        setSavedAt(typeof parsed.savedAt === 'number' ? parsed.savedAt : null);
      }
    } catch {
      /* corrupt/unavailable draft — ignore */
    }
  }, [opportunityId]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Creates the server-side proposal. `dataOverride` exists because the
   * auto-create path fires from `handleDataSaved`, BEFORE the `proposalData`
   * state commit is visible to this callback.
   */
  const handleConcluir = useCallback(async (dataOverride?: ProposalFormData) => {
    const data = dataOverride ?? proposalData;
    if (!data || !opportunityId) return;

    setSendStatus('sending');
    setSendError('');
    setIsAlreadyActive(false);

    // postoRef is the opportunity's customer REFERENCE (Código SAP, or the CRM
    // id of a prospect — ADR-0055). The backend checks the Mapa da Rede by the
    // opportunity's own Código SAP, not by this value; a 409 is surfaced by the
    // catch block below (no redundant front-end guard).
    const postoRef = opportunity?.clientId ?? '';

    const payload: CreateProposalPayload = {
      opportunityId,
      tipoContrato: data.tipoContrato as ProposalContractType,
      finalidade: data.finalidade as ProposalFinalidade,
      dataInicioAnalise: data.dataInicioAnalise,
      dataFimAnalise: data.dataFimAnalise,
      possuiInvestimentos: data.possuiInvestimentos === 'sim',
      aceleraMais: data.programaAcelera === 'sim',
      postoRef,
    };

    try {
      const result: CreateProposalResult = await createProposal(payload);
      if (!mountedRef.current) return;
      // Drop the local draft BEFORE navigating so the form does not resurrect
      // if the user navigates back to /nova (CA-3).
      try {
        window.localStorage.removeItem(`vibra:proposal-draft:${opportunityId}`);
      } catch {
        /* ignore */
      }
      // CA-1: replace /nova with the real proposal URL so F5 reloads the
      // created proposal (not the empty form) and the back button does not
      // return to an already-submitted form (router.replace, not push).
      router.replace(rotaDoApp('oportunidades', opportunityId, 'propostas', result.id));
    } catch (err) {
      if (!mountedRef.current) return;
      setSendStatus('error');
      if (err instanceof ProposalAlreadyActiveError) {
        setIsAlreadyActive(true);
        setSendError(err.message);
      } else if (err instanceof ProposalServiceUnavailableError) {
        setSendError(err.message);
      } else {
        setSendError(
          err instanceof Error ? err.message : 'Erro ao criar a proposta. Tente novamente.',
        );
      }
    }
  }, [proposalData, opportunityId, opportunity, router]);

  const handleDataSaved = useCallback((data: ProposalFormData | null) => {
    setProposalData(data);
    setSendStatus('idle');
    setSendError('');
    setIsAlreadyActive(false);
    setAlcadaRefresh((c) => c + 1);
    // Persist the draft locally so it is genuinely saved (and restored on
    // reload).
    const key = `vibra:proposal-draft:${opportunityId}`;
    try {
      if (data) {
        const ts = Date.now();
        window.localStorage.setItem(key, JSON.stringify({ data, savedAt: ts }));
        setSavedAt(ts);
      } else {
        window.localStorage.removeItem(key);
        setSavedAt(null);
      }
    } catch {
      setSavedAt(data ? Date.now() : null);
    }

    // Auto-create on modal confirm (decisão de 11/08): once the dados are
    // complete and valid, the downstream blocks open right away — the sendbar
    // "Concluir" stays only as the retry for a failed/blocked auto-create.
    if (
      data &&
      createdProposalId === null &&
      sendStatus !== 'sending' &&
      !postoBlocked &&
      data.tipoContrato !== '' &&
      data.finalidade !== '' &&
      analysisWindowError(data.dataInicioAnalise, data.dataFimAnalise, dateConstraints) === ''
    ) {
      void handleConcluir(data);
    }
  }, [opportunityId, createdProposalId, sendStatus, postoBlocked, dateConstraints, handleConcluir]);

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const finalidade = proposalData?.finalidade ?? '';

  /*
   * RN-F5-04 re-checked at the sendbar, not only inside the modal: a draft
   * restored from localStorage was validated against LAST month's limit, so on
   * the 1st of a new month it arrives already "filled" with a `dataFimAnalise`
   * the API now rejects. Same shared verdict as the modal — the hint names the
   * rule instead of letting the POST come back 400.
   */
  const datesError = proposalData
    ? analysisWindowError(
        proposalData.dataInicioAnalise,
        proposalData.dataFimAnalise,
        dateConstraints,
      )
    : '';

  const canSend = proposalData !== null &&
    proposalData.tipoContrato !== '' &&
    proposalData.finalidade !== '' &&
    datesError === '' &&
    sendStatus !== 'sending' &&
    createdProposalId === null &&
    !postoBlocked;

  // RN-F3-03: downstream blocks (F4/F5/F6/F9) apply for both finalidades, but
  // they require a persisted proposal — so they render only after creation.
  const showDownstreamBlocks = finalidade !== '';

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-(--color-bg)">
      {/* HeaderNav is rendered explicitly here (instead of via AppShell) so
          the page can apply its own pb-[88px] main padding for the fixed sendbar.
          The full-width breadcrumb bar sits between the header and the centered
          main, matching the shared AppShell layout. */}
      <HeaderNav />
      <Breadcrumb
        items={[
          { label: 'Oportunidades', href: '/oportunidades' },
          {
            label: opportunity?.code ?? opportunityId.toUpperCase(),
            href: `/oportunidades/${opportunityId}`,
          },
          { label: 'Nova proposta' },
        ]}
      />

      <main className="mx-auto max-w-(--grid-max) px-6 pt-0 pb-[88px]">
        {/* Header card */}
        <PropostaHeader
          opportunityId={opportunityId}
          opportunity={opportunity}
          team={team}
          savedAt={savedAt}
        />

        {/* Prototype mega-screen: 2 columns — main blocks on the left, the
            sticky "Painel ao vivo" on the right (labels shown with "—" even
            before any calculation, exactly like 03-proposta-nova.html). The
            detail blocks require a persisted proposal, so they render in the left
            column only after creation, in the official prototype order.

            ⚠️ The columns were an INLINE `style`, and an inline style cannot be
            reached by any media query — so this screen kept a 330px second
            column at every width and pushed the document past the viewport
            (measured: 229px of horizontal overflow at 320px wide). A page that
            scrolls sideways makes every modal on it look off-centre: a `fixed`
            overlay stays glued to the viewport while the content slides out
            from under it.

            Now a class, collapsing at the same 920px as the sibling
            mega-screen (`nova-oportunidade.tsx`) — same layout, drifted apart. */}
        <div className="mt-4.5 grid grid-cols-[1fr_330px] items-start gap-6 max-[920px]:grid-cols-1">
          {/* ── Main column ─────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* HU-04.2 — posto já no Mapa da Rede: avisa antes do preenchimento.
                A frase NÃO cita o número da HU: identificador interno de
                requisito não diz nada a quem lê a recusa na tela, e ocupa o
                lugar do que fazer. A rastreabilidade vive neste comentário —
                mesma doutrina de `mapaDaRedeGate` no backend. */}
            {postoBlocked && (
              <div
                role="alert"
                data-testid="posto-blocked-banner"
                className="rounded-[var(--radius-md)] border border-(--color-danger-bg) bg-(--color-danger-bg) px-5 py-4 text-(length:--t-caption) text-(--color-danger)"
              >
                <p className="font-bold">Posto já está no Mapa da Rede</p>
                <p className="mt-1 font-normal">
                  Oportunidade deverá ser feita no SALESFORCE, pois o posto já está no Mapa da
                  Rede. Verifique a oportunidade ou o Código SAP do cliente.
                </p>
              </div>
            )}

            {/* RN-F7-03 (A31): approval-level alert during filling (VBR-290) */}
            <AlcadaAlertBanner opportunityId={opportunityId} refreshKey={alcadaRefresh} />

            {/*
              F3 — Dados da proposta.

              COR-4: `profitCenters` IS the centro de lucro (backend
              `Opportunity.centroLucro` ← Salesforce `Zona_de_vendas_da_conta__c`),
              so it feeds the "Centro de lucro" field — it used to be piped into
              "Área do usuário" while "Centro de lucro" was a hardcoded dash, i.e.
              the two fields were swapped and the real value never showed.

              `areaUsuario` has no confirmed Salesforce source yet
              (`CrmLtProfileDirectory` returns null on purpose — the Postman
              collection that would name the field is still pending), so it is left
              unset and rendered as a NAMED gap. It must never fall back to the
              literal `'DCVIM'`, which reads on screen exactly like real data.
            */}
            <NovaPropostaBlock
              key={restoredDraft ? 'draft-restored' : 'draft-empty'}
              areaUsuario={opportunity?.areaUsuario ?? null}
              centroDeLucro={opportunity?.profitCenters ?? null}
              dateConstraints={dateConstraints}
              initialData={restoredDraft}
              onDataSaved={handleDataSaved}
            />

            {/* Inteligência de mercado — outside the `createdProposalId` gate on
                purpose: the card takes no `proposalId`, makes no request and is
                a reference the LT consults WHILE filling the proposal, so
                holding it back until "Concluir" would hide it exactly when it
                is useful. The full block (VMM grid / marketshare) was removed in
                VBR-503; what is left is the external CTA. */}
            <TableauLinkCard />

            {createdProposalId ? (
              <>
                {/* F4 — Situação do posto e do imóvel */}
                <PostoSituationBlock proposalId={createdProposalId} />
                {/* F5 — Produtos e simulação comercial */}
                <ProductLinesBlock
                  proposalId={createdProposalId}
                  opportunityId={opportunityId}
                  onLinesChanged={() => setAutoCalcRefreshSignal((n) => n + 1)}
                />
                {/* F6 — Recursos financeiros (verba BP / ZFPJ) */}
                <FinancialResourcesBlock
                  proposalId={createdProposalId}
                  opportunityId={opportunityId}
                  onResourcesChanged={() => setAutoCalcRefreshSignal((n) => n + 1)}
                />
                {/* Investimentos — entre Recursos financeiros e
                    Receitas/Despesas, como o protótipo o insere. O callback é
                    obrigatório: o investimento viaja na estrutura
                    `investimentos` do payload do ARP, então editá-lo muda a TIR
                    e o backend marca a proposta como `desatualizado`. */}
                <InvestmentsBlock
                  proposalId={createdProposalId}
                  opportunityId={opportunityId}
                  onInvestmentsChanged={() => setAutoCalcRefreshSignal((n) => n + 1)}
                />
                {/* F9 — Receitas e Despesas da oportunidade */}
                <FinancialItemsBlock
                  proposalId={createdProposalId}
                  onItemsChanged={() => setAutoCalcRefreshSignal((n) => n + 1)}
                />
              </>
            ) : (
              showDownstreamBlocks && (
                <div
                  data-testid="downstream-locked-hint"
                  className="rounded-[var(--radius-md)] border border-dashed border-(--color-border-strong) bg-(--color-surface) p-5 text-(length:--t-caption) text-(--color-text-muted)"
                >
                  Conclua os dados da proposta e clique em{' '}
                  <strong className="text-(--neutral-900)">Concluir</strong> para habilitar os
                  blocos de{' '}
                  {finalidade === Finalidade.Vinculacao
                    ? 'situação do posto, produtos, recursos financeiros e receitas/despesas'
                    : 'situação do posto, produtos e receitas/despesas'}
                  .
                </div>
              )
            )}
          </div>

          {/* ── Painel ao vivo (right column) — lateral fixo, sempre visível ──
              Placeholder ONLY while the proposal does not exist. Once created,
              the REAL indicators panel takes over — the placeholder's disabled
              "Recalcular / Simular (ARP)" used to stay on screen with product
              and financial blocks already filled, telling the user to fill
              what was already filled (E2E finding, 10/08/2026). */}
          {createdProposalId ? (
            <aside className="sticky top-4 flex flex-col gap-3.5 self-start max-[920px]:static">
              <ProposalIndicatorsBlock
                proposalId={createdProposalId}
                refreshSignal={autoCalcRefreshSignal}
              />
              <ProposalAutoCalcBlock
                proposalId={createdProposalId}
                refreshSignal={autoCalcRefreshSignal}
              />
            </aside>
          ) : (
            <LivePanelPlaceholder />
          )}
        </div>
      </main>

      {/* Fixed sendbar */}
      <Sendbar
        canSend={canSend}
        onConcluir={() => void handleConcluir()}
        sendStatus={sendStatus}
        sendError={sendError}
        isAlreadyActive={isAlreadyActive}
        created={createdProposalId !== null}
        opportunityId={opportunityId}
        postoBlocked={postoBlocked}
        datesError={datesError}
      />
    </div>
  );
}
