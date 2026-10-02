/**
 * Data module for the garantia domain.
 *
 * Re-exports directly from the BFF API client — no feature flag, no mock.
 * Components and views import from here; tests inject stub functions via prop.
 *
 * Covers the garantia track read model (GAR-16) and the indication read model
 * (GAR-F1 — `GET /v1/…/garantia/indicacao`), the latter shared between the
 * opportunity-detail garantia section and the standalone garantia screen
 * (GAR-17).
 *
 * See CLAUDE.md §"Módulo de dados (*.data.ts)".
 */
export { getGarantiaTrack, GarantiaForbiddenError } from './garantia.api';
export { getGarantiaIndicacao } from './garantia.api';
export { reatribuirAnalisePrevia } from './garantia.api';
export { reatribuirAnalistaSnegGarantia } from './garantia.api';
