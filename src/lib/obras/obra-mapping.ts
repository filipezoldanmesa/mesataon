import { formatCurrencyBRL } from '@/lib/clients/format';

import type { LinhaDeImagem } from './linha-de-imagem';

/**
 * Fronteira BFF → front da obra do Converge (ADR-0048).
 *
 * O backend e o front usam o mesmo vocabulário (os dois em português), o que
 * torna tentador fazer `NextResponse.json(await res.json())`. A doutrina do repo
 * é explícita contra isso: passthrough cru **compila** (a expressão não tem
 * tipo) e falha só em runtime, renderizando campo vazio e `Invalid Date`. Daí a
 * interface `Backend*` explícita e o mapa campo a campo, com spec própria.
 */

/** Uma parcela do orçamento, como o Converge a publica. */
export interface ObraParcela {
  /**
   * Ordem da parcela.
   *
   * ⚠️ **`0` é a parcela de IMPOSTOS**, não a primeira — as da obra vêm 1, 2, …
   * (medido nas estimativas 4710 e 5305). Quem decide é o veredito
   * {@link ObraParcela.imposto}; este campo é só a ordem que a fonte publicou.
   */
  numero: number;
  /**
   * Rótulo da parcela na fonte (`"Pista 1ª parcela"`, `"Imposto"`). `null` em
   * retrato local anterior a 03/09/2026, quando o campo entrou no envelope.
   */
  descricao: string | null;
  /**
   * Valor DESTA parcela — os valores diferem entre parcelas (medido: 90.011,88
   * e 90.011,86).
   */
  valor: number;
  /**
   * `PaymentTerm` da fonte. ⚠️ **Exibido nunca, consumido nunca**: a unidade não
   * é declarada em lugar nenhum e a regra de data das parcelas foi fechada pelo
   * negócio sem ele. Viaja para o dia em que houver contrato.
   */
  prazoPagamentoDias: number | null;
  /**
   * Veredito do BACKEND: esta é a parcela de impostos (ADO 67924).
   *
   * ⚠️ **Nunca recalcule isto no front.** A regra tem dois braços (a descrição,
   * e o `numero === 0` para o retrato antigo que não tem descrição) e vive em
   * `obras/domain/obra-parcelas.ts`; uma cópia aqui divergiria exatamente no
   * retrato antigo. Ausente no fio ⇒ `false`, que é a leitura conservadora: a
   * parcela entra como parcela da OBRA e o dinheiro continua no total.
   */
  imposto: boolean;
}

/** Uma rubrica de "outros valores". A descrição vem com prefixo de categoria. */
export interface ObraOutroValor {
  descricao: string;
  valor: number;
}

/** Uma obra do Converge. ⚠️ Carrega PII de terceiros — nunca logar. */
export interface Obra {
  /** `EstimateId` — a chave. Identificador opaco de terceiro. */
  estimateId: string;
  /** `null` enquanto a obra não existe no Converge — o caso medido. */
  globalConstructionId: string | null;
  tipo: string;
  /**
   * Texto livre da fonte. **Exibir, nunca filtrar nem traduzir**: o valor medido
   * (`"Orçamento gerado"`) não é nenhuma das strings que a especificação cita, e
   * o `GetEstimates` já recorta no servidor.
   */
  status: string;
  tipoNegocio: string;
  clienteNome: string;
  clienteCnpj: string;
  empreiteiraNome: string;
  empreiteiraCnpj: string;
  ltNome: string;
  /** Só quando é e-mail de verdade — a fonte manda um username neste campo. */
  ltEmail: string | null;
  engenheiroNome: string;
  engenheiroEmail: string | null;
  /**
   * String decimal.
   *
   * ⚠️ **É TRUNCADO** (`int32` na fonte) e não é a soma das parcelas: medido em
   * 03/09/2026, a soma das três parcelas de `5305` é 186.157,22 e este campo
   * vale 186.157,00. Quem precisa de total com centavos soma `parcelas` e diz
   * que somou; derivar um do outro grava valor que ninguém informou.
   */
  valorTotalBrl: string;
  parcelas: ObraParcela[];
  outrosValores: ObraOutroValor[];
  /**
   * A linha de imagem, DERIVADA pelo backend (`derivarLinhaDeImagem`): decide
   * a finalidade e a etapa da liberação dos recursos que a obra gera.
   *
   * `null` quando a obra não a declara — e aí quem responde é o LT no
   * diálogo. ⚠️ **Não derive aqui**: o sinal é o prefixo do `AnotherValueList`
   * (`IMG`/`LBX`/`BRM`), e a descrição da parcela é uma armadilha — ela diz
   * `"Pista 1ª parcela"` até nas obras de Lubrax+ e de BR Mania (medido).
   */
  linhaImagem: LinhaDeImagem | null;
  /** `null` na leitura ao vivo, que não tem retrato guardado para datar. */
  sincronizadoEm: string | null;
}

