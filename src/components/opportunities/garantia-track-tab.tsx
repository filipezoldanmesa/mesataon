'use client';

import { useState } from 'react';

import { ShieldIcon } from '@/components/icons';
import type { GarantiaPasso, GarantiaTrackResult } from '@/lib/garantia/garantia-track.types';
import { trackStepDisplayState } from '@/lib/opportunities/track-step-state';
import { OpportunityPhaseStepper } from './opportunity-phase-stepper';
import {
  TRACK_LABEL_MAX_PX,
  TRACK_SCROLLER_CLASS,
  TRACK_STEP_MIN_PX,
  TRACK_STRIP_MIN_PX,
  TrackConnector,
  TrackScrollButton,
  useTrackScroll,
} from './track-strip';

export type { GarantiaPasso, GarantiaTrackResult };
export type { GarantiaPassoEstado } from '@/lib/garantia/garantia-track.types';

/** Load state for the garantia track data (mirrors the "ItemStatus" pattern). */
export type GarantiaLoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; data: GarantiaTrackResult };

// ---------------------------------------------------------------------------
// Garantia 5-step stepper
// ---------------------------------------------------------------------------

/**
 * Check SVG used inside a completed step circle.
 * stroke="#fff" on the completed (green) background — spec: stroke-width 2.
 */
