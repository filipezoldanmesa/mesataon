import { withBasePath } from '@/lib/base-path';
import type { RequerAcaoData, Selo } from './requer-acao-mapping';

/**
 * Fetches the "Requer ação" top-N from the BFF
 * (`/api/dashboard/requer-acao`), which injects the session Bearer server-side.
 *
 * Throws on any non-2xx response so the card can render its error state
 * naming the source — never collapses a failure into an empty-items 200.
 *
 * `selo` é o clique no chip (ADO 67965): o recorte acontece no SERVIDOR, e não
 * sobre os `limit` itens já baixados. Um filtro local sobre 5 de 22 entregaria
 * 1 item sob um chip que diz 18 — e é justamente a contagem do universo que o
 * protótipo afirma (`Críticas 6 · Atenção 3 · Em andamento 5` somam
 * `Exibir todas (14)`).
 *
 * (DASH-F3 / VBR-432 · ADO 67965)
 */
export async function getDashboardRequerAcao(selo?: Selo): Promise<RequerAcaoData> {
  const query = selo ? `?selo=${encodeURIComponent(selo)}` : '';
  const url = withBasePath(`/api/dashboard/requer-acao${query}`);
  const res = await fetch(url, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`Falha ao carregar pendências que requerem ação (${res.status}).`);
  }

  return (await res.json()) as RequerAcaoData;
}