/**
 * O andamento da obra — o que o webhook do Converge empurra.
 *
 * ⚠️ **Fonte DIFERENTE do resto da `Obra`.** A `Obra` é o retrato do
 * `GetEstimates` (o orçamento); isto é o `ConstructionStructure` do callback
 * `UpdateOpportunityConstruction`. São dois envelopes distintos, e é por isso que
 * pode existir obra sem andamento.
 */
export interface ObraAndamento {
  /** Classificado contra lista fechada. `DESCONHECIDO` quando o fio traz valor fora dela. */
  status: string;
  statusLabel: string;
  /**
   * O número da OBRA no Converge (`ConstructionId`), que nasce com o callback.
   *
   * ⚠️ **Não é o `estimateId`**, que é o número da ESTIMATIVA (o orçamento) e
   * vem de outro envelope. O card exibe os dois, em linhas separadas.
   * `null` quando o callback não o trouxe — a linha some, em vez de um traço.
   */
  constructionId: string | null;
  /** Código da pill do design system (`s`/`w`/`i`/`d`/`n`). */
  statusPill: string;
  /**
   * Fases concluídas ÷ total. `null` quando o callback não trouxe fases — `0`
   * afirmaria que nada foi feito.
   */
  percentualAvanco: number | null;
  /**
   * String no fio, **em DIAS** — unidade declarada pelo negócio em 16/09/2026,
   * depois de o campo viver sem ela (a fonte nunca a publicou, e o
   * `holdTimeInDays` ao lado é outro número, esse sempre em dias).
   *
   * ⚠️ O tipo permanece `string`: é retrato do que veio, e `"0"` é resposta
   * legítima. Quem lê como número e monta o rótulo/prazo é `lib/obras/obra-prazo.ts`.
   */
  sla: string | null;
  holdTimeInDays: number | null;
  inicio: string | null;
  fim: string | null;
  atualizadoEm: string;
}

/**
 * O status do **§6** — o que a oportunidade exibe.
 *
 * ⚠️ **Não é o status do Converge** (esse fica em {@link ObraAndamento.status}).
 * Este combina o estágio da oportunidade no GOP com o que o Converge empurra, e
 * depende do modelo de contratação (§6.1 Recurso Financeiro × §6.2 Investimento).
 */
export interface ObraStatusInterno {
  status: string | null;
  /** Código da pill do design system (`s`/`w`/`i`/`d`/`n`). */
  pill: string;
  /**
   * O Converge já acompanha a obra — `true` a partir de "Aguardando início".
   *
   * ⚠️ **Veredito do BACKEND.** É o gate do número da obra e do "Status no
   * Converge" no card; compará-lo aqui com nome de status divergiria assim que
   * um degrau novo entrasse na escada.
   */
  acompanhadaNoConverge: boolean;
}

export interface ObraReadModel {
  /** `null` é fato de negócio ("não tem obra"), não erro. */
  selecionada: Obra | null;
  /** `null` quando não há obra — sem obra não há escada do §6 a percorrer. */
  statusInterno: ObraStatusInterno | null;
  /**
   * `null` significa **"nenhum callback ainda"**, não "obra parada". A obra pode
   * ter sido vinculada há minutos e o Converge só empurrar o estado depois.
   */
  andamento: ObraAndamento | null;
}

