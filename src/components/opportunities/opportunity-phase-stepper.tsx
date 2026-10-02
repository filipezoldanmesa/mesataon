import { trackStepDisplayState } from '@/lib/opportunities/track-step-state';
import type { OpportunityStatus } from '@/lib/opportunities/types';

/**
 * Phase stepper of an opportunity (F8 — Preenchimento → … → Concluída).
 *
 * ## Why this file exists
 *
 * The stepper used to be a private `OpportunityStepper` inside
 * `opportunity-detail.tsx`, rendered only on the fill-in layout. When the
 * `EM_ANALISE` phase started rendering the análise screen (the `01c-*`
 * prototype, which has no `.pstepper` of its own), the LT lost the phase steps
 * entirely — you could no longer see where the opportunity sat in the flow.
 * Extracted here so every phase layout renders the SAME stepper.
 *
 * ## Which design-system component this is
 *
 * The DS ships two phase widgets and they are NOT interchangeable:
 *
 *  - `PhaseTracker.jsx` — pill row (`bg` pill + label inline). What the old
 *    private stepper imitated.
 *  - `Stepper.jsx` — 32px circle + label BELOW + 2px connector. This one.
 *
 * This mirrors `Protótipo/components/Stepper.jsx` (the canonical DS source):
 * 32px circle, `strokeWidth=2` check when completed, step number otherwise,
 * 12px/1.37/0.4px label clamped to 2 lines at 80px, 2px connectors that are
 * green up to the active step and grey after it.
 *
 * Hex → token map (the DS file hardcodes hexes; `globals.css` owns them here):
 * `#418020` → `--secondary-500`, `#cccccc` → `--neutral-200`,
 * `#808080` → `--neutral-500`, `#2e2e2e` → `--neutral-800`.
 *
 * ## Step count: 8 — and why "Em obra" is NOT one of them
 *
 * CTR-17 once expanded this to 8 steps with **"Em obra"** between
 * "Cadastro / Ativação" and "Concluída", because the contract-era prototype
 * pages carried it in the step row at the time. The prototype update of 30/07
 * (#237) **removed** it: `01f`–`01j` render obra as its own *track* (the
 * `oj2-tab data-track="obra"` tab beside "Principal"). That step is not coming
 * back — it would render a phase that no longer exists in the design and that
 * no backend state can activate, and a permanently grey step reads as "this
 * opportunity is stuck before obra", which is not true.
 *
 * The 8th step is **"Em pagamento"**, added once the backend actually exposed
 * the state. CLAUDE.md had recorded it as a planned pending item ("não
 * adicionar o passo agora, sem o estado no backend"); `OpportunityState`
 * carries `EM_PAGAMENTO` today — GATE 4 advances into it from `EM_ASSINATURA`
 * — so the condition that note asked for is satisfied.
 *
 * Until then the payment phase rendered UNDER the previous step: an opportunity
 * that had already advanced to `EM_PAGAMENTO` showed "6 de 7 · Cadastro /
 * Ativação", so the stepper could not distinguish *waiting on cadastro /
 * ativação* from *waiting on the payment release* — different owners, different
 * waits (VBR-636).
 *
 * The parallel-track stepper itself (Principal · Garantia · Obra) is a separate,
 * still-undecided design item (D1) and is deliberately not built here.
 */

/**
 * Eight phases of the `data-track="principal"` step row. Steps are 0-based.
 *
 * "Em pagamento" sits AFTER "Cadastro / Ativação", not before it: the contract
 * etapa machine is `MINUTA → ASSINATURA → CADASTRO → ATIVACAO → PAGAMENTO`
 * (`domain/etapa-contrato.enum.ts`), so the payment release is the last thing
 * that happens before the opportunity concludes.
 */
export const OPPORTUNITY_PHASE_STEPS: readonly string[] = [
  // ⚠️ Rótulos definidos pelo negócio em 23/09/2026 — passo se NOMEIA
  // ("Análise", "Pagamento"), sem o "Em" de estado; a grafia de estado mora em
  // `OPPORTUNITY_PHASE_STATE_LABELS`. "Ativação dos Contratos" foi
  // "Cadastro / Ativação" até 18/09 e "Ativação" até 23/09: o passo CONTINUA
  // cobrindo cadastro e ativação — o que mudou é só como ele se chama.
  'Preenchimento',
  'Análise',
  'Aprovação',
  'Minuta',
  'Assinatura',
  'Ativação dos Contratos',
  'Pagamento',
  'Concluída',
];

