'use client';

import type { ReactNode } from 'react';

import type { DashboardResumo } from '@/lib/dashboard/resumo-mapping';
import { DashboardWidget } from '@/lib/dashboard/types';

import { AnalisePreviaCard } from './analise-previa-card';
import { AtivacaoPagamentoCard } from './ativacao-pagamento-card';
import { DevolutivasCard } from './devolutivas-card';
import { DistribuicaoPorAnalistaCard } from './distribuicao-por-analista-card';
import { DistribuicaoPorAnalistaStatusCard } from './distribuicao-por-analista-status-card';
import { DistribuicaoPorFaseCard } from './distribuicao-por-fase-card';
import { IndicadoresSnegCard } from './indicadores-sneg-card';
import { KpiRow } from './kpi-row';
import { OportunidadesAtribuidasCard } from './oportunidades-atribuidas-card';
import { OportunidadesPorAtributoCard } from './oportunidades-por-atributo-card';
import { PipelineDataProvider } from './pipeline-data-context';
import { PipelineFaseCard } from './pipeline-fase-card';
import { PrincipaisPorValorCard } from './principais-por-valor-card';
import { RequerAcaoCard } from './requer-acao-card';
import { UltimasOportunidadesCard } from './ultimas-oportunidades-card';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /**
   * Ordered widget list from the backend — the grid renders ONLY these widgets,
   * in this order.  No `if (role === …)` here: the backend is the verdict.
   * Unknown widget ids were already discarded by the mapper (CA-3).
   */
  widgets: DashboardWidget[];
  /**
   * Full resumo payload; null while loading. Each card receives only its own
   * section data — they never know about each other's data.
   */
  data: DashboardResumo | null;
  /** True while the parent is fetching the resumo — cards show their loading state. */
  loading?: boolean;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Dashboard widget composition (F1 · DASH-F1 / F2 · DASH-F2).
 *
 * Reproduces the prototype's page structure (01-visao-geral.html), which is
 * three full-width bands followed by a two-column grid — NOT a single column
 * of half-width cards:
 *
 * ```
 * ┌───────────────────────── KPI row (5 cards, no panel) ─────────────────────┐
 * ├──────────────────────────── Pendências (card) ────────────────────────────┤
 * ├────────────────────────── Pipeline por fase (card) ───────────────────────┤
 * ├─── Principais por valor ────┬──── Oportunidades por atributo ─────────────┤
 * ```
 *
 * The three pipeline-fed sections (KPI row, phase card, top-by-value table) are
 * spread across those bands, so they share one fetch via
 * {@link PipelineDataProvider} instead of self-fetching three times.
 *
 * Composition rules (CA-1/CA-2/CA-3):
 * - No widget → empty render, no error (CA-3: Visualizador persona).
 * - Unknown widget id → discarded by mapper before arriving here.
 * - Widget present but section has status 'error' → card shows error state
 *   naming the source (CA-5).
 * - Widget present, section null (persona does not receive it) → card skipped.
 */
