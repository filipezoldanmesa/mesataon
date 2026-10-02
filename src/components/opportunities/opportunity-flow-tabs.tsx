'use client';

import { useEffect, useState } from 'react';

import { ShieldIcon } from '@/components/icons';
import { getGarantiaTrack as defaultLoadGarantiaTrack } from '@/lib/garantia/garantia.data';
import { GarantiaForbiddenError } from '@/lib/garantia/garantia.api';
import type { GarantiaTrackResult } from '@/lib/garantia/garantia-track.types';
import { getObraTrilha as defaultLoadObraTrack } from '@/lib/obras/obras.data';
import type { ObraTrilha } from '@/lib/obras/obra-trilha-mapping';
import { getBloqueioAvanco as defaultLoadBloqueioAvanco } from '@/lib/pendencias/bloqueio-avanco.api';
import type { BloqueioAvanco } from '@/lib/pendencias/bloqueio-avanco.api';
import { trackStepDisplayState } from '@/lib/opportunities/track-step-state';
import type { OpportunityStatus } from '@/lib/opportunities/types';
import {
  OPPORTUNITY_PHASE_STEPS,
  OPPORTUNITY_PHASE_STATE_LABELS,
  opportunityPhaseIndex,
} from './opportunity-phase-stepper';
import {
  TRACK_LABEL_MAX_CLASS,
  TRACK_SCROLLER_CLASS,
  TRACK_STEP_MIN_CLASS,
  TRACK_STRIP_MIN_CLASS,
  TrackConnector,
  TrackScrollButton,
  TrackVerticalConnector,
  useTrackScroll,
} from './track-strip';

// ---------------------------------------------------------------------------
// Parallel-track stepper with tabs — mirrors the prototype `.oj2` component
// (01b-oportunidade-nova.html): three tabs (Fluxo Principal · Garantia · Obra),
// each showing its own step track. Only the selected track is visible.
//
// Data sourcing (no fabricated status):
//  - Principal: real — driven by `backendState`/`status`.
//  - Garantia:  real when the subprocess exists — the backend track read model
//               (`getGarantiaTrack`) pre-computes each step's done/active/pending
//               and the tab sub-label; "não se aplica" is a backend flag.
//  - Obra:      real since ADO 67921 — `getObraTrilha` returns the §6 ladder of
//               the Converge spec (`Integracao_Converge_GOP_v0.2`) with every
//               step state already resolved. ⚠️ The step COUNT depends on the
//               contracting model (6 · Sessão, 5 · Capex, 4 · common spine), so
//               nothing here assumes a fixed list.
//
// ⚠️ The Obra tab is disabled ONLY when the backend says there is no obra
// linked (`temObra: false`) — and then it reads "Não se aplica", exactly like
// the Garantia tab without a garantia (business request, 21/09/2026).
//
// This is NOT a return to the ADO 67921 defect. There the tab was gated on a
// `hasFinancialResources` prop the backend never sent, so it read
// "Obra · Não disponível" in every phase, for EVERY opportunity — including the
// ones that had an obra (measured on the UAT in 26/08/2026). Here the gate is a
// verdict the backend composes, and an opportunity with an obra opens normally.
//
// ⚠️ A FAILED read is never disabled: it says "Indisponível" and stays
// clickable, because "não deu para ler" and "não se aplica" have different
// fixes. Same line the VBR-539 drew for the ANP.
//
// Divergence from the prototype, deliberate: `01b`…`01g` show the tab enabled
// with "Aguardando ativação" (`01h` "Obra confirmada", `01i`/`01j` "Obra em
// andamento"). That wording promised an activation nobody owes next to a tab
// that no longer opens.
// ---------------------------------------------------------------------------

type Track = 'principal' | 'garantia' | 'obra';
type StepState = 'done' | 'active' | 'pending';
type Step = {
  label: string;
  gresp?: string;
  estado: StepState;
  unavailable?: boolean;
  /** No entity in the domain records this step — it can never leave `pending`. */
  semFonte?: boolean;
  /**
   * The step RAN and stopped without concluding (today: the credit-profile
   * survey was closed). `estado` stays `pending` — closing is not concluding —
   * so without this flag a closed step renders exactly like one that never
   * started, and the grey circle reads as "waiting on the CCOB" when nobody is
   * coming.
   *
   * ⚠️ Neutral, never a failure: the same closure covers the benign case where
   * the concession simply stopped requiring the survey. What separates the two
   * is {@link detalhe}, not the styling.
   */
  encerrado?: boolean;
  /** pt-BR reason it stopped, composed by the backend and rendered verbatim. */
  detalhe?: string;
  /**
   * Há pendência obrigatória aberta impedindo o avanço DESTE degrau
   * (21/09/2026) — presente só no degrau corrente, e só quando o veredito do
   * backend diz que trava.
   *
   * ⚠️ **`areas` pode vir VAZIA e o degrau continua marcado**: a pendência
   * existe e trava, mas não tem área nomeada nem token de caixa. O fato é do
   * backend; a lista é o complemento.
   */
  bloqueio?: { areas: string[] };
  /**
   * The step does not apply to this opportunity and the flow went (or is going)
   * straight past it — today only "Em pagamento" when the negotiation has no
   * Mútuo, Novo Mútuo or Concessão Financeira (22/09/2026). Backend verdict.
   *
   * ⚠️ Drawn neutral, never with the green check: a check would state that a
   * payment was released, which is exactly what did NOT happen.
   */
  pulado?: boolean;
};

