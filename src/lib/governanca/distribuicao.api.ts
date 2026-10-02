import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  GerenciaDistribuicaoList,
  ReatribuicaoGerenciaResult,
} from './distribuicao.types';

/**
 * Cliente da aba **Governança → SNEG**.
 *
 * Toda URL passa por {@link withBasePath}: `NEXT_PUBLIC_BASE_PATH` é vazio no
 * laptop e preenchido em dev/stage/prod, então string crua funciona localmente
 * e responde 404 em todos os ambientes.
 */

/** Todas as gerências e o analista de cada uma. */
export async function listGerenciasDistribuicao(): Promise<GerenciaDistribuicaoList> {
  const res = await fetch(withBasePath('/api/governanca/sneg/distribuicao'));
  if (!res.ok) await throwApiError(res, 'Falha ao carregar a distribuição SNEG');
  return (await res.json()) as GerenciaDistribuicaoList;
}

/**
 * Reatribui **todas as oportunidades não concluídas** da gerência.
 *
 * ⚠️ Não confunda com `upsertDistribuicao` (o "Editar"), que troca a
 * parametrização e vale só daí em diante: esta troca o dono do que já está em
 * curso e **não** mexe na tabela.
 */
export async function reatribuirGerencia(payload: {
  gerencia: string;
  analistaId: string;
  motivo?: string;
}): Promise<ReatribuicaoGerenciaResult> {
  const res = await fetch(
    withBasePath('/api/governanca/sneg/distribuicao/reatribuir'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) await throwApiError(res, 'Falha ao reatribuir a gerência');
  return (await res.json()) as ReatribuicaoGerenciaResult;
}
