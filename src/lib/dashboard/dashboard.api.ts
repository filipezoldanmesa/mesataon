import { withBasePath } from '@/lib/base-path';
import type { DashboardResumo } from './resumo-mapping';

/**
 * Fetches the executive summary for the authenticated user from the BFF
 * (`/api/dashboard/resumo`), which injects the session Bearer server-side.
 *
 * The BFF handles token injection — this function **never** calls the backend
 * directly.
 *
 * Throws on any non-2xx response (network errors, 5xx, 403) so components can
 * render their error state rather than receiving a silent empty object.
 */
export async function getDashboardResumo(): Promise<DashboardResumo> {
  const url = withBasePath('/api/dashboard/resumo');

  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`Falha ao carregar o resumo executivo (${res.status}).`);
  }

  return (await res.json()) as DashboardResumo;
}
