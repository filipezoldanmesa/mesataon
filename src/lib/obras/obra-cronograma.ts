import { PeriodicidadeRecurso } from '@/lib/picklists/salesforce-values';

import type { ObraParcela } from './obra-mapping';

/**
 * O cronograma das parcelas da obra — ADO 67924.
 *
 * ## O que o negócio pediu, verbatim (26/08/2026)
 *
 * > "O VIBRAGO deverá trazer do CONVERGE e apresentar 3 parcelas referente a
 * > nova imagem:
 * > 1) 1ª parcela (igual a 50% Valor total sem impostos) e com data de
 * >    lançamento de acordo com o escolhido pelo LT
 * > 2) 2ª parcela (igual a 50% Valor total sem impostos) e com data de
 * >    lançamento de 1 mês após a primeira
 * > 3) Parcela Impostos (igual a 'parcela imposto' do converge) e com data de
 * >    lançamento igual a 2ª parcela, ou seja, 1 mês após a primeira."
 *
 * Os VALORES não são calculados aqui: o Converge publica os três, e as duas
 * parcelas da obra dele **são** os 50% do valor sem impostos (medido na
 * estimativa `5305`: 92.097,88 × 2 = 184.195,76, exatamente o "Valor total
 * líquido" da tela deles). O que esta função deriva são as **datas**, que a
 * fonte não publica — e a regra delas é a de cima.
 *
 * ## Por que no FRONT
 *
 * A data da 1ª parcela é a data de liberação, que no modal é um campo do
 * formulário **ainda não salvo**. Um cronograma vindo do backend não teria como
 * reagir ao usuário mudando a data à sua frente; e é exatamente aí que a
 * pergunta do anexo do bug ("que data é esta?") se responde.
 *
 * ## ⚠️ Duas regras de data, e a do diálogo de obra é OUTRA (10/09/2026)
 *
 * - `'periodicidade'` (default) — o cartão do recurso legado: a cadência
 *   mensal que a periodicidade projeta, com a parcela de impostos junto da
 *   última parcela da obra. É a regra pedida em 26/08/2026, e ela permanece
 *   onde já valia.
 * - `'obra-um-mes'` — o diálogo "Adicionar obra": a 1ª parcela vence na data
 *   de liberação inicial e **todas** as demais um mês depois dela, na mesma
 *   data. É a regra nova, e é a que o backend grava nos itens gerados — a
 *   tabela do diálogo passou a exibir a data justamente para a tela não
 *   mostrar um cronograma diferente do que vai ser salvo.
 *
 * ⚠️ O intervalo é **UM MÊS de calendário** (`addMonthsClamped`), igual ao da
 * regra de 26/08 — a decisão de 10/09 nasceu como "30 dias" e foi alinhada ao
 * pedido anterior no mesmo dia. As duas contas só divergem quando o mês-base
 * não tem 30 dias (31/01 + 1 mês é 28/02; + 30 dias seria 02/03).
 *
 * ⚠️ O que distingue as duas regras, então, não é a aritmética: é **de onde
 * sai o passo**. Na de periodicidade ele é `índice × meses da periodicidade`;
 * aqui é um mês fixo para toda parcela depois da primeira, porque o diálogo
 * não tem campo de periodicidade.
 *
 * ## O que ela deliberadamente NÃO faz
 *
 * - **Não classifica a parcela de impostos.** Lê o veredito
 *   `ObraParcela.imposto`, que o backend publica (`obras/domain/obra-parcelas.ts`).
 *   A regra tem dois braços e uma cópia aqui divergiria no retrato antigo.
 * - **Não usa `PaymentTerm`.** A fonte publica `37` em todas as parcelas e não
 *   declara a unidade em lugar nenhum; a regra de data veio do negócio sem ele.
 * - **Não inventa data.** Sem data de liberação, `data` é `null` e a tela
 *   mostra travessão: uma data derivada de nada é indistinguível de uma real.
 */

/**
 * Meses entre parcelas, por periodicidade. `0` = liberação única.
 *
 * Exportada porque a regra "a data final não pode ultrapassar o término do
 * contrato" (`lib/proposals/data-final-recurso.ts`) precisa da MESMA tabela: uma
 * segunda cópia divergiria no dia em que uma periodicidade nova entrasse.
 */
export const MESES_POR_PERIODICIDADE: Record<PeriodicidadeRecurso, number> = {
  [PeriodicidadeRecurso.Unica]: 0,
  [PeriodicidadeRecurso.Mensal]: 1,
  [PeriodicidadeRecurso.Bimestral]: 2,
  [PeriodicidadeRecurso.Trimestral]: 3,
  [PeriodicidadeRecurso.Quadrimestral]: 4,
  [PeriodicidadeRecurso.Semestral]: 6,
  [PeriodicidadeRecurso.Anual]: 12,
};

