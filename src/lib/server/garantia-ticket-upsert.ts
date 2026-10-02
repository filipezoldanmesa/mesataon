import type { GarantiaIndicarPayload } from '@/lib/garantia/indicacao-mapping';

/**
 * Traduz o corpo do TICKET (`GarantiaIndicarDto`) para o corpo do UPSERT
 * (`GarantiaIndicacaoUpsertDto`) — ADO 68335.
 *
 * ## O defeito que isto conserta
 *
 * A BFF de `PATCH .../garantia/indicacoes/:indicacaoId` fazia **passthrough
 * cru** do payload, apoiada na premissa (escrita no docblock da rota) de que
 * *"o ticket já monta o corpo do backend"*. Ele monta — mas o corpo de **outro**
 * endpoint: `montarGarantiaAtual` produz o `GarantiaIndicarDto` de
 * `garantia:indicar`, e o `PATCH` é servido por `GarantiaIndicacaoUpsertDto`,
 * que é o DTO do CARD da 01b. Os dois divergem em cinco campos.
 *
 * Como o `ValidationPipe` global roda com `forbidNonWhitelisted`, o primeiro
 * campo desconhecido derruba a requisição inteira:
 *
 * ```
 * 400 — O campo imovelEndereco não é permitido.
 * ```
 *
 * Medido em 10/09/2026 no ticket `PN-0175` (garantia real, `OPP-2026-000063`):
 * editar a garantia persistida e clicar em "Resolver pendência" respondia essa
 * frase e **nada era gravado**. Como toda `GARANTIA_REAL` e toda
 * `FIANCA_COM_LASTRO` têm endereço, **editar uma garantia com bem era
 * impossível pelo ticket** — que é justamente a tela onde a cobrança
 * "Cadastrar garantia" é resolvida quando a garantia já existe e está
 * incompleta.
 *
 * ⚠️ É a armadilha que o CLAUDE.md nomeia: *"BFF nunca faz passthrough cru do
 * payload do backend — compila e falha só em runtime"*. `tsc`, lint e os testes
 * de componente passavam: o corpo é serializado como `unknown`, e nos testes a
 * função cliente é mockada, então a borda BFF↔DTO não tinha dono. Mesma
 * classe do defeito de `parseGarantiaIndicacaoPayload` (02/09/2026), que
 * DESCARTAVA `fiadores`, `imovelCidade` e `imovelUf` em silêncio.
 *
 * ## Por que traduzir aqui, e não renomear de um dos lados
 *
 * - Renomear `imovelEndereco` no ticket mudaria o corpo de `garantia:indicar`,
 *   que é contrato de um endpoint em uso.
 * - Aceitar `imovelEndereco` como apelido no `GarantiaIndicacaoUpsertDto` daria
 *   dois nomes ao mesmo campo — o card manda `imovel` e o ticket mandaria outro,
 *   e a próxima tela escolheria o que quisesse.
 * - Traduzir na BFF é o que a rota do CARD já faz (`mapInputToBackend`), e a
 *   duplicação de rotas só se justificava porque cada uma converte a forma DA
 *   SUA tela.
 */

/**
 * Para onde cada campo do corpo do ticket vai no corpo do upsert — `null`
 * quando ele não existe lá e é DESCARTADO.
 *
 * ⚠️ **O mapa é exaustivo por tipo** (`{[K in keyof GarantiaIndicarPayload]-?:
 * …}`): campo novo no payload do ticket **não compila** até ser classificado
 * aqui. É a mesma rede que `parseGarantiaIndicacaoPayload` ganhou depois de
 * descartar três campos em silêncio — e é ela, não a tradução em si, que impede
 * a próxima geração deste defeito.
 *
 * Os quatro descartados, e por quê:
 *
 * - `sapGarantiaExternaId` — `GarantiaIndicacoesService.update` **não toca** a
 *   coluna, de propósito (o card não a coleta nem a exibe). Mandá-la é 400;
 *   descartá-la PRESERVA o valor que a criação gravou.
 * - `estatutoBancoDocumentId` — o estatuto do banco saiu em 02/09/2026
 *   (`selectable = false`); o campo sobrevive no DTO de criação só por
 *   compatibilidade, e nenhuma tela o envia.
 * - `certidaoDocumentId` / `laudoDocumentId` — slots LEGADOS. Desde a spec de
 *   28/08/2026 o documento sobe depois, pela rota tipada, vinculado à garantia.
 */
const DESTINO_NO_UPSERT = {
  tipo: 'tipo',
  origem: 'origem',
  utilizacao: 'utilizacao',
  // ⚠️ O renomeado — a causa do 400.
  imovelEndereco: 'imovel',
  matriculas: 'matriculas',
  quantidadeLaudos: 'quantidadeLaudos',
  imovelCidade: 'imovelCidade',
  imovelUf: 'imovelUf',
  categoria: 'categoria',
  valorAvaliadoBRL: 'valorAvaliadoBRL',
  fiadores: 'fiadores',
  compartilhadaComOutrasOportunidades: 'compartilhadaComOutrasOportunidades',
  detalhesCompartilhamento: 'detalhesCompartilhamento',
  observacoes: 'observacoes',
  estatutoBancoDocumentId: null,
  certidaoDocumentId: null,
  laudoDocumentId: null,
  sapGarantiaExternaId: null,
} as const satisfies { [K in keyof GarantiaIndicarPayload]-?: string | null };

/** Os campos do ticket que o upsert não conhece — exportado para o teste. */
export const CAMPOS_DESCARTADOS_NO_UPSERT = Object.entries(DESTINO_NO_UPSERT)
  .filter(([, destino]) => destino === null)
  .map(([origem]) => origem);

/**
 * O corpo do `PATCH .../garantia/indicacoes/:indicacaoId`, a partir do corpo
 * que o ticket monta.
 *
 * ⚠️ **`undefined` é omitido; `null` NÃO.** O upsert é substituição completa,
 * então `utilizacao: null` é a resposta "Nenhum" e precisa chegar — colapsar os
 * dois faria o campo ficar com o valor antigo justamente quando o usuário o
 * limpou.
 */
export function ticketPayloadParaUpsert(
  payload: GarantiaIndicarPayload,
): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};

  for (const [origem, destino] of Object.entries(DESTINO_NO_UPSERT)) {
    if (destino === null) continue;

    const valor = payload[origem as keyof GarantiaIndicarPayload];
    if (valor === undefined) continue;

    corpo[destino] = valor;
  }

  return corpo;
}
