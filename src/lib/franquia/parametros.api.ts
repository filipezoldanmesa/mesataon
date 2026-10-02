/**
 * BFF client for the franchise commercial-parameter mutations (FRQ-12).
 *
 * Every call goes to a same-origin Route Handler under `/api/*`; the handler
 * attaches the Bearer from the httpOnly session cookie.
 *
 * API contract (FRQ-F2 — RN-F2-01..08):
 *
 *   PUT    .../franquia/{proposalId}/modelo-loja                → 200 | 400 | 404
 *   PUT    .../franquia/{proposalId}/royalty                    → 200 | 400 | 403 | 404
 *   PUT    .../franquia/{proposalId}/maturacao                  → 200 | 400 | 403 | 404
 *   POST   .../franquia/{proposalId}/royalty-premiado:aceitar   → 200 | 400 | 403 | 404
 *   POST   .../franquia/{proposalId}/excecoes                   → 201 | 400 | 403 | 404
 *   DELETE .../franquia/{proposalId}/excecoes/{excecaoId}       → 204 | 403 | 404
 *   GET    /franquia-parametrizacao/catalogo-royalties/validacoes → 200 | 503
 */

import { apiUrl } from '@/lib/base-path';

import type {
  FormatoLoja,
  ModeloNegocio,
  ModeloRoyalty,
} from './types';

import {
  FranquiaValidationError,
  throwFranquiaError,
} from './client-errors';

// Re-exported so existing consumers keep importing it from here.
export { FranquiaValidationError };

/**
 * Segmentos comuns das rotas BFF desta proposta de franquia.
 *
 * ⚠️ Devolve SEGMENTOS, não uma URL. Este helper aplicava `withBasePath` e cada
 * call site reaplicava sobre a concatenação, o que o docblock de `withBasePath`
 * proíbe: com basePath configurado o resultado termina em "/", e a composição
 * produzia `…/franquia/<id>//modelo-loja` — caminho que a regra `/prefix/*` do
 * ALB não casa. Invisível no laptop (BASE_PATH vazio ⇒ identidade), 404 em
 * dev/stage/prod. Ver `proposta-franquia.api.ts`, que tinha o mesmo defeito.
 */
function baseSegments(opportunityId: string, proposalId: string): Array<string | number> {
  return ['opportunities', opportunityId, 'franquia', proposalId];
}

/**
 * Reads the error body once and turns a business rejection into
 * {@link FranquiaValidationError} carrying the backend's own sentence — the
 * screen must show the rule that was violated, not a paraphrase of it.
 */
const throwForStatus = throwFranquiaError;

// ---------------------------------------------------------------------------
// Modelo de loja e parâmetros comerciais (HU-03.1)
// ---------------------------------------------------------------------------

export interface SetModeloLojaPayload {
  /**
   * Descriptive attribute — it does NOT resolve the Anexo A band. Vibra decided
   * on 13/08/2026 that stores of the same format and revenue pay the same
   * percentage regardless of the posto type (backend migration `…074`), so the
   * backend made it optional. Send it when the screen collects it; omitting it
   * leaves whatever was already persisted.
   */
  modeloNegocio?: ModeloNegocio;
  formatoLoja: FormatoLoja;
  modeloRoyalty: ModeloRoyalty;
  /** Monthly revenue in BRL. Omitted keeps whatever is stored. */
  faturamentoPropostoBrl?: number | null;
}

export interface SetModeloLojaResult {
  franquiaId: string;
  /** `null` when the caller did not inform it. */
  modeloNegocio: ModeloNegocio | null;
  formatoLoja: FormatoLoja;
  modeloRoyalty: ModeloRoyalty;
  /** `true` when the Anexo A band was matched and applied automatically. */
  catalogoAplicado: boolean;
  /**
   * `true` when the royalty catalog (Anexo A) has no entries and the automatic
   * band lookup was skipped. Distinct from `catalogoAplicado = false`, which
   * means the catalog exists but no band matched the provided revenue / key.
   * When `true`, the parametrization team must seed the catalog.
   */
  catalogoIndisponivel: boolean;
  /**
   * Default franchise fee (BRL) THIS call pre-filled from the bandeira × formato
   * parametrization (Bugs 67575 / 67594). `null` when nothing was seeded —
   * either the combination has no default, or the fee had already been answered
   * by a person and must not be overwritten.
   */
  taxaFranquiaDefaultBrl: string | null;
}

export async function setModeloLoja(
  opportunityId: string,
  proposalId: string,
  payload: SetModeloLojaPayload,
): Promise<SetModeloLojaResult> {
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'modelo-loja'),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );

  if (!res.ok) await throwForStatus(res, 'Falha ao salvar o modelo de loja');
  return (await res.json()) as SetModeloLojaResult;
}

