/**
 * O que a barra "Equipe da oportunidade" do header exibe.
 *
 * ## A regra (ADO 67984, reaberto em 02/09/2026)
 *
 * **Somente o escritório de vendas vinculado à conta do cliente.** Verbatim do
 * negócio: *"Ajustar a regra para que, na Equipe da Oportunidade, seja
 * considerado apenas o escritório de vendas vinculado à conta do cliente. Não
 * incluir os participantes da equipe nesse ajuste."* O anexo do ticket circula
 * a barra lendo `VREG3 · Aline` — o `· Aline` é o que sai.
 *
 * ⚠️ **Isto REVISA o Bug 67589**, entregue em 26/08/2026, que pôs o escritório
 * como PRIMEIRO item e o seguiu com os primeiros nomes da equipe (o principal
 * à frente), mais um chip `+N` que abria a lista completa num modal. A razão
 * daquela decisão — *"oportunidade recém-criada, cujo único membro é o LT, lia
 * `—`, ou seja 'esta oportunidade não tem equipe', quando ela tem"* — deixou de
 * valer aqui porque a barra passou a ser **sobre o escritório**, não sobre a
 * equipe: `—` agora significa "o escritório desta conta não é conhecido", que é
 * a leitura honesta.
 *
 * **Nada se perde na tela.** A equipe inteira continua no card "Dados da
 * oportunidade", na seção `Equipe` — um chip por membro, qualificado, com
 * "Gerenciar equipe" ao lado (`TeamSection`). Era esse card que tornava o modal
 * do `+N` redundante, e é por isso que ele pôde ser removido em vez de virar
 * controle órfão.
 *
 * ## Por que uma função, para uma linha
 *
 * Porque a versão anterior desta regra tinha **duas** implementações: a do
 * componente e uma cópia dentro do próprio teste
 * (`opportunity-detail-equipe-header.test.tsx` renderizava um `MetaBar` local
 * que reimplementava o `escritorio ? [escritorio, ...nomes] : nomes`). Um teste
 * que copia a regra nunca reprova quando a regra muda — ele passaria verde
 * exatamente no dia em que o comportamento fosse revertido por acidente, que é
 * a forma pela qual este ticket seria reaberto uma terceira vez.
 *
 * ⚠️ **O rótulo da barra continua "Equipe da oportunidade"**, e não
 * "Escritório de vendas". É como o negócio nomeia o campo — o próprio pedido o
 * chama assim —, então renomeá-lo tornaria a instrução deles inencontrável na
 * tela. A tensão entre o rótulo e o conteúdo fica registrada aqui em vez de ser
 * reconciliada por conta própria: mudar o rótulo é decisão de produto.
 *
 * @param salesOffice `Opportunity.salesOffice` — o snapshot de
 *                    `Account.Escritorio_de_vendas_da_conta__c` gravado na
 *                    criação (`opportunities.sales_office`, migration `…118`).
 * @returns o texto da barra: o escritório, ou `—` quando ele não é conhecido.
 */
export function equipeMetaBarValue(salesOffice: string | null | undefined): string {
  return salesOffice?.trim() || '—';
}
