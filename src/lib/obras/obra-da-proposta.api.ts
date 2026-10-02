import { extractErrorMessage, HttpError } from '@/lib/api-errors';
import { apiUrl } from '@/lib/base-path';
import type { FinancialResource } from '@/lib/proposals/financial-resources.types';
import type { Investment } from '@/lib/proposals/investments.types';

/**
 * Cliente do fluxo "Adicionar obra" (documento de 09/09/2026), sempre pela BFF
 * same-origin — o token de sessão é cookie httpOnly e nunca chega ao browser.
 *
 * ⚠️ `apiUrl` em TODA URL: ele aplica o basePath — string crua funciona no
 * laptop e responde 404 em todos os ambientes — e encoda cada segmento, que é
 * o que o gate de `base-path-coverage` afere (CWE-73).
 */

type Secao = 'financial-resources' | 'investments';

function rota(proposalId: string, secao: Secao, acao: 'adicionar-obra' | 'remover-obra'): string {
  return apiUrl('proposals', proposalId, secao, acao);
}

/**
 * Sobe o erro **com a frase do backend**, que é a acionável: "Esta proposta já
 * tem uma obra…", "A parcela 1 da obra 4710 cai em … e essa data não serve…".
 * Uma frase genérica esconderia o conserto de quem está preenchendo.
 */
async function falhar(res: Response, fallback: string): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  throw new HttpError(extractErrorMessage(body, `${fallback} (${res.status}).`), res.status);
}

/** Campos do diálogo "Adicionar obra" da seção de recursos financeiros (RF-02). */
export interface AdicionarObraRecursosPayload {
  estimateId: string;
  /**
   * O flag "Termo de Cessão" (10/09/2026). `false` desloca a liberação em 30
   * dias e vira apontamento no parecer SNEG.
   */
  termoCessao: boolean;
  /**
   * A linha de imagem, SÓ quando a obra não a declara (`linhaImagem: null` no
   * `ObraDto`). Quando ela declara, a obra vence e este campo não viaja.
   */
  linhaImagem?: 'PISTA' | 'BR_MANIA' | 'LUBRAX_MAIS';
  tipoRegistro: string;
  tipoBonificacao?: string | null;
  indiceCorrecaoParcela?: string | null;
  carenciaMeses?: number | null;
  jurosPercentual?: number | null;
  qtdPrestacoes?: number | null;
  justificativa?: string | null;
  bonusPeriodicidade?: string | null;
  bonusQtdParcelas?: number | null;
  bonusValorParcela?: number | null;
  bonusIndiceCorrecaoPrestacao?: string | null;
  bonusTipoAtualizacaoMonetaria?: string | null;
}

/** Campos do diálogo "Adicionar obra" da seção de investimentos (INV-02). */
export interface AdicionarObraInvestimentosPayload {
  estimateId: string;
  dataInvestimentoInicial: string;
  tipo: string;
  vidaUtilFiscalMeses: number;
  descricao?: string;
  negociacaoOriginal?: boolean;
}

export async function adicionarObraRecursos(
  proposalId: string,
  payload: AdicionarObraRecursosPayload,
): Promise<FinancialResource[]> {
  const res = await fetch(rota(proposalId, 'financial-resources', 'adicionar-obra'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await falhar(res, 'Falha ao adicionar a obra');
  return (await res.json()) as FinancialResource[];
}

/**
 * ⚠️ **Sem `res.json()` no sucesso.** A rota de ação responde 200 com corpo
 * VAZIO (o `@ActionPost` fixa `HttpCode(200)`); parsear aqui faria uma remoção
 * bem-sucedida estourar e virar erro na tela.
 */
export async function removerObraRecursos(proposalId: string): Promise<void> {
  const res = await fetch(rota(proposalId, 'financial-resources', 'remover-obra'), {
    method: 'POST',
  });
  if (!res.ok) await falhar(res, 'Falha ao remover a obra');
}

export async function adicionarObraInvestimentos(
  proposalId: string,
  payload: AdicionarObraInvestimentosPayload,
): Promise<Investment[]> {
  const res = await fetch(rota(proposalId, 'investments', 'adicionar-obra'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await falhar(res, 'Falha ao adicionar a obra');
  return (await res.json()) as Investment[];
}

/** Ver a nota de {@link removerObraRecursos} — 200 com corpo vazio. */
export async function removerObraInvestimentos(proposalId: string): Promise<void> {
  const res = await fetch(rota(proposalId, 'investments', 'remover-obra'), { method: 'POST' });
  if (!res.ok) await falhar(res, 'Falha ao remover a obra');
}
