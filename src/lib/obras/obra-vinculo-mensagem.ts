import { failureReason } from '@/lib/api-errors';

/**
 * A frase de uma falha no VÍNCULO da obra, quando o registro já foi salvo.
 *
 * As duas chamadas — gravar o recurso/investimento e vincular a obra — não são
 * atômicas de propósito (a API da obra é chaveada por oportunidade, a do
 * registro por proposta; não existe endpoint que faça as duas). Até 27/08/2026 a
 * falha da segunda era reportada como *"Falha ao salvar o recurso financeiro"*:
 * o usuário lia que nada foi gravado, tentava de novo e — no bloco de recurso,
 * que não trocava para modo edição — **duplicava** a linha.
 *
 * A frase diz as duas coisas na ordem em que importam: o que ficou salvo, e o
 * que falhou com o motivo que a fonte deu (`failureReason`, nunca a exceção de
 * transporte). Termina mandando reabrir e escolher a obra de novo, porque é
 * essa a ação que conserta — o registro em si não precisa ser refeito.
 */
export function mensagemFalhaVinculoObra(
  registroSalvo: 'O recurso financeiro' | 'O investimento',
  estimateId: string,
  err: unknown,
): string {
  const motivo = failureReason(err, 'a API não respondeu.');
  return (
    `${registroSalvo} foi salvo, mas não foi possível vincular a obra ${estimateId}: ` +
    `${motivo} Reabra o registro para vincular a obra.`
  );
}
