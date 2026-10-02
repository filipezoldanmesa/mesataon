/**
 * Date formatting for pt-BR screens — with the distinction that matters.
 *
 * ## Two kinds of value, two functions, never one
 *
 * The repo carries both, and formatting one as the other is off by a day:
 *
 *  - **A calendar date** (`"2026-08-01"`): a day the business chose. It has no
 *    time zone. `new Date("2026-08-01")` parses it as UTC midnight, which in
 *    BRT is 31/07 — so it must be split, never parsed.
 *  - **An instant** (`"2026-08-22T02:16:00.000Z"`): a `timestamptz` column such
 *    as `opened_at`, `completed_at` or `created_at`. Slicing the first ten
 *    characters yields the UTC calendar date, which for anything between 21:00
 *    and 24:00 BRT is TOMORROW.
 *
 * Measured (VBR-635 §3): the opportunity card said `DATA DE ABERTURA
 * 22/08/2026` while the pendências of that same opportunity said `ABERTA EM
 * 21/08/2026` — one instant, formatted both ways, on two screens the user reads
 * side by side. The pendências were right.
 *
 * ## Why the zone is pinned instead of using the browser's
 *
 * `toLocaleDateString('pt-BR')` alone uses the VIEWER's zone, so the same
 * opportunity would show a different opening date to someone travelling. These
 * dates belong to a Brazilian business process; pinning
 * `America/Sao_Paulo` makes the rendered day match what the operation calls
 * "that day", everywhere.
 */

const BR_TIME_ZONE = 'America/Sao_Paulo';

/**
 * Formats a calendar date (`YYYY-MM-DD`, no zone) as `DD/MM/YYYY`.
 *
 * Splits the string — deliberately never `new Date`, which would shift it a day
 * back in every western time zone. Anything that is not a well-formed date
 * returns `'—'` rather than `undefined/undefined/…`.
 */
export function formatCalendarDateBR(value: string | null | undefined): string {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : '—';
}

/**
 * Formats an ISO-8601 **instant** as the `DD/MM/YYYY` of that moment in Brazil.
 *
 * Use this for every `timestamptz` the backend returns (`dataAbertura`,
 * `dataConclusao`, `createdAt`, …). Never slice those to ten characters.
 */
export function formatInstantDateBR(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('pt-BR', {
    timeZone: BR_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Formats an ISO-8601 instant as `DD/MM/YYYY HH:MM` in Brazil. */
export function formatInstantDateTimeBR(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('pt-BR', {
    timeZone: BR_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
