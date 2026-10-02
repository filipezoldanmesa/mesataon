/**
 * Mapper for `GET /v1/dashboard/resumo` → `DashboardResumo`.
 *
 * The backend returns Portuguese field names and raw enum strings; the mapper
 * translates them to the frontend contract and narrows every enum through the
 * appropriate type guard.  Unknown values always fall to the safest rendered
 * state (null / omitted) — never to a hard-coded fallback that is
 * indistinguishable from real data.
 *
 * Rule: no field that the backend does not produce gets a "provisional" default.
 * Fields the backend does not yet send are mapped to `null`; the UI omits the
 * element rather than rendering an invented value.
 */

import {
  type DashboardWidget,
  type Persona,
  type Recorte,
  isDashboardWidget,
  isPersona,
  isRecorte,
} from './types';

// ---------------------------------------------------------------------------
// Backend shapes (explicit — no passthrough)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Section result — per-section status (CA-5)
// ---------------------------------------------------------------------------

/**
 * Each data section from the backend can arrive as a successful payload or as
 * an error that names the integration source.  Components must render an error
 * state that names `fonte` (CA-5) — never a silent "-" nor a missing card.
 */
export type SectionResult<T> =
  | {
      status: 'ok';
      items: T[];
      /**
       * Frase pronta do backend dizendo DE QUEM são os dados desta seção
       * (`escopoLabel`).  `null` quando a seção não declara escopo — a tela
       * então não escreve nada, nunca uma frase inventada aqui.
       */
      escopoLabel?: string | null;
    }
  | { status: 'error'; fonte: string; escopoLabel?: string | null };

// ---------------------------------------------------------------------------
// Backend shapes (explicit — no passthrough)
// ---------------------------------------------------------------------------

/** A single KPI card as the backend produces it. */
export interface BackendKpiItem {
  rotulo: string;
  valor: number | null;
  unidade: string | null;
  variacao: number | null;
}

/** An "action required" item from the backend. */
export interface BackendAcaoItem {
  id: string;
  tipo: string;
  descricao: string;
  dataLimite: string | null;
  oportunidadeId: string | null;
}

/** A top-opportunity row from the backend. */
export interface BackendOportunidadeItem {
  id: string;
  codigo: string | null;
  nomeCliente: string | null;
  fase: string;
  valorEstimado: number | null;
}

/** A pipeline bucket (one row per phase) from the backend. */
export interface BackendPipelineItem {
  fase: string;
  quantidade: number;
  valorTotal: number | null;
}

/** A pending task from the backend. */
export interface BackendPendenciaItem {
  id: string;
  tipo: string;
  descricao: string;
  dataLimite: string | null;
}

/**
 * One row of the "Oportunidades por atributo" card (F1 · VBR-423).
 * Shape: `ItemPorAtributoDto` in `openapi.yaml`.
 *
 * There is no `percentual` on the wire — the bar proportion is derived here
 * (see {@link mapAtributoSection}).
 */
export interface BackendAtributoItem {
  /** Machine value (`BR_MANIA`) — for keys and logic, never for display. */
  atributo: string;
  /** pt-BR label produced by the backend — this is what the card renders. */
  label: string;
  total: number;
}

/**
 * One row of the "Distribuição por analista" card (F1 · VBR-423).
 * Shape: `ItemPorAnalistaDto` in `openapi.yaml`.
 *
 * `analistaNome: null` is the "sem analista" line — business content
 * (RN-F1-01 assignment pending), never an error.
 */
export interface BackendAnalistaItem {
  analistaId: string | null;
  analistaNome: string | null;
  total: number;
}

/**
 * The raw shape of `GET /v1/dashboard/resumo`.
 *
 * Declared explicitly — `NextResponse.json(await res.json())` compiles fine
 * but ships two kinds of defect: empty fields when the backend key renames and
 * `Invalid Date` when a date string turns out to be null.  Every field here is
 * the exact name the backend sends.
 *
 * API Contract — VBR-422:
 *
 *   GET /v1/dashboard/resumo
 *   Response 200: BackendDashboardResumo
 *   Response 401: { code: "UNAUTHORIZED" }
 *   Response 403: { code: "FORBIDDEN" }
 */