export interface BackendObra {
  estimateId: string;
  globalConstructionId: string | null;
  tipo: string;
  status: string;
  tipoNegocio: string;
  clienteNome: string;
  clienteCnpj: string;
  empreiteiraNome: string;
  empreiteiraCnpj: string;
  ltNome: string;
  ltEmail: string | null;
  engenheiroNome: string;
  engenheiroEmail: string | null;
  valorTotalBrl: string;
  parcelas: ObraParcela[];
  outrosValores: ObraOutroValor[];
  linhaImagem?: LinhaDeImagem | null;
  sincronizadoEm: string | null;
}

/**
 * Uma parcela, campo a campo.
 *
 * `?? null` / `?? false` não são "erro virando valor": o backend sempre manda
 * os cinco campos, e os defaults existem porque o mapper é a FRONTEIRA e não
 * pode confiar na forma do JSON — um cliente rodando contra um backend anterior
 * a esta entrega recebe a parcela sem `descricao`, sem `prazoPagamentoDias` e
 * sem `imposto`, e nesse caso tratar tudo como parcela da obra é a degradação
 * que preserva o total.
 */
function mapParcela(raw: ObraParcela): ObraParcela {
  return {
    numero: raw.numero,
    descricao: raw.descricao ?? null,
    valor: raw.valor,
    prazoPagamentoDias: raw.prazoPagamentoDias ?? null,
    imposto: raw.imposto ?? false,
  };
}

export function mapObra(raw: BackendObra): Obra {
  return {
    estimateId: raw.estimateId,
    globalConstructionId: raw.globalConstructionId ?? null,
    tipo: raw.tipo,
    status: raw.status,
    tipoNegocio: raw.tipoNegocio,
    clienteNome: raw.clienteNome,
    clienteCnpj: raw.clienteCnpj,
    empreiteiraNome: raw.empreiteiraNome,
    empreiteiraCnpj: raw.empreiteiraCnpj,
    ltNome: raw.ltNome,
    ltEmail: raw.ltEmail ?? null,
    engenheiroNome: raw.engenheiroNome,
    engenheiroEmail: raw.engenheiroEmail ?? null,
    // Fica STRING: quem formata é a tela. Converter para number aqui
    // reintroduziria a perda de precisão que a string existe para evitar.
    valorTotalBrl: raw.valorTotalBrl,
    /*
     * `?? []` não é "erro virando lista vazia": vazio É a resposta do backend
     * para "esta obra não tem parcela". O que o fallback impede é `undefined`
     * chegar à tela e quebrar um `.map()` — o mapper é a fronteira e não pode
     * confiar na forma do JSON.
     */
    parcelas: (raw.parcelas ?? []).map(mapParcela),
    outrosValores: raw.outrosValores ?? [],
    /*
     * `?? null` é a degradação honesta contra um backend anterior a esta
     * entrega: sem o campo, a obra "não declara a linha" e o diálogo pergunta
     * ao LT — em vez de assumir Pista, que é o palpite que derruba o grafo da
     * cotação quando erra.
     */
    linhaImagem: raw.linhaImagem ?? null,
    sincronizadoEm: raw.sincronizadoEm ?? null,
  };
}

export interface BackendObraAndamento {
  status: string;
  statusLabel: string;
  constructionId?: string | null;
  statusPill: string;
  percentualAvanco: number | null;
  sla: string | null;
  holdTimeInDays: number | null;
  inicio: string | null;
  fim: string | null;
  atualizadoEm: string;
}

export function mapObraAndamento(raw: BackendObraAndamento): ObraAndamento {
  return {
    status: raw.status,
    statusLabel: raw.statusLabel,
    statusPill: raw.statusPill,
    constructionId: raw.constructionId ?? null,
    /*
     * `?? null` e NÃO `?? 0`: os dois significam coisas diferentes. `0` é "nenhuma
     * fase concluída" — afirmação legítima do backend — e `null` é "não há por
     * onde calcular". Colapsá-los faria a barra de progresso desenhar zero para
     * uma obra sobre a qual não sabemos nada.
     */
    percentualAvanco: raw.percentualAvanco ?? null,
    sla: raw.sla ?? null,
    holdTimeInDays: raw.holdTimeInDays ?? null,
    inicio: raw.inicio ?? null,
    fim: raw.fim ?? null,
    atualizadoEm: raw.atualizadoEm,
  };
}

