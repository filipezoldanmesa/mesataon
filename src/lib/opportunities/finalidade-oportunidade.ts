/**
 * A FINALIDADE da oportunidade no card "Dados da oportunidade" (ADO 68242).
 *
 * ## O que mudou, e por quê
 *
 * O card exibia **"Tipo de negociação"** com o valor `Contratação`, e a Vibra
 * pediu a troca em 09/09/2026, verbatim: *"Favor ajustar o Tipo de Negociação =
 * Tipo da Finalidade que é preenchido nos item 2 · Dados da oportunidade"*, com
 * o print do campo `FINALIDADE / Implantação` da proposta e o do card com
 * `TIPO DE NEGOCIAÇÃO / Contratação` circulado.
 *
 * A razão é que **`Contratação` é constante nesta plataforma**: `tipo_negociacao`
 * nasce com um valor só e o org o sobrescreve por automação (ADR-0029 §D2), de
 * modo que a linha não distinguia uma oportunidade da outra. A finalidade é a
 * resposta que o LT de fato dá na criação (`Implantação`/`Vinculação`) e é o
 * que varia — o mesmo critério que já governa a coluna "Finalidade" da
 * listagem, que por isso não precisou mudar.
 *
 * ## O rótulo é "Finalidade", não "Tipo da Finalidade"
 *
 * Divergência deliberada do texto do comentário. `Finalidade` é como as outras
 * TRÊS superfícies do app já nomeiam o mesmo campo — a tela de criação
 * (`FINALIDADE DA OPORTUNIDADE`), o card de dados da proposta (`FINALIDADE`,
 * literalmente o print anexado ao pedido) e a coluna da listagem. "Tipo da
 * Finalidade" seria vocabulário novo, que não existe no app nem no Salesforce,
 * e tornaria a instrução do negócio inencontrável na tela.
 *
 * ## Por que uma função, e não o campo escrito em cada tela
 *
 * QUATRO telas montam o card ("Dados da oportunidade" em preenchimento,
 * workspace SNEG, aprovação e contrato), cada uma com o seu átomo de campo
 * (`DataField` × `DItem` × `Field` × `DField`). A marcação não dá para
 * compartilhar; o RÓTULO e a leitura do valor dão — e é a divergência entre
 * telas que este repositório já pagou duas vezes (`possuiNovaImagemPista`,
 * `textoJanelaConsumo`). Mesmo arranjo, mesma razão.
 *
 * ⚠️ Devolve `null`, nunca `'—'`: quem decide como renderizar a ausência é o
 * call site, e três dos quatro já rendem `value ?? '—'`.
 *
 * ⚠️ **O parecer técnico (F5) NÃO é tocado.** `parecer-panel` e
 * `parecer-readonly-section` também têm "Tipo de negociação", mas ali o campo é
 * linha de um DOCUMENTO oficial (exportado em PDF, com layout próprio) e vem do
 * cabeçalho do parecer, não do card. O pedido é sobre os dados da oportunidade.
 */
export const FINALIDADE_FIELD_LABEL = 'Finalidade';

/** A finalidade pronta para exibição, ou `null` quando ninguém respondeu. */
export function textoFinalidade(
  finalidade: string | null | undefined,
): string | null {
  const valor = finalidade?.trim();
  return valor ? valor : null;
}
