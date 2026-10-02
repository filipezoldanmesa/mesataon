'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { NotificationBell } from '@/components/notification-bell';
import { VibraLogo } from '@/components/vibra-logo';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { primaryRoleLabel } from '@/lib/auth-roles';

type NavItem = {
  label: string;
  href: string;
  /** Uma permissão, ou uma lista significando **qualquer uma** — espelha `RequirePermission`. */
  permission?: Permission | readonly Permission[];
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Visão geral', href: '/' },
  { label: 'Clientes', href: '/clientes' },
  { label: 'Oportunidades', href: '/oportunidades' },
  { label: 'Pendências', href: '/pendencias' },
  /*
   * Governança — auditoria + as telas de parametrização.
   *
   * ⚠️ O gate é `GovernancaAccess`: BP Financeiro, Gestor de Franquias e TI
   * Administrador, os três perfis do pedido de 20/09/2026. Era a UNIÃO das
   * permissões de dentro da página (`GOVERNANCA_PERMISSIONS`), derivada do
   * catálogo de superfícies — ver o docblock da permissão e o de
   * `lib/governanca/surfaces.ts` para o motivo de a união ter morrido.
   *
   * O item tem de espelhar a ROTA, e não o conteúdo: em 20/09/2026 SNEG e CCOB
   * mantinham permissões de superfícies que a união varria para dentro, então com
   * ela o item voltaria para os dois perfis que o negócio acabou de tirar daqui.
   * (A SNEG perdeu também as permissões de superfície em 21/09/2026 — ver
   * `lib/governanca/surfaces.ts` —, mas o gate segue sendo a lista própria: a
   * pergunta "quem entra" não volta a ser derivada do conteúdo.)
   * Mostrá-lo a quem não passa pelo gate seria oferecer uma rota que responde
   * "não encontrada" (UX; o enforcement é do `RequirePermission` e da API).
   */
  { label: 'Governança', href: '/governanca', permission: Permission.GovernancaAccess },
];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

/**
 * Chip shows "Primeiro Último" (prototype: "Ana Ribeiro"), not the full legal
 * name — a four-part name pushes the role label out of the header. Single-word
 * names pass through unchanged.
 */
