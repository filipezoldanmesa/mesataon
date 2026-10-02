/**
 * BFF client for the "Dados da franquia" block mutation (FRQ-F1).
 *
 * API contract:
 *   PATCH /api/opportunities/{id}/franquia/{proposalId}/dados
 *     → PATCH /v1/opportunities/{id}/franquia/{proposalId}/dados
 *   200 UpdateDadosFranquiaResponse · 400 fora de preenchimento/validação ·
 *   403 perfil · 404 proposta/franquia · 502 upstream
 *
 * Every field is optional: absent ⇒ untouched, explicit `null` ⇒ cleared.
 * `situacaoLoja=NOVA` arms the COF flow (RN-F5-01) on the backend.
 */

import { withBasePath } from '@/lib/base-path';

import { throwFranquiaError } from './client-errors';
import type { SituacaoLoja } from './types';

export interface UpdateDadosFranquiaPayload {
  situacaoLoja?: SituacaoLoja | null;
  tipoImplantacao?: string | null;
  /** ISO-8601 date (`"2026-10-01"`). */
  inicioOperacaoPrevista?: string | null;
  faturamentoPropostoBrl?: number | null;
  faturamentoDeAcordoComFap?: boolean | null;
  possuiExcecaoRoyalties?: boolean | null;
  /**
   * Destinatário da COF. Ausente ⇒ intocado; `null` ⇒ limpo (a tela não oferece
   * mais limpar — o modal recusa o campo vazio —, mas a API continua aceitando).
   */
  cofDestinatarioEmail?: string | null;
}

export interface UpdateDadosFranquiaResult {
  proposalId: string;
  situacaoLoja: SituacaoLoja | null;
  situacaoLojaLabel: string | null;
  tipoImplantacao: string | null;
  inicioOperacaoPrevista: string | null;
  /** Decimal string, e.g. `"120000.00"`. */
  faturamentoPropostoBrl: string | null;
  faturamentoDeAcordoComFap: boolean | null;
  possuiExcecaoRoyalties: boolean | null;
  cofDestinatarioEmail: string | null;
}

export async function updateDadosFranquia(
  opportunityId: string,
  proposalId: string,
  payload: UpdateDadosFranquiaPayload,
): Promise<UpdateDadosFranquiaResult> {
  const res = await fetch(
    withBasePath(
      `/api/opportunities/${encodeURIComponent(opportunityId)}/franquia/${encodeURIComponent(proposalId)}/dados`,
    ),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    await throwFranquiaError(res, 'Falha ao salvar os dados da franquia');
  }

  return (await res.json()) as UpdateDadosFranquiaResult;
}
