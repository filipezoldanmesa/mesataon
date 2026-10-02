import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import {
  ChecklistNotFoundError,
  RepositoryNotFoundError,
  type ChecklistDoc,
  type ChecklistResult,
  type RepositoryDoc,
  type RepositoryResult,
} from './types';

/**
 * Loads the opportunity checklist via the BFF (`/api/opportunities/:id/checklist`).
 * The BFF injects the session Bearer server-side so the token never reaches the browser.
 * Throws {@link ChecklistNotFoundError} on 404, generic Error on other failures.
 */
export async function getChecklist(opportunityId: string): Promise<ChecklistResult> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/checklist`),
  );

  if (res.status === 404) {
    throw new ChecklistNotFoundError(opportunityId);
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar o checklist (${res.status}).`);
  }

  return (await res.json()) as ChecklistResult;
}

/**
 * Attaches a new file to a checklist document (HU-17.2).
 *
 * Sends a multipart POST to the BFF which forwards it to:
 *   `POST /v1/opportunities/:id/documents` with `{ category, type, file }`.
 *
 * `target` names the checklist line being uploaded to. It is REQUIRED whenever
 * the line already has a file, because `docId` is only a `category::type`
 * synthetic key while the line is still empty — once a document exists,
 * `mapChecklistItem` makes the id the repository document UUID, and splitting a
 * UUID on `'::'` yields no category and no type. That produced a request with
 * only the file, which the backend could not route to either the reuse or the
 * upload branch: "Novo upload" on an already-attached line failed every time,
 * with an API-contract sentence in the toast (VBR-582 follow-up).
 *
 * Falls back to the `docId` split so a pending line keeps working unchanged.
 *
 * Throws a descriptive Error on 400 (invalid type / missing file) or 409
 * (already attached — RN-F9-07) so callers can surface them in the UI.
 */
export async function attachDoc(
  opportunityId: string,
  docId: string,
  file: File,
  target?: { category: string; type: string },
  /**
   * Substituir o documento atual de uma categoria `single` em vez de receber 409
   * (VBR-641). O anterior é desvinculado e permanece no repositório do cliente.
   *
   * Opt-in explícito, nunca o default: substituir em silêncio trocaria um
   * documento que a SNEG talvez já tenha validado.
   */
  replace = false,
): Promise<ChecklistDoc> {
  const [category, type] = target
    ? [target.category, target.type]
    : docId.split('::');

  const body = new FormData();
  body.append('action', 'attach');
  body.append('docId', docId);
  if (category) body.append('category', category);
  if (type) body.append('type', type);
  body.append('file', file);
  if (replace) body.append('replace', 'true');

  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/checklist`),
    { method: 'POST', body },
  );

  if (!res.ok) {
    // No special-cased 400/409 branch: `throwApiError` already resolves the
    // backend sentence for every status AND throws `ApiValidationError` (with
    // `fieldErrors`) exactly for 400/409/422. The local branch reproduced the
    // message part but lost the field-level detail, so a form could not map the
    // rejection back to the offending input.
    await throwApiError(res, 'Falha ao anexar o documento');
  }

  return (await res.json()) as ChecklistDoc;
}

/**
 * Links a repository document to this opportunity without a new upload (HU-17.1).
 *
 * Sends `{ action: 'reuse', docId }` to the BFF which calls:
 *   `POST /v1/opportunities/:id/documents { repositoryDocumentId: docId }`.
 *
 * Returns the updated doc with `status='validado'` and `reused=true`.
 * Throws a descriptive Error on 409 (already attached — RN-F9-07).
 */
export async function reuseDoc(
  opportunityId: string,
  docId: string,
): Promise<ChecklistDoc> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/checklist`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reuse', docId }),
    },
  );

  if (!res.ok) {
    // The 409 of RN-F9-07 ("already attached") is a business rejection like any
    // other: `throwApiError` reads the envelope once and surfaces the backend's
    // own sentence. The previous branch read only `body.error`, so a rejection
    // arriving in `message` (the `AllExceptionsFilter` shape) was replaced by the
    // canned sentence below — the very defect this module was meant to stop
    // reproducing.
    await throwApiError(res, 'Documento já anexado a esta oportunidade');
  }

  return (await res.json()) as ChecklistDoc;
}

