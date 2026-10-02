import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

/**
 * Por que o avanço desta oportunidade está travado por pendência obrigatória
 * (21/09/2026) — espelho de `BloqueioAvancoDto`.
 */
export interface BloqueioAvanco {
  /**
   * `true` quando existe pendência obrigatória aberta impedindo o avanço para a
   * próxima etapa. ⚠️ É ELE que acende a interrogação — nunca `areas.length`:
   * pendência sem área nomeada continua travando e sai da lista.
   */
  bloqueado: boolean;
  /**
   * Rótulos pt-BR das áreas, já compostos pelo backend (`Integridade`, nunca
   * `COMPLIANCE`) — o conteúdo do tooltip, renderizado verbatim.
   */
  areas: string[];
}

/**
 * Lê o veredito do gate de pendência obrigatória.
 *
 * ⚠️ **A tela NÃO deriva isto de uma lista de pendências.** O recorte muda por
 * etapa (o GATE 2 conta todas; minuta e envelope excluem as de pagamento —
 * RN-F4-01), e reconstruí-lo aqui acenderia a interrogação sobre um avanço que
 * não está travado.
 */
export async function getBloqueioAvanco(
  opportunityId: string,
): Promise<BloqueioAvanco> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/bloqueio-avanco`,
    ),
    { cache: 'no-store' },
  );

  if (!res.ok) {
    await throwApiError(
      res,
      'Falha ao verificar as pendências obrigatórias desta etapa.',
    );
  }

  return (await res.json()) as BloqueioAvanco;
}
