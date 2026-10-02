import { throwApiError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type { PoliticaComercial } from './politica-comercial.types';

/**
 * Cliente da aba **Governança → Política comercial**.
 *
 * Um `GET` só — a aba é somente leitura (ver o docblock do controller: os
 * documentos são revisados fora daqui, os limiares no Salesforce, e a verba não
 * tem rota de edição).
 *
 * A URL passa por {@link withBasePath}: `NEXT_PUBLIC_BASE_PATH` é vazio no
 * laptop e preenchido em dev/stage/prod, então string crua funciona localmente
 * e responde 404 em todos os ambientes (VBR-626).
 */
export async function getPoliticaComercial(): Promise<PoliticaComercial> {
  const res = await fetch(withBasePath('/api/governanca/politica-comercial'));
  if (!res.ok) await throwApiError(res, 'Falha ao carregar a política comercial');
  return (await res.json()) as PoliticaComercial;
}