/**
 * Removes (unlinks) a document from this opportunity, keeping it in the
 * client repository for future reuse.
 *
 * Sends `{ action: 'remove', docId }` to the BFF which calls:
 *   `DELETE /v1/opportunities/:id/documents/:repositoryDocumentId` (→ 204).
 *
 * Returns void on success. Throws on failure.
 */
export async function removeDoc(
  opportunityId: string,
  docId: string,
): Promise<void> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/checklist`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', docId }),
    },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao remover o documento');
  }
}

/**
 * SNEG validation of one attached document (RN-F9-03) — the "Validar" /
 * "Desfazer" pair of the analysis screen.
 *
 * Returns the checklist row RECOMPUTED by the backend engine, so the caller
 * re-renders the row from the same source that builds the whole card instead of
 * flipping the status locally: `vencido` beats a validation, and only the engine
 * knows that.
 */
export async function setDocValidation(
  opportunityId: string,
  docId: string,
  validado: boolean,
): Promise<ChecklistDoc> {
  const res = await fetch(
    withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/checklist`),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: validado ? 'validar' : 'desfazer-validacao',
        docId,
      }),
    },
  );

  if (!res.ok) {
    await throwApiError(
      res,
      validado
        ? 'Falha ao validar o documento'
        : 'Falha ao desfazer a validação do documento',
    );
  }

  return (await res.json()) as ChecklistDoc;
}

/**
 * Título da pendência de reenvio — o texto que o checklist PROCURA.
 *
 * É por ele que a tela reconhece, depois de um reload, que aquele documento já
 * tem um reenvio pedido.
 *
 * ⚠️ **Quem COMPÕE o título é o backend** (`pendencias/domain/reenvio-documento.ts`),
 * desde 01/09/2026. Esta função é o LEITOR, e o formato tem de ser idêntico ao de
 * lá — nenhum compilador liga os dois apps, então os dois lados afirmam a string
 * verbatim em teste. Mudar um sem o outro faz o selo "reenvio pedido" desaparecer
 * do checklist sem nada quebrar.
 */
export function tituloReenvioDocumento(docName: string): string {
  return `Reenviar documento: ${docName}`;
}

/**
 * "Solicitar reenvio" — quem confere recusa o documento e abre uma pendência
 * pedindo ao **LT/EV** que envie outra versão (Anexo B, `DOCUMENTO_REJEITADO`).
 *
 * Conferem a SNEG e a CCOB (`Permission.DocumentValidate`, 31/08/2026) — a
 * descrição não nomeia perfil por isso.
 *
 * ## ⚠️ O que mudou em 01/09/2026, e por quê
 *
 * Isto postava no `POST /api/pendencias` genérico, montando título, descrição,
 * tipo e prioridade aqui e **omitindo `area`/`responsavelId`** — o comentário
 * anterior afirmava que "o backend auto-roteia (RN-F3-02), e adivinhar aqui
 * duplicaria a regra no navegador". A primeira metade era falsa:
 * `PendenciasService.autoRoute` **auto-atribui ao criador** quando o responsável
 * vem ausente. Resultado medido: o pedido para o LT reenviar as fotos do posto
 * ficava *"resp. Aline Maria"* — a própria analista que clicou — e na área SNEG.
 *
 * A conclusão do comentário estava certa e continua valendo: a regra não pode
 * viver no navegador. Então ela passou a viver no **backend**, numa rota própria
 * que lê o catálogo do engine (`DOCUMENTO_REJEITADO` → área LT/EV). Daqui vão só
 * os dois fatos que o cliente conhece.
 */
export async function solicitarReenvioDocumento(
  opportunityId: string,
  docName: string,
): Promise<void> {
  const res = await fetch(withBasePath('/api/pendencias/reenvio-documento'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opportunityId, tipoDocumento: docName }),
  });

  if (!res.ok) {
    await throwApiError(res, 'Falha ao solicitar o reenvio do documento');
  }
}

// ---------------------------------------------------------------------------
// F9 — Global client repository (tela 13a / 13b)
// ---------------------------------------------------------------------------

