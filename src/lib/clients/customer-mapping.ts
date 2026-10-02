import { formatTaxId } from './format';
import type { ClientSummary, PortfolioCounts } from './types';

/**
 * A customer row from the backend `GET /v1/customers` (autocomplete projection,
 * PRD F1). Lighter than {@link ClientSummary}: no bandeira/risco/docs — those
 * are filled by the portfolio (`/v1/customers/portfolio`) and 360º
 * (`/v1/customers/:sapCode/360`) endpoints instead, which the autocomplete
 * doesn't need.
 */
export type BackendCustomer = {
  id: string;
  name: string;
  sapCode: string | null;
  taxId: string;
  city: string | null;
  state: string | null;
  registrationStatus: 'REGISTERED' | 'PROSPECT';
};

/** Paginated envelope returned by `GET /v1/customers`. */
export type BackendCustomerSearch = {
  items: BackendCustomer[];
  total: number;
  page: number | null;
  limit: number | null;
  hasMore: boolean;
};

/**
 * Map a backend customer projection to the frontend `ClientSummary` consumed by
 * the search box. The autocomplete endpoint is a light projection, so the
 * list/360º-only fields (flag, risk, docs) are neutral placeholders — the home
 * search never renders them.
 *
 * Routing: `id` is the CRM record id — the identifier EVERY account has. It used
 * to prefer the Código SAP, which a prospect does not have, so a prospect's row
 * pointed at an id the SAP-keyed 360º could not resolve and the screen answered
 * "cliente não encontrado". The 360º endpoint now accepts either reference
 * (SAP first, CRM id as fallback), so the URL no longer has to be SAP-shaped —
 * and links that still carry a SAP code (e.g. from an opportunity) keep working.
 *
 * `sapCode` stays a separate field: it is what the user reads and searches by,
 * and the domain link between opportunity and customer is still keyed by it.
 */
export function mapCustomerToClient(customer: BackendCustomer): ClientSummary {
  return {
    // CRM id, not the SAP code — see the note above.
    id: customer.id || (customer.sapCode ?? ''),
    // A prospect has no SAP code; keep the em dash the mock/list already use.
    sapCode: customer.sapCode ?? '—',
    name: customer.name,
    document: formatTaxId(customer.taxId),
    kind: customer.registrationStatus === 'PROSPECT' ? 'prospect' : 'cadastrado',
    location: [customer.city, customer.state].filter(Boolean).join(', '),
    flag: '',
    risk: null,
    docsCount: 0,
  };
}

/** A portfolio row from the backend `GET /v1/customers/portfolio` (10-clientes.html). */
export type BackendPortfolioRow = {
  id: string;
  name: string;
  sapCode: string | null;
  taxId: string;
  city: string | null;
  state: string | null;
  registrationStatus: 'REGISTERED' | 'PROSPECT';
  companyGroup: { code: string; name: string } | null;
  /** See {@link ClientSummary.franchiseOf} — Bug 67504. */
  franchiseOf: { sapCode: string; legalName: string } | null;
  flag: string | null;
  flagGap?: BackendFlagGap | null;
  /**
   * VMM — volume médio mensal (m³/mês). Source: Salesforce Account.VMM__c
   * (Bug 67505 — the ERP adapter was fabricating this from the SAP code digits).
   * `null` = no VMM on record (see `vmmGap` for the named reason).
   */
  vmm: number | null;
  /**
   * Data de referência do VMM (Account.Data_Refer_ncia_VMM__c), ISO date.
   * `null` when `vmm` is null or the date was not recorded.
   */
  vmmReferenceDate: string | null;
  /**
   * Why `vmm` is absent for this registered customer. Mirrors the `flagGap`
   * pattern (VBR-539): a named gap says "no VMM in the CRM" rather than
   * rendering a silent "—" indistinguishable from a source outage.
   */
  vmmGap?: BackendFlagGap | null;
  /**
   * Vigência do contrato de FORNECIMENTO ativo e vigente. Fonte: `Contract` do
   * Salesforce, o espelho do SAP.
   *
   * Substitui o antigo invólucro `volume: { validity }`, que vinha do
   * `ErpProvider` (SAP/MuleSoft, canal nunca contratado — VBR-98) e por isso
   * chegava vazio em 100% das linhas. `to: null` = prazo indeterminado.
   */
  contractValidity?: { from: string; to: string | null } | null;
  /** Por que `contractValidity` está vazia — ver {@link ClientSummary.vigenciaGap}. */
  validityGap?: BackendFlagGap | null;
  inFlowOpportunity: { code: string; title: string; status: string } | null;
  documents: { count: number } | null;
};

/**
 * Texto da célula quando o contrato não tem data de término.
 *
 * ⚠️ `to: null` NÃO é ausência de vigência — é **prazo indeterminado**: há
 * contrato, e o que falta é a data de fim (a sentinela `2099-12-31` do espelho,
 * que o backend traduz). Exibir `—` aqui diria "este cliente não tem contrato",
 * o oposto do que a fonte respondeu; e exibir `12/2099` poria na tela uma data
 * que ninguém pactuou — ela é a ÚNICA vigência de 179 contas.
 */