// ---------------------------------------------------------------------------
// Estrutura de royalties · limites (HU-04 / HU-04b.1 — RN-F2-04/06)
// ---------------------------------------------------------------------------

export interface SetRoyaltyEstruturaPayload {
  percentualBps?: number | null;
  pisoBrl?: number | null;
  tetoBrl?: number | null;
  valorFixoBrl?: number | null;
  valorMinimoMensalBrl?: number | null;
  fundoMktPercBps?: number | null;
  /** Flat monthly marketing fund (BRL) — the field a VALOR_FIXO band fills. */
  fundoMktValorFixoBrl?: number | null;
  taxaFranquiaBrl?: number | null;
  taxaFranquiaParcelas?: number | null;
  /**
   * Isenção da taxa de franquia (ADO 68495). Omitido mantém o gravado; `null`
   * limpa. É a marcação que o SAP/SD lê para cobrar a taxa do franqueado, e o
   * GATE 1 recusa o envio à análise enquanto ela não existir.
   */
  isencaoTaxaFranquia?: boolean | null;
}

export interface SetRoyaltyEstruturaResult {
  franquiaId: string;
  percentualBps: number | null;
  pisoBrl: string | null;
  tetoBrl: string | null;
  valorFixoBrl: string | null;
  valorMinimoMensalBrl: string | null;
  fundoMktPercBps: number | null;
  fundoMktValorFixoBrl: string | null;
  taxaFranquiaBrl: string | null;
  taxaFranquiaParcelas: number | null;
  isencaoTaxaFranquia: boolean | null;
}

export async function setRoyaltyEstrutura(
  opportunityId: string,
  proposalId: string,
  payload: SetRoyaltyEstruturaPayload,
): Promise<SetRoyaltyEstruturaResult> {
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'royalty'),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );

  if (!res.ok) await throwForStatus(res, 'Falha ao salvar a estrutura de royalties');
  return (await res.json()) as SetRoyaltyEstruturaResult;
}

// ---------------------------------------------------------------------------
// Maturação (RN-F2-05)
// ---------------------------------------------------------------------------

export interface SetMaturacaoPayload {
  isMaturada: boolean;
  maturacaoInicioEm?: string | null;
  maturacaoMesesTotal?: number | null;
  maturacaoPercentualBps?: number | null;
  maturacaoValorFixoBrl?: number | null;
}

export interface SetMaturacaoResult {
  franquiaId: string;
  isMaturada: boolean | null;
  maturacaoInicioEm: string | null;
  maturacaoMesesTotal: number | null;
  maturacaoPercentualBps: number | null;
  maturacaoValorFixoBrl: string | null;
}

export async function setMaturacao(
  opportunityId: string,
  proposalId: string,
  payload: SetMaturacaoPayload,
): Promise<SetMaturacaoResult> {
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'maturacao'),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );

  if (!res.ok) await throwForStatus(res, 'Falha ao salvar a maturação');
  return (await res.json()) as SetMaturacaoResult;
}

// ---------------------------------------------------------------------------
// Royalty Premiado — irreversible accept (RN-F2-07)
// ---------------------------------------------------------------------------

export interface AcceptRoyaltyPremiadoResult {
  franquiaId: string;
  royaltyPremiadoAtivo: boolean;
  royaltyPremiadoPercentualBps: number;
}

/**
 * Accepts the Royalty Premiado. **Irreversible** — the backend answers 400 on a
 * second attempt, and the read model then reports
 * `vereditos.royaltyPremiadoIrreversivel = true` so the UI stops offering it.
 */
export async function aceitarRoyaltyPremiado(
  opportunityId: string,
  proposalId: string,
  royaltyPremiadoPercentualBps: number,
): Promise<AcceptRoyaltyPremiadoResult> {
  // The BFF segment carries no colon (a route folder cannot); the handler is
  // what rewrites it to the backend's `royalty-premiado:aceitar` action route.
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'royalty-premiado', 'aceitar'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ royaltyPremiadoPercentualBps }),
      cache: 'no-store',
    },
  );

  if (!res.ok) await throwForStatus(res, 'Falha ao registrar o aceite');
  return (await res.json()) as AcceptRoyaltyPremiadoResult;
}

// ---------------------------------------------------------------------------
// Exceções programadas (RN-F2-06)
// ---------------------------------------------------------------------------

export interface CreateExcecaoPayload {
  /** `ISENCAO` | `BASE_REAL` | `TETO` | `CESSAO` — free string on the wire. */
  tipoExcecao: string;
  politicaExcecao?: string | null;
  /** ISO date (`YYYY-MM-DD`). Null = retroactive. */
  vigenciaInicio?: string | null;
  /** ISO date. Null = "por todo o contrato" (open-ended). */
  vigenciaFim?: string | null;
  valorOverrideBrl?: number | null;
  motivo: string;
}

