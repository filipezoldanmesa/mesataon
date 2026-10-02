'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  PROPRIEDADE_IMOVEL_LABELS,
  SITUACAO_POSTO_LABELS as SITUACAO_POSTO_LABELS_SHARED,
} from '@/lib/proposals/posto-situation.labels';
import { listFinancialItems as defaultGetItems } from '@/lib/proposals/financial-items.data';
import { getFinancialResources as defaultGetResources } from '@/lib/proposals/financial-resources.data';
import { getProposal as defaultGetProposal } from '@/lib/proposals/proposal.data';
import type { ProposalSummary } from '@/lib/proposals/proposal.types';
import type { FinancialItemsSnapshot } from '@/lib/proposals/financial-items.types';
import type { FinancialResourcesListResult } from '@/lib/proposals/financial-resources.types';
import type { PostoSituation } from '@/lib/proposals/posto-situation.types';
import { getPostoSituation as defaultGetSituation } from '@/lib/proposals/posto-situation.data';
import { listProductLines as defaultGetProductLines } from '@/lib/proposals/product-lines.data';
import type { ProductLine } from '@/lib/proposals/types';
import {
  listPostoPhotos as defaultGetPhotos,
  solicitarAjuste as defaultSolicitarAjuste,
} from '@/lib/sneg/sneg-analysis.data';
import type { SolicitarAjusteResult } from '@/lib/sneg/sneg-analysis.types';
import { SolicitarAjusteError } from '@/lib/sneg/sneg-analysis.types';
import { getConferencia as defaultGetConferencia } from '@/lib/analise/analise.data';
import { ehAnexoPdf } from '@/lib/proposals/posto-photos.types';
import { PdfThumb } from '@/components/pdf-thumb';
import type { ConferenciaProposta, ConferenciaResult } from '@/lib/analise/analise.types';
import { urlDeMidiaSegura } from '@/lib/arquivo/url-de-midia';

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

const TIPO_CONTRATO_LABELS: Record<string, string> = {
  CPCVM: 'CPCVM — Volume Total',
  CLUM: 'CLUM — Volume Líquido',
};

// The posto labels come from the shared map, not a local copy: three duplicated
// label maps is how this screen ended up spelling the same fact differently from
// the proposal's own posto block.
const SITUACAO_POSTO_LABELS: Record<string, string> = SITUACAO_POSTO_LABELS_SHARED;
const PROPRIEDADE_LABELS: Record<string, string> = PROPRIEDADE_IMOVEL_LABELS;

function formatDateBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('pt-BR', {
    timeZone: 'UTC',
  });
}

/**
 * Guard `null` — a financial item's monetary fields may be null when the
 * backend has not yet received an amount (e.g. a newly-created required item
 * with no value set). This is a distinct state from "zero" and must be
 * handled gracefully. Mirrors `formatCurrency` of `financial-items-block.tsx`.
 */
function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardLoadStatus = 'loading' | 'loaded' | 'error';

interface CardState<T> {
  status: CardLoadStatus;
  data: T | null;
}

interface AdjustState {
  open: boolean;
  comentario: string;
  isSubmitting: boolean;
  error: string | null;
  /** True after a successful submission — shows the .reqtag */
  requested: boolean;
}

const INITIAL_ADJUST: AdjustState = {
  open: false,
  comentario: '',
  isSubmitting: false,
  error: null,
  requested: false,
};

type Props = {
  proposalId: string;
  /**
   * Opportunity the proposal belongs to. When provided, the block also loads
   * the backend "Conferência do preenchimento" (VBR-278 — RN-F1-03) and shows
   * the required-fields summary — the required-field rule lives ONLY in the
   * backend parametrization; this component just renders the verdict.
   */
  opportunityId?: string;
  /** Injectable for tests. */
  getConferencia?: (opportunityId: string) => Promise<ConferenciaResult>;
  /** Injectable for tests. */
  getProposal?: (id: string) => Promise<ProposalSummary>;
  /** Injectable for tests. */
  getSituation?: (id: string) => Promise<PostoSituation | null>;
  /** Injectable for tests. */
  getPhotos?: (id: string) => Promise<Array<{ id: string; fileName: string; url: string }>>;
  /** Injectable for tests. */
  getProductLines?: (id: string) => Promise<ProductLine[]>;
  /** Injectable for tests. */
  getResources?: (id: string) => Promise<FinancialResourcesListResult>;
  /** Injectable for tests. */
  getItems?: (id: string) => Promise<FinancialItemsSnapshot>;
  /** Injectable for tests. */
  solicitarAjuste?: (
    proposalId: string,
    bloco: string,
    comentario: string,
    fotoRef?: string,
  ) => Promise<SolicitarAjusteResult>;
  /** Callback when a new pendência is created (updates the lateral card). */
  onPendenciaCreated?: (pendenciaId: string, bloco: string) => void;
};

