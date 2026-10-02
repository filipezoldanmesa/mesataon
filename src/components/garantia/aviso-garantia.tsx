/**
 * A caixa amarela dos formulários de garantia — dona única do tratamento.
 *
 * O literal de classe vivia repetido em QUATRO call sites (os dois avisos de
 * fiança × as duas telas que montam o mesmo formulário desde 02/09/2026), e o
 * quinto — o aviso de prévia reprovada, 04/09/2026 — nasceu com a paleta da
 * FAIXA DE ERRO (`--yellow-700` na borda, `--neutral-25` de fundo), que é outro
 * padrão: parecia da família e não era. Um componente resolve o que uma
 * constante de classe não resolveria com a mesma segurança — classe em `.ts` não
 * tem precedente neste repo, e Tailwind que não varre o arquivo falha em
 * SILÊNCIO, entregando a caixa sem estilo nenhum.
 *
 * `--yellow-300` / `--yellow-100` / `--yellow-700` é a família "Exceção/Atenção"
 * da ADR-0018 — nunca `--color-danger`: nada aqui é falha de sistema. A pill `d`
 * de `PREVIA_REPROVADA` é outra coisa (ali o veredito É o conteúdo).
 *
 * `<p>` sempre: todo conteúdo destes avisos é frase. `role` é opcional porque só
 * um deles precisa — o de prévia reprovada aparece depois de uma leitura
 * assíncrona e por isso é anunciado (`status`); os de fiança aparecem em resposta
 * ao próprio gesto de escolher o tipo, e anunciá-los seria ruído. ⚠️ NUNCA
 * `alert`: as telas que montam estes avisos reservam o alert para o erro do
 * submit, e um segundo faz `getByRole('alert')` estourar em vez de escolher.
 */
import type { ReactNode } from 'react';

const CLASSE_BASE =
  'rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-(length:--t-small) leading-[1.5] text-(--yellow-700)';

export function AvisoGarantia({
  testId,
  className,
  role,
  children,
}: {
  testId: string;
  /** Espaçamento do host (ex.: `mt-2`) — nunca cor, borda ou tipografia. */
  className?: string;
  role?: 'status';
  children: ReactNode;
}): React.JSX.Element {
  return (
    <p
      data-testid={testId}
      role={role}
      className={className ? `${className} ${CLASSE_BASE}` : CLASSE_BASE}
    >
      {children}
    </p>
  );
}
