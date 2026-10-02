import type { PillVariant } from '@/components/status-pill';

/**
 * Lifecycle status of an economic-indicator snapshot — mirrors the backend
 * `IndicatorStatus` enum (`apps/api/src/proposals/domain/indicator-status.enum.ts`)
 * value-for-value. It is the `CalcStatus` of four values the F7 contract
 * (VBR-112 §6) always described and that VBR-401 finally completed.
 *
 * - `atualizado`: calculated, and no financial variable changed since.
 * - `desatualizado`: a financial variable changed after the last successful
 *   calculation (RN-F7-03/06), or a submit to the ARP genuinely failed.
 * - `em_calculo`: the ARP **accepted** a recalculation (202 "Processando") and
 *   the result is awaited via callback (VBR-401 — HU-13.2). The numbers stored
 *   in the snapshot are still the previous ones and MUST NOT be shown as
 *   current.
 * - `indisponivel`: the ARP answered the callback with an error, or the
 *   reconciliation worker expired the request without ever receiving one. The
 *   numbers are the last known good calculation; the user has to recalculate.
 *
 * Declared as a const object (same pattern as `ProposalStatus` in
 * `lib/opportunities/types.ts`) so call sites compare against a **named member**
 * — `status === IndicatorStatus.EmCalculo`, never a bare `'em_calculo'`.
 *
 * It lives in `opportunities-indicators/` rather than `opportunities/types.ts`
 * because this is the module that owns the indicator contract, and all three
 * consumers (proposta, oportunidade consolidada, franquia) already import from
 * here — a second copy in `opportunities/types.ts` is exactly the duplication
 * that lets one of them miss the next enum member.
 */
export const IndicatorStatus = {
  Atualizado: 'atualizado',
  Desatualizado: 'desatualizado',
  EmCalculo: 'em_calculo',
  Indisponivel: 'indisponivel',
} as const;

export type IndicatorStatus = (typeof IndicatorStatus)[keyof typeof IndicatorStatus];

/**
 * pt-BR labels — the only place the enum becomes text.
 *
 * This status is presentation state (how fresh the numbers are), not a business
 * verdict, so the label may live in the frontend; the derived verdicts of F7
 * (alçada, aderência) keep coming ready-made from the backend. The wording
 * matches `INDICATOR_STATUS_LABEL` of the franquia read model so the same
 * snapshot never reads differently on two screens.
 */
export const INDICATOR_STATUS_LABEL: Record<IndicatorStatus, string> = {
  [IndicatorStatus.Atualizado]: 'Atualizado',
  [IndicatorStatus.Desatualizado]: 'Desatualizado',
  [IndicatorStatus.EmCalculo]: 'Em cálculo',
  [IndicatorStatus.Indisponivel]: 'Indisponível',
};

/**
 * Pill variant per member.
 *
 * `em_calculo` is **info**, not danger: the ARP accepted the request and is
 * working — nothing failed, and red reads as a system failure (ADR-0018).
 * `indisponivel` is **warning** for the same reason: the next step is missing,
 * which is attention, not breakage. Mirrors `INDICATOR_STATUS_PILL` of the
 * franquia read model (`i`/`w`/`s`).
 */
export const INDICATOR_STATUS_PILL_VARIANT: Record<IndicatorStatus, PillVariant> = {
  [IndicatorStatus.Atualizado]: 'success',
  [IndicatorStatus.Desatualizado]: 'warning',
  [IndicatorStatus.EmCalculo]: 'info',
  [IndicatorStatus.Indisponivel]: 'warning',
};

/** Narrows an unvalidated backend value to {@link IndicatorStatus}. */
export function isIndicatorStatus(value: unknown): value is IndicatorStatus {
  return (
    typeof value === 'string' && (Object.values(IndicatorStatus) as string[]).includes(value)
  );
}

/**
 * Narrows a backend value to {@link IndicatorStatus}, or `null` when the value
 * is not a member.
 *
 * `null` is the **safe** state, never a fallback to the first member: a status
 * nobody understands must not be rendered as "Atualizado" (which would present
 * stale numbers as definitive) nor as "Desatualizado" (which would re-enable
 * "Recalcular" and possibly duplicate a calculation already running in the ARP).
 */
export function narrowIndicatorStatus(value: unknown): IndicatorStatus | null {
  return isIndicatorStatus(value) ? value : null;
}
