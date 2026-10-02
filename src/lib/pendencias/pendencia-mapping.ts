import { Selo } from '@/lib/dashboard/requer-acao-mapping';

import type {
  AcaoResolucao,
  HistoricoEntry,
  HistoricoTipo,
  ListPendenciasResult,
  Participante,
  PendenciaDetalhe,
  PendenciaDetalhePrioridade,
  PendenciaDetalheStatus,
  PendenciaPrioridade,
  PendenciaStatus,
  PendenciaAreaOption,
  PendenciaSummary,
  PendenciaTipo,
  PendenciasKpis,
} from './types';
import { isSlaFaixa } from './types';
import { withBasePath } from '@/lib/base-path';

/**
 * Anti-corruption mapping between the backend `GET /v1/pendencias` contract
 * (domain enums in UPPER_SNAKE, pt-BR field names) and the frontend
 * `PendenciaSummary` shape (pt-BR display labels), mirroring the
 * `customer-mapping.ts` pattern for `/api/clients`.
 *
 * The BFF owns this translation in BOTH directions:
 *  - response: backend item → `PendenciaSummary` (rename + enum→label + nulls);
 *  - request:  filter params (display label → backend enum) so the list filter
 *    actually matches on the backend.
 */

// ---------------------------------------------------------------------------
// Backend contract (as returned by GET /v1/pendencias)
// ---------------------------------------------------------------------------

export interface BackendPendenciaListItem {
  id: string;
  code: string | null;
  opportunityId: string | null;
  titulo: string;
  tipo: string;
  origem: string | null;
  /** Token de máquina (`COMPLIANCE`) — é o valor que `?area=` compara. */
  area: string | null;
  /** Rótulo pt-BR (`Integridade`) — é o que a tela exibe. */
  areaDisplay?: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  status: string;
  prioridade: string;
  prazo: string | null;
  slaDias: number | null;
  /** Ausente num backend anterior ao ADO 67960 — ver `mapPendenciaListItem`. */
  slaFaixa?: string | null;
  abertaEm: string | null;
  clienteNome: string | null;
  opportunityCode: string | null;
  fase: string | null;
  canal: string | null;
  automatica: boolean;
  obrigatoria: boolean;
  responsavelDisplay: string | null;
  /** Absent on a backend that predates ADO 67911 — see `mapPendenciaListItem`. */
  acaoResolucao?: string | null;
  /** Absent on a backend that predates ADO 68190 — ver `mapPendenciaListItem`. */
  resolucaoPermitida?: boolean | null;
}

/**
 * `PorSeloDto` — an OBJECT with one counter per selo, not the array the panel
 * consumes (`[{ selo, total }]`). Both the shape difference and the field being
 * dropped by the mapper are why the "Críticas / Atenção / Em andamento" chips
 * rendered 0 forever while the backend computed real counts (VBR-431).
 */
interface BackendPorSelo {
  critica: number;
  atencao: number;
  andamento: number;
}

export interface BackendPendenciaListResponse {
  items: BackendPendenciaListItem[];
  total: number;
  /** Opcional só para tolerar backend anterior ao ADO 68150 — ver o mapper. */
  totalAtivas?: number | null;
  kpis: PendenciasKpis;
  porSelo?: BackendPorSelo | null;
}

// ---------------------------------------------------------------------------
// Enum translation — backend (UPPER) → frontend display label
// ---------------------------------------------------------------------------

const STATUS_TO_DISPLAY: Record<string, PendenciaStatus> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em tratativa',
  RESOLVIDA: 'Resolvida',
  CANCELADA: 'Cancelada',
};

const PRIORIDADE_TO_DISPLAY: Record<string, PendenciaPrioridade> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

const TIPO_TO_DISPLAY: Record<string, PendenciaTipo> = {
  DOCUMENTACAO: 'Documentação',
  ANALISE: 'Análise',
  APROVACAO: 'Aprovação',
  OUTRO: 'Outro',
};

