import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type {
  BandeiraFranquia,
  RoteamentoFranquia,
  RoteamentoFranquiaList,
} from './roteamento-franquia.types';

/**
 * Cliente da aba **Governança → Distribuição Franquias**.
 *
 * Toda URL passa por {@link withBasePath}: `NEXT_PUBLIC_BASE_PATH` é vazio no
 * laptop e preenchido em dev/stage/prod, então string crua funciona localmente e
 * responde 404 em todos os ambientes (VBR-626).
 */

/** Toda gerência × bandeira, com o executivo de cada par. */
export async function listRoteamentoFranquia(): Promise<RoteamentoFranquiaList> {
  const res = await fetch(withBasePath('/api/governanca/roteamento-franquia/distribuicao'));
  if (!res.ok) await throwApiError(res, 'Falha ao carregar o roteamento de franquia');
  return (await res.json()) as RoteamentoFranquiaList;
}

/**
 * "Editar" — grava o executivo de um par `(bandeira, gerência)`.
 *
 * ⚠️ Vale **daí em diante**: quem lê a tabela é a criação da proposta de
 * franquia, então proposta já criada não ganha membro retroativamente — para
 * isso existe a inclusão manual na equipe da oportunidade.
 */
export async function upsertRoteamentoFranquia(
  bandeira: BandeiraFranquia,
  gerencia: string,
  executivoId: string,
): Promise<RoteamentoFranquia> {
  const res = await fetch(
    withBasePath(
      `/api/governanca/roteamento-franquia/distribuicao/${encodeURIComponent(
        bandeira,
      )}/${encodeURIComponent(gerencia)}`,
    ),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ executivoId }),
    },
  );
  if (!res.ok) await throwApiError(res, 'Falha ao salvar o roteamento de franquia');
  return (await res.json()) as RoteamentoFranquia;
}
