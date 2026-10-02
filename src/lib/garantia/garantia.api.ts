/**
 * Client-side API functions for the garantia domain.
 *
 * All calls go through the same-origin BFF so the access token stays in the
 * httpOnly session cookie and never reaches page JavaScript.
 *
 * Mutation functions are listed in `write-controls.test.ts` so the lint-gate
 * catches any component that imports them without a permission check.
 */

import { withBasePath } from '@/lib/base-path';

import { extractErrorMessage, throwApiError } from '@/lib/api-errors';

import type { GarantiaTrackResult } from './garantia-track.types';
import type {
  GarantiaAtribuicao,
  GarantiaAtribuicaoSneg,
  GarantiaView,
} from './garantia-mapping';
import type { BackendIndicacao, GarantiaIndicarPayload } from './indicacao-mapping';
import { mapGarantiaIndicacao } from './indicacao-mapping';
import type { GarantiaIndicacao } from './indicacao-mapping';
// NOTE: two distinct `GarantiaIndicacao` shapes currently coexist — this one
// from `./types` (GAR-19 read path, consumed by opportunity-detail) and the
// mapper's own from `./indicacao-mapping` (GAR-18 write path). Aliased here to
// keep both call sites honest; unifying them is a follow-up, not a merge fix.
import type { GarantiaIndicacao as GarantiaIndicacaoView, ResultadoPrevia } from './types';

// ---------------------------------------------------------------------------
// Indicação da garantia (GAR-F1 / GAR-19 — leitura)
// ---------------------------------------------------------------------------

/**
 * Loads the guarantee indication read model for an opportunity via the BFF
 * (`GET /api/opportunities/:id/garantia/indicacao`).
 *
 * The backend never returns 404 for an absent guarantee — absence is business
 * information (`estado = AGUARDANDO_INDICACAO`), not a missing resource.
 *
 * @throws when the HTTP response is not ok (connection errors, 4xx, 5xx).
 *   The caller is responsible for showing an error state.
 */
export async function getGarantiaIndicacao(
  opportunityId: string,
): Promise<GarantiaIndicacaoView> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/indicacao`),
  );

  if (!res.ok) {
    throw new Error(`Falha ao carregar a garantia (${res.status}).`);
  }

  return (await res.json()) as GarantiaIndicacaoView;
}

// ---------------------------------------------------------------------------
// Trilha da garantia (GAR-16 / VBR-342 — leitura)
// ---------------------------------------------------------------------------

/**
 * The profile is not allowed to read this garantia (403).
 *
 * Typed separately so the UI can distinguish a transient failure (retryable)
 * from a permanent access denial (not retryable — the same route would 403
 * again). Callers hide the row rather than offering a retry.
 */
export class GarantiaForbiddenError extends Error {
  constructor(readonly opportunityId: string) {
    super(`Sem permissão para ler a garantia: ${opportunityId}`);
    this.name = 'GarantiaForbiddenError';
  }
}

/**
 * Loads the garantia track read model for the given opportunity.
 *
 * @throws {GarantiaForbiddenError} when the profile may not read it (403).
 * @throws {Error} on network/5xx failures.
 */
export async function getGarantiaTrack(
  opportunityId: string,
): Promise<GarantiaTrackResult> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/garantia`),
    { cache: 'no-store' },
  );

  if (res.status === 403) {
    throw new GarantiaForbiddenError(opportunityId);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      extractErrorMessage(body, `Falha ao carregar a trilha de garantia (${res.status}).`),
    );
  }

  return res.json() as Promise<GarantiaTrackResult>;
}

// ---------------------------------------------------------------------------
// Indicar garantia (GAR-F1)
// ---------------------------------------------------------------------------

