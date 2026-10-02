/**
 * Data source for the opportunity consolidated indicators block (detail screen
 * OPP-F2, "Análise financeira" — HU-13.1/HU-13.2). Always the real API via
 * the BFF (`/api/opportunities/[id]/indicators`) — the in-memory mock was
 * removed as part of moving all mock data to the backend. Components import
 * from here; tests inject their own functions via prop.
 *
 * ⚠️ Deixou de ser somente leitura em 04/09/2026: o card "Análise financeira"
 * ganhou o CTA de recálculo. A eleição continua disparando o cálculo sozinha —
 * o botão existe para o caso em que os insumos de uma proposta eleita mudaram
 * depois disso, que é justamente quando o snapshot fica "Desatualizado".
 */
export {
  getOpportunityIndicators,
  recalculateOpportunityIndicators,
} from './opportunity-indicators.api';
