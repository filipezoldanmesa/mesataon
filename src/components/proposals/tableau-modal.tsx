"use client";

import { useEffect, useMemo, useRef } from "react";

import { SECONDARY_OUTLINE_BTN } from "@/components/button";
import { toTableauEmbedUrl } from "@/lib/proposals/tableau-embed-url";

/**
 * Painel de inteligência de mercado do Tableau, aberto DENTRO da tela em vez de
 * numa aba nova.
 *
 * Por que um modal com iframe e não um `window.open`: o dado que o analista vai
 * ler (VMM do bairro, market share por bandeira) é insumo da proposta que ele
 * está preenchendo na página de trás — mandá-lo para outra aba o obriga a
 * memorizar números e voltar. Decisão de produto de 27/08/2026, com a altura de
 * exibição fixada em {@link TABLEAU_FRAME_HEIGHT}.
 *
 * ⚠️ **A URL emoldurada NÃO é a configurada** — é a derivada por
 * {@link toTableauEmbedUrl}. A URL que o Tableau Cloud oferece compartilhar
 * responde `x-frame-options: SAMEORIGIN` e o navegador recusa emoldurá-la, **sem
 * disparar `onError`**: o sintoma é um retângulo em branco que nada explica. As
 * evidências das três formas de URL estão no docblock daquela função.
 *
 * Nada aqui fala com o nosso backend: o iframe carrega direto do Tableau, com a
 * sessão que o usuário já tem no navegador dele. Se ele não estiver logado lá, o
 * que aparece no quadro é a tela de login do Tableau — comportamento correto, e
 * a razão de o "Abrir em nova aba" continuar existindo.
 */

/**
 * Altura de exibição do quadro, em pixels — combinada com a Vibra em
 * 27/08/2026 ("height fixo de 700 no tamanho de exibição").
 *
 * É **fixa**, não `100%` da viewport: o painel tem um layout próprio, desenhado
 * para uma altura conhecida, e esticá-lo conforme a janela reflui os gráficos
 * dele a cada tamanho de tela. Exportada para o teste aferir o número acordado
 * em vez de repeti-lo.
 */
export const TABLEAU_FRAME_HEIGHT = 700;

/**
 * Concede o que o painel precisa (a própria sessão, filtros, popups de export) e
 * retém uma coisa só: navegar a NOSSA janela de topo — que um terceiro
 * emoldurado não tem por que fazer.
 *
 * ⚠️ `allow-same-origin` é sobre a origem do TABLEAU, não a nossa. Entre origens
 * diferentes ele não dá ao quadro nenhum acesso a este documento; sem ele o
 * quadro recebe origem opaca e perde os cookies de sessão, ou seja: a
 * visualização nunca carrega.
 *
 * ⚠️ Se alguma função do painel (exportar, filtrar) não funcionar dentro do
 * quadro, este atributo é a primeira coisa a conferir — ele não pôde ser
 * exercitado ponta a ponta contra o tenant real.
 */
const FRAME_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads";

export function TableauModal({
  open,
  tableauUrl,
  onClose,
}: {
  open: boolean;
  /** Valor cru de `NEXT_PUBLIC_TABLEAU_MARKET_URL` — a derivação acontece aqui. */
  tableauUrl: string | undefined;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const embedUrl = useMemo(() => toTableauEmbedUrl(tableauUrl), [tableauUrl]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      /*
       * `z-[200]`, não `z-50`: as telas que hospedam este card renderizam uma
       * sendbar FIXA em `z-50` como irmã depois do `<main>`, e com z-index igual
       * quem vem depois no DOM pinta por cima (mesmo motivo do `PhotoViewer`).
       */
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      /*
       * `role="presentation"` é load-bearing, não decoração: o card que hospeda
       * este modal colapsa escondendo todo filho DIRETO que não seja o header, e
       * a isenção do `globals.css` casa `[role='dialog']`/`[role='presentation']`
       * — só que o `role="dialog"` está um nível abaixo daqui. Sem este atributo,
       * recolher o card com o painel aberto o faria sumir da tela.
       */
      role="presentation"
      data-testid="tableau-modal-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tableau-modal-title"
        data-testid="tableau-modal"
        className="flex max-h-[95dvh] w-full max-w-[min(1400px,95vw)] flex-col overflow-hidden rounded-[var(--radius-md)] bg-(--color-surface) shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-(--color-border) px-4 py-3">
          <h2
            id="tableau-modal-title"
            className="min-w-0 flex-1 truncate text-(length:--t-h4) font-bold"
          >
            Inteligência de mercado · Tableau
          </h2>

          {/*
           * Saída de emergência, e não conveniência: a recusa por
           * `X-Frame-Options` é silenciosa no navegador, então este link é a
           * única coisa entre o usuário e um retângulo vazio. Aponta para a URL
           * CONFIGURADA — a forma compartilhável é a que uma aba resolve bem.
           *
           * `<a>` estilizado de botão porque ele NAVEGA: um `<button>` com
           * `window.open` perderia ctrl/clique-do-meio, "copiar endereço do
           * link" e as regras do bloqueador de popup.
           */}
          {embedUrl && (
            <a
              href={tableauUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${SECONDARY_OUTLINE_BTN} shrink-0 py-1.5 text-[12px]`}
              data-testid="tableau-open-tab"
            >
              Abrir em nova aba
            </a>
          )}

          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="tableau-modal-close"
            className="shrink-0 rounded-full px-2 text-[22px] leading-none text-(--color-text-muted) hover:bg-(--neutral-40) hover:text-(--neutral-900)"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-(--neutral-40)">
          {embedUrl ? (
            <iframe
              src={embedUrl}
              title="Painel de inteligência de mercado no Tableau"
              /*
               * Altura em ATRIBUTO e não só em classe: é a medida acordada com o
               * negócio, e um atributo é o que o teste — e quem lê o HTML —
               * encontra sem depender de CSS computado.
               */
              height={TABLEAU_FRAME_HEIGHT}
              sandbox={FRAME_SANDBOX}
              data-testid="tableau-frame"
              className="block w-full border-0"
              style={{ height: TABLEAU_FRAME_HEIGHT }}
            />
          ) : (
            /*
             * Sem endereço não há o que emoldurar. Um quadro vazio seria
             * indistinguível de um painel que falhou ao carregar, então a frase
             * diz qual dos dois é — e nomeia a variável, porque o conserto é
             * provisionamento (build-time), não código.
             */
            <p
              role="status"
              data-testid="tableau-not-configured"
              className="px-6 py-16 text-center text-(length:--t-caption) text-(--color-text-muted)"
            >
              O endereço do painel do Tableau ainda não foi configurado neste
              ambiente (<code>NEXT_PUBLIC_TABLEAU_MARKET_URL</code>).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
