/**
 * Mapper for `GET /v1/dashboard/requer-acao` → `RequerAcaoData`.
 *
 * The backend returns items consolidated by persona (top-N); the mapper
 * narrows unknown `selo` and `agrupadoPor` values through type guards so no
 * unrecognised category ever reaches the component layer.
 *
 * Invariants:
 * - An unrecognised `selo` on an item becomes `null` (neutral pill); the item
 *   is still rendered. `null` is also what CCOB legitimately sends.
 * - `SeloCount` entries with unknown `selo` are silently discarded (a chip we
 *   cannot label is a chip we cannot offer). Entrada com `total: 0` é MANTIDA —
 *   chip zerado é informação ("não há nada crítico"), e descartá-lo fazia a
 *   faixa mudar de largura conforme o dia.
 * - Unknown `agrupadoPor` is coerced to `NENHUM` — the safest rendered state
 *   (flat list, always works regardless of what the backend sends).
 * - `acaoLabel: null` — or an API path this mapper cannot translate to a UI
 *   route — means no button is rendered.
 * - The deadline label is the backend's `slaLabel`, never recomputed here.
 * - No field the backend does not produce gets a "provisional" default string
 *   or number — those fields are `null` and the UI omits the element.
 *
 * (DASH-F3 / VBR-432)
 */

// ---------------------------------------------------------------------------
// Selo — verdict category
// ---------------------------------------------------------------------------

/**
 * Verdict categories for "Requer ação" items.
 * Mirrors the backend `RequerAcaoSelo` enum.
 *
 * ADR-0018: `selo` is a **verdict** → pill colouring is legitimate.
 * Token mapping (no hex in code):
 *   CRITICA  → --red-100 / --red-700     (prototype #FFB0BB)
 *   ATENCAO  → --yellow-100 / --yellow-700 (prototype #FAEFA7)
 *   ANDAMENTO → --blue-100 / --blue-700   (prototype #BEC2F2)
 */
export const Selo = {
  Critica: 'CRITICA',
  Atencao: 'ATENCAO',
  Andamento: 'ANDAMENTO',
} as const;

export type Selo = (typeof Selo)[keyof typeof Selo];

/** Narrows an unvalidated backend value to {@link Selo}. */
export function isSelo(value: unknown): value is Selo {
  return typeof value === 'string' && (Object.values(Selo) as string[]).includes(value);
}

/**
 * pt-BR display labels for each {@link Selo}.
 * Single source of truth — import instead of duplicating string literals in JSX.
 *
 * ⚠️ `Selo.Andamento` is **not** the `EM_ANDAMENTO` status. The seals are an
 * URGENCY bucketing computed from `prazo` + `prioridade` (backend
 * `PorSeloDto.andamento` = "ativas, dentro do prazo, não urgentes"), so the
 * bucket is full of pendências whose status is `ABERTA`. Labelling it
 * "Em andamento" borrowed a word the status vocabulary already owns, and the
 * chip read as a contradiction — a counter saying "Em andamento: 3" above three
 * rows each stamped "Aberta" (VBR-645).
 *
 * ⚠️ **"No prazo" repetiu o mesmo erro num terceiro vocabulário** (retest
 * 03/09/2026). O balde é `não-urgente · prazo > amanhã` **OU**
 * `não-urgente · prazo NULL` (`pendencia-selo-sql.ts`), e "No prazo" é
 * literalmente um valor de `SlaFaixa` — o mesmo que a pill de cada linha
 * exibe. Medido em staging: o chip dizia `No prazo 10` sobre dez linhas todas
 * marcadas **`Sem prazo`**. Pendência sem data não está "no prazo": ela não tem
 * prazo.
 *
 * "Sem urgência" nomeia o predicado real ("ativas, dentro do prazo, não
 * urgentes") sem tomar emprestada palavra do vocabulário de STATUS
 * (`Aberta`/`Em tratativa`) nem do de SLA (`No prazo`/`Sem prazo`/`Atrasada`).
 */
