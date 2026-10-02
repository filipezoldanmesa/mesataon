/**
 * Data source for the opportunity listing screen (journey J2 —
 * `/oportunidades`). Always the real API via the BFF (`/api/opportunities/list`)
 * — the in-memory mock was removed as part of moving all mock data to the
 * backend. Components import from here; tests inject their own function via prop.
 */
export { listOpportunities } from './opportunities.api';
