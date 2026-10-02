/**
 * O vocabulário do **Mapa da Rede** na tela (09/09/2026).
 *
 * Duas superfícies o consomem — o bloco "Mapa da Rede" da Visão 360º e o par
 * do card "Dados da oportunidade" —, então rótulo e help text vivem em UM
 * lugar. Duas cópias divergiriam exatamente onde o usuário compara as duas
 * telas: mesmo cliente, mesma pergunta, dois textos.
 *
 * Mesmo arranjo (e mesma razão) de `lib/opportunities/finalidade-oportunidade.ts`
 * e `lib/opportunities/janela-consumo.ts`: o compartilhado é a REGRA e o TEXTO,
 * nunca o JSX — cada tela tem o seu átomo de campo.
 *
 * ⚠️ Os membros espelham o backend 1:1 (`integrations/shared/salesforce/
 * mapa-da-rede.ts`). Compare sempre contra o membro nomeado, nunca contra
 * string solta.
 */

export type StatusMapaDaRede = 'ATIVO' | 'INATIVO';

export type SituacaoMapaDaRede =
  | 'NA_REDE'
  | 'FORA_DA_REDE'
  | 'EM_PROCESSO_DE_ENTRADA'
  | 'EM_PROCESSO_DE_SAIDA';

const STATUS_LABEL: Record<StatusMapaDaRede, string> = {
  ATIVO: 'Ativo',
  INATIVO: 'Inativo',
};

const SITUACAO_LABEL: Record<SituacaoMapaDaRede, string> = {
  NA_REDE: 'Na rede',
  EM_PROCESSO_DE_ENTRADA: 'Em processo de entrada',
  EM_PROCESSO_DE_SAIDA: 'Em processo de saída',
  FORA_DA_REDE: 'Fora da rede',
};

/** Rótulo dos dois campos — o mesmo texto do layout do Salesforce. */
export const STATUS_MAPA_DA_REDE_FIELD_LABEL = 'Status Mapa da Rede';
export const SITUACAO_MAPA_DA_REDE_FIELD_LABEL = 'Situação Mapa da Rede';

/**
 * O help text do campo, **verbatim** do `inlineHelpText` de
 * `Account.StatusMapaRede__c` (lido do org em 10/09/2026).
 *
 * ⚠️ Reescrevê-lo faz a explicação desta tela divergir da que o mesmo usuário
 * lê no Salesforce, sobre o mesmo campo. As cores do print do pedido (caixa
 * azul-escura) são do Lightning e **não** são reproduzidas: a tela usa o
 * tratamento de dica do próprio design system.
 */
export const STATUS_MAPA_DA_REDE_HELP =
  'Status Ativo: O cliente está no Mapa da Rede e consumiu no último mês. ' +
  'Status Inativo: O cliente está no Mapa da Rede e não consumiu no último mês. ' +
  'Status "Vazio": O cliente está fora do Mapa da Rede.';

/**
 * A frase do card DESABILITADO da Visão 360º, quando a conta não participa do
 * Mapa da Rede (10/09/2026).
 *
 * ⚠️ **Direta, e sem nomear fonte.** Diferente do card de "Dados bancários" —
 * cuja frase existe para explicar uma lacuna de INTEGRAÇÃO —, aqui o
 * Salesforce respondeu: a conta simplesmente está fora do mapa. Citar
 * "Salesforce", "cadastro" ou o nome do campo faria o leitor procurar um
 * problema que não existe.
 *
 * ⚠️ E ela só pode ser escrita quando o backend AFIRMA a ausência (`null`).
 * Com a chave ausente no payload — backend anterior à entrega — a tela não
 * sabe de nada, e o card não é montado. Ver `customer-360-mapping.ts`.
 */
export const MAPA_DA_REDE_FORA_DO_MAPA = 'Este cliente não está no Mapa da Rede.';

/**
 * `null` ⇒ o chamador decide como escrever a ausência (`—`).
 *
 * ⚠️ **NÃO devolva "Vazio" nem "Fora do Mapa da Rede" aqui.** O `''` da
 * fórmula do org é ausência de status, e materializá-lo num rótulo poria na
 * tela um valor que o Salesforce não exibe — a mesma classe de defeito do
 * default `CIF` no incoterm. Quem diz que o cliente está fora do mapa é a
 * SITUAÇÃO, no campo ao lado.
 */
export function textoStatusMapaDaRede(
  status: StatusMapaDaRede | null | undefined,
): string | null {
  return status ? (STATUS_LABEL[status] ?? null) : null;
}

/** Idem: `null` para ausente ou desconhecido — nunca a chave de máquina crua. */
export function textoSituacaoMapaDaRede(
  situacao: SituacaoMapaDaRede | null | undefined,
): string | null {
  return situacao ? (SITUACAO_LABEL[situacao] ?? null) : null;
}