export const SELO_LABEL: Record<Selo, string> = {
  [Selo.Critica]: 'Críticas',
  [Selo.Atencao]: 'Atenção',
  [Selo.Andamento]: 'Sem urgência',
};

// ---------------------------------------------------------------------------
// AgrupadoPor — grouping mode driven by the backend persona verdict
// ---------------------------------------------------------------------------

/**
 * Grouping mode returned by the backend.
 * Mirrors the backend `RequerAcaoAgrupadoPor` enum.
 *
 * Rules:
 * - `GERENCIA` (CCOB): renders group subtitles (.pgrp); chips are hidden.
 * - `DDI`:            flat list; chips hidden; explanatory integrity note shown.
 * - `NENHUM`:         flat list with chips (default behaviour).
 * - Unknown value:    treated as `NENHUM` — safest rendered state (CA-4).
 *
 * IMPORTANT: never use `if (persona === 'CCOB')` — derive solely from
 * `agrupadoPor` returned by the backend.
 */
export const AgrupadoPor = {
  Gerencia: 'GERENCIA',
  Ddi: 'DDI',
  Nenhum: 'NENHUM',
} as const;

export type AgrupadoPor = (typeof AgrupadoPor)[keyof typeof AgrupadoPor];

/** Narrows an unvalidated backend value to {@link AgrupadoPor}. */
export function isAgrupadoPor(value: unknown): value is AgrupadoPor {
  return typeof value === 'string' && (Object.values(AgrupadoPor) as string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Backend shapes (explicit — no passthrough)
// ---------------------------------------------------------------------------

/**
 * A single "requer ação" item as the backend produces it.
 *
 * API Contract — VBR-432:
 *   GET /v1/dashboard/requer-acao
 */
export interface BackendRequerAcaoItem {
  id: string;
  titulo: string;
  /**
   * Human-readable context line — "<cliente> · <código da oportunidade>".
   *
   * ⚠️ The backend sends ONE joined string, not the `cliente` / `fase` pair
   * this interface used to declare. Both read `undefined`, so the meta line
   * under every title rendered empty.
   */
  contexto: string | null;
  /** Raw ISO date-time of the deadline, or null when none is set. */
  sla: string | null;
  /**
   * pt-BR deadline verdict already composed by the backend
   * ("Atrasada 2d", "Vence hoje", "Sem prazo").
   *
   * The label is the backend's to produce (`buildSlaLabel`) — the client must
   * not recompute it from `sla`, or the two drift and the card contradicts the
   * pendência screen.
   */
  slaLabel: string;
  /**
   * Raw urgency category — narrowed to {@link Selo} by the mapper.
   *
   * ⚠️ `null` is a legitimate answer, not a malformed one: CCOB prévia items
   * carry no urgency classification (`mapCcobRowToItem` always sends `null`).
   * Discarding null-seal items emptied the entire CCOB card.
   */
  selo: string | null;
  responsavel: string | null;
  /**
   * Backend API path of the item (`/v1/pendencias/{id}`, …) — NOT a UI route.
   * {@link toUiHref} translates it; an untranslatable path yields no button.
   */
  href: string | null;
  /**
   * Label for the action button (e.g. "Resolver", "Abrir", "Analisar").
   * `null` means the item is informative — no button is rendered (CA-5).
   */
  acaoLabel: string | null;
}

/**
 * A group of items grouped by gerência (CCOB persona).
 * Only present when `agrupadoPor === 'GERENCIA'`.
 */
export interface BackendRequerAcaoGrupo {
  /**
   * Group label as the backend names it — the field is `pgrp`, NOT `label`.
   *
   * ⚠️ It was declared here as `label` and mapped as `b.label`, so every group
   * arrived with `undefined`: the subtitle rendered empty, the `aria-label`
   * read "Pendências — undefined", and React warned about duplicate keys
   * because every key was the same `undefined`. The CCOB card exists to group
   * BY gerência (CA-1), so an unnamed group defeats the whole section.
   *
   * `null` when `agrupadoPor = NENHUM` (the single unlabelled bucket).
   */
  pgrp: string | null;
  itens: BackendRequerAcaoItem[];
}

/**
 * Raw shape of `GET /v1/dashboard/requer-acao`.
 *
 * API Contract — VBR-432:
 *   GET /v1/dashboard/requer-acao
 *   Response 200: DashboardRequerAcaoDto
 *   Response 401: { code: "UNAUTHORIZED" }
 *   Response 403: { code: "FORBIDDEN" }
 */
export interface BackendDashboardRequerAcao {
  /**
   * Full count for this persona — **not** the length of what is returned
   * (`grupos` carries a top-N slice).
   *
   * `null` means the source is degraded, and it is NOT the same fact as `0`:
   * zero is the backend asserting "nothing to do", null is it admitting it
   * could not tell. Collapsing null into 0 renders "Nada requer sua atenção"
   * over a failed query.
   */
  total: number | null;
  /**
   * Contagem por selo sobre o UNIVERSO — os chips (ADO 67965).
   *
   * ⚠️ O backend passou a enviar isto. Antes não enviava, e o mapper derivava
   * os chips dos itens **na tela**: com 5 itens de um universo de 22, a faixa
   * dizia `No prazo 1` ao lado de `Exibir todas (22)` — número que a própria
   * tela não explica, que é a segunda forma do defeito do ADO 67965. O
   * protótipo afirma o contrário (`01-visao-geral.html:124-128`):
   * `Críticas 6 · Atenção 3 · Em andamento 5` = `Exibir todas (14)`.
   *
   * Opcional para o mapper degradar (backend anterior, ou a agregação
   * indisponível) — ver {@link mapDashboardRequerAcao}.
   */
  porSelo?: { selo: string; total: number }[];
  /**
   * Grouping mode for the card — determines which render variation to use.
   * Absent / unknown → mapped to `NENHUM` (flat list with chips).
   */
  agrupadoPor?: string;
  /**
   * Items, ALWAYS inside groups — there is no root-level `itens` in the API.
   *
   * ⚠️ This interface used to declare one, and the flat-list personas
   * (LT, BP, SNEG, DDI) render from it: the card came back empty for every
   * persona but CCOB. For `NENHUM`/`DDI` the backend emits a single unlabelled
   * group (`pgrp: null`); the mapper flattens it into {@link RequerAcaoData.itens}.
   */
  grupos?: BackendRequerAcaoGrupo[];
  /** Degraded-source notes, when a query failed or timed out. */
  gaps?: BackendGap[];
}

/** One degraded-source note as the backend produces it. */
export interface BackendGap {
  secao: string;
  fonte: string;
  motivo: string;
}

// ---------------------------------------------------------------------------
// Frontend shapes (mapped)
// ---------------------------------------------------------------------------

/** Mapped per-category counter. */
export interface SeloCount {
  selo: Selo;
  total: number;
}

/** Mapped "requer ação" item. */
export interface RequerAcaoItem {
  id: string;
  titulo: string;
  /** Raw ISO deadline (drives `<time dateTime>`); null when none is set. */
  sla: string | null;
  /** pt-BR deadline verdict composed by the backend — rendered verbatim. */
  slaLabel: string;
  /**
   * Narrowed urgency category, or `null` when the persona classifies none
   * (CCOB). A null seal renders a neutral pill — never a colour that would
   * assert an urgency the backend did not state.
   */
  selo: Selo | null;
  /** Context line ("<cliente> · <código>"); null when the backend has none. */
  contexto: string | null;
  responsavel: string | null;
  /**
   * Button label; `null` → no button rendered (CA-5).
   * Do not render a disabled button — a permanent dead control is the
   * anti-pattern documented in `SendbarVeredito`.
   */
  acaoLabel: string | null;
  /** UI route translated from the backend API path; null → no button. */
  acaoHref: string | null;
}

/**
 * Mapped group of items (CCOB — `agrupadoPor === 'GERENCIA'`).
 */
export interface RequerAcaoGrupo {
  /**
   * Human-readable label, e.g. "Gerência · DREG2 · SP Capital".
   *
   * `null` for the unlabelled bucket the backend emits when
   * `agrupadoPor = NENHUM` — that branch renders a flat list, never groups, so
   * a null here must not print an empty subtitle.
   */
  label: string | null;
  /** Items in this group. */
  itens: RequerAcaoItem[];
}

/**
 * Frontend contract for the "Requer ação" card (DASH-F3 / HU-04).
 *
 * `total` is the full count across all categories; `itens` is the top-N
 * subset returned by the backend.  The UI shows `total` in the header link
 * ("Exibir todas (N) ›") and filters `itens` locally by chip selection.
 *
 * `agrupadoPor` controls which render variation is used:
 * - `GERENCIA` → group subtitles, no chips (CA-1 CCOB).
 * - `DDI`      → flat list with note, no chips (CA-2 DDI).
 * - `NENHUM`   → flat list with chips (default).
 */
export interface RequerAcaoData {
  /**
   * Full count of pending actions (not just the top-N shown).
   * `null` = the backend could not compute it — the card must say so instead
   * of rendering the empty state.
   */
  total: number | null;
  /**
   * Contadores por categoria da faixa de chips — o UNIVERSO, vindo do backend
   * (ADO 67965).
   *
   * ⚠️ **Não derive dos itens na tela.** Era o que este mapper fazia, e o
   * resultado era um chip dizendo `No prazo 1` ao lado de `Exibir todas (22)`.
   * O clique no chip passou a recortar no SERVIDOR
   * (`getDashboardRequerAcao(selo)`), então o chip e o que ele entrega voltam a
   * concordar — sem precisar mentir sobre o tamanho da categoria.
   *
   * `[]` quando a persona não tem chips (CCOB, DDI) ou quando a agregação
   * degradou: aí a faixa é **escondida**, nunca preenchida com números
   * inventados.
   */
  porSelo: SeloCount[];
  /**
   * Flat list of every item, in group order — the render source for the
   * `NENHUM` and `DDI` modes.
   */
  itens: RequerAcaoItem[];
  /**
   * Grouping mode — controls card render variation.
   * Unknown backend values are coerced to `NENHUM` (CA-4: unknown → safest state).
   */
  agrupadoPor: AgrupadoPor;
  /** Groups as sent; the `GERENCIA` mode renders these directly. */
  grupos: RequerAcaoGrupo[];
  /** Degraded-source notes; empty when everything answered. */
  gaps: Gap[];
}

/** Mapped degraded-source note. */
export interface Gap {
  secao: string;
  fonte: string;
  motivo: string;
}

// ---------------------------------------------------------------------------
// Field mappers
// ---------------------------------------------------------------------------

/**
 * Translates the backend API path of an item into the UI route that shows it.
 *
 * The backend emits its own REST paths (`/v1/pendencias/{id}`); it has no
 * business knowing Next.js routes, so the translation belongs here — the BFF
 * layer that already hides `customers`↔`clients` and the paginated envelope.
 *
 * An unrecognised path yields `null`, and the component then renders no button:
 * a dead link that 404s is worse than no affordance (same rule the sendbar
 * follows for `acaoLabel: null`).
 */
export function toUiHref(href: string | null): string | null {
  if (!href) return null;

  const pendencia = /^\/v1\/pendencias\/([^/]+)$/.exec(href);
  if (pendencia) return `/pendencias/${pendencia[1]}`;

  const garantia = /^\/v1\/opportunities\/([^/]+)\/garantia(\/.*)?$/.exec(href);
  if (garantia) return `/oportunidades/${garantia[1]}/garantia`;

  // The DDI panel lives inside the analysis screen — it has no route of its own.
  const ddi = /^\/v1\/opportunities\/([^/]+)\/ddi$/.exec(href);
  if (ddi) return `/oportunidades/${ddi[1]}/analise`;

  return null;
}

function mapItem(b: BackendRequerAcaoItem): RequerAcaoItem {
  return {
    id: b.id,
    titulo: b.titulo,
    sla: b.sla ?? null,
    slaLabel: b.slaLabel ?? 'Sem prazo',
    // `null` seal = persona states no urgency (CCOB). Only an unrecognised
    // non-null value is dropped — a category we cannot colour must not be
    // guessed into one we can.
    selo: isSelo(b.selo) ? b.selo : null,
    contexto: b.contexto ?? null,
    responsavel: b.responsavel ?? null,
    acaoLabel: b.acaoLabel ?? null,
    acaoHref: toUiHref(b.href ?? null),
  };
}

function mapGrupo(b: BackendRequerAcaoGrupo): RequerAcaoGrupo {
  return {
    label: b.pgrp ?? null,
    itens: (b.itens ?? []).map(mapItem),
  };
}

// ---------------------------------------------------------------------------
// Root mapper
// ---------------------------------------------------------------------------

/**
 * Maps the raw `GET /v1/dashboard/requer-acao` payload to the typed
 * {@link RequerAcaoData} frontend contract.
 *
 * Invariants:
 * - `porSelo` é o universo que o BACKEND contou — nunca derivado dos itens na
 *   tela (ADO 67965). Ausente ou irreconhecível ⇒ `[]`, e o card esconde a faixa.
 * - Unknown `selo` on an item → `null` (neutral pill); the item still renders.
 * - Unknown or absent `agrupadoPor` → coerced to `NENHUM` (CA-4 safe default).
 * - `grupos` only mapped when present; `itens` is their flattening.
 * - `total: null` stays null — a degraded source is not an empty one.
 * - `acaoLabel: null` → preserved as-is (component renders no button).
 * - `href` → translated to a UI route; untranslatable → `null` (no button).
 */
export function mapDashboardRequerAcao(raw: BackendDashboardRequerAcao): RequerAcaoData {
  const grupos: RequerAcaoGrupo[] = (raw.grupos ?? []).map(mapGrupo);

  // The API keeps every item inside a group, including the single unlabelled
  // one it emits for the flat modes. Flatten once here so the component can
  // keep rendering `itens` for NENHUM/DDI and `grupos` for GERENCIA.
  const itens = grupos.flatMap((g) => g.itens);

  /*
   * Chips: o universo que o backend contou. Entrada com selo irreconhecível é
   * descartada (um chip que não sabemos rotular é um chip que não podemos
   * oferecer) e a ordem é a do vocabulário, não a do payload.
   *
   * ⚠️ Ausente ⇒ faixa VAZIA, nunca derivada dos itens: derivar é exatamente o
   * que produzia `No prazo 1` sobre `Exibir todas (22)`, e um número errado é
   * pior que faixa nenhuma. `[]` faz o card esconder os chips.
   */
  const porSeloBackend = new Map<Selo, number>();
  for (const entry of raw.porSelo ?? []) {
    if (isSelo(entry?.selo) && typeof entry.total === 'number') {
      porSeloBackend.set(entry.selo, entry.total);
    }
  }
  const porSelo: SeloCount[] =
    porSeloBackend.size > 0
      ? (Object.values(Selo) as Selo[])
          .filter((selo) => porSeloBackend.has(selo))
          .map((selo) => ({ selo, total: porSeloBackend.get(selo) as number }))
      : [];

  // CA-4: unknown agrupadoPor → NENHUM (safest rendered state: flat list with chips).
  const agrupadoPor: AgrupadoPor = isAgrupadoPor(raw.agrupadoPor)
    ? raw.agrupadoPor
    : AgrupadoPor.Nenhum;

  return {
    // `?? null`, never `?? 0` — see BackendDashboardRequerAcao.total.
    total: typeof raw.total === 'number' ? raw.total : null,
    porSelo,
    itens,
    agrupadoPor,
    grupos,
    gaps: (raw.gaps ?? []).map((g) => ({
      secao: g.secao,
      fonte: g.fonte,
      motivo: g.motivo,
    })),
  };
}
