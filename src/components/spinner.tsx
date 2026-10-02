'use client';

// ---------------------------------------------------------------------------
// Spinner — Vibra Design System loading indicator
// ---------------------------------------------------------------------------
// Provides two variants:
//   • "inline"  — renders in the normal document flow (inside buttons, cards, etc.)
//   • "overlay" — fixed, full-viewport, centred (with optional semi-transparent backdrop)
//
// Colour: DS interactive token `--secondary-500` (#418020). NEVER use raw hex here.
// Accessibility: role="status" + aria-live="polite" + aria-busy="true" + sr-only label.
// Reduced motion: animate-none / opacity-75 via Tailwind `motion-reduce:` variant.
// ---------------------------------------------------------------------------

export type SpinnerSize = 'sm' | 'md' | 'lg';
export type SpinnerVariant = 'inline' | 'overlay';

type SpinnerProps = {
  /** Visual size of the spinner ring. Defaults to "md". */
  size?: SpinnerSize;
  /** "overlay" centres the spinner over the viewport; "inline" renders in flow. Defaults to "inline". */
  variant?: SpinnerVariant;
  /**
   * Screen-reader label announced when the spinner appears.
   * UI text follows the project convention of Portuguese.
   * Defaults to "Carregando…".
   */
  label?: string;
  /**
   * When variant="overlay", adds a semi-transparent dark backdrop behind the
   * spinner to dim the underlying content. Has no effect on inline variant.
   */
  backdrop?: boolean;
  /** Extra class(es) forwarded to the outermost wrapper element. */
  className?: string;
};

// Maps each size key to its Tailwind dimension + border-width classes.
const SIZE_STYLES: Record<SpinnerSize, { wh: string; border: string }> = {
  sm: { wh: 'h-4 w-4',   border: 'border-2' },
  md: { wh: 'h-8 w-8',   border: 'border-[3px]' },
  lg: { wh: 'h-12 w-12', border: 'border-4' },
};

/**
 * Reusable loading spinner from the Vibra Design System.
 *
 * ```tsx
 * // Inline (inside a button or card)
 * <Spinner size="sm" label="Salvando…" />
 *
 * // Full-page overlay while a transition is in progress
 * <Spinner variant="overlay" backdrop label="Enviando oportunidade…" />
 * ```
 */
export function Spinner({
  size = 'md',
  variant = 'inline',
  label = 'Carregando…',
  backdrop = false,
  className,
}: SpinnerProps) {
  const { wh, border } = SIZE_STYLES[size];

  // The visible ring element (decorative — screen readers use the sr-only label).
  const ring = (
    <div
      aria-hidden="true"
      className={[
        'rounded-full',
        wh,
        border,
        // Three sides: light neutral track; top side: DS interactive token.
        'border-(--neutral-100)',
        'border-t-(--secondary-500)',
        // Rotation animation; honours prefers-reduced-motion by stopping spin
        // and reducing opacity so the indicator is still perceptible.
        'animate-spin',
        'motion-reduce:animate-none',
        'motion-reduce:opacity-75',
      ].join(' ')}
    />
  );

  // ---------- Overlay variant ------------------------------------------------

  if (variant === 'overlay') {
    return (
      <div
        className={[
          'fixed inset-0 z-50 flex items-center justify-center',
          backdrop ? 'bg-black/30' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Inner wrapper carries the ARIA attributes so AT announces correctly
            even when the outer div is the positioning shell. */}
        <div role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">{label}</span>
          {ring}
        </div>
      </div>
    );
  }

  // ---------- Inline variant (default) ---------------------------------------

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={['inline-flex items-center gap-2', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <span className="sr-only">{label}</span>
      {ring}
    </div>
  );
}
