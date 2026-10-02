/**
 * Data source for the proposal summary block. Now always the real API (via the
 * BFF `GET /api/proposals/:id`) — the in-memory mock was removed (VBR-154) and
 * dev/test data lives in the back-end seed (`SeedDevProposals`).
 */
export {
  getProposal,
  reenviarProposal,
  updateProposalAnalysisWindow,
} from './proposal.api';
