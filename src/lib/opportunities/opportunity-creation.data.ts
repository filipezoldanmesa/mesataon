/**
 * Data sources for opportunity creation (F2 — 01a-nova-oportunidade). Always
 * the real API via the BFF (`/api/opportunities/prefill` and
 * `/api/opportunities`) — the in-memory mock was removed as part of moving all
 * mock data to the backend. Components import from here; tests inject their own
 * functions via prop.
 */
export { getOpportunityPrefill, createOpportunity } from './opportunity-creation.api';