/**
 * Submits the guarantee indication via the BFF.
 *
 * `POST /api/opportunities/:opportunityId/garantia/indicar`
 * → backend: `POST /v1/opportunities/:id/garantia:indicar`
 *
 * The backend atomically:
 *   1. Fills the garantia record fields.
 *   2. Transitions AGUARDANDO_INDICACAO → EM_ANALISE_PREVIA (when exigePrevia).
 *   3. Resolves the INDICACAO_GARANTIA pendência.
 *   4. Records `garantia.indicacao_submetida` (or `indicacao_alterada` on re-indication).
 *
 * Returns the updated `GarantiaIndicacao` on success.
 * Throws with a user-visible error message on 400 (validation) or 4xx/5xx.
 */
export async function indicarGarantia(
  opportunityId: string,
  payload: GarantiaIndicarPayload,
): Promise<GarantiaIndicacao> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/indicar`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao indicar a garantia');
  }

  const body = (await res.json()) as BackendIndicacao;
  return mapGarantiaIndicacao(body);
}

/**
 * Atualiza uma garantia JÁ PERSISTIDA com o payload do ticket.
 *
 * Mesmo corpo do `indicarGarantia` — é o que `montarGarantiaAtual` produz, e a
 * BFF o repassa verbatim. Ver o docblock da rota
 * (`api/opportunities/[id]/garantia/indicacoes/[indicacaoId]`) para por que ela
 * convive com a do card.
 *
 * ⚠️ O update é **substituição completa** do registro: o payload tem de vir do
 * formulário inteiro, nunca só dos campos que mudaram — um bloco ausente APAGA
 * o que estava lá (é o mesmo `replace-all` de fiadores e matrículas).
 */
export async function atualizarGarantiaIndicadaDoTicket(
  opportunityId: string,
  indicacaoId: string,
  payload: GarantiaIndicarPayload,
): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/indicacoes/${encodeURIComponent(indicacaoId)}`,
    ),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao atualizar a garantia');
  }
}

/**
 * Reconcilia o subprocesso — o passo que FECHA a pendência quando o conjunto
 * ficou apto.
 *
 * Chamada UMA vez, no fim de aplicar o rascunho do ticket. Não é opcional nem
 * "otimização": sem ela, um ticket cuja única mudança foi uma EDIÇÃO fica aberto
 * até o worker rodar (60 s), e o botão "Resolver pendência" não resolve nada que
 * o LT veja.
 *
 * Idempotente e sem autoridade nova — o backend só promove com conjunto apto.
 */
export async function reconciliarGarantia(opportunityId: string): Promise<void> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/reconciliar`),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao reconciliar a garantia');
  }
}

/**
 * Envia o CONJUNTO de garantias para a análise prévia da CCOB (ADO 67920).
 *
 * O gesto explícito do LT — o botão que o negócio pediu em 26/08/2026. Até
 * 04/09/2026 a promoção só acontecia de forma automática, no GATE 1, e a guarda
 * de fase a proíbe antes dele: o LT com tudo anexado não tinha como acionar a
 * CCOB.
 *
 * ⚠️ A recusa do backend é TEXTO DE USUÁRIO — ela nomeia o documento que falta
 * ou diz que o perfil de crédito não concluiu. `throwApiError` já repassa a
 * frase do 4xx; o segundo argumento é só a reserva para o caso sem corpo.
 */
export async function enviarGarantiaParaAnalisePrevia(
  opportunityId: string,
): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/enviar-analise-previa`,
    ),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao enviar a garantia para a análise prévia');
  }
}

// ---------------------------------------------------------------------------
// Garantias existentes seletor (GAR-12 · ADR-0046)
// ---------------------------------------------------------------------------

/**
 * Uma garantia já cadastrada para o cliente, servida pelo endpoint de
 * existentes.
 *
 * Alinhado ao contrato REAL do backend (`ExistingGuaranteeDto`). A versão
 * anterior declarava `descricao`/`tipoLabel` como obrigatórios e um `sapId` que
 * o backend nunca enviou — invisível porque a lista era sempre vazia enquanto o
 * SAP não estava contratado.
 */
