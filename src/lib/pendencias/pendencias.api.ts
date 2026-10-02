import { withBasePath } from '@/lib/base-path';
import type {
  ListPendenciasParams,
  ListPendenciasResult,
  PendenciaAreaOption,
} from './types';

/**
 * Real pendency listing (journey F3) via the BFF (`/api/pendencias`), which
 * injects the session Bearer server-side and calls `GET /v1/pendencias`.
 * Components swap implementations by prop injection — tests provide stubs
 * directly without any env flag.
 *
 * API Contract — F3 (épico VBR-144 / BE VBR-146):
 *
 *   GET /v1/pendencias
 *     ?status=Aberta|Em tratativa|Resolvida  (optional)
 *     &prioridade=Alta|Média|Baixa           (optional)
 *     &area=<string>                         (optional)
 *     &opportunityId=<id>                    (optional, drives ?opp= banner)
 *     &q=<search term>                       (optional, free-text)
 *     &page=<number>                         (1-based, default 1)
 *     &limit=<number>                        (default 20)
 *
 *   Response 200:
 *     { items: PendenciaSummary[], total: number, kpis: PendenciasKpis }
 */
export async function listPendencias(
  params: ListPendenciasParams = {},
): Promise<ListPendenciasResult> {
  const { status, prioridade, area, opportunityRef, q, page, limit, sla, selo, responsavelId, minhas } = params;
  const searchParams = new URLSearchParams();
  if (status) searchParams.set('status', status);
  if (prioridade) searchParams.set('prioridade', prioridade);
  if (area) searchParams.set('area', area);
  if (opportunityRef) searchParams.set('opportunityRef', opportunityRef);
  if (q) searchParams.set('q', q);
  if (page !== undefined) searchParams.set('page', String(page));
  if (limit !== undefined) searchParams.set('limit', String(limit));
  if (sla) searchParams.set('sla', sla);
  if (selo) searchParams.set('selo', selo);
  if (responsavelId) searchParams.set('responsavelId', responsavelId);
  if (minhas) searchParams.set('minhas', 'true');

  const qs = searchParams.toString();
  const url = withBasePath(`/api/pendencias${qs ? `?${qs}` : ''}`);

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Falha ao buscar pendências (${res.status}).`);
  }

  return (await res.json()) as ListPendenciasResult;
}

/**
 * Vocabulário do filtro "Todas as áreas" (ADO 67912), via a BFF
 * (`/api/pendencias/areas` → `GET /v1/pendencias/areas`).
 *
 * A lista NÃO é montada aqui de propósito: `?area=` é comparado com o token cru
 * no backend, então um rótulo escrito na tela filtra zero linhas — foi assim que
 * a área da Integridade ficou inalcançável e `Jurídico` nunca casou com o
 * `JURIDICO` gravado.
 */
export async function listPendenciaAreas(): Promise<PendenciaAreaOption[]> {
  const res = await fetch(withBasePath('/api/pendencias/areas'));

  if (!res.ok) {
    throw new Error(`Falha ao buscar as áreas de pendência (${res.status}).`);
  }

  return (await res.json()) as PendenciaAreaOption[];
}
