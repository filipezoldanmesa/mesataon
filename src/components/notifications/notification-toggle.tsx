'use client';

/**
 * Interruptor acessível (checkbox renderizado como switch) do domínio de
 * notificações.
 *
 * Extraído do `NotificationPreferencesScreen` em 21/09/2026, quando o diálogo
 * do sino passou a precisar do mesmo controle: duas cópias divergiriam
 * justamente no estado desabilitado, que é o que carrega o motivo ("este aviso
 * não pode ser desativado") — e um motivo faltando é a diferença entre
 * "desligado" e "não dá para desligar".
 */
export function NotificationToggle({
  checked,
  disabled,
  disabledReason,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  /** Frase exibida ao lado do controle quando ele está travado. */
  disabledReason?: string;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-disabled={disabled}
        title={disabled ? disabledReason : undefined}
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--secondary-500) focus-visible:ring-offset-2',
          disabled
            ? 'cursor-not-allowed opacity-50'
            : checked
              ? 'bg-(--secondary-500)'
              : 'bg-(--neutral-300)',
        ].join(' ')}
      >
        <span
          className={[
            'h-4 w-4 rounded-full bg-white shadow transition-transform duration-150',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
      {disabled && disabledReason && (
        <span className="text-(length:--t-caption) text-(--neutral-400)" aria-live="polite">
          {disabledReason}
        </span>
      )}
    </span>
  );
}
