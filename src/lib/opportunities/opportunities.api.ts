import { withBasePath } from '@/lib/base-path';
import type { ListOpportunitiesParams, OpportunityListResult } from './types';

/**
 * Real opportunity listing (journey J2) via the BFF (`/api/opportunities/list`),
 * which injects the session Bearer server-side and calls
 * `GET /v1/opportunities`. Same signature as the mock in
 * `opportunities.mock.ts`, so components swap implementations by prop — the
 * mock stays only for tests.
 */
export async function listOpportunities(
  params: ListOpportunitiesParams = {},
): Promise<OpportunityListResult> {
  const { q, fases, contratosAtivos, franquia, page, limit, sort, dir } = params;
  const searchParams = new URLSearchParams();
  if (q) searchParams.set('q', q);
  // Uma chave por fase (`?fase=ANALISE&fase=MINUTA`) — nada de lista separada
  // por vírgula para a BFF ter de partir.
  for (const fase of fases ?? []) searchParams.append('fase', fase);
  if (contratosAtivos) searchParams.set('contratosAtivos', '1');
  if (franquia) searchParams.set('franquia', franquia);
  if (page !== undefined) searchParams.set('page', String(page));
  if (limit !== undefined) searchParams.set('limit', String(limit));
  // Os dois viajam JUNTOS: `sort` sem `dir` deixaria a BFF escolher um sentido,
  // e `dir` sem `sort` não tem sobre o que incidir. Ausentes ⇒ ordem padrão.
  if (sort && dir) {
    searchParams.set('sort', sort);
    searchParams.set('dir', dir);
  }

  const qs = searchParams.toString();
  const url = withBasePath(`/api/opportunities/list${qs ? `?${qs}` : ''}`);

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Falha ao buscar oportunidades (${res.status}).`);
  }

  return (await res.json()) as OpportunityListResult;
}
