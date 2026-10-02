/**
 * Data source for the opportunity "Garantias" card (01b).
 *
 * Re-exports the real API client (`indicacoes.api.ts`), which talks to the BFF
 * (`/api/opportunities/:id/garantias`). Components import from here, never from
 * `.api`/`.mock` directly, and tests inject stubs via prop.
 */
export {
  loadGarantiasIndicadas,
  createGarantiaIndicada,
  updateGarantiaIndicada,
  deleteGarantiaIndicada,
  uploadGarantiaDoc,
} from './indicacoes.api';
