/**
 * CTR-F1 (HU-02.1 / RN-F1-03): mirrors the backend
 * `NetlexConsultaStatus` enum 1:1.
 *
 * Rules:
 *  - Unknown value ⇒ type guard returns false; callers fall back to the
 *    safest state (no destructive CTA gated on it).
 *  - Never `??` to the first value — see CLAUDE.md: "valor desconhecido ⇒
 *    type guard + o estado mais seguro".
 *  - `NAO_APLICAVEL` is a read-model sentinel for the minuta screen (CTR-14)
 *    and is NEVER stored in the DB.
 */
export const ConsultaJuridicaStatus = {
  EmParalelo: 'EM_PARALELO',
  Concluida: 'CONCLUIDA',
  NaoAplicavel: 'NAO_APLICAVEL',
} as const;

export type ConsultaJuridicaStatus =
  (typeof ConsultaJuridicaStatus)[keyof typeof ConsultaJuridicaStatus];

/** pt-BR display labels for the consulta status. */
export const CONSULTA_JURIDICA_STATUS_LABEL: Record<ConsultaJuridicaStatus, string> = {
  [ConsultaJuridicaStatus.EmParalelo]: 'Em paralelo',
  [ConsultaJuridicaStatus.Concluida]: 'Concluída',
  [ConsultaJuridicaStatus.NaoAplicavel]: 'Não aplicável',
};

/** Type guard — returns false for unknown values; callers should fall back safely. */
export function isConsultaJuridicaStatus(value: unknown): value is ConsultaJuridicaStatus {
  return (
    value === ConsultaJuridicaStatus.EmParalelo ||
    value === ConsultaJuridicaStatus.Concluida ||
    value === ConsultaJuridicaStatus.NaoAplicavel
  );
}
