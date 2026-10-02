/**
 * Data module for the approval phase — re-exports the real BFF client.
 *
 * Components import from here (never from `.api` directly) so tests can inject
 * stubs by prop without touching the client.
 */
export {
  getAprovacao,
  refreshAprovacao,
  AprovacaoForbiddenError,
} from './aprovacao.api';
