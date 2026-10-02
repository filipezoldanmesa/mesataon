/**
 * Status of a checklist document in an opportunity.
 * - validado: file attached and accepted
 * - pendente: awaiting attachment
 * - vencido:  expired / needs re-attachment
 * - repo:     available in the client repository, can be reused without upload
 */
export type DocStatus = 'anexado' | 'validado' | 'pendente' | 'vencido' | 'repo';

/** A single checklist item for an opportunity. */
export interface ChecklistDoc {
  /**
   * Stable server-side identifier of the checklist ROW.
   *
   * É o `repositoryDocumentId` quando há arquivo anexado e a chave sintética
   * `<category>::<type>` quando não há. Para decidir se existe documento, use
   * {@link ChecklistDoc.repositoryDocumentId} — nunca este campo.
   *
   * ⚠️ Linha de PROPOSTA acrescenta um terceiro segmento
   * (`<category>::<type>::<proposalId>`) e **nunca** cai no
   * `repositoryDocumentId`: o arquivo dela não vive no hub. Sem o terceiro
   * segmento, duas linhas `FAP BR Mania` da mesma oportunidade teriam o mesmo
   * `id` — chave duplicada no React e, pior, `busyDocId` marcando as duas ao
   * mesmo tempo.
   */
  id: string;
  /**
   * Id do documento no repositório do cliente, ou `null` quando a linha ainda
   * não tem arquivo. É o que as ações de documento (remover, conferir, exibir)
   * endereçam no backend; `id` pode ser uma chave sintética (VBR-583).
   */
  repositoryDocumentId: string | null;
  /** Display name (e.g. "Cartão CNPJ"). */
  name: string;
  /** Category grouping (e.g. "Cliente (PJ)"). */
  category: string;
  /**
   * Stage deadline label (e.g. "Cálculo da alçada") or "Não obrigatório"
   * when there is no hard deadline.
   */
  stage: string;
  /**
   * Raw backend stage enum (e.g. "CALCULO_DA_ALCADA") or null when não
   * obrigatório. Used for stage logic (e.g. the Gate 1 completude scope);
   * `stage` above is the pt-BR display label derived from it.
   */
  stageLimit: string | null;
  /**
   * Same-origin BFF URL to view/download the attached file ("Exibir"); null
   * when no document is attached yet (pendente / não obrigatório sem arquivo).
   */
  downloadUrl: string | null;
  /** Comma-separated accepted MIME/extension labels (e.g. "pdf, png, jpeg"). */
  acceptedTypes: string;
  status: DocStatus;
  /** Whether this doc is required to close the stage. */
  required: boolean;
  /**
   * When true, only one file is allowed in this category (HU-18.2).
   * A second attachment attempt must be blocked with an orientation message.
   */
  single: boolean;
  /**
   * Whether the type still accepts NEW attachments (VBR-645).
   *
   * `false` = row kept only so already-attached documents stay readable (the
   * legacy `FAP BR Mania` entry). The row is still rendered; what disappears are
   * the "Anexar"/dropzone affordances — the backend refuses those anyway, so
   * offering them was inviting an action it forbids.
   */
  selectable: boolean;
  /**
   * The requirement was met OUTSIDE the document hub (VBR-642) — today the
   * photos uploaded through the proposal's dropzone (`station_photos`).
   *
   * There is no file here to delete or replace, so the row must not offer file
   * management; it explains where the evidence lives instead.
   */
  satisfiedExternally: boolean;
  /**
   * Data de validade do documento anexado (ISO-8601), ou `null` quando não há
   * arquivo ou nenhum prazo foi declarado (ADO 67993).
   *
   * É o que torna a etiqueta `vencido` legível: sem a data, a linha vermelha
   * não diz desde quando o documento deixou de valer. Informada no upload pelo
   * repositório do cliente.
   */
  expiresAt: string | null;
  /**
   * A proposta que ESTA linha cobra, quando o tipo é exigido por proposta e não
   * uma vez por oportunidade (ADO — 14/09/2026).
   *
   * Hoje só a FAP de franquia: a exigência é por ponto (RN-F4-02) e o GATE 1 a
   * cobra proposta a proposta, então duas propostas BR Mania rendem DUAS linhas
   * `FAP BR Mania` — o defeito relatado era ver uma só.
   *
   * `null` em toda linha comum, que é a maioria. Presente, ele muda para onde o
   * anexo vai: o arquivo mora no store da proposta, e o hub recusa recebê-lo.
   */
  proposalId: string | null;
  /**
   * Código legível da proposta desta linha (`PCR-GOP-00000032/2026`).
   *
   * É o que distingue as irmãs na tela — sem ele, duas linhas `FAP BR Mania`
   * seriam byte a byte idênticas. `null` quando não há proposta **ou** quando a
   * proposta ainda não tem código; os dois casos se separam por
   * {@link ChecklistDoc.proposalId}.
   */
  proposalCode: string | null;
  /**
   * Set when the doc was linked from the repository without a new upload
   * (HU-17.1). Used to show "Desfazer" instead of "Excluir".
   */
  reused?: boolean;
  /** Marks docs that are out of the current scope (visual indicator only). */
  outOfScope?: boolean;
}

