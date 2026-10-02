/**
 * Prototype `.in` / `label.f` field classes (`docs/design/prototype/vibra-ui.css`).
 *
 * ```css
 * .in{background:var(--neutral-40);border:none;border-bottom:2px solid var(--neutral-600);
 *     border-radius:0;padding:11px 12px}
 * ```
 *
 * Shared because the same string had already been hand-copied into
 * `product-lines-block.tsx` (`DS_INPUT`) and `recebedor-client-combobox.tsx`
 * (`FIELD`), and every modal built without it shipped the rounded-bordered
 * default instead — the deviation VBR-649/VBR-650 exist to undo. New form or
 * modal: import from here, never retype the string.
 *
 * `<select>` keeps `appearance-none` plus the caret drawn by the caller (or the
 * `Select` DS component, which owns its own trigger and must NOT receive these
 * classes — see the allowlist docblock in `select.tsx`).
 */
export const IN_FIELD =
  'w-full rounded-none border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) px-3 py-[11px] text-(length:--t-caption) font-[inherit] text-(--neutral-800) outline-none transition-colors placeholder:text-(--neutral-500) focus:border-(--secondary-500) disabled:cursor-not-allowed disabled:border-(--neutral-200) disabled:bg-(--disabled-bg) disabled:text-(--disabled-text)';

/**
 * `<select>` variant: same surface, native caret kept — the prototype puts `.in`
 * straight on `<select>` and does not draw its own arrow.
 */
export const IN_SELECT = `${IN_FIELD} cursor-pointer`;

/** `label.f` — uppercase, bold, muted, tight tracking. */
export const IN_LABEL =
  'mb-1 block text-[14px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted)';
