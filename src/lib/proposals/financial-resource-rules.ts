import { TipoRegistroRecursoFinanceiro } from '@/lib/picklists/salesforce-values';
import type { TipoBonificacao } from '@/lib/proposals/financial-resources.types';

/**
 * Regras de domínio do recurso financeiro que a TELA precisa saber.
 *
 * Espelho do backend, que é a autoridade
 * (`api/src/proposals/domain/tipo-registro-recurso-financeiro.enum.ts`). Vive
 * aqui porque `salesforce-values.ts` é catálogo de valores, não de regra, e
 * porque o bloco de recursos financeiros comparava tipo cru em três lugares —
 * era assim que a tela e o `create` divergiam sobre a mesma pergunta.
 */

/**
 * Os campos do bloco **Ressarcimento** se aplicam a este recurso? — prestações,
 * índice de correção das prestações, carência e juros mensais.
 *
 * É a família de Mútuo **menos o Novo Mútuo** (decisão do negócio, 03/09/2026):
 * *"se o tipo de registro for Novo mútuo, esses campos não deveriam ser
 * preenchidos: prestações, índice de correção das prestações, carências (meses)
 * e juros mensais"*. No Novo Mútuo o cronograma de devolução é o do bloco
 * **Bônus do Novo Mútuo**, logo abaixo no mesmo modal, e os quatro campos
 * duplicavam as perguntas dele — "Índice de correção das prestações" e "Índice
 * de correção da prestação" apareciam na mesma caixa, a forma exata do defeito
 * que a UAT de 25/08/2026 reportou como "dois campos para índice de correção".
 *
 * ⚠️ **`Justificativa` NÃO entra aqui** — não foi nomeada no pedido e é o único
 * campo do bloco que o layout do Novo Mútuo tem sem par no bloco do bônus.
 * Continua governada por {@link isRecursoDeMutuo}.
 *
 * Espelho do backend, que é a autoridade
 * (`api/src/proposals/domain/tipo-registro-recurso-financeiro.enum.ts` — leia lá
 * a divergência registrada com o layout do org). Os dois têm de concordar:
 * campo que a tela exige e o `create` anula é perda silenciosa; campo que a tela
 * esconde e o DTO exige recusa o save sem nada na tela para consertar.
 */
export function aceitaCamposDeRessarcimento(
  tipo: TipoRegistroRecursoFinanceiro | '',
): boolean {
  return isRecursoDeMutuo(tipo) && tipo !== TipoRegistroRecursoFinanceiro.NovoMutuo;
}

/**
 * `Indice_De_Correcao_Da_Parcela__c` se aplica a este recurso? (ADO 67588)
 *
 * O work item é literal, e a exclusão é o segundo dos seus quatro itens:
 * *"Criar o campo **Índice de Correção da Parcela**. (exceto Bonificação)"*.
 * `Antecipada` e `Desempenho` são as duas metades da bonificação — o catálogo
 * partiu o `BONIFICACAO` legado em dois sub-tipos, não transformou nenhum deles
 * em outra coisa —, então nenhuma das duas carrega o campo. Sobra o dinheiro
 * emprestado e devolvido em parcelas: mútuo e parcelamento de débito (⚠️ o
 * **Novo Mútuo** saiu em 03/09/2026 — ver {@link aceitaCamposDeRessarcimento},
 * de quem este predicado é hoje um alias).
 *
 * ⚠️ **Não re-derive isto pelo fluxo de caixa.** Entre 24/08 e 25/08/2026 este
 * predicado excluía só a bonificação POR DESEMPENHO, no raciocínio de que a
 * antecipada também é paga adiantado e portanto também tem parcela a corrigir.
 * O raciocínio é defensável e não é o que o negócio pediu: a rodada de UAT de
 * 25/08/2026 reportou "ao selecionar antecipação, aparecem dois campos para
 * índice de correção". Três fontes concordam com o work item e nenhuma com a
 * inferência: o PRD `..._DDI_TIRVPL_EspecFuncional_v2.1` lista **um** "Índice de
 * correção" opcional para o recurso; o protótipo de 21/08/2026 renderiza um
 * `#rm-indice` só; e `Indice_De_Correcao_Da_Parcela__c` **não** é enviado ao org
 * pelo `salesforce-quote.mapper.ts` — só o `Indice_De_Correcao__c`.
 *
 * Espelho do backend, que é a autoridade
 * (`api/src/proposals/domain/tipo-registro-recurso-financeiro.enum.ts`). Os dois
 * têm de concordar: campo que a tela exige e o `create` anula é perda
 * silenciosa; campo que a tela esconde e o DTO exige recusa o save sem nada na
 * tela para consertar.
 */