const GARANTIA_CHECK = (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path
      d="M3 8L6.5 11.5L13 5"
      stroke="white"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

/**
 * Glyph for a step that STOPPED without concluding.
 *
 * A bar, not a cross: the same closure covers the benign RN-F0-06 case (the
 * concession simply stopped requiring the survey), and a cross would report a
 * failure there. It reads as "closed", the check reads as "concluded", and the
 * number reads as "still ahead" — three distinct facts, three distinct marks.
 *
 * `currentColor` so it inherits the neutral circle colour instead of pinning a
 * value the token set does not own.
 */
const GARANTIA_ENCERRADO = (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path
      d="M4 8H12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
    />
  </svg>
);

/** 2px connector between steps — green when the preceding step is done. */
// The connector moved to `track-strip` (`TrackConnector`): it is drawn inside
// the step, under the circle, exactly as the prototype's `.step::before`.

/**
 * Five-step stepper for the Garantia track.
 *
 * States come directly from the backend (`done` / `active` / `pending`) — the
 * frontend never derives them from a step index or a business state name.
 *
 * When `secaoIndisponivel` is set on a passo the step is shown as `pending`
 * (correct — it cannot be `active` if the data source is down) and a small
 * "Indisponível" note appears below the step label to explain the gap.
 */
function GarantiaTrackStepper({
  passos,
  ultimoDegrauEncerra = true,
}: {
  passos: GarantiaPasso[];
  /** Ver o mesmo parâmetro em `Oj2Stepper` (`opportunity-flow-tabs.tsx`). */
  ultimoDegrauEncerra?: boolean;
}) {
  /*
   * Horizontal scroll with the prototype's gnav controls
   * (`01c-oportunidade-analise.html:168-178`, `gScroll`/`gScrollUpd`). Ten steps
   * do not fit; before this they were squeezed into the row and the labels were
   * clipped to two lines. Measurements and the control itself live in
   * `track-strip`, so this strip and the one on the opportunity screen cannot
   * drift apart.
   */
  const { ref, scrollBy, atStart, atEnd } = useTrackScroll();

  return (
    <nav aria-label="Trilha Garantia" className="mt-4 flex w-full items-center gap-2.5">
      <TrackScrollButton direction={-1} onClick={() => scrollBy(-1)} disabled={atStart} />
      <div ref={ref} data-testid="garantia-track-scroller" className={TRACK_SCROLLER_CLASS}>
      <ol className="flex list-none items-start p-0" style={{ minWidth: TRACK_STRIP_MIN_PX }}>
        {passos.map((passo, idx) => {
          /* Último degrau alcançado ⇒ check verde (`trackStepDisplayState`). */
          const estado = trackStepDisplayState(
            passo.estado,
            ultimoDegrauEncerra && idx === passos.length - 1,
          );
          const isDone = estado === 'done';
          const isActive = estado === 'active';
          /*
           * Stopped without concluding. Neutral by design: the same closure
           * covers the benign RN-F0-06 case, so the styling must not accuse and
           * the WORDS carry the difference (`detalhe`).
           */
          const isEncerrado = passo.encerrado === true && !isDone && !isActive;

          return (
            <li
              key={passo.ordem}
              aria-current={isActive ? 'step' : undefined}
              className="relative flex flex-1 flex-col items-center gap-1"
              style={{ minWidth: TRACK_STEP_MIN_PX }}
            >
              {/* Runs from the previous circle's centre to this one, under the
                  circle (prototype `.step::before`). */}
              {idx > 0 && <TrackConnector reached={isDone || isActive} topPx={16} />}
              <div className="flex w-full flex-col items-center gap-1">
                <span
                  aria-hidden="true"
                  className={`relative z-[1] flex h-8 w-8 items-center justify-center rounded-full border-2 text-(length:--t-caption) font-bold tracking-[0.4px] ${
                    isDone
                      ? 'border-(--secondary-500) bg-(--secondary-500) text-white'
                      : isActive
                        ? 'border-(--secondary-500) bg-white text-(--secondary-500)'
                        : 'border-(--neutral-200) bg-white text-(--neutral-500)'
                  }`}
                >
                  {isDone ? GARANTIA_CHECK : isEncerrado ? GARANTIA_ENCERRADO : passo.ordem}
                </span>
                {/* The `gresp` line of the prototype — who owns this step. */}
                {passo.responsavel !== null && (
                  <span className="text-[10px] uppercase tracking-[0.4px] text-(--color-text-muted)">
                    {passo.responsavel}
                  </span>
                )}
                <span
                  style={{ maxWidth: TRACK_LABEL_MAX_PX }}
                  className={`text-center text-(length:--t-small) leading-[1.37] tracking-[0.4px] ${
                    isActive
                      ? 'font-bold text-(--neutral-800)'
                      : isDone
                        ? 'text-(--secondary-500)'
                        : 'text-(--neutral-500)'
                  }`}
                >
                  {passo.label}
                </span>
                {/*
                 * Section unavailable indicator — "Concluído" shows this when the
                 * contracts module is down. The step is pending (not active) so
                 * the trilha never lies about where the process is (RN-F6-01).
                 */}
                {passo.secaoIndisponivel && (
                  <span
                    data-testid="garantia-step-unavailable"
                    className="text-[10px] text-(--color-text-muted)"
                  >
                    Indisponível
                  </span>
                )}
                {/*
                 * No entity in the domain records this step, so it can never
                 * advance. Saying so is the point: the strip shows the real
                 * shape of the process without the step reading as tracked.
                 */}
                {passo.semFonte && (
                  <span
                    data-testid="garantia-step-sem-fonte"
                    className="text-[10px] text-(--color-text-muted)"
                  >
                    Fora do sistema
                  </span>
                )}
                {/*
                 * The step ran and stopped. Saying only "Encerrada" would leave
                 * the two closures indistinguishable, so the backend-composed
                 * reason goes right under it — verbatim (ADR-0018).
                 */}
                {isEncerrado && (
                  <span
                    data-testid="garantia-step-encerrado"
                    className="text-[10px] text-(--color-text-muted)"
                  >
                    Encerrada
                  </span>
                )}
                {/* ⚠️ NÃO condicionado a `isEncerrado`: o mesmo slot carrega o
                    RESULTADO de um passo concluído ("Risco altíssimo"), que é
                    verde e não parou (ADO 67880). Mesma correção aplicada ao
                    `opportunity-flow-tabs`, que é o strip vivo — este componente
                    não tem consumidor de produção, e a paridade existe para os
                    dois não divergirem se alguém o reanimar. */}
                {passo.detalhe !== undefined && (
                  <span
                    style={{ maxWidth: TRACK_LABEL_MAX_PX }}
                    className="text-center text-[10px] leading-[1.3] text-(--color-text-muted)"
                  >
                    {passo.detalhe}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      </div>
      <TrackScrollButton direction={1} onClick={() => scrollBy(1)} disabled={atEnd} />
    </nav>
  );
}

// The local scroll control moved to `track-strip` (`TrackScrollButton`), so
// this strip and the opportunity screen's share the prototype's `.gnav-btn`
// look and the edge-disabled state.

// ---------------------------------------------------------------------------
// Track selector (oj2-tabs + lane accordion)
// ---------------------------------------------------------------------------

type ActiveTrack = 'principal' | 'garantia';

/**
 * Analysis-phase track selector (`.oj2-tabs` — prototype
 * `01c-oportunidade-analise.html:250-292`).
 *
 * Renders two tabs: **Fluxo Principal** (the 7-step opportunity stepper,
 * active by default) and **Garantia** (the 10-step garantia strip — 2 steps
 * when there is no análise prévia, `abaSemPrevia` —, driven
 * by the read model — labels and responsible parties included). The Obra tab depends on the Converge integration and
 * is out of scope for this ticket.
 *
 * Behaviour when `abaDesabilitada`:
 *   - The Garantia tab stays visible and becomes `disabled` with
 *     `title="Sem garantia nesta oportunidade"`.
 *   - The sub-label shows "Não se aplica" (delivered by the backend).
 *   - "Aba desabilitada ≠ aba ausente": visibility communicates that the
 *     opportunity exists but has no garantia rather than hiding the fact.
 *
 * The lane accordion below the tabs can be collapsed via the chevron button.
 */
export function AnaliseTrackSelector({
  backendState,
  garantia,
}: {
  /** Backend workflow state for the principal-track stepper. */
  backendState: string;
  /** Pre-resolved garantia track data (loading / error / loaded). */
  garantia: GarantiaLoadState;
}) {
  const [activeTrack, setActiveTrack] = useState<ActiveTrack>('principal');
  const [laneOpen, setLaneOpen] = useState(true);

  // Garantia tab is disabled only when abaDesabilitada; loading/error keeps it
  // enabled so the user can switch to it and see the respective state.
  // `abaDesabilitada`/`abaSubLabel` — o recorte próprio da aba (24/09/2026),
  // o mesmo que `OpportunityFlowTabs` lê.
  const garantiaDisabled =
    garantia.status === 'loaded' && garantia.data.abaDesabilitada;

  const garantiaSubLabel: string = (() => {
    if (garantia.status === 'loaded') return garantia.data.abaSubLabel;
    if (garantia.status === 'error') return 'Indisponível';
    return '…';
  })();

  function handleGarantiaClick() {
    if (!garantiaDisabled) setActiveTrack('garantia');
  }

  // When the garantia tab becomes disabled (abaDesabilitada arrived after
  // the user had already switched to it), snap back to principal.
  const effectiveTrack: ActiveTrack =
    garantiaDisabled && activeTrack === 'garantia' ? 'principal' : activeTrack;

  return (
    <div className="mt-4">
      {/* ── Tab row (.oj2-tabs) ──────────────────────────────────────────── */}
      <div
        className="flex gap-1 border-b border-(--color-border)"
        role="tablist"
        aria-label="Trilhas da oportunidade"
      >
        {/* Fluxo Principal tab */}
        <button
          type="button"
          role="tab"
          aria-selected={effectiveTrack === 'principal'}
          aria-controls="analise-lane-panel"
          data-track="principal"
          onClick={() => setActiveTrack('principal')}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-(length:--t-caption) font-bold transition-colors min-[961px]:px-4 ${
            effectiveTrack === 'principal'
              ? 'border-(--secondary-500) text-(--secondary-600)'
              : 'border-transparent text-(--color-text-muted) hover:text-(--neutral-800)'
          }`}
        >
          {/* Flow/home icon — 1em box, currentColor */}
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="inline-block size-[1em] shrink-0"
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span className="flex flex-col items-start">
            <span>Fluxo Principal</span>
            <span className="text-[11px] font-normal">Em análise</span>
          </span>
        </button>

        {/* Garantia tab */}
        <button
          type="button"
          role="tab"
          aria-selected={effectiveTrack === 'garantia'}
          aria-controls="analise-lane-panel"
          data-track="garantia"
          onClick={handleGarantiaClick}
          disabled={garantiaDisabled}
          title={garantiaDisabled ? 'Sem garantia nesta oportunidade' : undefined}
          className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-(length:--t-caption) font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 min-[961px]:px-4 ${
            effectiveTrack === 'garantia'
              ? 'border-(--secondary-500) text-(--secondary-600)'
              : 'border-transparent text-(--color-text-muted) enabled:hover:text-(--neutral-800)'
          }`}
        >
          <ShieldIcon className="shrink-0" />
          <span className="flex flex-col items-start">
            <span>Garantia</span>
            <span className="text-[11px] font-normal">{garantiaSubLabel}</span>
          </span>
        </button>
      </div>

      {/*
       * ── Lane accordion (.oj-acc.lane-acc) ──────────────────────────────
       * border-left: 3px solid var(--secondary-500) /* #418020 *\/
       * collapsible via .oj-chev chevron (transition transform .2s).
       */}
      <div
        className="mt-2 border-l-[3px] pl-3"
        style={{ borderLeftColor: 'var(--secondary-500)' /* --secondary-500 */ }}
      >
        {/* Lane header + chevron */}
        <div className="flex items-center justify-between">
          <span className="text-(length:--t-caption) font-bold text-(--color-text-muted)">
            {effectiveTrack === 'principal' ? 'Fluxo Principal' : 'Garantia'}
          </span>
          <button
            type="button"
            aria-label={laneOpen ? 'Recolher trilha' : 'Expandir trilha'}
            aria-expanded={laneOpen}
            onClick={() => setLaneOpen((o) => !o)}
            className="p-1 text-(--color-text-muted) hover:text-(--neutral-800)"
          >
            {/* .oj-chev — rotate(-90deg) when collapsed */}
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                transition: 'transform 0.2s',
                transform: laneOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            >
              ▾
            </span>
          </button>
        </div>

        {/* Lane content — hidden when collapsed; kept in DOM so aria-controls remains valid */}
        <div id="analise-lane-panel" role="tabpanel" hidden={!laneOpen}>
          {effectiveTrack === 'principal' && (
            <OpportunityPhaseStepper backendState={backendState} />
          )}

          {effectiveTrack === 'garantia' && (
            <>
              {garantia.status === 'loading' && (
                <div
                  data-testid="garantia-track-loading"
                  className="mt-4 h-12 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)"
                />
              )}
              {garantia.status === 'error' && (
                <p
                  data-testid="garantia-track-error"
                  className="mt-4 text-(length:--t-caption) text-(--color-danger)"
                >
                  Não foi possível carregar a trilha de garantia.
                </p>
              )}
              {garantia.status === 'loaded' && (
                <GarantiaTrackStepper
                  passos={garantia.data.passos}
                  ultimoDegrauEncerra={!garantia.data.abaSemPrevia}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
