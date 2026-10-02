import {
  EtapaLiberacaoRecurso,
  FinalidadeRecurso,
} from '@/lib/picklists/salesforce-values';

import { addMonthsClamped, parseIsoUtc } from './obra-cronograma';

/**
 * A linha de imagem da obra (Pista / BR Mania / Lubrax+) e os campos que ela
 * define no recurso financeiro — pedido do negócio de 10/09/2026.
 *
 * ## ⚠️ Quem DERIVA a linha é o backend, não esta tela
 *
 * `ObraDto.linhaImagem` já chega derivada (`derivarLinhaDeImagem`, que lê o
 * prefixo do `AnotherValueList` e, na falta dele, o `EstimateType`). Uma
 * segunda derivação aqui divergiria justamente no envelope ambíguo — e é o
 * backend quem grava. Este arquivo só tem o **de/para** linha → campos, para a
 * tela poder exibir travado o que será gravado.
 *
 * ## Os literais são do value set do org
 *
 * Os seis já são membros de `salesforce-values`: nenhuma string nova aqui. Os
 * dois campos são `restrictedPicklist`, e valor fora do value set derruba o
 * grafo inteiro da cotação.
 *
 * O espelho do backend é `proposals/domain/campos-da-obra-de-imagem.ts`; o que
 * impede as duas metades de divergirem é o e2e, que compara o que a tela
 * exibe com o que a API grava.
 */
export type LinhaDeImagem = 'PISTA' | 'BR_MANIA' | 'LUBRAX_MAIS';

export interface CamposDaLinha {
  finalidade: FinalidadeRecurso;
  /** Etapa da 1ª parcela — a que o diálogo exibe. */
  etapaContratacao: EtapaLiberacaoRecurso;
  /** Etapa da 2ª em diante, a de impostos inclusive. */
  etapaImplantacao: EtapaLiberacaoRecurso;
}

const CAMPOS: Record<LinhaDeImagem, CamposDaLinha> = {
  PISTA: {
    finalidade: FinalidadeRecurso.AquisicaoInstalacaoImagemPista,
    etapaContratacao: EtapaLiberacaoRecurso.AposContratacaoFornecedorImagemPista,
    etapaImplantacao: EtapaLiberacaoRecurso.AposImplantacaoImagemPista,
  },
  BR_MANIA: {
    finalidade: FinalidadeRecurso.AquisicaoInstalacaoImagemBrMania,
    etapaContratacao: EtapaLiberacaoRecurso.AposContratacaoFornecedorImagemBrMania,
    etapaImplantacao: EtapaLiberacaoRecurso.AposImplantacaoImagemBrMania,
  },
  LUBRAX_MAIS: {
    finalidade: FinalidadeRecurso.AquisicaoInstalacaoImagemLubraxMais,
    etapaContratacao:
      EtapaLiberacaoRecurso.AposContratacaoFornecedorImagemLubraxMais,
    etapaImplantacao: EtapaLiberacaoRecurso.AposImplantacaoImagemLubraxMais,
  },
};

/** Rótulos do select que o LT usa quando a obra não declara a linha. */
export const LINHAS_DE_IMAGEM: readonly { value: LinhaDeImagem; label: string }[] = [
  { value: 'PISTA', label: 'Imagem Pista' },
  { value: 'BR_MANIA', label: 'Imagem BR Mania' },
  { value: 'LUBRAX_MAIS', label: 'Imagem Lubrax+' },
];

export function camposDaLinhaDeImagem(linha: LinhaDeImagem): CamposDaLinha {
  return CAMPOS[linha];
}

/**
 * Meses que a liberação anda quando o Termo de Cessão é dispensado.
 *
 * ⚠️ **UM MÊS de calendário, não 30 dias corridos** (10/09/2026): é a mesma
 * aritmética das parcelas — e a mesma que o cronograma de 26/08 já usava —,
 * para o diálogo inteiro não ter duas contas de prazo. O backend soma o mesmo
 * mês, com o mesmo clamp.
 */
export const MESES_SEM_TERMO_DE_CESSAO = 1;

/**
 * A data de liberação inicial da obra: a data de início da análise, mais um
 * mês quando o Termo de Cessão é dispensado.
 *
 * ⚠️ **O backend deriva a MESMA data e é ele quem grava** — aqui é só o que a
 * tela exibe (travado). Sem data de início de análise, `null`: travessão na
 * tela, nunca uma data inventada.
 */
export function dataLiberacaoInicialDaObra(
  dataInicioAnalise: string | null | undefined,
  termoCessao: boolean,
): string | null {
  if (!dataInicioAnalise) return null;
  const inicio = dataInicioAnalise.slice(0, 10);
  if (termoCessao) return inicio;

  const base = parseIsoUtc(inicio);
  return base === null
    ? null
    : addMonthsClamped(base, MESES_SEM_TERMO_DE_CESSAO);
}
