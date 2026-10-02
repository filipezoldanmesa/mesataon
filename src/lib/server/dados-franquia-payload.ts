import type { UpdateDadosFranquiaPayload } from '@/lib/franquia/dados.api';

/**
 * Os campos que a BFF encaminha ao backend no `PATCH .../franquia/:id/dados`.
 *
 * ⚠️ **Lista FECHADA — campo que não está aqui é descartado em silêncio.** Foi
 * exatamente isso que aconteceu com `cofDestinatarioEmail` entre 26/08 e
 * 04/09/2026: o card coletava o e-mail, o cliente o enviava, esta lista o
 * deixava cair, o backend recebia um PATCH sem nada a mudar e respondia **200**
 * com o valor ANTERIOR — a tela relia e voltava a dizer "Envio da COF não
 * configurado". Mesmo defeito, mesma semana, que os `fiadores` em
 * `parseGarantiaIndicacaoPayload` (02/09/2026).
 *
 * A rede contra a próxima omissão é `dados-franquia-payload.test.ts`: um literal
 * tipado `-?` sobre `keyof UpdateDadosFranquiaPayload` (campo novo no tipo não
 * compila até ser listado) mais uma comparação de CHAVES em runtime (a função
 * não pode devolver menos do que recebeu).
 */
const CAMPOS_ENCAMINHADOS = [
  'situacaoLoja',
  'tipoImplantacao',
  'inicioOperacaoPrevista',
  'faturamentoPropostoBrl',
  'faturamentoDeAcordoComFap',
  'possuiExcecaoRoyalties',
  'cofDestinatarioEmail',
] as const satisfies readonly (keyof UpdateDadosFranquiaPayload)[];

/**
 * Encaminha apenas as chaves contratadas, preservando a distinção
 * **ausente × null** (ausente ⇒ intocado; `null` ⇒ limpo) — é ela que permite
 * o card salvar bloco a bloco sem apagar o que os outros responderam.
 */
export function encaminharDadosFranquia(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of CAMPOS_ENCAMINHADOS) {
    if (key in body) payload[key] = body[key];
  }
  return payload;
}
