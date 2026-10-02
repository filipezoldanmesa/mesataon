/**
 * Public data façade for SNEG F2 analysis functions.
 *
 * Re-exports the real BFF clients unconditionally. Components always import
 * from this module (never the api or mock directly). Tests inject stubs via
 * component props, so this module never needs a mock flag.
 */
export {
  devolverProposal,
  getSnegViability,
  listPostoPhotos,
  solicitarAjuste,
} from './sneg-analysis.api';
