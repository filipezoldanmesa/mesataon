import { withBasePath } from '@/lib/base-path';

import type { AtivacaoPagamentoData } from './ativacao-pagamento-mapping';

export interface AtivacaoPagamentoParams {
  /** Página 1-based. Só tem efeito com `limit`. */
  page?: number;
  /** Tamanho da página. Ausente devolve a fila inteira. */
  limit?: number;
}

/**
 * Busca o quadro "Oportunidades em ativação e em pagamento" na BFF, que injeta o
 * Bearer da sessão server-side.
 *
 * ⚠️ `withBasePath` é obrigatório: `NEXT_PUBLIC_BASE_PATH` é vazio no laptop e
 * preenchido em dev/stage/prod, então uma string crua funciona localmente e
 * responde 404 em todos os ambientes (VBR-626).
 *
 * 403 significa que o widget não é deste perfil — devolve o sentinela tipado em
 * vez de erro, para o card sumir em silêncio como os irmãos fazem.
 */
export async function getDashboardAtivacaoPagamento(
  params: AtivacaoPagamentoParams = {},
): Promise<AtivacaoPagamentoData> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const query = qs.size > 0 ? `?${qs.toString()}` : '';
  const url = withBasePath(`/api/dashboard/ativacao-pagamento${query}`);
  const res = await fetch(url, { cache: 'no-store' });

  if (res.status === 403) {
    return { itens: [], total: null, page: null, limit: null, hasMore: false, gaps: [] };
  }

  if (!res.ok) {
    throw new Error(
      `Falha ao carregar as oportunidades em ativação e em pagamento (${res.status}).`,
    );
  }

  return (await res.json()) as AtivacaoPagamentoData;
}
