/**
 * Data source for the SNEG "Análise da proposta" shell (F1/F4/F7 — épico VBR-255).
 * Always delegates to the real BFF endpoints — no flag, no mock re-export.
 * Tests inject their own stub functions via prop.
 */
export {
  GATE2_SOURCE_STATE,
  getAnaliseSneg,
  getApprovalReadiness,
  getAlcadaPreview,
  getConferencia,
  getPadraoBP,
  getPendenciasResumo,
  getSnegViability,
  liberarParaAprovacao,
  devolverOportunidadeAoLt,
  reatribuirAnalista,
} from './analise.api';
