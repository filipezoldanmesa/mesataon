import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  CatalogoRoyalty,
  CatalogoRoyaltyList,
  CreateCatalogoRoyaltyPayload,
  LimiteRoyaltyParametrizacao,
  LimiteRoyaltyParametrizacaoList,
  CofTemplateList,
  TaxaParametrizacao,
  TaxaParametrizacaoList,
  UpdateCatalogoRoyaltyPayload,
  UpsertLimiteRoyaltyParametrizacaoPayload,
  UpsertTaxaParametrizacaoPayload,
} from './franquia-admin.types';
import { CatalogoRoyaltyConflictError } from './franquia-admin.types';

/** BFF client for the franquia J10 parametrization admin (FRQ-16). */

async function ensureOk(res: Response, action: string): Promise<Response> {
  if (!res.ok) await throwApiError(res, action);
  return res;
}

// ── Catálogo de royalties / Anexo A (HU-13) ─────────────────────────────────

export async function listCatalogoRoyalties(): Promise<CatalogoRoyaltyList> {
  const res = await fetch(
    withBasePath('/api/franquia-parametrizacao/catalogo-royalties'),
  );
  await ensureOk(res, 'Falha ao carregar o catálogo de royalties');
  return (await res.json()) as CatalogoRoyaltyList;
}

export async function createCatalogoRoyalty(
  payload: CreateCatalogoRoyaltyPayload,
): Promise<CatalogoRoyalty> {
  const res = await fetch(
    withBasePath('/api/franquia-parametrizacao/catalogo-royalties'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (res.status === 409) throw new CatalogoRoyaltyConflictError();
  await ensureOk(res, 'Falha ao criar a entrada do catálogo de royalties');
  return (await res.json()) as CatalogoRoyalty;
}

export async function updateCatalogoRoyalty(
  id: string,
  payload: UpdateCatalogoRoyaltyPayload,
): Promise<CatalogoRoyalty> {
  const res = await fetch(
    withBasePath(
      `/api/franquia-parametrizacao/catalogo-royalties/${encodeURIComponent(id)}`,
    ),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (res.status === 409) throw new CatalogoRoyaltyConflictError();
  await ensureOk(res, 'Falha ao atualizar a entrada do catálogo de royalties');
  return (await res.json()) as CatalogoRoyalty;
}

/**
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: `501 Unsupported Request` em
 * qualquer path, sem consultar o origin (ADO 67557/67796). A rota BFF continua
 * aceitando `DELETE` com a mesma implementação, para quem chamar de um ambiente
 * sem o edge no caminho.
 */
export async function deleteCatalogoRoyalty(id: string): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/franquia-parametrizacao/catalogo-royalties/${encodeURIComponent(id)}`,
    ),
    { method: 'POST' },
  );
  await ensureOk(res, 'Falha ao remover a entrada do catálogo de royalties');
}

// ── Taxa de franquia e parcelas (Bugs 67575 / 67594) ────────────────────────

export async function listTaxaParametrizacao(): Promise<TaxaParametrizacaoList> {
  const res = await fetch(
    withBasePath('/api/franquia-parametrizacao/taxa-franquia'),
  );
  await ensureOk(res, 'Falha ao carregar a parametrização de taxa de franquia');
  return (await res.json()) as TaxaParametrizacaoList;
}

export async function upsertTaxaParametrizacao(
  payload: UpsertTaxaParametrizacaoPayload,
): Promise<TaxaParametrizacao> {
  const res = await fetch(
    withBasePath('/api/franquia-parametrizacao/taxa-franquia'),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  await ensureOk(res, 'Falha ao salvar a parametrização de taxa de franquia');
  return (await res.json()) as TaxaParametrizacao;
}

// ── Estrutura de royalties · limites (ADO 67867) ─────────────────────────────

export async function listLimitesRoyalty(): Promise<LimiteRoyaltyParametrizacaoList> {
  const res = await fetch(
    withBasePath('/api/franquia-parametrizacao/limites-royalty'),
  );
  await ensureOk(res, 'Falha ao carregar a parametrização de limites de royalty');
  return (await res.json()) as LimiteRoyaltyParametrizacaoList;
}

export async function upsertLimiteRoyalty(
  payload: UpsertLimiteRoyaltyParametrizacaoPayload,
): Promise<LimiteRoyaltyParametrizacao> {
  const res = await fetch(
    withBasePath('/api/franquia-parametrizacao/limites-royalty'),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  await ensureOk(res, 'Falha ao salvar a parametrização de limites de royalty');
  return (await res.json()) as LimiteRoyaltyParametrizacao;
}

// ── COF por bandeira (17/09/2026) ───────────────────────────────────────────

export async function listCofTemplates(): Promise<CofTemplateList> {
  const res = await fetch(withBasePath('/api/franquia-parametrizacao/cof'));
  await ensureOk(res, 'Falha ao carregar o catálogo da COF');
  return (await res.json()) as CofTemplateList;
}

/**
 * Cadastra uma versão nova da COF de uma bandeira.
 *
 * ⚠️ **Sem `Content-Type` escrito à mão.** O `fetch` compõe o header a partir
 * do `FormData`, com o `boundary` correto; declará-lo aqui produz um multipart
 * que o servidor não parseia.
 */
export async function criarCofTemplate(input: {
  bandeira: string;
  observacoes?: string;
  file: File;
}): Promise<CofTemplateList> {
  const form = new FormData();
  form.append('bandeira', input.bandeira);
  if (input.observacoes) form.append('observacoes', input.observacoes);
  form.append('file', input.file);

  const res = await fetch(withBasePath('/api/franquia-parametrizacao/cof'), {
    method: 'POST',
    body: form,
  });
  await ensureOk(res, 'Falha ao cadastrar a COF');
  return (await res.json()) as CofTemplateList;
}

/** URL de download de uma versão — `withBasePath` obrigatório num `href`. */
export function cofTemplateDownloadHref(templateId: string): string {
  return withBasePath(
    `/api/franquia-parametrizacao/cof/${encodeURIComponent(templateId)}/download`,
  );
}
