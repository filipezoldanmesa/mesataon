import type { DdiRiskLevel } from '@/lib/opportunities/ddi.types';

export type ClientKind = 'cadastrado' | 'prospect';

/** Tab key for the portfolio listing filter (matches backend filter param). */
export type PortfolioTab = 'todos' | ClientKind | 'fluxo' | 'franquia';

/** Valid sort-column keys for the portfolio listing (compile-time guard). */
export type SortableColumn = 'name' | 'flag' | 'location' | 'inFlowOpportunity' | 'docsCount';

/** Row shape for the client list (journey J1 — client search). */
export interface ClientSummary {
  id: string; // SAP code doubles as the route id
  sapCode: string;
  name: string;
  document: string; // CNPJ/CPF (or "CNPJ pendente" for prospects)
  kind: ClientKind;
  /** Empresa group code + name (e.g. "4981 · Grupo JAL"). */
  empresaGroup?: string;
  /**
   * `null`/absent unless this row IS a franchise linked to a posto
   * (`Account.Posto__c`, Bug 67504) — in which case it names the posto so the
   * listing can mark the row instead of showing it as an unrelated client
   * (decision: mark, don't hide — a franchise has its own SAP code and can
   * have its own opportunity).
   */
  franchiseOf?: { sapCode: string; legalName: string } | null;
  flag: string; // bandeira
  /**
   * Why {@link flag} is empty, when it is — `null`/absent means either the flag
   * resolved or the backend does not report gaps yet.
   *
   * `label` is the short cell text ("Sem registro na ANP" / "ANP indisponível");
   * `title` is the backend's full sentence, shown on hover. Without this the
   * column rendered one "—" for three different answers — posto outside the ANP
   * registry, ANP unreachable, client with no CNPJ — which is what made a stage
   * outage indistinguishable from a portfolio of non-resellers (VBR-539).
   */
  flagGap?: { label: string; title: string } | null;
  location: string;
  /**
   * Risco DDI já calculado para o cliente — a pílula do cabeçalho da 360º
   * (TC 68060). `null` significa que nenhuma oportunidade dele produziu
   * classificação (ou que nunca houve oportunidade): a tela simplesmente não
   * renderiza a pílula, e **nada aqui pede um cálculo novo**.
   *
   * É o MESMO vocabulário da tela da oportunidade ({@link DdiRiskLevel}), não um
   * paralelo: era `'Baixo' | 'Médio' | 'Alto'` — rótulo disfarçado de valor de
   * máquina —, e com duas tabelas a mesma análise podia ler diferente em duas
   * telas. Quem traduz (e escolhe a cor) é `DDI_RISK_PILL`, um mapa só.
   *
   * ⚠️ A LISTAGEM não preenche este campo (`/clientes` mantém `null`): exibi-lo
   * ali exigiria uma leitura de risco por linha, e o pedido do negócio é
   * explícito em não fazer isso.
   */
  risk: DdiRiskLevel | null;
  /**
   * Volume médio mensal in m³/mês. Source: Salesforce `Account.VMM__c`
   * (Bug 67505 — previously fabricated by the ERP adapter from the SAP code).
   * `null` means no VMM on record; see `vmmGap` for the named reason.
   */
  vmm?: number | null;
  /**
   * Why {@link vmm} is absent, when it is. Mirrors the {@link flagGap} pattern:
   * `SEM_REGISTRO` = Salesforce answered "no VMM" (business fact, nothing to do);
   * `INDISPONIVEL` = Salesforce did not respond (call support).
   * `null`/absent means either the VMM resolved or the backend does not report
   * gaps yet.
   */
  vmmGap?: { label: string; title: string } | null;
  /**
   * Vigência do contrato de FORNECIMENTO, já formatada
   * (`"03/2022 → 09/2026"`, ou `"03/2022 → indeterminado"` quando o contrato
   * não tem prazo).
   *
   * Fonte: `Contract` do Salesforce — o espelho do SAP —, resolvido na leitura
   * da carteira. Até 09/09/2026 vinha de `ErpProvider` (SAP via MuleSoft),
   * canal nunca contratado (VBR-98), e por isso chegava **vazia em 100% das
   * linhas**. `null` = este cliente não tem contrato de fornecimento vigente;
   * ver {@link vigenciaGap} para o motivo nomeado.
   */
  vigencia?: string | null;
  /**
   * Por que {@link vigencia} está vazia, quando está. Mesmo padrão de
   * {@link flagGap} e {@link vmmGap}: `SEM_REGISTRO` = o Salesforce respondeu e
   * a conta não tem contrato de fornecimento ativo e vigente (fato de negócio,
   * e o caso majoritário).
   *
   * `null`/ausente ⇒ a vigência resolveu, ou a linha é um prospect (sem Código
   * SAP não há contrato a procurar — "não se aplica", não lacuna).
   */
  vigenciaGap?: { label: string; title: string } | null;
  /** Active opportunity in-flow label (e.g. "OPP-0428 · Em preenchimento"); null if none. */
  inFlowOpportunity?: string | null;
  /** Total number of documents the client has in the repository. */
  docsCount: number;
}

