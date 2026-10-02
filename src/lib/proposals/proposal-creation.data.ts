/**
 * Data source for proposal creation (F3). Now always the real API (via the BFF
 * `POST /api/proposals`) — the in-memory mock was removed (VBR-154); a created
 * proposal persists in the back-end and is read back via `GET /v1/proposals/:id`.
 */
export {
  createProposal,
  getPostoEligibility,
  getProposalDateConstraints,
} from './proposal-creation.api';
