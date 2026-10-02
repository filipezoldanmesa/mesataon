import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  DocumentoParametrizacao,
  DocumentosPorModalidade,
  EdicaoDocumentoParametrizacao,
  NovoDocumentoParametrizacao,
} from './documentos-catalogo.types';

/**
 * Cliente da aba **Governança → Documentos**.
 *
 * Duas leituras e duas escritas. ⚠️ **A edição existia desde a HU-21 e nunca
 * foi alcançável:** o `PUT` era gateado pela feature-flag
 * `DOCUMENTS_PARAMETRIZATION_ENABLED` (default `false`, ausente do compose e das
 * task definitions), então respondia 404 em todo ambiente — e oferecer "Editar"
 * teria sido controle morto. Em 21/09/2026 o negócio pediu adicionar/editar, e a
 * flag foi REMOVIDA em vez de ligada.
 *
 * ⚠️ **A remoção entrou em 22/09/2026**, e só passa para tipo sem nenhum anexo.
 * `{ selectable: false }` continua sendo o caminho para o que já foi usado.
 *
 * Toda URL passa por {@link withBasePath} (VBR-626).
 */
export async function getCatalogoDocumentos(): Promise<DocumentoParametrizacao[]> {
  const res = await fetch(withBasePath('/api/governanca/documentos'));
  if (!res.ok) await throwApiError(res, 'Falha ao carregar o catálogo de documentos');
  return (await res.json()) as DocumentoParametrizacao[];
}

export async function getDocumentosPorModalidade(): Promise<
  DocumentosPorModalidade[]
> {
  const res = await fetch(
    withBasePath('/api/governanca/documentos/modalidade-garantia'),
  );
  if (!res.ok) {
    await throwApiError(res, 'Falha ao carregar os documentos por modalidade');
  }
  return (await res.json()) as DocumentosPorModalidade[];
}

/** Acrescenta um tipo ao catálogo. 409 quando o par já existe. */
export async function criarDocumentoParametrizacao(
  payload: NovoDocumentoParametrizacao,
): Promise<DocumentoParametrizacao> {
  const res = await fetch(withBasePath('/api/governanca/documentos'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Falha ao criar o tipo de documento');
  return (await res.json()) as DocumentoParametrizacao;
}

/**
 * Altera uma linha do catálogo. O par `(category, type)` vai no PATH porque é a
 * chave — ele não é editável.
 */
export async function editarDocumentoParametrizacao(
  category: string,
  type: string,
  payload: EdicaoDocumentoParametrizacao,
): Promise<DocumentoParametrizacao> {
  const res = await fetch(
    withBasePath(
      `/api/governanca/documentos/${encodeURIComponent(category)}/${encodeURIComponent(type)}`,
    ),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) await throwApiError(res, 'Falha ao salvar o tipo de documento');
  return (await res.json()) as DocumentoParametrizacao;
}

/**
 * Apaga um tipo do catálogo — só passa quando ele não tem nenhum anexo
 * (22/09/2026). Em uso, o backend responde **409** e `throwApiError` sobe a
 * frase dele verbatim: ela nomeia a contagem e aponta o "Disponível para novos
 * anexos".
 *
 * ⚠️ **`POST`, não `DELETE`.** O edge (Akamai) de dev e stage recusa todo
 * `DELETE` com `501`, sem consultar o origin (ADO 67557/67796) — e o host do web
 * está atrás do MESMO edge, então trocar só a perna BFF→API não resolveria: o
 * clique falharia antes de chegar à BFF. A rota BFF publica os dois verbos com
 * a mesma implementação.
 *
 * ⚠️ Sem corpo de resposta (a BFF devolve 204), então nada é lido aqui — quem
 * diz o que sobrou é o recarregamento da lista.
 */
export async function removerDocumentoParametrizacao(
  category: string,
  type: string,
): Promise<void> {
  const res = await fetch(
    withBasePath(
      `/api/governanca/documentos/${encodeURIComponent(category)}/${encodeURIComponent(type)}`,
    ),
    {
      method: 'POST',
      /*
       * ⚠️ `Content-Length` é obrigatório: `POST` sem corpo volta `411` do
       * próprio Akamai — não confunda com bloqueio. Um `{}` resolve, e é o mesmo
       * que o logout faz.
       */
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  if (!res.ok) await throwApiError(res, 'Falha ao excluir o tipo de documento');
}
