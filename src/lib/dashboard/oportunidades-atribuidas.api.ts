import { withBasePath } from '@/lib/base-path';

import {
  ContagemAtribuidas,
  type OportunidadesAtribuidasData,
} from './oportunidades-atribuidas-mapping';

export interface OportunidadesAtribuidasParams {
  /**
   * Filtro por analista.
   *
   * ⚠️ A tela manda o que o usuário escolheu; **quem decide se ele vale é o
   * backend** — para quem vê só as próprias atribuições o parâmetro é ignorado.
   * A alternativa (a tela perguntar a persona antes de montar a URL) poria a
   * regra de recorte nos dois lados.
   */
  analistaId?: string;
  /** Página 1-based. Só tem efeito com `limit`. */
  page?: number;
  /** Tamanho da página. Ausente devolve o quadro inteiro. */
  limit?: number;
}

/**
 * Busca o quadro "Oportunidades atribuídas" na BFF
 * (`/api/dashboard/oportunidades-atribuidas`), que injeta o Bearer da sessão
 * server-side.
 *
 * ⚠️ `withBasePath` é obrigatório: `NEXT_PUBLIC_BASE_PATH` é vazio no laptop e
 * preenchido em dev/stage/prod, então uma string crua funciona localmente e
 * responde 404 em todos os ambientes (VBR-626).
 *
 * 403 significa que o widget não é deste perfil — devolve o sentinela tipado em
 * vez de erro, para o card sumir em silêncio como os irmãos fazem. Qualquer
 * outro não-2xx lança, para o card renderizar o próprio estado de erro.
 */
export async function getDashboardOportunidadesAtribuidas(
  params: OportunidadesAtribuidasParams = {},
): Promise<OportunidadesAtribuidasData> {
  const qs = new URLSearchParams();
  if (params.analistaId) qs.set('analistaId', params.analistaId);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const query = qs.size > 0 ? `?${qs.toString()}` : '';
  const url = withBasePath(`/api/dashboard/oportunidades-atribuidas${query}`);
  const res = await fetch(url, { cache: 'no-store' });

  if (res.status === 403) {
    return {
      itens: [],
      total: null,
      contagem: ContagemAtribuidas.Atribuicoes,
      analistas: [],
      page: null,
      limit: null,
      hasMore: false,
      gaps: [],
    };
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar as oportunidades atribuídas (${res.status}).`);
  }

  return (await res.json()) as OportunidadesAtribuidasData;
}
