import { apiUrl } from '@/lib/base-path';

import { extractErrorMessage, HttpError, throwApiError } from '@/lib/api-errors';

import type {
  CreateFinancialItemInput,
  FinancialItem,
  FinancialItemMutationResult,
  FinancialItemsSnapshot,
  FinancialItemType,
  FinancialSummary,
  SeedRequiredResult,
  UpdateFinancialItemInput,
} from './financial-items.types';
import {
  FinancialItemCriticaError,
  FinancialItemNotFoundError,
  GnvVolumeInvalidError,
  RequiredItemConflictError,
} from './financial-items.types';

/**
 * Real financial-items client — calls the BFF routes
 * (`/api/proposals/:id/financial-item*`), which inject the httpOnly session
 * Bearer server-side. Components import via financial-items.data.ts (which
 * re-exports this module directly — the in-memory mock has been removed).
 */

function base(proposalId: string, ...sub: string[]): string {
  // Sub-path via `apiUrl`, never concatenated onto an already-prefixed string
  // (that yields `//` because the prefixed form ends in "/").
  return apiUrl('proposals', proposalId, 'financial-items', ...sub);
}

/** Reads the error body and returns the most specific human sentence. */
async function readMsg(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return extractErrorMessage(body, fallback);
}

/**
 * Disambiguates a 400 response from create/update. Two distinct shapes can
 * reach here: class-validator field failures (e.g. `valor` failing
 * `@IsPositive()`) return `{ code: 'VALIDATION_ERROR', errors: [{field,
 * message}] }` with no top-level `message`, while the RN-F9-04 GNV/CTF rule
 * returns `{ code: 'BAD_REQUEST', message }` via `BadRequestAppException`.
 * Only the latter is actually the "GNV volume invalid" case — assuming every
 * 400 is GNV-related shows a wrong, confusing message for other validation
 * failures (e.g. valor <= 0).
 */
async function classifyFinancialItem400(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    errors?: { field: string; message: string }[];
  };
  if (body.code === 'VALIDATION_ERROR' && body.errors?.length) {
    return new FinancialItemCriticaError(
      extractErrorMessage(body, 'Erro de validação no item financeiro.'),
    );
  }
  return new GnvVolumeInvalidError(
    body.message ?? 'Volume GNV/CTF inválido para este tipo de item.',
  );
}

export async function listFinancialItemTypes(proposalId: string): Promise<FinancialItemType[]> {
  const res = await fetch(
    apiUrl('proposals', proposalId, 'financial-item-types'),
  );
  if (!res.ok) {
    throw new HttpError(`Falha ao carregar os tipos de item financeiro (${res.status}).`, res.status);
  }
  const body = (await res.json()) as { items: FinancialItemType[] };
  return body.items;
}

export async function listFinancialItems(proposalId: string): Promise<FinancialItemsSnapshot> {
  const res = await fetch(base(proposalId));
  if (!res.ok) {
    throw new HttpError(`Falha ao carregar as receitas e despesas (${res.status}).`, res.status);
  }
  return (await res.json()) as FinancialItemsSnapshot;
}

export async function seedRequiredFinancialItems(proposalId: string): Promise<SeedRequiredResult> {
  const res = await fetch(base(proposalId, 'seed-required'), { method: 'POST' });
  if (!res.ok) {
    await throwApiError(res, 'Falha ao carregar as receitas e despesas');
  }
  return (await res.json()) as SeedRequiredResult;
}

export async function createFinancialItem(
  proposalId: string,
  input: CreateFinancialItemInput,
): Promise<FinancialItemMutationResult> {
  const res = await fetch(base(proposalId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (res.status === 404) {
    throw new FinancialItemNotFoundError(
      await readMsg(res, 'Proposta ou tipo de item financeiro não encontrado.'),
    );
  }
  if (res.status === 422) {
    throw new FinancialItemCriticaError(
      await readMsg(
        res,
        'As datas do item devem estar dentro do horizonte de análise da proposta e o tipo não pode se repetir.',
      ),
    );
  }
  if (res.status === 400) {
    throw await classifyFinancialItem400(res);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao adicionar item financeiro');
  }

  const body = (await res.json()) as { item: FinancialItem; summary: FinancialSummary };
  return { item: body.item, summary: body.summary };
}

export async function updateFinancialItem(
  proposalId: string,
  itemId: string,
  input: UpdateFinancialItemInput,
): Promise<FinancialItemMutationResult> {
  const res = await fetch(base(proposalId, itemId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (res.status === 404) {
    throw new FinancialItemNotFoundError(
      await readMsg(res, 'Item financeiro não encontrado nesta proposta.'),
    );
  }
  if (res.status === 422) {
    // Duas recusas distintas chegam aqui: campo de catálogo de item obrigatório
    // (VBR-584) e alteração estrutural fora de EM_PREENCHIMENTO/DEVOLVIDA. O
    // backend nomeia qual — o fallback só cobre resposta sem corpo.
    throw new FinancialItemCriticaError(
      await readMsg(res, 'Alteração não permitida para este item.'),
    );
  }
  if (res.status === 400) {
    throw await classifyFinancialItem400(res);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao atualizar item financeiro');
  }

  const body = (await res.json()) as { item: FinancialItem; summary: FinancialSummary };
  return { item: body.item, summary: body.summary };
}

/**
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: `501 Unsupported Request` em
 * qualquer path, sem consultar o origin (ADO 67557/67796). A rota BFF continua
 * aceitando `DELETE` com a mesma implementação, para quem chamar de um ambiente
 * sem o edge no caminho.
 */
export async function deleteFinancialItem(proposalId: string, itemId: string): Promise<void> {
  const res = await fetch(base(proposalId, itemId), { method: 'POST' });

  if (res.status === 409) {
    throw new RequiredItemConflictError(
      await readMsg(res, 'Item obrigatório não pode ser removido sem autorização (bypass).'),
    );
  }
  if (res.status === 404) {
    throw new FinancialItemNotFoundError(
      await readMsg(res, 'Item financeiro não encontrado nesta proposta.'),
    );
  }
  if (!res.ok && res.status !== 204) {
    await throwApiError(res, 'Falha ao remover item financeiro');
  }
}
