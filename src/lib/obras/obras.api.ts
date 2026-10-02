import { extractErrorMessage, HttpError } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';

import type { Obra, ObraReadModel } from './obra-mapping';
import type { ObraTrilha } from './obra-trilha-mapping';

/**
 * Cliente da obra do Converge (ADR-0048), sempre pela BFF same-origin — o token
 * de sessão é cookie httpOnly e nunca chega ao browser.
 *
 * ⚠️ **Só LEITURA desde 09/09/2026 (ADR-0051).** `selecionarObra` e
 * `removerObra` saíram junto com as rotas `obra:selecionar` / `obra:remover`:
 * o vínculo passou a ser da PROPOSTA e é escrito pelas rotas de ação das duas
 * seções (`obra-da-proposta.api.ts`), na mesma transação que gera os itens.
 */

function base(opportunityId: string): string {
  return withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/obra`);
}

/** A obra vinculada. `selecionada: null` é "não tem obra", não erro. */
export async function getObra(opportunityId: string): Promise<ObraReadModel> {
  const res = await fetch(base(opportunityId));
  if (!res.ok) {
    throw new HttpError(`Falha ao carregar a obra da oportunidade (${res.status}).`, res.status);
  }
  return (await res.json()) as ObraReadModel;
}

/**
 * As obras que o cliente tem no Converge.
 *
 * ⚠️ Falha **sobe como erro**, nunca vira `[]`. Lista vazia é a afirmação de
 * negócio "este cliente não tem obra"; traduzir uma queda da fonte nela faria a
 * tela mentir — e o componente precisa do erro para renderizar o próprio estado
 * de falha. A frase do backend é preservada porque ela é a acionável (422 nomeia
 * o CNPJ que falta na oportunidade; 503 diz que cabe nova tentativa).
 */
export async function getObrasDisponiveis(opportunityId: string): Promise<Obra[]> {
  const res = await fetch(`${base(opportunityId)}/disponiveis`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new HttpError(
      extractErrorMessage(body, `Falha ao listar as obras do cliente (${res.status}).`),
      res.status,
    );
  }
  return (await res.json()) as Obra[];
}

/**
 * A trilha da obra para a faixa `.oj2` da oportunidade (ADO 67921).
 *
 * ⚠️ Rota SEPARADA do `getObra`: aquela é gateada e carrega PII de terceiros;
 * esta é aberta e só traz degraus. `temObra: false` é resposta legítima, não
 * erro — a faixa desabilita a aba e a rotula "Não se aplica", como já fazia com
 * a de Garantia.
 *
 * Falha sobe como {@link HttpError}: a aba precisa distinguir "não tem obra" de
 * "não deu para ler", e traduzir a segunda na primeira faria a tela mentir.
 */
export async function getObraTrilha(opportunityId: string): Promise<ObraTrilha> {
  const res = await fetch(`${base(opportunityId)}/trilha`, { cache: 'no-store' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new HttpError(
      extractErrorMessage(body, `Falha ao carregar a trilha da obra (${res.status}).`),
      res.status,
    );
  }
  return (await res.json()) as ObraTrilha;
}
