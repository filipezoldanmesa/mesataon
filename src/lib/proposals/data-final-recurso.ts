import {
  addMonthsClamped,
  MESES_POR_PERIODICIDADE,
} from '@/lib/obras/obra-cronograma';
import { PeriodicidadeRecurso } from '@/lib/proposals/financial-resources.types';

/**
 * A `Data Final` de um recurso financeiro não pode ultrapassar o término do
 * contrato — o ESPELHO da regra do backend (pedido do negócio, 10/09/2026).
 *
 * > *"A data final dos Recursos Financeiros não pode ultrapassar o término do
 * > contrato, nesse caso será para a BONIFICAÇÃO."*
 *
 * ## Por que existe no front
 *
 * O modal já cobra que a data de LIBERAÇÃO caia na janela da proposta (CA-3 /
 * Bug-67514), mas ela é o começo do cronograma. Medido no relato: liberação em
 * `2026-10-01` dentro da janela, **17× mensal**, e a última parcela caindo em
 * `2028-02-01` — dois meses depois do fim do contrato (`2027-12-31`).
 *
 * ⚠️ **O backend continua sendo a autoridade** (`motivoDataFinalForaDoContrato`,
 * em `proposals/domain/`). Isto antecipa o veredito para o LT não preencher o
 * formulário inteiro e receber um 400 no fim — a recusa tardia que este
 * repositório persegue.
 *
 * ## A aritmética é COMPARTILHADA, não copiada
 *
 * `addMonthsClamped` e `MESES_POR_PERIODICIDADE` vêm de `obra-cronograma`, que
 * já as usava para datar as parcelas da obra. Uma terceira cópia da soma de
 * meses divergiria no caso de borda (dia 31) ou na periodicidade nova. Não há
 * pacote compartilhado entre os dois apps, então o que impede a divergência
 * com o backend é o teste, que usa o MESMO caso dos dois lados — a mesma
 * disciplina que `addMonthsClamped` já documenta.
 */

/**
 * `Data Final` = vencimento da ÚLTIMA parcela, em ISO `YYYY-MM-DD`.
 *
 * A primeira parcela vence NA data de liberação, então o intervalo cabe
 * `qtdParcelas − 1` vezes — a mesma convenção do `deriveDataFinal` do backend.
 *
 * `null` quando não dá para derivar (data ausente/inválida, quantidade não
 * positiva, periodicidade desconhecida). Nunca uma data inventada.
 */
