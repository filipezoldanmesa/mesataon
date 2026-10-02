/**
 * Data module for the franchise commercial-parameter mutations (FRQ-12).
 *
 * Re-exports the BFF client directly — no flag, no mock. Components import from
 * here; tests inject stubs via prop (CLAUDE.md §"Módulo de dados").
 */
export {
  setModeloLoja,
  setRoyaltyEstrutura,
  setMaturacao,
  aceitarRoyaltyPremiado,
  createExcecao,
  updateExcecao,
  deleteExcecao,
  getRoyaltyValidacoes,
  FranquiaValidationError,
} from './parametros.api';
export type {
  SetModeloLojaPayload,
  SetModeloLojaResult,
  SetRoyaltyEstruturaPayload,
  SetRoyaltyEstruturaResult,
  SetMaturacaoPayload,
  SetMaturacaoResult,
  AcceptRoyaltyPremiadoResult,
  CreateExcecaoPayload,
  ExcecaoCreated,
  RoyaltyPolicyValidacoes,
  OrigemLimiteParcelas,
} from './parametros.api';
