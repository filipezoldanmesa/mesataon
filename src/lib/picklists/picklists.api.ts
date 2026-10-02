import { redirectToLogin } from '@/lib/auth';
import { withBasePath } from '@/lib/base-path';

import {
  PicklistUnavailableError,
  type PicklistField,
  type PicklistOptions,
} from './picklists.types';

/**
 * Loads the selectable options of a Salesforce picklist via the BFF.
 *
 * `controllingValue` is required for a DEPENDENT picklist. Omitting it returns
 * an empty list with `outcome: 'CONTROLADOR_AUSENTE'` — a real answer ("nothing
 * is selectable until the controlling field is answered"), not a failure. A
 * transport or backend failure throws {@link PicklistUnavailableError} so the
 * caller can render its own error state; it is never turned into an empty list,
 * because an empty list is itself a meaningful answer here.
 */
export async function getPicklistOptions(
  field: PicklistField,
  controllingValue?: string | null,
): Promise<PicklistOptions> {
  const query = controllingValue
    ? `?controllingValue=${encodeURIComponent(controllingValue)}`
    : '';

  let res: Response;
  try {
    res = await fetch(withBasePath(`/api/picklists/${encodeURIComponent(field)}${query}`));
  } catch {
    throw new PicklistUnavailableError(field);
  }

  /*
   * Sessão expirada tem conserto próprio — e não é "tentar novamente".
   *
   * A rota BFF responde 401 sem nem chamar o backend quando o cookie de sessão
   * não existe. Sem este ramo, o 401 virava `PicklistUnavailableError` como
   * qualquer outra falha, e o `PicklistSelect` renderizava
   * **"Opções indisponíveis · Tentar novamente"** — que se lê como catálogo do
   * Salesforce quebrado. Medido em 25/08/2026 no modal "Dados da proposta":
   * `quote-tipo-contrato` e `quote-finalidade` responderam 401 lado a lado, a
   * página seguiu aberta com a sessão morta, e nada em tela mencionava sessão.
   * O "Tentar novamente" então só repetia o 401.
   *
   * `redirectToLogin` é o mesmo caminho que os blocos da proposta já usam para
   * 401 (`isExpiredSessionError` + `redirectToLogin`), é idempotente — as duas
   * picklists falhando juntas geram UM redirect — e limpa o cache de sessão
   * antes de sair. Fica aqui, no ponto único por onde toda picklist da app
   * passa, em vez de em cada consumidor.
   *
   * O throw permanece depois: quem chamar precisa parar de qualquer forma, e a
   * navegação não é instantânea.
   */
  if (res.status === 401) redirectToLogin();

  if (!res.ok) throw new PicklistUnavailableError(field);

  return (await res.json()) as PicklistOptions;
}
