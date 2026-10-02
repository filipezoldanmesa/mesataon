/**
 * Como um degrau de trilha é DESENHADO — e a única regra que a tela acrescenta
 * ao veredito do backend.
 *
 * ## O defeito (17/09/2026)
 *
 * > *"quando a obra estiver concluída, o item 4 do fluxo de obra, 'Obra
 * > concluída', deve ficar com o check verde também"*
 *
 * As três trilhas da oportunidade (Principal, Garantia e Obra) marcam o degrau
 * corrente como `active` — círculo branco com o NÚMERO do passo — e só os
 * anteriores como `done`. Isso lê certo no meio da escada ("estamos aqui, falta
 * o resto") e lê errado no fim: uma obra **concluída** exibia `4` num círculo
 * vazio, ao lado de "Obra em andamento" já com o check verde, como se ainda
 * houvesse algo a acontecer depois do último degrau. O ciclo nunca aparecia
 * completo.
 *
 * ## Por que aqui, e não no backend
 *
 * Isto **não** é veredito: o estado do passo continua sendo do backend
 * (`montarTrilhaObra`, `estadosTrilha`) e nada aqui o reescreve na origem — o
 * sub-rótulo da aba, a pill e a nota seguem lendo o mesmo `active` de sempre. O
 * que muda é o GLIFO do último degrau, que é decisão de desenho: no fim da
 * escada, "alcançado" e "concluído" são a mesma coisa para quem lê a faixa, e
 * não existe passo seguinte cuja espera o número anunciaria.
 *
 * Fazer isto na origem obrigaria as três fontes (duas no backend, uma derivada
 * por índice no front) a repetir a mesma exceção, e a trilha que esquecesse
 * seria justamente a que o usuário reportou.
 *
 * ⚠️ Vale só para o ÚLTIMO degrau. Um `active` no meio continua `active`: ali o
 * número é a informação ("é neste que o processo está parado"), e pintá-lo de
 * verde afirmaria conclusão de trabalho que ninguém fez.
 */

/** O vocabulário compartilhado pelas três trilhas. */
export type TrackStepState = 'done' | 'active' | 'pending';

/**
 * O estado que a faixa DESENHA para um degrau.
 *
 * @param estado - o veredito do backend (ou, na trilha Principal, o derivado do
 *   índice da fase corrente).
 * @param isLast - este é o último degrau da escada.
 */
export function trackStepDisplayState(
  estado: TrackStepState,
  isLast: boolean,
): TrackStepState {
  return isLast && estado === 'active' ? 'done' : estado;
}
