/**
 * Data source for the DDI panel (F10 — VBR-129 épico). Always the real API via
 * the BFF (`/api/opportunities/:id/ddi`) — the in-memory mock was removed as
 * part of moving all mock data to the backend. Components import from here;
 * tests inject their own functions via prop.
 */
export {
  getDdiResult,
  reclassifyDdi,
  runDdi,
  submitDdiDecision,
} from './ddi.api';
