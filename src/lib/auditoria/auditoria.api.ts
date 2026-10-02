import { withBasePath } from '@/lib/base-path';

import type { ListAuditoriaParams, ListAuditoriaResult } from './types';

/**
 * Client for the audit trail BFF (`GET /api/auditoria` → `GET /v1/auditoria`).
 * The BFF already maps the backend payload to the frontend shape.
 */
export async function listAuditoria(
  params: ListAuditoriaParams = {},
): Promise<ListAuditoriaResult> {
  const search = new URLSearchParams();
  if (params.tipo) search.set('tipo', params.tipo);
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.de) search.set('de', params.de);
  if (params.ate) search.set('ate', params.ate);
  if (params.page != null) search.set('page', String(params.page));
  if (params.limit != null) search.set('limit', String(params.limit));

  const qs = search.toString();
  const res = await fetch(withBasePath(`/api/auditoria${qs ? `?${qs}` : ''}`));

  if (!res.ok) {
    throw new Error(`Falha ao carregar registros de auditoria (${res.status}).`);
  }

  return (await res.json()) as ListAuditoriaResult;
}

/**
 * Triggers a CSV export of the audit trail (`GET /api/auditoria/export`).
 * Applies the same filters as the current list view. Returns the CSV as a
 * `Blob` so the caller can create an object URL and trigger a download.
 *
 * Throws on network failure or non-OK HTTP status so the caller can surface a
 * visible error (a silent download failure is worse than an explicit one).
 */
export async function exportAuditoria(
  params: Pick<ListAuditoriaParams, 'tipo' | 'q' | 'de' | 'ate'> = {},
): Promise<Blob> {
  const search = new URLSearchParams();
  if (params.tipo) search.set('tipo', params.tipo);
  if (params.q?.trim()) search.set('q', params.q.trim());
  if (params.de) search.set('de', params.de);
  if (params.ate) search.set('ate', params.ate);

  const qs = search.toString();
  const res = await fetch(
    withBasePath(`/api/auditoria/export${qs ? `?${qs}` : ''}`),
  );

  if (!res.ok) {
    throw new Error(`Falha ao exportar registros de auditoria (${res.status}).`);
  }

  return res.blob();
}
