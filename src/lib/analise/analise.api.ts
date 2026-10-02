import { extractErrorMessage, throwApiError } from '@/lib/api-errors';
import type { MappedPendenciaList } from '@/lib/analise/analise-mapping';
import { mapPendenciasResumo } from '@/lib/analise/analise-mapping';
import { withBasePath } from '@/lib/base-path';

import type {
  AlcadaPreview,
  AnaliseSneg,
  ApprovalReadiness,
  ConferenciaResult,
  PadraoBPResult,
  PendenciasPanelResult,
  ReatribuirAnalistaPayload,
  SnegViability,
  SolicitarAjusteResult,
} from './analise.types';
import {
  AnaliseNaoAbertaError,
  DevolverValidationError,
  SolicitarAjusteError,
} from './analise.types';

// ---------------------------------------------------------------------------
// GET /api/opportunities/:id/analise (BE-1)
// ---------------------------------------------------------------------------

/**
 * Loads the SNEG analysis context for the given opportunity via the BFF.
 *
 * API Contract — BE-1 (épico VBR-255):
 *
 *   GET /v1/opportunities/:id/analise
 *   Response 200: AnaliseSneg
 */
export async function getAnaliseSneg(
  opportunityId: string,
): Promise<AnaliseSneg> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/analise`,
    ),
  );

  if (res.status === 404) {
    /*
     * ADO 68256 — 404 aqui significa "a análise ainda não existe", e isso NÃO é
     * falha: antes do GATE 1 ela não tem por que existir, e depois dele é uma
     * inconsistência que a plataforma repara sozinha. A frase é a do BACKEND —
     * é ele que sabe em que fase a oportunidade está.
     */
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new AnaliseNaoAbertaError(
      body.message ??
        body.error ??
        'A análise SNEG desta oportunidade ainda não foi aberta.',
    );
  }

  /*
   * ADO 68256 — `throwApiError`, não uma frase montada aqui.
   *
   * O que estava escrito era `` `Falha ao carregar a análise SNEG (${status}).` ``,
   * que DESCARTA o corpo do backend: qualquer recusa chegava à tela como o
   * status entre parênteses, e o `(404)` do print do usuário é justamente esse
   * descarte. `throwApiError` é o extrator único do repo — lê `errors[]`,
   * `message`, `error` e anexa o `correlationId` que a BFF emite quando ELA teve
   * de engolir a resposta (VBR-583).
   */
  if (!res.ok) {
    await throwApiError(res, 'Falha ao carregar a análise SNEG');
  }

  return (await res.json()) as AnaliseSneg;
}

// ---------------------------------------------------------------------------
// POST /api/opportunities/:id/analise/reatribuir (RN-F1-02)
// ---------------------------------------------------------------------------

/**
 * Reassigns the responsible SNEG analyst without reloading the page.
 *
 * Mirrors `POST /v1/opportunities/:opportunityId/analise/reatribuir`
 * (openapi.yaml): body `{ analistaId, motivo? }`, response = updated
 * AnaliseSnegDto. The actor is resolved from the session token by the
 * backend — never sent in the body.
 */
export async function reatribuirAnalista(
  opportunityId: string,
  payload: ReatribuirAnalistaPayload,
): Promise<AnaliseSneg> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/analise/reatribuir`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao reatribuir o analista');
  }

  return (await res.json()) as AnaliseSneg;
}

// ---------------------------------------------------------------------------
// GET /api/opportunities/:id/analise/padrao-bp (BE-4)
// ---------------------------------------------------------------------------

/**
 * Loads the BP standardisation and economic filter data via the BFF.
 *
 * API Contract — BE-4 (épico VBR-255):
 *
 *   GET /v1/opportunities/:id/analise/padrao-bp
 *   Response 200: PadraoBPResult
 */
export async function getPadraoBP(
  opportunityId: string,
): Promise<PadraoBPResult> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/analise/padrao-bp`,
    ),
  );

  if (!res.ok) {
    throw new Error(`Falha ao carregar o padrão de BP (${res.status}).`);
  }

  return (await res.json()) as PadraoBPResult;
}

// ---------------------------------------------------------------------------
// GET /api/opportunities/:id/analise/approval-readiness (BE-6)
// ---------------------------------------------------------------------------

/**
 * Checks whether the opportunity is ready to be released for approval.
 * The UI reflects this verdict — it never decides independently.
 *
 * API Contract — BE-6 (épico VBR-255):
 *
 *   GET /v1/opportunities/:id/approval-readiness
 *   Response 200: ApprovalReadiness
 */
export async function getApprovalReadiness(
  opportunityId: string,
): Promise<ApprovalReadiness> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/analise/approval-readiness`,
    ),
  );

  if (!res.ok) {
    throw new Error(
      `Falha ao carregar o estado de aprovação (${res.status}).`,
    );
  }

  return (await res.json()) as ApprovalReadiness;
}

