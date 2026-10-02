/**
 * Re-export shim — the SNEG analysis API client was consolidated into
 * `lib/analise/analise.api.ts` (VBR-273: single domain data module).
 * Import from `@/lib/analise/analise.api` in new code.
 */
export {
  devolverProposal,
  getSnegViability,
  listPostoPhotos,
  solicitarAjuste,
} from '@/lib/analise/analise.api';
