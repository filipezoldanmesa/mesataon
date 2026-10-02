import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  CcobDistribuicao,
  GerenciaCcobList,
  ReatribuicaoGerenciaCcobResult,
} from './distribuicao-ccob.types';

/**
 * Cliente da aba **Governança → CCOB**.
 *
 * Toda URL passa por {@link withBasePath}: `NEXT_PUBLIC_BASE_PATH` é vazio no
 * laptop e preenchido em dev/stage/prod, então string crua funciona localmente
 * e responde 404 em todos os ambientes (VBR-626).
 */

/** Todas as gerências e o analista da CCOB de cada uma. */
export async function listGerenciasCcob(): Promise<GerenciaCcobList> {
  const res = await fetch(withBasePath('/api/governanca/ccob/distribuicao'));
  if (!res.ok) await throwApiError(res, 'Falha ao carregar a distribuição CCOB');
  return (await res.json()) as GerenciaCcobList;
}

/**
 * "Editar" — grava o analista da CCOB de uma gerência.
 *
 * ⚠️ Vale **daí em diante**: quem distribui lê a tabela no momento em que a
 * garantia é promovida à análise prévia, então garantia já em prévia não se
 * move. Para trocar o responsável de uma garantia específica existe a
 * reatribuição na tela de Garantia.
 */
export async function upsertDistribuicaoCcob(
  gerencia: string,
  analistaId: string,
): Promise<CcobDistribuicao> {
  const res = await fetch(
    withBasePath(`/api/governanca/ccob/distribuicao/${encodeURIComponent(gerencia)}`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analistaId }),
    },
  );
  if (!res.ok) await throwApiError(res, 'Falha ao salvar a distribuição CCOB');
  return (await res.json()) as CcobDistribuicao;
}

/**
 * "Reatribuir" — troca o analista de **todas** as garantias em análise prévia
 * da gerência e grava a parametrização, numa transação só.
 *
 * É o superconjunto do `upsertDistribuicaoCcob`: aquele vale só daí em diante,
 * este move também o que já está em curso. Alcança apenas
 * `EM_ANALISE_PREVIA` — o único estado em que a bola está com a CCOB.
 */
export async function reatribuirGerenciaCcob(payload: {
  gerencia: string;
  analistaId: string;
  motivo?: string;
}): Promise<ReatribuicaoGerenciaCcobResult> {
  const res = await fetch(
    withBasePath('/api/governanca/ccob/distribuicao/reatribuir'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    await throwApiError(res, 'Falha ao reatribuir a análise prévia da gerência');
  }
  return (await res.json()) as ReatribuicaoGerenciaCcobResult;
}
