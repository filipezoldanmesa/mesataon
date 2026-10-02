import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  ValorParametrizadoPayload,
  ValorParametrizadoRow,
  ValoresParametrizadosPage,
} from './financial-item-types.types';

/**
 * BFF client for the "Parâmetros da Oportunidade" amounts (Bug ADO 67585).
 *
 * Same-origin `/api/*` only — the browser never talks to the backend directly,
 * and the session token stays in the httpOnly cookie the Route Handler reads.
 */

export async function listValoresParametrizados(
  tipoProposta?: string,
): Promise<ValoresParametrizadosPage> {
  const query = tipoProposta ? `?tipoProposta=${encodeURIComponent(tipoProposta)}` : '';
  const res = await fetch(withBasePath(`/api/financial-item-types${query}`));
  if (!res.ok) await throwApiError(res, 'Falha ao carregar a parametrização de valores');
  return (await res.json()) as ValoresParametrizadosPage;
}

export async function updateValorParametrizado(
  id: string,
  payload: ValorParametrizadoPayload,
): Promise<ValorParametrizadoRow> {
  const res = await fetch(withBasePath(`/api/financial-item-types/${encodeURIComponent(id)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Falha ao salvar a parametrização de valores');
  return (await res.json()) as ValorParametrizadoRow;
}