/**
 * Lê `YYYY-MM-DD` como `Date` em UTC, ou `null` quando não é uma data real.
 *
 * O `Date.UTC` normaliza componentes fora de faixa (`2026-02-31` viraria 03/03)
 * em vez de falhar, então o resultado é conferido de volta contra a entrada.
 */
export function parseIsoUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;

  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return d;
}

/**
 * `ADDMONTHS` do Salesforce: soma meses e, quando o dia não existe no mês alvo,
 * devolve o ÚLTIMO dia dele — 31/01 + 1 mês é 28/02, não 03/03. A aritmética
 * nativa de `Date` transborda; o clamp é explícito.
 *
 * ⚠️ **É a mesma regra de `addMonthsClamped` do backend**, que já a aplica na
 * `Data Final` do recurso financeiro. Não há pacote compartilhado entre os dois
 * apps para uma implementação só; o que impede a divergência é o teste, que usa
 * o mesmo caso de borda (dia 31) dos dois lados.
 */
export function addMonthsClamped(data: Date, meses: number): string {
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth() + meses;
  const dia = data.getUTCDate();

  const ultimoDiaDoMesAlvo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const alvo = new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDiaDoMesAlvo)));
  return alvo.toISOString().slice(0, 10);
}

/** Uma linha do cronograma, pronta para a tela. */
export interface ParcelaCronograma {
  /**
   * Rótulo da linha. Vem da DESCRIÇÃO da fonte quando ela existe
   * (`"Pista 1ª parcela"`, `"Imposto"`) — é o que a tela do Converge mostra, e
   * é o que permite conferir os dois lados lado a lado. Sem descrição (retrato
   * antigo), cai no ordinal.
   */
  rotulo: string;
  valor: number;
  /** ISO `YYYY-MM-DD`, ou `null` quando a data de liberação não foi informada. */
  data: string | null;
  imposto: boolean;
  /**
   * A etapa da liberação DESTA parcela, quando o chamador informa os campos da
   * linha. A 1ª leva a etapa de contratação do fornecedor e as demais a de
   * implantação — e é o que o backend grava item a item, então a tabela do
   * diálogo a exibe para as duas metades não poderem divergir em silêncio.
   */
  etapa: string | null;
}

export interface CronogramaDaObra {
  parcelas: ParcelaCronograma[];
  /** Soma das parcelas da OBRA, em reais — o total líquido (sem impostos). */
  totalObra: number;
  /** Valor da parcela de impostos, ou `null` quando a fonte não publicou uma. */
  totalImposto: number | null;
  /** Soma de TUDO, em reais — o total bruto da tela do Converge. */
  totalGeral: number;
}

/**
 * Monta o cronograma. Devolve `null` quando não há parcela nenhuma — sem
 * parcelas não há cronograma, e uma tabela vazia leria como dado que falhou.
 */
