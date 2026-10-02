'use client';

/**
 * Vibra DS · Select — custom dropdown fiel ao protótipo `.vdd` (vibra-dropdown.js).
 *
 * Renderiza um combobox visual (chevron próprio, menu portado para o body,
 * opção selecionada em verde + check, estado disabled com tokens) **e** um
 * `<select>` nativo visualmente oculto (sr-only, tabIndex -1, NÃO aria-hidden)
 * que mantém a associação `<label for>` e permite que testes com
 * `user.selectOptions / getByLabelText` continuem funcionando sem alteração.
 *
 * Variantes:
 *  - `bottom-border` (padrão): `.in` do protótipo — fundo neutral-40, sem borda
 *    exceto borda inferior 2px, cantos retos, verde quando aberto.
 *  - `boxed`: borda completa, cantos arredondados (radius-xs), fundo branco.
 *
 * Tokens novos usados: --disabled-bg, --disabled-text, --shadow-menu (globals.css).
 */

import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /**
   * Muted suffix rendered after the label in the MENU only (never in the
   * trigger, never in the native `<select>`): a qualifier about the option, such
   * as `"sugerida"` on the account's supply centers (ADO 67869). It is not part
   * of the answer, so it must not become part of the chosen value's rendering.
   */
  hint?: string;
  /**
   * Extra text {@link SelectProps.searchable} matches against, on top of
   * `label`. Use it when the option has an identifier the user types but the
   * label does not spell out — e.g. the supply-center CODE, which the Salesforce
   * `Name` happens to carry in production but not in every environment.
   */
  keywords?: string;
}

/**
 * Prefixos de LAYOUT aceitos no `className` do wrapper.
 *
 * O wrapper é um `div` cru: qualquer classe que chegue nele é renderizada. Como
 * quase todo call site tinha uma constante de campo (`FIELD`, `IN_CLASS`,
 * `FIELD_CLS`, `DS_INPUT` — todas com `bg-`, `border-b-2` e `px-3 py-[11px]`,
 * pensadas para `<input>`), passar essa constante para o `Select` pintava a
 * apresentação **duas vezes**: uma caixa externa com fundo, padding e a sua
 * própria borda inferior de 2px, e dentro dela o trigger com o mesmo tratamento.
 * O resultado na tela era borda dupla e o gatilho encolhido 12px de cada lado
 * (medido: wrapper 69px de altura contra 45px do trigger).
 *
 * Por isso o filtro é **allowlist**, não blocklist: classe nova de apresentação
 * que alguém inventar não passa por acidente. O que o `Select` aceita é
 * posicionamento/tamanho; cor, fundo, borda, raio, padding e tipografia são do
 * componente, que copia o `.vdd` do protótipo.
 */
const LAYOUT_CLASS_ALLOWLIST = [
  'w-',
  'min-w-',
  'max-w-',
  'h-',
  'min-h-',
  'm-',
  'mt-',
  'mb-',
  'ml-',
  'mr-',
  'mx-',
  'my-',
  'ms-',
  'me-',
  'flex',
  'grid',
  'col-',
  'row-',
  'order-',
  'self-',
  'shrink',
  'grow',
  'basis-',
  'justify-',
  'items-',
  'gap-',
  'gap-x-',
  'gap-y-',
  'space-x-',
  'space-y-',
  'hidden',
  'block',
  'inline',
  'relative',
  'absolute',
  'static',
  'inset-',
  'top-',
  'right-',
  'bottom-',
  'left-',
  'z-',
] as const;

/** `sm:`, `md:`, `min-[961px]:`, … — o prefixo de variante não muda a natureza da classe. */
function stripVariants(token: string): string {
  const lastColon = token.lastIndexOf(':');
  return lastColon === -1 ? token : token.slice(lastColon + 1);
}

/**
 * Mantém só as classes de layout do `className` recebido (ver
 * {@link LAYOUT_CLASS_ALLOWLIST}). Em `development`, avisa nomeando o que foi
 * descartado — silenciar deixaria o call site achar que a classe pegou.
 */
