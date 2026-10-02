import { extractErrorMessage, throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  MinutaAtribuicao,
  ReatribuirAnalistaMinutaPayload,
} from './minuta-atribuicao.types';
import { MinutaAtribuicaoAusenteError } from './minuta-atribuicao.types';

/**
 * Quem responde pela minuta desta oportunidade.
 *
 * ⚠️ **404 vira erro TIPADO**, não uma frase genérica: antes de a oportunidade
 * entrar na fase de minuta não existe atribuição, e isso é o estado correto —
 * não uma falha. É o tipo que faz a tela omitir o card em vez de pintar uma
 * caixa vermelha (a lição do ADO 68256).
 */
export async function getMinutaAtribuicao(
  opportunityId: string,
): Promise<MinutaAtribuicao> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/minuta/atribuicao`,
    ),
    { cache: 'no-store' },
  );

  if (res.status === 404) {
    /*
     * A frase é a do BACKEND — é ele que sabe em que fase a oportunidade está.
     * `extractErrorMessage` é o extrator único do repo e recebe o corpo já
     * parseado (não a `Response`); o `catch` cobre o 404 sem corpo JSON, que o
     * edge pode produzir.
     */
    const body = (await res.json().catch(() => ({}))) as Parameters<
      typeof extractErrorMessage
    >[0];
    throw new MinutaAtribuicaoAusenteError(
      extractErrorMessage(
        body,
        'A oportunidade ainda não entrou na fase de minuta.',
      ),
    );
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao carregar o responsável pela minuta.');
  }

  return (await res.json()) as MinutaAtribuicao;
}

/**
 * Troca o analista responsável pela minuta.
 *
 * O ator é resolvido pelo backend a partir do token da sessão — nunca vai no
 * corpo. A resposta é a atribuição já atualizada, para a tela não precisar de
 * uma segunda leitura (o mesmo contrato da reatribuição da análise).
 */
export async function reatribuirAnalistaMinuta(
  opportunityId: string,
  payload: ReatribuirAnalistaMinutaPayload,
): Promise<MinutaAtribuicao> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/minuta/atribuicao/reatribuir`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao reatribuir o analista da minuta.');
  }

  return (await res.json()) as MinutaAtribuicao;
}
