import type { SVGProps } from 'react';

/**
 * Inline SVG icon set.
 *
 * Why it exists: the pendência screens rendered coloured **emoji** (💬 🔄 ✅ 👤 📎 📄 ⚙ 🎉 🔍)
 * as icons. Emoji are font-dependent (each OS ships its own drawing), never
 * inherit the DS colour, and read out loud in screen readers — they are not UI
 * icons. These are stroke icons that inherit `currentColor` and the font size,
 * so a status colour or a token change carries into them automatically.
 *
 * NOT to be confused with the prototype's typographic marks — `★ Eleita`,
 * `⚠ Aviso`, `✓`, `↻ Recalcular` are literal characters in the prototype HTML
 * (ADR-0018 fidelity) and stay as text.
 *
 * Conventions: 1em box so the icon matches the text size at the call site,
 * `stroke-width 1.5`, `aria-hidden` (the surrounding text is the label).
 */

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  /** Extra classes — size with `size-4`/`size-3.5`, colour with `text-*`. */
  className?: string;
};

function Icon({ className, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`inline-block size-[1em] shrink-0 ${className ?? ''}`}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Comment / thread entry. */
export function CommentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 9.5A1.5 1.5 0 0 1 12 11H5.5L3 13.5V4A1.5 1.5 0 0 1 4.5 2.5h7A1.5 1.5 0 0 1 13 4v5.5Z" />
    </Icon>
  );
}

/** Status change (two-way arrows). */
export function StatusChangeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 5.5h9l-2-2M13.5 10.5h-9l2 2" />
    </Icon>
  );
}

/** Resolved / done (check inside a circle). */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8.25 7.25 10l3.25-4" />
    </Icon>
  );
}

/** Informational note — states the user cannot act on, only understand. */
export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.25v4" />
      <path d="M8 4.9v.5" />
    </Icon>
  );
}

/** Reassignment / person. */
export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="5.5" r="2.5" />
      <path d="M3.5 13.5c0-2.2 2-3.5 4.5-3.5s4.5 1.3 4.5 3.5" />
    </Icon>
  );
}

/** Attachment (paperclip). */
export function AttachmentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.5 5 6 9.5a1.75 1.75 0 0 0 2.5 2.5l4.5-4.5a3.25 3.25 0 0 0-4.6-4.6L3.6 8.2a4.75 4.75 0 0 0 6.7 6.7" />
    </Icon>
  );
}

/** Document / file. */
export function DocumentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9.5 2.5H5A1.5 1.5 0 0 0 3.5 4v8A1.5 1.5 0 0 0 5 13.5h6a1.5 1.5 0 0 0 1.5-1.5V5.5L9.5 2.5Z" />
      <path d="M9.5 2.5v3h3" />
    </Icon>
  );
}

/**
 * Engrenagem. Dois usos, ambos convencionais para o glifo: autor de máquina
 * (evento de sistema no thread da pendência) e acesso a CONFIGURAÇÕES (o
 * diálogo de notificações do sino, 21/09/2026).
 *
 * ⚠️ **O contorno é a COROA DENTADA, não raios saindo de um miolo.** A primeira
 * versão era um círculo `r=2` com oito traços radiais soltos — desenho que, no
 * tamanho em que o sino o renderiza (`size-4`), é indistinguível de um **sol**
 * ou de um "brilho"/sparkle, e foi lido como tal. Um glifo de configurações que
 * não se parece com engrenagem não cumpre a única função que tem.
 */
export function GearIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.39 3.58 L6.54 1.67 L9.46 1.67 L9.61 3.58 L11.02 4.4 L12.75 3.57 L14.22 6.1 L12.63 7.18 L12.63 8.82 L14.22 9.9 L12.75 12.43 L11.02 11.6 L9.61 12.42 L9.46 14.33 L6.54 14.33 L6.39 12.42 L4.98 11.6 L3.25 12.43 L1.78 9.9 L3.37 8.82 L3.37 7.18 L1.78 6.1 L3.25 3.57 L4.98 4.4 Z" />
      <circle cx="8" cy="8" r="2.2" />
    </Icon>
  );
}

/**
 * Shield — garantia track icon (GAR-20).
 *
 * viewBox 0 0 24 24 (protótipo `01c-oportunidade-analise-step-teste.html`).
 * stroke-width 1.6 (protótipo); stroke-linejoin round.
 */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props} viewBox="0 0 24 24" strokeWidth={1.6}>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
    </Icon>
  );
}

/** Search / "not found" marker. */
export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4 14 14" />
    </Icon>
  );
}

/**
 * Notification bell — used for the in-app notification centre (DASH-F5).
 * Stroke icon that inherits `currentColor`; 1em box matches surrounding text.
 */
export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.5A4 4 0 0 0 4 6.5c0 2.5-.75 3.5-1.5 4.5h11C12.75 10 12 9 12 6.5A4 4 0 0 0 8 2.5Z" />
      <path d="M6.5 11v.5a1.5 1.5 0 0 0 3 0V11" />
    </Icon>
  );
}

/** Neutral "nothing here" marker for empty states. */
export function InboxIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.5 9.5 4 3.5h8l1.5 6v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-3Z" />
      <path d="M2.5 9.5H6l.75 1.5h2.5L10 9.5h3.5" />
    </Icon>
  );
}

/** Close / remove ("X"). */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Icon>
  );
}

/** Copy the row above into this one (arrow pointing down onto a line). */
export function CopyDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 2.5v8M5 7.5l3 3 3-3M3.5 13.5h9" />
    </Icon>
  );
}