// ---------------------------------------------------------------------------
// GET /api/pendencias?opportunityId=:id (reuses existing BFF)
// ---------------------------------------------------------------------------

/**
 * Loads a summary of the pendencies linked to this opportunity for the
 * side-panel card. Delegates to the existing `/api/pendencias` BFF route.
 *
 * Returns only the first 10 items — the full list is accessed via the
 * dedicated pendências screen (`/pendencias?opp=<código>`).
 */
export async function getPendenciasResumo(
  opportunityId: string,
): Promise<PendenciasPanelResult> {
  const qs = new URLSearchParams({
    // O backend aceita UUID ou código humano no mesmo parâmetro.
    opportunityRef: opportunityId,
    limit: '10',
    page: '1',
  });

  const res = await fetch(
    withBasePath(`/api/pendencias?${qs.toString()}`),
  );

  if (!res.ok) {
    throw new Error(`Falha ao carregar as pendências (${res.status}).`);
  }

  // Projection to the side-panel card lives in analise-mapping.ts. NOTE: the
  // previous inline version used `obrigatoria: p.automatica` — "auto-generated"
  // is NOT "mandatory". Only a couple of engine triggers are obrigatória, and a
  // manual pendência can be one too, so the flag now comes from the backend.
  const raw = (await res.json()) as MappedPendenciaList;
  return mapPendenciasResumo(raw);
}

// ---------------------------------------------------------------------------
// POST /api/opportunities/:id/transitions — sendbar "Liberar para aprovação"
// ---------------------------------------------------------------------------

/**
 * Fallback `currentState` for `ENVIAR_PARA_APROVACAO`.
 *
 * ⚠️ Prefer passing the opportunity's ACTUAL backend state (optimistic-lock
 * token). `EM_ANALISE` is the ONLY valid source state for this event
 * (`transition.ts:70`), so the default is safe in practice — but a concurrent
 * change will produce a 409 that the UI will surface instead of being silently
 * swallowed. Mirrors the `GATE1_SOURCE_STATE` pattern in `gate1.api.ts`.
 */
export const GATE2_SOURCE_STATE = 'EM_ANALISE';

/**
 * Releases the opportunity for the approval flow (GATE 2 — PRD §6).
 *
 * Per ADR-0016, the "Liberar para aprovação" button is UI copy for the
 * existing `ENVIAR_PARA_APROVACAO` workflow event — no dedicated event exists.
 *
 * ⚠️ **"Devolver ao LT" passou a SER uma transição em 27/08/2026**
 * (`DEVOLVER_AO_LT` — ver `devolverOportunidadeAoLt` abaixo), revisando a
 * ADR-0016. A devolução por proposta (`devolverProposal`, RN-F2-03) continua
 * existindo em paralelo e **não** move a oportunidade: são dois atos, e é a
 * granularidade que os separa.
 *
 * The backend enforces all prerequisites (guard chain); the UI only
 * reflects the approval-readiness verdict from BE-6.
 *
 * `currentState` is the optimistic-lock token required by the DTO — the
 * backend `ValidationPipe` (whitelist + forbidNonWhitelisted) rejects the
 * request with 400 when it is absent.
 */
export async function liberarParaAprovacao(
  opportunityId: string,
  currentState: string = GATE2_SOURCE_STATE,
): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/transitions`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'ENVIAR_PARA_APROVACAO', currentState }),
    },
  );

  // The GATE 2 guard rejection (422) and any ValidationPipe 400 both carry the
  // sentence the analyst needs. `throwApiError` also reads `errors[]`, which the
  // previous inline reader ignored — a VALIDATION_ERROR fell through to the
  // template string (COR-5).
  if (!res.ok) {
    await throwApiError(res, 'Falha ao liberar para aprovação');
  }
}

/**
 * Devolve a OPORTUNIDADE INTEIRA ao LT (`DEVOLVER_AO_LT` — 27/08/2026).
 *
 * A SNEG recusa tudo e a oportunidade volta a `EM_PREENCHIMENTO`. Distinto de
 * {@link devolverProposal}, que devolve UMA proposta (RN-F2-03) sem mover a
 * oportunidade — os dois convivem, e o que os separa é a granularidade.
 *
 * O motivo é obrigatório e vira ESTADO da oportunidade: é ele que a tela do LT
 * exibe. Por isso viaja em `motivoDevolucao`, e não no `reason` genérico de
 * auditoria que qualquer transição aceita.
 */
export async function devolverOportunidadeAoLt(
  opportunityId: string,
  motivo: string,
  currentState: string = GATE2_SOURCE_STATE,
): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/transitions`,
    ),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'DEVOLVER_AO_LT',
        currentState,
        motivoDevolucao: motivo,
      }),
    },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao devolver a oportunidade ao LT');
  }
}

// ---------------------------------------------------------------------------
// Per-proposal operations + viability — consolidated from
// lib/sneg/sneg-analysis.api.ts (VBR-273 — single domain data module).
// ---------------------------------------------------------------------------