export interface ExcecaoCreated {
  id: string;
  tipoExcecao: string;
  motivo: string;
}

export async function createExcecao(
  opportunityId: string,
  proposalId: string,
  payload: CreateExcecaoPayload,
): Promise<ExcecaoCreated> {
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'excecoes'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );

  if (!res.ok) await throwForStatus(res, 'Falha ao registrar a exceção');
  return (await res.json()) as ExcecaoCreated;
}

/**
 * Altera uma exceção programada já gravada (ADO 67802).
 *
 * O corpo é o MESMO do create — substituição completa, não *merge*: com merge,
 * limpar a vigência final ("por todo o contrato") seria indistinguível de não a
 * ter enviado, e o campo ficaria preso ao valor anterior.
 *
 * `PATCH` atravessa o edge (Akamai) sem problema — o bloqueio de método dos
 * ambientes não-produtivos atinge só o `DELETE` (ADO 67557/67796), que é por
 * isso que `deleteExcecao` logo abaixo sai por `POST`.
 */
export async function updateExcecao(
  opportunityId: string,
  proposalId: string,
  excecaoId: string,
  payload: CreateExcecaoPayload,
): Promise<ExcecaoCreated> {
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'excecoes', excecaoId),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    },
  );

  if (!res.ok) await throwForStatus(res, 'Falha ao alterar a exceção');
  return (await res.json()) as ExcecaoCreated;
}

/**
 * Removes a scheduled exception. A 404 is a successful no-op.
 *
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: `501 Unsupported Request` em
 * qualquer path, sem consultar o origin (ADO 67557/67796). A rota BFF continua
 * aceitando `DELETE` com a mesma implementação.
 */
export async function deleteExcecao(
  opportunityId: string,
  proposalId: string,
  excecaoId: string,
): Promise<void> {
  const res = await fetch(
    apiUrl(...baseSegments(opportunityId, proposalId), 'excecoes', excecaoId),
    { method: 'POST' },
  );

  if (!res.ok && res.status !== 404) {
    await throwForStatus(res, 'Falha ao remover a exceção');
  }
}

// ---------------------------------------------------------------------------
// Policy validations (RN-F2-04) — single source, never a local constant
// ---------------------------------------------------------------------------

/** Where the instalment ceiling in the answer came from. */
export type OrigemLimiteParcelas = 'PARAMETRO' | 'TETO_GLOBAL';

export interface RoyaltyPolicyValidacoes {
  /**
   * Maximum number of franchise-fee instalments allowed by the policy for the
   * requested bandeira × formato de loja. `null` when the parametrization table
   * is empty — "nobody parametrized it" is not "the limit is N".
   */
  maxParcelasTaxa: number | null;
  /**
   * `PARAMETRO` = the row for this exact combination; `TETO_GLOBAL` = the
   * loosest ceiling the band publishes, used when the combination has no row of
   * its own (format unanswered, or a combination the business has not priced).
   */
  origemLimite: OrigemLimiteParcelas | null;
  /**
   * Default franchise fee (BRL, decimal string) for this combination — the
   * backend pre-fills it on the proposal. `null` = not priced; never `0`.
   */
  taxaFranquiaDefaultBrl: string | null;
}

/**
 * Reads the royalty policy validation parameters for a bandeira × formato pair.
 *
 * The prototype hardcodes "Máximo pela política: 10"; the backend owns that
 * number — and since Bugs 67575 / 67594 it is parametrized per band and store
 * format (BR Mania `PADRAO` 10, `PONTO`/`SUPER_COMPACTA` 5, Lubrax+ 6), so a
 * local constant would now be wrong for three of the four combinations. A
 * failure returns `null` and the hint is omitted rather than invented.
 */
export async function getRoyaltyValidacoes(
  bandeira?: string | null,
  formatoLoja?: string | null,
): Promise<RoyaltyPolicyValidacoes | null> {
  const params = new URLSearchParams();
  if (bandeira) params.set('bandeira', bandeira);
  if (formatoLoja) params.set('formatoLoja', formatoLoja);
  const query = params.toString();

  try {
    const res = await fetch(
      // Query string entra DEPOIS do caminho pronto: `apiUrl` codifica cada
      // segmento, e um `?` codificado deixaria de ser separador.
      `${apiUrl('franquia-parametrizacao', 'catalogo-royalties', 'validacoes')}${
        query === '' ? '' : `?${query}`
      }`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return (await res.json()) as RoyaltyPolicyValidacoes;
  } catch {
    // A transport failure omits the hint. This is the one place where an error
    // legitimately degrades to "no information": the limit is a courtesy label,
    // and the rule itself is still enforced by the backend on save.
    return null;
  }
}
