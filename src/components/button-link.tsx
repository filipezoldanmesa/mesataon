import Link from 'next/link';
import type { ReactNode } from 'react';

const VARIANT_CLASSES = {
  primary:
    'border-transparent bg-(--secondary-500) text-white hover:bg-(--secondary-hover)',
  ghost:
    'border-(--secondary-500) bg-(--neutral-25) text-(--secondary-500) hover:bg-(--neutral-50)',
} as const;

/**
 * Navigation action styled as a design-system button.
 *
 * - `variant="primary"` (default): solid green CTA — `bg-(--secondary-500)`.
 * - `variant="ghost"`: outlined green — matches `.btn-ghost` in `vibra-ui.css`
 *   (`background:#f9f9f9`, `color/border:#418020`, hover `#eee`).
 *
 * A real navigation (`<a>`), not a `<button>` — composes with the router
 * and works without client JS.
 */
export function ButtonLink({
  href,
  className,
  children,
  variant = 'primary',
}: {
  href: string;
  className?: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
}) {
  return (
    <Link
      href={href}
      className={`inline-flex cursor-pointer items-center rounded-[var(--radius-xxs)] border px-4 py-2.25 text-(length:--t-caption) font-bold transition ${VARIANT_CLASSES[variant]}${className ? ` ${className}` : ''}`}
    >
      {children}
    </Link>
  );
}