const PRAZO_INDETERMINADO = 'indeterminado';

/**
 * Formats a contract validity range into the prototype's "MM/AAAA → MM/AAAA"
 * (10-clientes.html). `from`/`to` are ISO dates (e.g. "2021-04-01").
 *
 * Devolve `null` só quando NÃO HÁ vigência — e aí quem explica a célula é
 * `vigenciaGap`, nomeando o motivo. Antes o `null` cobria dois fatos ("sem
 * contrato" e "integração SAP pendente") e a tela decidia a cópia por um flag
 * de página, que era o que fazia toda linha ler igual.
 */
function formatValidity(
  validity: { from: string; to: string | null } | null | undefined,
): string | null {
  if (!validity) return null;
  const monthYear = (iso: string): string => {
    const [year, month] = iso.split('-');
    return month && year ? `${month}/${year}` : iso;
  };
  const fim = validity.to ? monthYear(validity.to) : PRAZO_INDETERMINADO;
  return `${monthYear(validity.from)} → ${fim}`;
}

/** Tab counters from the backend, independent of the free-text filter. */
export type BackendPortfolioCounts = PortfolioCounts;

/** Paginated envelope returned by `GET /v1/customers/portfolio`. */
/**
 * Qual fatia da base a página representa (ADO 67597) — espelho de
 * `CustomerCarteiraScopeDto`.
 *
 * `motivoLabel` é a frase que a tela exibe. Ela nasce no BACKEND: o recorte é
 * decisão dele, e uma tabela de frases aqui apodreceria assim que um motivo novo
 * aparecesse (o front renderizaria o código cru ou, pior, nada).
 */
export type BackendCarteiraScope = {
  modo: 'propria' | 'completa';
  motivo: string | null;
  motivoLabel: string | null;
  executivoDeVenda: string | null;
};

export type BackendPortfolioPage = {
  items: BackendPortfolioRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  counts: BackendPortfolioCounts;
  /** Whether `counts` is a sample of a truncated window — see `PortfolioJanela`. */
  janela?: { amostra: boolean; limiteJanela: number };
  prospectsEnabled: boolean;
  /** Recorte da carteira — ver {@link BackendCarteiraScope}. */
  carteira?: BackendCarteiraScope;
  /**
   * `true` when the SAP/ERP integration is not contracted yet and **Vigência**
   * is unavailable for registered customers on this page (VBR-98). VMM is now
   * Salesforce-mastered (Bug 67505) and is NOT affected by this flag.
   * The front names SAP as the pending source instead of the generic "—".
   */
  sapPending?: boolean;
  /**
   * Quantos clientes desta aba a fonte de oportunidades conhece e o diretório
   * de clientes não serve no recorte atual (ADO 67860 — o descompasso entre o
   * contador da aba e as linhas).
   */
  foraDoRecorte?: number;
};

/** The ANP gap the backend attaches to a portfolio row (VBR-539). */
/**
 * Reason codes of `SectionSourceGap` (backend `SectionGapReason`).
 *
 * Narrowed to the union rather than left as `string` so a typo or a reason the
 * backend adds later fails the build here, instead of silently falling through
 * to the "indisponível" wording — which would blame the source for something it
 * did not do.
 */
export type BackendGapReason =
  | 'NAO_CONTRATADA'
  | 'INDISPONIVEL'
  | 'LIMITE_EXCEDIDO'
  | 'SEM_REGISTRO';

export type BackendFlagGap = {
  sourceLabel: string;
  reason: BackendGapReason;
  detail: string | null;
};

/**
 * Short cell label per gap reason. Deliberately shorter than the backend's
 * `detail`: the sentence is right for a 360º field but wraps a table column, so
 * the full text rides along in `title` (hover) and the cell keeps one line.
 *
 * The distinction the labels must preserve is SEM_REGISTRO × INDISPONIVEL —
 * "the ANP answered and has no record" versus "the ANP did not answer". They
 * send the reader to different places (nothing to do / call support), and
 * collapsing them is the bug this exists to fix.
 *
 * Every reason is spelled out, including the two the ANP cannot currently
 * produce: an unhandled reason would land on "indisponível" by default, which is
 * the one wording that is wrong for all of them.
 */
const FLAG_GAP_LABEL: Record<BackendGapReason, (source: string) => string> = {
  SEM_REGISTRO: (source) => `Sem registro na ${source}`,
  NAO_CONTRATADA: (source) => `Aguardando integração ${source}`,
  LIMITE_EXCEDIDO: (source) => `Fora do limite de consulta da ${source}`,
  INDISPONIVEL: (source) => `${source} indisponível`,
};

