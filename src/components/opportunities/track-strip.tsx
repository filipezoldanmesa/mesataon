'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The prototype's horizontally scrollable step strip (`.oj2 .gnav` / `.hscroll`
 * / `.gnav-btn` / `.gsteps` in `01c-oportunidade-analise.html:168-178`).
 *
 * Two components draw this strip — the opportunity's parallel-track tabs and
 * the analysis-phase track selector — so the measurements and the ‹ › control
 * live here once. A second copy is how the garantia trail ended up with five
 * hard-coded names in one place and ten backend-driven ones in the other.
 */

/** `.oj2 .gsteps .step{min-width:150px}` — room for circle, role pill and label. */
export const TRACK_STEP_MIN_PX = 150;

/** `.oj2 .steps.gsteps{min-width:1560px}` — the strip is wider than the viewport on purpose. */
export const TRACK_STRIP_MIN_PX = 1560;

/** `.oj2 .gsteps .nm{max-width:134px}` — label width inside a step. */
export const TRACK_LABEL_MAX_PX = 134;

/**
 * ⚠️ **`max-[640px]:`, não `max-sm:`** — a visão mobile do stepper.
 *
 * O bloco do protótipo é `@media(max-width:640px)`, que INCLUI 640; o `max-sm`
 * do Tailwind é `width < 40rem`, que exclui. Um pixel de diferença, e é
 * justamente a largura de um aparelho comum. Mesma disciplina do `min-[961px]:`
 * do `.dgrid` — o breakpoint é o do desenho, não o da ferramenta.
 *
 * ⚠️ O bloco existe **só** em `01b-oportunidade-nova.html` (protótipo de
 * 15/09/2026). Os demais arquivos da jornada ainda não foram atualizados; isso
 * não os torna exceção — é a mesma `.oj2` em todas as telas.
 */
export const TRACK_MOBILE = 'max-[640px]:';

/**
 * As MESMAS medidas acima, em classe — e é a forma que carrega o reset do
 * mobile (`.oj2 .steps.gsteps{min-width:0}` e `.gsteps .nm{max-width:none}`).
 *
 * ⚠️ **Existem porque `style` inline não tem media query.** Enquanto a largura
 * da faixa viajava em `style={{ minWidth: 1560 }}`, nenhuma classe podia
 * desfazê-la no telefone: inline vence folha de estilo, então a trilha de
 * garantia continuaria 1560px de largura dentro de um card de 360px.
 *
 * ⚠️ `garantia-track-tab.tsx` (a faixa da tela de ANÁLISE) ainda usa as
 * constantes em px e o `style` inline — ou seja, continua horizontal no mobile.
 * É a mesma `.oj2` e deve adotar isto; ficou de fora por ser outra tela, e o
 * protótipo dela ainda não recebeu o bloco de 640px.
 */
export const TRACK_STRIP_MIN_CLASS = 'min-w-[1560px] max-[640px]:min-w-0';
export const TRACK_STEP_MIN_CLASS = 'min-w-[150px] max-[640px]:min-w-0';
export const TRACK_LABEL_MAX_CLASS = 'max-w-[134px] max-[640px]:max-w-none';

/**
 * Scroller plumbing for the strip: a ref for the overflow container, a `scrollBy`
 * that moves roughly one screenful, and whether each end has been reached (the
 * prototype greys the control out at the edges — `.gnav-btn:disabled`).
 *
 * Edge detection is deliberately **fail-open**: when the element reports a zero
 * `scrollWidth` — jsdom never lays out, and a strip inside a hidden tab panel
 * measures zero too — the state is unknown, not "fits", so the controls stay
 * enabled. Guessing "fits" there would disable a control that does work.
 */