export function aceitaIndiceCorrecaoParcela(
  tipo: TipoRegistroRecursoFinanceiro | '',
  /*
   * Mantido na assinatura por paridade com o backend, e deliberadamente não
   * lido: o sub-tipo desempatava enquanto uma das metades da bonificação
   * carregava o campo. Removê-lo do parâmetro faria os dois lados divergirem em
   * forma, e o dia em que a regra voltar a depender do sub-tipo a chamada teria
   * de ser reescrita em todo call site.
   */
  _tipoBonificacao?: TipoBonificacao | '' | null,
): boolean {
  return aceitaCamposDeRessarcimento(tipo);
}

/**
 * A linha é da família de **Mútuo** — `Mútuo`, `Novo Mútuo` ou `Parcelamento de
 * Débito`?
 *
 * ⚠️ **Não é mais o gate dos campos do Ressarcimento.** Ele governava carência,
 * juros e prestações até 03/09/2026, quando o negócio tirou o Novo Mútuo deles;
 * hoje quem responde essa pergunta é {@link aceitaCamposDeRessarcimento}. Deste
 * predicado sobrou **só a Justificativa**, que o pedido não nomeou e que o
 * layout do Novo Mútuo tem.
 *
 * Espelho de `isRecursoDeMutuo` no backend
 * (`api/src/proposals/domain/tipo-registro-recurso-financeiro.enum.ts`), que é a
 * autoridade. Os dois têm de concordar: campo que a tela mostra e o `create`
 * anula é perda silenciosa; campo que a tela esconde e o DTO aceita nunca é
 * preenchido.
 */
export function isRecursoDeMutuo(
  tipo: TipoRegistroRecursoFinanceiro | '',
): boolean {
  // O modal abre sem tipo escolhido; sem a pergunta respondida não há família.
  if (tipo === '') return false;
  /*
   * Delegado ao classificador, e o `null` no sub-tipo é seguro por construção:
   * o sub-tipo só desempata QUAL METADE da bonificação a linha é, e nenhuma das
   * duas é mútuo. Duas implementações da mesma classificação divergiriam, e o
   * efeito seria a tela mostrar os campos de um tipo e somar o dinheiro no
   * balde de outro — há um caso aferindo a concordância em todo membro.
   */
  return classifyRecursoFinanceiro(tipo, null) === 'mutuo';
}

/**
 * O que a linha CONTA como no split antecipado × postecipado.
 *
 * Espelho de `ClasseRecursoFinanceiro` no backend
 * (`api/src/proposals/domain/tipo-registro-recurso-financeiro.enum.ts`).
 */
export type ClasseRecursoFinanceiro =
  | 'bonificacao-antecipada'
  | 'bonificacao-postecipada'
  | 'mutuo';

/**
 * O CLASSIFICADOR ÚNICO do split antecipado × postecipado, deste lado.
 *
 * Espelho verbatim de `classifyRecursoFinanceiro` no backend
 * (`api/src/proposals/domain/tipo-registro-recurso-financeiro.enum.ts`), que é a
 * autoridade e onde a decisão de negócio de cada membro está registrada. Os
 * dois têm de concordar.
 *
 * ⚠️ **Não teste `tipoRegistro === Bonificacao` para dizer "isto é
 * bonificação".** `BONIFICACAO` é o valor LEGADO: desde a migração da picklist o
 * formulário grava `Antecipada`/`Desempenho`, então aquela comparação é falsa
 * para toda linha criada hoje. Foi exatamente esse o defeito que o backend
 * carregava em quatro cópias privadas — todo recurso caía no ramo do mútuo, e o
 * `% Antecipação` era 100% para qualquer proposta com um recurso.
 *
 * ⚠️ **`Parcelamento de Débito` conta como `mutuo`.** O pedido do negócio de
 * 09/09/2026 não o nomeia em nenhum dos dois baldes (*"não sei nem de onde
 * estaria vindo esse parcelamento de débito … ignore"*), e "ignorar" aqui é
 * deixá-lo onde o backend já o classifica: com os mútuos. Tirá-lo dos dois
 * quebraria o invariante que o próprio pedido declara — "Recursos Totais" é a
 * soma de Antecipados e Postecipados —, e a tela mostraria três números que não
 * fecham.
 *
 * ⚠️ Isto vive no frontend, e não no backend, pela razão já registrada em
 * `product-line-totals.ts`: "Cálculos automáticos" é o card de derivação LOCAL
 * (volume, receita e margem também são calculados no browser), `apps/web` não
 * pode importar de `apps/api`, e os dois lados são presos por testes.
 */
export function classifyRecursoFinanceiro(
  tipo: TipoRegistroRecursoFinanceiro,
  tipoBonificacao: TipoBonificacao | '' | null,
): ClasseRecursoFinanceiro {
  if (tipo === TipoRegistroRecursoFinanceiro.Antecipada) return 'bonificacao-antecipada';
  if (tipo === TipoRegistroRecursoFinanceiro.Desempenho) return 'bonificacao-postecipada';
  // Linha pré-catálogo: o sub-tipo é o único fato que a distingue, então ele é
  // o desempate — e só aqui. Sub-tipo não respondido cai em postecipada, como
  // no backend: contá-la como antecipada inflaria o percentual com dinheiro que
  // ninguém afirmou ter sido adiantado.
  if (tipo === TipoRegistroRecursoFinanceiro.Bonificacao) {
    return tipoBonificacao === 'ANTECIPADA'
      ? 'bonificacao-antecipada'
      : 'bonificacao-postecipada';
  }
  return 'mutuo';
}

