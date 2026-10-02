'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { useAnaliseMode } from '@/components/franquia/analise-mode';
import type { BlocoFranquia } from '@/lib/franquia/ajuste';

export { FieldLabel } from '@/components/ui/field-label';

/**
 * Shared primitives for the `03-proposta-franquia` screen.
 *
 * These map the prototype's CSS classes onto design-system tokens once, so the
 * section components never carry raw hexes or ad-hoc font sizes (ADR-0018):
 *
 *   .block  → {@link Block}          .dgrid  → {@link DGrid} / {@link DField}
 *   label.f → {@link FieldLabel}     .alert  → {@link Alert}
 *   .subh   → {@link SubHeading}     .subbox → {@link SubBox}
 *
 * Breakpoint note: the prototype collapses the two-column layout at
 * `max-width:920px`, so the screen uses `min-[921px]:` — never `lg:`/`md:`,
 * which would shift the collapse point.
 */

// ---------------------------------------------------------------------------
// Buttons (.btn / .btn-primary / .btn-ghost)
// ---------------------------------------------------------------------------

/**
 * Prototype `.btn:disabled` — solid grey fill (`#f4f5f5` → `--neutral-40`),
 * muted text (`#767676` → `--neutral-500`) and no border, for EVERY variant.
 * Never `opacity-*`: a washed-out green still reads as an actionable CTA.
 */
export const BTN_DISABLED =
  'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-(--neutral-40) disabled:text-(--neutral-500)';

/**
 * Prototype `.btn.btn-primary` — `radius-xxs`, `padding 9px 16px`,
 * `font-size: --t-caption`, hover darkens to `--secondary-600` (#3c781e in the
 * prototype maps to that token). Same recipe the garantia screen uses, so the
 * two screens render identical CTAs.
 */
export const BTN_PRIMARY = `inline-flex items-center justify-center gap-2 rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-4 py-2.25 text-(length:--t-caption) font-bold text-white transition hover:bg-(--secondary-600) ${BTN_DISABLED}`;

/**
 * Prototype `.btn.btn-ghost` — `background:#f9f9f9` (`--neutral-25`),
 * text/border `#418020` (`--secondary-500`), hover `#eee` (`--neutral-50`).
 */
export const BTN_GHOST = `inline-flex items-center justify-center gap-2 rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2.25 text-(length:--t-caption) font-bold text-(--secondary-500) transition hover:bg-(--neutral-50) ${BTN_DISABLED}`;

// ---------------------------------------------------------------------------
// Block (.block)
// ---------------------------------------------------------------------------

