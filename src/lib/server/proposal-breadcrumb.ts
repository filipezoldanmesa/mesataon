import { cookies } from 'next/headers';

import { shortProposalCode } from '@/lib/proposals/proposal-code';
import { SESSION_COOKIE, backendUrl } from '@/lib/server/session';

/**
 * O que as páginas de proposta decidem ANTES de renderizar: o código de negócio
 * do breadcrumb e o TIPO, que diz se a tela é a certa.
 *
 * ## Por que compartilhado
 *
 * As duas rotas de proposta — a genérica (posto) e a `/franquia` — mostram o
 * mesmo identificador no mesmo lugar, e só a primeira o resolvia. Medido em
 * staging em 07/09/2026: a tela de franquia exibia `P-DE9D1F48 · Franquia`
 * (o `P-` + 8 do UUID, que é o último recurso de {@link shortProposalCode})
 * enquanto o card da oportunidade, ao lado, mostrava `PCR-GOP-00000096/2026`
 * para a MESMA proposta — o defeito que o ADO 68185 corrigiu no código e que
 * sobrevivia aqui, no lugar mais visível.
 *
 * Duas cópias desta leitura divergiriam de novo: uma delas seria a esquecida no
 * dia em que o código mudar de fonte (foi o que aconteceu com o `P-542F8152`
 * do anexo daquele ticket).
 *
 * ## Degradação
 *
 * Sem sessão, com resposta não-ok ou com erro de rede, devolve o rótulo
 * derivado do id — a tela não é redirecionada nem quebrada por uma leitura de
 * breadcrumb. Redirecionar sobre uma leitura que falhou seria um palpite.
 *
 * Server-to-server por `backendUrl` (DNS do container): a chamada não sai da
 * rede do Docker e não passa pelo basePath.
 */
export async function resolveProposalBreadcrumb(
  proposalId: string,
): Promise<{ codigo: string; tipoProposta: string | null }> {
  const fallback = { codigo: shortProposalCode(proposalId), tipoProposta: null };

  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return fallback;

  try {
    const res = await fetch(
      backendUrl(`/v1/proposals/${encodeURIComponent(proposalId)}`),
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      codigo?: string | null;
      tipoProposta?: string | null;
    };
    return {
      codigo: shortProposalCode(proposalId, data.codigo),
      tipoProposta: data.tipoProposta ?? null,
    };
  } catch {
    return fallback;
  }
}
