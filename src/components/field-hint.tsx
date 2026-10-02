import { InfoIcon } from '@/components/icons';

/**
 * O ⓘ de ajuda ao lado do rótulo de um campo — o mesmo affordance que o
 * Salesforce põe no `inlineHelpText` do campo correspondente.
 *
 * Componente único porque DUAS telas o montam (o bloco "Mapa da Rede" da Visão
 * 360º e o card "Dados da oportunidade"), cada uma com o seu átomo de campo:
 * o que se compartilha é o controle, não a grade.
 *
 * Decisões:
 * - **`title` nativo, não tooltip próprio.** Ele já funciona no teclado (via
 *   foco no `<button>`), no toque longo e no leitor de tela, e não acrescenta
 *   estado a um card que já tem colapso. Um tooltip custom teria de resolver
 *   posicionamento dentro de um `overflow-x-auto`.
 * - **`<button type="button">`, não `<span>`:** o texto precisa ser alcançável
 *   sem mouse. `type="button"` porque o card da oportunidade vive dentro de
 *   `<form>` — sem ele o clique no ⓘ SUBMETERIA o formulário.
 * - **O ícone é `aria-hidden`; quem carrega o texto é o `aria-label`**, senão o
 *   leitor de tela anuncia um botão sem nome.
 * - **Ícone SVG, nunca emoji** (convenção do repo): emoji depende da fonte do
 *   SO e ignora os tokens de cor.
 */
export function FieldHint({ text, label }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      title={text}
      aria-label={label ? `${label}: ${text}` : text}
      data-testid="field-hint"
      className="ml-1 inline-flex align-middle text-(--color-text-muted) hover:text-(--neutral-900)"
    >
      {/* `aria-hidden` já é default do átomo de ícone; a caixa é 1em. */}
      <InfoIcon className="size-3.5" />
    </button>
  );
}