export function Block({
  title,
  bloco,
  headerExtra,
  collapsible = false,
  children,
}: {
  title: string;
  /**
   * Identifies this card in the `BlocoAjuste` vocabulary. Required for the
   * analyst affordances (collapse + "Solicitar ajuste"); a block without one
   * simply never offers them (FRQ-14).
   */
  bloco?: BlocoFranquia;
  /** Rendered at the right edge of the h3 — tags, per-block actions. */
  headerExtra?: ReactNode;
  /**
   * Offers the chevron even outside analysis mode — the prototype's
   * `initCollapse()`, which runs on the **creation** screen (`03-proposta-
   * franquia.html`, no `?modo=analise`). Opt-in per card rather than global:
   * which cards collapse is a design decision the prototype makes explicitly.
   */
  collapsible?: boolean;
  children: ReactNode;
}) {
  const analise = useAnaliseMode();
  const [collapsed, setCollapsed] = useState(false);

  const emAnalise = analise !== null && bloco !== undefined;
  const jaSolicitado = emAnalise && analise.blocosSolicitados.has(bloco);
  const soRecolher = !emAnalise && collapsible;

  return (
    <section className="mb-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]">
      <div className={`flex items-center gap-2.5 ${collapsed ? '' : 'mb-4'}`}>
        <h3 className="text-(length:--t-h4) font-bold">{title}</h3>

        {jaSolicitado && (
          <span
            className="rounded-[var(--radius-xxs)] border border-(--yellow-300) bg-(--yellow-100) px-2 py-0.5 text-[12px] font-bold text-(--yellow-700)"
            data-testid={`ajuste-solicitado-${bloco}`}
          >
            ajuste solicitado
          </span>
        )}

        {headerExtra}

        {emAnalise && (
          <button
            type="button"
            onClick={() => analise.onSolicitarAjuste(bloco)}
            className={`${BTN_GHOST} ml-auto whitespace-nowrap`}
            data-testid={`solicitar-ajuste-${bloco}`}
          >
            Solicitar ajuste
          </button>
        )}

        {(emAnalise || soRecolher) && (
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expandir ${title}` : `Recolher ${title}`}
            className={`shrink-0 p-0.5 text-(--color-text-muted) hover:text-(--secondary-500)${soRecolher ? ' ml-auto' : ''}`}
            data-testid={bloco === undefined ? undefined : `recolher-${bloco}`}
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{
                transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                transition: 'transform 200ms',
              }}
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
      {!collapsed && children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Read-only data grid (.dgrid / .dgrid .l / .dgrid .v)
// ---------------------------------------------------------------------------

export function DGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-7 gap-y-3 min-[921px]:grid-cols-2">
      {children}
    </div>
  );
}

/**
 * One read-only cell.
 *
 * `value` of `null`/`undefined` renders an em dash: an absent field is shown as
 * absent, never as a fabricated default (CLAUDE.md §"Mock no front nunca").
 */
export function DField({
  label,
  value,
  full = false,
  testId,
}: {
  label: string;
  value: ReactNode;
  /** Spans both columns — used for totals in the prototype. */
  full?: boolean;
  testId?: string;
}) {
  return (
    <div className={full ? 'min-[921px]:col-span-2' : undefined} data-testid={testId}>
      <div className="text-[14px] uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="text-(length:--t-caption) font-bold">
        {value === null || value === undefined || value === '' ? '—' : value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form grid + labels (.fgrid.c2 / .fgrid.c3 / label.f)
// ---------------------------------------------------------------------------

export function FGrid({
  cols = 2,
  className,
  children,
}: {
  cols?: 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  const colClass =
    cols === 3 ? 'min-[921px]:grid-cols-3' : 'min-[921px]:grid-cols-2';
  return (
    <div
      className={`grid grid-cols-1 gap-x-5 gap-y-3.5 ${colClass}${className ? ` ${className}` : ''}`}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs (input.in / select.in)
// ---------------------------------------------------------------------------

/**
 * Prototype `.in`.
 *
 * ⚠️ The recipe is the one in `vibra-ui.css`, NOT the `input.in,select.in` rule
 * inside `03-proposta-franquia.html`. The stylesheet declares every property
 * with `!important`, so it wins: the fields are a `--neutral-40` fill with NO
 * border except a 2px `--neutral-600` bottom one, and square corners. Reading
 * only the page's inline rule produced the full rounded box this used to render.
 *
 * Same recipe the DS `Select` ships as its `bottom-border` variant — which is
 * why franchise selects must not pass `variant="boxed"`, or a select and the
 * input beside it render as two different controls.
 */
const CONTROL_CLASS =
  'h-11 w-full rounded-none border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) px-3 py-[11px] font-[inherit] text-(length:--t-caption) leading-[1.5] text-(--neutral-800) transition-[border-color] duration-150 placeholder:text-(--neutral-500) focus:border-(--secondary-500) focus:outline-none disabled:cursor-not-allowed disabled:border-(--neutral-200) disabled:bg-(--disabled-bg) disabled:text-(--disabled-text)';

export function controlClass(extra?: string): string {
  return extra ? `${CONTROL_CLASS} ${extra}` : CONTROL_CLASS;
}

// ---------------------------------------------------------------------------
// Alerts (.alert.info / .warn / .ok / .bad)
// ---------------------------------------------------------------------------

export type AlertTone = 'info' | 'warn' | 'ok' | 'bad';

const ALERT_CLASS: Record<AlertTone, string> = {
  info: 'bg-(--blue-100) text-(--blue-800) border-(--blue-200)',
  // Single "Exceção/Atenção" colour across the SNEG/franquia screens (ADR-0018).
  warn: 'bg-(--yellow-100) text-(--yellow-700) border-(--yellow-300)',
  ok: 'bg-(--secondary-100) text-(--secondary-700) border-(--secondary-200)',
  bad: 'bg-(--red-100) text-(--red-700) border-(--red-300)',
};

/**
 * Prototype `.alert` — `display:flex; gap:8px; align-items:flex-start`.
 *
 * The flex box is the BOX, and the message is ONE flex item. The prototype's
 * alerts hold a single text node, so its own `display:flex` never splits
 * anything; ours take JSX, and an inline `<b>` inside a flex container became a
 * sibling column — "A COF só se aplica a loja | Nova | (RN-F5-01)…" rendered as
 * three stacked columns. Wrapping the message keeps the flow inline while the
 * box stays available for a leading icon.
 */
export function Alert({
  tone,
  children,
  testId,
}: {
  tone: AlertTone;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`mt-3 flex items-start gap-2 rounded-[var(--radius-xs)] border px-3 py-2.5 text-[14px] ${ALERT_CLASS[tone]}`}
    >
      <span className="min-w-0">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-sections (.subh / .subbox)
// ---------------------------------------------------------------------------

export function SubHeading({
  children,
  extra,
}: {
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-2.5 mt-5 flex flex-wrap items-center gap-2.5 text-[14px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)">
      {children}
      {extra}
    </div>
  );
}

export function SubBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-xs)] border border-(--color-border) bg-(--neutral-25) px-4 py-3.5">
      {children}
    </div>
  );
}

/**
 * Prototype `.lockchip` — the "read-only for your profile" marker.
 *
 * Rendered from the read model's `editavelPorFranquia` verdict, never from a
 * role comparison in the component (RN-F2-06).
 */
export function LockChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-(--yellow-300) bg-(--yellow-100) px-2.5 py-0.5 text-[12px] font-bold normal-case tracking-normal text-(--yellow-700)">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section degradation
// ---------------------------------------------------------------------------

/**
 * Rendered when a section arrives `status: "unavailable"`.
 *
 * Names the failure instead of showing an empty card: an empty card is an
 * assertion of "nothing here", which is exactly the lie the read model's
 * SectionResult exists to prevent.
 */
export function SectionUnavailable({
  message,
  testId,
}: {
  message?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-[14px] text-(--yellow-700)"
    >
      {message ?? 'Informação temporariamente indisponível. Tente recarregar a página.'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal, empty state, add-row and file drop (.modal / .empty-state / .addrow /
// .updrop)
// ---------------------------------------------------------------------------

/*
 * Estas quatro primitivas nasceram privadas na TELA DE CRIAÇÃO e vivem aqui
 * desde que a tela da PROPOSTA passou a usar o mesmo modelo do protótipo —
 * grade somente-leitura + "+ Cadastrar/Editar …" abrindo um modal — em vez dos
 * formulários inline com que ela foi construída (FRQ-11..14, 02/08/2026).
 *
 * Uma cópia por tela é exatamente o que fez as duas divergirem: o usuário
 * cadastrava a franquia num modelo e reabria a proposta em outro. Com um
 * componente só, as duas telas não têm como discordar.
 */

export function Modal({
  title,
  onCancel,
  onSubmit,
  /*
   * "Salvar", não o "Concluir" do protótipo: com o autosave o botão GRAVA o
   * bloco na hora, e a UAT de 25/08/2026 pediu que "Concluir" deixasse de
   * existir. Um rótulo que promete concluir algo depois de a proposta já estar
   * salva descreveria a tela anterior. Vale para as duas telas: na proposta já
   * criada o modal também grava o bloco na hora.
   */
  submitLabel = 'Salvar',
  submitDisabled = false,
  error,
  errorTestId,
  children,
  testId,
}: {
  title: string;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  /**
   * When set, renders an error `Alert` inside the form, above the action row —
   * keeps the message visible even while the overlay is open (z-index: 400).
   */
  error?: string | null;
  /** `data-testid` for the error alert — lets tests assert the message. */
  errorTestId?: string;
  children: ReactNode;
  testId?: string;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/45 p-5"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className="relative max-h-[90vh] w-full max-w-[560px] overflow-auto rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={onCancel}
          /* 22px is the prototype's close glyph — one of the two typography
             exceptions allowed by ADR-0018. */
          className="absolute right-3.5 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none text-(--color-text-muted) hover:bg-(--neutral-40)"
        >
          ×
        </button>

        <h3 className="mb-4 text-(length:--t-h4) font-bold">{title}</h3>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!submitDisabled) onSubmit();
          }}
        >
          {children}

          {error != null && (
            <Alert tone="bad" testId={errorTestId}>{error}</Alert>
          )}

          <div className="mt-5 flex justify-end gap-2.5">
            <button type="button" onClick={onCancel} className={BTN_GHOST}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className={BTN_PRIMARY}
              data-testid={testId === undefined ? undefined : `${testId}-salvar`}
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Prototype `.empty-state` / `.exc-empty`. */
export function EmptyState({
  children,
  testId,
}: {
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) bg-(--neutral-25) px-5 py-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
    >
      {children}
    </div>
  );
}

/** Prototype `.addrow` — the "+ Cadastrar…" button under each empty card. */
export function AddRowButton({
  onClick,
  children,
  disabled = false,
  title,
  testId,
}: {
  onClick: () => void;
  children: ReactNode;
  /**
   * Renders the button but refuses the click — used where the prototype always
   * shows the affordance and the API restricts it by profile. The card heading
   * carries the `LockChip` that says whose it is; `title` repeats it on hover.
   */
  disabled?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      /* Prototype `.btn:disabled` — solid grey, muted text, no border. Never
         `opacity-*`: a washed-out green still reads as actionable. */
      className={`mt-3 rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2.25 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-50) ${BTN_DISABLED}`}
    >
      {children}
    </button>
  );
}

/** Prototype `.updrop` / `.phdrop`. */
export function FileDrop({
  id,
  accept,
  multiple = false,
  label,
  sublabel,
  onFiles,
}: {
  id: string;
  accept: string;
  multiple?: boolean;
  label: string;
  sublabel?: string;
  onFiles: (files: File[]) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="block cursor-pointer rounded-[var(--radius-md)] border-2 border-dashed border-(--color-border-strong) bg-(--color-surface) p-4 text-center hover:border-(--secondary-500)"
    >
      <span className="block text-(length:--t-caption) font-bold">{label}</span>
      {sublabel !== undefined && (
        <span className="mt-1 block text-[14px] text-(--color-text-muted)">
          {sublabel}
        </span>
      )}
      <input
        id={id}
        data-testid={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Painel lateral (aside.panel) — "Indicadores desta proposta"
// ---------------------------------------------------------------------------

/**
 * A segunda coluna do `.layout` do protótipo (`1fr 340px`), montada pelas DUAS
 * telas de franquia.
 *
 * ## Duas linhas, não quatro
 *
 * O protótipo tem quatro (`Tipo`, `Royalties (a.a.)`, `TIR da proposta`, `VPL da
 * proposta`) e um "↻ Recalcular / Simular (ARP)". **TIR e VPL por proposta de
 * franquia deixaram de existir na VBR-570**: o royalty virou insumo do cálculo
 * CONSOLIDADO da oportunidade, e o endpoint de recálculo por franquia foi
 * removido junto. Reintroduzir as duas linhas aqui prometeria um número que
 * nenhum backend calcula, e o CTA acionaria uma rota que não existe.
 *
 * ⚠️ Foi a remoção daquele painel que deixou a tela da proposta com uma faixa
 * morta de 340px por uma semana: a grade de duas colunas ficou para trás sem o
 * seu único filho. `franquia-layout-columns.test.ts` prende os dois juntos.
 */
export function IndicadoresFranquiaPanel({
  bandeiraLabel,
  royaltyAnualBrl = null,
  indisponivel = false,
}: {
  bandeiraLabel: string;
  /**
   * `null` ⇒ ainda não há cálculo e a linha fica em travessão.
   *
   * ⚠️ Na tela de CRIAÇÃO isso deixou de ser permanente (ADO 67868): o
   * autosave cria a proposta no primeiro bloco salvo, e daí em diante ela
   * também lê o `royaltiesCalculados` do read model. `null` ali significa "nada
   * gravado ainda", que é resposta correta — não "não carregou".
   */
  royaltyAnualBrl?: string | null;
  /**
   * A seção de royalties FALHOU. Distinto de `null`: "não deu para ler" não é
   * "ainda não calculado", e um travessão faria os dois lerem igual.
   */
  indisponivel?: boolean;
}) {
  return (
    <aside className="flex flex-col gap-3.5 min-[921px]:sticky min-[921px]:top-4">
      <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
        <h2 className="mb-2.5 text-(length:--t-caption) font-bold">
          Indicadores desta proposta
        </h2>
        <PanelRow label="Tipo" value={`Franquia ${bandeiraLabel}`} />
        <PanelRow
          label="Royalties (a.a.)"
          value={royaltyAnualBrl}
          testId="painel-royalties"
        />
        {indisponivel && (
          <p
            className="mt-2 text-[12px] text-(--color-text-muted)"
            data-testid="painel-royalties-indisponivel"
          >
            Cálculo de royalties indisponível.
          </p>
        )}
      </div>
    </aside>
  );
}

function PanelRow({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | null;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-t border-(--color-border) py-2.25 text-(length:--t-caption) first:border-t-0">
      <span className="text-(--color-text-muted)">{label}</span>
      <span className="text-right font-bold" data-testid={testId}>
        {value ?? '—'}
      </span>
    </div>
  );
}

