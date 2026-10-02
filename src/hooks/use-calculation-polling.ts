'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * First cadence: the ARP callback normally lands in **seconds** (SLA apurada em
 * VBR-399), so the first minute is checked every 10 s.
 */
export const POLL_FAST_MS = 10_000;

/** Number of fast ticks before backing off (≈ the first minute). */
export const POLL_FAST_ATTEMPTS = 6;

/** After the first minute the result is late — 30 s is enough to notice it. */
export const POLL_SLOW_MS = 30_000;

/**
 * How long to keep checking before giving up and handing control back to the
 * user.
 *
 * **This number is DERIVED from the backend, never chosen here** — a budget
 * shorter than the backend's detection window would hand the user an
 * "Atualizar" button while the verdict is still `em_calculo`, and the click
 * would show the same spinner again.
 *
 * Worst case for the backend to *decide* a request is lost (recalibrado em
 * VBR-571): `ArpReconciliationWorker` expires requests older than
 * `ARP_EXPIRY_TIMEOUT_MS` (2 min) and sweeps every
 * `ARP_RECONCILIATION_INTERVAL_MS` (1 min) — a request can go stale right after
 * a sweep, so up to 3 min — and the callback worker then flips the indicator to
 * `indisponivel` within 10 s. So ~3 min 10 s, and 4 min here leaves the margin.
 * It was 11 min while the backend took ~10 min to decide, which is what Bug
 * 67538 experienced as minutes of "Em cálculo".
 */
export const POLL_BUDGET_MS = 4 * 60_000;

/**
 * Revalidates an asynchronous calculation while it is in flight (OPP-F7 /
 * VBR-401 — `status = em_calculo`).
 *
 * Deliberately **not** aggressive polling: a decelerating cadence bounded by
 * {@link POLL_BUDGET_MS}, plus a revalidation whenever the tab regains
 * visibility (which is what actually happens in practice — the user switches
 * away and comes back). When the budget runs out, `exhausted` turns `true` and
 * the caller must offer an explicit "Atualizar" instead of spinning forever.
 *
 * @param active - `true` while the calculation is in flight. Turning it off
 *   stops the timers and resets `exhausted`.
 * @param refresh - Re-reads the snapshot. Should **not** blank the panel (a
 *   quiet refresh), otherwise every tick flashes the loading state.
 */
export function useCalculationPolling(
  active: boolean,
  refresh: () => void,
  /**
   * Overrides {@link POLL_BUDGET_MS}. Pass `null` for a wait with no known
   * upper bound — a signature, where the answer depends on a person and may
   * take days, not on a backend worker with a measurable detection window.
   * A budget there would hand the user an "Atualizar" button while the
   * envelope is legitimately still out for signature.
   */
  budgetMs: number | null = POLL_BUDGET_MS,
): { exhausted: boolean } {
  const [exhausted, setExhausted] = useState(false);

  /*
   * The callback is read through a ref so that a new function identity on each
   * render (the usual case for an inline arrow) does not restart the cadence
   * and reset the elapsed budget on every render.
   */
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!active) {
      setExhausted(false);
      return;
    }

    setExhausted(false);

    let attempt = 0;
    let elapsed = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      const delay = attempt < POLL_FAST_ATTEMPTS ? POLL_FAST_MS : POLL_SLOW_MS;
      if (budgetMs !== null && elapsed + delay > budgetMs) {
        setExhausted(true);
        return;
      }

      timer = setTimeout(() => {
        if (cancelled) return;
        attempt += 1;
        elapsed += delay;
        refreshRef.current();
        schedule();
      }, delay);
    };

    schedule();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshRef.current();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [active, budgetMs]);

  return { exhausted };
}
