import { throwApiError } from '@/lib/api-errors';
import { apiUrl } from '@/lib/base-path';

import type {
  EditarParecerPayload,
  Parecer,
  ParecerVersaoEntry,
  ParecerVersaoList,
} from './parecer.types';
import {
  OpportunityNotFoundForParecerError,
  ParecerAlreadyEmittedError,
} from './parecer.types';

/**
 * BFF URL for the parecer resource, with optional sub-path segments.
 *
 * Goes through {@link apiUrl}, which encodes the segments and applies the
 * `basePath` **once, at the end**. Both of this file's historical URL bugs came
 * from getting that ordering wrong: prefixing here *and* at each call site made
 * the prefix appear twice and every parecer call 404 in dev/stage/prod
 * (VBR-638); prefixing here and concatenating `/gerar` afterwards would produce
 * `…/parecer//gerar`, because the prefixed form ends in "/".
 */
const base = (opportunityId: string, ...sub: string[]) =>
  apiUrl('opportunities', opportunityId, 'parecer', ...sub);

/**
 * Loads the current parecer técnico for the opportunity via the BFF
 * (`GET /api/opportunities/:id/parecer`).
 *
 * Returns `null` when the parecer has never been generated (404) — the
 * empty state ("parecer ainda não gerado", CA-F5-01) reacts to `null`, not
 * to a thrown error.
 *
 * API contract — F5 parecer técnico (VBR-168/VBR-169):
 *   GET /v1/opportunities/{id}/parecer
 *   Response 200: ParecerDto
 *   Response 404: { code: "NOT_FOUND" } — parecer não gerado
 */
export async function getParecer(opportunityId: string): Promise<Parecer | null> {
  const res = await fetch(base(opportunityId));

  if (res.status === 404) return null;
  if (!res.ok) {
    await throwApiError(res, 'Falha ao carregar o parecer técnico');
  }

  return (await res.json()) as Parecer;
}

/**
 * Generates (or regenerates) the parecer by rule/template (RN-F5-01 / CA-F5-01)
 * via the BFF (`POST /api/opportunities/:id/parecer/gerar`).
 *
 * API contract:
 *   POST /v1/opportunities/{id}/parecer:gerar
 *   Response 200: ParecerDto
 *   Response 404: { code: "NOT_FOUND" } — oportunidade não encontrada
 */
export async function gerarParecer(opportunityId: string): Promise<Parecer> {
  const res = await fetch(base(opportunityId, 'gerar'), { method: 'POST' });

  if (res.status === 404) {
    throw new OpportunityNotFoundForParecerError(opportunityId);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao gerar o parecer técnico');
  }

  return (await res.json()) as Parecer;
}

/**
 * Saves analyst edits and appends a new version (RN-F5-02 / CA-F5-02) via
 * the BFF (`PATCH /api/opportunities/:id/parecer`).
 *
 * Throws {@link ParecerAlreadyEmittedError} on 400 (status=concluido) so the
 * caller can surface a specific message instead of a generic failure.
 *
 * API contract:
 *   PATCH /v1/opportunities/{id}/parecer
 *   Response 200: ParecerDto
 *   Response 400: { code: "BAD_REQUEST" } — já emitido
 *   Response 404: { code: "NOT_FOUND" } — parecer não gerado ainda
 */
export async function editarParecer(
  opportunityId: string,
  payload: EditarParecerPayload,
): Promise<Parecer> {
  const res = await fetch(base(opportunityId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 400) throw new ParecerAlreadyEmittedError();
  if (res.status === 404) {
    throw new OpportunityNotFoundForParecerError(opportunityId);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao salvar o parecer técnico');
  }

  return (await res.json()) as Parecer;
}

/**
 * Emits the parecer (status → concluido; A06 signal to F7) via the BFF
 * (`POST /api/opportunities/:id/parecer/emitir`).
 *
 * ⚠️ **O 400 carrega a FRASE do backend até a tela** (22/09/2026). Ele deixou
 * de ser um caso só ("já emitido" — que nem existe mais, a emissão é
 * repetível): hoje é também a recusa por campo obrigatório em branco, e essa
 * recusa **nomeia os campos que faltam**. Trocá-la por um erro de classe fixa
 * descartava justamente o conteúdo — o analista ficava com "Falha ao salvar" na
 * frente de um formulário de nove blocos, sem saber qual abrir. O veredito
 * continua sendo do backend; a tela só renderiza o que ele disse.
 *
 * API contract:
 *   POST /v1/opportunities/{id}/parecer:emitir
 *   Response 200: ParecerDto
 *   Response 400: { code: "BAD_REQUEST", message } — campo obrigatório em
 *     branco (a mensagem os nomeia) ou oportunidade fora da análise
 *   Response 404: { code: "NOT_FOUND" }
 */
export async function emitirParecer(opportunityId: string): Promise<Parecer> {
  const res = await fetch(base(opportunityId, 'emitir'), { method: 'POST' });

  if (res.status === 404) {
    throw new OpportunityNotFoundForParecerError(opportunityId);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao emitir o parecer técnico');
  }

  return (await res.json()) as Parecer;
}

/**
 * Lists the full append-only version history (A05) via the BFF
 * (`GET /api/opportunities/:id/parecer/versoes`).
 *
 * API contract:
 *   GET /v1/opportunities/{id}/parecer/versoes
 *   Response 200: ParecerVersaoListDto
 *   Response 404: { code: "NOT_FOUND" }
 */
export async function listParecerVersoes(opportunityId: string): Promise<ParecerVersaoList> {
  const res = await fetch(base(opportunityId, 'versoes'));

  if (res.status === 404) {
    throw new OpportunityNotFoundForParecerError(opportunityId);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao carregar o histórico de versões');
  }

  return (await res.json()) as ParecerVersaoList;
}

/**
 * Loads a specific version snapshot (A05) via the BFF
 * (`GET /api/opportunities/:id/parecer/versoes/:versaoId`).
 *
 * Lookup is by the version entry's UUID (`versaoId`), not by the sequential
 * version number. This guarantees the correct row is returned even when
 * duplicate versao numbers exist (COR-13).
 *
 * API contract:
 *   GET /v1/opportunities/{id}/parecer/versoes/{versaoId}
 *   Response 200: ParecerVersaoDto
 *   Response 404: { code: "NOT_FOUND" }
 */
export async function getParecerVersao(
  opportunityId: string,
  versaoId: string,
): Promise<ParecerVersaoEntry> {
  const res = await fetch(base(opportunityId, 'versoes', versaoId));

  if (res.status === 404) {
    throw new OpportunityNotFoundForParecerError(opportunityId);
  }
  if (!res.ok) {
    await throwApiError(res, 'Falha ao carregar a versão do parecer');
  }

  return (await res.json()) as ParecerVersaoEntry;
}

/**
 * Same-origin BFF URL for the "Exportar PDF" action (BE-5, `GET
 * /v1/opportunities/:id/parecer/pdf`). Used directly as a link `href` —
 * navigating to it lets the browser handle the download natively.
 */
export function parecerPdfUrl(opportunityId: string): string {
  return base(opportunityId, 'pdf');
}
