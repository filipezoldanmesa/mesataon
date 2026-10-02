import { IndicatorStatus } from './indicator-status';

/**
 * Frase exibida quando o consolidado ficou SEGURADO — alguma proposta eleita
 * não está com a TIR `atualizada`, então ela é recalculada primeiro e o
 * consolidado dispara sozinho em seguida (regra do negócio de 04/09/2026).
 *
 * Sem ela o clique não teria retorno visível: a pill continua "Desatualizado",
 * porque nada consolidado foi submetido, e o usuário concluiria que o botão
 * não fez nada.
 */
export const AGUARDANDO_PROPOSTAS_MSG =
  'Recalculando a TIR das propostas eleitas — a TIR da oportunidade será calculada em seguida, ' +
  'assim que a última concluir.';

/**
 * `true` quando a chamada de recálculo de fato SUBMETEU o consolidado.
 *
 * O único sinal é o `status` do snapshot devolvido: `em_calculo` ⇒ submetido.
 * Qualquer outra coisa — `null` (204, oportunidade nunca calculada), o snapshot
 * anterior devolvido intacto, ou uma forma que este front não reconhece — é
 * "segurado".
 *
 * ⚠️ A degradação é para SEGURADO de propósito: anunciar "em cálculo" sem
 * evidência faria a tela prometer um resultado que talvez não venha.
 */
export function consolidadoFoiSubmetido(resultado: unknown): boolean {
  if (resultado === null || typeof resultado !== 'object') return false;
  return (resultado as { status?: unknown }).status === IndicatorStatus.EmCalculo;
}