/** A single field of the 360º view. */
export interface DetailField {
  label: string;
  value: string;
  /**
   * `true` when this field's value is NOT data — it is the sentence naming the
   * source that has not arrived yet ("Aguardando integração Tableau", "ARP
   * indisponível"). The value renders visually subordinated so it cannot be read
   * as a real answer (VBR-493 CA-1).
   *
   * Per FIELD, not per section, because a card mixes the two: a company group
   * card states "Não vinculado a grupo empresa" — a known fact — beside six
   * measures that Tableau and the ARP still owe. Fading the whole card would
   * subordinate the fact; fading nothing would promote the gaps to data.
   */
  pending?: boolean;
  /**
   * Texto de ajuda do campo, exibido num ⓘ ao lado do rótulo.
   *
   * Existe para o "Status Mapa da Rede" (09/09/2026), cujo valor não se explica
   * sozinho: `Ativo`/`Inativo` ali significam "consumiu / não consumiu no
   * último mês", não "no mapa / fora do mapa" — e é o help text que o mesmo
   * usuário lê no Salesforce, reproduzido verbatim.
   */
  hint?: string;
  /** @deprecated No longer used — data renders unmasked everywhere. */
  sensitive?: boolean;
}

export interface TableColumn {
  key: string;
  label: string;
}

/**
 * A table nested inside a fields section, revealed by a toggle button
 * (prototype's "+ Ver integrantes do grupo"). The rows are backed data — only
 * the reveal interaction is deferred.
 */
export interface ExpandableTable {
  toggleLabel: string;
  /** Label shown on the collapse button; defaults to '− Ocultar integrantes' when omitted. */
  closeLabel?: string;
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
  /**
   * Frase sob a tabela quando as linhas NÃO são o conjunto inteiro (ADO 68082).
   *
   * Sem ela o leitor conclui que o conjunto acabou na última linha — e nesta
   * tela o conjunto é o grupo econômico, cuja contagem alimenta decisão de
   * crédito. Composta por quem monta a tabela.
   */
  note?: string;
}

export interface FieldsSection {
  key: string;
  title: string;
  kind: 'fields';
  fields: DetailField[];
  /** When present, a toggle reveals this table below the fields. */
  expandable?: ExpandableTable;
  /**
   * Sentence explaining a body that carries no data — the gap's own wording,
   * composed in the backend. It is what lets a card with `fields: []` still say
   * something: "Dados bancários" has no field to hang a gap off when the client
   * is not a supplier, so the sentence IS the content.
   *
   * @see {@link TableSection.note} — same element, same placement.
   */
  note?: string;
  /**
   * When `true` the body of this section is NOT data — the integration is not
   * contracted (`NAO_CONTRATADA`), the source did not answer (`INDISPONIVEL`),
   * or it answered that it has no record of this subject (`SEM_REGISTRO`). The
   * whole card renders at reduced opacity so it reads as an explanation rather
   * than as an answer; any field that DID resolve opts back out via
   * `RESOLVED_VALUE_CLASS`.
   */
  pending?: boolean;
}

export interface TableSection {
  key: string;
  title: string;
  kind: 'table';
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
  note?: string;
  /**
   * Frase exibida quando `rows` está vazio, no lugar do cabeçalho sozinho.
   *
   * A seção só é montada quando a fonte respondeu, então zero linha é fato do
   * CADASTRO — e a frase precisa dizer isso na linguagem daquela tabela
   * ("nenhum sócio cadastrado" ≠ "nenhuma garantia constituída"). Ausente ⇒ a
   * frase genérica de `TableSectionView`.
   */
  emptyLabel?: string;
  /**
   * Chave que, presente numa linha, é renderizada como uma **sub-linha de
   * largura inteira** logo abaixo dela — nunca como coluna.
   *
   * Existe para o dossiê do representante do sócio (09/09/2026): ele é um
   * parágrafo (estado civil, profissão, documento de identificação, endereço) e
   * pertence a UMA linha. Em coluna seria ilegível e ficaria em branco na
   * esmagadora maioria dos sócios; numa nota do card, voltaria a ser o que o
   * negócio recusou — uma frase solta que não diz de qual sócio é.
   *
   * A chave fica FORA de {@link columns}, então uma tabela que não a declare
   * ignora o campo em vez de abrir uma coluna vazia.
   */
  detailKey?: string;
  /** @see {@link FieldsSection.pending} */
  pending?: boolean;
}

export type ClientSection = FieldsSection | TableSection;

export type DocumentStatus = 'ok' | 'pendente' | 'vencido';

