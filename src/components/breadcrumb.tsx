import Link from 'next/link';
import { Fragment } from 'react';

/**
 * Global breadcrumb bar — mirrors the prototype `.breadcrumb` (vibra-ui.css):
 * a full-width white strip under the topbar with a bottom border + subtle
 * shadow, and a centered inner (max grid-max, 36px tall) reading
 * `🏠 » Página`. Rendered via the {@link AppShell} `breadcrumb` slot so it sits
 * full-width between the header and the centered content.
 *
 * The first node is always the home icon (→ `/`). Each `item` with `href` (and
 * not the last) renders as a link; the last item is the current page
 * (`aria-current="page"`, not a link). Colors/sizes come straight from the
 * prototype: 14px, `--neutral-600`, current in bold, `»` separators.
 */
export type Crumb = { label: string; href?: string };

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 6.5L8 2l6 4.5V14a.5.5 0 0 1-.5.5h-3.75v-3.25H6.25v3.25H2.5A.5.5 0 0 1 2 14V6.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="w-full border-b border-(--color-border) bg-white shadow-[0_1px_2px_rgba(49,49,49,0.06)]"
    >
      <div className="mx-auto flex h-9 max-w-(--grid-max) items-center gap-2 overflow-x-auto px-6 text-(--neutral-600)">
        <Link href="/" aria-label="Início" className="flex flex-none items-center leading-none">
          <HomeIcon />
        </Link>
        {items.map((crumb, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <span aria-hidden="true" className="flex-none text-(length:--t-caption) font-bold select-none">
                »
              </span>
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="flex-none text-(length:--t-caption) whitespace-nowrap hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current="page"
                  className="flex-none text-(length:--t-caption) font-bold whitespace-nowrap"
                >
                  {crumb.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
    </nav>
  );
}