/**
 * Maps the block's internal card keys to the backend `BlocoAjuste` enum
 * (`dados|situacao|fotos|produtos|recursos|financeiro`). The internal keys
 * are richer (they also key the per-card adjust UI state) — the API only
 * accepts the controlled vocabulary, so every solicitar-ajuste call MUST
 * translate through this map (a raw internal key would 400).
 */
const BLOCO_API: Record<string, string> = {
  dados_proposta: 'dados',
  situacao_posto: 'situacao',
  fotos_posto: 'fotos',
  produtos_simulacao: 'produtos',
  recursos_financeiros: 'recursos',
  receitas_despesas: 'financeiro',
};

// ---------------------------------------------------------------------------
// Generic review card shell
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Prototype buttons (`vibra-ui.css`)
// ---------------------------------------------------------------------------

/**
 * `.btn` — 14px bold, radius-xxs, 1px border. Padding is NOT baked in: two
 * padding utilities on the same element resolve by stylesheet order, not by
 * class order, so a call site that needs the prototype's tighter `.foto .cap
 * .btn{padding:6px 10px}` could never win against a default here.
 */
const BTN = 'inline-flex items-center justify-center gap-2 rounded-[var(--radius-xxs)] border text-(length:--t-caption) font-bold transition disabled:cursor-not-allowed disabled:border-transparent disabled:bg-(--neutral-40) disabled:text-(--neutral-500)';

/** Default `.btn` padding (`9px 16px`). */
const BTN_PAD = 'px-4 py-2.25';

/** `.btn-ghost` — bg #f9f9f9, text/border #418020, hover #eee. */
const BTN_GHOST = `${BTN} border-(--secondary-500) bg-(--neutral-25) text-(--secondary-500) hover:bg-(--neutral-50)`;

/**
 * `.btn-primary` — solid `--secondary-500` (#418020). Hover uses
 * `--secondary-600`: the prototype hovers to #3c781e, which has no token, and
 * ADR-0018 forbids raw hexes in code (same call the sendbar buttons make).
 */
const BTN_PRIMARY = `${BTN} border-transparent bg-(--secondary-500) text-white hover:bg-(--secondary-600)`;

