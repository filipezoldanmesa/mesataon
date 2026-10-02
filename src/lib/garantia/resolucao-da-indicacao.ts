/** O que o rascunho do ticket de indicação faria se fosse submetido agora. */
export interface MudancasDaIndicacao {
  /** Garantias no lote — existem só na tela, ainda não no backend. */
  novas: number;
  /** Edições de persistidas que NÃO foram anuladas por uma exclusão marcada. */
  edicoesEfetivas: number;
  /** Persistidas marcadas para excluir. */
  exclusoes: number;
  /** Persistidas que sobram depois das exclusões. */
  restantes: number;
}

/**
 * O submit do ticket tem efeito capaz de RESOLVER a pendência de indicação?
 *
 * É o predicado único de três consumidores em `pendencia-ticket.tsx` — a
 * visibilidade do "Resolver pendência", o aviso que explica a ausência dele, e o
 * early-return de `handleSubmitGarantia`. Os três liam transcrições separadas da
 * mesma regra, e a do submit já divergia da do botão em uma condição.
 *
 * ## A regra
 *
 * Adicionar ou editar sempre resolve. **Excluir resolve quando ainda sobra
 * garantia** — decisão do negócio de 04/09/2026: *"caso tenha mais de 1 garantia
 * que foi reprovada, a exclusão de apenas 1 garantia deve permitir que a
 * pendência seja resolvida, e as garantias que estão lá intactas devem ser
 * consideradas como garantias válidas novamente"*.
 *
 * Quem torna as intactas válidas de novo é o backend, sem passo a mais:
 * `handleIndicar` chama `reconciliarGarantia` no fim de todo submit, e
 * `GarantiaSubprocessoService.reconciliar` promove o subprocesso quando
 * `existeGarantiaApta` sobre o conjunto RESULTANTE — a partir de
 * `AGUARDANDO_INDICACAO`, que é onde `reprovarPrevia` deixa a linha. As
 * remanescentes são aptas por construção: o conjunto que foi à prévia já passou
 * por `garantiaApta`.
 *
 * ⚠️ **O critério é o que RESTA, não quantas foram reprovadas.** Marcar as 2 de 2
 * deixa o conjunto vazio e cai na regra anterior (04/09/2026, mesma decisão do
 * negócio): não existe conjunto para o CCOB analisar, `reconciliar` abriria a
 * pendência de volta em vez de resolvê-la, e o botão seria um clique sem efeito —
 * o controle morto que o contrato da sendbar proíbe. É por isso que este é um
 * predicado sobre CONTAGENS e não sobre "houve exclusão".
 *
 * ⚠️ `restantes` conta só PERSISTIDAS. Uma garantia nova no lote não está lá, e é
 * ela que dá ao CCOB o que analisar quando o LT retira todas as recusadas e
 * cadastra a corrigida no mesmo rascunho — por isso `novas` decide antes.
 */
export function indicacaoTemMudancaQueResolve(m: MudancasDaIndicacao): boolean {
  if (m.novas > 0 || m.edicoesEfetivas > 0) return true;
  return m.exclusoes > 0 && m.restantes > 0;
}
