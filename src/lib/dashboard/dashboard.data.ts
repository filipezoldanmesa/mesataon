/**
 * Data source for the Dashboard / Resumo Executivo screen (F1 — DASH-F1,
 * `/` home route).
 *
 * Always the real API via the BFF (`/api/dashboard/resumo`) — the BFF
 * injects the session Bearer server-side and applies the mapper, so
 * components never call the backend directly.
 *
 * Components import from here; tests inject their own function via prop.
 */
export { getDashboardResumo } from './dashboard.api';