export interface BackendObraStatusInterno {
  status: string | null;
  pill: string;
  acompanhadaNoConverge?: boolean;
}

export function mapObraReadModel(raw: {
  selecionada: BackendObra | null;
  andamento?: BackendObraAndamento | null;
  statusInterno?: BackendObraStatusInterno | null;
}): ObraReadModel {
  return {
    selecionada: raw.selecionada ? mapObra(raw.selecionada) : null,
    statusInterno: raw.statusInterno
      ? {
          status: raw.statusInterno.status ?? null,
          pill: raw.statusInterno.pill,
          /*
           * Ausente ⇒ `false`: esconder os dois campos é o estado conservador.
           * Exibi-los por omissão mostraria "Status no Converge" para uma obra
           * que o Converge nem abriu.
           */
          acompanhadaNoConverge: raw.statusInterno.acompanhadaNoConverge === true,
        }
      : null,
    // ⚠️ O campo tem de ser mapeado explicitamente. Antes ele nem constava do
    // tipo, então o `andamento` chegava da API e MORRIA aqui — o mapeamento
    // explícito é a doutrina do repo justamente para que isso seja visível.
    andamento: raw.andamento ? mapObraAndamento(raw.andamento) : null,
  };
}

/**
 * Rótulo de uma opção de obra no seletor.
 *
 * Estrutura verbatim do protótipo (`03-proposta-nova.html`):
 * `"OBR-2026-0450 · Nova Imagem completa — R$ 360.000 · Confirmada"` — ou seja
 * `id · tipo — valor · status`.
 *
 * O status entra **cru**: é texto livre da fonte, e um de/para aqui esconderia
 * justamente o achado de que o valor real não é nenhum dos que a especificação
 * cita.
 *
 * ## O valor é a SOMA DAS PARCELAS, não o `TotalValue` (ADO 67924)
 *
 * `valorTotalBrl` é o `TotalValue` da fonte, e ele é **`int32`**: trunca os
 * centavos. Medido em staging em 04/09/2026 na estimativa `5305`, isso punha
 * TRÊS números diferentes para a mesma obra na mesma tela —
 * `R$ 186.157,00` no rótulo do select, `R$ 186.157,22` no total do cronograma
 * logo abaixo e `R$ 184.195,76` na nota do valor sem impostos. O rótulo era o
 * único dos três que não vinha das parcelas.
 *
 * A soma é a mesma que o cronograma exibe (o "Valor total bruto" da tela do
 * Converge), em centavos pela razão de sempre: `92097.88 + 92097.88 + 1961.46`
 * em ponto flutuante não devolve exatamente `186157.22`.
 *
 * `TotalValue` continua como reserva para a obra que não publica parcela
 * nenhuma — ali ele é o único número que existe.
 */
export function obraOptionLabel(obra: Obra): string {
  const valor = valorExibidoDaObra(obra);
  /*
   * Valor não interpretável ⇒ o trecho monetário é OMITIDO, nunca "R$ NaN".
   * A fonte declara `TotalValue` como int32, mas o campo atravessa como string
   * e um valor inesperado não pode virar texto que parece dado.
   */
  const meio = valor === null ? '' : ` — ${formatCurrencyBRL(valor)}`;
  return `${obra.estimateId} · ${obra.tipo}${meio} · ${obra.status}`;
}

/**
 * O valor da obra que a tela mostra — soma das parcelas, ou o `TotalValue`
 * quando a fonte não publicou parcela nenhuma. `null` quando nem isso resolve.
 */
function valorExibidoDaObra(obra: Obra): number | null {
  if (obra.parcelas.length > 0) {
    const centavos = obra.parcelas.reduce(
      (total, p) => total + Math.round(p.valor * 100),
      0,
    );
    if (Number.isFinite(centavos)) return centavos / 100;
  }

  const total = Number(obra.valorTotalBrl);
  return Number.isFinite(total) ? total : null;
}
