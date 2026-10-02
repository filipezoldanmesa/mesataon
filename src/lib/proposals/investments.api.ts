import { withBasePath } from '@/lib/base-path';

import { extractErrorMessage, HttpError } from '@/lib/api-errors';

import {
  InvestmentSaveError,
  type CreateInvestmentInput,
  type Investment,
  type InvestmentsListResult,
  type UpdateInvestmentInput,
} from './investments.types';

function base(proposalId: string): string {
  return withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/investments`);
}

/** `GET /v1/proposals/{id}/investments` via a BFF. */
export async function getInvestments(proposalId: string): Promise<InvestmentsListResult> {
  const res = await fetch(base(proposalId));

  if (!res.ok) {
    // NOT an empty list: a failure must reach the component so it renders its
    // error state. Translating it to `[]` would make the card state "this
    // proposal has no investments" — a claim the API never made.
    throw new HttpError(`Falha ao carregar os investimentos (${res.status}).`, res.status);
  }

  return (await res.json()) as InvestmentsListResult;
}

async function saveError(res: Response, fallback: string): Promise<InvestmentSaveError> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return new InvestmentSaveError(extractErrorMessage(body, fallback));
}

export async function createInvestment(
  proposalId: string,
  input: CreateInvestmentInput,
): Promise<Investment> {
  const res = await fetch(base(proposalId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw await saveError(res, `Falha ao adicionar o investimento (${res.status}).`);
  }

  return (await res.json()) as Investment;
}

export async function updateInvestment(
  proposalId: string,
  investmentId: string,
  input: UpdateInvestmentInput,
): Promise<Investment> {
  const res = await fetch(`${base(proposalId)}/${encodeURIComponent(investmentId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw await saveError(res, `Falha ao salvar o investimento (${res.status}).`);
  }

  return (await res.json()) as Investment;
}

/**
 * Remove um investimento — por **`POST`**, nunca `DELETE`.
 *
 * ⚠️ O host do web está atrás do MESMO edge (Akamai) que responde
 * `501 Unsupported Request` a todo `DELETE` em dev e stage, sem consultar o
 * origin: com `DELETE` o clique falhava ANTES de chegar à BFF, então trocar só
 * a perna BFF→API não resolveria (ADO 67557/67796 · 68425).
 *
 * O corpo `{}` existe porque `POST` sem `Content-Length` volta `411` do próprio
 * Akamai; o id do investimento continua no path desta rota da BFF, que é quem
 * o move para o corpo da rota de ação do backend.
 */
export async function deleteInvestment(
  proposalId: string,
  investmentId: string,
): Promise<void> {
  const res = await fetch(`${base(proposalId)}/${encodeURIComponent(investmentId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!res.ok) {
    throw await saveError(res, `Falha ao remover o investimento (${res.status}).`);
  }
}
