import type { ButtonHTMLAttributes, ReactNode } from "react";

/*
 * Estas constantes espelham `.btn` do protótipo (`vibra-ui.css`):
 * `font-size: var(--t-caption)` (14px), `font-weight: 700`,
 * `padding: 9px 16px`, `border-radius: var(--radius-xxs)`. O outline claro
 * espelha `.btn-ghost`, cujo fundo é `#f9f9f9` — o token `--neutral-25`, não
 * `--color-surface` (branco).
 *
 * Estavam com 13px e `py-2` (8px), e o ghost branco: divergência pequena por
 * botão e sistemática no app inteiro.
 */
const BASE_CLASSES =
  "flex h-12.5 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[var(--radius-xs)] bg-(--secondary-500) px-4.5 text-(length:--t-body) font-bold uppercase tracking-[0.4px] text-white transition-[background-color,transform] duration-150 hover:bg-(--secondary-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--secondary-700) focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed";

/*
 * ⚠️ O estado DESABILITADO dos três botões abaixo é o do protótipo, e não
 * `opacity-50` (08/09/2026).
 *
 * `vibra-ui.css` é explícito:
 *
 * ```css
 * .btn:disabled, .btn[disabled] { background:#f4f5f5; color:#767676;
 *                                 border-color:transparent; cursor:not-allowed }
 * ```
 *
 * Os três usavam `disabled:opacity-50`, que num outline VERDE produz verde
 * pálido — legível como desabilitado, mas não o cinza sem borda que o protótipo
 * define, e visivelmente diferente do resto do app (medido na tela de
 * Parametrização de Receitas e Despesas, com 6 "Editar" desabilitados lado a
 * lado). Os tokens `--disabled-bg` / `--disabled-text` já existiam em
 * `globals.css` **para isto** — criados para o "disabled trigger" do protótipo e
 * nunca ligados aqui.
 *
 * `disabled:hover:bg-(--disabled-bg)` permanece: sem ele o `hover:` do estado
 * normal volta a pintar o botão desabilitado.
 *
 * ⚠️ Muda **67 call sites em 19 arquivos** de uma vez, na direção do protótipo.
 * É o ponto único de propósito — foi mexer aqui ou em 67 lugares.
 */

/**
 * Shared Tailwind classes for the secondary outline button (border + text in
 * `--secondary-500`). Used by any "Ações ▾" dropdown trigger across the app to
 * prevent style drift between screens.
 */
export const SECONDARY_OUTLINE_BTN =
  "inline-flex items-center gap-2 rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-[9px] text-(length:--t-caption) font-bold text-(--secondary-500) transition hover:bg-(--neutral-40) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--secondary-700) focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:border-transparent disabled:bg-(--disabled-bg) disabled:text-(--disabled-text) disabled:hover:bg-(--disabled-bg)";

/**
 * Inline PRIMARY action inside a card (not the full-width CTA above).
 *
 * Shared so screens stop hand-rolling `bg-(--secondary-500)` without the hover,
 * focus and active states the design system defines — a button that never
 * reacts to the pointer reads as disabled.
 */
export const PRIMARY_ACTION_BTN =
  "inline-flex items-center gap-2 rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-[9px] text-(length:--t-caption) font-bold text-white transition hover:bg-(--secondary-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--secondary-700) focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:border-transparent disabled:bg-(--disabled-bg) disabled:text-(--disabled-text) disabled:hover:bg-(--disabled-bg)";

/**
 * Destructive counterpart of {@link SECONDARY_OUTLINE_BTN} — outline in
 * `--color-danger`, filled on hover. Outline (not solid) on purpose: rejecting
 * is deliberate, but it is not the primary path of the screen.
 */
export const DANGER_OUTLINE_BTN =
  "inline-flex items-center gap-2 rounded-[var(--radius-xxs)] border border-(--color-danger) bg-(--color-surface) px-4 py-[9px] text-(length:--t-caption) font-bold text-(--color-danger) transition hover:bg-(--color-danger-bg) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-danger) focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:border-transparent disabled:bg-(--disabled-bg) disabled:text-(--disabled-text) disabled:hover:bg-(--disabled-bg)";

/**
 * Ação de LINHA em tabela — o `.lnk` do protótipo, não um botão.
 *
 * `vibra-ui.css` / `15-governanca.html` declaram:
 *
 * ```css
 * .lnk { color: var(--secondary-600); font-weight: 700; font-size: 14px;
 *        cursor: pointer; white-space: nowrap }
 * ```
 *
 * É a forma do `Editar`, `Remover`, `Reatribuir`, `Validar` e `Substituir` de
 * TODAS as tabelas do protótipo — e era refeita à mão em 11 lugares
 * (08/09/2026), divergindo em quatro pontos de uma vez:
 *
 * | | classe local | `.lnk` |
 * |---|---|---|
 * | tamanho | `--t-small` (**12px**) | **14px** (`--t-caption`) |
 * | `white-space` | herdado (quebra) | `nowrap` |
 * | rótulo | `editar` / `remover` (minúsculo) | `Editar` / `Remover` |
 * | `disabled` | `opacity-60` (verde/vermelho pálido) | — |
 *
 * ⚠️ **`disabled` fica CINZA, nunca `opacity-60`.** Um link verde ou vermelho
 * desabilitado continua colorido e lê como clicável; e `disabled:no-underline`
 * porque sublinhar ao passar o mouse sobre controle inerte é promessa falsa.
 * Mesma regra do `.btn:disabled` nos botões acima.
 *
 * ⚠️ **NÃO use em contexto que não é linha de tabela.** Três call sites ficaram
 * fora de propósito — `Tentar novamente` de um estado de erro dentro do picker
 * de diretório, e `Trocar` ao lado dos chips da equipe: ali o 12px é deliberado,
 * porque o texto vizinho é pequeno. Aumentá-los quebraria o ritmo daquelas
 * telas, e o protótipo não os cobre.
 */
export const LINK_ACTION =
  "cursor-pointer whitespace-nowrap text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline disabled:cursor-not-allowed disabled:text-(--disabled-text) disabled:no-underline";

/**
 * A contraparte DESTRUTIVA de {@link LINK_ACTION} — `Remover` em
 * `--color-danger`.
 *
 * ⚠️ **Divergência deliberada do protótipo, registrada:** lá o `Remover` é um
 * `.lnk` **verde** (`01f-oportunidade-minuta.html`) — não existe variante
 * vermelha. Mantemos o vermelho porque nestas telas o `Remover` apaga
 * parametrização **permanentemente** (catálogo do Anexo A, roteamento J10,
 * distribuição), e a cor é o único sinal antes do `useConfirm`; no protótipo o
 * `Remover` tira um documento de um pacote em memória, sem confirmação. O token
 * é o `--color-danger` que o `DANGER_OUTLINE_BTN` já usa.
 *
 * Se o negócio preferir seguir o protótipo à letra, é trocar por
 * {@link LINK_ACTION} — os call sites não mudam.
 */
export const LINK_ACTION_DANGER =
  "cursor-pointer whitespace-nowrap text-(length:--t-caption) font-bold text-(--color-danger) hover:underline disabled:cursor-not-allowed disabled:text-(--disabled-text) disabled:no-underline";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/**
 * Primary action (CTA) button from the Vibra design system.
 *
 * Encapsulates all styling; the consumer passes only the text (`children`) and
 * the handler (`onClick`). Any other native `<button>` attributes are forwarded.
 */
export function Button({
  children,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${BASE_CLASSES}${className ? ` ${className}` : ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