/**
 * Index of the payment step in the principal track — the only step that can be
 * skipped. Resolved through the STATE label ("Em pagamento"), which is the
 * backend's `OPPORTUNITY_STATE_LABEL[EM_PAGAMENTO]`: the step label itself was
 * renamed on 23/09/2026 ("Em pagamento" → "Pagamento") and may be again.
 */
const PAGAMENTO_STEP_INDEX = OPPORTUNITY_PHASE_STATE_LABELS.indexOf('Em pagamento');

/** Why the payment step was skipped — rendered under the step. */
const PAGAMENTO_PULADO_DETALHE = 'Sem Mútuo, Novo Mútuo ou Concessão Financeira';

/**
 * A interrogação ao lado da pill da área (pedido do negócio, 21/09/2026).
 *
 * > *"devemos colocar uma interrogação ao lado do nome da área responsável
 * > indicando que existe uma pendência obrigatória naquela etapa. Ao passar o
 * > mouse em cima, devemos mostrar qual a área (ou as áreas) com pendências
 * > obrigatórias para aquela etapa."*
 *
 * ## Por que `<button>` e não um `<span title="…">`
 *
 * O `title` nativo só existe no hover do MOUSE: não abre por teclado, não abre
 * no toque e leitor de tela nenhum o anuncia de forma confiável. Aqui o gatilho
 * é focável e o balão é ligado por `aria-describedby`, então o mesmo texto
 * chega ao teclado (`focus`) e à leitura. É `type="button"` sem `onClick`: ele
 * não navega nem muta — o clique existe só para o toque abrir o balão.
 *
 * ⚠️ **O texto é do BACKEND.** Os rótulos de área chegam prontos
 * (`Integridade`, nunca `COMPLIANCE`), e a tela só os junta com `·`. Nada aqui
 * decide se há bloqueio — quem decide é `bloqueado`, do veredito do gate.
 *
 * ⚠️ **`role="tooltip"`, nunca `alert`**: o texto existe desde a primeira
 * renderização e não responde a ação nenhuma. Um live region a mais nesta
 * árvore colidiria com os `getByRole('alert')` das suítes vizinhas — a
 * armadilha que o CLAUDE.md registra.
 */
