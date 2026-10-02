import { withBasePath } from '@/lib/base-path';

import type { AnalisePreviaData } from './analise-previa-mapping';

export interface AnalisePreviaParams {
  analistaId?: string;
  /** Página 1-based. Só tem efeito com `limit`. */
  page?: number;
  /** Tamanho da página. Ausente devolve a fila inteira (convenção do backend). */
  limit?: number;
}

/**
 * Busca a tabela "Análise Prévia" na BFF (`/api/dashboard/analise-previa`), que
 * injeta o Bearer da sessão server-side.
 *
 * `analistaId`, `page` e `limit` viajam como query param — o filtro e o recorte
 * são do **backend**, e por dois motivos: as opções são calculadas sobre o
 * universo não filtrado (recortar no cliente exigiria manter duas listas em
 * sincronia) e a contagem `total` tem de descrever a fila inteira, não a página.
 *
 * ⚠️ `withBasePath` é obrigatório: `NEXT_PUBLIC_BASE_PATH` é vazio no laptop e
 * preenchido em dev/stage/prod, então uma string crua funciona localmente e
 * responde 404 em todos os ambientes (VBR-626).
 *
 * 403 significa que o widget não é deste perfil — devolve o sentinela tipado em
 * vez de erro, para o card sumir em silêncio como o de devolutivas faz.
 * Qualquer outro não-2xx lança, para o card renderizar o próprio estado de erro.
 */
export async function getDashboardAnalisePrevia(
  params: AnalisePreviaParams = {},
): Promise<AnalisePreviaData> {
  const qs = new URLSearchParams();
  if (params.analistaId) qs.set('analistaId', params.analistaId);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const query = qs.size > 0 ? `?${qs.toString()}` : '';
  const url = withBasePath(`/api/dashboard/analise-previa${query}`);
  const res = await fetch(url, { cache: 'no-store' });

  if (res.status === 403) {
    return {
      itens: [],
      total: null,
      analistas: [],
      page: null,
      limit: null,
      hasMore: false,
      gaps: [],
    };
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar a análise prévia (${res.status}).`);
  }

  return (await res.json()) as AnalisePreviaData;
}
