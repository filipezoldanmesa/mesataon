import type { ReactNode } from 'react';

export type PillVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const VARIANT_CLASS: Record<PillVariant, string> = {
  success: 'bg-(--color-success-bg) text-(--color-success)',
  warning: 'bg-(--color-warning-bg) text-(--color-warning)',
  danger: 'bg-(--color-danger-bg) text-(--color-danger)',
  info: 'bg-(--color-info-bg) text-(--color-info)',
  neutral: 'bg-(--neutral-60) text-(--neutral-700)',
};

/**
 * Status badge using the design-system semantic colors. Keeps the pill markup
 * in one place instead of repeating color classes across screens.
 */
export function StatusPill({
  variant,
  size = 'md',
  className,
  children,
  'data-testid': dataTestId,
}: {
  variant: PillVariant;
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
  /** Forwarded so callers can target the pill they rendered. */
  'data-testid'?: string;
}) {
  const sizeClass = size === 'sm' ? 'text-[10px]' : 'text-[11px]';

  return (
    <span
      data-testid={dataTestId}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-bold ${sizeClass} ${VARIANT_CLASS[variant]}${className ? ` ${className}` : ''}`}
    >
      {children}
    </span>
  );
}
