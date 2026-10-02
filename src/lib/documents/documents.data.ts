/**
 * Data sources for the opportunity documents screen (F9 — tela 13) and the
 * global client repository (F9 — tela 13a / 13b). Always the real API via the
 * BFF — the in-memory mock was removed as part of moving all mock data to the
 * backend. Components import from here; tests inject their own functions via
 * prop.
 */
export {
  getChecklist,
  attachDoc,
  reuseDoc,
  removeDoc,
  setDocValidation,
  solicitarReenvioDocumento,
  tituloReenvioDocumento,
  // F9 — global client repository
  getRepository,
  uploadToRepository,
  replaceInRepository,
  deleteFromRepository,
} from './documents.api';