export function useTrackScroll(): {
  ref: React.RefObject<HTMLDivElement | null>;
  scrollBy: (direction: -1 | 1) => void;
  atStart: boolean;
  atEnd: boolean;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ atStart: false, atEnd: false });

  const sync = useCallback(() => {
    const node = ref.current;
    if (!node || node.scrollWidth === 0) return; // not laid out — keep both enabled
    const max = node.scrollWidth - node.clientWidth;
    if (max <= 0) {
      setEdges({ atStart: true, atEnd: true }); // the whole strip fits
      return;
    }
    setEdges({ atStart: node.scrollLeft <= 1, atEnd: node.scrollLeft >= max - 1 });
  }, []);

  useEffect(() => {
    sync();
    const node = ref.current;
    if (!node) return;
    node.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      node.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [sync]);

  const scrollBy = useCallback((direction: -1 | 1) => {
    const node = ref.current;
    if (!node) return;
    // One screenful minus a sliver, so the step at the edge stays visible as
    // the anchor of where the reader was.
    node.scrollBy({ left: direction * Math.round(node.clientWidth * 0.8), behavior: 'smooth' });
  }, []);

  return { ref, scrollBy, atStart: edges.atStart, atEnd: edges.atEnd };
}

/** `.oj2 .gnav-btn` — 32px round control at each end of the strip. */
export function TrackScrollButton({
  direction,
  onClick,
  disabled,
}: {
  direction: -1 | 1;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === -1 ? 'Etapas anteriores' : 'Próximas etapas'}
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-(--color-border) bg-white text-[20px] leading-none text-(--neutral-600) hover:border-(--secondary-500) hover:text-(--secondary-500) disabled:cursor-default disabled:opacity-35 disabled:hover:border-(--color-border) disabled:hover:text-(--neutral-600)"
    >
      {direction === -1 ? '‹' : '›'}
    </button>
  );
}

/**
 * `.oj2 .hscroll` — the overflow container. The scrollbar is hidden because the
 * ‹ › controls are the affordance; a native bar under the strip competes with
 * the connectors visually.
 */
export const TRACK_SCROLLER_CLASS =
  'min-w-0 flex-1 overflow-x-auto scroll-smooth pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/**
 * The connector between two circles — `.oj2 .step:not(:first-child)::before`.
 *
 * It is NOT an element sitting between the steps: it is absolutely positioned
 * inside the step, spanning from the previous circle's centre to this one
 * (`left:-50%; width:100%`) and passing UNDER the circle, which is opaque and
 * on a higher layer. That is what makes the line continuous.
 *
 * A flex sibling between the step boxes cannot do this — it only fills the gap
 * between them, so at 150px per step the line detaches from the circles and
 * floats as a short dash in the middle. It looked right only while the steps
 * were narrow enough for the gap to reach the circles.
 *
 * Colour follows the step it belongs to (`.step.done::before`,
 * `.step.active::before`): the line LEADING INTO a done or active step is
 * green.
 *
 * @param topPx - Vertical centre of the circle: half its diameter.
 */
export function TrackConnector({
  reached,
  topPx,
}: {
  reached: boolean;
  topPx: number;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ top: topPx }}
      /*
       * `max-[640px]:hidden` — `.oj2 .step:not(:first-child)::before{display:none}`.
       * No mobile a trilha é vertical, e esta linha liga dois círculos que já não
       * estão lado a lado: sem escondê-la, ela atravessa o rótulo do passo.
       */
      className={`absolute -left-1/2 z-0 h-0.5 w-full max-[640px]:hidden ${
        reached ? 'bg-(--secondary-500)' : 'bg-(--neutral-200)'
      }`}
    />
  );
}

/**
 * A linha VERTICAL entre dois passos — `.oj2 .step:not(:last-child)::after`,
 * exclusiva da visão mobile (`left:16px; top:34px; bottom:0; width:2px`).
 *
 * ⚠️ **Pertence ao passo de CIMA, e a cor segue ele** (`.step.done:…::after`),
 * ao contrário da horizontal, que pertence ao de baixo (a linha que ENTRA num
 * passo done/active é verde). São dois sentidos diferentes de "alcançado" e
 * unificá-los pintaria de verde o trecho que sai do último passo concluído para
 * o que ainda não começou.
 *
 * `left-4` = 16px = o centro de um círculo de 34px na coluna de 34px.
 */
export function TrackVerticalConnector({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-testid="track-connector-vertical"
      data-done={done ? 'true' : 'false'}
      className={`absolute top-[34px] bottom-0 left-4 z-0 hidden w-0.5 max-[640px]:block ${
        done ? 'bg-(--secondary-500)' : 'bg-(--neutral-200)'
      }`}
    />
  );
}
