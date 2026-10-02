/**
 * Saudação da home por período do dia.
 *
 * O cabeçalho dizia "Bom dia" a qualquer hora — o protótipo (01-visao-geral)
 * é uma tela estática e só mostrava a versão da manhã.
 *
 * Fronteiras (convenção corrente em pt-BR): manhã 05:00–11:59, tarde
 * 12:00–17:59, noite 18:00–04:59 — de madrugada ninguém diz "bom dia".
 */
export type Saudacao = 'Bom dia' | 'Boa tarde' | 'Boa noite';

export function saudacaoPorHora(hora: number): Saudacao {
  if (hora >= 5 && hora < 12) return 'Bom dia';
  if (hora >= 12 && hora < 18) return 'Boa tarde';
  return 'Boa noite';
}

const BR_TIME_ZONE = 'America/Sao_Paulo';

const horaBrasilia = new Intl.DateTimeFormat('en-US', {
  timeZone: BR_TIME_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
});

/**
 * Hora (0–23) em Brasília — usada só no render do SERVIDOR, que roda em UTC.
 * No browser vale o relógio de quem usa (ver `useSaudacao`).
 */
export function horaEmBrasilia(agora: Date): number {
  const hora = Number(
    horaBrasilia.formatToParts(agora).find((p) => p.type === 'hour')?.value,
  );
  // Alguns runtimes formatam meia-noite como "24" mesmo em h23.
  return hora % 24;
}
