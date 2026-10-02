// ---------------------------------------------------------------------------
// F3 — Pendência ticket (12a-pendencia-ticket.html)
// API contract: VBR-144 épico / VBR-146 BE
// ---------------------------------------------------------------------------

/**
 * Pendency ticket status — mirrors the backend enum.
 * "aberta" is the initial state; "resolvida" is terminal.
 */
export type PendenciaDetalheStatus =
  | 'aberta'
  | 'em_andamento'
  | 'resolvida'
  | 'cancelada';

/**
 * Pendency ticket type — the pt-BR display label produced by the BFF from the
 * backend `PendenciaTipo` enum (`DOCUMENTACAO | ANALISE | APROVACAO | OUTRO`),
 * same translation the panel list uses.
 *
 * It is a LABEL, not a rule: the resolution flow comes from
 * {@link AcaoResolucao}, derived by the backend (`deriveAcaoResolucao`).
 */
export type PendenciaDetalheTipo = PendenciaTipo;

/**
 * Priority levels for a pendency ticket. Lowercase machine values (not display
 * labels) because the ticket keys pill variants off them; the BFF translates
 * the backend `BAIXA | MEDIA | ALTA | URGENTE` enum into these.
 */
export type PendenciaDetalhePrioridade =
  | 'baixa'
  | 'media'
  | 'alta'
  | 'urgente';

/** History entry type — the frontend view of the backend `PendenciaEventoTipo`. */
export type HistoricoTipo =
  | 'sistema'
  | 'comentario'
  | 'status'
  | 'resolucao'
  | 'reatribuicao';

/**
 * Resolution action determined by `tipo`:
 *  - "upload"     → documento tickets require an `anexoId`
 *  - "marcar"     → dado / validacao tickets just mark as resolved
 *  - "automatica" → nobody may close it by hand; an external verification does
 *    (today the SAP bank-data/supplier check). The screen renders no resolve
 *    control: `POST .../resolver` answers 400 for these.
 *  - "garantia"   → garantia tickets show the indicação-de-garantia form; the
 *    payload carries the guarantee metadata so the CCOB can run the prior
 *    analysis. Épico de Garantia (VBR-??).
 *  - "ddi"        → parecer da Integridade: risco revisado + parecer + decisão
 *    (liberar/reprovar). Submitted to `POST .../ddi/reclassify`, which closes
 *    the pendência; `POST .../resolver` answers 400 for these, so the ticket
 *    must not offer "marcar como resolvida".
 */
