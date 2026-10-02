'use client';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** Página atual, 1-based. */
  page: number;
  /** Tamanho da página — só serve para dizer "de N páginas". */
  limit: number;
  /**
   * Total do conjunto filtrado INTEIRO (não da página).
   *
   * `null` quando a fonte degradou: aí o rodapé omite a contagem em vez de
   * escrever `0 resultados`, que afirmaria uma lista vazia.
   */
  total: number | null;
  /** Veredito do backend — nunca `page * limit < total` recalculado aqui. */
  hasMore: boolean;
  onPageChange: (page: number) => void;
  /** Nome do que está sendo paginado, para o `aria-label` dos botões. */
  label: string;
};

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

/**
 * Rodapé de paginação dos quadros do dashboard.
 *
 * Mesma marcação (e mesmos tokens) do rodapé que a listagem de oportunidades já
 * usava — o que muda é que aqui ela vive uma vez só, porque três quadros
 * passaram a paginar no mesmo PR (ADO 68531). A listagem **não** foi migrada de
 * propósito: o rodapé dela tem contagem própria e mexer nela arrastaria a suíte
 * inteira de `opportunity-list` para um PR que não é sobre a listagem.
 *
 * ## Decisões
 *
 * - **Nada a paginar ⇒ não renderiza.** Primeira página sem continuação é uma
 *   lista inteira; um rodapé com os dois botões desabilitados é controle morto.
 * - **`hasMore` vem do backend.** Recalculá-lo aqui seria a segunda cópia da
 *   regra, e ela erraria exatamente na última página curta.
 * - **A contagem de páginas só aparece quando dá para calculá-la** (`total`
 *   presente). Fonte degradada mantém os botões — o usuário continua navegando —
 *   e omite o número, em vez de inventar um.
 */
export function Paginacao({ page, limit, total, hasMore, onPageChange, label }: Props) {
  if (page <= 1 && !hasMore) {
    return null;
  }

  const totalPaginas = total !== null && limit > 0 ? Math.ceil(total / limit) : null;

  return (
    <nav
      aria-label={`Paginação de ${label}`}
      className="mt-4 flex items-center justify-between text-(length:--t-caption) text-(--color-text-muted)"
    >
      <span>
        Página <b>{page}</b>
        {totalPaginas !== null && totalPaginas > 1 ? (
          <>
            {' '}
            de <b>{totalPaginas}</b>
          </>
        ) : null}
        {total !== null ? (
          <>
            {' '}
            · <b>{total}</b> {total === 1 ? 'resultado' : 'resultados'}
          </>
        ) : null}
      </span>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          aria-label={`Página anterior de ${label}`}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="rounded-(--radius-xs) border border-(--color-border) px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40 hover:not-disabled:bg-(--neutral-40)"
        >
          ← Anterior
        </button>
        <button
          type="button"
          disabled={!hasMore}
          aria-label={`Próxima página de ${label}`}
          onClick={() => onPageChange(page + 1)}
          className="rounded-(--radius-xs) border border-(--color-border) px-3 py-1.5 font-bold disabled:cursor-not-allowed disabled:opacity-40 hover:not-disabled:bg-(--neutral-40)"
        >
          Próxima →
        </button>
      </div>
    </nav>
  );
}
