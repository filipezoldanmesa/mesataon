/**
 * Data module for the contract read model.
 *
 * Re-exports directly from the BFF API client — no feature flag, no mock.
 * Components and views import from here; tests inject stub functions via prop.
 *
 * See CLAUDE.md §"Módulo de dados (*.data.ts)".
 */
export {
  getContratoReadModel,
  ContratoNotFoundError,
  ContratoForbiddenError,
  solicitarRitm,
} from './contrato.api';