export type AcaoResolucao =
  | 'upload'
  | 'marcar'
  | 'automatica'
  | 'garantia'
  | 'ddi'
  /**
   * DDI **reprovada**, devolvida ao LT (origem `ddi:reprovacao`): o ticket serve
   * o formulário de justificativa e o pedido de nova avaliação, submetido a
   * `POST .../ddi/solicitar-revisao` — que devolve a análise a
   * `PENDENTE_PARECER`, reabre a `ddi:parecer` da Integridade e resolve esta
   * pendência. `POST .../resolver` recusa a origem com 400.
   *
   * ⚠️ **Fluxo separado de `ddi`, e não um modo dele.** Aquele é o parecer,
   * gateado em `Permission.DdiReclassify` (`[INTEGRIDADE, ADMIN]`): reusá-lo
   * daria ao LT o formulário de reclassificação, cujo submit a API recusa com
   * 403. São autoridades opostas sobre a mesma análise — quem reprova não é
   * quem pede a revisão.
   *
   * ⚠️ **E o LT não libera nada**: o pedido reabre a decisão da Integridade, não
   * a substitui. O GATE 1 continua bloqueado, agora por
   * `ddi_parecer_integridade`.
   */
  | 'ddi_revisao'
  /**
   * The document is attached in the opportunity's document Hub, in its own
   * checklist slot; the ticket only NAVIGATES there.
   *
   * `upload` in the ticket could not close this kind of pendência: it is opened
   * per checklist CATEGORY and its discriminator carries only the category, so
   * the upload had no slot to write to — it resolved the pendência, changed no
   * checklist item, and the reconciler reopened an identical one a minute later,
   * forever (VBR-628).
   */
  | 'hub'
  /**
   * Proposta devolvida pela SNEG (RN-F2-03): o ticket EXPLICA e NAVEGA, nunca
   * fecha. Quem encerra é o reenvio da proposta
   * (`POST /v1/proposals/:id/reenviar`), que auto-resolve a pendência pela mesma
   * chave com que a devolução a abriu — `POST .../resolver` recusa com 400.
   *
   * Enquanto o backend a derivava como `marcar`, o ticket oferecia "Marcar como
   * resolvida": a pendência obrigatória fechava com a proposta ainda DEVOLVIDA e
   * nada de volta na fila da SNEG.
   */
  | 'reenvio'
  /**
   * FAP ou fotos do ponto de uma proposta de franquia (RN-F4-01, ADO 67972): o
   * ticket EXPLICA e NAVEGA, nunca fecha.
   *
   * Quem encerra é o anexo na PRÓPRIA PROPOSTA — `POST .../resolver` recusa
   * esta origem com 400.
   *
   * ⚠️ **Fluxo HISTÓRICO desde 14/09/2026:** o negócio retirou a cobrança por
   * pendência (a FAP é obrigatória no checklist de documentos e no cadastro da
   * proposta, e não deve aparecer no card da oportunidade). Nenhuma pendência
   * nova nasce assim; o membro permanece para as já gravadas, que continuam
   * abrindo no ticket.
   *
   * ⚠️ Não é `upload` (embora o `tipo` seja `DOCUMENTACAO`): a dropzone do
   * ticket escreve no repositório da OPORTUNIDADE, e o gate lê o documento da
   * PROPOSTA — a pendência fecharia sem o documento e o worker abriria outra
   * idêntica um ciclo depois. Nem `hub`, pela mesma razão: anexar lá satisfaz a
   * linha do checklist e não o gate, então aquele CTA mandaria o usuário a um
   * lugar que não resolve a obrigação.
   */
  | 'franquia'
  /**
   * Análise prévia da garantia (RN-F2-01/02/03 — roteamento da CCOB,
   * 04/09/2026): o ticket EXPLICA e NAVEGA, nunca fecha.
   *
   * Quem encerra é a DECISÃO da CCOB na tela de Garantia
   * (`garantia:aprovar-previa` / `:reprovar-previa`), que auto-resolve a
   * pendência pela mesma chave com que a promoção do subprocesso a abriu —
   * `POST .../resolver` recusa esta origem com 400.
   *
   * ⚠️ Não é `marcar` (embora o `tipo` seja `ANALISE`): um clique fecharia a
   * cobrança **sem parecer e sem veredito**, com a garantia presa em
   * `EM_ANALISE_PREVIA`, o `INICIAR_MINUTA` travado pelo
   * `GARANTIA_PREVIA_GATE_GUARD` e nenhuma pendência restando para dizer o
   * motivo. E não é `automatica`: ninguém a fecha sozinho — é a CCOB que decide,
   * em outra tela.
   */
  | 'previa_garantia'
  /**
   * Parecer antecipado do time de franquias (RN-F6-02 — ADO 68191,
   * 04/09/2026): o ticket EXPLICA e NAVEGA, nunca fecha.
   *
   * Quem encerra é a SUBMISSÃO do parecer na proposta de franquia
   * (`parecer-antecipado:aprovar` / `:aprovarComRessalvas` / `:rejeitar`), que
   * auto-resolve a pendência pela mesma chave com que o consumer a abriu —
   * `POST .../resolver` recusa esta origem com 400.
   *
   * ⚠️ Não é `marcar` (embora o `tipo` seja `ANALISE`): um clique fechava a
   * cobrança **sem parecer**, e o `FranquiaParecerPendenciaConsumer` reabria
   * uma pendência idêntica na mudança de composição seguinte. Foi o relato do
   * ticket, com o anexo provando o par: `PN-0215` "Resolvida" e `PN-0216`, a
   * mesma cobrança, de volta em "3 abertas".
   */
  | 'franquia_parecer';

