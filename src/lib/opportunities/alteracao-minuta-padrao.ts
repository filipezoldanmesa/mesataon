/**
 * "Haverá alteração de minuta padrão?" — o vocabulário na tela (ADO 68438).
 *
 * Mesmo arranjo (e mesma razão) de `lib/mapa-da-rede.ts` e
 * `lib/opportunities/finalidade-oportunidade.ts`: o compartilhado é a REGRA e o
 * TEXTO, nunca o JSX — cada tela tem o seu átomo de campo.
 *
 * ## O que este campo conserta
 *
 * O destino no Salesforce é `Alteracao_Minuta_Padrao__c`, que o org tem na
 * **Cotação** e na **Oportunidade** (e copia de uma para a outra, pela entrada
 * `Quote_Alteracao_De_Minuta` de `CopyQuoteToOpportunity__mdt`). A plataforma
 * SEMPRE enviou o campo — derivando-o de `proposals.standard_draft`, booleano
 * `NOT NULL DEFAULT true` cujo único controle de escrita (`MinutaPadraoBlock`)
 * não está montado em tela nenhuma. Medido no org de UAT em 15/09/2026: as 41
 * oportunidades desta plataforma já sincronizadas afirmam, 41 de 41,
 * `"Não"` — sem que ninguém tenha respondido, enquanto o negócio usa `"Sim"`
 * em 703 oportunidades `DCVIM`. Esta é a pergunta que faltava.
 *
 * ⚠️ **`null` é "não respondido", e NÃO é "Não".** É por isso que
 * {@link textoAlteracaoMinutaPadrao} devolve o travessão em vez de `"Não"`:
 * escrever "Não" sobre o campo vazio reencenaria na tela o mesmo defeito que
 * ele corrige no CRM.
 */

/** Rótulo do campo — verbatim do pedido do negócio (ADO 68438). */
export const ALTERACAO_MINUTA_PADRAO_FIELD_LABEL =
  'Haverá alteração de minuta padrão?';

/**
 * Rótulo do texto que acompanha o "Sim" — verbatim do pedido (19/09/2026).
 *
 * ⚠️ **Não é "justificativa".** O pedido a chamou assim e foi corrigido no
 * mesmo dia: o campo descreve O QUE muda em relação à minuta padrão, não por
 * que a mudança é aceitável. O rótulo mora aqui, ao lado do da pergunta, para
 * a criação, o modal de edição e o card de dados não divergirem.
 */
export const DESCRICAO_ALTERACAO_MINUTA_PADRAO_FIELD_LABEL =
  'Qual será a alteração?';

/**
 * `true` ⇒ `Sim`, `false` ⇒ `Não`, ausente ⇒ `—` ("ninguém respondeu").
 *
 * Devolve sempre string, nunca `null`: `DataField` rende `value ?? '—'`, e
 * deixar o travessão a cargo do call site foi como o repo já perdeu o
 * significado de um campo vazio antes.
 */
export function textoAlteracaoMinutaPadrao(
  alteracaoMinutaPadrao: boolean | null | undefined,
): string {
  if (alteracaoMinutaPadrao === true) return 'Sim';
  if (alteracaoMinutaPadrao === false) return 'Não';
  return '—';
}
