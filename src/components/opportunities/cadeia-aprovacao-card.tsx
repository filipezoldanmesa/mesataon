'use client';

import { StatusPill, type PillVariant } from '@/components/status-pill';

/** Prototype pill code → design-system variant. */
function variantFor(pill: string): PillVariant {
  switch (pill) {
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

function fmtDateTimeBR(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type CadeiaNivelView = {
  ator: string | null;
  status: string;
  statusLabel: string;
  pill: string;
  concluidaEm: string | null;
  comentario: string | null;
};

/**
 * "Cadeia de aprovação" card (protótipos `01d`/`01f`/`01g`).
 *
 * One row per alçada level, in the order the org decided them, with the
 * approver, the verdict pill and the timestamp — the prototype's timeline of
 * dots with names and date-times.
 *
 * The data is the Salesforce Approval Process (ADR-0044). Until 19/08/2026 the
 * backend returned `cadeiaAprovacao: null` unconditionally and this card was an
 * empty `<aside>` with a heading and nothing under it.
 *
 * A level with no approver yet (still pending) shows the queue that owes the
 * decision — "Aprovadores Alçada" in the org — rather than an em dash, because
 * "who are we waiting on" is the question the card exists to answer.
 */
export function CadeiaAprovacaoCard({
  outcomeLabel,
  outcomePill,
  niveis,
  lidoEm,
}: {
  outcomeLabel: string;
  outcomePill: string;
  niveis: CadeiaNivelView[];
  lidoEm: string | null;
}) {
  return (
    <aside className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="text-(length:--t-h4) font-bold">Cadeia de aprovação</h2>
        <StatusPill variant={variantFor(outcomePill)}>{outcomeLabel}</StatusPill>
      </div>

      {niveis.length === 0 ? (
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Nenhum nível de alçada registrado no Salesforce.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {niveis.map((nivel, index) => (
            <li
              key={`${nivel.ator ?? 'nivel'}-${index}`}
              className="flex items-start gap-3 border-b border-(--color-border) pb-3 last:border-b-0 last:pb-0"
            >
              <span
                aria-hidden="true"
                className="mt-1 flex h-6 w-6 flex-none items-center justify-center rounded-full border border-(--color-border) text-[11px] font-bold text-(--color-text-muted)"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-(length:--t-caption) font-bold">
                    {nivel.ator ?? 'Aprovador não identificado'}
                  </span>
                  <StatusPill variant={variantFor(nivel.pill)}>{nivel.statusLabel}</StatusPill>
                </div>
                <div className="text-(length:--t-caption) text-(--color-text-muted)">
                  {fmtDateTimeBR(nivel.concluidaEm)}
                </div>
                {nivel.comentario && (
                  <p className="mt-1 text-(length:--t-caption) leading-relaxed text-(--color-text)">
                    {nivel.comentario}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {lidoEm && (
        <p className="mt-3 text-(length:--t-caption) text-(--color-text-muted)">
          Lido do Salesforce em {fmtDateTimeBR(lidoEm)}.
        </p>
      )}
    </aside>
  );
}
