/**
 * Decides whether the fixed bottom bar (sendbar) of the contract phase is
 * rendered at all.
 *
 * ## Por que existe
 *
 * Pedido do negócio (11/09/2026): *"não faz sentido isso que aparece na aba
 * inferior"* (barra "Assinatura em andamento · Ver signatários") e *"não deve
 * existir essa barra depois da assinatura"* (barra "Cadastro / Ativação ·
 * Concluir oportunidade").
 *
 * ⚠️ **É omissão só de FRONT, deliberada e provisória.** O backend continua
 * emitindo `sendbar` inteiro — inclusive `contrato:concluir` —, e
 * `POST .../transitions` com `CONCLUIR` segue publicado e sem guard. Reabrir a
 * barra é apagar a chamada deste predicado no `contrato-view`, nada mais.
 *
 * ⚠️ **Consequência aceita:** "Concluir oportunidade" era o ÚNICO CTA do evento
 * `CONCLUIR` na interface, então enquanto isto valer não há caminho de tela para
 * sair de `EM_PAGAMENTO` — a conclusão virá do Salesforce (decisão do usuário,
 * 11/09/2026).
 *
 * ## Por que uma lista de EXCLUSÃO, e não de permissão
 *
 * `acaoEvento` desconhecido continua VISÍVEL: a API é o ponto de enforcement, e
 * esconder a barra de um evento novo tiraria da tela a única ação de uma etapa
 * inteira sem ninguém perceber (mesma razão que mantém o CTA de evento não
 * mapeado em `SENDBAR_ACTION_PERMISSION`).
 *
 * Nada aqui é re-derivado dos pacotes: quem sabe dizer "o envelope está em
 * circulação" é o backend, via `contrato:ver-assinatura`. Recalcular isso na
 * tela daria à página uma segunda opinião, livre para discordar da primeira.
 *
 * ## ⚠️ O recorte é por EVENTO; o estado só silencia barra SEM ação (14/09/2026)
 *
 * A versão anterior escondia a barra em `EM_PAGAMENTO`/`CONCLUIDA` **qualquer
 * que fosse o CTA**. O pedido de 11/09 era sobre dois CTAs nomeados; o recorte
 * por estado foi a rede que pegou junto o que ainda não existia — e o que
 * passou a existir em 13/09 vive exatamente ali:
 *
 * - o GATE 4 move a oportunidade para `EM_PAGAMENTO` **no instante** em que o
 *   pacote principal fecha;
 * - é só então que o Termo de Cessão pode ir à empresa homologada.
 *
 * Ou seja, `contrato:enviar-homologada` e o `contrato:posicionar` do envelope
 * dela nasciam num estado onde a barra nunca é desenhada. Medido ao vivo em
 * 14/09 na `OPP-2026-000066`: o backend devolvia
 * `acaoLabel: "Posicionar campos e enviar"`, `acaoHabilitada: true`, e a
 * `mensagemDetalhe` **nem chegava ao DOM**. A seção mandava posicionar os
 * campos e não havia controle nenhum para isso — beco sem saída, com o envelope
 * parado em rascunho e a homologada sem receber nada.
 *
 * Por isso o estado deixou de esconder CTA: ele só silencia a barra
 * **informativa** (`acaoEvento === null`), que é a de fato "depois da
 * assinatura". CTA nomeado some por estar na lista, e por mais nada.
 */

/** Eventos cuja barra o negócio pediu para sumir (imagens 2 e 3 do chamado). */
const EVENTOS_POS_ASSINATURA = new Set([
  // "Assinatura em andamento · 1 de 3 assinaturas concluídas" + "Ver signatários"
  'contrato:ver-assinatura',
  // "Cadastro / Ativação" + "Concluir oportunidade"
  'contrato:concluir',
]);

/**
 * Estados em que a barra **sem ação** é a barra "depois da assinatura" que o
 * negócio mandou sumir. Não vale para barra COM ação — ver o aviso acima.
 */
const ESTADOS_POS_ASSINATURA = new Set(['EM_ASSINATURA', 'EM_PAGAMENTO', 'CONCLUIDA']);

/**
 * `true` quando a sendbar deve ser renderizada.
 *
 * @param backendState estado da oportunidade (`detail.backendState`), não a
 *   `etapaAtual` do contrato: a etapa vem da linha de `contracts` e pode ficar
 *   para trás do estado (`resolveEtapaAtual`).
 * @param acaoEvento `sendbar.acaoEvento` do read model; `null` = barra
 *   informativa.
 */
export function sendbarVisivel(
  backendState: string | undefined,
  acaoEvento: string | null,
): boolean {
  if (acaoEvento !== null && EVENTOS_POS_ASSINATURA.has(acaoEvento)) return false;

  /*
   * Barra INFORMATIVA (sem CTA) numa fase posterior à assinatura: é a
   * "Liberação de pagamento", a "Contrato concluído" e o transitório
   * "Assinatura concluída — avanço para cadastro/pagamento em andamento" (em
   * `EM_ASSINATURA` o backend só devolve `acaoEvento: null` nesse ramo; com
   * nada em circulação ele oferece `contrato:enviar`). Nenhuma delas pede ação
   * de ninguém.
   *
   * ⚠️ A checagem exige `acaoEvento === null` de propósito. Sem isso, o CTA da
   * empresa homologada — que só existe depois do pacote principal, portanto
   * sempre em `EM_PAGAMENTO`/`CONCLUIDA` — voltaria a ser inalcançável.
   */
  if (acaoEvento === null && backendState !== undefined) {
    if (ESTADOS_POS_ASSINATURA.has(backendState)) return false;
  }

  return true;
}
