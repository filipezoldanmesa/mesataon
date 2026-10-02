'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';

import { SECONDARY_OUTLINE_BTN } from '@/components/button';
import { withBasePath } from '@/lib/base-path';

/**
 * GER-04 — o ícone de ajuda "Documento de Suporte".
 *
 * *"Ícone de ajuda ('Documento de Suporte'): ao clicar, abre um documento da área
 * de CCOB (PDF) em iframe, com o tutorial e as regras de negócio dos documentos
 * de garantia."*
 *
 * ## Por que um modal com iframe, e não uma aba nova
 *
 * Mesma razão do `tableau-modal.tsx`: quem está preenchendo a garantia precisa
 * consultar a regra **sem perder o formulário**. Uma aba nova tira a pessoa da
 * tela e a obriga a voltar; o modal deixa o contexto de pé atrás dele.
 *
 * ## O PDF é SERVIDO PELA BFF, não por `/public`
 *
 * O documento carrega regras de negócio internas da CCOB, então fica atrás da
 * sessão — `/public` do Next é estático e não passa pelo gate de autenticação. O
 * caminho é o mesmo padrão de stream que todo documento desta base já usa, e
 * trocar o arquivo pelo definitivo é substituir um arquivo.
 *
 * ⚠️ **O conteúdo atual é PLACEHOLDER.** A CCOB ainda está elaborando o documento
 * (confirmado em 31/08/2026). O placeholder diz isso na cara — um PDF vazio ou
 * um "lorem ipsum" leria como documento real e mandaria o usuário seguir uma
 * regra que não existe.
 *
 * ## Dois gatilhos, UM dono (ADO · 01/09/2026)
 *
 * `variant` escolhe só o GATILHO — `icone` é o "?" ao lado do título, `link` é o
 * nome do documento dentro de uma frase. O modal, a URL da BFF e o texto
 * acessível ficam num lugar só: duas cópias do modal divergiriam no dia em que o
 * documento mudar de rota, e é o tipo de divergência que ninguém nota (as duas
 * abrem *algo*).
 *
 * O gatilho `link` é `<button>`, não `<a href>`: ele abre um modal, e um `<a>`
 * prometeria navegação — daria "abrir em nova aba" no menu de contexto para um
 * destino que não é o que o clique faz. A saída para nova aba existe DENTRO do
 * modal, onde a URL é a real.
 *
 * ## O modal vive num PORTAL
 *
 * Ele era renderizado como irmão do gatilho, e o gatilho vive dentro de um `<h3>`
 * (o "?") e de um `<p>` (o link) — os dois são *phrasing content*, então um
 * `<div>`/`<p>` ali dentro é HTML inválido: o React avisa (`<p> cannot contain a
 * nested <p>`) e o parser do browser pode FECHAR o parágrafo antes da hora e
 * reparentar os nós. `createPortal` para o `body` resolve os dois casos de uma
 * vez e é o lugar certo de um overlay `fixed` de qualquer forma (nenhum
 * `overflow`/`z-index` de ancestral o recorta). Precedente no repo:
 * `components/ui/select.tsx`.
 *
 * ⚠️ **`withBasePath` é obrigatório** aqui: `NEXT_PUBLIC_BASE_PATH` é vazio local
 * e preenchido em dev/stage/prod, então uma URL crua funciona no laptop e responde
 * 404 em todos os ambientes — inclusive num `src` de iframe. `base-path-coverage`
 * varre isto.
 */
export function DocumentoSuporteCcob({
  opportunityId,
  variant = 'icone',
}: {
  opportunityId: string;
  /** `icone` = o "?" ao lado do título; `link` = o nome do documento numa frase. */
  variant?: 'icone' | 'link';
}) {
  const [aberto, setAberto] = useState(false);

  const url = withBasePath(
    `/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/documento-suporte`,
  );

  return (
    <>
      {variant === 'icone' ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Documento de Suporte — tutorial e regras dos documentos de garantia"
          title="Documento de Suporte"
          className="ml-1.5 inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-(--color-border) text-[11px] font-bold text-(--color-text-muted) align-middle hover:border-(--secondary-600) hover:text-(--secondary-600)"
        >
          ?
        </button>
      ) : (
        /*
         * Sem `aria-label`: o texto visível JÁ é o nome acessível, e um rótulo
         * diferente do que se lê na tela quebra o comando de voz ("clique em
         * Documento de Suporte"). É também o que mantém a busca por nome exato
         * distinguindo este gatilho do "?" nos testes.
         *
         * Sublinhado por padrão — dentro de uma frase, cor sozinha não é
         * afordância suficiente (e não passa em daltonismo). `align-baseline`
         * porque o `inline-flex` do irmão deslocaria a linha de texto.
         */
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="inline align-baseline font-bold text-(--secondary-600) underline hover:no-underline"
        >
          Documento de Suporte
        </button>
      )}

      {aberto && createPortal(
        <div
          role="presentation"
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Documento de Suporte"
            onClick={(e) => e.stopPropagation()}
            className="flex h-full max-h-[860px] w-full max-w-[980px] flex-col overflow-hidden rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface)"
          >
            <div className="flex items-center justify-between border-b border-(--color-border) px-5 py-3.5">
              <h3 className="text-(length:--t-h4) font-bold">Documento de Suporte</h3>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="text-[22px] leading-none text-(--color-text-muted)"
              >
                ×
              </button>
            </div>

            <p className="border-b border-(--color-border) px-5 py-2.5 text-[12px] text-(--color-text-muted)">
              Tutorial e regras de negócio dos documentos de garantia · área de CCOB
            </p>

            {/*
              `title` no iframe é o que o leitor de tela anuncia — sem ele o
              conteúdo embutido fica anônimo. `src` é same-origin (rota da BFF),
              então não há host externo a permitir aqui.
            */}
            <iframe
              src={url}
              title="Documento de Suporte — documentos de garantia"
              className="min-h-0 flex-1 border-0"
            />

            <div className="flex justify-end gap-2 border-t border-(--color-border) px-5 py-3">
              {/*
                Abrir em aba nova é a saída para quem quer o PDF ao lado do
                formulário — e é `<a>`, não `window.open`, para o navegador
                decidir (bloqueador de popup, preferência do usuário).
              */}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={SECONDARY_OUTLINE_BTN}
              >
                Abrir em nova aba
              </a>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