/**
 * Leitura de **estado** de cada fase — "em que fase isto está" —, alinhada por
 * índice a {@link OPPORTUNITY_PHASE_STEPS}.
 *
 * ## Por que não são os rótulos do stepper
 *
 * {@link OPPORTUNITY_PHASE_STEPS} é a régua de PASSOS: o texto literal do
 * stepper do protótipo (`data-track="principal"` em `01f`–`01j`). Passo se
 * nomeia ("Minuta", "Assinatura"), estado se afirma ("Em minuta", "Em
 * assinatura") — e fora da régua o nome do passo lê como outra coisa. O defeito
 * apareceu duas vezes:
 *
 * - na **aba** da trilha principal, que dizia "Preenchimento" ao lado da aba de
 *   Garantia dizendo "Em preenchimento" (a razão original deste array);
 * - na **pill da proposta** das telas de aprovação e contrato, que dizia
 *   "Minuta" logo abaixo de um header que o backend rotula "Em minuta"
 *   (`statusPropostaExibido`).
 *
 * ## Por que não é uma segunda tabela a apodrecer
 *
 * É **derivada por índice** do mesmo array e resolvida pelo mesmo
 * {@link opportunityPhaseIndex} que pinta a trilha, então não existe caminho em
 * que as duas discordem sobre QUAL fase é a corrente — só sobre como escrevê-la.
 * Os textos são os do backend (`OPPORTUNITY_STATE_LABEL`, a fonte que o header
 * e a listagem já mostram), com uma exceção: o índice 5 repete o rótulo do
 * passo ("Ativação dos Contratos") porque `EM_PAGAMENTO` cobre cadastro, ativação E pagamento
 * — o backend não tem estado próprio para ele, e é {@link ETAPA_STEP_INDEX} que
 * separa os dois. Manter a grafia do passo ali evita inventar um terceiro nome
 * para algo que o resto do app já chama assim. ⚠️ É por isso que o rótulo
 * encurtado de 18/09/2026 mudou nos DOIS arrays: deixar "Cadastro / Ativação"
 * aqui faria a aba da trilha principal escrever um nome e o passo sob ela,
 * outro.
 *
 * Mudar {@link OPPORTUNITY_PHASE_STEPS} alteraria a régua de fases; é aqui que
 * se mexe no texto de estado.
 */
export const OPPORTUNITY_PHASE_STATE_LABELS: readonly string[] = [
  'Em preenchimento',
  'Em análise',
  'Em aprovação',
  'Em minuta',
  'Em assinatura',
  'Ativação dos Contratos',
  'Em pagamento',
  'Concluída',
];

/**
 * Maps the raw backend workflow state to the active step index (0-based).
 *
 * ## `EM_PAGAMENTO` stays on "Cadastro / Ativação" (5), NOT on the new step
 *
 * One opportunity state covers three contract etapas — `CADASTRO`, `ATIVACAO`
 * and `PAGAMENTO` all sit inside `EM_PAGAMENTO` (see `phaseStateForEtapa`), so
 * the state ALONE cannot tell whether the payment release has been reached. It
 * therefore resolves to the earlier of the two steps, and {@link
 * ETAPA_STEP_INDEX} refines it when the caller knows the etapa.
 *
 * Mapping the state straight onto "Em pagamento" would have been the mirror of
 * the bug this step fixes: an opportunity sitting at `etapaAtual: "CADASTRO"`
 * would claim the payment step, jumping one phase ahead of reality.
 *
 * Unknown / undefined states resolve to -1 so that no step appears active.
 */
const BACKEND_STATE_STEP_INDEX: Record<string, number> = {
  NOVOS: 0,
  EM_PREENCHIMENTO: 0,
  EM_ANALISE: 1,
  EM_APROVACAO: 2,
  EM_MINUTA: 3,
  EM_ASSINATURA: 4,
  EM_PAGAMENTO: 5,
  CONCLUIDA: 7,
};