export interface BackendDashboardResumo {
  persona: string;
  nomeUsuario: string | null;
  /**
   * ⚠️ **Não existe no topo da resposta** — o backend põe o recorte dentro de
   * `saudacao` (`SaudacaoDto.recorte`). Declarado aqui apenas para o campo
   * legado não sumir sem registro; quem lê é `saudacao.recorte`, com este como
   * reserva. Era a SEGUNDA razão de o recorte chegar sempre `null` (a primeira
   * era o enum divergente — ver {@link Recorte}).
   */
  recorte?: string;
  /** Widget ids visible for this persona/recorte combination. */
  widgets: string[];
  /** Greeting context — null when the backend cannot resolve critical counts (CA-4). */
  saudacao: {
    itensCriticos: number | null;
    tarefasAbertas: number | null;
    /** Recorte da persona (RN-F1-03) — `CARTEIRA` | `AREA`. */
    recorte?: string;
  } | null;
  kpis: BackendKpiItem[];
  requerAcao: BackendAcaoItem[];
  principaisOportunidades: BackendOportunidadeItem[];
  pipeline: BackendPipelineItem[];
  pendencias: BackendPendenciaItem[];
  /**
   * F1 · VBR-423 — count per composition attribute.
   *
   * The section is self-describing: it carries its own `status` and `gaps`, and
   * `itens` is `[]` (never absent) when `status = 'error'` (CA-4).  The card is
   * only rendered when `widgets` contains `OPORTUNIDADES_POR_ATRIBUTO`.
   */
  porAtributo: BackendSecao<BackendAtributoItem> | null;
  /**
   * F1 · VBR-423 — distribution per SNEG analyst.
   * `null` for personas without the `POR_ANALISTA` widget (cost avoided, CA-3).
   */
  porAnalista: BackendSecao<BackendAnalistaItem> | null;
}

/**
 * Envelope every self-describing section uses (`PorAtributoDto` /
 * `PorAnalistaDto`).  `gaps` names the unavailable source when `status` is
 * `error` — that is where the fonte shown on screen comes from.
 */
export interface BackendSecao<T> {
  status: 'ok' | 'error';
  itens: T[];
  gaps?: { secao?: string; fonte?: string; motivo?: string }[];
  /**
   * Rótulo pt-BR do recorte da seção, composto no backend
   * (`PorAtributoDto.escopoLabel` — pedido de 20/09/2026).  Ausente nas seções
   * que não declaram escopo, e o card simplesmente não o imprime.
   */
  escopoLabel?: string;
}

// ---------------------------------------------------------------------------
// Frontend shapes (mapped)
// ---------------------------------------------------------------------------

/** Mapped KPI card. */
export interface KpiItem {
  label: string;
  valor: number | null;
  unidade: string | null;
  /** Percentage change (positive = growth); null when the backend does not send it. */
  variacao: number | null;
}

/** Mapped "action required" item. */
export interface AcaoItem {
  id: string;
  tipo: string;
  descricao: string;
  dataLimite: string | null;
  oportunidadeId: string | null;
}

/** Mapped top-opportunity row. */
export interface OportunidadeItem {
  id: string;
  code: string | null;
  nomeCliente: string | null;
  fase: string;
  valorEstimado: number | null;
}

/** Mapped pipeline bucket. */
export interface PipelineItem {
  fase: string;
  quantidade: number;
  valorTotal: number | null;
}

/** Mapped pending task. */
export interface PendenciaItem {
  id: string;
  tipo: string;
  descricao: string;
  dataLimite: string | null;
}

/** Mapped row of the "Oportunidades por atributo" card. */
export interface AtributoItem {
  /** Machine value (`BR_MANIA`) — React key and conditional logic only. */
  atributo: string;
  /** pt-BR label from the backend — the only value the card may print. */
  label: string;
  quantidade: number;
  /** Proportion [0–100] for bar width, derived from the largest count. */
  percentual: number;
}

