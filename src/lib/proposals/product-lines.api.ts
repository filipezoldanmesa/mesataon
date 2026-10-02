import { HttpError, throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  EligibleProductListing,
  ProductLine,
  UpsertProductLineInput,
} from './types';
import {
  ConsumptionWindowError,
  OpportunityWithoutSalesAreaError,
  PricingReferenceUnavailableError,
  ProductLineValidationError,
  ProductNotEligibleError,
} from './types';

/**
 * Searches eligible products for a proposal via the BFF
 * (`GET /api/proposals/:id/eligible-products?q=`).
 *
 * API contract — F5 produtos e simulação comercial (VBR-100 épico / VBR-102 BE):
 *   GET /v1/proposals/{id}/eligible-products?q=
 *   Response 200: EligibleProductListing
 *   Response 503: { code: "SERVICE_UNAVAILABLE" }
 */
export async function listEligibleProducts(
  proposalId: string,
  q?: string,
  /**
   * Código da Base escolhida no modal. Informado ⇒ cada produto volta com
   * `cpvDisponivel` (VBR-643). Omitido ⇒ `null` em todos, que é o estado
   * correto de "não perguntei".
   */
  base?: string,
): Promise<EligibleProductListing> {
  const search = new URLSearchParams();
  if (q?.trim()) search.set('q', q.trim());
  if (base?.trim()) search.set('base', base.trim());
  const query = search.size > 0 ? `?${search.toString()}` : '';
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/eligible-products${query}`),
  );

  if (res.status === 503) throw new PricingReferenceUnavailableError();

  /*
   * ADO 67913 — sem área de venda na oportunidade não há setor de onde derivar
   * a lista. Detectado pelo CÓDIGO estável, não pela frase: o seletor oferece
   * um CTA de conserto, e casar o texto quebraria na primeira reescrita.
   */
  if (res.status === 422) {
    const body = (await res.json().catch(() => null)) as {
      code?: string;
      message?: string;
    } | null;
    if (body?.code === 'OPPORTUNITY_WITHOUT_SALES_AREA') {
      throw new OpportunityWithoutSalesAreaError(body.message);
    }
    throw new Error(body?.message?.trim() || 'Falha ao buscar produtos elegíveis (422).');
  }

  if (!res.ok) {
    throw new Error(`Falha ao buscar produtos elegíveis (${res.status}).`);
  }

  return (await res.json()) as EligibleProductListing;
}

/**
 * Loads the persisted product lines of a proposal via the BFF
 * (`GET /api/proposals/:id/product-lines`).
 *
 *   GET /v1/proposals/{id}/product-lines
 *   Response 200: ProductLine[] (empty when none added yet)
 */
export async function listProductLines(proposalId: string): Promise<ProductLine[]> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/product-lines`),
  );

  if (!res.ok) {
    throw new HttpError(`Falha ao carregar os produtos da proposta (${res.status}).`, res.status);
  }

  return (await res.json()) as ProductLine[];
}

/**
 * Creates a product line via the BFF (`POST /api/proposals/:id/product-lines`).
 *
 *   POST /v1/proposals/{id}/product-lines
 *   Response 201: ProductLine
 *   Response 400: { code: "PRODUCT_NOT_ELIGIBLE" } — produto não elegível (RN-F5-01)
 *   Response 422: { code: "UNPROCESSABLE_ENTITY" } — janela de consumo inválida (RN-F5-04)
 *   Response 503: { code: "SERVICE_UNAVAILABLE" }
 */
export async function createProductLine(
  proposalId: string,
  input: UpsertProductLineInput,
): Promise<ProductLine> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/product-lines`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  return handleWriteResponse(res, input.produtoCodigo);
}

/**
 * Replaces a product line via the BFF
 * (`PUT /api/proposals/:id/product-lines/:lineId`).
 *
 *   PUT /v1/proposals/{id}/product-lines/{lineId}
 *   Response 200: ProductLine
 *   Response 400/404/422/503: see {@link createProductLine}
 */
export async function updateProductLine(
  proposalId: string,
  lineId: string,
  input: UpsertProductLineInput,
): Promise<ProductLine> {
  const res = await fetch(
    withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/product-lines/${encodeURIComponent(lineId)}`,
    ),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  return handleWriteResponse(res, input.produtoCodigo);
}

/**
 * Removes a product line via the BFF
 * (`POST /api/proposals/:id/product-lines/:lineId`).
 *
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: medido em 20/08/2026 em dev
 * e stage, `501 Unsupported Request` em qualquer path, sem consultar o origin
 * (ADO 67796). Trocar apenas a perna BFF→API não resolveria nada aqui: o clique
 * falharia antes de chegar à BFF. A rota BFF continua aceitando `DELETE` com a
 * mesma implementação, para quem chamar de um ambiente sem o edge no caminho.
 *
 *   POST /v1/proposals/{id}/product-lines:remover
 *   Response 204 | 404
 */