function RevCard({
  title,
  bloco,
  adjustState,
  onToggleAdjust,
  onCommentChange,
  onSubmitAdjust,
  headerHint,
  children,
}: {
  title: string;
  bloco: string;
  adjustState: AdjustState;
  onToggleAdjust: () => void;
  onCommentChange: (v: string) => void;
  onSubmitAdjust: () => void;
  /**
   * Replaces the block-level "Comentar / solicitar ajuste" action with a muted
   * hint — the prototype does this on the fotos card, where the action lives on
   * each photo instead of the block.
   */
  headerHint?: string;
  children: React.ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when expanded
  useEffect(() => {
    if (adjustState.open) {
      textareaRef.current?.focus();
    }
  }, [adjustState.open]);

  return (
    <div
      className="mb-[10px] rounded-[var(--radius-xs)] border border-(--color-border) px-[14px] py-3"
      data-testid={`rev-card-${bloco}`}
    >
      {/* Card header */}
      <div className="mb-2 flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-(length:--t-caption) font-bold">
          {title}
          {adjustState.requested && (
            <span
              data-testid={`reqtag-${bloco}`}
              className="ml-2 rounded-[var(--radius-xxs)] border border-(--yellow-300) bg-(--yellow-100) px-2 py-0.5 text-(length:--t-caption) font-bold text-(--yellow-700)"
            >
              ajuste solicitado
            </span>
          )}
        </h4>
        {headerHint ? (
          <span
            className="shrink-0 text-(length:--t-caption) text-(--color-text-muted)"
            data-testid={`header-hint-${bloco}`}
          >
            {headerHint}
          </span>
        ) : (
          <button
            type="button"
            aria-expanded={adjustState.open}
            onClick={onToggleAdjust}
            className="text-(length:--t-caption) font-bold text-(--secondary-600) underline-offset-2 hover:underline"
            data-testid={`adjust-btn-${bloco}`}
          >
            Comentar / solicitar ajuste
          </button>
        )}
      </div>

      {/* Card body — 2-column grid */}
      <div
        className="grid gap-x-6 gap-y-2 [grid-template-columns:1fr_1fr] max-[960px]:[grid-template-columns:1fr]"
        data-testid={`rev-body-${bloco}`}
      >
        {children}
      </div>

      {/* Adjust panel (.cmt) */}
      {adjustState.open && (
        <div
          className="mt-3 border-t border-(--color-border) pt-3"
          data-testid={`cmt-panel-${bloco}`}
        >
          <label
            htmlFor={`cmt-${bloco}`}
            className="mb-1 block text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            Comentário *
          </label>
          <textarea
            id={`cmt-${bloco}`}
            ref={textareaRef}
            value={adjustState.comentario}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Descreva o ajuste necessário…"
            className="w-full min-h-[56px] resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-[10px] py-2 text-(length:--t-caption) font-[inherit]"
            aria-describedby={adjustState.error ? `cmt-err-${bloco}` : undefined}
          />
          {adjustState.error && (
            <div
              id={`cmt-err-${bloco}`}
              role="alert"
              data-testid={`cmt-error-${bloco}`}
              className="mt-1.5 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2 text-(length:--t-small) text-(--red-700)"
            >
              {adjustState.error}
            </div>
          )}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onToggleAdjust}
              disabled={adjustState.isSubmitting}
              className={`${BTN_GHOST} ${BTN_PAD}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSubmitAdjust}
              disabled={adjustState.isSubmitting}
              className={`${BTN_PRIMARY} ${BTN_PAD}`}
              data-testid={`submit-adjust-${bloco}`}
            >
              {adjustState.isSubmitting ? 'Enviando…' : 'Solicitar ajuste'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A single label-value pair inside a rev-body grid. */
function KvPair({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div>
      {/* `.rev-body .l` — 14px uppercase muted, NOT bold. */}
      <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      {/* `.rev-body .v` — 14px BOLD in --color-text, `margin-top: 2px`. */}
      <div className="mt-0.5 text-(length:--t-caption) font-bold text-(--color-text)">
        {value ?? '—'}
      </div>
    </div>
  );
}

/** Loading skeleton for a card. */
function CardLoading({ title }: { title: string }) {
  return (
    <div className="mb-[10px] rounded-[var(--radius-xs)] border border-(--color-border) px-[14px] py-3">
      <div className="mb-2 h-4 w-40 animate-pulse rounded bg-(--neutral-100)" />
      <div className="text-(length:--t-small) italic text-(--color-text-muted)">
        Carregando {title.toLowerCase()}…
      </div>
    </div>
  );
}

/** Error state for a card. */
function CardError({ title }: { title: string }) {
  return (
    <div
      role="alert"
      className="mb-[10px] rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-[14px] py-3 text-(length:--t-caption) text-(--red-700)"
      data-testid={`card-error-${title}`}
    >
      Falha ao carregar {title.toLowerCase()}. Verifique sua conexão.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo card (.foto) + its comment box (.cmt) — "Fotos do posto" card
// ---------------------------------------------------------------------------

/**
 * A single `.foto` card (prototype spec): 160px, 74px thumbnail, and a caption
 * with the file name plus a full-width ghost "Comentar" button. The button only
 * TOGGLES the comment box; the box itself lives outside the grid (see
 * {@link PhotoCommentBox}) exactly like the prototype's `.cmt` blocks — inside
 * the 160px card the textarea and its two buttons had nowhere to go and
 * overflowed the card.
 *
 * The flagged state ("nova solicitada") only appears after API success and is
 * NOT reversible by click — undoing it means resolving the pendência.
 */
function PhotoCard({
  photo,
  flagged,
  open,
  onToggle,
}: {
  photo: { id: string; fileName: string; url: string; mimeType?: string };
  flagged: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  /*
   * `photo.url` vem de resposta HTTP; o que a recusa aqui cai no MESMO fallback
   * de um byte ilegível, em vez de virar um `src` que a tela não escolheu.
   */
  const fonte = urlDeMidiaSegura(photo.url);

  return (
    <div
      className={`flex w-[160px] flex-col overflow-hidden rounded-[var(--radius-xs)] border bg-(--neutral-50) ${flagged ? 'border-(--yellow-300)' : 'border-(--color-border)'}`}
      data-testid={`foto-card-${photo.id}`}
    >
      {/* Photo (.ph 74px) — real image with error fallback */}
      {ehAnexoPdf(photo) ? (
        /*
         * O anexo é um PDF (as fotos passaram a aceitá-lo em 10/09/2026): um
         * <img> aqui cairia no fallback abaixo e diria "Falha ao carregar a
         * foto" sobre um arquivo íntegro.
         */
        <div className="h-[74px] w-full">
          <PdfThumb fileName={photo.fileName} />
        </div>
      ) : imgFailed || fonte === null ? (
        <div
          className="flex h-[74px] items-center justify-center bg-(--neutral-50) text-(length:--t-small) text-(--color-text-muted)"
          data-testid={`foto-fallback-${photo.id}`}
        >
          Falha ao carregar a foto
        </div>
      ) : (
        /*
         * Plain <img>: the BFF streams the bytes from the document store, so
         * next/image would add a second proxy in front of a same-origin,
         * already-authorized route.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fonte}
          alt={`Foto: ${photo.fileName}`}
          className="h-[74px] w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}
      {/* `.cap` — 14px, `padding 10px 12px`, column with `gap 8px` */}
      <div
        className={`flex flex-col items-start gap-2 border-t px-3 py-2.5 text-(length:--t-caption) ${flagged ? 'border-(--yellow-300) bg-(--yellow-100)' : 'border-(--color-border)'}`}
      >
        <div
          className={`w-full truncate ${flagged ? 'text-(--yellow-700)' : 'text-(--color-text-muted)'}`}
          title={photo.fileName}
        >
          {photo.fileName}
        </div>
        {flagged ? (
          <span
            className="text-(length:--t-caption) font-bold text-(--yellow-700)"
            data-testid={`flag-photo-${photo.id}`}
          >
            nova solicitada
          </span>
        ) : (
          /*
           * `.foto .cap .btn{width:100%;justify-content:center;padding:6px 10px}`.
           * Label is "Comentar" (prototype): this button OPENS the comment box —
           * "Solicitar nova foto" is what the box submits. Naming the toggle after
           * the submit hid the comment affordance and wrapped onto two lines.
           */
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={`${BTN_GHOST} w-full px-2.5 py-1.5`}
            data-testid={`flag-photo-${photo.id}`}
          >
            Comentar
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * `.cmt` block of a photo: full block width, below the `.fotos` grid, separated
 * by a dashed border. Submitting creates a REAL pendência scoped to the photo
 * (`POST solicitar-ajuste { bloco: 'fotos', fotoRef }` — VBR-292).
 */
function PhotoCommentBox({
  photo,
  onSolicitar,
  onCancel,
}: {
  photo: { id: string; fileName: string };
  onSolicitar: (comentario: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function handleSubmit() {
    if (!comentario.trim()) {
      setError('O comentário é obrigatório para solicitar nova foto.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSolicitar(comentario.trim());
      setComentario('');
    } catch (err) {
      /*
       * Surface the reason the API gave (e.g. "Proposta não está em análise
       * (status atual: EM_PREENCHIMENTO)"). The generic "Tente novamente" hid a
       * business rejection behind what looked like a transient failure, so the
       * analyst retried forever.
       */
      setError(
        err instanceof SolicitarAjusteError && err.message
          ? err.message
          : 'Falha ao solicitar nova foto. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="col-span-2 mt-2.5 border-t border-dashed border-(--color-border) pt-2.5"
      data-testid={`foto-cmt-${photo.id}`}
    >
      <label
        htmlFor={`foto-cmt-input-${photo.id}`}
        className="mb-1 block text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
      >
        Comentário — {photo.fileName}
      </label>
      <textarea
        id={`foto-cmt-input-${photo.id}`}
        ref={textareaRef}
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        disabled={submitting}
        placeholder="Ex.: foto da fachada com baixa nitidez — enviar nova diurna."
        className="min-h-[56px] w-full resize-y rounded-[var(--radius-xs)] border border-(--color-border-strong) px-[10px] py-2 text-(length:--t-caption) font-[inherit]"
      />
      {error && (
        <p
          className="mt-1.5 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2 text-(length:--t-small) text-(--red-700)"
          role="alert"
        >
          {error}
        </p>
      )}
      {/* `.cmt .row` — right-aligned, `gap 8px` */}
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className={`${BTN_GHOST} ${BTN_PAD}`}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          data-testid={`foto-submit-${photo.id}`}
          className={`${BTN_PRIMARY} ${BTN_PAD}`}
        >
          {submitting ? 'Enviando…' : 'Solicitar nova foto'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * "Conferência do preenchimento" block — SNEG F2 (VBR-255).
 *
 * Six read-only review cards covering all proposal data, each with an
 * independent "Comentar / solicitar ajuste" action:
 *
 *   1. Dados da proposta        — from GET /api/proposals/:id
 *   2. Situação do posto/imóvel — from GET /api/proposals/:id/posto-situation
 *   3. Fotos do posto/imóvel    — from GET /api/proposals/:id/posto-photos
 *   4. Produtos e simulação     — from GET /api/proposals/:id/product-lines
 *   5. Recursos financeiros     — from GET /api/proposals/:id/financial-resources
 *   6. Receitas e Despesas      — from GET /api/proposals/:id/financial-items
 *
 * The "Solicitar ajuste" action posts to `/api/proposals/:id/solicitar-ajuste`
 * { bloco, comentario }. On success the .reqtag appears in the card title
 * and the lateral pendências panel is notified via `onPendenciaCreated`.
 *
 * Required-fields signal (VBR-278 — RN-F1-03/CA-F1-02): when `opportunityId`
 * is provided, the block loads GET /api/opportunities/:id/analise/conferencia
 * and renders the backend verdict (missing required campos) in a summary strip
 * above the cards. The rule of "what is required" lives ONLY in the backend
 * `sneg_campos_obrigatorios` parametrization — never derived client-side.
 */
export function ConferenciaPreenchimentoBlock({
  proposalId,
  opportunityId,
  getConferencia = defaultGetConferencia,
  getProposal = defaultGetProposal,
  getSituation = defaultGetSituation,
  getPhotos = defaultGetPhotos,
  getProductLines = defaultGetProductLines,
  getResources = defaultGetResources,
  getItems = defaultGetItems,
  solicitarAjuste = defaultSolicitarAjuste,
  onPendenciaCreated,
}: Props) {
  // Card data states
  const [proposalCard, setProposalCard] = useState<CardState<ProposalSummary>>({
    status: 'loading',
    data: null,
  });
  const [situacaoCard, setSituacaoCard] = useState<CardState<PostoSituation | null>>({
    status: 'loading',
    data: null,
  });
  const [photosCard, setPhotosCard] = useState<
    CardState<Array<{ id: string; fileName: string; url: string }>>
  >({ status: 'loading', data: null });
  const [productsCard, setProductsCard] = useState<CardState<ProductLine[]>>({
    status: 'loading',
    data: null,
  });
  const [resourcesCard, setResourcesCard] = useState<CardState<FinancialResourcesListResult>>({
    status: 'loading',
    data: null,
  });
  const [itemsCard, setItemsCard] = useState<CardState<FinancialItemsSnapshot>>({
    status: 'loading',
    data: null,
  });

  // Required-fields verdict from the backend conferência (VBR-278). Absent
  // opportunityId (legacy callers) or a load failure simply hides the summary —
  // the review cards below never depend on it.
  const [conferencia, setConferencia] = useState<CardState<ConferenciaProposta>>({
    status: 'loading',
    data: null,
  });

  // Flagged photo IDs
  const [flaggedPhotoIds, setFlaggedPhotoIds] = useState<Set<string>>(new Set());
  /**
   * Photo whose comment box is open. Lifted out of the card because the box is
   * rendered at block width below the grid (prototype `.cmt`), and only one is
   * open at a time — the same behaviour as the six block-level comment panels.
   */
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  // Adjust states per bloco
  const [adjustStates, setAdjustStates] = useState<Record<string, AdjustState>>({});

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Load all cards in parallel — each fails independently
  useEffect(() => {
    let cancelled = false;

    // 1. Proposal basic data
    getProposal(proposalId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setProposalCard({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setProposalCard({ status: 'error', data: null });
      });

    // 2. Posto situation
    getSituation(proposalId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setSituacaoCard({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setSituacaoCard({ status: 'error', data: null });
      });

    // 3. Photos
    getPhotos(proposalId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setPhotosCard({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setPhotosCard({ status: 'error', data: null });
      });

    // 4. Product lines
    getProductLines(proposalId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setProductsCard({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setProductsCard({ status: 'error', data: null });
      });

    // 5. Financial resources
    getResources(proposalId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setResourcesCard({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setResourcesCard({ status: 'error', data: null });
      });

    // 6. Financial items
    getItems(proposalId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setItemsCard({ status: 'loaded', data });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setItemsCard({ status: 'error', data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [proposalId, getProposal, getSituation, getPhotos, getProductLines, getResources, getItems]);

  // Backend required-fields verdict (VBR-278) — independent of the cards above.
  useEffect(() => {
    if (!opportunityId) return;

    let cancelled = false;
    setConferencia({ status: 'loading', data: null });

    getConferencia(opportunityId)
      .then((result) => {
        if (cancelled || !mountedRef.current) return;
        const proposta =
          result.propostas.find((p) => p.proposalId === proposalId) ?? null;
        setConferencia({ status: 'loaded', data: proposta });
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setConferencia({ status: 'error', data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [opportunityId, proposalId, getConferencia]);

  // ---------------------------------------------------------------------------
  // Adjust helpers
  // ---------------------------------------------------------------------------

  function getAdjust(bloco: string): AdjustState {
    return adjustStates[bloco] ?? INITIAL_ADJUST;
  }

  function setAdjust(bloco: string, update: Partial<AdjustState>) {
    setAdjustStates((prev) => ({
      ...prev,
      [bloco]: { ...(prev[bloco] ?? INITIAL_ADJUST), ...update },
    }));
  }

  function toggleAdjust(bloco: string) {
    const current = getAdjust(bloco);
    setAdjust(bloco, {
      open: !current.open,
      error: null,
      ...(current.open ? { comentario: '' } : {}),
    });
  }

  const handleSolicitarAjuste = useCallback(
    async (bloco: string) => {
      const state = getAdjust(bloco);

      if (!state.comentario.trim()) {
        setAdjust(bloco, { error: 'O comentário é obrigatório para solicitar ajuste.' });
        return;
      }

      setAdjust(bloco, { isSubmitting: true, error: null });

      try {
        const result = await solicitarAjuste(
          proposalId,
          BLOCO_API[bloco] ?? bloco,
          state.comentario.trim(),
        );

        if (!mountedRef.current) return;

        setAdjust(bloco, {
          isSubmitting: false,
          open: false,
          comentario: '',
          requested: true,
        });

        onPendenciaCreated?.(result.pendenciaId, bloco);
      } catch (err) {
        if (!mountedRef.current) return;
        const msg =
          err instanceof SolicitarAjusteError
            ? err.message
            : 'Falha ao solicitar ajuste. Tente novamente.';
        setAdjust(bloco, { isSubmitting: false, error: msg });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [proposalId, solicitarAjuste, onPendenciaCreated, adjustStates],
  );

  // ---------------------------------------------------------------------------
  // Render helpers — required-fields summary (backend verdict — VBR-278)
  // ---------------------------------------------------------------------------

  function renderRequiredFieldsSummary() {
    if (!opportunityId || conferencia.status === 'loading') return null;

    if (conferencia.status === 'error') {
      return (
        <p
          className="mb-3 text-(length:--t-small) italic text-(--color-text-muted)"
          data-testid="conferencia-required-error"
        >
          Não foi possível carregar os campos obrigatórios parametrizados.
        </p>
      );
    }

    const proposta = conferencia.data;
    if (!proposta) return null;

    /*
     * Nothing to say when everything is filled: the prototype has no
     * "campos obrigatórios preenchidos" banner, and a green confirmation of the
     * normal case is noise above six cards. Only the DEVIATION is reported —
     * that is the RN-F1-03 verdict the analyst needs.
     */
    if (proposta.completo) return null;

    const faltantes = proposta.campos.filter((c) => !c.preenchido);
    return (
      <div
        className="mb-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2 text-(length:--t-caption) text-(--yellow-700)"
        data-testid="conferencia-required-summary"
        role="status"
      >
        <span className="font-bold">
          {proposta.faltantes} campo{proposta.faltantes > 1 ? 's' : ''} obrigatório
          {proposta.faltantes > 1 ? 's' : ''} pendente
          {proposta.faltantes > 1 ? 's' : ''}:
        </span>{' '}
        {faltantes.map((c, i) => (
          <span key={c.campo} data-testid={`conferencia-missing-${c.campo}`}>
            {c.label}
            {i < faltantes.length - 1 ? ', ' : ''}
          </span>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render helpers — one section per card
  // ---------------------------------------------------------------------------

  // 1. Dados da proposta
  function renderDadosProposta() {
    if (proposalCard.status === 'loading') return <CardLoading title="Dados da proposta" />;
    if (proposalCard.status === 'error') return <CardError title="dados da proposta" />;

    const p = proposalCard.data;
    const bloco = 'dados_proposta';
    const adjust = getAdjust(bloco);

    const periodoAnalise =
      p?.dataInicioAnalise && p?.dataFimAnalise
        ? `${formatDateBr(p.dataInicioAnalise)} – ${formatDateBr(p.dataFimAnalise)}`
        : '—';

    return (
      <RevCard
        title="Dados da proposta"
        bloco={bloco}
        adjustState={adjust}
        onToggleAdjust={() => toggleAdjust(bloco)}
        onCommentChange={(v) => setAdjust(bloco, { comentario: v })}
        onSubmitAdjust={() => void handleSolicitarAjuste(bloco)}
      >
        <KvPair
          label="Tipo de contrato"
          value={
            p
              ? (TIPO_CONTRATO_LABELS[(p as unknown as { tipoContrato: string }).tipoContrato] ??
                (p as unknown as { tipoContrato: string }).tipoContrato ??
                '—')
              : '—'
          }
        />
        <KvPair
          label="Finalidade"
          value={
            p
              ? p.finalidade
              : '—'
          }
        />
        <KvPair
          label="Programa Acelera+"
          value={
            p !== null && typeof (p as unknown as { aceleraMais: boolean }).aceleraMais === 'boolean'
              ? ((p as unknown as { aceleraMais: boolean }).aceleraMais ? 'Sim' : 'Não')
              : '—'
          }
        />
        <KvPair label="Período da análise" value={periodoAnalise} />
      </RevCard>
    );
  }

  // 2. Situação do posto e do imóvel
  function renderSituacaoPosto() {
    if (situacaoCard.status === 'loading')
      return <CardLoading title="Situação do posto e do imóvel" />;
    if (situacaoCard.status === 'error')
      return <CardError title="situação do posto e do imóvel" />;

    const s = situacaoCard.data;
    const bloco = 'situacao_posto';
    const adjust = getAdjust(bloco);

    return (
      <RevCard
        title="Situação do posto e do imóvel"
        bloco={bloco}
        adjustState={adjust}
        onToggleAdjust={() => toggleAdjust(bloco)}
        onCommentChange={(v) => setAdjust(bloco, { comentario: v })}
        onSubmitAdjust={() => void handleSolicitarAjuste(bloco)}
      >
        <KvPair
          label="Situação do posto"
          value={s ? (SITUACAO_POSTO_LABELS[s.situacaoPosto] ?? s.situacaoPosto) : '—'}
        />
        <KvPair label="Bandeira (física)" value={s?.bandeiraFisica ?? '—'} />
        <KvPair
          label="Propriedade"
          value={s ? (PROPRIEDADE_LABELS[s.propriedadeImovel] ?? s.propriedadeImovel) : '—'}
        />
        <KvPair
          label="Fim do contrato de uso"
          value={s?.dataFimUso ? formatDateBr(s.dataFimUso) : '—'}
        />
      </RevCard>
    );
  }

  // 3. Fotos do posto e do imóvel
  function renderFotos() {
    if (photosCard.status === 'loading') return <CardLoading title="Fotos do posto e do imóvel" />;
    if (photosCard.status === 'error') return <CardError title="fotos do posto e do imóvel" />;

    const photos = photosCard.data ?? [];
    const openPhoto = photos.find((photo) => photo.id === openPhotoId) ?? null;
    const bloco = 'fotos_posto';
    const adjust = getAdjust(bloco);

    return (
      <RevCard
        title="Fotos do posto e do imóvel"
        bloco={bloco}
        adjustState={adjust}
        onToggleAdjust={() => toggleAdjust(bloco)}
        onCommentChange={(v) => setAdjust(bloco, { comentario: v })}
        onSubmitAdjust={() => void handleSolicitarAjuste(bloco)}
        /*
         * Prototype: the fotos header carries a hint, because the action is
         * per-photo ("Solicitar nova foto"). With no photos there is nothing to
         * act on, so the block-level action stays — otherwise the analyst has no
         * way to ask the LT for them.
         */
        headerHint={photos.length > 0 ? 'comente ou solicite nova por foto' : undefined}
      >
        {photos.length === 0 ? (
          <p
            className="col-span-2 text-(length:--t-small) italic text-(--color-text-muted)"
            data-testid="no-photos"
          >
            Nenhuma foto enviada ainda.
          </p>
        ) : (
          <>
            {/* `.fotos` — flex wrap, gap 10px */}
            <div className="col-span-2 flex flex-wrap gap-2.5" data-testid="photo-grid">
              {photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  flagged={flaggedPhotoIds.has(photo.id)}
                  open={openPhotoId === photo.id}
                  onToggle={() =>
                    setOpenPhotoId((current) => (current === photo.id ? null : photo.id))
                  }
                />
              ))}
            </div>

            {/*
             * The open photo's `.cmt` block, at BLOCK width below the grid — the
             * prototype places these outside `.fotos` for the same reason: a
             * textarea plus two buttons does not fit a 160px card.
             */}
            {openPhoto && (
              <PhotoCommentBox
                photo={openPhoto}
                onCancel={() => setOpenPhotoId(null)}
                onSolicitar={async (comentario) => {
                  // VBR-292: creates a REAL pendência scoped to this photo.
                  // The flag is only set after API success (irreversible —
                  // undoing means resolving the pendência).
                  const result = await solicitarAjuste(
                    proposalId,
                    'fotos',
                    comentario,
                    openPhoto.id,
                  );
                  if (!mountedRef.current) return;
                  setFlaggedPhotoIds((prev) => new Set(prev).add(openPhoto.id));
                  setOpenPhotoId(null);
                  onPendenciaCreated?.(result.pendenciaId, 'fotos');
                }}
              />
            )}
          </>
        )}
      </RevCard>
    );
  }

  // 4. Produtos e simulação
  function renderProdutos() {
    if (productsCard.status === 'loading') return <CardLoading title="Produtos e simulação" />;
    if (productsCard.status === 'error') return <CardError title="produtos e simulação" />;

    const lines = productsCard.data ?? [];
    const bloco = 'produtos_simulacao';
    const adjust = getAdjust(bloco);

    const volumeTotal = lines.reduce((acc, l) => acc + l.volume, 0);
    const margemMedia =
      lines.length > 0
        ? lines.reduce((acc, l) => acc + l.margemProposta, 0) / lines.length
        : null;
    const precoMedio =
      lines.length > 0
        ? lines.reduce((acc, l) => acc + l.precoFinal, 0) / lines.length
        : null;

    return (
      <RevCard
        title="Produtos e simulação"
        bloco={bloco}
        adjustState={adjust}
        onToggleAdjust={() => toggleAdjust(bloco)}
        onCommentChange={(v) => setAdjust(bloco, { comentario: v })}
        onSubmitAdjust={() => void handleSolicitarAjuste(bloco)}
      >
        <KvPair
          label="Volume total"
          value={
            lines.length > 0
              ? `${volumeTotal.toLocaleString('pt-BR')} m³/mês`
              : '—'
          }
        />
        <KvPair
          label="Margem média"
          value={
            margemMedia !== null
              ? `R$ ${margemMedia.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m³`
              : '—'
          }
        />
        <KvPair
          label="Preço final médio"
          value={
            precoMedio !== null
              ? `R$ ${precoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/m³`
              : '—'
          }
        />
        <KvPair
          label="Produtos"
          value={lines.length > 0 ? `${lines.length} produto${lines.length > 1 ? 's' : ''}` : '—'}
        />
      </RevCard>
    );
  }

  // 5. Recursos financeiros
  function renderRecursos() {
    if (resourcesCard.status === 'loading') return <CardLoading title="Recursos financeiros" />;
    if (resourcesCard.status === 'error') return <CardError title="recursos financeiros" />;

    const res = resourcesCard.data;
    const bloco = 'recursos_financeiros';
    const adjust = getAdjust(bloco);

    const items = res?.items ?? [];
    const bpBudget = res?.bpBudget;

    // % Antecipação = items of type BONIFICACAO with ANTECIPADA
    const antecipacaoItems = items.filter(
      (r) => r.tipoRegistro === 'BONIFICACAO' && r.tipoBonificacao === 'ANTECIPADA',
    );
    const percentualAntecipacao =
      bpBudget && bpBudget.verba > 0
        ? (antecipacaoItems.reduce((a, r) => a + r.valorTotal, 0) / bpBudget.verba) * 100
        : null;

    // Custo de vinculação (unit.) — total dos recursos / m³ requires product lines; show as sum
    const custoVinculacao = items.reduce((a, r) => a + r.valorTotal, 0);

    return (
      <RevCard
        title="Recursos financeiros"
        bloco={bloco}
        adjustState={adjust}
        onToggleAdjust={() => toggleAdjust(bloco)}
        onCommentChange={(v) => setAdjust(bloco, { comentario: v })}
        onSubmitAdjust={() => void handleSolicitarAjuste(bloco)}
      >
        <KvPair
          label="Recursos"
          value={items.length > 0 ? `${items.length} recurso${items.length > 1 ? 's' : ''}` : '—'}
        />
        <KvPair
          label="Verba (BP) disponível"
          value={bpBudget ? `${bpBudget.percentualUtilizado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% utilizado` : '—'}
        />
        <KvPair
          label="% Antecipação"
          value={percentualAntecipacao !== null ? `${percentualAntecipacao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—'}
        />
        <KvPair
          label="Custo de vinculação (unit.)"
          value={custoVinculacao > 0 ? formatCurrency(custoVinculacao) : '—'}
        />
      </RevCard>
    );
  }

  // 6. Receitas e Despesas
  function renderReceitasDespesas() {
    if (itemsCard.status === 'loading') return <CardLoading title="Receitas e Despesas" />;
    if (itemsCard.status === 'error') return <CardError title="receitas e despesas" />;

    const snap = itemsCard.data;
    const bloco = 'receitas_despesas';
    const adjust = getAdjust(bloco);

    const items = snap?.items ?? [];
    const summary = snap?.summary;

    const obrigatorios = items.filter((i) => i.obrigatoria && !i.bypass).length;

    return (
      <RevCard
        title="Receitas e Despesas"
        bloco={bloco}
        adjustState={adjust}
        onToggleAdjust={() => toggleAdjust(bloco)}
        onCommentChange={(v) => setAdjust(bloco, { comentario: v })}
        onSubmitAdjust={() => void handleSolicitarAjuste(bloco)}
      >
        <KvPair
          label="Total receitas"
          value={summary ? formatCurrency(summary.totalReceitas) : '—'}
        />
        <KvPair
          label="Total despesas"
          value={summary ? formatCurrency(summary.totalDespesas) : '—'}
        />
        <KvPair
          label="Itens"
          value={items.length > 0 ? `${items.length} item${items.length > 1 ? 'ns' : ''}` : '—'}
        />
        <KvPair
          label="Obrigatórios (parametrizados)"
          value={obrigatorios > 0 ? `${obrigatorios}` : '—'}
        />
      </RevCard>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section
      aria-labelledby="conferencia-title"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      <h2 id="conferencia-title" className="mb-3 text-(length:--t-h4) font-bold">
        Conferência do preenchimento
      </h2>

      {renderRequiredFieldsSummary()}

      <div data-testid="conferencia-cards">
        {renderDadosProposta()}
        {renderSituacaoPosto()}
        {renderFotos()}
        {renderProdutos()}
        {renderRecursos()}
        {renderReceitasDespesas()}
      </div>
    </section>
  );
}
