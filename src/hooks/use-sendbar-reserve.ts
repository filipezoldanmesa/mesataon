'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Piso da reserva, em px: é a altura da barra de UMA linha mais respiro —
 * exatamente o `pb-[88px]` que as telas com sendbar usavam chumbado. Vale como
 * fallback quando a medição é 0 (primeiro paint, SSR, jsdom dos testes de
 * componente). Sem o piso, o padding zeraria e o conteúdo voltaria para trás da
 * barra.
 */
export const SENDBAR_RESERVA_MINIMA = 88;

/** Respiro entre o último card e a barra, somado à altura medida. */
export const SENDBAR_FOLGA = 24;

/**
 * Reserva de espaço para uma sendbar `fixed`, MEDIDA em vez de chumbada.
 *
 * ## Por que medir
 *
 * A altura da barra é variável: a lista de pendências abre e fecha, o backend
 * pode acrescentar itens, a mensagem de falha nomeia blocos, e todo esse texto
 * reflui em telas estreitas. Um `pb-[88px]` fixo cobre só o caso de uma linha —
 * qualquer coisa além disso passa a esconder o final do conteúdo atrás da barra,
 * e o sintoma é o último cartão inalcançável.
 *
 * ## Por que um hook compartilhado
 *
 * Nasceu inline na `PropostaFranquiaScreen` e a tela de CRIAÇÃO seguia com o
 * `pb-[88px]` chumbado — então quando a lista de pendências passou a existir nas
 * duas (ADO — 01/09/2026), uma media e a outra não. Duas cópias divergiriam
 * exatamente aqui: no dia em que a barra cresce numa tela só.
 *
 * Uso:
 *
 * ```tsx
 * const { sendbarRef, sendbarReserva } = useSendbarReserve();
 * return (
 *   <div style={{ paddingBottom: sendbarReserva }}>
 *     …
 *     <div ref={sendbarRef} className="fixed inset-x-0 bottom-0 …">…</div>
 *   </div>
 * );
 * ```
 */
export function useSendbarReserve(): {
  sendbarRef: (node: HTMLDivElement | null) => void;
  sendbarReserva: number;
} {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const frameRef = useRef<number | null>(null);
  const [sendbarReserva, setSendbarReserva] = useState(SENDBAR_RESERVA_MINIMA);

  const medir = useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    const alvo = Math.max(SENDBAR_RESERVA_MINIMA, el.offsetHeight + SENDBAR_FOLGA);
    // Guarda de igualdade: este efeito roda a cada render (é o que o mantém
    // correto quando o texto reflui sem mudar nenhuma dependência declarável),
    // e sem ela o setState realimentaria o próximo render indefinidamente.
    setSendbarReserva((atual) => (atual === alvo ? atual : alvo));
  }, []);

  /*
   * Ref de CALLBACK, não `useRef` (ADO 68189).
   *
   * A barra costuma ser renderizada condicionalmente — na oportunidade, só em
   * `preenchimento` e com ≥1 proposta —, então no primeiro efeito o nó ainda
   * não existe. Com um `useRef` + `useEffect([medir])`, o observer saía cedo e
   * a dependência estável nunca o fazia rodar de novo: a reserva ficava presa
   * no piso de 88px enquanto a barra crescia. A callback roda quando o nó
   * ENTRA e quando SAI, que é exatamente quando há o que (des)observar.
   */
  const sendbarRef = useCallback(
    (node: HTMLDivElement | null) => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      mutationObserverRef.current?.disconnect();
      mutationObserverRef.current = null;
      nodeRef.current = node;

      if (node && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(medir);
        observer.observe(node);
        resizeObserverRef.current = observer;
      }

      /*
       * MutationObserver ao LADO do ResizeObserver — medido em staging,
       * 04/09/2026 (retest do ADO 68189).
       *
       * O `ResizeObserver` sozinho deixava a reserva presa no piso: barra de
       * **134px** e spacer de **88px** na `PCR-RGN-000068`, com o card
       * "Processo de alçada" terminando 54px POR BAIXO da barra — o fim do
       * conteúdo inalcançável, exatamente o defeito que este hook existe para
       * eliminar. `window.dispatchEvent(new Event('resize'))` no console
       * corrigia na hora (88 → 158), o que prova que `medir` está certo e que
       * o problema é só QUANDO ele é chamado.
       *
       * Por que o RO não bastou: a barra cresce quando o FILHO
       * (`Gate1SendToAnalysis`) troca de `checking` para `blocked` — sem
       * re-render do host, então o `useLayoutEffect` abaixo não roda; e o
       * disparo do RO nesse nó `fixed` não se confirmou na medição ao vivo. O
       * MutationObserver é a segunda evidência da MESMA mudança e não depende
       * de o layout ser reportado: o React substitui os nós filhos, e isso é
       * uma mutação de `childList`/`subtree`.
       *
       * Não há laço: o spacer que a reserva dimensiona é IRMÃO da barra nos
       * três call sites (nunca filho), então mudar a reserva não muta a
       * subárvore observada. `medir` ainda tem a guarda de igualdade.
       */
      if (node && typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(medir);
        observer.observe(node, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        mutationObserverRef.current = observer;
      }

      medir();
      /*
       * E uma medição no frame seguinte: no instante em que o nó é anexado o
       * navegador ainda não fez layout do conteúdo, e `offsetHeight` pode
       * reportar a barra menor do que ela vai pintar. Sem isso a primeira
       * leitura cai no piso e só um dos observers acima a corrige.
       */
      if (node && typeof requestAnimationFrame !== 'undefined') {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = requestAnimationFrame(() => {
          frameRef.current = null;
          medir();
        });
      }
    },
    [medir],
  );

  // Sem array de dependências de propósito: qualquer render pode ter mudado a
  // altura da barra (abrir/fechar a lista, pendência nova do backend, reflow).
  useLayoutEffect(medir);

  useEffect(() => {
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [medir]);

  // Desliga os observers ao desmontar o host (a callback já cobre a troca de
  // nó). O frame pendente vai junto: `medir` depois do unmount é setState em
  // componente desmontado.
  useEffect(
    () => () => {
      resizeObserverRef.current?.disconnect();
      mutationObserverRef.current?.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return { sendbarRef, sendbarReserva };
}