export async function deleteProductLine(proposalId: string, lineId: string): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/product-lines/${encodeURIComponent(lineId)}`,
    ),
    { method: 'POST' },
  );

  if (!res.ok && res.status !== 404) {
    await throwApiError(res, 'Falha ao remover o produto');
  }
}

async function handleWriteResponse(res: Response, produtoCodigo: string): Promise<ProductLine> {
  if (res.status === 400) {
    /*
     * The backend answers 400 for THREE distinct refusals: eligibility
     * (RN-F5-01, `{ code: "PRODUCT_NOT_ELIGIBLE" }`), DTO validation
     * (`{ code: "VALIDATION_ERROR", errors: [{ field, message }] }`) and other
     * domain/integration rejections (`BAD_REQUEST` with another — or no —
     * message). Eligibility is detected by the stable machine-readable code so
     * any rephrasing of the Portuguese display string does not silently
     * mis-classify the error; every other 400 surfaces the backend's own
     * sentence.
     */
    const body = (await res.json().catch(() => null)) as {
      code?: string;
      message?: string;
      errors?: { field?: string; message?: string }[];
    } | null;
    if (body?.code === 'VALIDATION_ERROR' && body.errors?.length) {
      throw new ProductLineValidationError(
        body.errors
          .map((e) => e.message)
          .filter(Boolean)
          .join(' ') || 'Há campos inválidos no produto.',
      );
    }
    if (body?.code === 'PRODUCT_NOT_ELIGIBLE') {
      // A frase do servidor nomeia o conserto conforme o regime da lista
      // (ADO 67951) — descartá-la deixaria a melhoria invisível na tela.
      throw new ProductNotEligibleError(
        produtoCodigo,
        typeof body.message === 'string' ? body.message : undefined,
      );
    }
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    throw new ProductLineValidationError(
      message && message !== 'Requisição inválida.'
        ? message
        : 'Requisição inválida — verifique os campos do produto.',
    );
  }
  if (res.status === 422) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ConsumptionWindowError(body?.message);
  }
  if (res.status === 503) throw new PricingReferenceUnavailableError();

  if (!res.ok) {
    await throwApiError(res, 'Falha ao salvar o produto');
  }

  return (await res.json()) as ProductLine;
}

/**
 * Termos comerciais que o simulador de preço SAP resolveu para o par
 * cliente × material — Bug 67530.
 *
 * ⚠️ Os dois campos têm fontes DIFERENTES. O `incoterm` vem do Salesforce
 * (`Area_De_Vendas__c.Incoterms__c` no setor do produto) e chega mesmo quando o
 * SAP falha; o `prazoPagamento` só existe no retorno do simulador. `null`
 * significa "não há fonte para este termo neste par" — o formulário mantém
 * "Selecione…" e o usuário responde. `outcome` é diagnóstico do ciclo do SAP.
 */
export interface CommercialTerms {
  incoterm: string | null;
  prazoPagamento: string | null;
  outcome: string;
}

/**
 * Sonda incoterm e prazo de pagamento no simulador de preço, via BFF
 * (`POST /api/proposals/:id/product-lines/commercial-terms`).
 *
 * A resposta do negócio em 21/08/2026 tirou o prazo de pagamento do Salesforce
 * (onde ele não existe — medido em 18/08/2026) e o pôs no simulador. A chamada
 * **nunca** bloqueia o formulário: falha ou timeout devolvem os dois campos
 * nulos, que é o comportamento anterior a este pré-preenchimento.
 */
export async function resolveCommercialTerms(
  proposalId: string,
  input: {
    produtoCodigo: string;
    base?: string;
    baseCodigo?: string;
    volume: number;
    /**
     * Incoterm já escolhido no formulário — **insumo da sondagem, não a
     * pergunta** (Bug 67530). A ida ao SAP levava `inco1` em branco e o
     * simulador não devolvia item nenhum; o org nunca o manda vazio. Ausente,
     * o backend resolve pela área de venda do produto.
     */
    incoterm?: string;
  },
): Promise<CommercialTerms> {
  const res = await fetch(
    withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/product-lines/commercial-terms`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao consultar o incoterm e o prazo de pagamento no SAP');
  }

  return (await res.json()) as CommercialTerms;
}

/**
 * Base e incoterm padrão de um produto (Bug 67530) — o que a área de venda da
 * conta publica para o SETOR daquele material.
 *
 * `null` num campo significa "as áreas do setor não dão uma resposta única"; o
 * formulário mantém "Selecione…" e o usuário responde.
 */
export interface ProductDefaults {
  incoterm: string | null;
  baseCodigo: string | null;
  base: string | null;
}

/**
 * Lê os padrões do produto pela BFF
 * (`GET /api/proposals/:id/product-lines/defaults`).
 *
 * ⚠️ **Separada de `resolveCommercialTerms`, e é isso que conserta o bug.** A
 * Base é o gate do simulador (é a chave do CPV), então ela não pode vir da
 * sondagem: o ciclo do SAP leva ~7 s, e com o CPI fora nunca chegaria — e sem
 * Base a tela também não pede o prazo de pagamento. Esta chamada é só Salesforce
 * e responde de imediato.
 */
export async function resolveProductDefaults(
  proposalId: string,
  produtoCodigo: string,
): Promise<ProductDefaults> {
  const res = await fetch(
    withBasePath(
      `/api/proposals/${encodeURIComponent(proposalId)}/product-lines/defaults` +
        `?produtoCodigo=${encodeURIComponent(produtoCodigo)}`,
    ),
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao consultar a base e o incoterm padrão do produto');
  }

  return (await res.json()) as ProductDefaults;
}