export interface ClientDetail extends ClientSummary {
  legalName: string;
  activeSince?: string;
  sections: ClientSection[];
  documents: Array<{ name: string; status: DocumentStatus }>;
  opportunities: Array<{ id: string; code: string; title: string; status: string }>;
}

/** Thrown when a SAP code / id has no client (HU-01.2 → direct to Salesforce). */
export class ClientNotFoundError extends Error {
  constructor(readonly query: string) {
    super(`Cliente não encontrado: ${query}`);
    this.name = 'ClientNotFoundError';
  }
}

/**
 * Tab counters for the portfolio listing (`/clientes`). Independent of any
 * free-text filter — mirrors the backend's `GET /v1/customers/portfolio`
 * `counts` envelope, which always reflects the whole carteira.
 */
export interface PortfolioCounts {
  all: number;
  registered: number;
  prospect: number;
  inFlowOpportunity: number;
  /** Clientes com alguma franquia BR Mania / Lubrax+ (ADO 67860). */
  franchise: number;
}

/**
 * Parameters for loading the portfolio, supporting server-side
 * filtering, sorting, and pagination.
 */
export interface PortfolioParams {
  /** Tab filter (default: 'todos'). */
  tab?: PortfolioTab;
  /** Free-text search (SAP, CNPJ, name, city). */
  q?: string;
  /** 1-based page number (default: 1). */
  page?: number;
  /** Items per page (default: 10). */
  limit?: number;
  /** Sort column key (e.g. 'name', 'location', 'docsCount'). */
  sortBy?: SortableColumn;
  /** Sort direction (default: 'asc'). */
  sortOrder?: 'asc' | 'desc';
}

/** Result of loading the client portfolio (journey J1 — list screen). */
/**
 * Whether {@link PortfolioCounts} describes the portfolio or only the window the
 * source returned.
 *
 * The CRM listing is bounded at a hard ceiling, so with no search term the base
 * is the FIRST N accounts. The header used to render `counts.registered` as
 * "200 cadastrados" — a total nobody measured (the org has over a million
 * accounts with a Código SAP). Backend verdict; the front only renders it.
 */
export interface PortfolioJanela {
  /** `true` ⇒ the counters are partial and must not be shown as totals. */
  amostra: boolean;
  /** The source ceiling, so the copy names it without hardcoding 200. */
  limiteJanela: number;
}

/**
 * Qual fatia da base a listagem representa (ADO 67597).
 *
 * Backend-owned, como o `prospectsEnabled`: o front só renderiza. `motivoLabel`
 * é a frase pronta — o front não tem tabela de motivos, senão um motivo novo
 * apareceria como código cru ou como nada.
 */
export interface PortfolioCarteira {
  modo: 'propria' | 'completa';
  motivo: string | null;
  motivoLabel: string | null;
  /** Nome do executivo de venda quando `modo === 'propria'`. */
  executivoDeVenda: string | null;
}

export interface PortfolioResult {
  items: ClientSummary[];
  /** Recorte da carteira — ver {@link PortfolioCarteira}. */
  carteira: PortfolioCarteira;
  counts: PortfolioCounts;
  /** See {@link PortfolioJanela} — never inferred here. */
  janela: PortfolioJanela;
  /** Total number of items matching the current filter (for pagination). */
  total: number;
  /** Whether there are more items beyond the current page. */
  hasMore: boolean;
  /**
   * Backend-owned: whether prospects are currently exposed. `false` ⇒ the
   * listing is registered-only and the Prospects tab renders disabled. The
   * front reacts to this; it holds no prospect flag of its own.
   */
  prospectsEnabled: boolean;
  // NOTA (09/09/2026): `sapPending` foi REMOVIDO. Ele marcava a página quando o
  // `ErpProvider` respondia `NotContracted`, e a tela rodapeava "* Vigência
  // indisponível — aguardando integração SAP". A Vigência passou a ser lida do
  // `Contract` do Salesforce, então a frase acusaria integração pendente sobre
  // uma coluna que responde. Quem explica a célula vazia agora é
  // `ClientSummary.vigenciaGap`, por linha.
  /**
   * Quantos clientes desta aba a fonte de OPORTUNIDADES conhece e o diretório
   * de clientes não serve no recorte atual — só nas abas "Oportunidades em
   * fluxo" e "Com franquia"; `0` nas demais.
   *
   * Backend-owned, como o `prospectsEnabled` e o `carteira`: a tela apenas
   * nomeia a diferença entre o contador da aba (contagem real da fonte de
   * oportunidades) e as linhas (que aplicam o recorte de cliente). Ausente ⇒
   * `0`, e a tela não afirma nada — nunca um palpite.
   */
  foraDoRecorte?: number;
  /** Current page (1-based), echoed from params. */
  page?: number;
  /** Items per page, echoed from params. */
  limit?: number;
}
