/**
 * Mapeamento do payload de `GET /v1/dashboard/ativacao-pagamento` para o tipo
 * que o quadro da SPCOM consome.
 *
 * ⚠️ **A BFF nunca faz passthrough cru** (CLAUDE.md §Frontend): o corpo é
 * serializado como `unknown`, então uma divergência de nome compila e só aparece
 * em runtime, como campo vazio na tela.
 */

// ── Forma do backend ─────────────────────────────────────────────────────────

export interface BackendOportunidadeAtivacaoPagamentoItem {
  oportunidadeId: string;
  codigo: string | null;
  clienteNome: string | null;
  fase: string;
  faseLabel: string;
  href: string;
}

export interface BackendDashboardAtivacaoPagamento {
  itens: BackendOportunidadeAtivacaoPagamentoItem[];
  total: number | null;
  page: number | null;
  limit: number | null;
  hasMore: boolean;
  gaps: { secao: string; fonte: string; motivo: string }[];
}

// ── Forma da tela ────────────────────────────────────────────────────────────

export interface OportunidadeAtivacaoPagamentoItem {
  oportunidadeId: string;
  codigo: string | null;
  clienteNome: string | null;
  /**
   * Rótulo pt-BR da fase ("Ativação" / "Em pagamento") — é o que a coluna exibe.
   *
   * ⚠️ O valor de máquina **não** atravessa: a tela não ramifica sobre ele (o
   * `href` já vem pronto), e um enum cru aqui convidaria a derivar dele cor ou
   * rota — regra derivada é do backend.
   */
  faseLabel: string;
  href: string;
}

export interface AtivacaoPagamentoData {
  itens: OportunidadeAtivacaoPagamentoItem[];
  /** Fila inteira — não a página. `null` = fonte degradada. */
  total: number | null;
  page: number | null;
  limit: number | null;
  hasMore: boolean;
  gaps: { secao: string; fonte: string; motivo: string }[];
}

// ── Mapper ───────────────────────────────────────────────────────────────────

export function mapDashboardAtivacaoPagamento(
  raw: BackendDashboardAtivacaoPagamento,
): AtivacaoPagamentoData {
  return {
    itens: (raw.itens ?? []).map((i) => ({
      oportunidadeId: i.oportunidadeId,
      codigo: i.codigo ?? null,
      clienteNome: i.clienteNome ?? null,
      // Rótulo composto pelo backend; valor cru só se ele faltar — e aí o valor
      // de máquina expõe a lacuna, em vez de deixar a célula vazia.
      faseLabel: i.faseLabel || i.fase,
      href: i.href,
    })),
    total: typeof raw.total === 'number' ? raw.total : null,
    page: typeof raw.page === 'number' ? raw.page : null,
    limit: typeof raw.limit === 'number' ? raw.limit : null,
    hasMore: raw.hasMore === true,
    gaps: raw.gaps ?? [],
  };
}
