/**
 * Display helpers for the franchise proposal screen.
 *
 * The read model sends money as **decimal strings** (`"200000.00"`) so no
 * precision is lost crossing the wire. These helpers only format — they never
 * invent a value: an absent amount stays absent so the UI can omit the row
 * rather than print a `0` that reads as a real figure.
 */

import { formatCurrencyBRL } from '@/lib/clients/format';

/**
 * Formats a decimal string from the backend as BRL.
 *
 * Returns `null` for null/blank/unparseable input — the caller decides whether
 * to omit the row or render an em dash. Never returns `R$ 0,00` for missing
 * data (a zero is a measurement; a gap is not).
 */
export function formatBrlString(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return formatCurrencyBRL(parsed);
}

/**
 * Formats basis points as a percentage (`350` → `3,50%`).
 *
 * The backend stores percentages in bps to keep them integral; `null` stays
 * `null`.
 */
export function formatBps(bps: number | null | undefined): string | null {
  if (bps === null || bps === undefined || !Number.isFinite(bps)) return null;
  return `${(bps / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * Parses a pt-BR money input (`"1.234,56"`, `"R$ 1.234,56"`) into a number.
 *
 * Returns `null` when the field is empty or holds no digits, so the caller can
 * distinguish "not informed" from "zero" — submitting `0` for an untouched
 * field would silently record a real value the user never typed.
 */
export function parseMoneyInput(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (digits === '') return null;
  return Number(digits) / 100;
}

/**
 * Formats keystrokes into the pt-BR money mask used by the prototype inputs
 * (`"12345"` → `"123,45"`). Empty input stays empty so the placeholder shows.
 */
export function maskMoneyInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits === '') return '';
  return (Number(digits) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Número BRL → a string mascarada que o campo de dinheiro mantém
 * (`1200000` → `"1.200.000,00"`).
 *
 * Passa por {@link maskMoneyInput} em vez de formatar por conta própria, para a
 * string ser **byte-idêntica** à que a digitação do usuário produz — senão um
 * campo apenas PRÉ-PREENCHIDO pareceria editado, e o parser do submit (que tira
 * `R$`, pontos e espaços) leria uma forma que nada mais no app cria.
 *
 * `null`/`undefined`/não-finito ⇒ string vazia, para o placeholder aparecer.
 */
export function numberToMaskedBrl(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return maskMoneyInput(String(Math.round(value * 100)));
}

/** Formats an ISO timestamp/date as `dd/mm/aaaa`; `null` passes through. */
export function formatDateBR(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** Human file size for the FAP row (`1536` → `1,5 KB`). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB`;
  }
  return `${(kb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Formats a decimal RATIO (0–1, the wire unit of every `perc*` field in the
 * franchise contract — e.g. `"0.040000"`) as a pt-BR percentage (`"4,00%"`).
 *
 * The ratio × percent distinction matters: rendering the ratio as if it were
 * already a percent showed "0,04%" next to royalties computed at 4%.
 */
export function formatRatioPercent(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return `${(parsed * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}
