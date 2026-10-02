import type {
  ChecklistDoc,
  ChecklistResult,
  DocStatus,
  DocumentType,
  GrupoDocumentosDeOutraOrigem,
  OrigemDocumentoExterno,
  RepositoryDoc,
  SituacaoDocumento,
} from './types';
import { MotivoDaDispensaDeObrigatoriedade } from './types';
import { apiUrl } from '@/lib/base-path';

/**
 * Maps the backend `documents` module contract to the frontend checklist /
 * repository shapes. The two layers diverge heavily (the frontend was written
 * against the VBR-61 draft): backend items carry no `id`/`name`/`stage`, use
 * PT stage enums, and split parametrization/download into separate endpoints.
 * These mappers cover the READ (render) path so the screens stop crashing on
 * `docs.filter/.map` of an omitted array; mutation/upload/download wiring is a
 * separate follow-up (backend endpoints differ from the FE's assumptions).
 */

const STAGE_LABEL: Record<string, string> = {
  CALCULO_DA_ALCADA: 'Cálculo da alçada',
  ENVIO_PARA_ANALISE_SNEG: 'Envio para análise da SNEG',
  ANALISE_SNEG: 'Análise da SNEG',
  EMISSAO_DE_CONTRATO: 'Emissão de contrato',
  ANALISE_PREVIA_GARANTIA: 'Análise prévia (garantia)',
  CONFECCAO_DA_MINUTA_DE_GARANTIA: 'Confecção da minuta de garantia',
};

const NAO_OBRIGATORIO = 'Não obrigatório';

// Backend ChecklistItemStatus → FE DocStatus. `anexado` = doc linked, awaiting
// SNEG validation; `ok` = SNEG-validated (→ `validado`).
const STATUS_MAP: Record<string, DocStatus> = {
  anexado: 'anexado',
  ok: 'validado',
  pendente: 'pendente',
  vencido: 'vencido',
  repo: 'repo',
};

export interface BackendChecklistItem {
  category: string;
  type: string;
  stageLimit: string | null;
  required: boolean;
  single: boolean;
  selectable?: boolean;
  satisfiedExternally?: boolean;
  acceptedTypes: string[];
  status: string;
  repositoryDocumentId: string | null;
  fileName: string | null;
  /** ADO 67993 — validade do documento anexado; `null` = sem prazo. */
  expiresAt?: string | null;
  /**
   * ADO — 14/09/2026. A proposta que esta linha cobra, para os tipos exigidos
   * por proposta (hoje só a FAP de franquia). Opcionais aqui por compatibilidade
   * com fixtures e com o payload de uma instância anterior ao campo — ausentes,
   * a linha volta a ser a comum.
   */
  proposalId?: string | null;
  proposalCode?: string | null;
}

export interface BackendChecklistResponse {
  items: BackendChecklistItem[];
  completeness: { completed: number; total: number };
  /**
   * ADO · 02/09/2026 — documentos de garantia e FAP de franquia. Opcional aqui
   * por compatibilidade com fixtures anteriores ao campo; ausente ⇒ `[]`.
   */
  outrasOrigens?: BackendGrupoOutraOrigem[] | null;
  /** 23/09/2026 — cliente prospect. Opcional por compatibilidade; ausente ⇒ `null`. */
  obrigatoriedadeDispensada?: string | null;
}

/** Forma crua de um grupo de `outrasOrigens`. */
export interface BackendGrupoOutraOrigem {
  titulo: string;
  documentos: Array<{
    origem: string;
    documentoId: string;
    proposalId: string | null;
    tipo: string;
    fileName: string;
    anexadoEm: string | null;
  }> | null;
}

/**
 * As origens para as quais `downloadHrefDeOutraOrigem` sabe montar um destino.
 *
 * ⚠️ Uma origem NOVA no backend entra aqui **e** naquele `switch`, no mesmo
 * commit: só aqui, ela renderiza uma linha cujo link cai na rota do repositório
 * (404); só lá, ela é descartada antes de chegar à tela.
 */
const ORIGENS_CONHECIDAS: ReadonlySet<OrigemDocumentoExterno> = new Set([
  'GARANTIA',
  'FRANQUIA_FAP',
  'FRANQUIA_FOTOS',
  'OBRA_ANEXO_J',
  'CONTRATO_ASSINADO',
  'CONTRATO_CERTIFICADO',
  'FRANQUIA_COF',
]);

/**
 * Mapeia os grupos de documentos de outras origens.
 *
 * ⚠️ **Origem desconhecida é DESCARTADA**, e é a única coisa que este mapper
 * descarta. O front monta o link de download a partir da origem; um valor que
 * ele não conhece renderizaria uma linha sem destino — pior que não mostrá-la,
 * porque parece um arquivo clicável que não abre. Grupo que fica vazio some.
 */
