/**
 * Reconhece o retorno do browser vindo da Embedded Sender View do DocuSign.
 *
 * ## Por que não basta o nosso próprio marcador
 *
 * O backend monta o `returnUrl` como
 * `{PUBLIC_WEB_BASE_URL}/oportunidades/{id}?docusign=retorno`
 * (`envelope.service.ts`, `senderReturnUrl`). A tela testava exatamente esse
 * par — e **o marcador não chega**.
 *
 * Medido ao vivo em 14/09/2026 (sandbox, `OPP-2026-000066`, envelope
 * `fd2a2715-…`): depois do Send no Tagger, o browser voltou para
 *
 * ```
 * /oportunidades/{id}?envelopeId=fd2a2715-8a65-…&event=Send
 * ```
 *
 * — o DocuSign **substituiu** a query, não a acrescentou. Consequência: o
 * `useEffect` de retorno nunca disparava, `POST .../assinatura:sincronizar`
 * nunca era chamado, o `replaceState` não limpava nada (os parâmetros do
 * fornecedor ficavam na barra de endereços) e o usuário voltava sem confirmação
 * nenhuma de que o envelope tinha saído. Quem atualizou a tela naquele teste foi
 * o worker de reconciliação, **7 s depois** — e num ambiente sem o worker no ar,
 * ou com ele atrasado, o envio simplesmente some da tela.
 *
 * Por isso o reconhecimento é por QUALQUER um dos três marcadores: o nosso
 * (caso o fornecedor volte a preservá-lo, ou num outro modo de view) e os dois
 * que ele de fato emite. É uma decisão de UX — "recarregue a situação agora" —,
 * não de autorização.
 *
 * ## ⚠️ O `envelopeId` da URL é RECONHECIMENTO, nunca fonte
 *
 * Ele diz "você voltou de lá"; ele **não** diz qual envelope a plataforma deve
 * ler. Quem sabe isso é o banco, sob a sessão de quem voltou —
 * `POST .../contrato/assinatura:sincronizar` não recebe id nenhum, de propósito.
 * Aceitar o id do browser deixaria o cliente escolher qual envelope a
 * plataforma sincroniza. A mesma regra já está escrita no `senderReturnUrl` do
 * backend, e existe teste aqui para ela não se perder na próxima mexida.
 *
 * ## Por que limpar TODOS os parâmetros
 *
 * Sem o `replaceState`, um F5 ou um "voltar" refariam a sincronização a cada
 * visita. Limpar só o nosso deixaria `envelopeId`/`event` na barra de endereços
 * — e um envelope id exposto ali é justamente o que não se persiste nem se
 * loga.
 */

/** Parâmetros de retorno removidos da URL depois do reconhecimento. */
export const PARAMS_DE_RETORNO = ['docusign', 'envelopeId', 'event'] as const;

/**
 * O `tipo` da mensagem que a janela de retorno manda para a janela-mãe.
 *
 * Constante compartilhada de propósito: emissor
 * (`app/docusign/retorno/[opportunityId]`) e receptor (`usar-janela-docusign`)
 * precisam concordar, e duas strings literais em arquivos distintos divergem na
 * primeira renomeação — sem nada quebrar, porque a mensagem simplesmente
 * deixaria de ser reconhecida e a janela nunca fecharia sozinha.
 */
export const MENSAGEM_RETORNO_DOCUSIGN = 'docusign:retorno';

/**
 * `true` quando a URL atual é um retorno da tela do DocuSign.
 *
 * @param params `URLSearchParams` da URL corrente.
 */
export function ehRetornoDoDocuSign(params: URLSearchParams): boolean {
  // O nosso marcador, quando o fornecedor o preserva.
  if (params.get('docusign') === 'retorno') return true;

  /*
   * O que o DocuSign manda de fato. `event` cobre todas as saídas da Sender
   * View — `Send`, `Save`, `Cancel` —, e todas merecem a releitura: o envelope
   * pode ter saído, ficado em rascunho ou sido descartado, e é justamente por
   * não dar para saber pelo redirect que o estado é RELIDO da API.
   */
  if (params.has('event')) return true;

  return params.has('envelopeId');
}
