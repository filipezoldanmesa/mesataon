import React from 'react';

/**
 * Canonical form field label.
 *
 * Renders a `<label>` with the project's standard caption typography.
 * When `required` is `true` an asterisk is appended in `--color-danger`
 * with `aria-hidden="true"` so screen-readers announce the field itself
 * as required via the `required` attribute on the control — not by reading
 * the asterisk character.
 *
 * `hint` displays an inline annotation (e.g. "a validar") in `--yellow-700`
 * (ADR-0018) — separate from the required indicator.
 *
 * `size` picks the type scale. `'caption'` (14px) is the prototype's shared
 * form label (`label.f` in vibra-ui.css); `'small'` (12px) is the tighter
 * variant this app adopted first and stays the default, so the screens built
 * against it do not shift underneath.
 */
export function FieldLabel({
  htmlFor,
  required,
  hint,
  size = 'small',
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  size?: 'small' | 'caption';
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-1 block font-bold uppercase tracking-[0.3px] text-(--color-text-muted) ${
        size === 'caption' ? 'text-(length:--t-caption)' : 'text-(length:--t-small)'
      }`}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-(--color-danger)" aria-hidden="true">
          *
        </span>
      )}
      {hint && (
        <span className="ml-1.5 text-[12px] font-bold normal-case tracking-normal text-(--yellow-700)">
          {hint}
        </span>
      )}
    </label>
  );
}
