/**
 * BFF client for "Solicitar ajuste" on a franchise proposal block (FRQ-14).
 *
 * The transport is shared with the posto (PCR) screen and lives in
 * `@/lib/proposals/solicitar-ajuste.api` — same endpoint, same error
 * contract. This module only binds it to the franchise block vocabulary so
 * every call site names a `BlocoFranquia` member instead of a loose string.
 */

import {
  solicitarAjusteBloco,
  type SolicitarAjusteResult,
} from '@/lib/proposals/solicitar-ajuste.api';

import type { BlocoFranquia } from './ajuste';

export { SolicitarAjusteValidationError } from '@/lib/proposals/solicitar-ajuste.api';
export type { SolicitarAjusteResult } from '@/lib/proposals/solicitar-ajuste.api';

export async function solicitarAjusteFranquia(
  proposalId: string,
  bloco: BlocoFranquia,
  comentario: string,
): Promise<SolicitarAjusteResult> {
  return solicitarAjusteBloco(proposalId, bloco, comentario);
}
