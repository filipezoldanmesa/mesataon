'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Shared card chrome for the home dashboard
//
// Mirrors the prototype `.card` (01-visao-geral.html line 47) and `.sec-head`
// (line 29–31): surface panel with 18px/20px padding, and a header row whose
// title and right-hand link sit on the same baseline.
// ---------------------------------------------------------------------------

export function DashboardCard({
  children,
  className = '',
  'data-testid': testId,
}: {
  children: ReactNode;
  className?: string;
  /** Âncora de teste do card inteiro — usada para provar presença E ausência. */
  'data-testid'?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={`rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-5 py-[18px] ${className}`}
    >
      {children}
    </section>
  );
}

type SectionHeadProps = {
  title: string;
  /** Right-hand link (`.link`). Omitted when there is nowhere to go. */
  linkHref?: string;
  linkLabel?: string;
  /** Accessible label for the link when the visible text is terse. */
  linkAriaLabel?: string;
  /**
   * Texto à direita quando NÃO há para onde ir — o contador sobrevive à ausência
   * do link.
   *
   * Existe por causa do card da CCOB (ADO 67986, achado de 04/09/2026): ali os
   * itens são análises prévias de garantia e não existe tela que as liste, então
   * o link foi removido. Sem este slot, remover o link levaria o **número**
   * junto, e o card perderia a única informação de volume que ele tinha.
   *
   * Ignorado quando há link — dois textos no mesmo canto seriam ruído.
   */
  meta?: string;
};

/** Card header: title on the left, optional navigation link on the right. */
export function SectionHead({
  title,
  linkHref,
  linkLabel,
  linkAriaLabel,
  meta,
}: SectionHeadProps) {
  const hasLink = Boolean(linkHref && linkLabel);
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-(length:--t-h3) font-bold">{title}</h2>
      {!hasLink && meta && (
        <span
          data-testid="section-head-meta"
          className="shrink-0 text-(length:--t-caption) text-(--color-text-muted)"
        >
          {meta}
        </span>
      )}
      {linkHref && linkLabel && (
        <Link
          href={linkHref}
          aria-label={linkAriaLabel}
          className="shrink-0 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
