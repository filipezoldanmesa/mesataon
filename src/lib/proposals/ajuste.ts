/**
 * Posto (PCR) block vocabulary for `POST /v1/proposals/:id/solicitar-ajuste`
 * — the posto half of the backend `BlocoAjuste` enum.
 *
 * Mirrored 1:1 and declared `as const` so every call site names a member
 * instead of passing a loose string the backend would reject with a 400.
 *
 * The franchise values (`dados_franquia`, `fap_potencial`, …) belong to
 * `03-proposta-franquia` and live in `@/lib/franquia/ajuste` — the two
 * vocabularies must not be mixed: the value ends up in the pendência title
 * and in the idempotency discriminator.
 *
 * @see apps/api/src/proposals/domain/bloco-ajuste.enum.ts
 */
export const BlocoProposta = {
  Dados: 'dados',
  Situacao: 'situacao',
  Fotos: 'fotos',
  Produtos: 'produtos',
  Recursos: 'recursos',
  Financeiro: 'financeiro',
} as const;

export type BlocoProposta = (typeof BlocoProposta)[keyof typeof BlocoProposta];

/**
 * pt-BR names, used in the modal title and in the pendência the LT receives.
 * They match the block headings on the screen so the LT reads the same words
 * the analyst was looking at.
 */
export const BLOCO_PROPOSTA_LABEL: Record<BlocoProposta, string> = {
  [BlocoProposta.Dados]: 'Dados da proposta',
  [BlocoProposta.Situacao]: 'Situação do posto',
  [BlocoProposta.Fotos]: 'Fotos do posto',
  [BlocoProposta.Produtos]: 'Produtos e volumes',
  [BlocoProposta.Recursos]: 'Recursos e investimentos',
  [BlocoProposta.Financeiro]: 'Resultado financeiro',
};

export function isBlocoProposta(value: unknown): value is BlocoProposta {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(BLOCO_PROPOSTA_LABEL, value)
  );
}