/** A single entry in the pendency history thread. */
export interface HistoricoEntry {
  id: string;
  tipo: HistoricoTipo;
  /** ISO-8601 timestamp */
  criadoEm: string;
  /** Actor id (Entra `oid`, or `system:*` for automated entries) */
  autorId: string;
  /** Actor name; null for system events */
  autor: string | null;
  /** Human-readable message */
  mensagem: string;
  /** Attached file name when the entry carries a document. */
  anexoNome?: string | null;
  /**
   * Same-origin download for that file (`/api/pendencias/:id/anexos/:anexoId/view`).
   * The BFF streams the bytes — the signed URL of the document store is a
   * credential for that object and never reaches the browser.
   */
  anexoUrl?: string | null;
}

/** Participant listed in the ticket aside. */
export interface Participante {
  id: string;
  nome: string;
  papel: string; // e.g. "Responsável", "Solicitante", "Observador"
  /**
   * Área já rotulada em pt-BR (`LT`, `SNEG`, `Integridade`…) — é o que o
   * protótipo mostra ao lado do nome (`Ana Ribeiro · LT`). `null` quando a área
   * de quem escreveu no thread não é conhecida: o evento guarda autor, não
   * lotação.
   */
  area: string | null;
}

/**
 * Full pendency ticket shape — GET /v1/pendencias/:id.
 *
 * API contract — F3 (VBR-144 épico / VBR-146 BE):
 *
 *   GET /v1/pendencias/:id
 *   Response 200: PendenciaDetalhe
 *   Response 404: { code: "PENDENCIA_NOT_FOUND" }
 */
export interface PendenciaDetalhe {
  id: string;
  /** Display code, e.g. "PEND-0042" */
  codigo: string;
  titulo: string;
  descricao: string | null;

  // Status
  status: PendenciaDetalheStatus;
  /**
   * Next statuses reachable from `status`, decided by the backend state machine
   * (RN-F3-04). The screen renders exactly these as options — it must NOT
   * replicate the machine, or it offers transitions the API answers with
   * `400 Transição inválida`.
   */
  statusPermitidos: PendenciaDetalheStatus[];
  /** Display label of the backend `PendenciaTipo` — never a rule, only text. */
  tipo: PendenciaDetalheTipo;
  /** Resolution flow, derived by the backend from `tipo` (`deriveAcaoResolucao`) */
  acaoResolucao: AcaoResolucao;
  /**
   * Frase que explica QUEM encerra a pendência quando `acaoResolucao` é
   * `automatica` — vem do catálogo, por gatilho. `null` nos demais fluxos.
   */
  acaoResolucaoDetalhe: string | null;
  /**
   * Este perfil pode ENCERRAR a pendência à mão? — veredito do BACKEND
   * (ADO 68190), o mesmo que `POST .../resolver` aplica com 403.
   *
   * ⚠️ Responde a POSSE ("de quem é esta pendência?"), pergunta distinta de
   * `acaoResolucao` ("que fluxo a encerra?") — e é por isso que o caso do
   * ticket atravessava: as linhas legadas de `ddi:parecer` carregam a origem
   * `ddi` e caem no fluxo `marcar`, então o fluxo dizia "pode" enquanto a área
   * dizia "é da Integridade".
   *
   * Opcional porque um backend anterior ao campo simplesmente o omite; a
   * ausência é lida como "pode" (`podeResolverPendencia`), que é o lado
   * recuperável.
   */
  resolucaoPermitida?: boolean;
  prioridade: PendenciaDetalhePrioridade;

  // Context / links — null when the pendência is orphan (no linked opportunity)
  oportunidadeId: string | null;
  oportunidadeCodigo: string | null;
  oportunidadeNome: string | null;
  fase: string | null; // e.g. "SNEG – Análise da Proposta"