/**
 * Loads the global document repository for a client via the BFF
 * (`GET /api/clients/:id/repository`).
 * Throws {@link RepositoryNotFoundError} on 404.
 */
export async function getRepository(clientId: string): Promise<RepositoryResult> {
  const res = await fetch(
    withBasePath(`/api/clients/${encodeURIComponent(clientId)}/repository`),
  );

  if (res.status === 404) {
    throw new RepositoryNotFoundError(clientId);
  }

  if (!res.ok) {
    throw new Error(`Falha ao carregar o repositório (${res.status}).`);
  }

  return (await res.json()) as RepositoryResult;
}

/**
 * Uploads a document to the client repository (HU-17.2) via the BFF
 * (`POST /api/clients/:id/repository`). Sends multipart FormData with
 * `docTypeId` and `file` fields.
 */
export async function uploadToRepository(
  clientId: string,
  docTypeId: string,
  file: File,
  /**
   * Data de validade (`yyyy-mm-dd`), opcional (ADO 67993). String vazia é
   * "sem validade" e simplesmente não viaja — o backend a trata como ausente.
   */
  expiresAt?: string,
): Promise<RepositoryDoc> {
  const body = new FormData();
  body.append('docTypeId', docTypeId);
  body.append('file', file);
  if (expiresAt) body.append('expiresAt', expiresAt);

  const res = await fetch(
    withBasePath(`/api/clients/${encodeURIComponent(clientId)}/repository`),
    { method: 'POST', body },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    const msg =
      data.code === 'INVALID_FILE_TYPE'
        ? `Tipo de arquivo não aceito. Tipos permitidos: ${data.message ?? ''}`
        : `Falha ao enviar o documento (${res.status}).`;
    throw new Error(msg);
  }

  return (await res.json()) as RepositoryDoc;
}

/**
 * Replaces the file of an existing repository document (the "Novo upload"
 * action, 13a) via the BFF (`PUT /api/clients/:id/repository/:docId`). The
 * backend reuses the same document row (same id/category/type), so the screen
 * substitutes the document in place instead of appending a second one.
 */
export async function replaceInRepository(
  clientId: string,
  docId: string,
  file: File,
  /**
   * Nova validade (`yyyy-mm-dd`), ou `''` para declarar que o documento deixou
   * de ter prazo (ADO 67993).
   *
   * ⚠️ `undefined` (o campo nem foi tocado) é diferente de `''`: o primeiro
   * PRESERVA a validade atual, o segundo a limpa. Colapsá-los apagaria a
   * distinção entre "não falei disso" e "não tem prazo" — e, no primeiro caso,
   * substituir um documento vencido o deixaria vencido para sempre.
   */
  expiresAt?: string,
): Promise<RepositoryDoc> {
  const body = new FormData();
  body.append('file', file);
  if (expiresAt !== undefined) body.append('expiresAt', expiresAt);

  const res = await fetch(
    withBasePath(
      `/api/clients/${encodeURIComponent(clientId)}/repository/${encodeURIComponent(docId)}`,
    ),
    { method: 'PUT', body },
  );

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    const msg =
      data.code === 'INVALID_FILE_TYPE'
        ? `Tipo de arquivo não aceito. Tipos permitidos: ${data.message ?? ''}`
        : `Falha ao substituir o documento (${res.status}).`;
    throw new Error(msg);
  }

  return (await res.json()) as RepositoryDoc;
}

/**
 * Removes a document from the client repository via the BFF
 * (`POST /api/clients/:id/repository/:docId`).
 *
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: medido em 20/08/2026 em dev
 * e stage, `501 Unsupported Request` em qualquer path, sem consultar o origin
 * (ADO 67557). Trocar apenas a perna BFF→API não resolveria nada aqui: o clique
 * falharia antes de chegar à BFF. A rota BFF continua aceitando `DELETE` com a
 * mesma implementação, para quem chamar de um ambiente sem o edge no caminho.
 */
export async function deleteFromRepository(
  clientId: string,
  docId: string,
): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/clients/${encodeURIComponent(clientId)}/repository/${encodeURIComponent(docId)}`,
    ),
    { method: 'POST' },
  );

  if (!res.ok) {
    await throwApiError(res, 'Falha ao excluir o documento');
  }
}