/**
 * Sends a "devolver" (return) action for one proposal via the BFF.
 *
 * POST /api/proposals/:id/devolver — body `{ motivo: string }`.
 *
 * Only the targeted proposal changes state (RN-F2-03) — the others in the
 * same opportunity remain "em análise". Not a workflow event (ADR-0016).
 */
export async function devolverProposal(proposalId: string, motivo: string): Promise<void> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/devolver`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    },
  );

  if (res.status === 400) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new DevolverValidationError(data?.message);
  }

  if (!res.ok) {
    await throwApiError(res, 'Falha ao devolver a proposta');
  }
}

/**
 * Posts an adjustment request for a specific block of a proposal.
 *
 * POST /api/proposals/:id/solicitar-ajuste
 * Body: { bloco: string; comentario: string; fotoRef?: string }
 * Response: { pendenciaId: string }
 *
 * `fotoRef` (VBR-292) references a specific photo to be retaken — only
 * accepted by the backend when `bloco === 'fotos'`.
 */
export async function solicitarAjuste(
  proposalId: string,
  bloco: string,
  comentario: string,
  fotoRef?: string,
): Promise<SolicitarAjusteResult> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/solicitar-ajuste`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bloco, comentario, ...(fotoRef ? { fotoRef } : {}) }),
    },
  );

  // Every rejection — not only 400 — carries the backend's own sentence. The
  // generic branch used to build `Falha ao solicitar ajuste (409)`, so any status
  // the client did not anticipate reached the analyst as a bare status code.
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Parameters<
      typeof extractErrorMessage
    >[0];
    throw new SolicitarAjusteError(
      extractErrorMessage(body, `Falha ao solicitar ajuste (${res.status}).`),
    );
  }

  return (await res.json()) as SolicitarAjusteResult;
}

/**
 * Loads the backend "Conferência do preenchimento" for an opportunity
 * (VBR-278 — RN-F1-03 / CA-F1-02): per proposal, the campos required by the
 * sneg_campos_obrigatorios parametrization and whether each is filled.
 * The FE only renders this verdict — no required-field rule client-side.
 *
 * GET /api/opportunities/:id/analise/conferencia
 */
export async function getConferencia(
  opportunityId: string,
): Promise<ConferenciaResult> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/analise/conferencia`,
    ),
  );

  if (!res.ok) {
    throw new Error(
      `Falha ao carregar a conferência do preenchimento (${res.status}).`,
    );
  }

  return (await res.json()) as ConferenciaResult;
}

/**
 * Loads the SNEG viability result for an opportunity (triagem e maturidade).
 *
 * GET /api/opportunities/:id/analise/viabilidade
 */
export async function getSnegViability(opportunityId: string): Promise<SnegViability> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/analise/viabilidade`),
  );

  /*
   * Não há mais ramo de 403 aqui: a rota deixou de ser `@Roles(SNEG, ADMIN)`
   * em 25/08/2026 (emenda à ADR-0012). O protótipo põe a Viabilidade na
   * PRIMEIRA linha do painel do LT, e o `AnaliseForbiddenError` que existia
   * fazia a tela ESCONDER a linha ao receber o 403 — o dado que o desenho pede
   * sumia sem sinal nenhum. Um 403 inesperado agora cai no erro genérico
   * abaixo e a linha mostra "indisponível", que é visível.
   */
  if (!res.ok) {
    throw new Error(`Falha ao carregar a viabilidade SNEG (${res.status}).`);
  }

  return (await res.json()) as SnegViability;
}

/**
 * Lists posto photos for a proposal (SNEG read-only view).
 *
 * GET /api/proposals/:id/posto-photos
 */
export async function listPostoPhotos(
  proposalId: string,
): Promise<Array<{ id: string; fileName: string; url: string }>> {
  const res = await fetch(
    withBasePath(`/api/proposals/${encodeURIComponent(proposalId)}/posto-photos`),
  );

  if (res.status === 404) return [];

  if (!res.ok) {
    throw new Error(`Falha ao carregar as fotos do posto (${res.status}).`);
  }

  return (await res.json()) as Array<{ id: string; fileName: string; url: string }>;
}

// ---------------------------------------------------------------------------
// GET /api/opportunities/:id/analise/alcada-preview (RN-F7-03 — VBR-290)
// ---------------------------------------------------------------------------

/**
 * Loads the approval-level preview for the proposal-filling alert.
 * Mirrors GET /v1/opportunities/:opportunityId/analise/alcada-preview.
 */
export async function getAlcadaPreview(
  opportunityId: string,
): Promise<AlcadaPreview> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/analise/alcada-preview`,
    ),
  );

  if (!res.ok) {
    throw new Error(`Falha ao carregar o preview de alçada (${res.status}).`);
  }

  return (await res.json()) as AlcadaPreview;
}
