import type { OpportunitySalesAreaOption } from '@/lib/opportunities/types';

/**
 * O recorte de área de venda que este MVP atende — **a ÚNICA constante
 * "Combustíveis Claros" do produto** (decisão de negócio, 14/08/2026).
 *
 * Ela mora aqui, e não no backend, porque é uma decisão de OFERTA: qual área o
 * LT pode escolher ao criar a oportunidade. Tudo o que vem depois — inclusive
 * quais produtos o seletor mostra — é **derivado** da área escolhida
 * (ADO 67913), nunca de uma segunda constante.
 *
 * ⚠️ Antes da ADO 67913 existiam duas: esta, e um setor fixo `02` na ACL de
 * pricing. Duas constantes dizendo a mesma coisa em lugares diferentes é como
 * o seletor de produto continuaria estreito no dia em que o negócio ampliasse
 * o escopo aqui — sem ninguém entender por quê. Para ampliar, mexa **só nesta
 * lista**.
 *
 * Medido no org em 28/08/2026 sobre as 55.725 contas DCVIM com Código SAP:
 * 40.356 (72,4%) têm área de Combustíveis Claros; entre as 10.323 que já têm
 * cotação PCR de verdade, são 9.990 (96,8%).
 */
export const AREA_VENDA_ALLOW = ['Combustíveis Claros'] as const;

/**
 * O recorte por extenso, para as frases de tela.
 *
 * Existe para que **ampliar o escopo seja UMA linha**: as mensagens que
 * nomeiam a ausência ("Nenhuma área de … nesta conta") derivam daqui em vez de
 * repetirem "Combustíveis Claros" à mão. Sem isto, o dia em que
 * {@link AREA_VENDA_ALLOW} crescesse deixaria duas frases afirmando um recorte
 * que já não é o do sistema — a mesma classe de constante duplicada que a
 * ADO 67913 removeu do backend, só que em prosa.
 */
export function describeAreaVendaAllow(): string {
  if (AREA_VENDA_ALLOW.length === 1) return AREA_VENDA_ALLOW[0];
  const inicio = AREA_VENDA_ALLOW.slice(0, -1).join(", ");
  return `${inicio} ou ${AREA_VENDA_ALLOW[AREA_VENDA_ALLOW.length - 1]}`;
}

/**
 * As áreas aprovadas da conta que o MVP serve.
 *
 * Casa por PREFIXO do rótulo (`"Combustíveis Claros / Vendas Indiretas"`), que
 * é como o org compõe o nome: linha de produto × canal.
 */
export function allowedSalesAreas(
  areas: readonly OpportunitySalesAreaOption[] | null | undefined,
): OpportunitySalesAreaOption[] {
  return (areas ?? []).filter((area) =>
    AREA_VENDA_ALLOW.some((prefix) => area.name.startsWith(prefix)),
  );
}

/**
 * O canal da área que a oportunidade nasce escolhendo (16/09/2026).
 *
 * > *"Ao criar uma oportunidade se o cliente for do tipo POSTO, na área de venda
 * > o campo de combustíveis claros / vendas indiretas deve vir selecionado por
 * > padrão."*
 *
 * ⚠️ **Não é gateado por "tipo POSTO", e isso é decisão registrada.** O prefill
 * não carrega tipo de cliente nenhum, e trazer um exigiria um campo novo
 * atravessando CRM → prefill → BFF → tela. Não foi preciso: a busca de cliente
 * da criação já é recortada à carteira **DCVIM** (revenda/postos), então todo
 * cliente que chega a esta tela é posto. Se um dia a tela servir outro tipo, é
 * aqui que o gate entra.
 */
export const CANAL_PADRAO = "Vendas Indiretas";

/** O canal de `"<setor> / <canal>"` — `null` quando o nome não tem essa forma. */
function canalDaArea(name: string): string | null {
  const partes = name.split("/");
  if (partes.length < 2) return null;
  return partes[partes.length - 1]!.trim();
}

/**
 * A área que o formulário nasce mostrando — `''` quando não há uma resposta
 * inequívoca.
 *
 * Duas regras, nesta ordem:
 *
 * 1. **Uma única área permitida** ⇒ ela. Não há o que escolher, e é a regra que
 *    já existia (mesmo critério de `formatosLojaParaBandeira`).
 * 2. **Várias** ⇒ a de {@link CANAL_PADRAO}, se houver exatamente uma. É o
 *    pedido do negócio: a conta de posto costuma ter `Combustíveis Claros /
 *    Vendas Indiretas` **e** `… / Vendas Diretas`, e o seletor abria em
 *    "Selecione…" nas duas.
 *
 * ⚠️ **Nunca inventa.** A escolha sai SEMPRE da lista de áreas aprovadas da
 * própria conta — `code` é o Id do registro `Area_De_Vendas__c`, e um código
 * fabricado seria recusado pelo backend e, pior, gravaria na oportunidade uma
 * área que ninguém no CRM aprovou (a classe do default `CIF` do incoterm).
 * Sem área do canal padrão, o campo continua em "Selecione…".
 *
 * ⚠️ **Empate não escolhe.** Duas áreas compondo o mesmo canal é ambiguidade
 * real, e aí vale a regra do picklist: quem decide é o usuário.
 */
export function defaultSalesAreaCode(
  areas: readonly OpportunitySalesAreaOption[] | null | undefined,
): string {
  const permitidas = allowedSalesAreas(areas);
  if (permitidas.length === 1) return permitidas[0]!.code;

  const doCanalPadrao = permitidas.filter(
    (area) => canalDaArea(area.name) === CANAL_PADRAO,
  );
  return doCanalPadrao.length === 1 ? doCanalPadrao[0]!.code : "";
}

/**
 * The selector label of a sales area — shared by the creation screen and the
 * proposal's `SalesAreaModal`, so the two never describe the same area
 * differently. An area still awaiting approval in the org says so: the LT is
 * choosing it knowingly (only a prospect is offered one — ADR-0055).
 */
export function salesAreaOptionLabel(area: OpportunitySalesAreaOption): string {
  const principal = area.isPrimary ? ' · principal' : '';
  const pendente = area.aprovada === false ? ' · aguardando aprovação' : '';
  return `${area.name}${principal}${pendente}`;
}