/** Full checklist payload for an opportunity (returned by the API). */
export interface ChecklistResult {
  opportunityId: string;
  /** Formatted code shown in the header (e.g. "OPP-0428"). */
  opportunityCode: string;
  /** Human-readable name of the counterpart / posto (e.g. "Posto Vibra Centro-SP"). */
  opportunityName: string;
  /**
   * Current opportunity phase (backend `OpportunityState`, e.g.
   * "EM_PREENCHIMENTO"). Drives the phase-scoped completude: each phase makes a
   * cumulative set of document stages due. Empty string when unresolved.
   */
  opportunityState: string;
  docs: ChecklistDoc[];
  /**
   * Ordered list of stage names used to populate the filter chips.
   * Does not include "Todas" — that is added by the UI.
   */
  stages: string[];
  /**
   * Documentos que EXISTEM nesta oportunidade e foram anexados por OUTRA tela —
   * garantia e FAP de franquia (ADO · 02/09/2026).
   *
   * Lista paralela ao checklist: somente leitura, nenhuma linha volta a ser
   * exigida e o contador de completude não se move. Vazia quando não há nenhum
   * (ou quando a leitura degradou no backend, que devolve `[]` por eixo).
   */
  outrasOrigens: GrupoDocumentosDeOutraOrigem[];
  /**
   * Por que NENHUM documento desta oportunidade é obrigatório, quando é esse o
   * caso (23/09/2026) — veredito do backend. Hoje só `CLIENTE_PROSPECT`: conta
   * do Salesforce ainda sem Código SAP (ADR-0055). `null` ⇒ vale o catálogo.
   */
  obrigatoriedadeDispensada: MotivoDaDispensaDeObrigatoriedade | null;
}

export const MotivoDaDispensaDeObrigatoriedade = {
  ClienteProspect: 'CLIENTE_PROSPECT',
} as const;
export type MotivoDaDispensaDeObrigatoriedade =
  (typeof MotivoDaDispensaDeObrigatoriedade)[keyof typeof MotivoDaDispensaDeObrigatoriedade];

/** De onde o documento veio — decide como o front monta o link de download. */
export type OrigemDocumentoExterno =
  | 'GARANTIA'
  | 'FRANQUIA_FAP'
  | 'FRANQUIA_FOTOS'
  /**
   * A **COF** (Circular de Oferta de Franquia) entregue àquela franquia — o PDF
   * cadastrado na Governança por bandeira, cuja versão é congelada no GATE 1
   * (17/09/2026).
   *
   * Documento de CONSULTA, como o Anexo J: ninguém anexa e ninguém substitui
   * pela aba Documentos. Quem o publica é a Governança.
   */
  | 'FRANQUIA_COF'
  /**
   * O **Anexo J** da obra — orçamento do Converge. Documento de CONSULTA: ele
   * deixou de ser minuta em 14/09/2026, quando se descobriu que ia assinado no
   * envelope do DocuSign.
   */
  | 'OBRA_ANEXO_J'
  /**
   * O **contrato assinado** — o PDF que o DocuSign devolve depois que todas as
   * partes assinaram, arquivado por contrato (15/09/2026).
   *
   * ⚠️ O Termo de Cessão aparece duas vezes quando houve o pacote da empresa
   * homologada: são duas assinaturas, em dois momentos, sobre documentos
   * diferentes. O rótulo do grupo diz qual é qual.
   */
  | 'CONTRATO_ASSINADO'
  /**
   * O **Certificado de Conclusão** do DocuSign — quem assinou, quando e de que
   * IP. Origem própria porque a rota é a do ENVELOPE, não a do contrato.
   */
  | 'CONTRATO_CERTIFICADO';

/** Um documento anexado fora do hub, com o que a tela precisa para baixá-lo. */
export interface DocumentoDeOutraOrigem {
  origem: OrigemDocumentoExterno;
  /**
   * Id do documento na rota da SUA origem — repositório da oportunidade × FAP
   * da proposta × foto do ponto da proposta.
   */
  documentoId: string;
  /**
   * As origens de FRANQUIA usam este campo para MONTAR a rota (FAP e fotos do
   * ponto são escopadas pela proposta); `OBRA_ANEXO_J` e `CONTRATO_ASSINADO` o
   * trazem apenas como procedência — as rotas deles são escopadas pela
   * oportunidade, e por isso os dois são resolvidos ANTES da guarda de
   * `proposalId` em `downloadHrefDeOutraOrigem`.
   */
  proposalId: string | null;
  tipo: string;
  fileName: string;
  /** ISO, ou `null` quando o backend não soube dizer. */
  anexadoEm: string | null;
}