export interface GarantiaExistente {
  /** Id do registro na fonte (hoje o `Id` do Salesforce, 18 chars). */
  sapId: string;
  /** Descrição do bem. `null` na fonte atual — ela não carrega o campo. */
  descricao: string | null;
  /** Tipo conforme o cadastro (ex.: "Hipoteca Imóvel com Interesse Comercial"). */
  tipo: string;
  /** Valor avaliado em BRL. */
  valorAvaliadoBRL: number | null;
}

/**
 * Rótulo de uma garantia no seletor da indicação.
 *
 * Composto de tipo + valor avaliado, os dois campos que a fonte preenche em
 * 100% dos registros. O rótulo anterior era `${descricao} — ${tipoLabel}`, e com
 * a fonte real leria " — undefined": `descricao` vem `null` e `tipoLabel` nunca
 * existiu no contrato.
 */
export function garantiaExistenteLabel(garantia: GarantiaExistente): string {
  /*
   * `== null` (não `===`): a classe de defeito que esta função corrige FOI
   * deriva de shape — a BFF mapeava campos que o backend nunca enviou, e o
   * `undefined` resultante só não apareceu porque a lista era sempre vazia. Um
   * campo ausente aqui tem de degradar para rótulo parcial, nunca derrubar o
   * ticket de pendência inteiro.
   */
  const valor =
    garantia.valorAvaliadoBRL == null
      ? null
      : garantia.valorAvaliadoBRL.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
  return [garantia.descricao ?? garantia.tipo, valor].filter(Boolean).join(' — ');
}

/** Shape returned by the BFF when the source gap is detected (SAP not wired). */
export interface GarantiaExistentesResult {
  /** The list (may be empty when no garantias exist — empty ≠ error). */
  items: GarantiaExistente[];
  /** `true` when the backend integration (SAP/ERP) is not yet available. */
  lacuna: boolean;
}

/**
 * Fetches existing garantias from SAP via the BFF.
 *
 * `GET /api/opportunities/:opportunityId/garantia/existentes`
 *
 * Behaviours that differ deliberately from a generic list:
 *  - Empty list = "nenhuma garantia vigente" — never an error.
 *  - `lacuna: true` = a fonte é um stub declarado, ou caiu; a UI nomeia a
 *    integração pendente em vez de exibir lista vazia. A BFF deriva isso do
 *    campo `gap` do corpo 200 (o backend NÃO responde 503 para stub declarado) e
 *    também do 503 de uma queda real.
 *  - Other 5xx / network = throws (UI shows error state, not empty list, to
 *    prevent masking a real outage with a silent empty state).
 */
export async function getGarantiasExistentes(
  opportunityId: string,
): Promise<GarantiaExistentesResult> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/existentes`,
    ),
  );

  // 503 = SAP/ERP integration gap (not wired yet).
  if (res.status === 503) {
    return { items: [], lacuna: true };
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar as garantias existentes (${res.status}).`);
  }

  const body = (await res.json()) as { items?: GarantiaExistente[]; lacuna?: boolean };
  return {
    items: body.items ?? [],
    lacuna: body.lacuna ?? false,
  };
}

// ---------------------------------------------------------------------------
// Garantia read model (GAR-17)
// ---------------------------------------------------------------------------

/**
 * Fetches the full garantia state via the BFF.
 *
 * `GET /api/opportunities/:opportunityId/garantia/view`
 * → backend: `GET /v1/opportunities/:id/garantia`
 *
 * Returns `GarantiaView` on success. Throws with a user-visible message on error.
 */
