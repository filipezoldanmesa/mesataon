/**
 * Janela de consumo de uma linha de produto (RN-F5-04) — espelho das regras que
 * o backend aplica em `product-lines.service.ts` / `product-line-calculator.ts`.
 *
 * Existe como módulo próprio, e não solto no componente, porque as MESMAS
 * fronteiras governam três coisas na tela: o `min`/`max` dos dois date pickers,
 * a recusa antes do submit e o valor com que o campo "Início consumo" abre.
 * Três cópias divergiriam exatamente no caso de borda — o date picker oferecendo
 * um dia que o submit recusa, ou pior, aceitando um que a API responde com 422.
 *
 * ADO 67795: até 24/08/2026 o início do consumo era derivado no servidor e o
 * campo abria DESABILITADO. A Feature F5 (66394) declara o campo como "Entrada
 * do usuário" com o 1º dia do mês subsequente apenas como valor PADRÃO, e a US
 * 67601 fixa a única restrição das datas de consumo: estarem dentro do período
 * da análise da proposta.
 */

/** Datas ISO `YYYY-MM-DD` — comparáveis lexicograficamente, sem `Date`. */
export type IsoDate = string;

/**
 * O 1º dia do mês subsequente ao de `now` (UTC, como o backend). `now` é
 * injetável para o teste controlar o "mês corrente" — sem isso a suíte vira
 * bomba-relógio na virada de cada mês.
 */
export function firstOfNextMonthISO(now: Date = new Date()): IsoDate {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
}

/**
 * O valor com que "Início consumo" abre numa linha NOVA: o padrão acima,
 * elevado ao início da análise quando esta começa depois.
 *
 * O clamp não é cosmético — sem ele o formulário nasceria com uma data que a
 * própria validação recusa (início antes da análise), e o usuário veria um erro
 * que nenhuma ação dele causou. Espelha `resolveDefaultInicioConsumo` no
 * backend, que faz o mesmo para quem não manda o campo.
 */
export function resolveDefaultInicioConsumo(
  now: Date,
  dataInicioAnalise: IsoDate | null | undefined,
): IsoDate {
  const padrao = firstOfNextMonthISO(now);
  if (!dataInicioAnalise) return padrao;
  return dataInicioAnalise > padrao ? dataInicioAnalise : padrao;
}

export type ConsumptionWindowInput = {
  inicioConsumo: IsoDate;
  fimConsumo: IsoDate;
  /** `dataInicioAnalise` da proposta; `null` quando a leitura não resolveu. */
  dataInicioAnalise: IsoDate | null;
  /** `dataFimAnalise` da proposta; `null` quando a leitura não resolveu. */
  dataFimAnalise: IsoDate | null;
};

/** Formata uma data ISO (`YYYY-MM-DD`) em pt-BR (`dd/mm/aaaa`). */
export function fmtDateBR(iso: IsoDate): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Recusa a janela de consumo, ou `null` quando ela é válida.
 *
 * Ordem das recusas — período da análise primeiro, relação entre as duas datas
 * depois — igual à do backend: a janela da proposta é dado de OUTRA tela (o
 * conserto é lá, e a frase precisa dizer isso), enquanto início × fim é o
 * conserto local, que o usuário faz no próprio modal.
 *
 * Limite desconhecido (`null`) **não** recusa: a leitura da proposta degrada em
 * silêncio de propósito, e transformar "não sei" em bloqueio impediria o
 * usuário de salvar por causa de uma falha de rede que não é dele. O backend
 * continua sendo a fonte da verdade — aqui só antecipamos a mensagem.
 */
export function validateConsumptionWindow({
  inicioConsumo,
  fimConsumo,
  dataInicioAnalise,
  dataFimAnalise,
}: ConsumptionWindowInput): string | null {
  if (!inicioConsumo) return 'Informe o início do consumo.';
  if (!fimConsumo) return 'Informe o fim do consumo.';

  if (dataInicioAnalise && inicioConsumo < dataInicioAnalise) {
    return `O início do consumo deve ser em ou após ${fmtDateBR(dataInicioAnalise)} (início da análise da proposta).`;
  }

  if (dataFimAnalise && fimConsumo > dataFimAnalise) {
    return `O fim do consumo não pode ser posterior a ${fmtDateBR(dataFimAnalise)} (fim da análise da proposta).`;
  }

  if (fimConsumo < inicioConsumo) {
    return `O fim do consumo deve ser em ou após ${fmtDateBR(inicioConsumo)} (início do consumo).`;
  }

  return null;
}

/**
 * Janela da análise invertida — `dataFimAnalise` ANTERIOR a `dataInicioAnalise`.
 *
 * Não deveria existir (a criação da proposta valida fim ≥ início), e é
 * justamente por isso que a tela a trata como dado corrompido da PROPOSTA em
 * vez de erro do usuário: nenhuma data de consumo satisfaz os dois limites, e
 * mandá-lo "escolher outra data" seria instrução para um beco sem saída.
 *
 * ⚠️ Não confundir com a versão anterior deste predicado, que comparava
 * `dataFimAnalise` com o 1º dia do mês seguinte. Aquela combinação deixou de
 * ser impossível quando o início do consumo virou escolha do usuário: com a
 * análise inteira disponível, uma proposta que termina no mês corrente tem
 * janela de consumo válida.
 */
export function isJanelaAnaliseInvertida(
  dataInicioAnalise: IsoDate | null,
  dataFimAnalise: IsoDate | null,
): boolean {
  return !!dataInicioAnalise && !!dataFimAnalise && dataFimAnalise < dataInicioAnalise;
}