export function cronogramaDaObra(
  entrada: readonly ObraParcela[],
  opcoes: {
    dataLiberacao?: string | null;
    periodicidade?: string | null;
    /** Ver "Duas regras de data" na doc do módulo. Default: `'periodicidade'`. */
    regra?: 'periodicidade' | 'obra-um-mes';
    /** Etapas da linha da obra. Ausente ⇒ `etapa: null` em toda linha. */
    etapas?: { etapaContratacao: string; etapaImplantacao: string } | null;
  },
): CronogramaDaObra | null {
  /*
   * A parcela de impostos ZERADA não vira linha — medido em staging em
   * 04/09/2026 na estimativa `7501` (`PCR-VITORIA-000080` / `000085`), onde o
   * Converge publica `{descricao: "Imposto", numero: 0, valor: 0}`.
   *
   * A linha "Imposto R$ 0,00" não informa nada e ocupa o lugar em que o negócio
   * espera ler um valor: o pedido de 26/08/2026 é *"Parcela Impostos (igual a
   * 'parcela imposto' do converge)"* — e a parcela do Converge, aqui, é zero,
   * isto é, não existe.
   *
   * ⚠️ Nenhum TOTAL muda de valor: `totalGeral` deixa de somar um zero. O que
   * muda de forma é `totalImposto`, que passa a `null` — e é o resultado
   * desejado, porque é ele que decide a nota "A parcela de impostos (R$ …)
   * vence junto da última parcela": uma nota sobre R$ 0,00 seria o mesmo ruído
   * que a linha. Isto é apresentação; o retrato local segue intacto.
   *
   * ⚠️ `valor === 0`, nunca `!p.valor`: parcela sem imposto tem `valor` real e
   * `NaN` (que um `!` também capturaria) seria dado corrompido, não ausência.
   * E o recorte é só para `imposto === true` — parcela DA OBRA valendo zero é
   * fato do orçamento e continua na tabela.
   */
  const parcelas = entrada.filter((p) => !(p.imposto && p.valor === 0));
  if (parcelas.length === 0) return null;

  const inicio = parseIsoUtc(opcoes.dataLiberacao);
  const meses =
    MESES_POR_PERIODICIDADE[opcoes.periodicidade as PeriodicidadeRecurso] ??
    /*
     * Periodicidade não escolhida ainda, ou valor fora do vocabulário: as datas
     * das parcelas seguintes ficam desconhecidas. `0` colapsaria todas na data
     * de liberação — afirmaria um cronograma de liberação única que ninguém
     * escolheu —, então o fallback é `null` e as linhas seguintes ficam sem data.
     */
    null;

  const regraDaObra = opcoes.regra === 'obra-um-mes';
  const daObra = parcelas.filter((p) => !p.imposto);

  /*
   * A data da parcela de impostos é a da ÚLTIMA parcela da obra: com as duas
   * parcelas medidas isso é "1 mês após a primeira", que é o que o negócio
   * escreveu. Derivar do índice dela na lista daria a data errada (ela é a 3ª
   * linha, e o negócio a quer junto da 2ª).
   */
  const ultimoIndiceDaObra = Math.max(0, daObra.length - 1);

  const daObraEmOrdem = regraDaObra ? ordenarParaODialogo(parcelas) : parcelas;

  let ordem = 0;
  const linhas: ParcelaCronograma[] = daObraEmOrdem.map((p, posicao) => {
    const indice = p.imposto ? ultimoIndiceDaObra : ordem++;
    const passo = indice === 0 ? 0 : meses === null ? null : indice * meses;

    /*
     * Na regra do diálogo a POSIÇÃO manda (1ª na data inicial, resto em +30),
     * e não o papel da parcela: a de impostos é a última e cai junto da 2ª,
     * que é exatamente o que o negócio descreveu.
     */
    const data = regraDaObra
      ? inicio === null
        ? null
        : posicao === 0
          ? addMonthsClamped(inicio, 0)
          : addMonthsClamped(inicio, 1)
      : inicio !== null && passo !== null
        ? addMonthsClamped(inicio, passo)
        : null;

    return {
      rotulo: rotuloDaParcela(p, p.imposto ? null : indice + 1),
      valor: p.valor,
      data,
      imposto: p.imposto,
      etapa: !opcoes.etapas
        ? null
        : posicao === 0
          ? opcoes.etapas.etapaContratacao
          : opcoes.etapas.etapaImplantacao,
    };
  });

  const somaCentavos = (lista: readonly ObraParcela[]): number =>
    lista.reduce((t, p) => t + Math.round(p.valor * 100), 0);

  const imposto = parcelas.find((p) => p.imposto) ?? null;

  return {
    parcelas: linhas,
    // Em centavos e só depois em reais: somar `number` em ponto flutuante deixa
    // resíduo, e este total aparece ao lado dos valores que o compõem.
    totalObra: somaCentavos(daObra) / 100,
    totalImposto: imposto === null ? null : imposto.valor,
    totalGeral: somaCentavos(parcelas) / 100,
  };
}

/**
 * A ordem do diálogo: as parcelas da obra por número crescente, a de impostos
 * por último — a MESMA de `gerarRecursosDaObra` no backend. Sem ela, um
 * envelope que publicasse o imposto primeiro faria a tela mostrar uma primeira
 * parcela diferente da que a API grava.
 *
 * Ordena uma cópia: a lista de entrada é o retrato, exibido "na ordem da fonte"
 * nas outras superfícies.
 */
function ordenarParaODialogo(
  parcelas: readonly ObraParcela[],
): readonly ObraParcela[] {
  return [...parcelas].sort((a, b) => {
    if (a.imposto !== b.imposto) return a.imposto ? 1 : -1;
    return a.numero - b.numero;
  });
}

/** Rótulo da linha: a descrição da fonte, ou o ordinal quando ela não veio. */
function rotuloDaParcela(parcela: ObraParcela, ordinal: number | null): string {
  const descricao = parcela.descricao?.trim();
  if (descricao) return descricao;
  if (parcela.imposto) return 'Parcela de impostos';
  return `${ordinal ?? parcela.numero}ª parcela`;
}
