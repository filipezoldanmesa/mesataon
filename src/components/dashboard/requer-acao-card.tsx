'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { DashboardCard, SectionHead } from './dashboard-card';

import { getDashboardRequerAcao } from '@/lib/dashboard/requer-acao.api';
import {
  AgrupadoPor,
  SELO_LABEL,
  Selo,
  type RequerAcaoData,
  type RequerAcaoGrupo,
  type RequerAcaoItem,
  type SeloCount,
} from '@/lib/dashboard/requer-acao-mapping';

// ---------------------------------------------------------------------------
// Color tokens by selo (no hex in code — tokens only)
//   CRITICA   → --red-100 / --red-700     (prototype #FFB0BB)
//   ATENCAO   → --yellow-100 / --yellow-700 (prototype #FAEFA7)
//   ANDAMENTO → --blue-100 / --blue-700   (prototype #BEC2F2)
// ---------------------------------------------------------------------------

const SELO_CLASSES: Record<Selo, { bg: string; text: string }> = {
  [Selo.Critica]: { bg: 'bg-(--red-100)', text: 'text-(--red-700)' },
  [Selo.Atencao]: { bg: 'bg-(--yellow-100)', text: 'text-(--yellow-700)' },
  [Selo.Andamento]: { bg: 'bg-(--blue-100)', text: 'text-(--blue-700)' },
};

/**
 * Pill styling for an item the persona classifies with no urgency (CCOB).
 * Neutral on purpose: any of the three colours above would assert an urgency
 * the backend never stated.
 */
const SELO_NEUTRO = { bg: 'bg-(--neutral-50)', text: 'text-(--color-text-muted)' };

/** Stable rendering order for the chip row — critical first. */
const SELO_ORDER: Selo[] = [Selo.Critica, Selo.Atencao, Selo.Andamento];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string (YYYY-MM-DD) to DD/MM/YYYY (pt-BR).
 * Falls back to the raw string when the value is not parseable.
 * Returns '—' for null (no deadline set).
 */
function seloCountFor(porSelo: SeloCount[], selo: Selo): number {
  return porSelo.find((s) => s.selo === selo)?.total ?? 0;
}

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando pendências que requerem ação…"
      className="space-y-3"
    >
      {/* Chip skeleton row */}
      <div className="flex flex-wrap gap-2">
        {[96, 80, 120].map((w, i) => (
          <div
            key={i}
            style={{ width: w }}
            className="h-[28px] animate-pulse rounded-full bg-(--neutral-100)"
          />
        ))}
      </div>
      {/* Item skeletons */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-[56px] animate-pulse rounded-(--radius-xs) bg-(--neutral-100)" />
      ))}
    </div>
  );
}

/**
 * Degraded state — the source answered partially or not at all.
 *
 * Attention, never danger: nothing is broken for the user to fix, and the
 * items that did arrive are still rendered below this note.
 */
function DegradedState({ gaps }: { gaps: { fonte: string; motivo: string }[] }) {
  return (
    <p className="mb-3 rounded-(--radius-xs) border border-(--yellow-700) bg-(--yellow-100) px-3 py-2 text-(length:--t-caption) text-(--yellow-700)">
      {gaps.length > 0
        ? `Lista incompleta — ${gaps.map((g) => g.fonte).join(', ')} não respondeu.`
        : 'Não foi possível contar todas as pendências; a lista pode estar incompleta.'}
    </p>
  );
}

/**
 * Error state — visually distinct from "empty", names the integration source
 * (CA-4).  Never shown when total is merely 0.
 */
function FetchErrorState() {
  return (
    <p
      role="alert"
      className="rounded-(--radius-xs) border border-(--color-danger-bg) bg-(--color-danger-bg) py-4 text-center text-(length:--t-caption) text-(--color-danger)"
    >
      Falha ao carregar dados de{' '}
      <span className="font-bold">dashboard/requer-acao</span>. Tente novamente mais tarde.
    </p>
  );
}

/**
 * Empty state — neutral tone, is content not an error (CA-3).
 * The header link to /pendencias remains visible.
 */
