/**
 * A **Zona de venda** (a do LT) e as **Áreas de venda** da conta — os dois
 * campos que as telas da oportunidade trocavam entre si.
 *
 * ## O relato (17/09/2026)
 *
 * > *"A oportunidade está aparecendo Zona de Vendas várias informações, porém
 * > tem que aparecer a Zona de Vendas do LT."*
 *
 * O print é a `PCR-PERN-000183/2026` na fase **Em aprovação**, com o campo
 * "Zona de venda" do cabeçalho exibindo *"Serviços / Vendas Diretas,
 * Combustíveis Claros / Vendas Indiretas, Lubrificantes / Vendas Indiretas,
 * Gás Natural e Energia / Vendas Indiretas, Outros Produtos / Vendas
 * Indiretas"* — a lista inteira das **áreas de venda** (Divisão / Canal) da
 * conta, que não é zona nenhuma.
 *
 * ## São dois campos, e eles estavam invertidos
 *
 * - `OpportunityDetail.profitCenters` ← `Opportunity.centroLucro` ←
 *   `Account.Zona_de_vendas_da_conta__c`. Medido no org em 16/08/2026: é
 *   **fórmula** sobre `Centro_de_Lucro_Principal__r.Vendedor__r.Zona_De_Vendas__c`
 *   — a zona do VENDEDOR (o LT) pendurado no centro de lucro da conta, e.g.
 *   `RN06`. É **isto** que o relato chama de "Zona de Vendas do LT". Medido em
 *   300 contas DCVIM (25/08/2026): 119 valores distintos, 0,7 % nulos.
 *   ⚠️ Não é o CÓDIGO do centro de lucro (`DAC0TNA006`), que é outra string e
 *   só é resolvido no caminho do ARP (`profit-center-code.resolver.ts`).
 * - `OpportunityDetail.salesZone` ← `Opportunity.areaVenda` ←
 *   `buildAreaVenda`, que **junta por vírgula os nomes de todas as áreas de
 *   venda habilitadas** da conta (RN-F2-06). É a lista do print.
 *
 * ## Isto é o Bug 67589 de novo, nas telas que ficaram para trás
 *
 * Aquele ticket já fez esta troca — **só no `opportunity-detail`**, cuja barra
 * de metadados lê `profitCenters` desde então (`opportunity-detail.test.tsx`,
 * *"shows the CRM sales zone (profit center) in the meta bar, not the sales
 * areas"*). As outras três telas que montam o mesmo card ficaram com o campo
 * invertido, e o relato voltou pela fase de aprovação. É a razão de o rótulo e
 * a leitura virarem função compartilhada em vez de um quarto conserto local —
 * mesmo arranjo (e mesma razão) de `finalidade-oportunidade.ts`,
 * `janela-consumo.ts` e `nova-imagem-pista.ts`: a marcação não dá para
 * compartilhar (`DataField` × `DItem` × `Field` × `DField`), o RÓTULO e a
 * leitura dão.
 *
 * ## As áreas continuam na tela, com o nome delas
 *
 * O campo que exibia `profitCenters` sob o rótulo **"Centros de lucro"** (ou
 * "Centros de lucro e escritórios de vendas (proprietário e conta)") passa a
 * exibir `salesZone` como **"Áreas de venda"**. As duas correções andam
 * juntas de propósito: trocar só o de cima deixaria o MESMO valor duas vezes
 * na mesma tela, e apagar as áreas esconderia um dado que o card de fato
 * mostra. De quebra, o rótulo antigo prometia o código do centro de lucro e
 * entregava a zona do vendedor — a confusão que originou o relato.
 *
 * ⚠️ As duas funções devolvem `null`, nunca `'—'`: quem decide como renderizar
 * a ausência é o call site, e as quatro telas já rendem `value ?? '—'`.
 *
 * ⚠️ **E elas não lançam sobre valor que não é string.** O tipo diz
 * `string | null`, mas o payload chega da rede e ninguém o valida em runtime:
 * enquanto as telas faziam `{opportunity.profitCenters ?? '—'}`, qualquer
 * coisa renderizável passava — um array virava `MG106` na tela e ninguém
 * percebia. Trocar isso por `.trim()` transformou o mesmo payload em
 * `TypeError` **durante o render**, e o que se perde não é o campo: é a TELA
 * INTEIRA. Medido no smoke e2e em 18/09/2026 — a fixture de
 * `aprovacao-avanco-bloqueio.spec.ts` trazia `profitCenters: ['MG106']`, e os
 * dois casos do ADO 68231 falharam com *"element(s) not found"* para testids
 * que nada tinham a ver com zona de venda. Mesma disciplina do card
 * "Análises": uma fonte ruim custa UMA linha, nunca a árvore.
 */
export const ZONA_VENDA_FIELD_LABEL = 'Zona de venda';

/** As áreas de venda (Divisão / Canal) habilitadas na conta do cliente. */
export const AREAS_VENDA_FIELD_LABEL = 'Áreas de venda';

/**
 * Texto de um campo que o backend promete como string — vazio, ausente ou de
 * outro tipo devolvem `null`, e nunca uma exceção. Ver o docblock do módulo.
 */
function textoDoCampo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  return texto ? texto : null;
}

/** A zona de venda do LT (`Zona_de_vendas_da_conta__c`), ou `null`. */
export function textoZonaVenda(
  profitCenters: string | null | undefined,
): string | null {
  return textoDoCampo(profitCenters);
}

/** As áreas de venda da conta, já juntas pelo backend, ou `null`. */
export function textoAreasVenda(
  salesZone: string | null | undefined,
): string | null {
  return textoDoCampo(salesZone);
}
