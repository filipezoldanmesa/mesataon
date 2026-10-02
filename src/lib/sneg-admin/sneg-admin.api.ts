import type { EtapaDistribuicao } from '@/lib/governanca/distribuicao.types';
import { throwApiError } from '@/lib/api-errors';
import { apiUrl, withBasePath } from '@/lib/base-path';

import type {
  BpPadrao,
  BpPadraoList,
  BpPadraoPayload,
  BpPadraoUpdatePayload,
  CamposObrigatoriosResult,
  Distribuicao,
  TipoPropostaSneg,
} from './sneg-admin.types';
import { BpPadraoConflictError } from './sneg-admin.types';

/** BFF client for the SNEG parametrization admin (VBR-289). */

async function ensureOk(res: Response, action: string): Promise<Response> {
  if (!res.ok) await throwApiError(res, action);
  return res;
}

// ── Campos obrigatórios (RN-F1-03) ─────────────────────────────────────────

export async function getCamposObrigatorios(
  tipoProposta: TipoPropostaSneg,
): Promise<CamposObrigatoriosResult> {
  const res = await fetch(
    `${apiUrl('sneg', 'campos-obrigatorios')}?${new URLSearchParams({ tipoProposta }).toString()}`,
  );
  await ensureOk(res, 'Falha ao carregar os campos obrigatórios');
  return (await res.json()) as CamposObrigatoriosResult;
}

export async function putCamposObrigatorios(
  tipoProposta: TipoPropostaSneg,
  campos: string[],
): Promise<CamposObrigatoriosResult> {
  const res = await fetch(
    apiUrl('sneg', 'campos-obrigatorios', tipoProposta),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campos }),
    },
  );
  await ensureOk(res, 'Falha ao salvar os campos obrigatórios');
  return (await res.json()) as CamposObrigatoriosResult;
}

/*
 * ── Distribuição gerência → analista (RN-F1-01) ────────────────────────────
 *
 * ⚠️ Sobrou o `upsert`, e o consumidor dele é a aba **Governança → Distribuição
 * SNEG** — o bloco da tela `/sneg/parametrizacao` saiu em 21/09/2026 (*"essa
 * distribuição é realizada pela seção Distribuição SNEG"*). `listDistribuicoes`
 * e `deleteDistribuicao` saíram junto: eram os únicos chamadores daquele bloco,
 * e cliente sem consumidor é o próximo a reaparecer como "bloco que sumiu da
 * tela". O backend segue publicando `GET /v1/sneg/distribuicao` e a remoção
 * (`DELETE` + o par `POST …:remover`, `@Roles(ADMIN)`) — a aba nunca teve
 * "Remover", então desparametrizar uma gerência é, hoje, só por API.
 */

/**
 * ⚠️ `etapa` é OBRIGATÓRIA no backend desde o ADO 67909 — a tabela ganhou quatro
 * baldes (Análise, Minutas, Cadastro, Hipoteca) e escolher um por omissão
 * decidiria quem analisa por acidente.
 */
export async function upsertDistribuicao(
  gerencia: string,
  analistaId: string,
  etapa: EtapaDistribuicao,
): Promise<Distribuicao> {
  const res = await fetch(
    withBasePath(`/api/sneg/distribuicao/${encodeURIComponent(gerencia)}`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analistaId, etapa }),
    },
  );
  await ensureOk(res, 'Falha ao salvar a distribuição');
  return (await res.json()) as Distribuicao;
}

// ── Padrões de BP (RN-F4-01) ───────────────────────────────────────────────

export async function listBpPadroes(): Promise<BpPadraoList> {
  const res = await fetch(withBasePath('/api/sneg/padroes-bp'));
  await ensureOk(res, 'Falha ao carregar os padrões de BP');
  return (await res.json()) as BpPadraoList;
}

export async function createBpPadrao(payload: BpPadraoPayload): Promise<BpPadrao> {
  const res = await fetch(withBasePath('/api/sneg/padroes-bp'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Chaves explícitas, não `JSON.stringify(payload)`: a API roda com
    // `forbidNonWhitelisted`, então qualquer propriedade a mais vira 400. O
    // tipo sozinho não impede um objeto mais largo de chegar aqui (width
    // subtyping), a montagem explícita impede.
    body: JSON.stringify({
      negocio: payload.negocio,
      metaPercentualAntecipacao: payload.metaPercentualAntecipacao,
      metaPercentualPostecipacao: payload.metaPercentualPostecipacao,
      metaCustoVinculacaoUnitario: payload.metaCustoVinculacaoUnitario,
    }),
  });
  if (res.status === 409) throw new BpPadraoConflictError();
  await ensureOk(res, 'Falha ao criar o padrão de BP');
  return (await res.json()) as BpPadrao;
}

/**
 * ⚠️ Takes `BpPadraoUpdatePayload` (the three metas), **not** `BpPadraoPayload`:
 * `UpdateBpPadraoDto` has no `negocio`, and the API rejects unknown fields with
 * a 400 (ADO 67952).
 */
export async function updateBpPadrao(
  id: string,
  payload: BpPadraoUpdatePayload,
): Promise<BpPadrao> {
  const res = await fetch(
    withBasePath(`/api/sneg/padroes-bp/${encodeURIComponent(id)}`),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      // Só as três metas, montadas à mão pela mesma razão do `create` — e aqui
      // é o caminho que de fato quebrou: `negocio` no corpo é 400 (ADO 67952).
      body: JSON.stringify({
        metaPercentualAntecipacao: payload.metaPercentualAntecipacao,
        metaPercentualPostecipacao: payload.metaPercentualPostecipacao,
        metaCustoVinculacaoUnitario: payload.metaCustoVinculacaoUnitario,
      }),
    },
  );
  if (res.status === 409) throw new BpPadraoConflictError();
  await ensureOk(res, 'Falha ao atualizar o padrão de BP');
  return (await res.json()) as BpPadrao;
}

/**
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: `501 Unsupported Request` em
 * qualquer path, sem consultar o origin (ADO 67557/67796). A rota BFF continua
 * aceitando `DELETE` com a mesma implementação, para quem chamar de um ambiente
 * sem o edge no caminho.
 */
export async function deleteBpPadrao(id: string): Promise<void> {
  const res = await fetch(
    withBasePath(`/api/sneg/padroes-bp/${encodeURIComponent(id)}`),
    { method: 'POST' },
  );
  await ensureOk(res, 'Falha ao remover o padrão de BP');
}
