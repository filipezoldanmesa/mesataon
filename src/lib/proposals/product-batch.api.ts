import { HttpError, throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type { ProductBatchDraft, ProductBatchRow, ProductBatchRowError } from './product-batch.types';
import { ProductBatchValidationError } from './product-batch.types';
import type { ProductLine } from './types';

/** See `product-batch.types.ts` for the contract of each route. */
function url(proposalId: string, path = ''): string {
  return withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/product-batch${path}`);
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Reads the batch draft (or a fresh one built from the eligible products). */
export async function getProductBatch(proposalId: string): Promise<ProductBatchDraft> {
  const res = await fetch(url(proposalId));
  if (!res.ok) {
    throw new HttpError(`Falha ao carregar os produtos elegíveis (${res.status}).`, res.status);
  }
  return (await res.json()) as ProductBatchDraft;
}

/**
 * Autosave: replaces the draft and returns it recalculated (the sales horizon is
 * derived by the backend). `keepalive` lets the last save survive leaving the page.
 */
export async function saveProductBatchDraft(
  proposalId: string,
  linhas: ProductBatchRow[],
  options: { keepalive?: boolean } = {},
): Promise<ProductBatchDraft> {
  const res = await fetch(url(proposalId), {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ linhas }),
    keepalive: options.keepalive,
  });
  if (!res.ok) await throwApiError(res, 'Falha ao salvar o rascunho dos produtos');
  return (await res.json()) as ProductBatchDraft;
}

/** "Limpar campos": the draft goes back to the fresh suggestions. */
export async function clearProductBatch(proposalId: string): Promise<ProductBatchDraft> {
  const res = await fetch(url(proposalId), { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Falha ao limpar os campos');
  return (await res.json()) as ProductBatchDraft;
}

/** Adds one eligible product to the draft; the backend fills in its suggestions. */
export async function addProductToBatch(
  proposalId: string,
  produtoCodigo: string,
): Promise<ProductBatchRow> {
  const res = await fetch(url(proposalId, '/rows'), {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ produtoCodigo }),
  });
  if (!res.ok) await throwApiError(res, 'Falha ao adicionar o produto');
  return (await res.json()) as ProductBatchRow;
}

/**
 * Saves the selected rows as product lines, all or nothing. A refusal carries
 * one entry per row/field so the screen can point at what is missing.
 */
export async function submitProductBatch(
  proposalId: string,
  linhas: ProductBatchRow[],
): Promise<ProductLine[]> {
  const res = await fetch(url(proposalId, '/submit'), {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ linhas }),
  });
  if (res.ok) return (await res.json()) as ProductLine[];

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    errors?: ProductBatchRowError[];
  };
  const message = body.error ?? body.message ?? `Falha ao salvar os produtos (${res.status}).`;
  if (res.status === 400 && Array.isArray(body.errors)) {
    throw new ProductBatchValidationError(body.errors, message);
  }
  throw new Error(message);
}