export function DashboardGrid({ widgets, data, loading = false }: Props) {
  // CA-3: no widgets to render → render nothing (not an error).
  if (widgets.length === 0 && !loading) {
    return null;
  }

  const has = (w: DashboardWidget) => widgets.includes(w);

  // PIPELINE and KPIS come from the same backend section; either one lights up
  // the whole pipeline band (KPI row + phase card + top-by-value table).
  const hasPipelineSections = has(DashboardWidget.Pipeline) || has(DashboardWidget.Kpis);

  // --- bottom two-column grid -------------------------------------------------

  const gridCards: { key: string; node: ReactNode }[] = [];

  // "Principais por valor" leads the bottom grid, as in the prototype.
  if (hasPipelineSections) {
    gridCards.push({ key: 'principais-por-valor', node: <PrincipaisPorValorCard /> });
  }

  for (const widget of widgets) {
    switch (widget) {
      case DashboardWidget.PrincipaisOportunidades: {
        const items = data?.principaisOportunidades ?? [];
        const cardStatus = loading ? 'loading' : items.length === 0 ? 'empty' : 'ok';
        gridCards.push({
          key: widget,
          node: <UltimasOportunidadesCard status={cardStatus} items={items} />,
        });
        break;
      }

      case DashboardWidget.OportunidadesPorAtributo: {
        const section = data?.oportunidadesPorAtributo ?? null;
        // Skip this card if the backend did not include the section for this persona.
        if (!loading && section === null) break;
        gridCards.push({
          key: widget,
          node: <OportunidadesPorAtributoCard loading={loading} section={section} />,
        });
        break;
      }

      case DashboardWidget.DistribuicaoPorAnalista: {
        const section = data?.distribuicaoPorAnalista ?? null;
        if (!loading && section === null) break;
        gridCards.push({
          key: widget,
          node: <DistribuicaoPorAnalistaCard loading={loading} section={section} />,
        });
        break;
      }

      case DashboardWidget.Devolutivas: {
        gridCards.push({ key: widget, node: <DevolutivasCard /> });
        break;
      }

      /*
       * Evolução do Dashboard SNEG (BP Financeiro). A ORDEM dos widgets que o
       * backend manda é o layout — (fase | analista) e (indicadores | atributo)
       * —, então a grade só empilha na ordem recebida, sem regra de posição
       * aqui. Os três se buscam sozinhos: têm filtro próprio.
       */
      case DashboardWidget.DistribuicaoPorFase: {
        gridCards.push({ key: widget, node: <DistribuicaoPorFaseCard /> });
        break;
      }

      case DashboardWidget.PorAnalistaPorStatus: {
        gridCards.push({ key: widget, node: <DistribuicaoPorAnalistaStatusCard /> });
        break;
      }

      case DashboardWidget.IndicadoresSneg: {
        gridCards.push({ key: widget, node: <IndicadoresSnegCard /> });
        break;
      }

      default:
        // RequerAcao / Pipeline / Kpis / Garantias are full-width bands,
        // handled above. Unknown widgets are silently skipped.
        break;
    }
  }

  const hasRequerAcao = has(DashboardWidget.RequerAcao);

  /*
   * "Análise Prévia" é FAIXA de largura cheia, não card da grade de baixo: são
   * sete colunas (duas de texto, quatro de moeda e o CTA), e metade da linha as
   * espremeria num scroll horizontal permanente. Mesma razão pela qual o
   * pipeline e o "Requer ação" são faixas.
   */
  const hasAnalisePrevia = has(DashboardWidget.Garantias);

  /*
   * "Oportunidades atribuídas" também é FAIXA, pela mesma razão: são cinco
   * colunas mais o CTA, e metade da linha as espremeria num scroll horizontal
   * permanente. Ela ocupa o lugar que o bloco "Pendências" (`RequerAcao`) tinha
   * nas visões da SNEG e do BP Financeiro — ADO 68531.
   */
  const hasOportunidadesAtribuidas = has(DashboardWidget.OportunidadesAtribuidas);

  /*
   * O quadro da SPCOM ocupa o lugar que o bloco "Pendências" tinha naquela
   * persona (pedido de 19/09/2026). Faixa pela mesma razão das irmãs.
   */
  const hasAtivacaoPagamento = has(DashboardWidget.OportunidadesAtivacaoPagamento);

  if (
    !hasRequerAcao &&
    !hasPipelineSections &&
    !hasAnalisePrevia &&
    !hasOportunidadesAtribuidas &&
    !hasAtivacaoPagamento &&
    gridCards.length === 0
  ) {
    return null;
  }

  const content = (
    <div className="mt-[18px] flex flex-col gap-[18px]">
      {/* Band 1 — KPI row, directly on the page background (no panel). */}
      {hasPipelineSections && <KpiRow recorte={data?.recorte} />}

      {/* Band 2 — Pendências (full width). */}
      {hasRequerAcao && <RequerAcaoCard />}

      {/* Band 2b — Análise Prévia (full width, CCOB). */}
      {hasAnalisePrevia && <AnalisePreviaCard />}

      {/* Band 2c — Oportunidades atribuídas (full width, SNEG e BP Financeiro). */}
      {hasOportunidadesAtribuidas && <OportunidadesAtribuidasCard />}

      {/* Band 2d — Ativação e pagamento (full width, SPCOM). */}
      {hasAtivacaoPagamento && <AtivacaoPagamentoCard />}

      {/* Band 3 — Pipeline por fase (full width). */}
      {hasPipelineSections && <PipelineFaseCard />}

      {/*
        Band 4 — prototype `.gridb` (lines 44–46): flex-wrap where each card
        takes half the row and grows to fill it when it is the only one left.
        A CSS grid would leave a lone card sitting in a half-width column with
        dead space beside it.  Full width below 980px.
      */}
      {gridCards.length > 0 && (
        <div
          data-testid="dashboard-bottom-grid"
          className="flex flex-wrap items-stretch gap-4"
        >
          {gridCards.map((card) => (
            <div
              key={card.key}
              className="min-w-0 flex-1 basis-full min-[981px]:basis-[calc(50%-8px)]"
            >
              {card.node}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Only mount the provider when something actually consumes the pipeline fetch.
  return hasPipelineSections ? (
    <PipelineDataProvider>{content}</PipelineDataProvider>
  ) : (
    content
  );
}
