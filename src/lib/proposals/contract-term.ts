/**
 * Rótulo do "Prazo do contrato" — fonte ÚNICA das duas telas de análise.
 *
 * O número vem do BACKEND (`prazoContratoMeses`), derivado da janela de análise
 * por `contractTermMonths`. A tela **não** o calcula: a regra soma o mês da
 * ponta final quando o fim não é dia 1 (e a data fim de uma proposta é sempre o
 * último dia do mês, por VR do org) e tem piso de 1 — aritmética que já existiu
 * em quatro cópias no backend e estava errada nas quatro (ADO 68009). Uma quinta
 * cópia, aqui, seria a próxima a divergir; e é o mesmo número que o parecer
 * compara com o critério DCVIM `PRAZO-CONTRATO-MAX`.
 *
 * Esta função existe só para o PLURAL e o travessão serem iguais nos dois
 * lugares: o card "Dados da proposta" (`proposal-data-block`) e o card "Dados da
 * oportunidade" do workspace da SNEG (`sneg-analise-shell`). Duas formatações
 * divergiriam exatamente no caso de um mês.
 *
 * ⚠️ Ausente ⇒ `—`, nunca `0 meses`: "não sei" não é um prazo. Na oportunidade,
 * ausência significa "nenhuma proposta eleita"; na proposta, janela ilegível.
 */
export function prazoContratoLabel(meses: number | null | undefined): string {
  if (meses == null || !Number.isFinite(meses)) return '—';
  return meses === 1 ? '1 mês' : `${meses} meses`;
}