  // Assignment
  responsavel: string | null;
  /**
   * Area that OWNS the pendência (the routing target of the engine catalog), not
   * who asked for it. Labelled "Área solicitante" before, which read backwards:
   * a proposal returned to the LT showed "Área solicitante: LT/EV" when the
   * requester was the SNEG.
   *
   * ⚠️ Já em pt-BR (`areaDisplay` do backend), como o `area` da lista. O token de
   * máquina renderizava cru neste campo — o ticket do parecer da Integridade
   * dizia "Área responsável: COMPLIANCE" logo acima de "Responsável:
   * Integridade", que é o mesmo fato duas vezes com respostas diferentes. A
   * tela NÃO traduz: o rótulo nasce no backend.
   */
  areaResponsavel: string | null;
  canal: string | null; // e.g. "CHAT", "EMAIL"
  /** pt-BR label composed by the backend (`origemDisplay`) — what the screen prints. */
  origem: string | null;
  /**
   * Machine discriminator behind {@link origem} ("ddi:parecer",
   * "engine:DOCUMENTO_AUSENTE", "sneg:devolver"). Never rendered — it exists so
   * a screen can branch without matching translated prose. `null` for rows the
   * backend sent without one.
   */
  origemCodigo: string | null;

  // SLA / dates
  abertaEm: string | null; // ISO-8601
  prazo: string | null; // ISO-8601 date — SLA deadline
  resolvidaEm: string | null; // ISO-8601 when resolved

  // Thread
  historico: HistoricoEntry[];

  // Participants
  participantes: Participante[];
}

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

/** POST /v1/pendencias/:id/comentarios */
export interface AdicionarComentarioPayload {
  texto: string;
  /**
   * Document attached to this comment. Until it existed, the only way to attach
   * anything was `resolver`, which also closes the pendência — so answering a
   * request for a document meant ending the conversation.
   */
  anexoId?: string;
  /** File name snapshot rendered in the thread; only meaningful with `anexoId`. */
  anexoNome?: string;
}

/** POST /v1/pendencias/:id/resolver */
export interface ResolverPendenciaPayload {
  /** Required when acaoResolucao === "upload" */
  anexoId?: string;
  /** Display name of the uploaded file */
  anexoNome?: string;
  observacao?: string;

  // ---- Fields sent when acaoResolucao === "garantia" (Épico de Garantia) ----
  /** "Garantia real (hipoteca / alienação fiduciária)" | "Fiança bancária" | etc. */
  tipoGarantia?: string;
  /** true = Nova, false = Existente */
  garantiaNova?: boolean;
  /** Property / asset description — "Av. Paulista, 1000 · São Paulo/SP" */
  imovelBem?: string;
  /** Registry number — "45.678" */
  matriculaGarantia?: string;
  /** "Posto" | "Comercial" | "Residencial" | "Rural" */
  categoriaGarantia?: string;
  /** Appraised value from the laudo — free text ("R$ 1.200.000,00") */
  valorAvaliado?: string;
  /** Certidão de inteiro teor atualizada — file-service id (when available) */
  certidaoId?: string;
  /** Display name of the certidão file */
  certidaoNome?: string;
  /** Laudo de avaliação — file-service id (when available) */
  laudoId?: string;
  /** Display name of the laudo file */
  laudoNome?: string;
}

/** POST /v1/pendencias/:id/reatribuir */
export interface ReatribuirPendenciaPayload {
  responsavel: string;
}

