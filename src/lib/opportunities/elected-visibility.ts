import type { OpportunityProposal, OpportunityStatus } from './types';

/** Resultado de {@link separarPropostasNaoEleitas}. */
export interface PropostasSeparadas {
  /** As que a lista principal renderiza. */
  visiveis: OpportunityProposal[];
  /** As que ficaram fora da composição — a seção recolhida do LT. */
  naoEleitas: OpportunityProposal[];
}

/**
 * Separa as propostas da oportunidade entre a lista principal e a seção
 * recolhida "Propostas não eleitas".
 *
 * Espelha o `deveOcultarNaoEleitas` do backend, e o espelhamento é deliberado:
 * o backend já devolve a lista filtrada para todo mundo — este split só existe
 * porque quem tem autoridade de composição recebe **também** as não eleitas
 * (`incluirNaoEleitas`), e a tela precisa decidir em qual balde cada uma cai.
 * As duas regras têm de concordar, senão a seção recolhida do LT mostraria um
 * conjunto que ninguém mais vê pela mesma razão que o backend usa para escondê-lo.
 *
 * - Em preenchimento nada é separado: eleger é justamente o que o LT está
 *   fazendo, e tirar da lista o que ele ainda não elegeu esconderia as
 *   propostas que ele precisa comparar.
 * - Sem nenhuma eleita, nada é separado — mesma degradação do backend: a lista
 *   principal ficaria vazia afirmando que a oportunidade não tem proposta.
 * - A ordem de chegada é preservada dentro de cada balde (a listagem vem
 *   ordenada por criação).
 */
export function separarPropostasNaoEleitas(
  propostas: OpportunityProposal[],
  status: OpportunityStatus,
): PropostasSeparadas {
  if (status === 'preenchimento') {
    return { visiveis: propostas, naoEleitas: [] };
  }

  const visiveis = propostas.filter((p) => p.isElected);
  if (visiveis.length === 0) {
    return { visiveis: propostas, naoEleitas: [] };
  }

  return { visiveis, naoEleitas: propostas.filter((p) => !p.isElected) };
}