/**
 * O bloco de **Bônus do Novo Mútuo** se aplica a este recurso? (ADO 67587)
 *
 * ⚠️ **Mais estreito que {@link aceitaCamposDeMutuo}, de propósito.** O
 * `Detalhe_de_Contrato_Mutuo_Enc_Contas__c` existe apenas para o Novo Mútuo
 * (`Mútuo Enc. Contas`): medido no org em 26/08/2026, os 283
 * `Recurso_Financeiro_Da_Oportunidade__c` com o vínculo são todos desse tipo.
 * Mostrar o bloco no Mútuo comum ofereceria campos que o CRM não tem ali, e o
 * DTO os recusa com 400 — a divergência tela × API que o espelho existe para
 * impedir.
 *
 * Espelho de `isRecursoDeNovoMutuo` no backend, que é a autoridade.
 */
export function aceitaCamposDeBonusNovoMutuo(
  tipo: TipoRegistroRecursoFinanceiro | '',
): boolean {
  return tipo === TipoRegistroRecursoFinanceiro.NovoMutuo;
}

/**
 * A `Justificativa` é obrigatória porque os JUROS passaram do teto? (pedido do
 * negócio, 22/09/2026)
 *
 * > *"caso o valor seja alterado e seja acima de 1% deve existir um campo de
 * > justificativa obrigatório, para dizer o motivo desse juros"*.
 *
 * ⚠️ **Não é campo novo.** A pergunta foi levada ao negócio e a resposta foi
 * reusar a `Justificativa` que já existe no modal — *"se existir pode deixar
 * ele, porém faça o obrigatório dependendo do juros"*. Uma segunda coluna de
 * texto livre não teria par no org (`Recurso_Financeiro_Da_Cotacao__c` tem
 * `Justificativa__c` e só), então o motivo ficaria preso nesta plataforma.
 *
 * ⚠️ **PERCENTUAL, não fração** — o limite é `1`, que é 1% ao mês, na escala de
 * `Juros__c`. `0.01` exigiria justificativa de todo mútuo e `100` de nenhum: é o
 * erro de 100× que o `TIR__c` já custou aqui.
 *
 * ⚠️ **Estritamente MAIOR**: `1` exato é o default do formulário e não exige
 * nada; a exigência começa em `1,01`.
 *
 * Espelho de `exigeJustificativaPorJuros` no backend
 * (`api/src/proposals/domain/justificativa-por-juros.ts`), que é a autoridade —
 * ele recusa o save. Os dois têm de concordar: uma tela que anuncia um limite e
 * uma API que recusa por outro é a divergência que os espelhos existem para
 * impedir.
 */
export const LIMITE_JUROS_SEM_JUSTIFICATIVA = 1;

export function exigeJustificativaPorJuros(
  jurosPercentual: number | null | undefined,
): boolean {
  return (
    // `Number.isFinite` e não `!= null`: o parser do modal devolve um sentinela
    // para "o usuário digitou algo que não é número", e um símbolo comparado com
    // `>` produziria `false` por acidente em vez de por regra.
    typeof jurosPercentual === 'number' &&
    Number.isFinite(jurosPercentual) &&
    jurosPercentual > LIMITE_JUROS_SEM_JUSTIFICATIVA
  );
}

/**
 * A frase que o negócio escreveu, **verbatim** (22/09/2026) — inclusive a
 * concordância (*"caso os juros seja"*).
 *
 * É o aviso em vermelho sob a `Justificativa` no modal **e** a recusa que o
 * backend devolve (`MENSAGEM_JUSTIFICATIVA_POR_JUROS` lá): as duas descrevem a
 * mesma regra, e anunciar limites diferentes é o defeito que estas constantes
 * existem para impedir.
 */
export const MENSAGEM_JUSTIFICATIVA_POR_JUROS =
  'O campo justificativa é de preenchimento obrigatório caso os juros seja maior que 1.';

/**
 * Data de início do ressarcimento — **DERIVADA**, nunca perguntada.
 *
 * `Data_Inicio_Ressarcimento__c` é fórmula no org
 * (`ADDMONTHS(Data_Liberacao__c + 30 * Carencia_meses__c, 1)`, `createable:
 * false`), então o valor vem calculado do backend em
 * `FinancialResourceDto.dataInicioRessarcimento`. A tela **exibe**, e não
 * oferece input: um campo que o usuário preenche e o CRM sobrescreve afirma uma
 * escolha que não sobrevive ao acoplamento.
 *
 * Este helper existe só para o rótulo — a conta é do backend, para os dois não
 * divergirem.
 */
export const RESSARCIMENTO_DERIVADO_HINT =
  'Calculado pelo Salesforce a partir da data de liberação e da carência.';
