'use client';

// ---------------------------------------------------------------------------
// KpiCard — reusable KPI display card (DASH-F2 · HU-03)
//
// Mirrors the prototype `.kpis .kbig` block (01-visao-geral.html lines 22–28,
// 114–120):
//   .kbig      → surface card, 16px/18px padding, radius-md
//   .kbig.crit → 3px left border in --red-500
//   .kbig.warn → 3px left border in --yellow-500
//   .n         → 30px bold, -1px tracking, coloured per KPI
//   .l         → --t-caption bold (dark, NOT muted)
//   .d         → 12px muted descriptor line
//
// `null` value → renders "—" (absence of data ≠ zero).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KpiCardVariant = 'neutral' | 'crit' | 'warn';

/**
 * Colour of the big number.  The prototype tints each KPI number with the
 * palette of what it measures (`.n` inline styles, lines 115–119) — red for the
 * backlog, blue for approvals, amber for signatures, green for pipeline value —
 * and leaves "Ticket médio" in the default ink.
 */
export type KpiCardTone = 'neutral' | 'danger' | 'info' | 'warning' | 'success';

export type KpiCardProps = {
  /** Short label displayed under the value (e.g. "Pendências abertas"). */
  label: string;
  /**
   * Pre-formatted value string (e.g. "8", "R$ 187M", "—").
   * Pass `"—"` for absent data — never `"0"` / `"R$ 0,00"` for null backend values.
   */
  value: string;
  /**
   * Descriptor line under the label (prototype `.d`: "na sua carteira",
   * "42 oportunidades", …).  Omitted when null — never invented.
   */
  description?: string | null;
  /**
   * Left accent border:
   * - `neutral` (default): no accent.
   * - `crit`: red accent (`.crit`).
   * - `warn`: amber accent (`.warn`).
   */
  variant?: KpiCardVariant;
  /** Colour of the number itself (prototype `.n` inline colour). */
  tone?: KpiCardTone;
  /** Optional accessible label for the card. */
  'aria-label'?: string;
};

// ---------------------------------------------------------------------------
// Variant / tone styles
// ---------------------------------------------------------------------------

const VARIANT_BORDER: Record<KpiCardVariant, string> = {
  neutral: '',
  // 3px, matching the prototype's `border-left:3px solid`.
  crit: 'border-l-[3px] border-l-(--red-500)',
  warn: 'border-l-[3px] border-l-(--yellow-500)',
};

const TONE_COLOR: Record<KpiCardTone, string> = {
  neutral: '',
  danger: 'text-(--red-700)',
  info: 'text-(--blue-700)',
  warning: 'text-(--yellow-700)',
  success: 'text-(--secondary-600)',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Reusable KPI display card (DASH-F2 · HU-03.1).
 *
 * Used by {@link KpiGrade} to render the 5 operational KPIs of the home
 * dashboard, in the full-width row the prototype places right above the
 * "Pendências" card.
 */
export function KpiCard({
  label,
  value,
  description = null,
  variant = 'neutral',
  tone = 'neutral',
  'aria-label': ariaLabel,
}: KpiCardProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={[
        // `@container`: o número se dimensiona pela largura DO CARD, não pela
        // do viewport — ver o comentário no `<b>` abaixo.
        '@container rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) px-[18px] py-4',
        VARIANT_BORDER[variant],
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/*
        Value — .n: 30px bold, tight tracking, tone colour.

        ⚠️ O TAMANHO É FLUIDO, e isso não é preciosismo: com `--t-h1` fixo em
        30px o número TRANSBORDAVA o card. O valor não tem largura previsível
        (`37` × `R$ 179,8 mil` × `R$ 1.234,5 mi`) e o card, sim: a grade cai
        para 3 e depois 2 colunas, então a mesma string ganha metade do espaço
        sem que nada no texto mude.

        `clamp(…, 15cqi, --t-h1)` resolve pela largura do PRÓPRIO card (`cqi`,
        com o `@container` acima) — nunca pela do viewport, que é o que um
        breakpoint faria: a 2 colunas o card é estreito em QUALQUER viewport, e
        um `min-[769px]:` não veria isso. `--t-h1` continua sendo o teto, então
        nada muda nos tamanhos em que já cabia; o piso de 18px mantém o número
        legível como número (acima do `--t-h4`).

        `break-words` é o cinto de segurança: um valor absurdamente longo quebra
        a linha em vez de escapar da caixa.
      */}
      <b
        className={[
          'block max-w-full break-words text-[clamp(18px,15cqi,var(--t-h1))] leading-[1.1] font-bold tracking-[-1px]',
          TONE_COLOR[tone],
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </b>
      {/* Label — .l: caption, bold, default ink */}
      <span className="mt-1 block text-(length:--t-caption) font-bold">{label}</span>
      {/* Descriptor — .d: 12px muted; omitted when the backend has nothing to say */}
      {description !== null && description !== '' && (
        <span className="mt-[3px] block text-(length:--t-small) text-(--color-text-muted)">
          {description}
        </span>
      )}
    </div>
  );
}
