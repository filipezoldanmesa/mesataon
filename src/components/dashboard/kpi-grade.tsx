'use client';

import { KpiCard } from './kpi-card';
import { formatCompactBRL } from '@/lib/dashboard/format-compact-brl';
import type { PipelineKpis } from '@/lib/dashboard/pipeline-types';
import { Recorte } from '@/lib/dashboard/types';

// ---------------------------------------------------------------------------
// Layout
//
// Prototype `.kpis` (01-visao-geral.html line 22 + media queries line 66/67):
//   default        → repeat(5, 1fr)
//   max-width:980  → repeat(3, 1fr)
//   max-width:768  → repeat(2, 1fr)
// Breakpoints are expressed as min-width to mirror the prototype boundaries
// exactly (ADR-0018: never `md:`/`lg:`, which shift the collapse point).
// ---------------------------------------------------------------------------

const GRID = 'grid grid-cols-2 gap-4 min-[769px]:grid-cols-3 min-[981px]:grid-cols-5';

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

/**
 * Loading skeleton for the KPI row — one block per card.
 * Rule: skeleton (not spinner) per card (DASH-F2 spec).
 */
function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando KPIs…"
      className={GRID}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-[104px] animate-pulse rounded-(--radius-md) bg-(--neutral-100)"
        />
      ))}
    </div>
  );
}

function ErrorState({ fonte }: { fonte: string }) {
  return (
    <p className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Falha ao carregar KPIs de <span className="font-bold">{fonte}</span>. Tente novamente
      mais tarde.
    </p>
  );
}

function Empty() {
  return (
    <p className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) py-4 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Sem dados de KPI disponíveis.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** Loading state — renders skeleton placeholders (not a spinner). */
  loading?: boolean;
  /**
   * Operational KPIs from the pipeline section.
   * `null` when the backend section is degraded (show error state naming fonte).
   */
  kpis?: PipelineKpis | null;
  /**
   * Integration name for the error state (CA-5).
   * Defaults to `"pipeline"` when not provided.
   */
  errorFonte?: string;
  /**
   * Data scope for the current persona (RN-F1-03).
   * Drives the "Pendências abertas" descriptor:
   * `Recorte.Carteira` → "na sua carteira"; `Recorte.Area` → "na sua área".
   *
   * ⚠️ Ausente ou desconhecido ⇒ o descritor é OMITIDO, nunca defaultado. O
   * default anterior era `Proprio` ("na sua carteira"), e como o valor jamais
   * chegava — o espelho do enum não casava com o backend — a frase afirmava
   * carteira sobre um número de área inteira, para SNEG e Gerente Varejo
   * inclusive. Escopo é o que dá sentido ao número: chutá-lo é pior que calar.
   */
  recorte?: Recorte | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * KPI row — 5 operational KPI cards (DASH-F2 · HU-03.1 / RN-F2-02).
 *
 * Mirrors the prototype `.kpis` row (01-visao-geral.html lines 114–120): a
 * full-width band of bare cards sitting directly on the page background — it is
 * NOT nested inside another card, and it is NOT a column of the bottom grid.
 *
 * Cards:
 *   1. Pendências abertas — `.crit` (red accent + red number)
 *   2. Em aprovação — blue number
 *   3. Aguardando assinatura — `.warn` (amber accent + amber number)
 *   4. Valor de pipeline — green number, descriptor = the VALUED opportunity count
 *   5. Ticket médio — default ink; null → "—" (CA-2)
 *
 * The descriptors of cards 4 and 5 come from the backend
 * (`oportunidadesComValor`) — the prototype's "42 oportunidades" is data, not
 * decoration, so it is never hard-coded here. They describe the same subset the
 * two values were computed over, which is not always the whole recorte.
 */
export function KpiGrade({
  loading = false,
  kpis,
  errorFonte = 'pipeline',
  recorte = null,
}: Props) {
  if (loading) return <Loading />;
  if (kpis === null) return <ErrorState fonte={errorFonte} />;
  if (kpis === undefined) return <Empty />;

  const pendenciasDescricao =
    recorte === Recorte.Carteira
      ? 'na sua carteira'
      : recorte === Recorte.Area
        ? 'na sua área'
        : undefined;

  /*
   * Os dois cards de valor descrevem o MESMO conjunto: as oportunidades com VPL
   * calculado (`oportunidadesComValor`), não o recorte inteiro. Antes o card 4
   * anunciava `totalOportunidades` sobre uma soma que era de um subconjunto e o
   * card 5 dizia "por oportunidade" sobre uma média de outro denominador — em
   * dev, "2 oportunidades" com ticket médio igual ao pipeline, porque só uma
   * tinha VPL (VBR-645). Quando os dois números coincidem a frase fica curta;
   * quando divergem, ela nomeia a divergência em vez de escondê-la. */
  const comValor = kpis.oportunidadesComValor;
  const parcial = comValor !== kpis.totalOportunidades;
  const valorDescricao = parcial
    ? `${comValor} de ${kpis.totalOportunidades} com valor calculado`
    : `${comValor} ${comValor === 1 ? 'oportunidade' : 'oportunidades'}`;
  const ticketDescricao = parcial
    ? `por oportunidade com valor (${comValor})`
    : 'por oportunidade';

  return (
    <div className={GRID}>
      {/* 1. Pendências abertas — verdict: crit */}
      <KpiCard
        label="Pendências abertas"
        value={String(kpis.pendenciasAbertas)}
        description={pendenciasDescricao}
        variant="crit"
        tone="danger"
      />
      {/* 2. Em aprovação */}
      <KpiCard
        label="Em aprovação"
        value={String(kpis.emAprovacao)}
        description="aguardando alçada"
        tone="info"
      />
      {/* 3. Aguardando assinatura — verdict: warn */}
      <KpiCard
        label="Aguardando assinatura"
        value={String(kpis.aguardandoAssinatura)}
        description="no DocuSign"
        variant="warn"
        tone="warning"
      />
      {/* 4. Valor de pipeline — measure; descriptor carries the real DENOMINATOR */}
      <KpiCard
        label="Valor de pipeline"
        value={formatCompactBRL(kpis.valorPipeline)}
        description={valorDescricao}
        tone="success"
      />
      {/* 5. Ticket médio — measure; null → "—" (CA-2) */}
      <KpiCard
        label="Ticket médio"
        value={formatCompactBRL(kpis.ticketMedio)}
        description={ticketDescricao}
      />
    </div>
  );
}
