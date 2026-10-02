import { ProposalStatus } from '@/lib/opportunities/types';

/**
 * Espelho de `JANELA_ANALISE_EDITAVEL_EM` do backend: os status em que o
 * período de análise ("Dados da proposta" → Início/Fim da análise) ainda pode
 * ser corrigido.
 *
 * O veredito continua sendo do backend — a rota responde 400 depois do envio
 * para aprovação. Isto existe para a tela não OFERECER um controle que levaria
 * a esse 400, e para explicar por que ele não está lá.
 *
 * ⚠️ **Status ausente ⇒ NÃO editável.** É o oposto do default do bloco de
 * minuta (`isEditable`, que assume editável quando o status não veio), e de
 * propósito: aqui a ausência só acontece quando a leitura da proposta falhou ou
 * o payload encolheu, e abrir a correção sobre um estado que não se leu é
 * oferecer uma ação que pode estar fechada — a mesma disciplina de
 * `editavelPorFranquia` ("mapa ausente ⇒ tudo false").
 */
export const JANELA_ANALISE_EDITAVEL_EM: readonly ProposalStatus[] = [
  ProposalStatus.EmPreenchimento,
  ProposalStatus.Devolvida,
];

/** `true` quando o período ainda pode ser corrigido neste status. */
export function janelaAnaliseEditavel(
  status: ProposalStatus | undefined,
): boolean {
  if (!status) return false;
  return JANELA_ANALISE_EDITAVEL_EM.includes(status);
}