function BloqueioObrigatoriaMarca({
  areas,
  etapa,
}: {
  areas: string[];
  etapa: string;
}) {
  const [aberto, setAberto] = useState(false);
  const id = `bloqueio-${etapa.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  /*
   * Sem áreas nomeadas a frase NÃO inventa um balde ("Outra área"): ela afirma
   * só o que se sabe. É a mesma disciplina de "a ausência de um valor nunca
   * vira default plausível".
   */
  const texto =
    areas.length > 0
      ? `Pendências obrigatórias em aberto: ${areas.join(' · ')}`
      : 'Há pendência obrigatória em aberto impedindo o avanço.';

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        data-testid="etapa-bloqueio-obrigatoria"
        aria-describedby={aberto ? id : undefined}
        /*
         * O nome acessível diz o QUE é, não "ajuda": quem ouve o botão precisa
         * saber que ele reporta um bloqueio antes de decidir abri-lo.
         */
        aria-label={`Pendência obrigatória impede o avanço de ${etapa}`}
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onClick={() => setAberto((v) => !v)}
        className="flex size-[18px] items-center justify-center rounded-full border border-(--color-warning) bg-(--color-warning-bg) text-[11px] font-bold leading-none text-(--color-warning)"
      >
        ?
      </button>
      {aberto && (
        <span
          id={id}
          role="tooltip"
          data-testid="etapa-bloqueio-obrigatoria-tooltip"
          className="absolute bottom-[calc(100%+6px)] left-1/2 z-10 w-max max-w-[240px] -translate-x-1/2 rounded-[var(--radius-xxs)] bg-(--neutral-800) px-2.5 py-1.5 text-left text-[12px] leading-[1.35] font-normal text-white shadow-md"
        >
          {texto}
        </span>
      )}
    </span>
  );
}

/** Responsible role per principal phase (process design — prototype 01b). */
const PRINCIPAL_GRESP: readonly (string | undefined)[] = [
  'LT',
  'SNEG',
  'SNEG',
  'SNEG',
  'LT',
  // ⚠️ Era "SNEG / SPCOM" até 18/09/2026, quando o negócio encurtou a pill para
  // "SPCOM" — junto com o rótulo do passo, que virou "Ativação".
  'SPCOM',
  // "Em pagamento" — the payment release is the SPCOM's (glossary: "Excelência
  // Comercial (ativação e liberação de pagamento)"). Splitting it out of
  // "Ativação" is the point of the step (VBR-636): the two are
  // different owners and different waits.
  'SPCOM',
  undefined,
];

/*
 * The garantia track holds NO step list of its own: label, responsible party and
 * state all come from the backend read model (`TRILHA_GARANTIA_PASSOS` — the
 * prototype's 10 steps, ADR-0018 "a verdict is composed in the backend").
 *
 * There used to be a local 5-name array here whose index was paired with the
 * backend's `estado`. It failed twice over: the strip showed 5 of 10 steps, and
 * — worse — the states landed on the WRONG labels, since backend step 1 is
 * "Em preenchimento / LT" while the local list called index 0 "Análise de
 * perfil / CCOB". The screen reported the wrong step as active.
 */


type GarantiaLoad =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'forbidden' }
  | { status: 'loaded'; data: GarantiaTrackResult };

/*
 * A trilha de obra também não guarda lista de degraus própria: rótulo, ordem e
 * estado vêm do backend (`montarTrilhaObra`, §6). Uma cópia local seria a
 * segunda fonte de uma escada cujo TAMANHO muda com o modelo de contratação —
 * exatamente o defeito que a trilha de garantia já pagou uma vez, quando um
 * array de 5 nomes locais era zipado com os estados de 10 passos do backend.
 */
type ObraLoad =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; data: ObraTrilha };

// ── Icons (1em-ish, currentColor) ───────────────────────────────────────────

function FlowIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3v5h5M8.5 13h7M8.5 16.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ObraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 21h16M6 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M15 21V9h3a1 1 0 0 1 1 1v11M8.5 8h3M8.5 11.5h3M8.5 15h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const CHECK = (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path d="M3 8L6.5 11.5L13 5" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
  </svg>
);

/**
 * Glyph for a step that STOPPED without concluding.
 *
 * A bar, not a cross: the benign closure reaches here through the same flag, and
 * a cross would report a failure there. Bar reads "closed", check reads
 * "concluded", the number reads "still ahead".
 */
const CLOSED_BAR = (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <path d="M4 8H12" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
  </svg>
);

// ── Generic oj2 stepper ──────────────────────────────────────────────────────

/**
 * @param scrollable - Draws the prototype's `gnav`: a wider strip
 *   (`.gsteps` — 150px per step) inside a horizontal scroller with the ‹ ›
 *   controls. The full garantia track has 10 steps and never fits; the principal
 *   track has 7 and is laid out to the full width, as in the prototype. The
 *   garantia track WITHOUT análise prévia has 2 and is not scrollable.
 */
function Oj2Stepper({
  steps,
  label,
  scrollable = false,
  ultimoDegrauEncerra = true,
}: {
  steps: Step[];
  label: string;
  scrollable?: boolean;
  /**
   * O último degrau é o FIM do processo? Só então um `active` nele lê como
   * "alcançado" e é desenhado concluído (`trackStepDisplayState`). A trilha de
   * garantia sem análise prévia termina na análise de perfil — que não é o fim —
   * e ali `active` é levantamento em execução (24/09/2026).
   */
  ultimoDegrauEncerra?: boolean;
}) {
  const { ref, scrollBy, atStart, atEnd } = useTrackScroll();

  const list = (
    /*
     * `.oj2 .steps{flex-direction:column;align-items:stretch}` no mobile — a
     * trilha vira uma LISTA vertical em vez de uma faixa que rola de lado.
     */
    <ol
      className={`flex list-none items-start p-0 max-[640px]:flex-col max-[640px]:items-stretch ${
        scrollable ? TRACK_STRIP_MIN_CLASS : ''
      }`}
    >
        {steps.map((step, idx) => {
          /*
           * O ÚLTIMO degrau alcançado é desenhado como concluído — ver
           * `trackStepDisplayState`. O veredito do backend continua intacto: o
           * sub-rótulo da aba e a pill seguem lendo o `active`.
           */
          const estado = trackStepDisplayState(
            step.estado,
            ultimoDegrauEncerra && idx === steps.length - 1,
          );
          const isSkipped = step.pulado === true && estado !== 'active';
          const isDone = estado === 'done' && !isSkipped;
          const isActive = estado === 'active';
          // Ran and stopped. Neutral by design — the WORDS carry the difference.
          const isClosed = step.encerrado === true && !isDone && !isActive && !isSkipped;
          // The flow passed THROUGH a skipped step, so the rules around it are
          // green when the next step was reached — a grey gap would read as
          // "the flow stopped here".
          const passed = isDone || isSkipped;
          return (
            <li
              key={step.label}
              aria-current={isActive ? 'step' : undefined}
              /*
               * `.oj2 .step{padding-bottom:22px}` + `:last-child{padding-bottom:0}`
               * — é esse respiro que a linha vertical percorre (`bottom:0`).
               */
              className={`relative flex min-w-16 flex-1 flex-col items-center gap-2 max-[640px]:flex-none max-[640px]:pb-[22px] max-[640px]:last:pb-0 ${
                scrollable ? TRACK_STEP_MIN_CLASS : ''
              }`}
            >
              {/* Runs from the previous circle's centre to this one, under the
                  circle (prototype `.step::before`). */}
              {idx > 0 && <TrackConnector reached={passed || isActive} topPx={17} />}
              {/* A vertical do mobile sai DESTE passo para o de baixo. */}
              {idx < steps.length - 1 && <TrackVerticalConnector done={passed} />}
              {/*
                `.oj2 .step` no mobile: grid `34px 1fr` — círculo na coluna 1
                ocupando as linhas todas, pill e rótulo empilhados na coluna 2,
                tudo alinhado à esquerda.
              */}
              <div className="flex w-full flex-col items-center gap-2 max-[640px]:grid max-[640px]:grid-cols-[34px_1fr] max-[640px]:items-start max-[640px]:gap-x-3.5 max-[640px]:gap-y-1 max-[640px]:text-left">
                <span
                  aria-hidden="true"
                  // `.circ{grid-column:1;grid-row:1 / span 2}` — e `row-span-full`
                  // em vez de `span 2` porque o passo pode ter 3+ linhas
                  // (detalhe, "Encerrada"): o círculo acompanha a altura toda.
                  className={`relative z-[1] flex size-[34px] items-center justify-center rounded-full border-2 text-[13px] font-bold max-[640px]:col-start-1 max-[640px]:row-span-full max-[640px]:self-start ${
                    isDone
                      ? 'border-(--secondary-500) bg-(--secondary-500) text-white'
                      : isActive
                        ? 'border-(--secondary-500) bg-white text-(--secondary-500)'
                        : 'border-(--neutral-200) bg-white text-(--neutral-500)'
                  }`}
                >
                  {isDone ? CHECK : isClosed || isSkipped ? CLOSED_BAR : idx + 1}
                </span>
                {step.gresp && (
                  // `.gresp{grid-column:2;justify-self:start;text-align:left}` —
                  // o wrapper preserva a coluna do grid mobile, que antes era da
                  // própria pill; a interrogação entra AO LADO dela, dentro.
                  <span className="inline-flex items-center gap-1 max-[640px]:col-start-2 max-[640px]:justify-self-start">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                        isDone || isActive
                          ? 'border-(--secondary-200) bg-(--secondary-100) text-(--secondary-700)'
                          : 'border-(--color-border) bg-(--neutral-40) text-(--color-text-muted)'
                      }`}
                    >
                      {step.gresp}
                    </span>
                    {step.bloqueio && (
                      <BloqueioObrigatoriaMarca
                        areas={step.bloqueio.areas}
                        etapa={step.label}
                      />
                    )}
                  </span>
                )}
                <span
                  // `.nm{grid-column:2;text-align:left;max-width:none}` — o teto
                  // de largura existe para a coluna estreita da faixa
                  // horizontal; na lista vertical ele só quebraria o rótulo à
                  // toa, com a linha inteira livre ao lado.
                  className={`max-w-[104px] text-center text-[14px] leading-[1.35] max-[640px]:col-start-2 max-[640px]:max-w-none max-[640px]:text-left ${
                    scrollable ? TRACK_LABEL_MAX_CLASS : ''
                  } ${
                    isActive
                      ? 'font-bold text-(--neutral-800)'
                      : isDone
                        ? 'text-(--secondary-500)'
                        : 'text-(--neutral-500)'
                  }`}
                >
                  {step.label}
                </span>
                {/* As três marcas abaixo e o `detalhe` seguem o rótulo na coluna
                    2 do grid mobile — fora dela cairiam sob o círculo. */}
                {step.unavailable && (
                  <span className="text-[10px] text-(--color-text-muted) max-[640px]:col-start-2 max-[640px]:text-left">Indisponível</span>
                )}
                {/* Same wording as the garantia tab: nothing in the domain
                    records this step, so it can never leave `pending`. Saying
                    so beats a step that looks tracked and is not. */}
                {step.semFonte && !step.unavailable && (
                  <span className="text-[10px] text-(--color-text-muted) max-[640px]:col-start-2 max-[640px]:text-left">Fora do sistema</span>
                )}
                {/* Saying only "Encerrada" would leave the two closures
                    indistinguishable, so the backend-composed reason follows it
                    verbatim (ADR-0018). */}
                {isClosed && (
                  <span className="text-[10px] text-(--color-text-muted) max-[640px]:col-start-2 max-[640px]:text-left">Encerrada</span>
                )}
                {isSkipped && (
                  <span
                    data-testid="track-step-pulado"
                    className="text-[10px] text-(--color-text-muted) max-[640px]:col-start-2 max-[640px]:text-left"
                  >
                    Não se aplica
                  </span>
                )}
                {/* ⚠️ NÃO condicionado a `isClosed`: o mesmo slot carrega o
                    RESULTADO de um passo concluído ("Risco altíssimo"), que é
                    verde e não parou. Enquanto dependia da marca, o passo
                    ficava verde sem dizer o que concluiu — ADO 67880, "qual o
                    resultado da análise de perfil? precisa ser apresentado". */}
                {step.detalhe !== undefined && (
                  <span
                    data-testid="track-step-detalhe"
                    className={`max-w-[104px] text-center text-[10px] leading-[1.3] text-(--color-text-muted) max-[640px]:col-start-2 max-[640px]:max-w-none max-[640px]:text-left ${
                      scrollable ? TRACK_LABEL_MAX_CLASS : ''
                    }`}
                  >
                    {step.detalhe}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
  );

  if (!scrollable) {
    return (
      <nav aria-label={label} className="pt-3">
        {list}
      </nav>
    );
  }

  /*
   * `.oj2 .gnav` — control, scroller, control.
   *
   * No mobile o protótipo desliga a faixa inteira: `.gnav{display:block}`,
   * `.gnav-btn{display:none}`, `.hscroll{overflow:visible}`. Com a trilha em
   * coluna não há para onde rolar — e as setas ‹ › ficariam sendo controle
   * morto, sempre desabilitadas.
   */
  return (
    <nav aria-label={label} className="flex w-full items-center gap-2.5 pt-3 max-[640px]:block">
      <span className="contents max-[640px]:hidden">
        <TrackScrollButton direction={-1} onClick={() => scrollBy(-1)} disabled={atStart} />
      </span>
      <div
        ref={ref}
        data-testid="track-strip-scroller"
        className={`${TRACK_SCROLLER_CLASS} max-[640px]:overflow-x-visible max-[640px]:pb-0`}
      >
        {list}
      </div>
      <span className="contents max-[640px]:hidden">
        <TrackScrollButton direction={1} onClick={() => scrollBy(1)} disabled={atEnd} />
      </span>
    </nav>
  );
}