/**
 * Maps a **contract etapa** to the active step index (0-based).
 *
 * This is the only source that can separate "Cadastro / Ativação" from
 * "Em pagamento": both live under the single `EM_PAGAMENTO` opportunity state,
 * and only the contract's own etapa says which of them the flow is actually
 * waiting on.
 *
 * An unknown etapa is absent from the map, so the caller falls back to the
 * state/status resolution instead of a guessed step.
 */
const ETAPA_STEP_INDEX: Record<string, number> = {
  MINUTA: 3,
  ASSINATURA: 4,
  CADASTRO: 5,
  ATIVACAO: 5,
  PAGAMENTO: 6,
};

/**
 * Fallback map from the coarse `OpportunityStatus` (used when `backendState`
 * is not passed). Maps conservatively — never jumps ahead of what the coarse
 * status guarantees.
 */
const STATUS_STEP_INDEX: Record<OpportunityStatus, number> = {
  preenchimento: 0,
  análise: 1,
  aprovação: 2,
  contrato: 3, // Minuta — first contract sub-step; prefer backendState for finer resolution
  concluída: 7,
};

/**
 * Translates a **contract etapa** into the opportunity state the stepper should
 * highlight.
 *
 * ## Why the contract phase cannot just pass `backendState`
 *
 * The contract etapa and the opportunity state advance at *different moments*:
 * sending the envelope moves the contract `MINUTA → ASSINATURA` immediately,
 * while the opportunity may still read `EM_MINUTA`. `ContratoView` already
 * resolved that conflict once — its header, breadcrumb and STATUS field all
 * render `headPill` (the contract etapa) — so the stepper has to use the same
 * source or the screen states two different truths at once: trilha on "Minuta",
 * header on "Em assinatura" (RN-F6-01: the trilha must reflect reality).
 *
 * `CADASTRO`/`ATIVACAO`/`PAGAMENTO` all collapse onto `EM_PAGAMENTO` because
 * that is genuinely the one opportunity state covering all three.
 *
 * ⚠️ Which is why this function is NOT enough to pick the step any more: the
 * principal track now has a step for "Cadastro / Ativação" AND one for
 * "Em pagamento", and this collapse cannot tell them apart. Pass the etapa to
 * {@link opportunityPhaseIndex} (or the `etapa` prop) for that — this function
 * answers "which opportunity state does this etapa correspond to", which is a
 * different question.
 *
 * An unknown etapa returns `undefined` (no step forced), letting the caller's
 * `status` fallback decide — never a guessed step.
 */
export function phaseStateForEtapa(etapa: string | undefined): string | undefined {
  switch (etapa) {
    case 'MINUTA':
      return 'EM_MINUTA';
    case 'ASSINATURA':
      return 'EM_ASSINATURA';
    case 'CADASTRO':
    case 'ATIVACAO':
    case 'PAGAMENTO':
      return 'EM_PAGAMENTO';
    default:
      return undefined;
  }
}

/**
 * Resolves the active principal-track step index (0-based) from the raw backend
 * state, the coarse status and/or the contract etapa. Shared with the
 * parallel-track tabs so both steppers agree on where the flow sits. -1 when
 * none of them resolves.
 *
 * Takes the MOST ADVANCED of whatever resolves, which is the established
 * semantics here: the contract etapa runs ahead of the opportunity state
 * (sending the envelope advances `MINUTA → ASSINATURA` before `backendState`
 * follows), and the coarse `concluída` status outranks both.
 *
 * `etapa` is what separates "Cadastro / Ativação" from "Em pagamento" — see
 * {@link ETAPA_STEP_INDEX}.
 */
export function opportunityPhaseIndex(
  backendState?: string,
  status?: OpportunityStatus,
  etapa?: string,
): number {
  const byState =
    backendState !== undefined ? (BACKEND_STATE_STEP_INDEX[backendState] ?? -1) : -1;
  const byStatus = status !== undefined ? (STATUS_STEP_INDEX[status] ?? -1) : -1;
  const byEtapa = etapa !== undefined ? (ETAPA_STEP_INDEX[etapa] ?? -1) : -1;

  return Math.max(byState, byStatus, byEtapa);
}

const CHECK = (
  <svg
    aria-hidden="true"
    fill="none"
    height="16"
    viewBox="0 0 16 16"
    width="16"
  >
    <path
      d="M3 8L6.5 11.5L13 5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    />
  </svg>
);

