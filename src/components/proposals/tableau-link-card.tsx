"use client";

import { useCallback, useState } from "react";

import {
  CardCollapseToggle,
  useCardCollapse,
} from "@/components/proposals/card-collapse";
import { TableauModal } from "@/components/proposals/tableau-modal";

/**
 * TableauLinkCard
 *
 * Card "Inteligência de mercado": um card titulado e colapsável cujo corpo
 * inteiro é o CTA. Sem caixa tracejada de placeholder, sem frase explicativa e
 * **sem** requisição de API (CA-4) — ele substituiu o antigo
 * `MarketIntelligenceBlock`, que disparava
 * `GET /api/proposals/:id/market-intelligence` a cada mount.
 *
 * ⚠️ **O CTA abre um MODAL, não uma aba** (decisão de produto de 27/08/2026):
 * o painel é insumo da proposta que está sendo preenchida na página de trás, e
 * mandá-lo para outra aba obriga o analista a memorizar números e voltar. Quem
 * emoldura — e por que a URL emoldurada não é a configurada — é o
 * {@link TableauModal}. A saída para nova aba **continua existindo**, dentro do
 * modal: a recusa de `X-Frame-Options` é silenciosa no navegador, então ela é a
 * única coisa entre o usuário e um retângulo vazio.
 *
 * De onde vem o destino: `NEXT_PUBLIC_TABLEAU_MARKET_URL`. É **build-time** (o
 * Next.js a inlina no bundle), então viaja por `--build-arg` no
 * `apps/web/Dockerfile` e nos `build-*.yml` — defini-la na task do ECS não tem
 * efeito nenhum no código que roda no browser. Essa variável é o único botão;
 * aponte-a para onde quiser e o card segue.
 *
 * Enquanto ela não estiver definida o CTA **continua renderizando e clicável** —
 * preservando a reversão da CA-3 da VBR-503 — e o modal diz que o endereço não
 * foi configurado, nomeando a variável. Isso substitui o antigo `about:blank`,
 * que era honesto sobre não haver nada lá mas não dizia por quê; o que a CA-3
 * proibia era `href="#"`, que não é destino nenhum (fica na página e a rola para
 * o topo, então um link que funciona lê como quebrado).
 */

/** O botão outline do protótipo. */
const CTA_CLASS =
  "inline-block cursor-pointer rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--neutral-40) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-600) transition hover:bg-(--neutral-100)";

type Props = {
  /** Injetável para testes; default `NEXT_PUBLIC_TABLEAU_MARKET_URL`. */
  tableauUrl?: string;
};

export function TableauLinkCard({
  tableauUrl = process.env.NEXT_PUBLIC_TABLEAU_MARKET_URL,
}: Props) {
  // Protótipo: todo card `.block` colapsa pelo próprio header (`initCollapse`
  // do ciclo1.js), começando aberto.
  const collapse = useCardCollapse();
  const [open, setOpen] = useState(false);
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <section
      aria-labelledby="tableau-link-card-title"
      {...collapse.sectionProps}
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      <h3
        id="tableau-link-card-title"
        {...collapse.headProps}
        className="mb-3 flex items-center gap-2.5 text-(length:--t-h4) font-bold"
      >
        Inteligência de mercado
        <CardCollapseToggle {...collapse.toggleProps} />
      </h3>

      {/*
       * `<button>`, não `<a>`: ele ABRE UM PAINEL nesta página. Um link
       * anunciaria navegação que não acontece, e um `href` real seria alcançável
       * por ctrl+clique, contornando o modal em silêncio.
       */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="tableau-link"
        // Marca o estado não configurado para ficar greppável e para um teste
        // distinguir "configurado" de "placeholder".
        data-placeholder={tableauUrl ? undefined : "true"}
        className={CTA_CLASS}
      >
        ↻ Consultar Tableau
      </button>

      {/*
       * O modal é filho do card, e o card colapsa escondendo tudo o que não é o
       * header — mas `[role="dialog"]` é isento dessa regra de propósito
       * (`globals.css`), então recolher o card com o painel aberto não o faz
       * desaparecer.
       */}
      <TableauModal open={open} tableauUrl={tableauUrl} onClose={handleClose} />
    </section>
  );
}
