/**
 * Datas do domínio `painel` — sempre RELATIVAS a agora, para que "Atrasada",
 * "Vence hoje" e "Concluídas na semana" continuem fazendo sentido em qualquer
 * dia em que o protótipo for aberto.
 *
 * O dia é o de Brasília (UTC-3, sem horário de verão desde 2019), o mesmo
 * fuso em que o backend apura a faixa de SLA.
 */

const DIA_MS = 86_400_000;
const BRT_MS = 3 * 3_600_000;

/** Índice do dia em Brasília (dias desde a época). */
export function diaBrt(iso: string | number | Date): number {
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  return Math.floor((t - BRT_MS) / DIA_MS);
}

/** Prazo às 17:00 de Brasília, `dias` a partir de hoje (negativo = passado). */
export function prazoEmDias(dias: number): string {
  const hoje = diaBrt(Date.now());
  return new Date((hoje + dias) * DIA_MS + BRT_MS + 17 * 3_600_000).toISOString();
}

/** Instante `dias` (pode ser fracionário) antes de agora. */
export function haDias(dias: number): string {
  return new Date(Date.now() - dias * DIA_MS).toISOString();
}

/** Instante `horas` depois de um ISO. */
export function maisHoras(iso: string, horas: number): string {
  return new Date(new Date(iso).getTime() + horas * 3_600_000).toISOString();
}

/** Diferença em dias de calendário (Brasília) entre o prazo e hoje. */
export function diasAtePrazo(prazo: string): number {
  return diaBrt(prazo) - diaBrt(Date.now());
}

export function diasDesde(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / DIA_MS;
}
