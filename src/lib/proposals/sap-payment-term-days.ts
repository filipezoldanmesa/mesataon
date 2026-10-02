/**
 * Derives the deterministic day-count from a SAP payment term code
 * (`QuoteLineItem.Prazo_De_Pagamento__c`).
 *
 * === Decisão de produto: Opção B (VBR-480 / issue 11/08/2026) ===
 * Apenas os códigos com contagem de dias única e determinística são oferecidos
 * na picklist do modal de produto. Com a allowlist restringida a esses códigos,
 * a derivação sempre tem sucesso para os valores selecionáveis pelo usuário —
 * o campo manual "Prazo pgto (dias)" foi removido da tela.
 *
 * Apesar de `Z030`, `ZB30`, `ZG30` e `ZR30` serem todos "30 dias" com encargos
 * diferentes, o número de dias **é** determinístico para cada um deles — o que
 * não é derivável é o ENCARGO, que está embutido no prefixo. Portanto todos
 * esses códigos entram na allowlist.
 *
 * Códigos EXCLUÍDOS da allowlist (retornam `null`):
 *   - `ZM*` — Prazo Múltiplo (ex.: ZM01 = 28/56 dias): múltiplas parcelas,
 *     não há contagem única de dias.
 *   - `ZV*`, `ZX*`, `YM*`, `ZMDF` — vencimento em dia fixo do calendário ou
 *     número de dias "fora do mês": o prazo em dias depende da data de emissão.
 *   - `Y000`, `Y002`–`Y056`, `YX*`, `YZ*` — padrões complexos (decêndio,
 *     quinzena, data certa, datas múltiplas). ⚠️ **`Y001` é a exceção** e está
 *     na allowlist — ver abaixo.
 *   - `Z000` — "Vencimento igual à data base ou conforme contrato": indefinido.
 *   - `Z15S` — "15 dias subsequentes ao mês de emissão da NF": depende do mês.
 *   - `U015` ("A Definir"), `BW00` ("À Vista, Títulos Migrados"),
 *     `IA00` ("Pagável Antecipado"): casos especiais sem contagem padrão.
 *   - `Vxxx` ("Vendor Prazo N dias") — **prazo de FORNECEDOR, e o SAP recusa o
 *     documento de venda**. Medido em 15/08/2026 por experimento controlado
 *     contra o simulador de preço: a mesma cotação que responde `S` com o
 *     prazo em branco responde `E` **sem criar ordem de venda** quando o único
 *     campo alterado é `zterm = V020`; `V031` reproduz idêntico, então é a
 *     família e não um código específico. O org concorda: `V020` aparece em
 *     **0** das 97.725 linhas de cotação PCR, e a família inteira em **1**.
 *
 *     Estes códigos entraram na allowlist original por um critério de
 *     DERIVABILIDADE (o sufixo dá os dias) que nunca perguntou se o prazo é
 *     VÁLIDO num documento de venda a cliente. O modo de falha era invisível:
 *     a linha salvava normalmente, e a simulação de preço morria depois, do
 *     lado do SAP, sem nada na tela.
 *
 * Famílias cobertas (sempre retornam um número inteiro):
 *   - **`Y001` — "Antecipado (1º Paga e depois Recebe o produto)" ⇒ `0` dias**
 *     (ADO 67530, 03/09/2026). É o único `Y*` na allowlist, e a razão é
 *     medida: ele é o **segundo prazo mais usado** em cotação PCR no org —
 *     **9.072 das 91.113 linhas com prazo (10,0%)**, com 9 nos últimos 120 dias
 *     e a mais recente em 11/08/2026. Enquanto ele estava fora, duas coisas
 *     aconteciam ao mesmo tempo para esses clientes: o prazo que o simulador
 *     devolvia era **descartado** (`deriveDaysFromSapCode` devolvia `null`) e o
 *     usuário **não conseguia escolhê-lo** (o `filter` da picklist o removia) —
 *     ou seja, "o sistema não apresenta o prazo de pagamento", que é o título
 *     do bug, sem nenhuma ação de tela capaz de resolver.
 *
 *     `0` **não é um palpite**: pagamento antecipado é ausência de prazo de
 *     crédito, e é o que o número alimenta (margem e ARP). E o org **manda este
 *     código ao SAP** nessas 9.072 linhas, então ele é válido em documento de
 *     venda — diferente da família `Vxxx`, que foi medida sendo RECUSADA.
 *
 *     ⚠️ O retorno é `0`, um valor **falsy**: todo chamador compara
 *     `!== null`/`=== null`, nunca truthiness. Um `if (dias)` em qualquer ponto
 *     trataria "antecipado" como "não derivável".
 *   - `Zxxx` (Z001–Z360): "Pagável em N dias" — os 3 dígitos após `Z` = dias.
 *     Padrão: o código encoda o prazo diretamente no sufixo numérico.
 *   - `ZBxx` (ZB00–ZB90): "Pagável em N dias c/ Encargo Adic. no Bloqueto".
 *   - `ZGxx` (ZG00–ZG90): "Pagável em N dias c/ Encargo Adic. no Bloqueto+IGPM".
 *   - `ZRxx` (ZR12, ZR15, ZR30, ZR60, ZR90): "Pagável em N dias–Desconto
 *     regressivo". Atenção: `ZR12` → **120** dias (label diz "em 120 dias",
 *     não 12). Os demais seguem o sufixo numérico.
 *   - `ZA21`: "Pagável em 21 dias c/ Encargo Adic. no Bloqueto".
 */