/** Mapped row of the "Distribuição por analista" card. */
export interface AnalistaItem {
  /** null → rendered as "Sem analista" in --red-700. */
  nomeAnalista: string | null;
  quantidade: number;
  /** Proportion [0–100] for bar width. */
  percentual: number;
}

/**
 * Frontend contract for the executive summary dashboard (F1 — DASH-F1).
 *
 * `persona` and `recorte` are `null` when the backend sends an unrecognised
 * value — components must treat null as "unknown / hide persona-specific UI"
 * rather than guessing a persona.
 *
 * `widgets` contains only the known {@link DashboardWidget} values from the
 * backend array; unknown identifiers are silently discarded (CA-3) so a new
 * widget deployed on the backend does not crash the frontend.
 */
export interface DashboardResumo {
  /** Narrowed persona; null when the value is not in the enum. */
  persona: Persona | null;
  nomeUsuario: string | null;
  /** Narrowed recorte; null when the value is not in the enum. */
  recorte: Recorte | null;
  /** Known widgets only — unknown identifiers are discarded. */
  widgets: DashboardWidget[];
  /**
   * Greeting context — null when the backend cannot provide critical counts.
   * A null means the phrase is suppressed entirely (CA-4): not "0 itens críticos"
   * but nothing at all.
   */
  saudacao: {
    itensCriticos: number | null;
    tarefasAbertas: number | null;
  } | null;
  kpis: KpiItem[];
  requerAcao: AcaoItem[];
  principaisOportunidades: OportunidadeItem[];
  pipeline: PipelineItem[];
  pendencias: PendenciaItem[];
  /** F1 · VBR-423 — null when not included for this persona. */
  oportunidadesPorAtributo: SectionResult<AtributoItem> | null;
  /** F1 · VBR-423 — null when not included for this persona. */
  distribuicaoPorAnalista: SectionResult<AnalistaItem> | null;
}

// ---------------------------------------------------------------------------
// Field mappers
// ---------------------------------------------------------------------------

function mapKpi(b: BackendKpiItem): KpiItem {
  return {
    label: b.rotulo,
    valor: b.valor ?? null,
    unidade: b.unidade ?? null,
    variacao: b.variacao ?? null,
  };
}

function mapAcao(b: BackendAcaoItem): AcaoItem {
  return {
    id: b.id,
    tipo: b.tipo,
    descricao: b.descricao,
    dataLimite: b.dataLimite ?? null,
    oportunidadeId: b.oportunidadeId ?? null,
  };
}

function mapOportunidade(b: BackendOportunidadeItem): OportunidadeItem {
  return {
    id: b.id,
    code: b.codigo ?? null,
    nomeCliente: b.nomeCliente ?? null,
    fase: b.fase,
    valorEstimado: b.valorEstimado ?? null,
  };
}

function mapPipeline(b: BackendPipelineItem): PipelineItem {
  return {
    fase: b.fase,
    quantidade: b.quantidade,
    valorTotal: b.valorTotal ?? null,
  };
}

function mapPendencia(b: BackendPendenciaItem): PendenciaItem {
  return {
    id: b.id,
    tipo: b.tipo,
    descricao: b.descricao,
    dataLimite: b.dataLimite ?? null,
  };
}

/**
 * Bar proportion for a set of counts.
 *
 * Normalised by the **largest** count, not by their sum: the attribute counts
 * are explicitly NOT mutually exclusive (one opportunity may hold a posto AND
 * a BR Mania franchise — FRQ-F1), so a share-of-total would assert an addition
 * the backend forbids.  Share-of-max is a comparison between bars, and the
 * absolute number is printed next to each one anyway.
 *
 * Every count zero → every bar zero (no division by zero, no full bars).
 */
export function proportions(totals: number[]): number[] {
  const max = Math.max(0, ...totals);
  return totals.map((t) => (max === 0 ? 0 : Math.round((t / max) * 100)));
}

/** Reads the fonte a degraded section names in its `gaps` (CA-4/CA-5). */
function sectionFonte(raw: { gaps?: { fonte?: string }[] } | null | undefined): string {
  return raw?.gaps?.find((g) => g.fonte)?.fonte ?? 'dashboard/resumo';
}