function mapOutrasOrigens(
  b: BackendGrupoOutraOrigem[] | null | undefined,
): GrupoDocumentosDeOutraOrigem[] {
  if (!Array.isArray(b)) return [];
  return b
    .map((g) => ({
      titulo: g.titulo,
      documentos: (Array.isArray(g.documentos) ? g.documentos : [])
        .filter((d): d is (typeof d) & { origem: OrigemDocumentoExterno } =>
          ORIGENS_CONHECIDAS.has(d.origem as OrigemDocumentoExterno),
        )
        .map((d) => ({
          origem: d.origem,
          documentoId: d.documentoId,
          proposalId: d.proposalId ?? null,
          tipo: d.tipo,
          fileName: d.fileName,
          anexadoEm: d.anexadoEm ?? null,
        })),
    }))
    .filter((g) => g.documentos.length > 0);
}

/**
 * O rótulo pt-BR da etapa-limite — `null` significa "não obrigatório".
 *
 * ⚠️ **Exportada** desde 08/09/2026, para a aba Governança → Documentos usar a
 * MESMA tradução do checklist. Uma segunda cópia do mapa divergiria na primeira
 * etapa nova, e aí o mesmo `stage_limit` leria diferente nas duas telas.
 *
 * Etapa fora do catálogo cai no valor CRU, nunca num genérico: o gap fica
 * visível (mesma convenção do `origemDisplay` da pendência).
 */
export function stageLabel(stageLimit: string | null): string {
  return stageLimit ? (STAGE_LABEL[stageLimit] ?? stageLimit) : NAO_OBRIGATORIO;
}

/**
 * Maps a single backend checklist item (returned by POST or looked up inside
 * the full GET response) to the frontend {@link ChecklistDoc} shape.
 *
 * @param it      - The raw backend item.
 * @param reused  - Pass `true` when the item was linked via reuse (HU-17.1)
 *                  so the UI can show "Desfazer" instead of "Excluir".
 */
export function mapChecklistItem(
  it: BackendChecklistItem,
  opportunityId: string,
  reused = false,
): ChecklistDoc {
  return {
    /*
     * Linha de PROPOSTA ganha um terceiro segmento e nunca cai no
     * `repositoryDocumentId` — o arquivo dela não vive no hub (ADO — 14/09/2026).
     *
     * Sem ele, duas linhas `FAP BR Mania` da mesma oportunidade teriam `id`
     * idêntico: chave duplicada no React e `busyDocId` marcando as duas irmãs a
     * cada clique. É também o que a BFF lê para saber a qual proposta mandar o
     * anexo.
     */
    id: it.proposalId
      ? `${it.category}::${it.type}::${it.proposalId}`
      : (it.repositoryDocumentId ?? `${it.category}::${it.type}`),
    // Distinto do `id` acima de propósito: só este responde "existe documento?".
    repositoryDocumentId: it.repositoryDocumentId,
    // `?? null` cobre o skew de deploy: payload de uma instância anterior não
    // tem os campos, e a linha volta a ser a comum — o estado anterior.
    proposalId: it.proposalId ?? null,
    proposalCode: it.proposalCode ?? null,
    name: it.type,
    category: it.category,
    stage: stageLabel(it.stageLimit),
    // Raw stage enum (null when não obrigatório) — kept for logic (e.g. the
    // Gate 1 completude scope), while `stage` holds the pt-BR display label.
    stageLimit: it.stageLimit,
    // Same-origin BFF download URL — only when a real document is attached.
    downloadUrl: it.repositoryDocumentId
      ? apiUrl('opportunities', opportunityId, 'documents', it.repositoryDocumentId, 'download')
      : null,
    acceptedTypes: (it.acceptedTypes ?? []).join(', '),
    status: STATUS_MAP[it.status] ?? 'pendente',
    required: it.required,
    // `?? true` porque a coluna nasceu com default `true` (VBR-645): um payload
    // servido por uma instância anterior à migration não pode fazer a tela
    // esconder "Anexar" de todo tipo.
    selectable: it.selectable ?? true,
    // `?? false`: sem o campo, ninguém afirmou entrega externa nenhuma.
    satisfiedExternally: it.satisfiedExternally ?? false,
    single: it.single,
    /*
     * ADO 67993 — a validade do documento anexado. É o que torna a etiqueta
     * `Vencido` LEGÍVEL: sem a data ao lado, a linha vermelha não diz desde
     * quando o documento deixou de valer.
     *
     * `?? null` cobre o skew de deploy e a linha sem arquivo; ausência é "sem
     * prazo declarado", nunca "vencido".
     */
    expiresAt: it.expiresAt ?? null,
    ...(reused ? { reused: true } : {}),
  };
}

