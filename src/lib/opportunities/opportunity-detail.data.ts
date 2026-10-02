/**
 * Data source for the opportunity detail screen (`/oportunidades/[id]`, F2
 * detalhe). Always the real API via the BFF (`GET /v1/opportunities/:id`) — the
 * in-memory mock was removed as part of moving all mock data to the backend.
 * Components import from here; tests inject their own functions via prop.
 *
 * The pendency summary now lives in `pendencies.data.ts` (its own endpoint) —
 * the former `getStubPendencies` frontend stub was removed.
 */
export {
  getOpportunityDetail,
  getOpportunityProposals,
  getOpportunityTeam,
  patchOpportunityDetail,
  putOpportunityProposals,
} from './opportunity-detail.api';