/** Narrows the recorte, mantendo `null` para valor desconhecido ou ausente. */
function mapRecorte(value: string | undefined): Recorte | null {
  return isRecorte(value) ? value : null;
}

/**
 * Maps a nullable backend section (ok | error | absent) to the frontend
 * {@link SectionResult} contract.  `null` in → `null` out (widget not sent
 * for this persona).
 *
 * `status: 'error'` always wins over the items array: the backend sends
 * `itens: []` in that case, and rendering it as an empty "ok" would read as
 * "nenhum dado" — a business statement — instead of a degraded source.
 */
function mapSection<B, F>(
  raw: BackendSecao<B> | null | undefined,
  mapper: (items: B[]) => F[],
): SectionResult<F> | null {
  if (!raw) return null;
  /*
   * O escopo acompanha os dois desfechos: quando a seção degrada, dizer de quem
   * seria o número é o que separa "você não tem nada" de "a fonte caiu".
   *
   * A chave só existe quando o backend a manda — seção sem escopo continua com
   * exatamente a forma de antes, e o card não tem o que imprimir.
   */
  const escopo = raw.escopoLabel ? { escopoLabel: raw.escopoLabel } : {};
  if (raw.status === 'error') {
    return { status: 'error', fonte: sectionFonte(raw), ...escopo };
  }
  return { status: 'ok', items: mapper(raw.itens ?? []), ...escopo };
}

function mapAtributos(itens: BackendAtributoItem[]): AtributoItem[] {
  const pct = proportions(itens.map((i) => i.total));
  return itens.map((b, i) => ({
    atributo: b.atributo,
    label: b.label,
    quantidade: b.total,
    percentual: pct[i],
  }));
}

function mapAnalistas(itens: BackendAnalistaItem[]): AnalistaItem[] {
  const pct = proportions(itens.map((i) => i.total));
  return itens.map((b, i) => ({
    // `null` is the "sem analista" line — the card renders its own red label.
    nomeAnalista: b.analistaNome ?? null,
    quantidade: b.total,
    percentual: pct[i],
  }));
}

// ---------------------------------------------------------------------------
// Root mapper
// ---------------------------------------------------------------------------

/**
 * Maps the raw backend `GET /v1/dashboard/resumo` payload to the typed
 * {@link DashboardResumo} frontend contract.
 *
 * Invariants:
 * - Unknown `persona` → `null` (components hide persona-specific UI).
 * - Unknown `recorte` → `null` (components show no scope label).
 * - Unknown widget in `widgets` → discarded (known widgets still render).
 * - No field the backend does not produce gets a "provisional" default string
 *   or number — those fields are `null` and the UI omits the element.
 */
export function mapDashboardResumo(raw: BackendDashboardResumo): DashboardResumo {
  return {
    persona: isPersona(raw.persona) ? raw.persona : null,
    nomeUsuario: raw.nomeUsuario ?? null,
    // `saudacao.recorte` é onde o backend de fato o põe; `raw.recorte` fica como
    // reserva para não quebrar caso ele volte ao topo da resposta.
    recorte: mapRecorte(raw.saudacao?.recorte ?? raw.recorte),
    // CA-3: unknown widget ids are silently discarded; known ones pass through.
    widgets: (raw.widgets ?? []).filter(isDashboardWidget),
    // CA-4: null saudacao → no phrase rendered (not even "0 itens críticos").
    saudacao: raw.saudacao ?? null,
    kpis: (raw.kpis ?? []).map(mapKpi),
    requerAcao: (raw.requerAcao ?? []).map(mapAcao),
    principaisOportunidades: (raw.principaisOportunidades ?? []).map(mapOportunidade),
    pipeline: (raw.pipeline ?? []).map(mapPipeline),
    pendencias: (raw.pendencias ?? []).map(mapPendencia),
    oportunidadesPorAtributo: mapSection(raw.porAtributo, mapAtributos),
    distribuicaoPorAnalista: mapSection(raw.porAnalista, mapAnalistas),
  };
}