export function keepLayoutClassesOnly(className: string | undefined): string {
  if (!className) return '';

  const tokens = className.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const token of tokens) {
    const bare = stripVariants(token);
    const isLayout = LAYOUT_CLASS_ALLOWLIST.some(
      (prefix) => bare === prefix || bare.startsWith(prefix),
    );
    (isLayout ? kept : dropped).push(token);
  }

  if (dropped.length > 0 && process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.warn(
      `[Select] className aceita apenas layout; descartadas: ${dropped.join(' ')}. ` +
        'Fundo, borda, padding e tipografia são do componente (protótipo `.vdd`) — ' +
        'passar a classe de campo do <input> aqui duplica a apresentação.',
    );
  }

  return kept.join(' ');
}

/**
 * `true` quando o call site já declarou a largura do wrapper (`w-…`).
 *
 * ⚠️ **`min-w-` NÃO conta**, e é exatamente esse o ponto. O wrapper chumbava
 * `w-full`, então um `min-w-[140px]` sozinho não vencia — e como `w-full` e
 * `w-auto` são utilities do MESMO grupo, a ordem no atributo `class` não
 * desempata (quem decide é a ordem no CSS gerado). Resultado, medido na barra de
 * filtros do painel de pendências: os três selects renderizavam **full-width,
 * empilhados**, num contêiner `flex flex-wrap` que o protótipo desenha como UMA
 * linha (`.toolbar` de `12-pendencias.html`).
 *
 * Por isso a largura passou a ser condicional em vez de a classe virar
 * `w-auto` no default: `w-full` continua sendo o certo para campo de formulário
 * (a esmagadora maioria dos 28 call sites), e quem quer largura de conteúdo
 * agora consegue pedi-la.
 *
 * A checagem é por TOKEN, não por `includes`: `'min-w-[140px]'.includes('w-')` é
 * verdadeiro, e um `includes` desligaria o `w-full` de todo call site que só
 * declara largura mínima — o oposto do conserto.
 */
function hasExplicitWidth(layoutClasses: string): boolean {
  return layoutClasses
    .split(/\s+/)
    .filter(Boolean)
    .some((token) => stripVariants(token).startsWith('w-'));
}

export interface SelectProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /**
   * Visual variant.
   * - `bottom-border` (default): prototype `.vdd-trigger` — neutral-40 bg, 2px bottom border only.
   * - `boxed`: full border, rounded corners.
   */
  variant?: 'bottom-border' | 'boxed';
  /**
   * Applied to the outer wrapper — **layout/width only**. Classes de
   * apresentação (fundo, borda, padding, raio, tipografia) são filtradas por
   * {@link keepLayoutClassesOnly}: elas pertencem ao trigger, e repeti-las aqui
   * desenhava o campo duas vezes.
   */
  className?: string;
  /** Forwarded to the hidden native `<select>` for test / accessibility interop. */
  'data-testid'?: string;
  required?: boolean;
  /**
   * Oferece o próprio `placeholder` como PRIMEIRA opção do menu, valor `''` —
   * o "sem filtro" / "todos" volta a ser escolhível depois de já se ter escolhido
   * algo.
   *
   * Fecha uma divergência real entre as duas representações deste componente: o
   * `<select>` nativo oculto sempre teve `<option value="">{placeholder}</option>`,
   * então leitor de tela e `user.selectOptions` conseguiam limpar o campo — mas o
   * menu customizado, que é o que o usuário de mouse e teclado vê, renderizava
   * só `options`. Escolhido um valor, não havia caminho de volta na tela.
   *
   * **Opt-in, e não o padrão**, de propósito: a maioria dos `Select` do app é
   * campo OBRIGATÓRIO de formulário (incoterm, tipo de garantia, tipo de
   * exceção…). Oferecer "vazio" ali daria ao usuário como desfazer uma resposta
   * que o DTO exige, e o `ValidationPipe` recusaria o save — trocaria um beco
   * sem saída por outro. Ligue em FILTRO, onde "todos" é uma resposta legítima.
   *
   * ⚠️ Não muda a cor do gatilho: com `value === ''` nenhuma entrada de `options`
   * casa, então `isPlaceholder` continua verdadeiro e o texto fica no tom
   * neutro-600 do placeholder. É o que distingue "sem filtro" de "filtro ativo"
   * na barra — declarar a opção como parte de `options` no call site perderia
   * justamente esse sinal.
   */
  clearable?: boolean;
  /**
   * Puts a filter box at the top of the menu and narrows the options as the user
   * types — matching `label` and {@link SelectOption.keywords}, accent- and
   * case-insensitive (ADO 67869: "podendo ser digitaveis o código da base ou
   * nome da mesma").
   *
   * **Opt-in**, and only worth it on a long catalog: it adds a focus stop and a
   * second keyboard surface inside the menu, which is noise on a five-option
   * field. The hidden native `<select>` is untouched, so `user.selectOptions`
   * and screen-reader interop behave exactly as they do without this flag.
   */
  searchable?: boolean;
  /** Placeholder of the filter box. Only used with {@link searchable}. */
  searchPlaceholder?: string;
}

