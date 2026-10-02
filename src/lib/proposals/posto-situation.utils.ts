/**
 * Derived contract-duration figures shown next to the "Situação do
 * posto e do imóvel" block (prototype `03-proposta-nova.html`: "Duração do
 * contrato de uso" / "Restantes"). Pure functions so they're independently
 * testable and the component can inject a fixed `now` in tests.
 */

/** Whole months between two ISO-8601 dates (`to` − `from`), truncated (not rounded). */
function monthsBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);

  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) {
    months -= 1;
  }
  return months;
}

export interface ContractDuration {
  /** Total contract duration, in months (dataFimUso − dataInicioUso). */
  totalMeses: number;
  /** Remaining months from `now` to dataFimUso — 0 (never negative) once expired. */
  restantesMeses: number;
}

/**
 * Computes `imMeses`/`imRest` (prototype ids) from the contrato de uso
 * window. Returns `null` when either date is missing (propriedadeImovel !=
 * TERCEIRO — RN-F4-02).
 */
export function computeContractDuration(
  dataInicioUso: string | null,
  dataFimUso: string | null,
  now: Date = new Date(),
): ContractDuration | null {
  if (!dataInicioUso || !dataFimUso) return null;

  const nowIso = now.toISOString().slice(0, 10);
  return {
    totalMeses: Math.max(0, monthsBetween(dataInicioUso, dataFimUso)),
    restantesMeses: Math.max(0, monthsBetween(nowIso, dataFimUso)),
  };
}