/** 2px rule between two steps — green while the flow has passed it. */
function Connector({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-4 h-0.5 min-w-4 flex-1 min-[761px]:min-w-8 ${
        done ? 'bg-(--secondary-500)' : 'bg-(--neutral-200)'
      }`}
    />
  );
}

export function OpportunityPhaseStepper({
  status,
  backendState,
  etapa,
}: {
  status?: OpportunityStatus;
  backendState?: string;
  /**
   * Current contract etapa, when the caller has one. Required to reach the
   * "Em pagamento" step: the `EM_PAGAMENTO` state covers `CADASTRO`, `ATIVACAO`
   * and `PAGAMENTO`, so only the etapa says which step is actually active.
   */
  etapa?: string;
}) {
  // Shared resolver (see opportunityPhaseIndex): prefers the most advanced of
  // backendState/status/etapa to cover the post-Gate-1 optimistic-update window
  // and the etapa running ahead of the opportunity state.
  const currentIndex = opportunityPhaseIndex(backendState, status, etapa);

  return (
    <nav aria-label="Fases da oportunidade" className="mt-4 pb-1">
      <ol className="flex list-none items-start p-0">
        {OPPORTUNITY_PHASE_STEPS.map((label, idx) => {
          /*
           * "Concluída" alcançada é desenhada como CONCLUÍDA (check verde), e
           * não como o passo corrente — ver `trackStepDisplayState`. Mesma
           * regra das trilhas de Garantia e de Obra; o índice da fase corrente,
           * que o sub-rótulo da aba lê, não muda.
           */
          const estado = trackStepDisplayState(
            currentIndex < 0
              ? 'pending'
              : idx < currentIndex
                ? 'done'
                : idx === currentIndex
                  ? 'active'
                  : 'pending',
            idx === OPPORTUNITY_PHASE_STEPS.length - 1,
          );
          const isDone = estado === 'done';
          const isActive = estado === 'active';

          return (
            <li
              className="flex flex-1 items-start last:flex-initial"
              key={label}
            >
              <div
                aria-current={isActive ? 'step' : undefined}
                /*
                 * `min-w-20`, not a fixed `w-20`: the DS `<li>` has no width — it
                 * is as wide as its widest child. With a FIXED 80px column a
                 * wider label stayed centered and overflowed the column on both
                 * sides, which is what pushed the first step past the left margin.
                 */
                className="flex min-w-20 shrink-0 flex-col items-center gap-1"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-(length:--t-caption) font-bold tracking-[0.4px] ${
                    isDone
                      ? 'border-(--secondary-500) bg-(--secondary-500) text-white'
                      : isActive
                        ? 'border-(--secondary-500) text-(--secondary-500)'
                        : 'border-(--neutral-200) text-(--neutral-500)'
                  }`}
                >
                  {isDone ? CHECK : idx + 1}
                </span>
                {/*
                 * The label carries its OWN max width (the DS puts `maxWidth: 80px`
                 * on the span, not on the column): without it, a label wider than
                 * the column overflowed the centered 80px box and the first step
                 * spilled ~10px LEFT of the content margin, past the cards below.
                 *
                 * Two deltas from a literal 80px: the DS font size is 12px
                 * (`--t-small`) — this was rendering at 14px, which is what made
                 * "Preenchimento" 99px wide — and the cap is 96px so that longest
                 * single word still fits on one line (at 80px it clipped, since
                 * `line-clamp` cannot break a word).
                 */}
                <span
                  className={`line-clamp-2 max-w-24 text-center text-(length:--t-small) leading-[1.37] tracking-[0.4px] ${
                    isActive
                      ? 'font-bold text-(--neutral-800)'
                      : isDone
                        ? 'text-(--secondary-500)'
                        : 'text-(--neutral-500)'
                  }`}
                >
                  {label}
                </span>
              </div>
              {/*
               * Green only when the flow has PASSED this step. The active step
               * therefore has a green connector on its left (the previous step
               * is done) and a grey one on its right — the DS rule
               * (`connectorLeftColor` green / `connectorRightColor` grey for
               * `active` in `Stepper.jsx`).
               */}
              {idx < OPPORTUNITY_PHASE_STEPS.length - 1 && (
                <Connector done={isDone} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
