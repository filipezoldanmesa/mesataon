import { withBasePath } from '@/lib/base-path';
import type { DevolutivasData } from './devolutivas-mapping';

/**
 * Fetches the devolutivas quality KPIs from the BFF
 * (`/api/dashboard/devolutivas`), which injects the session Bearer server-side.
 *
 * A 403 means the devolutivas widget is not available for this persona — it
 * returns a typed sentinel `{ kpis: null, errorFonte: 'widget_indisponível' }`
 * so the card renders a graceful absence instead of an error state.
 *
 * Throws on any other non-2xx response so callers can render an isolated error state.
 *
 * (DASH-F2 / VBR-428)
 */
export async function getDashboardDevolutivas(): Promise<DevolutivasData> {
  const url = withBasePath('/api/dashboard/devolutivas');
  const res = await fetch(url, { cache: 'no-store' });

  if (res.status === 403) {
    return { kpis: null, errorFonte: 'widget_indisponível' };
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar KPIs de devolutivas (${res.status}).`);
  }

  return (await res.json()) as DevolutivasData;
}
