import { withBasePath } from '@/lib/base-path';
import {
  ClientNotFoundError,
  type ClientDetail,
  type ClientSummary,
  type PortfolioParams,
  type PortfolioResult,
} from './types';

/**
 * Client search (journey J1) via the BFF (`/api/clients`), which injects the
 * session Bearer server-side and calls the backend (`GET /v1/customers`).
 * Components accept the function as an injectable prop so tests can swap it.
 */
export async function searchClients(query: string): Promise<ClientSummary[]> {
  const q = query.trim();
  if (q === '') return [];

  const res = await fetch(withBasePath(`/api/clients?q=${encodeURIComponent(q)}`));

  if (!res.ok) {
    throw new Error(`Falha ao buscar clientes (${res.status}).`);
  }

  return (await res.json()) as ClientSummary[];
}

/**
 * Loads the client portfolio (journey J1 — `/clientes` list) via the BFF
 * (`/api/clients/portfolio`), which proxies `GET /v1/customers/portfolio` and
 * maps its envelope to `PortfolioResult` (items + tab counts + pagination metadata).
 * Accepts server-side filtering, sorting, and pagination params.
 */
export async function getPortfolio(params: PortfolioParams = {}): Promise<PortfolioResult> {
  const url = new URL(withBasePath('/api/clients/portfolio'), 'http://localhost');

  if (params.page !== undefined) url.searchParams.set('page', String(params.page));
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.tab && params.tab !== 'todos') url.searchParams.set('tab', params.tab);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.sortBy) url.searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) url.searchParams.set('sortOrder', params.sortOrder);

  const res = await fetch(url.pathname + url.search);

  if (!res.ok) {
    throw new Error(`Falha ao buscar a carteira de clientes (${res.status}).`);
  }

  return (await res.json()) as PortfolioResult;
}

/**
 * Resolves a single client for the 360º view (`/clientes/[id]`) via the BFF
 * (`/api/clients/[id]`), which proxies `GET /v1/customers/:sapCode/360`. The
 * BFF surfaces a 404 (unknown SAP code — e.g. a prospect id) as
 * {@link ClientNotFoundError}, matching the mock's contract.
 */
export async function getClient(id: string): Promise<ClientDetail> {
  const res = await fetch(withBasePath(`/api/clients/${encodeURIComponent(id)}`));

  if (res.status === 404) {
    throw new ClientNotFoundError(id);
  }
  if (!res.ok) {
    throw new Error(`Falha ao buscar o cliente (${res.status}).`);
  }

  return (await res.json()) as ClientDetail;
}
