/**
 * Formats an ISO-8601 timestamp as a human-readable pt-BR relative time string.
 *
 * Examples: "agora", "há 5 min", "há 2 h", "há 3 dias", "há 2 semanas", "há 1 mês".
 *
 * Rules:
 * - < 1 min  → "agora"
 * - < 1 h    → "há N min"
 * - < 24 h   → "há N h"
 * - < 7 days → "há N dia(s)"
 * - < 30 days → "há N semana(s)"
 * - else      → "há N mês/meses"
 *
 * This function is PURE (no `toLocaleString`, no `Intl.RelativeTimeFormat`) so
 * it works identically on server and client and its output is deterministic in
 * tests (pass a fake `now` for time travel).
 *
 * @param iso   ISO-8601 timestamp string (e.g. "2026-08-10T08:00:00.000Z")
 * @param now   Current time in milliseconds — defaults to `Date.now()`.
 *              Pass a fixed value in tests to avoid flakiness.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();

  if (diff < 0) return 'agora'; // clock skew: treat as "just now"

  const totalMinutes = Math.floor(diff / 60_000);
  if (totalMinutes < 1) return 'agora';

  if (totalMinutes < 60) {
    return `há ${totalMinutes} min`;
  }

  const totalHours = Math.floor(diff / 3_600_000);
  if (totalHours < 24) {
    return `há ${totalHours} h`;
  }

  const totalDays = Math.floor(diff / 86_400_000);
  if (totalDays < 7) {
    return `há ${totalDays} dia${totalDays === 1 ? '' : 's'}`;
  }

  const totalWeeks = Math.floor(totalDays / 7);
  if (totalWeeks < 4) {
    return `há ${totalWeeks} semana${totalWeeks === 1 ? '' : 's'}`;
  }

  const totalMonths = Math.floor(totalDays / 30);
  return `há ${totalMonths} ${totalMonths === 1 ? 'mês' : 'meses'}`;
}