// Reverse maps for filter params (frontend display → backend enum).
const STATUS_TO_BACKEND: Record<string, string> = invert(STATUS_TO_DISPLAY);
const PRIORIDADE_TO_BACKEND: Record<string, string> = invert(PRIORIDADE_TO_DISPLAY);

function invert(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
}

// ---------------------------------------------------------------------------
// Response mapping (backend → frontend)
// ---------------------------------------------------------------------------

export function mapPendenciaListItem(
  b: BackendPendenciaListItem,
): PendenciaSummary {
  return {
    id: b.id,
    code: b.code ?? '',
    title: b.titulo,
    clientName: b.clienteNome,
    opportunityCode: b.opportunityCode,
    opportunityId: b.opportunityId ?? '',
    fase: b.fase,
    responsavel: b.responsavelDisplay,
    // Rótulo, nunca o token. Cai no valor cru quando o backend não mandou o
    // rótulo (contrato anterior), para o gap ficar visível em vez de sumir.
    area: b.areaDisplay ?? b.area,
    // Unknown/absent enum values fall back to the raw string so nothing is
    // silently dropped — the card still renders a (raw) label.
    prioridade: (PRIORIDADE_TO_DISPLAY[b.prioridade] ??
      b.prioridade) as PendenciaPrioridade,
    status: (STATUS_TO_DISPLAY[b.status] ?? b.status) as PendenciaStatus,
    tipo: (TIPO_TO_DISPLAY[b.tipo] ?? b.tipo) as PendenciaTipo,
    canal: b.canal,
    slaDias: b.slaDias,
    /*
     * Valor fora do vocabulário (ou ausente) vira `null` — NUNCA um vizinho
     * plausível: `slaFaixa` é o que rotula a pill, e chutar a faixa afirmaria
     * na tela um prazo que ninguém apurou. `null` faz o rótulo degradar para a
     * derivação antiga por `slaDias` (ADO 67960).
     */
    slaFaixa: isSlaFaixa(b.slaFaixa) ? b.slaFaixa : null,
    automatica: b.automatica,
    // F7: only a MANDATORY open pendência blocks the release. This is a real
    // column, not "was it auto-generated" — the engine catalog marks just a
    // couple of triggers as obrigatória.
    obrigatoria: b.obrigatoria ?? false,
    /*
     * Same value (and same map) the ticket uses — the list CTA and the ticket
     * must agree on which flow closes the pendência (ADO 67911).
     *
     * Absent stays `undefined`, never the `mapAcaoResolucao` fallback: there it
     * means "unknown flow ⇒ offer nothing", which is right for a ticket that
     * would render a form, and wrong here — it would strip "Resolver" from
     * every row against an older backend. `podeResolverPendencia` reads the
     * absence as "can", the recoverable side.
     */
    acaoResolucao:
      b.acaoResolucao == null ? undefined : mapAcaoResolucao(b.acaoResolucao),
    /*
     * ADO 68190 — POSSE ("de quem é esta pendência?"), veredito do backend.
     *
     * Ausente fica `undefined`, nunca `false`: a ausência significa "backend
     * anterior ao campo", e um `false` ali tiraria o "Resolver" de TODA linha
     * contra um build antigo. `podeResolverPendencia` lê a ausência como
     * "pode", o lado recuperável — mesma disciplina de `acaoResolucao`.
     */
    resolucaoPermitida: b.resolucaoPermitida ?? undefined,
  };
}