export async function getGarantia(opportunityId: string): Promise<GarantiaView> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/view`),
    { cache: 'no-store' },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      extractErrorMessage(data, `Falha ao carregar a garantia (${res.status}).`),
    );
  }

  return res.json() as Promise<GarantiaView>;
}

// ---------------------------------------------------------------------------
// Reatribuir a análise prévia (roteamento da CCOB — 04/09/2026)
// ---------------------------------------------------------------------------

/**
 * Troca o analista da CCOB responsável pela análise prévia desta garantia.
 *
 * `POST /api/opportunities/:id/garantia/reatribuir`
 * → backend: `POST /v1/opportunities/:id/garantia:reatribuir`
 *
 * É o análogo da RN-F1-02 da SNEG: a parametrização da Governança vale daí em
 * diante, então garantia já promovida à prévia não se move quando a tabela muda
 * — sem esta ação, uma atribuição pendente (gerência não parametrizada quando a
 * prévia abriu) não teria conserto pela tela.
 *
 * Devolve a atribuição atualizada. A frase do 4xx do backend chega verbatim (é
 * ela que nomeia o conserto: "esse id não é um analista CCOB").
 */
export async function reatribuirAnalisePrevia(
  opportunityId: string,
  payload: { analistaId: string; motivo?: string },
): Promise<GarantiaAtribuicao> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/reatribuir`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) await throwApiError(res, 'Falha ao reatribuir a análise prévia');
  return res.json() as Promise<GarantiaAtribuicao>;
}

/**
 * Reatribui o **fluxo de garantia** a outro analista da SNEG (20/09/2026).
 *
 * `POST /api/opportunities/:id/garantia/reatribuir-sneg`
 * → backend: `POST /v1/opportunities/:id/garantia:reatribuir-sneg`
 *
 * Rota IRMÃ de {@link reatribuirAnalisePrevia}, nunca um parâmetro dela: são
 * áreas com autoridade oposta, e no backend cada uma tem o seu `@Roles`.
 *
 * Devolve a atribuição atualizada. A frase do 4xx do backend chega verbatim — é
 * ela que nomeia o conserto ("esse id não é um analista SNEG", "o fluxo de
 * garantia ainda não começou").
 */
export async function reatribuirAnalistaSnegGarantia(
  opportunityId: string,
  payload: { analistaId: string; motivo?: string },
): Promise<GarantiaAtribuicaoSneg> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/reatribuir-sneg`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao reatribuir o fluxo de garantia');
  }
  return res.json() as Promise<GarantiaAtribuicaoSneg>;
}

// ---------------------------------------------------------------------------
// Confirmar análise prévia (GAR-F2 — CCOB)
// ---------------------------------------------------------------------------

/**
 * Submits the CCOB's análise prévia decision via the BFF.
 *
 * `POST /api/opportunities/:opportunityId/garantia/previa`
 * → backend: `POST /v1/opportunities/:id/garantia/previa:aprovar` or `:reprovar`
 *
 * The backend atomically:
 *   1. Records the parecer.
 *   2. Transitions EM_ANALISE_PREVIA → PREVIA_APROVADA | PREVIA_REPROVADA.
 *   3. Notifies the LT / SNEG.
 *
 * Returns the updated `GarantiaView`.
 * Throws with a user-visible message on 400 / 403 / 5xx.
 */
export async function confirmarPrevia(
  opportunityId: string,
  payload: { parecer: string; resultado: ResultadoPrevia },
): Promise<GarantiaView> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/previa`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      extractErrorMessage(data, `Falha ao registrar a análise prévia (${res.status}).`),
    );
  }

  return res.json() as Promise<GarantiaView>;
}

// ---------------------------------------------------------------------------
// Salvar minuta Netlex (GAR-F3 — SNEG)
// ---------------------------------------------------------------------------

/**
 * Saves the Netlex ID against the garantia minuta via the BFF.
 *
 * `POST /api/opportunities/:opportunityId/garantia/minuta`
 * → backend: `POST /v1/opportunities/:id/garantia/minuta:salvar-netlex`
 *
 * Returns the updated `GarantiaView`.
 * Throws with a user-visible message on error.
 */
export async function salvarMinuta(
  opportunityId: string,
  payload: { netlexId: string },
): Promise<GarantiaView> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/garantia/minuta`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      extractErrorMessage(data, `Falha ao salvar a minuta (${res.status}).`),
    );
  }

  return res.json() as Promise<GarantiaView>;
}