export function mapChecklist(
  b: BackendChecklistResponse,
  opportunityId: string,
  header: { code?: string; name?: string; state?: string } = {},
): ChecklistResult {
  const docs: ChecklistDoc[] = (b.items ?? []).map((it) =>
    mapChecklistItem(it, opportunityId),
  );

  // Ordered, de-duplicated stage names for the filter chips. "Não obrigatório"
  // is the null-stage bucket, not a BPM stage — it is excluded from the chips
  // (those docs still show under "Todas").
  const stages = Array.from(new Set(docs.map((d) => d.stage))).filter(
    (s) => s !== NAO_OBRIGATORIO,
  );

  return {
    opportunityId,
    // The backend checklist response carries no opportunity header; it is
    // resolved (best-effort) from the opportunity detail by the BFF.
    opportunityCode: header.code ?? '',
    opportunityName: header.name ?? '',
    opportunityState: header.state ?? '',
    docs,
    stages,
    outrasOrigens: mapOutrasOrigens(b.outrasOrigens),
    obrigatoriedadeDispensada: mapObrigatoriedadeDispensada(b.obrigatoriedadeDispensada),
  };
}

/**
 * Valor desconhecido (skew de deploy) ⇒ `null`: a tela não afirma uma dispensa
 * que não sabe nomear — e as linhas já trazem o `required` do backend.
 */
function mapObrigatoriedadeDispensada(
  value: string | null | undefined,
): MotivoDaDispensaDeObrigatoriedade | null {
  return value === MotivoDaDispensaDeObrigatoriedade.ClienteProspect ? value : null;
}

interface BackendRepositoryDocument {
  id: string;
  category: string;
  type: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  expiresAt: string | null;
  /** ADO 68083 — `REPOSITORIO` | `OPORTUNIDADE`. Ausente em build anterior. */
  origem?: string | null;
  opportunityId?: string | null;
  opportunityCode?: string | null;
  /**
   * ADO 67993 — `VENCIDO | VALIDADO | ANEXADO | NO_REPOSITORIO`. Ausente em
   * build anterior a esta entrega.
   */
  situacao?: string | null;
}

export interface BackendRepositoryList {
  items: BackendRepositoryDocument[];
  total: number;
}

/**
 * Maps one backend repository document to the FE {@link RepositoryDoc}.
 * `downloadUrl` points at the same-origin BFF download proxy (kept relative so
 * the httpOnly cookie is sent); `acceptedTypes` is derived from the mime type.
 */
export function mapRepositoryDoc(
  clientId: string,
  d: BackendRepositoryDocument,
): RepositoryDoc {
  /*
   * ADO 68083 — a procedência decide o que a tela pode oferecer.
   *
   * ⚠️ Só `OPORTUNIDADE` recorta. Qualquer outro valor — inclusive o campo
   * AUSENTE, que é o que um backend anterior a esta entrega devolve — cai em
   * "do repositório", que é o comportamento de sempre: um skew de deploy não
   * pode tirar do usuário o "Excluir" de um documento que é dele.
   */
  const daOportunidade = d.origem === 'OPORTUNIDADE';

  return {
    id: d.id,
    name: d.type,
    category: d.category,
    acceptedTypes: d.mimeType,
    uploadedAt: d.uploadedAt,
    fileName: d.fileName,
    origem: daOportunidade ? 'oportunidade' : 'repositorio',
    opportunityCode: daOportunidade ? (d.opportunityCode ?? null) : null,
    /*
     * ADO 67993 — a SITUAÇÃO, que o TC UAT-032 pede ao lado do tipo e da
     * validade. Campo do backend, nunca derivado aqui: derivar `Vencido`
     * comparando `expiresAt` com o relógio do BROWSER faria a mesma linha ler
     * diferente em duas máquinas com fuso ou data destoando.
     *
     * ⚠️ Valor desconhecido (ou ausente — o skew de deploy) degrada para
     * `null`, e a tela não pinta pill de situação nenhuma: um vizinho plausível
     * afirmaria um estado que ninguém apurou.
     */
    situacao: narrowSituacao(d.situacao),
    expiresAt: d.expiresAt ?? null,
    downloadUrl: apiUrl('clients', clientId, 'repository', d.id, 'download'),
  };
}

/** Vocabulário fechado — o desconhecido vira `null`, nunca um vizinho. */
function narrowSituacao(raw: string | null | undefined): SituacaoDocumento | null {
  switch (raw) {
    case 'VENCIDO':
      return 'vencido';
    case 'VALIDADO':
      return 'validado';
    case 'ANEXADO':
      return 'anexado';
    case 'NO_REPOSITORIO':
      return 'no_repositorio';
    default:
      return null;
  }
}

export interface BackendParametrizationItem {
  category: string;
  type: string;
  acceptedTypes: string[];
  /**
   * Linha aposentada (`false`) — mantida para o histórico, fora do picker.
   *
   * Opcional porque o backend a introduziu depois (migration `…103`); ausente
   * lê como `true`, senão um skew de deploy esvaziaria o seletor inteiro.
   */
  selectable?: boolean;
}

/** Maps a document-parametrization entry to the FE {@link DocumentType} (upload picker). */
export function mapDocumentType(p: BackendParametrizationItem): DocumentType {
  return {
    id: `${p.category}::${p.type}`,
    name: p.type,
    category: p.category,
    acceptedTypes: (p.acceptedTypes ?? []).join(', '),
  };
}
