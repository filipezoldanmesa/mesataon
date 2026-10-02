/**
 * BFF client for the franchise anticipated-opinion decisions (FRQ-8 — RN-F6-02/03/04).
 *
 * API contract (backend action routes, `@ActionPost`):
 *   POST .../franquia/{franquiaId}/parecer-antecipado:aprovar              → 200 | 403 | 404
 *   POST .../franquia/{franquiaId}/parecer-antecipado:aprovarComRessalvas  → 200 | 400 (sem texto) | 403 | 404
 *   POST .../franquia/{franquiaId}/parecer-antecipado:rejeitar             → 200 | 400 (sem texto) | 403 | 404
 *   POST .../franquia/{franquiaId}/parecer-antecipado:recall               → 200 | 400 | 403 | 404
 *
 * The colon cannot appear in a Next route folder, so the BFF exposes them as
 * `/api/opportunities/{id}/franquia-parecer/{franquiaId}/{acao}`.
 */

import { apiUrl } from '@/lib/base-path';

import { throwFranquiaError } from './client-errors';
import type { ResultadoParecerFranquia } from './types';

export type ParecerAcao = 'aprovar' | 'aprovar-com-ressalvas' | 'rejeitar' | 'recall';

export interface ParecerAntecipadoResult {
  franquiaId: string;
  texto: string | null;
  resultado: ResultadoParecerFranquia | null;
  resultadoLabel: string | null;
  numRecalls: number;
}

export async function decidirParecerAntecipado(
  opportunityId: string,
  franquiaId: string,
  acao: ParecerAcao,
  texto: string | null,
): Promise<ParecerAntecipadoResult> {
  /*
   * Ressalvas/rejeição REQUIRE a justificativa (RN-F6-03). An empty field goes
   * as `""` — a string — so the only DTO constraint that fails is the
   * `@IsNonBlankString` one, whose message is the business phrase
   * ("justificativa é obrigatória para rejeição."). Sending `null` would also
   * trip `@IsString()` and prepend a generic type error to the response.
   */
  const requerTexto = acao === 'aprovar-com-ressalvas' || acao === 'rejeitar';
  const body = acao === 'recall' ? {} : { texto: requerTexto ? (texto ?? '') : texto };

  const res = await fetch(
    apiUrl('opportunities', opportunityId, 'franquia-parecer', franquiaId, acao),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    await throwFranquiaError(res, 'Falha ao registrar o parecer');
  }

  return (await res.json()) as ParecerAntecipadoResult;
}