/**
 * Fold case and strip diacritics so "Paulinia" finds "CENTRO PAULÍNIA" — o
 * usuário digita sem acento, e um filtro literal devolveria lista vazia sobre um
 * catálogo que tem a opção.
 */
function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Cada termo do que foi digitado tem de aparecer em `label` ou `keywords`, em
 * qualquer ordem — "5029 fortaleza" acha "5029 - BAFOR Base de Fortaleza".
 * Casar a frase inteira exigiria digitar o rótulo na ordem exata.
 */
function matchesQuery(option: SelectOption, query: string): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeForSearch(`${option.label} ${option.keywords ?? ''}`);
  return terms.every((term) => haystack.includes(term));
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder = 'Selecione…',
  disabled = false,
  variant = 'bottom-border',
  className,
  'data-testid': testId,
  required,
  clearable = false,
  searchable = false,
  searchPlaceholder = 'Buscar…',
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const [menuRect, setMenuRect] = useState<{
    left: number;
    top: number;
    width: number;
    /** Maximum width the menu may grow to before reaching the viewport edge. */
    maxWidth: number;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const menuId = `${uid}menu`;

  /*
   * O que o MENU e o teclado percorrem. Com `clearable`, o placeholder entra como
   * primeira entrada de valor `''`.
   *
   * ⚠️ `selectedOption`/`isPlaceholder` seguem lendo `options`, NÃO esta lista:
   * é o que mantém o gatilho no tom de placeholder quando nada está filtrado.
   * E o `<select>` nativo continua montando de `options` — ele já emite o
   * `<option value="">` por conta própria, então usar `menuOptions` ali criaria
   * duas opções com o mesmo valor vazio.
   */
  const offeredOptions: readonly SelectOption[] = clearable
    ? [{ value: '', label: placeholder }, ...options]
    : options;

  /*
   * O que o MENU e o teclado percorrem AGORA — já filtrado pela busca, para
   * `focusedIdx`, `aria-activedescendant`, Enter e as setas concordarem com o
   * que está na tela. Indexar a lista completa enquanto se mostra a filtrada
   * faria Enter escolher uma opção que o usuário não vê.
   */
  const menuOptions: readonly SelectOption[] = searchable
    ? offeredOptions.filter((o) => matchesQuery(o, query))
    : offeredOptions;

  const selectedOption = options.find((o) => o.value === value);
  const isPlaceholder = !selectedOption;

  function place() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) {
      // The menu may grow wider than the trigger to show long labels, but must
      // not escape the viewport. 8px right-margin keeps it away from the edge.
      const maxWidth = Math.max(r.width, Math.min(480, window.innerWidth - r.left - 8));
      setMenuRect({ left: r.left, top: r.bottom + 4, width: r.width, maxWidth });
    }
  }

  function openMenu() {
    place();
    setOpen(true);
    // A busca abre limpa: o menu reabre mostrando TODAS as opções, e a escolha
    // anterior continua marcada. Preservar o termo esconderia o valor escolhido
    // atrás de um filtro que o usuário não lembra ter digitado.
    setQuery('');
    const selIdx = offeredOptions.findIndex((o) => o.value === value && !o.disabled);
    setFocusedIdx(selIdx >= 0 ? selIdx : offeredOptions.findIndex((o) => !o.disabled));
  }

  function closeMenu() {
    setOpen(false);
    setFocusedIdx(-1);
    setQuery('');
  }

  function pickOption(opt: SelectOption) {
    if (opt.disabled) return;
    onChange(opt.value);
    closeMenu();
    triggerRef.current?.focus();
  }

  // Close when clicking outside, scrolling the page, or resizing (prototype
  // behaviour). The menu is `position: fixed` at a measured rect, so a page
  // scroll would leave it floating away from its trigger — hence closing.
  useEffect(() => {
    if (!open) return;
    const handleOut = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      )
        return;
      closeMenu();
    };
    /*
     * Scrolling INSIDE the menu must not close it. The list has its own
     * `max-height` + `overflow-y: auto`, and scroll does not bubble — so the
     * listener is registered in the CAPTURE phase to catch scrolls on any
     * ancestor, which means it also sees the menu's own. Without this guard the
     * long catalogs (316 payment terms, 51 incoterms) are unreachable: the menu
     * closes the moment the user scrolls it.
     */
    const handleScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const handleClose = () => closeMenu();
    document.addEventListener('mousedown', handleOut);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleClose);
    return () => {
      document.removeEventListener('mousedown', handleOut);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleClose);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // O foco vai para a caixa de busca ao abrir: o menu do `searchable` existe
  // para ser digitado, e exigir um segundo clique tornaria a busca invisível.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  // Filtrar muda quais opções existem, então a opção em foco pode ter saído da
  // lista. Reaponta para a primeira habilitada — sem isso Enter escolheria uma
  // opção fora do resultado, ou nada.
  useEffect(() => {
    if (!open || !searchable) return;
    setFocusedIdx(menuOptions.findIndex((o) => !o.disabled));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reaims only when the typed term changes
  }, [query, open, searchable]);

  // Scroll focused option into view when keyboard-navigating.
  useEffect(() => {
    if (!open || focusedIdx < 0 || !menuRef.current) return;
    const el = menuRef.current.querySelector<HTMLElement>(`[data-idx="${focusedIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx, open]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) {
          openMenu();
        } else if (
          focusedIdx >= 0 &&
          menuOptions[focusedIdx] &&
          !menuOptions[focusedIdx].disabled
        ) {
          pickOption(menuOptions[focusedIdx]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeMenu();
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) { openMenu(); break; }
        setFocusedIdx((prev) => {
          let next = prev + 1;
          while (next < menuOptions.length && menuOptions[next]?.disabled) next++;
          return next < menuOptions.length ? next : prev;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) { openMenu(); break; }
        setFocusedIdx((prev) => {
          let next = prev - 1;
          while (next >= 0 && menuOptions[next]?.disabled) next--;
          return next >= 0 ? next : prev;
        });
        break;
      case 'Home':
        e.preventDefault();
        if (open) setFocusedIdx(menuOptions.findIndex((o) => !o.disabled));
        break;
      case 'End': {
        e.preventDefault();
        if (open) {
          for (let i = menuOptions.length - 1; i >= 0; i--) {
            if (!menuOptions[i].disabled) { setFocusedIdx(i); break; }
          }
        }
        break;
      }
      case 'Tab':
        closeMenu();
        break;
    }
  }

  /**
   * Teclado dentro da caixa de busca. Setas, Enter e Escape continuam sendo do
   * MENU — sem isso o usuário digitaria o termo e teria de voltar ao gatilho
   * para escolher, que é o passo que a busca existe para remover.
   *
   * Nada mais é interceptado: o resto das teclas é digitação.
   */
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        if (focusedIdx >= 0 && menuOptions[focusedIdx] && !menuOptions[focusedIdx].disabled) {
          pickOption(menuOptions[focusedIdx]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeMenu();
        triggerRef.current?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIdx((prev) => {
          let next = prev + 1;
          while (next < menuOptions.length && menuOptions[next]?.disabled) next++;
          return next < menuOptions.length ? next : prev;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIdx((prev) => {
          let next = prev - 1;
          while (next >= 0 && menuOptions[next]?.disabled) next--;
          return next >= 0 ? next : prev;
        });
        break;
      case 'Tab':
        closeMenu();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Trigger classes
  // ---------------------------------------------------------------------------

  // `min-h-[44px]` + `leading-[1.5]`: protótipo `.vdd-trigger{min-height:44px}`
  // e `line-height:1.5`, para o gatilho ter a mesma altura do `input.in{height:44px}`
  // quando os dois aparecem lado a lado na mesma linha do formulário.
  const baseTrigger =
    'w-full min-h-[44px] flex items-center justify-between gap-2 text-(length:--t-caption) leading-[1.5] tracking-[.2px] text-left font-[inherit] transition-[border-color] duration-150';

  const triggerCls =
    variant === 'bottom-border'
      ? [
          baseTrigger,
          'px-3 py-[11px] bg-(--neutral-40) border-0 border-b-2',
          disabled
            ? 'bg-(--disabled-bg) border-(--neutral-200) text-(--disabled-text) cursor-not-allowed'
            : open
              ? 'border-(--secondary-500) text-(--neutral-800) cursor-pointer'
              : isPlaceholder
                ? 'border-(--neutral-600) text-(--neutral-600) cursor-pointer'
                : 'border-(--neutral-600) text-(--neutral-800) cursor-pointer',
        ].join(' ')
      : [
          baseTrigger,
          'px-3 py-2 border rounded-[var(--radius-xs)]',
          disabled
            ? 'bg-(--neutral-40) border-(--color-border-strong) text-(--color-text-muted) cursor-not-allowed'
            : open
              ? 'bg-white border-(--secondary-500) text-(--neutral-800) cursor-pointer'
              : isPlaceholder
                ? 'bg-white border-(--color-border-strong) text-(--neutral-600) cursor-pointer'
                : 'bg-white border-(--color-border-strong) text-(--neutral-800) cursor-pointer',
        ].join(' ');

  // ---------------------------------------------------------------------------
  // Portal menu
  // ---------------------------------------------------------------------------

  const menu =
    open && menuRect && typeof window !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={searchable ? undefined : menuId}
            role={searchable ? undefined : 'listbox'}
            style={{
              position: 'fixed',
              zIndex: 9999,
              left: menuRect.left,
              top: menuRect.top,
              /* minWidth keeps the menu at least as wide as the trigger; it may
                 grow wider (up to maxWidth) so long option labels are fully
                 readable without being clipped — CA-1 / CA-3. */
              minWidth: menuRect.width,
              maxWidth: menuRect.maxWidth,
              maxHeight: 280,
              /* Com busca, quem rola é a LISTA (abaixo) — a caixa de filtro fica
                 fixa no topo. Rolar o contêiner inteiro levaria embora justamente
                 o campo que o usuário está digitando. */
              overflowY: searchable ? 'hidden' : 'auto',
              display: searchable ? 'flex' : undefined,
              flexDirection: searchable ? 'column' : undefined,
              background: 'var(--neutral-0)',
              border: '1px solid var(--neutral-200)',
              borderRadius: 'var(--radius-xs)',
              boxShadow: 'var(--shadow-menu)',
              fontFamily: 'var(--font-family)',
            }}
          >
            {searchable && (
              <input
                ref={searchRef}
                type="text"
                value={query}
                autoComplete="off"
                aria-label={searchPlaceholder}
                aria-controls={menuId}
                data-testid={testId ? `${testId}-busca` : undefined}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                style={{
                  flexShrink: 0,
                  margin: 8,
                  padding: '8px 12px',
                  border: '1px solid var(--neutral-200)',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: 'var(--t-caption)',
                  fontFamily: 'inherit',
                  color: 'var(--neutral-800)',
                  outline: 'none',
                }}
              />
            )}
            <div
              id={searchable ? menuId : undefined}
              role={searchable ? 'listbox' : undefined}
              style={
                searchable
                  ? { overflowY: 'auto', minHeight: 0 }
                  : { display: 'contents' }
              }
            >
            {/* Lista vazia com termo digitado é resposta ("nada casou"), não
                falha — dizê-lo impede que o menu pareça quebrado. */}
            {searchable && menuOptions.length === 0 && (
              <p
                data-testid={testId ? `${testId}-vazio` : undefined}
                style={{
                  padding: '12px 16px',
                  margin: 0,
                  fontSize: 'var(--t-caption)',
                  color: 'var(--neutral-600)',
                }}
              >
                Nenhuma opção encontrada.
              </p>
            )}
            {menuOptions.map((opt, idx) => {
              const isSel = opt.value === value;
              const isFoc = idx === focusedIdx;
              return (
                <div
                  key={opt.value}
                  id={`${uid}opt${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={opt.disabled}
                  /* mousedown (not click) prevents the trigger's onBlur from
                     firing before the option selection is processed. */
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickOption(opt);
                  }}
                  onMouseEnter={() => {
                    if (!opt.disabled) setFocusedIdx(idx);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '12px 16px',
                    fontSize: 'var(--t-caption)',
                    lineHeight: 1.46,
                    letterSpacing: '.2px',
                    color: opt.disabled
                      ? 'var(--neutral-200)'   /* #cccccc — prototype .vdd-opt.dis */
                      : isSel
                        ? 'var(--secondary-500)'  /* #418020 — prototype .vdd-opt.sel */
                        : 'var(--neutral-800)',   /* #2e2e2e — prototype .vdd-opt */
                    fontWeight: isSel ? 700 : 400,
                    cursor: opt.disabled ? 'not-allowed' : 'pointer',
                    background:
                      isFoc && !opt.disabled
                        ? 'var(--neutral-40)'  /* #f2f2f2 — prototype .vdd-opt:hover */
                        : 'transparent',
                  }}
                >
                  <span
                    style={{ overflowWrap: 'break-word', minWidth: 0 }}
                  >
                    {opt.label}
                    {opt.hint && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--secondary-600)',
                        }}
                      >
                        {opt.hint}
                      </span>
                    )}
                  </span>
                  {/* Check mark — prototype .vdd-ck: M3 8L6.5 11.5L13 5, stroke #418020 */}
                  {isSel && !opt.disabled && (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      style={{ flexShrink: 0 }}
                    >
                      <path
                        d="M3 8L6.5 11.5L13 5"
                        stroke="var(--secondary-500)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              );
            })}
            </div>
          </div>,
          document.body,
        )
      : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const layoutClasses = keepLayoutClassesOnly(className);
  /*
   * `w-full` continua o default — quase todo call site é campo de formulário e
   * ocupa a linha. Mas quando o call site declara a própria largura (`w-auto`
   * na barra de filtros do painel de pendências), o default sai do caminho: as
   * duas são utilities do mesmo grupo e a ordem no atributo não desempata.
   */
  const wrapperWidthClass = hasExplicitWidth(layoutClasses) ? '' : 'w-full';

  return (
    <div className={`relative ${wrapperWidthClass} ${layoutClasses}`.trim()}>
      {/*
        Custom combobox trigger — visual presentation for sighted users.
        The button is fully keyboard-accessible. Screen readers will also
        encounter the sr-only native <select> below (via label association
        or accessibility-tree navigation) and may announce both; this is a
        known trade-off that avoids aria-hidden on the button, which would
        cause Tab + screen-reader focus to land silently on the button.
      */}
      <div>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          aria-owns={open ? menuId : undefined}
          aria-activedescendant={focusedIdx >= 0 ? `${uid}opt${focusedIdx}` : undefined}
          className={triggerCls}
          onClick={() => {
            if (!disabled) open ? closeMenu() : openMenu();
          }}
          onKeyDown={handleKeyDown}
        >
          <span
            title={selectedOption?.label ?? placeholder}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {selectedOption?.label ?? placeholder}
          </span>
          {/*
            Chevron — prototype `.vdd-cv`: M4 6L8 10L12 6, stroke #808080 (--neutral-500),
            rotates 180° on open (.vdd.open .vdd-cv { transform: rotate(180deg) }).
          */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            style={{
              flexShrink: 0,
              transition: 'transform .2s',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          >
            <path
              d="M4 6L8 10L12 6"
              stroke="var(--neutral-500)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {menu}

      {/*
        Hidden native <select> — accessible to screen readers and testing-library.

        NOT aria-hidden: screen-reader users interact with this element.
        tabIndex={-1}: removed from Tab order so sighted keyboard users Tab to
        the combobox button above instead.
        sr-only (clip): visually hidden, but still in the accessibility tree —
        `getByLabelText` / `user.selectOptions` in tests work as before.

        The label's `htmlFor` should point to `id` here so clicking the label
        focuses this element; if the user then presses Space/Enter the native
        dropdown opens as a fallback.
      */}
      <select
        id={id}
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        tabIndex={-1}
        className="sr-only"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
