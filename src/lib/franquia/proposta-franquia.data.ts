/**
 * Data module for the franchise proposal screen.
 *
 * Re-exports directly from the BFF API client — no feature flag, no mock.
 * Components import from here; tests inject stub functions via prop.
 *
 * See CLAUDE.md §"Módulo de dados (*.data.ts)".
 */
export {
  getPropostaFranquia,
  setPotencial,
  uploadFap,
  deleteFap,
  fapStreamUrl,
  PropostaFranquiaNotFoundError,
  PropostaFranquiaForbiddenError,
  FapUploadError,
} from './proposta-franquia.api';
export type {
  SetPotencialResult,
  FapDocumentoUploaded,
} from './proposta-franquia.api';
