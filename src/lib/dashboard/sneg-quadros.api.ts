import { withBasePath } from '@/lib/base-path';

import type {
  DistribuicaoPorAnalistaData,
  DistribuicaoPorFaseData,
  IndicadoresSnegData,
} from './sneg-quadros-mapping';

/*
 * Clientes dos três quadros da Evolução do Dashboard SNEG. Todos falam com a
 * BFF same-origin — `withBasePath` é obrigatório (string crua responde 404 em
 * todos os ambientes, VBR-626).
 *
 * O 403 ("o widget não é deste perfil") é lançado como erro comum: estes cards
 * só são montados quando o backend manda o widget, então um 403 aqui é
 * divergência real e merece o estado de erro — não um card vazio que afirme
 * "nada a mostrar".
 */

/**
 * @param url JÁ prefixada pelo `withBasePath` no call site — é o literal que
 *   `base-path-coverage.test.ts` varre, então o prefixo tem de estar colado nele.
 */
async function getJson<T>(url: string, params: Record<string, string | undefined>, what: string) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const res = await fetch(`${url}${qs.size > 0 ? `?${qs.toString()}` : ''}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Falha ao carregar ${what} (${res.status}).`);
  return (await res.json()) as T;
}

export function getDistribuicaoPorFase(params: { analistaId?: string } = {}) {
  return getJson<DistribuicaoPorFaseData>(
    withBasePath('/api/dashboard/distribuicao-por-fase'),
    params,
    'a distribuição por fase',
  );
}

export function getDistribuicaoPorAnalista(params: { fase?: string } = {}) {
  return getJson<DistribuicaoPorAnalistaData>(
    withBasePath('/api/dashboard/distribuicao-por-analista'),
    params,
    'a distribuição por analista',
  );
}

export function getIndicadoresSneg(params: { analistaId?: string; atribuicao?: string } = {}) {
  return getJson<IndicadoresSnegData>(
    withBasePath('/api/dashboard/indicadores-sneg'),
    params,
    'os indicadores da SNEG',
  );
}