/** PATCH /v1/pendencias/:id */
export interface PatchPendenciaPayload {
  status?: PendenciaDetalheStatus;
  prioridade?: PendenciaDetalhePrioridade;
  prazo?: string | null;
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/** Thrown when a pendency id returns 404. */
export class PendenciaNotFoundError extends Error {
  constructor(readonly pendenciaId: string) {
    super(`Pendência não encontrada: ${pendenciaId}`);
    this.name = 'PendenciaNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Anexos index
// ---------------------------------------------------------------------------

/**
 * A single attachment returned by `GET /api/pendencias/:id/anexos`.
 *
 * The `id` maps directly to the existing view stream:
 * `GET /api/pendencias/:id/anexos/:id/view`.  The signed URL is never
 * included here — it stays server-side, streamed by the BFF.
 */
export interface PendenciaAnexo {
  id: string;
  fileName: string;
  mimeType: string;
  /** Name of the person who uploaded the file; null when not recorded. */
  uploadedByName: string | null;
  /** ISO-8601 timestamp. */
  uploadedAt: string;
}

// ---------------------------------------------------------------------------
// F3 — Pendências panel (12-pendencias.html)
// API contract: VBR-144 épico / VBR-146 BE
// ---------------------------------------------------------------------------

/**
 * Pendency (task) status values — matches the backend enum.
 * "todas" is a UI-only chip key — never sent to the backend as a filter.
 */
export type PendenciaStatus = 'Aberta' | 'Em tratativa' | 'Resolvida' | 'Cancelada';

/**
 * Os status ATIVOS — a pendência ainda pede ação de alguém.
 *
 * Existe porque `GET /v1/pendencias` **não** filtra por padrão e o parâmetro
 * `status` aceita UM valor só: nenhuma query consegue pedir "as abertas" (que
 * são duas — `Aberta` e `Em tratativa`), então quem quer só as ativas filtra a
 * lista. Predicado único de propósito: as duas superfícies que precisavam disso
 * erraram de formas opostas — o card da oportunidade não filtrava nada e
 * rotulava o total como "N aberta(s)" (uma pendência de DDI **resolvida** pela
 * Integridade seguia contada e listada na OPP — ADO 67882), e o selo de reenvio
 * do checklist pedia `status: 'Aberta'` e perdia a que estava em tratativa.
 *
 * ⚠️ Filtrar no cliente só dá a contagem EXATA quando a chamada é
 * **não paginada** (`limit` ausente). Numa página, filtre no backend — ou o
 * número dirá "as ativas desta página", não as da oportunidade.
 */
export const PENDENCIA_STATUS_ATIVOS: readonly PendenciaStatus[] = [
  'Aberta',
  'Em tratativa',
];

/** True quando a pendência ainda pede ação (não está resolvida nem cancelada). */
export function isPendenciaAtiva(status: PendenciaStatus): boolean {
  return PENDENCIA_STATUS_ATIVOS.includes(status);
}

/** Priority levels — display labels mapped from the backend enum (BAIXA…URGENTE). */
export type PendenciaPrioridade = 'Baixa' | 'Média' | 'Alta' | 'Urgente';

/** Task types — display labels mapped from the backend enum (DOCUMENTACAO…OUTRO). */
export type PendenciaTipo = 'Documentação' | 'Análise' | 'Aprovação' | 'Outro';

/**
 * Valores de MÁQUINA dos enums do backend, verbatim.
 *
 * Distintos dos tipos acima, que são RÓTULO DE TELA ("Documentação", "Alta") —
 * o que a API aceita em `POST /v1/pendencias` é `DOCUMENTACAO` / `ALTA`. Quem
 * cria uma pendência programaticamente precisa destes; mandar o rótulo (ou um
 * literal em minúsculas) responde `400 VALIDATION_ERROR` nos dois campos.
 *
 * Membro nomeado em vez de string solta no call site: se o backend renomear um
 * valor, o build quebra aqui, num lugar só.
 */
export const PendenciaTipoBackend = {
  Documentacao: 'DOCUMENTACAO',
  Analise: 'ANALISE',
  Aprovacao: 'APROVACAO',
  Outro: 'OUTRO',
} as const;

export const PendenciaPrioridadeBackend = {
  Baixa: 'BAIXA',
  Media: 'MEDIA',
  Alta: 'ALTA',
  Urgente: 'URGENTE',
} as const;

/**
 * Summary row for a single pendency item (journey F3 — `/pendencias`).
 *
 * API Contract — F3 (épico VBR-144 / BE VBR-146):
 *
 *   GET /v1/pendencias
 *   Response 200: { items: PendenciaSummary[], total: number, kpis: PendenciasKpis }
 */
export interface PendenciaSummary {
  id: string;
  /** Display code, e.g. "PN-3000". */
  code: string;
  title: string;
  /** Client name, e.g. "Posto Vibra Centro-SP"; null when not enriched. */
  clientName: string | null;
  /** Linked opportunity code, e.g. "OPP-0428"; null when not enriched. */
  opportunityCode: string | null;
  /** Linked opportunity id — used for navigation to ticket. */
  opportunityId: string;
  /** Current phase of the opportunity, e.g. "Em análise"; null when not enriched. */
  fase: string | null;
  /** Name (or area label) of the responsible party; null when unassigned. */
  responsavel: string | null;
  /**
   * Área responsável já em pt-BR (`areaDisplay` do backend). A tela NÃO traduz —
   * o token de máquina (`COMPLIANCE`) renderizava cru na Tag do painel, ao lado
   * de um responsável que já lia "Integridade" (ADO 67912).
   */
  area: string | null;
  prioridade: PendenciaPrioridade;
  status: PendenciaStatus;
  tipo: PendenciaTipo;
  /** Communication channel, e.g. "E-mail", "Teams"; null when unset. */
  canal: string | null;
  /**
   * SLA in days relative to today — computed by the backend from `prazo`:
   *   negative → overdue (past deadline by N days)
   *   0        → due today
   *   positive → N days remaining
   *   null     → no deadline set ("Sem prazo")
   */
  slaDias: number | null;
  /**
   * Faixa de SLA da linha — veredito do BACKEND, o mesmo que o filtro `?sla=` e
   * os cards do topo aplicam (ADO 67960).
   *
   * ⚠️ É ela que rotula a pill, nunca o SINAL de `slaDias`. Enquanto a tela
   * derivava o rótulo do número, uma pendência vencida às 08:00 aparecia como
   * "Vence hoje" (o `ceil` de uma diferença negativa de horas dá `-0`) ao lado
   * de um card "Atrasadas" que a contava — e filtrar "Vence hoje" devolvia zero
   * para ela. `slaDias` ficou só com o texto auxiliar ("há N dias").
   *
   * `null`/ausente = backend anterior a esta entrega; aí o rótulo degrada para
   * a derivação antiga por `slaDias`.
   */
  slaFaixa?: SlaFaixa | null;
  /** True when the task was generated automatically by the engine. */
  automatica: boolean;
  /** Mandatory for GATE 2 (F7 — RN-F7-02); blocks release while open. */
  obrigatoria: boolean;
  /**
   * Resolution flow, derived by the backend (`deriveAcaoResolucao`) — the same
   * verdict the ticket receives. The list needs it to know whether its CTA may
   * promise "Resolver": see `podeResolverPendencia` (ADO 67911). Optional
   * because a backend that predates the field simply omits it.
   */
  acaoResolucao?: AcaoResolucao;
  /**
   * Este perfil pode ENCERRAR a pendência à mão? — veredito do BACKEND
   * (ADO 68190). Ver o campo homônimo em `PendenciaDetalhe`.
   */
  resolucaoPermitida?: boolean;
}

/** KPI counters returned by the backend alongside the item list. */
export interface PendenciasKpis {
  atrasadas: number;
  vencemHoje: number;
  abertas: number;
  /** Tasks resolved within the current week. */
  concluidasSemana: number;
}

// ---------------------------------------------------------------------------
// F3 — SLA faixas (filters)
// ---------------------------------------------------------------------------

/**
 * SLA range filter — mirrors the backend `SlaFaixa` enum.
 * The frontend `<select>` options are built from this enum (no hardcoded strings).
 */
export const SlaFaixa = {
  Atrasada: 'ATRASADA',
  VenceHoje: 'VENCE_HOJE',
  NoPrazo: 'NO_PRAZO',
  SemPrazo: 'SEM_PRAZO',
} as const;

export type SlaFaixa = (typeof SlaFaixa)[keyof typeof SlaFaixa];

/** Narrows an unvalidated string to {@link SlaFaixa}. */
export function isSlaFaixa(value: unknown): value is SlaFaixa {
  return typeof value === 'string' && (Object.values(SlaFaixa) as string[]).includes(value);
}

/**
 * pt-BR display labels for each {@link SlaFaixa}.
 * Single source of truth — import instead of duplicating string literals in JSX.
 */
export const SLA_LABEL: Record<SlaFaixa, string> = {
  [SlaFaixa.Atrasada]: 'Atrasada',
  [SlaFaixa.VenceHoje]: 'Vence hoje',
  [SlaFaixa.NoPrazo]: 'No prazo',
  [SlaFaixa.SemPrazo]: 'Sem prazo',
};

/** Query parameters for the pendency list (mirrors the backend query string). */
export interface ListPendenciasParams {
  status?: PendenciaStatus;
  prioridade?: PendenciaPrioridade;
  area?: string;
  /**
   * Oportunidade a filtrar. Aceita o UUID ou o código humano — quem resolve é o
   * backend. O front NÃO inspeciona o formato: o formato do identificador é
   * conhecimento do backend e não deve vazar para a UI.
   */
  opportunityRef?: string;
  q?: string;
  page?: number;
  limit?: number;
  /**
   * SLA range filter (VBR-431).
   * The `<select>` is built from the `SlaFaixa` enum — no hardcoded `<option>` strings.
   */
  sla?: SlaFaixa;
  /**
   * Verdict category filter (VBR-431).
   * Mirrors the backend `RequerAcaoSelo` enum — values from `Selo` in requer-acao-mapping.
   */
  selo?: string;
  /**
   * Filter by a specific responsible person's ID (VBR-431).
   * `minhas=true` is the shortcut for "filter to my own user ID" without the
   * frontend ever knowing the current user's ID (resolved server-side).
   */
  responsavelId?: string;
  /**
   * Shortcut: `true` = filter pendências assigned to the current session user.
   * The backend resolves the current user's ID from the Bearer token.
   * Reflected as `?minhas=true` in the URL.
   */
  minhas?: boolean;
}

/** Result of loading the pendency list (`/pendencias`). */
export interface ListPendenciasResult {
  items: PendenciaSummary[];
  total: number;
  /**
   * Quantas das pendências do filtro ainda PEDEM AÇÃO (`Aberta` |
   * `Em tratativa`) — veredito do backend, sobre o conjunto filtrado completo.
   *
   * ⚠️ **É este o contador de tela, não `total`** (ADO 68150), que soma os
   * quatro status. E não é derivável aqui: numa chamada PAGINADA, filtrar
   * `items` com {@link isPendenciaAtiva} responde "as ativas desta página" —
   * ver o aviso em {@link PENDENCIA_STATUS_ATIVOS}.
   */
  totalAtivas: number;
  kpis: PendenciasKpis;
  /**
   * Per-category counters for the selo filter chips (VBR-431).
   * Absent when the backend has not yet deployed this field — the panel
   * renders chips with 0 counts (not an error).
   */
  porSelo?: Array<{ selo: string; total: number }>;
}

/**
 * Opção do filtro "Todas as áreas" do painel de pendências.
 *
 * `value` é o token de máquina que `GET /api/pendencias?area=` compara; `label`
 * é o texto pt-BR do seletor. A tela **não** monta essa lista: ela vem do
 * backend, porque uma cópia local dos rótulos é o que fazia o filtro selecionar
 * zero linhas (ADO 67912).
 */
export interface PendenciaAreaOption {
  value: string;
  label: string;
}
