/**
 * Data sources for the pendency ticket screen (`/pendencias/[id]`, F3).
 * Wired directly to the BFF (`/api/pendencias/:id`) — no feature flag.
 * Tests always inject their own function via prop, so this module is never
 * executed in unit tests.
 */
export {
  adicionarComentario,
  getPendenciaDetalhe,
  listPendenciaAnexos,
  patchPendencia,
  reatribuirPendencia,
  resolverPendencia,
  uploadPendenciaAnexo,
} from './pendencia-detail.api';
