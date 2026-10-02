/**
 * Real data layer for the opportunity "Garantias" card (01b), via the BFF
 * (`/api/opportunities/:id/garantias`), which injects the session Bearer
 * server-side and maps enum↔label + rewrites document URLs. Components import
 * from `indicacoes.data.ts` (which re-exports these); tests inject stubs.
 *
 * Mutation failures surface the BACKEND's own sentence via `throwApiError`
 * (never a bare `(${status})` template — api-errors.contract regression class).
 */
import { throwApiError } from '@/lib/api-errors';
import { apiUrl } from '@/lib/base-path';
import type {
  GarantiaDocSlot,
  GarantiaIndicacaoInput,
  GarantiaIndicacaoItem,
} from './indicacoes.types';

function base(opportunityId: string, ...sub: string[]): string {
  // Sub-path via `apiUrl`, never concatenated onto an already-prefixed string
  // (that yields `//` because the prefixed form ends in "/").
  return apiUrl('opportunities', opportunityId, 'garantias', ...sub);
}

export async function loadGarantiasIndicadas(
  opportunityId: string,
): Promise<GarantiaIndicacaoItem[]> {
  const res = await fetch(base(opportunityId));
  if (!res.ok) {
    throw new Error(`Falha ao carregar as garantias (${res.status}).`);
  }
  return (await res.json()) as GarantiaIndicacaoItem[];
}

export async function createGarantiaIndicada(
  opportunityId: string,
  input: GarantiaIndicacaoInput,
): Promise<GarantiaIndicacaoItem> {
  const res = await fetch(base(opportunityId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    await throwApiError(res, 'Falha ao criar a garantia');
  }
  return (await res.json()) as GarantiaIndicacaoItem;
}

export async function updateGarantiaIndicada(
  opportunityId: string,
  id: string,
  input: GarantiaIndicacaoInput,
): Promise<GarantiaIndicacaoItem> {
  const res = await fetch(base(opportunityId, id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    await throwApiError(res, 'Falha ao atualizar a garantia');
  }
  return (await res.json()) as GarantiaIndicacaoItem;
}

/**
 * Remove uma garantia indicada, via a BFF
 * (`POST /api/opportunities/:id/garantias/:garantiaId`).
 *
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: medido em 20/08/2026 em dev e
 * stage, `501 Unsupported Request` em qualquer path, sem consultar o origin (ADO
 * 67557 / 67595). Trocar apenas a perna BFF→API não resolveria nada aqui: o
 * clique falharia antes de chegar à BFF. A rota BFF continua aceitando `DELETE`
 * com a mesma implementação, para quem chamar de um ambiente sem o edge no
 * caminho.
 */
export async function deleteGarantiaIndicada(opportunityId: string, id: string): Promise<void> {
  const res = await fetch(base(opportunityId, id), {
    method: 'POST',
  });
  if (!res.ok && res.status !== 204) {
    await throwApiError(res, 'Falha ao remover a garantia');
  }
}

/** Uploads (or replaces) the certidão/laudo of one indicated guarantee (multipart). */
export async function uploadGarantiaDoc(
  opportunityId: string,
  id: string,
  slot: GarantiaDocSlot,
  file: File,
): Promise<GarantiaIndicacaoItem> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(base(opportunityId, id, slot), {
    method: 'POST',
    body,
  });
  if (!res.ok) {
    await throwApiError(res, 'Falha ao anexar o documento');
  }
  return (await res.json()) as GarantiaIndicacaoItem;
}

/**
 * Anexa um documento A UMA garantia (spec 28/08/2026 §4).
 *
 * Chamada DEPOIS de `indicarGarantia`, com o id que ela devolve: o documento
 * pertence à garantia, e a garantia só existe a partir daquela resposta.
 */
export async function anexarDocumentoGarantia(
  opportunityId: string,
  indicacaoId: string,
  type: string,
  file: File,
  matriculaOrdem?: number,
  fiadorOrdem?: number,
  substituirDocumentoId?: string,
): Promise<void> {
  const body = new FormData();
  body.append('type', type);
  body.append('file', file);
  /*
   * HIP-03 — qual matrícula esta certidão lastreia, pela POSIÇÃO (1..N).
   *
   * Só quando informado: o laudo, o estatuto e os complementares não pertencem a
   * matrícula nenhuma, e mandar o campo vazio faria o backend recusar (ele
   * distingue "ausente" de "presente e inválido", justamente para não gravar um
   * documento sem vínculo por causa de um valor mal formado).
   */
  if (matriculaOrdem !== undefined) {
    body.append('matriculaOrdem', String(matriculaOrdem));
  }
  /*
   * Migration `…139` — qual FIADOR esta certidão de casamento identifica, pela
   * POSIÇÃO (1..N). Mesma regra: só quando informado, e mandá-lo em qualquer
   * outro tipo escoparia o `single` num fiador, fazendo o próximo upload do
   * mesmo tipo voltar 409.
   */
  if (fiadorOrdem !== undefined) {
    body.append('fiadorOrdem', String(fiadorOrdem));
  }
  /*
   * O documento que este anexo SUBSTITUI (relato de 03/09/2026).
   *
   * Só o LAUDO manda: nos tipos `single` (certidão de inteiro teor, minuta,
   * certidão de casamento) o backend acha sozinho quem ocupa o slot e troca em
   * lugar; o laudo é `single: false` e não tem identidade no domínio, então quem
   * sabe QUAL está sendo trocado é este formulário — a correspondência bloco ↔
   * documento é posicional (ver `LaudoBloco`).
   *
   * Sem isto, trocar o arquivo do "Laudo 1" anexava um SEGUNDO laudo e o
   * formulário passava a mostrar dois blocos.
   */
  if (substituirDocumentoId !== undefined) {
    body.append('substituirDocumentoId', substituirDocumentoId);
  }

  const res = await fetch(base(opportunityId, indicacaoId, 'documentos'), {
    method: 'POST',
    body,
  });

  if (!res.ok) {
    await throwApiError(res, 'Falha ao anexar o documento da garantia');
  }
}
