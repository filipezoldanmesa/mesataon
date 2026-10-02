/**
 * Re-export shim — the SNEG analysis domain types were consolidated into
 * `lib/analise/analise.types.ts` (VBR-273: single domain data module).
 * Import from `@/lib/analise/analise.types` in new code.
 */
export type {
  AvisoPolitica,
  AvisoSeveridade,
  ConsumedAnalysisPillVariant,
  ConsumedAnalysisStatus,
  CriterioAvaliado,
  SnegViability,
  SolicitarAjusteResult,
  ViabilidadeResultado,
} from '@/lib/analise/analise.types';

export {
  DevolverValidationError,
  SolicitarAjusteError,
  SolicitarAjusteValidationError,
} from '@/lib/analise/analise.types';
