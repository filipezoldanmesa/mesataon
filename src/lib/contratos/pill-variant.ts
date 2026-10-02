import type { PillVariant } from '@/components/status-pill';

/**
 * Single source for the backend pill code → `StatusPill` variant translation on
 * the contract screens. The read model emits the prototype codes
 * (`'i' | 'w' | 's' | 'n' | 'd'`); unknown/absent codes fall back to the
 * neutral variant (never a colour that reads as a verdict).
 */
export function contratoPillVariant(
  raw: string | null | undefined,
): PillVariant {
  switch (raw) {
    case 's':
      return 'success';
    case 'w':
      return 'warning';
    case 'd':
      return 'danger';
    case 'i':
      return 'info';
    default:
      return 'neutral';
  }
}
