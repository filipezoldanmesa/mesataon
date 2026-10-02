import {
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from '@/components/button';

/**
 * Os dois botões de rodapé dos modais da Governança.
 *
 * Extraídos do `DistribuicaoSnegCard`, onde eram locais, quando o card da CCOB
 * ganhou o "Reatribuir" e passaria a ser a **terceira** cópia do mesmo par. É
 * remoção de duplicata, não abstração nova.
 *
 * ⚠️ **O estilo vem de `components/button`, nunca escrito aqui.** A extração de
 * 08/09/2026 carregou as classes locais do card da SNEG, e elas divergiam do
 * `.btn-ghost` / `.btn-primary` do protótipo (`vibra-ui.css`) em quatro pontos:
 * borda e texto **cinza** onde o ghost é **verde** (`#418020`), fundo branco
 * onde ele é `#f9f9f9`, raio `--radius-xs` (8px) onde `.btn` usa `--radius-xxs`
 * (4px), `hover` em `--secondary-600` (`#326517`) onde `.btn-primary:hover` é
 * `#3c781e` (`--secondary-hover`) — e **sem `focus-visible`**, que é
 * acessibilidade e não estética. Extrair uma duplicata NÃO conserta o desvio
 * que as duas cópias já tinham; só o congela num lugar.
 */

export function BotaoSecundario({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={SECONDARY_OUTLINE_BTN}
    >
      {children}
    </button>
  );
}

export function BotaoPrimario({
  children,
  onClick,
  disabled,
  testId,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={PRIMARY_ACTION_BTN}
    >
      {children}
    </button>
  );
}