export function mapPendenciaListResponse(
  b: BackendPendenciaListResponse,
): ListPendenciasResult {
  return {
    items: (b.items ?? []).map(mapPendenciaListItem),
    total: b.total,
    /*
     * ADO 68150 — o contador de "ainda pede ação", calculado pelo backend
     * porque a chamada do card do workspace de análise é paginada (`limit: 10`)
     * e um filtro no cliente daria as ativas DESTA PÁGINA.
     *
     * Ausente ⇒ backend anterior à entrega, e o fallback é `total`, ou seja o
     * comportamento antigo (SUPERCONTA). É deliberado: subcontar — filtrar
     * `items` aqui — esconderia trabalho que ainda pede ação, e esconder é o
     * lado errado de degradar. Superestimar faz o usuário abrir o painel e ver
     * que não há nada; subestimar faz ele não abrir.
     */
    totalAtivas: b.totalAtivas ?? b.total,
    // Map the KPI counters field-by-field (never a raw passthrough): a silent
    // field-name divergence here previously left the "Vencem hoje" card blank
    // (frontend read `vendemHoje`, backend sends `vencemHoje`).
    kpis: {
      abertas: b.kpis.abertas,
      atrasadas: b.kpis.atrasadas,
      vencemHoje: b.kpis.vencemHoje,
      concluidasSemana: b.kpis.concluidasSemana,
    },
    // Object → array, keyed by the same `Selo` values the chips filter by.
    // Absent (older backend) stays `undefined`: the panel then shows 0 counts,
    // which is the documented degradation — it is NOT the same as "zero
    // pendências crítica", so do not synthesise zeros here.
    porSelo: b.porSelo
      ? [
          { selo: Selo.Critica, total: b.porSelo.critica },
          { selo: Selo.Atencao, total: b.porSelo.atencao },
          { selo: Selo.Andamento, total: b.porSelo.andamento },
        ]
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Request mapping (frontend filter label → backend enum)
// ---------------------------------------------------------------------------

/**
 * Ticket PATCH payload (`PATCH /api/pendencias/:id`) → the backend DTO.
 *
 * The ticket screen speaks lowercase machine values (`em_andamento`, `alta`) so
 * it can key pill variants off them; the backend enums are uppercase. The route
 * used to forward the body **raw**, so every "Alterar status"/"Alterar
 * prioridade" answered `400 VALIDATION_ERROR: O campo status é inválido` —
 * the write path had no mapper while the read path did (CLAUDE.md: a BFF route
 * that returns a resource must map it in BOTH directions).
 *
 * Unknown values are dropped rather than forwarded: an enum the backend does not
 * know would come back as the same opaque 400, only later.
 */
export function mapPendenciaPatchToBackend(payload: {
  status?: string;
  prioridade?: string;
  prazo?: string | null;
  motivo?: string;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (payload.status) {
    const backend = invert(DETAIL_STATUS)[payload.status];
    if (backend) body.status = backend;
  }

  if (payload.prioridade) {
    const backend = invert(DETAIL_PRIORIDADE)[payload.prioridade];
    if (backend) body.prioridade = backend;
  }

  if (payload.prazo) body.prazo = payload.prazo;
  if (payload.motivo) body.motivo = payload.motivo;

  return body;
}

/** Translates a display `status` filter to the backend enum, or null if unknown. */
export function statusFilterToBackend(display: string): string | null {
  return STATUS_TO_BACKEND[display] ?? null;
}

/** Translates a display `prioridade` filter to the backend enum, or null if unknown. */
export function prioridadeFilterToBackend(display: string): string | null {
  return PRIORIDADE_TO_BACKEND[display] ?? null;
}

// ---------------------------------------------------------------------------
// Ticket detail — GET /v1/pendencias/:id (12a-pendencia-ticket.html)
// ---------------------------------------------------------------------------

/**
 * Backend contract of `PendenciaDetailDto`. Field names and enum casing differ
 * from what the ticket screen consumes, so — exactly like the list above — the
 * BFF owns the translation. Without it the screen renders empty authors, empty
 * messages and `Invalid Date`, because nothing in `PendenciaDetalhe` matches
 * `code`/`area`/`responsavelDisplay`/`autorNome`/`conteudo`/`createdAt`.
 */
export interface BackendPendenciaEvento {
  id: string;
  tipo: string;
  autorId: string;
  autorNome: string | null;
  conteudo: string | null;
  anexoNome: string | null;
  metadados: Record<string, unknown> | null;
  createdAt: string;
}

export interface BackendPendenciaParticipante {
  id: string;
  nome: string;
  papel: string;
  area?: string | null;
}

export interface BackendPendenciaDetail {
  id: string;
  code: string | null;
  opportunityId: string | null;
  titulo: string;
  descricao: string | null;
  tipo: string;
  origem: string | null;
  /** Token de máquina (`COMPLIANCE`) — nunca vai à tela. */
  area: string | null;
  /** Rótulo pt-BR (`Integridade`) — é o que a tela exibe. */
  areaDisplay?: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
  status: string;
  prioridade: string;
  prazo: string | null;
  slaDias: number | null;
  /** Ausente num backend anterior ao ADO 67960. */
  slaFaixa?: string | null;
  canais: string[] | null;
  abertaEm: string | null;
  anexoId: string | null;
  clienteNome: string | null;
  opportunityCode: string | null;
  fase: string | null;
  canal: string | null;
  responsavelDisplay: string | null;
  automatica: boolean;
  acaoResolucao: string;
  acaoResolucaoDetalhe?: string | null;
  /** Absent on a backend that predates ADO 68190. */
  resolucaoPermitida?: boolean | null;
  resolvidaEm: string | null;
  statusPermitidos?: string[];
  origemDisplay?: string | null;
  participantes: BackendPendenciaParticipante[];
  historico: BackendPendenciaEvento[];
}

/**
 * Ticket status/priority use lowercase machine values (the screen keys pill
 * variants off them), unlike the panel list which uses display labels.
 */
const DETAIL_STATUS: Record<string, PendenciaDetalheStatus> = {
  ABERTA: 'aberta',
  EM_ANDAMENTO: 'em_andamento',
  RESOLVIDA: 'resolvida',
  CANCELADA: 'cancelada',
};

const DETAIL_PRIORIDADE: Record<string, PendenciaDetalhePrioridade> = {
  BAIXA: 'baixa',
  MEDIA: 'media',
  ALTA: 'alta',
  URGENTE: 'urgente',
};

/**
 * `PendenciaEventoTipo` → the five thread kinds the ticket renders. `ABERTURA`
 * and `SISTEMA` both collapse to `sistema` (both are machine-authored entries
 * shown as the dashed `.msg.sys` strip of the prototype).
 */
const EVENTO_TIPO: Record<string, HistoricoTipo> = {
  ABERTURA: 'sistema',
  SISTEMA: 'sistema',
  COMENTARIO: 'comentario',
  MUDANCA_STATUS: 'status',
  REATRIBUICAO: 'reatribuicao',
  RESOLUCAO: 'resolucao',
};

/** ISO-8601 out of a backend timestamp; null-safe. */
function toIso(value: string | null): string | null {
  return value ?? null;
}

export function mapPendenciaEvento(
  b: BackendPendenciaEvento,
  /**
   * Owning pendência — the download route is scoped to it, and the backend
   * authorizes the attachment against that pendência's own thread.
   */
  pendenciaId?: string,
): HistoricoEntry {
  const anexoId = readAnexoId(b.metadados);

  return {
    id: b.id,
    tipo: EVENTO_TIPO[b.tipo] ?? 'sistema',
    criadoEm: b.createdAt,
    autorId: b.autorId,
    autor: b.autorNome,
    // `conteudo` is the thread body; an event with no text still renders a row,
    // so fall back to an empty string rather than dropping the entry.
    mensagem: b.conteudo ?? '',
    anexoNome: b.anexoNome,
    anexoUrl:
      pendenciaId && anexoId
        ? withBasePath(`/api/pendencias/${encodeURIComponent(pendenciaId)}/anexos/${encodeURIComponent(anexoId)}/view`)
        : null,
  };
}

/** Reads `metadados.anexoId` defensively — jsonb is untyped at the edge. */
function readAnexoId(metadados: Record<string, unknown> | null): string | null {
  const value = metadados?.anexoId;
  return typeof value === 'string' ? value : null;
}

export function mapPendenciaParticipante(
  b: BackendPendenciaParticipante,
): Participante {
  return { id: b.id, nome: b.nome, papel: b.papel, area: b.area ?? null };
}

const ACAO_RESOLUCAO: Record<string, AcaoResolucao> = {
  upload: 'upload',
  marcar: 'marcar',
  automatica: 'automatica',
  // GAR-9: backend now emits 'garantia' for INDICACAO_GARANTIA trigger pendências.
  garantia: 'garantia',
  // Parecer da Integridade (origem `ddi:parecer`) — resolvido pela decisão em
  // `ddi/reclassify`, nunca por `resolver` (que responde 400).
  ddi: 'ddi',
  // DDI reprovada devolvida ao LT (origem `ddi:reprovacao`) — encerra no pedido
  // de nova avaliação (`ddi/solicitar-revisao`), nunca por `resolver`. Sem esta
  // entrada o valor cairia no `?? 'automatica'` abaixo e a tela diria "resolução
  // automática" sobre a ÚNICA ação que destrava a oportunidade.
  ddi_revisao: 'ddi_revisao',
  // VBR-628: attached in the document Hub, in the real checklist slot — the
  // ticket only navigates there. Without this entry the value fell into the
  // `?? 'automatica'` fallback below and the screen said "resolução automática"
  // about a pendência a person very much has to act on.
  hub: 'hub',
  // Proposta devolvida pela SNEG — encerra no reenvio da proposta, não aqui.
  // Sem esta entrada o valor cairia no `?? 'automatica'` abaixo e a tela diria
  // "resolução automática" sobre uma tarefa que só o LT consegue cumprir.
  reenvio: 'reenvio',
  // ADO 67972: FAP / fotos do ponto da proposta de franquia — encerra no anexo
  // da própria proposta, nunca aqui. Sem esta entrada o valor cairia no
  // `?? 'automatica'` abaixo e a tela diria "resolução automática" sobre uma
  // tarefa que só o dono da proposta cumpre.
  franquia: 'franquia',
  /*
   * Roteamento da CCOB (04/09/2026): a análise prévia da garantia — encerra na
   * DECISÃO da CCOB, na tela de Garantia, nunca aqui.
   *
   * ⚠️ Sem esta entrada o valor caía no `?? 'automatica'` abaixo e a tela dizia
   * **"Resolução automática"** sobre uma análise que uma pessoa tem de fazer —
   * exatamente o defeito que o docblock abaixo previa, e que já custou o `hub`
   * (VBR-628). Medido na tela em 04/09/2026, antes deste conserto.
   */
  previa_garantia: 'previa_garantia',
  /*
   * ADO 68191 (04/09/2026): o parecer antecipado do time de franquias — encerra
   * na SUBMISSÃO do parecer, na proposta de franquia, nunca aqui.
   *
   * ⚠️ Sem esta entrada o valor cairia no `?? 'automatica'` abaixo e a tela
   * diria "Resolução automática" sobre um parecer que uma pessoa tem de emitir
   * — o mesmo defeito que já custou o `hub` (VBR-628) e a análise prévia.
   */
  franquia_parecer: 'franquia_parecer',
};

/**
 * Unknown values fall back to `automatica` — the state that offers NO resolve
 * control, so an unrecognised flow can never hand the user a button the API
 * would refuse.
 *
 * ⚠️ Safe, but silent: a value the backend added and this map did not learn
 * renders as "resolução automática", which is a confident lie about who closes
 * the pendência. That is exactly what happened to `hub` (VBR-628) — so a new
 * backend `AcaoResolucao` MUST be added above in the same change.
 */
function mapAcaoResolucao(raw: string): AcaoResolucao {
  return ACAO_RESOLUCAO[raw] ?? 'automatica';
}

export function mapPendenciaDetalhe(
  b: BackendPendenciaDetail,
): PendenciaDetalhe {
  return {
    id: b.id,
    codigo: b.code ?? '',
    titulo: b.titulo,
    descricao: b.descricao,

    status: DETAIL_STATUS[b.status] ?? 'aberta',
    // Unknown values are dropped, not defaulted: an option the machine does not
    // accept is worse than a missing one.
    statusPermitidos: (b.statusPermitidos ?? [])
      .map((value) => DETAIL_STATUS[value])
      .filter((value): value is PendenciaDetalheStatus => Boolean(value)),
    tipo: (TIPO_TO_DISPLAY[b.tipo] ?? b.tipo) as PendenciaTipo,
    // Explicit map, never a binary collapse: `automatica` used to fall into
    // `marcar`, which put a resolve button on a pendência whose `resolver`
    // endpoint answers 400 — the user pressed it and nothing happened.
    // Unknown value ⇒ `automatica`, the safest state (offers no mutation).
    acaoResolucao: mapAcaoResolucao(b.acaoResolucao),
    acaoResolucaoDetalhe: b.acaoResolucaoDetalhe ?? null,
    // Ver o campo homônimo em `mapPendenciaListItem` (ADO 68190).
    resolucaoPermitida: b.resolucaoPermitida ?? undefined,
    prioridade: DETAIL_PRIORIDADE[b.prioridade] ?? 'media',

    oportunidadeId: b.opportunityId,
    oportunidadeCodigo: b.opportunityCode,
    oportunidadeNome: b.clienteNome,
    fase: b.fase,

    responsavel: b.responsavelDisplay,
    /*
     * Rótulo, nunca o token — mesma regra (e mesmo fallback) do `area` da lista.
     * O bruto ainda serve como reserva para um backend anterior ao campo, para o
     * gap ficar visível em vez de sumir.
     */
    areaResponsavel: b.areaDisplay ?? b.area,
    canal: b.canal,
    /*
     * `origemDisplay` is the pt-BR label; `origem` is the machine discriminator
     * ("sneg:devolver", "engine:DOCUMENTO_AUSENTE") and must never reach the
     * screen. The backend owns the wording — the front does not translate it.
     */
    origem: b.origemDisplay ?? b.origem,
    /*
     * The machine discriminator, kept ALONGSIDE the label — never in place of
     * it. `origem` above is pt-BR prose ("Parecer da Integridade (DDI)"), so a
     * screen that needs to decide something (does this ticket carry a DDI
     * analysis?) had nothing to compare against and would have to match on
     * translated text.
     */
    origemCodigo: b.origem,

    abertaEm: toIso(b.abertaEm),
    prazo: toIso(b.prazo),
    resolvidaEm: toIso(b.resolvidaEm),

    historico: (b.historico ?? []).map((e) => mapPendenciaEvento(e, b.id)),
    participantes: (b.participantes ?? []).map(mapPendenciaParticipante),
  };
}

// ---------------------------------------------------------------------------
// Área — vocabulário do filtro (ADO 67912)
// ---------------------------------------------------------------------------

/** `PendenciaAreaOptionDto` de `GET /v1/pendencias/areas`. */
export interface BackendPendenciaAreaOption {
  value: string;
  label: string;
}

/**
 * Mapeia as opções do filtro de área.
 *
 * Item sem `value` é DESCARTADO: um `<option>` de valor vazio é o "Todas as
 * áreas" do placeholder, então deixá-lo passar criaria uma segunda entrada
 * que limpa o filtro em vez de aplicá-lo. Rótulo ausente degrada para o
 * token — nomear o gap é melhor que uma opção em branco.
 */
export function mapPendenciaAreaOptions(
  items: BackendPendenciaAreaOption[] | null | undefined,
): PendenciaAreaOption[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => typeof i?.value === 'string' && i.value.trim() !== '')
    .map((i) => ({ value: i.value, label: i.label?.trim() || i.value }));
}