function shortDisplayName(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length <= 1) return name;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function HeaderNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { can } = usePermissions();

  // The user menu is a native <details>; close it on an outside click or Escape
  // (neither closes it by default).
  const menuRef = useRef<HTMLDetailsElement>(null);

  /*
   * Mobile nav drawer (≤768px) — mirrors `vibra-header.js` of the prototype,
   * which toggles `.topbar.nav-open` from the `☰` button.
   *
   * State, not a `<details>`: the same <nav> has to stay a plain horizontal
   * strip above 769px, where there is no disclosure at all. A `<details>` would
   * put the links inside a element that is closed by default, so the desktop
   * bar would depend on `open` being forced true — CSS does the switching here
   * instead, and the state only drives the mobile class.
   *
   * ⚠️ The links are ALWAYS rendered and only hidden with `display:none`. Not
   * rendering them while closed would (a) drop the desktop bar, since the same
   * markup serves both, and (b) silently pass the suite: jsdom loads no CSS, so
   * `getByRole('link')` finds a `hidden` element just fine — a conditional
   * render is the one version the tests would catch, and the wrong fix.
   */
  const headerRef = useRef<HTMLElement>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      const el = menuRef.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
      // Prototype: `document.addEventListener('click', … if(!e.target.closest('.topbar')) …)`.
      const header = headerRef.current;
      if (header && !header.contains(e.target as Node)) setNavOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (menuRef.current) menuRef.current.open = false;
      setNavOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const displayName = user?.name ? shortDisplayName(user.name) : 'Carregando…';
  // Prototype chip is "Ana Ribeiro · LT": the profile label, not a raw role enum
  // (and never a capability role such as APPROVER).
  const displayRole = primaryRoleLabel(user?.roles);

  // Filter items that have a required permission — only show items the current
  // profile may access (UX, not enforcement: the route itself is gated too).
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.permission === undefined) return true;
    const exigidas = Array.isArray(item.permission)
      ? item.permission
      : [item.permission];
    return exigidas.some((p) => can(p));
  });

  return (
    <header
      ref={headerRef}
      className="bg-(--primary-500) text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
    >
      {/*
        Two layouts from one markup, switching at the prototype's own breakpoint
        (`vibra-ui.css`: `@media(max-width:768px)`, hence `min-[769px]:` for the
        desktop side — the repo's convention wherever a prototype media query is
        mirrored, because Tailwind's `md:` starts AT 768 and would overlap it).

        ≤768px — `.topbar{height:auto;min-height:54px;flex-wrap:wrap;gap:10px
        14px;padding:8px 16px}`: the row wraps and the nav drops to a second
        line as a drawer. Order is explicit (`☰`, logo, bell+chip, nav) because
        the drawer must come last on screen while staying before the chip in the
        DOM for a sane tab order.

        >768px — the original single 88px row. The nav keeps `min-w-0 flex-1`
        plus `overflow-x-auto`: between 769 and ~869px the links still have to
        give way, and without `min-w-0` a flex item's `min-width:auto` pushed
        the whole document wider than the viewport. That was the bug behind
        modals looking off-centre — a `fixed` overlay stays glued to the
        viewport while a horizontally scrolled page slides under it.
      */}
      {/*
        ⚠️ Sem `gap-y`: a única quebra de linha é o drawer, e um row-gap fixo
        deixaria 10px de barra sobrando quando ele está FECHADO (invisível, mas
        a barra fica 10px mais alta que os 54px do protótipo). Esse espaço vive
        no `mt` do próprio drawer, que colapsa junto com ele.
      */}
      <div className="mx-auto flex min-h-[54px] max-w-(--grid-max) flex-wrap items-center gap-x-3.5 px-4 py-2 min-[769px]:h-22 min-[769px]:flex-nowrap min-[769px]:gap-x-10 min-[769px]:px-8 min-[769px]:py-0">
        {/*
          `☰` of the prototype (`.hamb`, 38×38), built from three bars instead
          of the U+2630 character it uses. Two reasons: the glyph is missing
          from several Windows and Android UI fonts (tofu box, or a very
          different weight), and separate bars can morph into the ✕ — the
          feedback that tells you the tap landed, on the frame where the drawer
          starts moving. The bars mirror the glyph's geometry: 14 wide, 1.75
          thick, 4.5 apart.
        */}
        <button
          type="button"
          aria-label="Menu"
          aria-expanded={navOpen}
          aria-controls="header-nav-menu"
          onClick={() => setNavOpen((open) => !open)}
          className="order-1 mr-0.5 flex size-9.5 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-xs) bg-white/[0.14] text-white transition-[background-color,transform] duration-150 hover:bg-white/25 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 min-[769px]:hidden"
        >
          <span className="relative flex size-[18px] items-center justify-center" aria-hidden="true">
            {[
              // topo → diagonal ✕
              navOpen ? 'rotate-45' : '-translate-y-[4.5px]',
              // meio → sai de cena (mais rápido, senão cruza as diagonais)
              navOpen ? 'opacity-0' : 'opacity-100',
              // base → diagonal oposta
              navOpen ? '-rotate-45' : 'translate-y-[4.5px]',
            ].map((state, i) => (
              <span
                key={i}
                className={`absolute h-[1.75px] w-3.5 rounded-full bg-current transition-all duration-300 ease-out motion-reduce:transition-none ${
                  i === 1 ? 'duration-150' : ''
                } ${state}`}
              />
            ))}
          </span>
        </button>

        <Link
          href="/"
          aria-label="Vibra — Início"
          className="order-2 flex h-7 shrink-0 items-center pr-2.5 text-white min-[769px]:order-none min-[769px]:h-8.5"
        >
          {/* Exact match to the prototype `.topbar .logo` (vibra-ui.css): the mark
              lives in a fixed 100px box (`::before{width:100px}`) left-aligned, so
              the ~93.5px wordmark (viewBox 88×32 at 34px tall) leaves ~6.5px of
              trailing space; `pr-2.5` adds the 10px inner `.logo` gap. With the
              container's 40px gap, the mark→first-item distance is ~56.5px. */}
          {/* `.logo::before{width:84px;height:28px}` on mobile, 100×34 above it. */}
          <span className="flex h-7 w-21 items-center min-[769px]:h-8.5 min-[769px]:w-25">
            <VibraLogo className="h-7 w-auto min-[769px]:h-8.5" />
          </span>
        </Link>

        {/*
          ≤768px este é o drawer do protótipo (`.topbar nav{order:4;width:100%;
          flex-direction:column;gap:2px;background:var(--primary-600);
          border-radius:var(--radius-xs);padding:6px}`); >768px é a faixa
          horizontal, onde `min-w-0` é a classe que sustenta tudo (ver o
          comentário da linha acima) e `overflow-x-auto` + `shrink-0` por link
          dão aos rótulos para onde ir entre 769 e ~869px sem quebrar no meio da
          palavra. A barra de rolagem fica escondida porque um traço nativo
          cinza sobre o verde lê como falha de renderização — mesma receita do
          `track-strip.tsx` (HSCROLL_CLS).

          ## Por que `grid-template-rows: 0fr → 1fr`, e não `display` nem `max-height`

          O protótipo alterna `display:none → flex`, que **não é interpolável**:
          o drawer aparecia inteiro num quadro só, e é esse salto que se lê como
          animação "forçada". `max-height` animaria, mas exige um teto chumbado
          — e o número de links varia com a permissão (4 para o LT, 5 com
          Governança), então o curso terminaria antes do fim em um dos casos e a
          curva de easing sairia errada justamente lá.

          A linha de grade resolve os dois: `0fr → 1fr` interpola até a altura
          REAL do conteúdo, sem número mágico e sem medir nada em JS. O filho
          precisa de `min-h-0` (senão não encolhe abaixo do próprio conteúdo) e
          de `overflow-hidden`, para recortar durante o curso.

          `mt` entra na mesma transição: ele é o row-gap de 10px do protótipo, e
          animá-lo junto é o que evita um degrau de 10px no primeiro e no último
          quadro.

          ⚠️ `visibility` (não `display`) é o que tira os links do FOCO quando
          fechado. Recortado por `overflow` o link continua tabulável, então um
          teclado cairia em link invisível — era o que o `display:none` de antes
          escondia de graça. `visibility` também é o único jeito de fazer isso
          sem cortar a animação: a transição dela é especificada para só virar
          `hidden` no FIM do curso, então o drawer colapsa inteiro antes de
          sumir do foco.

          >768px o wrapper sai do caminho com `display:contents` e os links
          voltam a ser filhos diretos do `<nav>` flex — é isso que mantém UM
          markup para as duas formas, sem duplicar link nenhum na árvore. Por
          isso `visible`/`opacity-100` são forçados nesse breakpoint:
          `visibility` e `opacity` são HERDADOS, e um elemento `contents` não
          gera caixa mas repassa os dois — sem o reset, a faixa do desktop
          sumiria sempre que o estado do drawer estivesse fechado.
        */}
        <nav
          id="header-nav-menu"
          data-state={navOpen ? 'open' : 'closed'}
          className={`order-4 grid w-full overflow-hidden transition-[grid-template-rows,margin-top] duration-300 ease-out motion-reduce:transition-none min-[769px]:order-none min-[769px]:mt-0 min-[769px]:flex min-[769px]:w-auto min-[769px]:min-w-0 min-[769px]:flex-1 min-[769px]:grid-rows-none min-[769px]:items-center min-[769px]:gap-6 min-[769px]:overflow-x-auto min-[769px]:overflow-y-visible min-[769px]:text-sm min-[769px]:[scrollbar-width:none] min-[769px]:[&::-webkit-scrollbar]:hidden ${
            navOpen ? 'mt-2.5 grid-rows-[1fr]' : 'mt-0 grid-rows-[0fr]'
          }`}
        >
          {/*
            ⚠️ Esta caixa recortada NÃO tem padding, e é por isso que ela
            existe separada da de baixo. Padding não é colapsado pela linha de
            grade: com `p-1.5` aqui, a linha ia a 0 mas os 12px de padding
            continuavam desenhando o `--primary-600` — medido, uma tira verde de
            12px sobrava sob a barra com o drawer FECHADO. Padding, fundo e
            cantos moram no filho, dentro do recorte.
          */}
          <div className="min-h-0 overflow-hidden min-[769px]:contents">
            <div
              className={`flex flex-col gap-0.5 rounded-(--radius-xs) bg-(--primary-600) p-1.5 text-sm transition-[opacity,visibility] duration-300 ease-out motion-reduce:transition-none min-[769px]:visible min-[769px]:opacity-100 min-[769px]:contents ${
                navOpen ? 'visible opacity-100' : 'invisible opacity-0'
              }`}
            >
              {visibleItems.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    /* Prototype closes the drawer on any nav click. */
                    onClick={() => setNavOpen(false)}
                    className={`shrink-0 rounded-md px-3 py-2.5 transition-[opacity,background-color] duration-150 min-[769px]:rounded-none min-[769px]:border-b-2 min-[769px]:px-0 min-[769px]:py-1.25 ${
                      active
                        ? 'bg-white/[0.14] font-bold min-[769px]:border-white min-[769px]:bg-transparent min-[769px]:opacity-100'
                        : 'hover:bg-white/[0.07] min-[769px]:border-transparent min-[769px]:opacity-85 min-[769px]:hover:bg-transparent min-[769px]:hover:opacity-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        {/*
          The prototype's `.right{display:flex;align-items:center;gap:16px}`,
          which on mobile becomes `order:2;margin-left:auto;gap:8px`. Grouping
          the bell with the chip is what lets the pair travel to the end of the
          first row as one unit while the drawer takes the second.
        */}
        <div className="order-3 ml-auto flex min-w-0 items-center gap-2 min-[769px]:order-none min-[769px]:gap-4">
          {/* Notification bell — left of the user chip, per the DASH-F5 spec. */}
          <NotificationBell />

          {/*
            `shrink-0` stays on the avatar, not on the chip: "Ana Ribeiro ·
            Líder de Território" is ~200px of unbreakable text and was the
            second half of the row's intrinsic minimum. The label truncates
            instead, so on a tablet the identity is still there (initials
            always, name as far as it fits).

            ≤768px the label is hidden outright and the chip collapses to the
            avatar (`.userchip{padding:4px;gap:0}` + `.uc-name{display:none}`).
            The name is not lost: it is the first line of the menu the avatar
            opens. Hiding it rather than truncating is what frees the row for
            the `☰` without the document growing wider than the screen.
          */}
          <details ref={menuRef} className="group relative min-w-0 shrink">
            {/*
              `data-testid` porque `header summary` NÃO identifica o chip: o
              sino de notificações também é um `<details>`/`<summary>`, então um
              seletor por tag casa dois elementos e o strict mode do Playwright
              recusa. Escopar por aqui é o que permite afirmar a identidade sem
              ambiguidade — ela aparece DUAS vezes na árvore desde o drawer
              (chip + `.uc-head` do menu).
            */}
            <summary
              data-testid="user-chip"
              className="flex cursor-pointer list-none items-center gap-0 rounded-full bg-white/15 p-1 text-[13px] transition-colors hover:bg-white/25 min-[769px]:gap-2 min-[769px]:px-3 min-[769px]:py-1.5 [&::-webkit-details-marker]:hidden"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--secondary-500) text-[12px] font-bold text-white">
                {initials(user?.name ?? '')}
              </span>
              <span className="hidden truncate min-[769px]:inline">
                {displayName}
                {displayRole ? ` · ${displayRole}` : ''}
              </span>
            </summary>

            {/* `right-0` anchors the panel to the chip's right edge, so on a narrow
                screen it grows leftwards past the viewport unless clamped. */}
            <div className="absolute right-0 z-10 mt-2 max-w-[calc(100vw-2rem)] min-w-40 overflow-hidden rounded-md border border-black/10 bg-white py-1 text-(--neutral-800) shadow-lg">
              {/*
                `.uc-head` of the prototype's `uc-menu`. It carries the identity
                that the chip stops showing at ≤768px, which is the whole reason
                hiding the label there is not a loss of information — without
                this line the phone header would name nobody.
              */}
              <div className="border-b border-(--neutral-100) px-4 py-2.5 text-[13px] font-bold whitespace-nowrap text-(--neutral-800) min-[769px]:hidden">
                {displayName}
                {displayRole ? ` · ${displayRole}` : ''}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (menuRef.current) menuRef.current.open = false;
                  logout();
                }}
                className="block w-full px-4 py-2 text-left text-sm hover:bg-(--neutral-40)"
              >
                Sair
              </button>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