// ── Tab button ───────────────────────────────────────────────────────────────

function Oj2Tab({
  active,
  disabled,
  onClick,
  icon,
  name,
  sub,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  name: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:bg-(--neutral-25) disabled:opacity-55 max-[640px]:w-full ${
        active
          ? 'border-[1.5px] border-(--secondary-500) bg-(--secondary-100)'
          : 'border-(--color-border) bg-white enabled:hover:border-(--neutral-300)'
      }`}
    >
      <span className={`flex size-[22px] shrink-0 items-center justify-center ${active ? 'text-(--secondary-500)' : 'text-(--neutral-500)'}`}>
        {icon}
      </span>
      {/* `.oj2-tt{white-space:normal}` — na aba de largura inteira o sub-rótulo
          pode quebrar; mantê-lo `nowrap` é o que empurrava a aba para fora. */}
      <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap max-[640px]:whitespace-normal">
        <span className={`text-(length:--t-caption) font-bold ${active ? 'text-(--secondary-700)' : 'text-(--color-text)'}`}>
          {name}
        </span>
        <span className={`text-[13px] ${active ? 'text-(--secondary-600)' : 'text-(--color-text-muted)'}`}>{sub}</span>
      </span>
    </button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function OpportunityFlowTabs({
  backendState,
  status,
  etapa,
  loadGarantiaTrack = defaultLoadGarantiaTrack,
  loadObraTrack = defaultLoadObraTrack,
  loadBloqueioAvanco = defaultLoadBloqueioAvanco,
  opportunityId,
  refreshSignal = 0,
  pagamentoPulado = false,
}: {
  opportunityId: string;
  /**
   * The payment phase does not apply (no Mútuo, Novo Mútuo or Concessão
   * Financeira — 22/09/2026). Backend verdict (`pagamentoNaoSeAplica` of the
   * contract read model); only the contract view knows it.
   */
  pagamentoPulado?: boolean;
  backendState?: string;
  status?: OpportunityStatus;
  /**
   * Etapa do contrato, quando quem monta as abas a conhece (fase de contrato).
   *
   * ⚠️ É o ÚNICO jeito de separar "Cadastro / Ativação" de "Em pagamento": os
   * dois vivem sob o mesmo estado `EM_PAGAMENTO` da oportunidade, então só a
   * etapa diz em qual dos dois o fluxo está parado (VBR-636). Sem ela, uma
   * oportunidade em `PAGAMENTO` reportaria a fase anterior.
   */
  etapa?: string;
  /** Injectable for tests; defaults to the real BFF call. */
  loadGarantiaTrack?: (id: string) => Promise<GarantiaTrackResult>;
  /**
   * Injectable for tests; defaults to the real BFF call.
   *
   * ⚠️ Replaced the `hasFinancialResources` prop (ADO 67921). That flag was read
   * from a field the backend never emitted, so it was always `false` and the
   * Obra tab was permanently disabled — the bug this component's Obra track
   * exists to fix.
   */
  loadObraTrack?: (id: string) => Promise<ObraTrilha>;
  /**
   * Veredito do gate de pendência obrigatória (21/09/2026). Injetável nos
   * testes; o default é a chamada real à BFF.
   */
  loadBloqueioAvanco?: (id: string) => Promise<BloqueioAvanco>;
  /**
   * Bump to force re-loading the garantia track after a mutation
   * (e.g. a new garantia was registered in GarantiasIndicadasCard).
   * Counter — two mutations fire two refreshes even if batched.
   */
  refreshSignal?: number;
}) {
  const [track, setTrack] = useState<Track>('principal');
  const [garantia, setGarantia] = useState<GarantiaLoad>({ status: 'loading' });
  const [obra, setObra] = useState<ObraLoad>({ status: 'loading' });

  // Initial (full) load — shows the loading skeleton so the user always sees
  // fresh data on mount or when the opportunity changes.
  useEffect(() => {
    let active = true;
    setGarantia({ status: 'loading' });
    loadGarantiaTrack(opportunityId)
      .then((data) => active && setGarantia({ status: 'loaded', data }))
      .catch((err: unknown) => {
        if (!active) return;
        setGarantia({ status: err instanceof GarantiaForbiddenError ? 'forbidden' : 'error' });
      });
    return () => {
      active = false;
    };
  }, [opportunityId, loadGarantiaTrack]);

  // Quiet refresh — triggered by refreshSignal bumps (e.g. after a garantia
  // mutation in GarantiasIndicadasCard).  Does NOT set 'loading' first, so the
  // sub-label never flashes to '…' (CA-4 VBR-536).  Errors are swallowed
  // intentionally — stale data is better than a broken panel on a background
  // refresh.
  useEffect(() => {
    if (refreshSignal === 0) return; // skip initial mount — handled above
    let active = true;
    loadGarantiaTrack(opportunityId)
      .then((data) => { if (active) setGarantia({ status: 'loaded', data }); })
      .catch(() => { /* keep stale data visible on quiet-refresh failure */ });
    return () => {
      active = false;
    };
  }, [refreshSignal, opportunityId, loadGarantiaTrack]);

  // Obra track — same shape as the garantia one above. Loaded on mount and on
  // every `refreshSignal` bump: vincular ou desfazer o vínculo da obra acontece
  // nos modais de recurso financeiro e de investimento, ou seja FORA deste
  // componente, e sem o refresh a aba seguiria desabilitada, dizendo "Não se
  // aplica", depois de a obra ter sido escolhida ao lado.
  useEffect(() => {
    let active = true;
    setObra({ status: 'loading' });
    loadObraTrack(opportunityId)
      .then((data) => { if (active) setObra({ status: 'loaded', data }); })
      .catch(() => { if (active) setObra({ status: 'error' }); });
    return () => {
      active = false;
    };
  }, [opportunityId, loadObraTrack]);

  // Quiet refresh — não volta ao estado de carregamento, para o sub-rótulo não
  // piscar para '…' (mesma razão do refresh quieto da garantia).
  useEffect(() => {
    if (refreshSignal === 0) return; // skip initial mount — handled above
    let active = true;
    loadObraTrack(opportunityId)
      .then((data) => { if (active) setObra({ status: 'loaded', data }); })
      .catch(() => { /* keep stale data visible on quiet-refresh failure */ });
    return () => {
      active = false;
    };
  }, [refreshSignal, opportunityId, loadObraTrack]);

  /*
   * Pendência obrigatória que trava o avanço (21/09/2026).
   *
   * ⚠️ **Falha degrada para SEM MARCA**, e isso é deliberado: "não deu para
   * perguntar" nunca pode virar "há bloqueio". Uma interrogação sobre uma
   * leitura que não aconteceu mandaria o usuário procurar pendência que talvez
   * não exista — o colapso de "não sei" com "não" que a VBR-539 corrigiu na ANP,
   * aqui no sentido inverso.
   */
  const [bloqueio, setBloqueio] = useState<BloqueioAvanco | null>(null);

  useEffect(() => {
    let active = true;
    loadBloqueioAvanco(opportunityId)
      .then((data) => { if (active) setBloqueio(data); })
      .catch(() => { if (active) setBloqueio(null); });
    return () => {
      active = false;
    };
    // `refreshSignal` entra porque resolver uma pendência apaga a marca: sem
    // ele a interrogação sobreviveria ao conserto até a próxima navegação.
  }, [opportunityId, loadBloqueioAvanco, refreshSignal]);

  // ── Principal track (real) ──────────────────────────────────────────────
  const principalIndex = opportunityPhaseIndex(backendState, status, etapa);
  const principalSteps: Step[] = OPPORTUNITY_PHASE_STEPS.map((label, idx) => ({
    label,
    gresp: PRINCIPAL_GRESP[idx],
    /*
     * ⚠️ SÓ no degrau CORRENTE (decisão de produto, 21/09/2026): é o único
     * cujo avanço está de fato sendo impedido. Um degrau concluído já avançou,
     * e um futuro nem chegou ao gate — marcar qualquer um dos dois afirmaria um
     * bloqueio que não existe. E a pendência não carrega etapa no modelo de
     * dados: não há como atribuí-la a outro degrau sem inventar o vínculo.
     */
    ...(idx === principalIndex && bloqueio?.bloqueado
      ? { bloqueio: { areas: bloqueio.areas } }
      : {}),
    ...(pagamentoPulado && idx === PAGAMENTO_STEP_INDEX
      ? { pulado: true, detalhe: PAGAMENTO_PULADO_DETALHE }
      : {}),
    estado: principalIndex >= 0 && idx < principalIndex ? 'done' : idx === principalIndex ? 'active' : 'pending',
  }));
  // Sub-rótulo da aba usa a grafia de ESTADO ("Em preenchimento"), a mesma da
  // trilha de Garantia — o rótulo do passo do stepper segue
  // `OPPORTUNITY_PHASE_STEPS` (texto literal do protótipo).
  const principalSub =
    principalIndex >= 0
      ? OPPORTUNITY_PHASE_STATE_LABELS[principalIndex]
      : OPPORTUNITY_PHASE_STATE_LABELS[0];

  // ── Garantia track (real when the subprocess exists) ────────────────────
  const garantiaSub =
    garantia.status === 'loaded'
      ? garantia.data.abaSubLabel
      : garantia.status === 'loading'
        ? '…'
        : 'Indisponível';

  // "Não tiver garantia" ⇒ the tab is not clickable (greyed, disabled), instead
  // of opening onto a "não se aplica" message (prototype `.oj2-tab:disabled`).
  //
  // ⚠️ `abaDesabilitada`/`abaSubLabel`, nunca `naoSeAplica`/`subLabel`
  // (24/09/2026): o recorte da aba é próprio — sem antecipação nem mútuo ela
  // desabilita mesmo com garantia voluntária cadastrada, e sem análise prévia
  // `passos` chega com só os dois primeiros. Os outros leitores da trilha (o
  // quadro de análises da SNEG) seguem com o veredito anterior.
  const garantiaDisabled = garantia.status === 'loaded' && garantia.data.abaDesabilitada;

  const garantiaSteps: Step[] | null =
    garantia.status === 'loaded' && !garantia.data.abaDesabilitada
      ? garantia.data.passos.map((passo) => ({
          label: passo.label,
          // `null` on the final step of the prototype — no responsible line.
          gresp: passo.responsavel ?? undefined,
          estado: passo.estado,
          unavailable: passo.secaoIndisponivel,
          semFonte: passo.semFonte,
          encerrado: passo.encerrado,
          detalhe: passo.detalhe,
        }))
      : null;

  // ── Obra track (real — §6 do Converge, ADO 67921) ───────────────────────
  const obraSub =
    obra.status === 'loaded'
      ? obra.data.subLabel
      : obra.status === 'loading'
        ? '…'
        : 'Indisponível';

  /*
   * Sem obra vinculada ⇒ aba cinza e não clicável, como a de Garantia quando a
   * garantia não se aplica (pedido do negócio, 21/09/2026).
   *
   * ⚠️ `obra.status === 'loaded'` é load-bearing: erro de leitura mantém a aba
   * clicável, para o usuário abrir o painel e ler que a trilha está
   * indisponível — desabilitar ali afirmaria "esta oportunidade não tem obra"
   * sobre algo que ninguém conseguiu ler.
   */
  const obraDisabled = obra.status === 'loaded' && !obra.data.temObra;

  /*
   * A pill de área (`gresp`) passou a existir nos degraus de obra em
   * 18/09/2026, como na trilha principal — o protótipo (`01i:207-212`) não a
   * tinha. Ela vem COMPOSTA do backend; `|| undefined` faz `Oj2Stepper` omitir
   * o elemento quando a área vem vazia, em vez de desenhar uma pill em branco.
   */
  const obraSteps: Step[] | null =
    obra.status === 'loaded'
      ? obra.data.passos.map((passo) => ({
          label: passo.label,
          gresp: passo.gresp || undefined,
          estado: passo.estado,
          detalhe: passo.detalhe,
        }))
      : null;

  return (
    /*
     * `.oj2-wrap{overflow-x:visible;padding:16px}` e `.oj2{min-width:0}` no
     * mobile.
     *
     * ⚠️ **O `min-w-[820px]` é o que faz a tela do telefone rolar de lado.** Ele
     * existe para a trilha horizontal caber; com a lista vertical não há o que
     * segurar, e mantê-lo deixaria o card mais largo que o aparelho — o estado
     * do print de 17/09/2026, com as abas cortadas na borda direita.
     */
    <div className="my-4 overflow-x-auto rounded-[var(--radius-md)] border border-(--color-border) bg-white p-5 shadow-[var(--shadow-card)] max-[640px]:overflow-x-visible max-[640px]:p-4">
      <div className="flex min-w-[820px] flex-col gap-4 max-[640px]:min-w-0 max-[640px]:gap-3.5">
        {/* Tab row — `.oj2-tabs{flex-direction:column}` no mobile, com cada aba
            ocupando a linha inteira (`.oj2-tab{width:100%}`). */}
        <div className="flex flex-row flex-wrap gap-2.5 max-[640px]:flex-col max-[640px]:gap-2" role="tablist" aria-label="Trilhas da oportunidade">
          <Oj2Tab
            active={track === 'principal'}
            onClick={() => setTrack('principal')}
            icon={<FlowIcon />}
            name="Fluxo Principal"
            sub={principalSub}
          />
          <Oj2Tab
            active={track === 'garantia'}
            disabled={garantiaDisabled}
            onClick={() => setTrack('garantia')}
            icon={<ShieldIcon />}
            name="Garantia"
            sub={garantiaSub}
          />
          {/* ⚠️ `disabled` SÓ quando o backend diz que não há obra — ver o bloco
              de comentário no topo. */}
          <Oj2Tab
            active={track === 'obra'}
            disabled={obraDisabled}
            onClick={() => setTrack('obra')}
            icon={<ObraIcon />}
            name="Obra"
            sub={obraSub}
          />
        </div>

        {/* Track panel */}
        <div role="tabpanel">
          {track === 'principal' && <Oj2Stepper steps={principalSteps} label="Fases da oportunidade" />}

          {track === 'garantia' && (
            <>
              {garantia.status === 'loading' && (
                <div
                  data-testid="garantia-track-loading"
                  className="mt-3 h-16 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)"
                />
              )}
              {(garantia.status === 'error' || garantia.status === 'forbidden') && (
                <p className="mt-3 text-(length:--t-caption) text-(--color-text-muted)">
                  Trilha de garantia indisponível.
                </p>
              )}
              {garantia.status === 'loaded' && garantia.data.abaDesabilitada && (
                <p className="mt-3 text-(length:--t-caption) text-(--color-text-muted)">
                  Garantia não se aplica a esta oportunidade.
                </p>
              )}
              {garantiaSteps && (
                /*
                 * Rola só quando não cabe: a principal, com 7 degraus, é
                 * desenhada na largura cheia. Sem análise prévia a garantia tem
                 * 2, e a faixa fixa de 10 (`TRACK_STRIP_MIN_CLASS`, 1560px) os
                 * espalharia com setas de rolagem para nada.
                 */
                <Oj2Stepper
                  steps={garantiaSteps}
                  label="Trilha Garantia"
                  scrollable={garantiaSteps.length > OPPORTUNITY_PHASE_STEPS.length}
                  ultimoDegrauEncerra={
                    !(garantia.status === 'loaded' && garantia.data.abaSemPrevia)
                  }
                />
              )}
            </>
          )}

          {track === 'obra' && (
            <>
              {obra.status === 'loading' && (
                <div
                  data-testid="obra-track-loading"
                  className="mt-3 h-16 animate-pulse rounded-[var(--radius-xs)] bg-(--neutral-100)"
                />
              )}
              {obra.status === 'error' && (
                <p className="mt-3 text-(length:--t-caption) text-(--color-text-muted)">
                  Trilha de obra indisponível.
                </p>
              )}
              {obraSteps && <Oj2Stepper steps={obraSteps} label="Trilha Obra" />}
              {/* Legenda composta pelo backend (ADR-0018) e renderizada verbatim:
                  diz onde a obra é escolhida quando não há nenhuma, nomeia o
                  desfecho terminal, ou explica a pendência do engenheiro. */}
              {obra.status === 'loaded' && obra.data.nota && (
                <p
                  data-testid="obra-track-nota"
                  className="mt-3 text-(length:--t-caption) text-(--color-text-muted)"
                >
                  {obra.data.nota}
                </p>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