/** Um bloco da lista: o rótulo da origem (composto no backend) e seus arquivos. */
export interface GrupoDocumentosDeOutraOrigem {
  titulo: string;
  documentos: DocumentoDeOutraOrigem[];
}

/** Thrown when an opportunity id has no checklist on the server. */
export class ChecklistNotFoundError extends Error {
  constructor(readonly opportunityId: string) {
    super(`Checklist não encontrado para oportunidade: ${opportunityId}`);
    this.name = 'ChecklistNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// F9 — Global client repository (tela 13a / 13b)
// ---------------------------------------------------------------------------

/**
 * A document stored in the client's global repository (shared across all
 * proposals). Carries the signed URL for download/view.
 */
/**
 * Situação de um documento no repositório do cliente (ADO 67993).
 *
 * `pendente` NÃO é membro, e a ausência é honesta: ali ele significa "exigência
 * do checklist sem arquivo nenhum", e toda linha do repositório tem arquivo por
 * construção. Quem exibe "Pendente" é a aba Documentos da oportunidade.
 */
export type SituacaoDocumento =
  | 'vencido'
  | 'validado'
  | 'anexado'
  | 'no_repositorio';

export interface RepositoryDoc {
  /** Stable server-side identifier. */
  id: string;
  /** Human-readable document type name (e.g. "Cartão CNPJ"). */
  name: string;
  /** Category grouping (e.g. "Cliente (PJ)") — used for filter chips. */
  category: string;
  /** Comma-separated accepted MIME/extension labels (e.g. "pdf, png, jpeg"). */
  acceptedTypes: string;
  /** ISO-8601 date string of when the document was uploaded. */
  uploadedAt: string;
  /** Original filename (e.g. "cnpj-2026.pdf"). */
  fileName: string;
  /**
   * De onde o documento veio (ADO 68083).
   *
   * `'repositorio'` — enviado direto aqui; `'oportunidade'` — anexado no
   * checklist de uma oportunidade deste cliente. O segundo tem vínculo com o
   * checklist de lá, então a tela do cliente o mostra em LEITURA: excluí-lo ou
   * substituí-lo daqui quebraria aquele checklist, e a API o recusa (404).
   */
  origem: 'repositorio' | 'oportunidade';
  /**
   * Situação do documento (ADO 67993) — o "status" que o TC UAT-032 pede ao
   * lado do tipo e da validade.
   *
   * Vocabulário do CHECKLIST, para o mesmo documento não ler diferente em duas
   * telas. ⚠️ Campo SEPARADO de {@link RepositoryDoc.origem}, nunca um
   * substituto: aquele diz de ONDE o documento veio e governa o que a tela pode
   * oferecer; este diz em que pé ele está.
   *
   * `null` = o backend não informou (skew de deploy) ou mandou valor fora do
   * vocabulário — a tela não pinta pill de situação nenhuma, em vez de afirmar
   * um estado que ninguém apurou.
   */
  situacao: SituacaoDocumento | null;
  /**
   * Data de validade (ISO-8601) ou `null` quando não há prazo declarado —
   * que **não** é o mesmo que vencida.
   */
  expiresAt: string | null;
  /**
   * Código da oportunidade de origem, para a linha dizer de onde ela veio.
   * `null` quando `origem === 'repositorio'` — e também quando a oportunidade
   * ainda não tem código, caso em que a tela nomeia a origem sem inventar um.
   */
  opportunityCode: string | null;
  /**
   * Pre-signed download/view URL. Time-limited on the real backend; the mock
   * uses a stable placeholder.
   */
  downloadUrl: string;
}

/**
 * An available document type offered in the upload modal select.
 * The `acceptedTypes` drives client-side file-type validation.
 */
export interface DocumentType {
  id: string;
  name: string;
  category: string;
  /** Comma-separated accepted extensions (e.g. "pdf, png, jpeg"). */
  acceptedTypes: string;
}

/** Full repository payload for a single client (GET /v1/customers/:id/repository). */
export interface RepositoryResult {
  clientId: string;
  /** Client display name — shown in the page subtitle. */
  clientName: string;
  docs: RepositoryDoc[];
  /** Ordered list of available document types for the upload modal. */
  documentTypes: DocumentType[];
}

/** Thrown when a client ID is not found in the repository endpoint. */
export class RepositoryNotFoundError extends Error {
  constructor(readonly clientId: string) {
    super(`Repositório não encontrado para o cliente: ${clientId}`);
    this.name = 'RepositoryNotFoundError';
  }
}