export function deriveDataFinalRecurso(
  dataLiberacao: string | null | undefined,
  qtdParcelas: number,
  periodicidade: PeriodicidadeRecurso | null | undefined,
): string | null {
  if (!dataLiberacao) return null;
  if (!Number.isFinite(qtdParcelas) || qtdParcelas < 1) return null;
  if (!periodicidade) return null;

  const meses = MESES_POR_PERIODICIDADE[periodicidade];
  if (meses === undefined) return null;

  const base = new Date(`${dataLiberacao.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;

  return addMonthsClamped(base, (qtdParcelas - 1) * meses);
}

/**
 * A frase da recusa, ou `null` quando o cronograma cabe.
 *
 * ⚠️ **Degrada para `null` em toda incerteza** — término ausente, data final
 * inderivável. Bloquear o save por desconhecimento tiraria do LT a única tela
 * capaz de corrigir o recurso; e o backend recheca de qualquer forma.
 */
export function motivoDataFinalForaDoContrato(
  recurso: {
    dataLiberacao: string | null | undefined;
    qtdParcelas: number;
    periodicidade: PeriodicidadeRecurso | null | undefined;
  },
  janela: { fim: string | null | undefined },
): string | null {
  const fim = janela.fim;
  if (!fim) return null;

  const dataFinal = deriveDataFinalRecurso(
    recurso.dataLiberacao,
    recurso.qtdParcelas,
    recurso.periodicidade,
  );
  if (dataFinal === null) return null;
  if (dataFinal <= fim.slice(0, 10)) return null;

  return (
    `A data final do recurso (${formatarBR(dataFinal)}) ultrapassa o término ` +
    `do contrato (${formatarBR(fim)}). Reduza a quantidade de parcelas, use ` +
    `uma periodicidade menor ou antecipe a data de liberação.`
  );
}

/**
 * Dias por mês de carência, como a fórmula do org os conta.
 *
 * ⚠️ **`30 * carência` não é "carência meses depois"** — são 30 DIAS por mês, e
 * só então `+1 mês`. É transcrição literal de
 * `Data_Inicio_Ressarcimento__c` (fórmula no Salesforce, `calculated: true`);
 * "corrigir" para aritmética de meses faria esta tela exibir uma data e o CRM
 * outra. Espelha `mutuo-reimbursement-start.ts` do backend.
 */
const DIAS_POR_MES_DE_CARENCIA = 30;

/**
 * Cadência das PRESTAÇÕES, em meses.
 *
 * ⚠️ Convenção declarada, não campo: não existe periodicidade de prestação nem
 * aqui nem no layout do org. Mensal é o único valor defensável — a própria
 * fórmula do início do ressarcimento é `+1 mês`. Espelha o backend.
 */
const MESES_ENTRE_PRESTACOES = 1;

/**
 * A última PRESTAÇÃO do ressarcimento, em ISO `YYYY-MM-DD`.
 *
 * A primeira vence no início do ressarcimento (`liberação + 30×carência`, e
 * então `+1 mês`), logo o intervalo cabe `qtdPrestacoes − 1` vezes.
 *
 * `null` quando não dá para derivar. Nunca uma data inventada.
 */
export function deriveFimDasPrestacoes(
  dataLiberacao: string | null | undefined,
  carenciaMeses: number | null | undefined,
  qtdPrestacoes: number | null | undefined,
): string | null {
  if (qtdPrestacoes == null) return null;
  if (!Number.isFinite(qtdPrestacoes) || qtdPrestacoes < 1) return null;
  if (!dataLiberacao) return null;

  const carencia = carenciaMeses ?? 0;
  // Carência negativa recuaria o calendário: entrada inválida, não "zero".
  if (!Number.isFinite(carencia) || carencia < 0) return null;

  const base = new Date(`${dataLiberacao.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;

  base.setUTCDate(base.getUTCDate() + DIAS_POR_MES_DE_CARENCIA * carencia);

  const inicio = new Date(`${addMonthsClamped(base, 1)}T00:00:00.000Z`);
  return addMonthsClamped(
    inicio,
    (qtdPrestacoes - 1) * MESES_ENTRE_PRESTACOES,
  );
}

/**
 * As PRESTAÇÕES do Mútuo não podem ultrapassar o fim da análise da proposta —
 * o ESPELHO da regra do backend (pedido do negócio, 11/09/2026).
 *
 * ⚠️ **Cronograma DIFERENTE do da `Data Final`.** Aquela olha as PARCELAS (o
 * dinheiro saindo, a partir da liberação); esta olha as PRESTAÇÕES (o
 * ressarcimento voltando, a partir da carência). Um recurso passa numa e falha
 * na outra — com carência longa, o ressarcimento começa depois de a última
 * parcela já ter saído.
 *
 * Degrada para `null` em toda incerteza: o backend recheca de qualquer forma, e
 * bloquear por desconhecimento tiraria do LT a tela que conserta o recurso.
 */
export function motivoPrestacoesForaDaAnalise(
  recurso: {
    dataLiberacao: string | null | undefined;
    carenciaMeses: number | null | undefined;
    qtdPrestacoes: number | null | undefined;
  },
  janela: { fim: string | null | undefined },
): string | null {
  const fim = janela.fim;
  if (!fim) return null;

  const ultima = deriveFimDasPrestacoes(
    recurso.dataLiberacao,
    recurso.carenciaMeses,
    recurso.qtdPrestacoes,
  );
  if (ultima === null) return null;
  if (ultima <= fim.slice(0, 10)) return null;

  return (
    `A última prestação (${formatarBR(ultima)}) ultrapassa o fim da análise ` +
    `da proposta (${formatarBR(fim)}). Reduza a quantidade de prestações, ` +
    `diminua a carência ou antecipe a data de liberação.`
  );
}

/**
 * `YYYY-MM-DD` → `DD/MM/YYYY`, por fatiamento.
 *
 * ⚠️ **Nunca `new Date(iso).toLocaleDateString('pt-BR')`**: são datas de
 * CALENDÁRIO, e o parse as trata como meia-noite UTC — em Brasília a data
 * volta um dia. É o defeito que a validade do documento já custou (ADO 67993)
 * e que a janela de consumo reencenou (ADO 68242).
 */
function formatarBR(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}