/**
 * Mapa explícito para a família ZR, onde `ZR12` codifica **120 dias** (não 12).
 * Os demais (ZR15, ZR30, ZR60, ZR90) seguem o sufixo numérico normalmente,
 * mas a exceção do ZR12 exige um mapa em vez da extração direta.
 */
const ZR_MAP: Readonly<Record<string, number>> = {
  ZR12: 120,
  ZR15: 15,
  ZR30: 30,
  ZR60: 60,
  ZR90: 90,
};

/**
 * Derives the unique day-count for a SAP payment term code.
 *
 * Returns `null` for codes without a deterministic single day-count (e.g.
 * multi-instalment codes like `ZM01`, or calendar-day codes like `ZV20`).
 * These codes are excluded from the UI's picklist allowlist so the return
 * value is always a number for any code the user can actually select.
 *
 * @param code - Salesforce API name (`Prazo_De_Pagamento__c` value), e.g. `"Z030"`.
 * @returns Integer number of days, or `null` when not deterministic.
 */
export function deriveDaysFromSapCode(code: string): number | null {
  if (!code) return null;

  /*
   * `Y001` — "Antecipado (1º Paga e depois Recebe o produto)": zero dias de
   * prazo, porque o pagamento precede a entrega. Vem ANTES da família `Zxxx`
   * por clareza, não por precedência (os padrões não se sobrepõem).
   *
   * ⚠️ É o ÚNICO `Y*` derivável — os demais (`Y000`, `Y031`, …) são padrões de
   * calendário cujo prazo depende da data de emissão. Ver a lista de exclusões.
   */
  if (code === 'Y001') return 0;

  // Zxxx family (Z001–Z360): "Pagável em N dias"
  // Z000 excluded: "Vencimento igual à data base ou conforme contrato"
  // Z15S excluded: non-numeric suffix — does not match /^\d{3}$/.
  if (/^Z\d{3}$/.test(code) && code !== 'Z000') {
    return parseInt(code.slice(1), 10);
  }

  // ZBxx family (ZB00–ZB90): "Pagável em N dias c/ Encargo Adic. no Bloqueto"
  if (/^ZB\d{2}$/.test(code)) {
    return parseInt(code.slice(2), 10);
  }

  // ZGxx family (ZG00–ZG90): "Pagável em N dias c/ Encargo Adic. no Bloqueto +IGPM"
  if (/^ZG\d{2}$/.test(code)) {
    return parseInt(code.slice(2), 10);
  }

  // ZRxx family: explicit map because ZR12 → 120 dias (not 12)
  if (code in ZR_MAP) {
    return ZR_MAP[code];
  }

  // ZA21: "Pagável em 21 dias c/ Encargo Adic. no Bloqueto"
  if (code === 'ZA21') return 21;

  // Vxxx ("Vendor Prazo N dias") deliberately NOT here: the day count is
  // derivable, but the term is a SUPPLIER term and SAP refuses the sales
  // document. Offering it made the product line save and the price simulation
  // fail later, out of sight. See the exclusion list above.

  return null;
}
