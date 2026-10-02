/**
 * Data module for the "Dados da franquia" block mutation (FRQ-F1).
 *
 * Re-exports the BFF client directly — no flag, no mock. Components import from
 * here; tests inject stubs via prop (CLAUDE.md §"Módulo de dados").
 */
export { updateDadosFranquia } from './dados.api';
export type {
  UpdateDadosFranquiaPayload,
  UpdateDadosFranquiaResult,
} from './dados.api';