/**
 * Etiquetas da coluna **Vigência**.
 *
 * Mapa próprio, e não o {@link FLAG_GAP_LABEL}: "Sem registro na Salesforce"
 * é verdadeiro e não diz NADA ao leitor da carteira — ele quer saber que este
 * cliente não tem contrato de fornecimento vigente, que é o motivo real e o
 * caso majoritário (93% das contas DCVIM). Uma etiqueta genérica aqui
 * reproduziria, com outras palavras, o traço mudo que a coluna exibia enquanto
 * não tinha fonte.
 *
 * ⚠️ `NAO_CONTRATADA` fica no mapa **por completude, não por uso**: a coluna
 * deixou de depender de integração pendente em 09/09/2026. Se ela voltar a
 * aparecer, é sinal de que alguém religou a Vigência a uma fonte não
 * contratada — e a frase certa é a que manda esperar, não a que afirma
 * ausência de contrato.
 */
const VALIDITY_GAP_LABEL: Record<BackendGapReason, (source: string) => string> = {
  SEM_REGISTRO: () => 'Sem contrato vigente',
  NAO_CONTRATADA: (source) => `Aguardando integração ${source}`,
  LIMITE_EXCEDIDO: (source) => `Fora do limite de consulta da ${source}`,
  INDISPONIVEL: (source) => `${source} indisponível`,
};

/**
 * Traduz a lacuna do backend na etiqueta curta da célula (+ o texto completo
 * no `title`).
 *
 * O mapa de etiquetas é PARÂMETRO porque a mesma razão exige palavras
 * diferentes por coluna: `SEM_REGISTRO` na Bandeira é "a ANP não tem registro
 * deste CNPJ" e na Vigência é "este cliente não tem contrato de fornecimento
 * vigente". Com um mapa único, uma das duas colunas fica com a frase da outra.
 *
 * @param fallbackSource Nome usado quando o backend não manda `sourceLabel` —
 *   também por coluna, senão um gap de Vigência sem rótulo acusaria a ANP.
 */
function mapGap(
  gap: BackendFlagGap | null | undefined,
  labels: Record<BackendGapReason, (source: string) => string>,
  fallbackSource: string,
): { label: string; title: string } | null {
  if (!gap) return null;
  const source = gap.sourceLabel || fallbackSource;
  // An unknown reason (backend ahead of the front) keeps the source named
  // without asserting a cause — better than claiming an outage.
  const label = (labels[gap.reason] ?? ((s: string) => `Sem dado da ${s}`))(source);
  return { label, title: gap.detail ?? label };
}

/** Lacuna das colunas servidas pela ANP e pelo cadastro (Bandeira, VMM). */
function mapFlagGap(
  gap: BackendFlagGap | null | undefined,
): { label: string; title: string } | null {
  return mapGap(gap, FLAG_GAP_LABEL, 'ANP');
}

/**
 * Map a backend portfolio row to the frontend `ClientSummary` consumed by the
 * `/clientes` list. Unlike the autocomplete projection, this carries the real
 * bandeira/docs — there's just no risk indicator in the contract yet (falls
 * back to the "aguardando oportunidade" neutral state already handled by the
 * UI for `risk: null`).
 *
 * Routing: `id` is the CRM record id (same reasoning as
 * {@link mapCustomerToClient}) — the SAP code is not universal, and the 360º now
 * resolves either reference.
 *
 * @param row - Backend portfolio row from `GET /v1/customers/portfolio`.
 */
export function mapPortfolioRowToClient(row: BackendPortfolioRow): ClientSummary {
  return {
    id: row.id || (row.sapCode ?? ''),
    sapCode: row.sapCode ?? '—',
    name: row.name,
    document: formatTaxId(row.taxId),
    kind: row.registrationStatus === 'PROSPECT' ? 'prospect' : 'cadastrado',
    // Empresa group ("code · name"), VMM (Salesforce), contract validity (SAP)
    // and the in-flow opportunity are resolved by the backend — map them
    // explicitly so the list columns render real data instead of "—".
    empresaGroup: row.companyGroup
      ? `${row.companyGroup.code} · ${row.companyGroup.name}`
      : undefined,
    franchiseOf: row.franchiseOf,
    flag: row.flag ?? '',
    flagGap: mapFlagGap(row.flagGap),
    location: [row.city, row.state].filter(Boolean).join(', '),
    risk: null,
    // VMM is now Salesforce-mastered (Account.VMM__c) — Bug 67505.
    vmm: row.vmm ?? null,
    vmmGap: mapFlagGap(row.vmmGap),
    // Vigência do contrato de fornecimento (Salesforce `Contract`, o espelho do
    // SAP). `vigenciaGap` nomeia o motivo quando ela está vazia — sem ele, o
    // caso majoritário (93% das contas não têm contrato de fornecimento
    // vigente) renderiza o mesmo traço mudo de quando a coluna não tinha fonte.
    vigencia: formatValidity(row.contractValidity),
    vigenciaGap: mapGap(row.validityGap, VALIDITY_GAP_LABEL, 'Salesforce'),
    inFlowOpportunity: row.inFlowOpportunity
      ? `${row.inFlowOpportunity.code} · ${row.inFlowOpportunity.status}`
      : null,
    docsCount: row.documents?.count ?? 0,
  };
}
