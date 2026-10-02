/**
 * Data sources for the pendency panel (journey F3 — `/pendencias`).
 * Wired directly to the BFF (`/api/pendencias`) — no feature flag.
 * Tests always inject their own function via prop, so this module is never
 * executed in unit tests.
 */
export { listPendencias, listPendenciaAreas } from './pendencias.api';
