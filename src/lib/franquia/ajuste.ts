/**
 * Franchise block vocabulary for `POST /v1/proposals/:id/solicitar-ajuste`
 * (FRQ-14) — the franchise half of the backend `BlocoAjuste` enum.
 *
 * Mirrored 1:1 and declared `as const` so every call site names a member
 * instead of passing a loose string the backend would reject with a 400.
 *
 * The posto values (`dados`, `situacao`, …) belong to `04-analise-sneg` and are
 * deliberately absent here: this screen can only request adjustments on its own
 * blocks, and the two vocabularies must not be mixed — the value ends up in the
 * pendência title and in the idempotency discriminator.
 *
 * ⚠️ `consolidacao_economica` is NOT mirrored. The "Royalties e consolidação
 * econômica" block was removed from both franchise screens on 14/08 (it
 * restated the royalty table and the side panel), and a block id no component
 * renders is a control the analyst can never reach. The member stays in the
 * BACKEND enum — pendências already carry that key — so removing it here does
 * not break any stored row; it only stops offering an adjustment on a block
 * that is not on screen.
 *
 * @see apps/api/src/proposals/domain/bloco-ajuste.enum.ts
 */
export const BlocoFranquia = {
  DadosFranquia: 'dados_franquia',
  FapPotencial: 'fap_potencial',
  ModeloParametros: 'modelo_parametros',
  EstruturaExcecoes: 'estrutura_excecoes',
  Cof: 'cof',
  ParecerFranquia: 'parecer_franquia',
} as const;

export type BlocoFranquia = (typeof BlocoFranquia)[keyof typeof BlocoFranquia];

/**
 * pt-BR names, used in the modal title and in the pendência the LT receives.
 * They match the block headings on the screen so the LT reads the same words
 * the analyst was looking at.
 */
export const BLOCO_FRANQUIA_LABEL: Record<BlocoFranquia, string> = {
  [BlocoFranquia.DadosFranquia]: 'Dados da franquia',
  [BlocoFranquia.FapPotencial]: 'FAP e potencial do ponto',
  [BlocoFranquia.ModeloParametros]: 'Modelo de loja e parâmetros comerciais',
  [BlocoFranquia.EstruturaExcecoes]: 'Exceções programadas',
  [BlocoFranquia.Cof]: 'COF · Circular de Oferta de Franquia',
  [BlocoFranquia.ParecerFranquia]: 'Parecer do time de franquia',
};

export function isBlocoFranquia(value: unknown): value is BlocoFranquia {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(BLOCO_FRANQUIA_LABEL, value)
  );
}