function EmptyState() {
  return (
    <p className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Nada requer sua ação.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Item row
// ---------------------------------------------------------------------------

function ItemRow({ item }: { item: RequerAcaoItem }) {
  const { bg, text } = item.selo ? SELO_CLASSES[item.selo] : SELO_NEUTRO;
  const meta = [item.contexto, item.responsavel].filter(Boolean).join(' · ');

  return (
    <li className="flex items-start gap-3 border-b border-(--color-border) py-3 last:border-none">
      {/*
        Prazo pill — verdict colouring is legitimate for the selo (ADR-0018).
        The text is the backend's `slaLabel` ("Atrasada 2d", "Sem prazo"),
        rendered verbatim: recomputing it here would let this card and the
        pendência screen disagree about the same deadline.
      */}
      <span
        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${bg} ${text}`}
      >
        {item.sla ? <time dateTime={item.sla}>{item.slaLabel}</time> : item.slaLabel}
      </span>

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-(length:--t-caption) font-bold leading-snug">{item.titulo}</p>
        {meta && (
          <p className="truncate text-(length:--t-small) text-(--color-text-muted)">{meta}</p>
        )}
      </div>

      {/*
        Action — navigation only; no write mutation.
        `acaoLabel: null` → no button rendered (CA-5).
        Never render a permanently disabled button — permanent dead controls
        are the anti-pattern documented in SendbarVeredito.
      */}
      {item.acaoLabel !== null && item.acaoHref !== null && (
        <Link
          href={item.acaoHref}
          className="shrink-0 rounded-(--radius-xxs) border border-(--secondary-500) bg-(--neutral-25) px-3 py-1 text-(length:--t-small) font-bold text-(--secondary-500) transition hover:bg-(--neutral-50)"
        >
          {item.acaoLabel}
        </Link>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Chip row (shown only when agrupadoPor === NENHUM)
// ---------------------------------------------------------------------------

type ChipRowProps = {
  porSelo: SeloCount[];
  active: Selo | null;
  onToggle: (selo: Selo) => void;
  /** Refetch em voo — desabilita os chips para não enfileirar dois recortes. */
  busy: boolean;
};

/**
 * Filter chips — one per {@link Selo} the backend counted, in severity order.
 *
 * A contagem é o **universo** daquela categoria, vinda do backend (ADO 67965):
 * o card renderiza top-5 de um universo que pode ter 22, então derivar o número
 * dos itens na tela dizia `No prazo 1` ao lado de `Exibir todas (22)`. O
 * protótipo afirma a decomposição do total (`01-visao-geral.html:124-128`:
 * `Críticas 6 · Atenção 3 · Em andamento 5` = 14).
 *
 * Pressing a chip sets the active filter; pressing the same chip again clears
 * it. O recorte acontece no **servidor** — é o que permite o chip contar o
 * universo e ainda assim entregar o que promete. É uma **medida**, então o
 * número tem renderização neutra (ADR-0018).
 *
 * ⚠️ Só renderiza os selos que o backend enviou. Faixa vazia (`porSelo: []` —
 * agregação degradada) não é preenchida com zeros: a faixa some, e a lista
 * continua. Chip que o backend contou como `0` **fica** — "não há nada crítico"
 * é informação.
 *
 * Hidden when `agrupadoPor !== NENHUM`: chips are a UI affordance for the flat
 * list only — derive from `agrupadoPor`, not from persona directly.
 */
function ChipRow({ porSelo, active, onToggle, busy }: ChipRowProps) {
  return (
    <div
      className="mb-3 flex flex-wrap gap-2"
      role="group"
      aria-label="Filtrar por categoria de pendência"
    >
      {SELO_ORDER.filter((selo) => porSelo.some((c) => c.selo === selo)).map((selo) => {
        const count = seloCountFor(porSelo, selo);
        const { bg, text } = SELO_CLASSES[selo];
        const isActive = active === selo;

        return (
          <button
            key={selo}
            type="button"
            onClick={() => onToggle(selo)}
            aria-pressed={isActive}
            disabled={busy}
            aria-label={`${SELO_LABEL[selo]}: ${count}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-(length:--t-small) font-bold transition disabled:opacity-50
              ${isActive
                ? `${bg} ${text} ring-2 ring-inset ring-current`
                : `${bg} ${text} opacity-75 hover:opacity-100`
              }`}
          >
            {SELO_LABEL[selo]}
            {/* count = measure → neutral weight, on the prototype's white .cbadge */}
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--neutral-0) px-1.5 font-normal">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CCOB grouped view (agrupadoPor === GERENCIA)
// ---------------------------------------------------------------------------

/**
 * Renders a single gerência group with its subtitle and item list.
 * Used only when `agrupadoPor === 'GERENCIA'` — chips are hidden in this mode.
 */
function GrupoSection({ grupo }: { grupo: RequerAcaoGrupo }) {
  return (
    <div className="mb-3">
      {/* Group subtitle (.pgrp from prototype). Rendered only when the backend
          named the group — an unlabelled bucket would otherwise print an empty
          bold line that reads as a missing gerência. */}
      {grupo.label && (
        <p className="mb-1 text-(length:--t-small) font-bold uppercase tracking-wide text-(--color-text-muted)">
          {grupo.label}
        </p>
      )}
      {grupo.itens.length > 0 ? (
        <ul aria-label={grupo.label ? `Pendências — ${grupo.label}` : 'Pendências que requerem ação'}>
          {grupo.itens.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="py-2 text-(length:--t-small) text-(--color-text-muted)">
          Nenhuma pendência nesta gerência.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DDI note (agrupadoPor === DDI)
// ---------------------------------------------------------------------------

/**
 * Explanatory note shown in DDI mode — informs that medium/high-risk findings
 * automatically open an integrity pendency (no chip, no group subtitle).
 */
function DdiNote() {
  return (
    <p className="mb-3 rounded-(--radius-xs) bg-(--neutral-40) px-3 py-2 text-(length:--t-small) text-(--color-text-muted)">
      Risco médio/alto abre pendência de integridade automaticamente.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /**
   * Injectable data source for tests.
   * Defaults to the configured BFF client (`getDashboardRequerAcao`).
   *
   * Recebe o `selo` do chip ativo (ADO 67965): o recorte é do SERVIDOR, porque
   * o card tem top-5 de um universo maior — filtrar os 5 já baixados entregaria
   * 1 item sob um chip que diz 18.
   *
   * ```tsx
   * render(<RequerAcaoCard fetchData={() => Promise.resolve(mockData)} />);
   * render(<RequerAcaoCard fetchData={() => Promise.reject(new Error())} />);
   * ```
   */
  fetchData?: (selo?: Selo) => Promise<RequerAcaoData>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * "Requer ação" card (DASH-F3 · HU-04).
 *
 * Self-fetching — calls `/api/dashboard/requer-acao` independently so a
 * failure here degrades only this card; the rest of the dashboard continues.
 *
 * 4 states:
 *   - **loading** — animated skeleton (chip row + item rows).
 *   - **error**   — `role="alert"` naming `dashboard/requer-acao`; never shown
 *                   as empty (CA-4).
 *   - **empty**   — "Nada requer sua ação" (neutral tone, not an error).
 *                   Header link to /pendencias remains visible (CA-3).
 *   - **ok**      — persona-variant rendering derived from `agrupadoPor`:
 *                   GERENCIA → groups + no chips (CA-1 CCOB)
 *                   DDI      → flat list + integrity note + no chips (CA-2)
 *                   NENHUM   → chip row with local filter + item list (default)
 *
 * Chip filter (default mode): client-side toggle; no new fetch on selection.
 * Action items: navigation links — no inline mutation (no WriteOnly guard).
 * `acaoLabel: null` → no button rendered for that item (CA-5).
 *
 * Breakpoint: `min-[761px]:` per ADR-0018 (not `md:` which shifts by 8px).
 */
export function RequerAcaoCard({ fetchData = getDashboardRequerAcao }: Props) {
  type FetchStatus = 'loading' | 'ok' | 'error';

  const [status, setStatus] = useState<FetchStatus>('loading');
  const [data, setData] = useState<RequerAcaoData | null>(null);
  const [activeFilter, setActiveFilter] = useState<Selo | null>(null);
  /**
   * Refetch por causa do chip, com a lista anterior ainda na tela.
   *
   * Separado de `status === 'loading'` de propósito: trocar de chip não pode
   * branquear o card para o skeleton — o usuário perderia de vista justamente
   * a faixa de chips que acabou de clicar (mesma razão do refresh "quieto" do
   * painel da alçada).
   */
  const [refetching, setRefetching] = useState(false);

  useEffect(() => {
    let active = true;

    // O primeiro carregamento mostra o skeleton; a troca de chip, não.
    if (data === null) {
      setStatus('loading');
    } else {
      setRefetching(true);
    }

    fetchData(activeFilter ?? undefined)
      .then((d) => {
        if (!active) return;
        setData(d);
        setStatus('ok');
        setRefetching(false);
      })
      .catch(() => {
        if (!active) return;
        setStatus('error');
        setRefetching(false);
      });

    return () => {
      active = false;
    };
    // `data` fora das deps de propósito: ele é ESCRITO aqui, e incluí-lo faria
    // o efeito se re-disparar a cada resposta — um laço de fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData, activeFilter]);

  function handleChipToggle(selo: Selo) {
    setActiveFilter((prev) => (prev === selo ? null : selo));
  }

  // `?? 0` here turned a degraded source into "Nada requer sua atenção".
  // `null` is the backend admitting it could not count; keep them apart.
  const total = data?.total ?? null;
  const degraded = status === 'ok' && data !== null && (total === null || (data.gaps?.length ?? 0) > 0);

  /*
   * Derived from agrupadoPor — never from if(persona===...).
   *
   * O `showChips` que morava aqui saiu junto do filtro local: os três ramos do
   * render já derivam de `agrupadoPor` diretamente, e um predicado com um
   * consumidor só era mais um lugar para a regra divergir.
   */
  const agrupadoPor = data?.agrupadoPor ?? AgrupadoPor.Nenhum;

  /*
   * Sem filtro local: o backend já devolve `itens` e `total` recortados pelo
   * chip ativo (ADO 67965). Filtrar aqui recortaria os `limit` itens já
   * baixados — 1 de 18 — sob um chip que conta o universo.
   */
  const displayedItems = status === 'ok' && data ? data.itens : [];

  /*
   * Com um chip ativo, o header segue o recorte: `total` já é o total DAQUELE
   * selo e o link leva à listagem filtrada (`/pendencias?selo=…`, deep link que
   * o `PendenciasPanel` já suporta). Sem isso o card mostraria "Exibir todas
   * (4)" apontando para uma tela de 22 — o mesmo tipo de número que a tela de
   * destino não explica.
   */
  const listLabelSuffix = activeFilter ? ` em ${SELO_LABEL[activeFilter].toLowerCase()}` : '';

  /*
   * ⚠️ O ramo da CCOB (`AgrupadoPor.Gerencia`) NÃO TEM LINK — e é o único.
   *
   * Ali os itens não são pendências: são **análises prévias de garantia**
   * (`buildCcobRequerAcao`), com CTA próprio "Analisar garantia" por linha. O
   * `/pendencias` é outra coleção, e depois do recorte do ADO 67987 a caixa da
   * CCOB é legitimamente vazia (nenhuma regra do Anexo B roteia para `CCOB`).
   *
   * Medido em staging em 04/09/2026 com perfil CCOB: o header dizia
   * **"Exibir todas (12) ›"** e o destino abria uma tela dizendo **"6 Abertas"**,
   * nenhuma delas da CCOB. É a mesma classe de defeito que o ADO 67965 corrigiu
   * para o LT — um número que a tela de destino não explica —, só que aqui o
   * conserto é remover o link, porque **não existe tela que liste aquelas 12**.
   *
   * Enquanto essa tela não existir, um link para `/pendencias` é pior que a
   * ausência dele: o número continua no ar (o header segue mostrando o total) e
   * a ação real está na própria linha.
   *
   * ⚠️ **A premissa "não existe tela que liste aquelas 12" CADUCOU**: desde a
   * entrega do widget `GARANTIAS` existe a tabela "Análise Prévia"
   * (`analise-previa-card.tsx`), que lista a MESMA fila — mesmo predicado
   * (`cobrancaPreviaCcobSeAplica`), com analista e valores. Ela é uma FAIXA da
   * mesma home, logo abaixo desta, então continua não havendo rota para onde
   * linkar e a ausência do link segue correta.
   *
   * O que muda é que a home da CCOB passou a mostrar a mesma fila **duas
   * vezes**, em formatos diferentes (aqui agrupada por gerência, lá tabulada
   * com os valores). Isso é **decisão de produto pendente**, registrada e não
   * resolvida aqui: consolidar as duas é mexer na composição de widgets da
   * persona (`dashboard/domain/persona.ts`), não neste componente.
   */
  const listHref =
    agrupadoPor === AgrupadoPor.Gerencia
      ? undefined
      : activeFilter
        ? `/pendencias?selo=${activeFilter}`
        : '/pendencias';

  return (
    <DashboardCard>
      {/* Header — always present; link stays visible even on empty/loading (CA-3) */}
      <SectionHead
        title="Pendências"
        linkHref={listHref}
        linkLabel={total === null ? 'Exibir todas ›' : `Exibir todas (${total}) ›`}
        linkAriaLabel={
          total === null
            ? `Exibir todas as pendências${listLabelSuffix}`
            : `Exibir todas as pendências${listLabelSuffix} (${total})`
        }
        // Sem link (ramo da CCOB), o volume continua no header como texto.
        meta={total === null ? undefined : `${total} no total`}
      />

      {/* Loading — só o primeiro carregamento; a troca de chip mantém a lista */}
      {status === 'loading' && <Loading />}

      {/* Error — visually distinct; names the source; never "Nada requer..." (CA-4) */}
      {status === 'error' && <FetchErrorState />}

      {/*
        Degraded source — the query failed or timed out, so the count is
        unknown. Distinct from the empty state on purpose (CA-4): "nothing to
        do" and "we could not look" lead to different actions.
      */}
      {degraded && data !== null && <DegradedState gaps={data.gaps ?? []} />}

      {/*
        Ok: empty — neutral content, not an error (CA-3).

        ⚠️ Só quando NÃO há chip ativo. Com um chip aceso, `total` é o total
        daquele selo: um `0` ali significa "nada nesta categoria", e escrever
        "Nada requer sua ação." seria falso ao lado de chips somando 22.
      */}
      {status === 'ok' && total === 0 && activeFilter === null && <EmptyState />}

      {/* Ok: items — persona-variant rendering */}
      {/*
        The GERENCIA mode renders from `grupos` and the others from `itens`;
        gate on either being non-empty rather than on `total`, which is the
        full-set count and is `null` when the source degraded.

        ⚠️ `activeFilter !== null` entra no gate porque um selo pode ter ZERO
        itens: sem isso, clicar num chip vazio esconderia a própria faixa de
        chips e o usuário ficaria sem como desmarcá-lo — beco sem saída criado
        pelo próprio controle.
      */}
      {status === 'ok' && data !== null && (total !== 0 || activeFilter !== null) && (data.itens.length > 0 || data.grupos.length > 0 || activeFilter !== null) && (
        <>
          {/* --- NENHUM / default: chip row + flat list --- */}
          {agrupadoPor === AgrupadoPor.Nenhum && (
            <>
              <ChipRow
                porSelo={data.porSelo}
                busy={refetching}
                active={activeFilter}
                onToggle={handleChipToggle}
              />

              {displayedItems.length > 0 ? (
                <ul aria-label="Pendências que requerem ação">
                  {displayedItems.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
                  {activeFilter
                    ? `Nenhuma pendência em ${SELO_LABEL[activeFilter].toLowerCase()}.`
                    : 'Nenhuma pendência nesta categoria.'}
                </p>
              )}
            </>
          )}

          {/* --- GERENCIA (CCOB): groups with subtitles, no chips (CA-1) --- */}
          {agrupadoPor === AgrupadoPor.Gerencia && (
            <div aria-label="Pendências agrupadas por gerência">
              {data.grupos.length > 0 ? (
                data.grupos.map((grupo, index) => (
                  // Labels are unique by construction (the backend groups by
                  // `area_usuario` through a Map), but the unlabelled bucket is
                  // null — falling back to the index keeps the key unique
                  // without inventing a label.
                  <GrupoSection key={grupo.label ?? `grupo-${index}`} grupo={grupo} />
                ))
              ) : (
                /* Fallback: flat list when grupos is empty (safe render) */
                <ul aria-label="Pendências que requerem ação">
                  {data.itens.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* --- DDI: flat list with integrity note, no chips (CA-2) --- */}
          {agrupadoPor === AgrupadoPor.Ddi && (
            <>
              <DdiNote />
              {data.itens.length > 0 ? (
                <ul aria-label="Pendências de integridade">
                  {data.itens.map((item) => (
                    <ItemRow key={item.id} item={item} />
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
                  Nenhuma pendência de integridade.
                </p>
              )}
            </>
          )}
        </>
      )}
    </DashboardCard>
  );
}
