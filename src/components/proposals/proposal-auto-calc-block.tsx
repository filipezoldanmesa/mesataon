"use client";

import { useEffect, useState } from "react";

import { formatPercentFromDecimal } from "@/lib/opportunities-indicators/format";
import {
  recursosTotais,
  type RecursosTotais,
} from "@/lib/proposals/financial-resource-totals";
import { getFinancialResources as defaultGetFinancialResources } from "@/lib/proposals/financial-resources.data";
import type { FinancialResourcesListResult } from "@/lib/proposals/financial-resources.types";
import { getInvestments as defaultGetInvestments } from "@/lib/proposals/investments.data";
import type { InvestmentsListResult } from "@/lib/proposals/investments.types";
import {
  margemMediaPonderada,
  reaisPorM3,
  vmmM3PorMes,
  volumeTotalM3,
} from "@/lib/proposals/product-line-totals";
import { listProductLines as defaultListProductLines } from "@/lib/proposals/product-lines.data";
import type { ProductLine } from "@/lib/proposals/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  proposalId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  listProductLines?: (id: string) => Promise<ProductLine[]>;
  /** Injectable for tests; defaults to the real BFF client. */
  getFinancialResources?: (id: string) => Promise<FinancialResourcesListResult>;
  /**
   * Injectable for tests; defaults to the real BFF client. Os investimentos
   * entram nos "Recursos Antecipados" (ADO — 09/09/2026), então o card passou a
   * ler as DUAS fontes de dinheiro.
   */
  getInvestments?: (id: string) => Promise<InvestmentsListResult>;
  /**
   * Bump to force re-computing totals after a sibling block mutates the
   * product lines (CA-2 VBR-536). Counter — two mutations are two events.
   */
  refreshSignal?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatVolume(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m³/mês`;
}

/** Volume acumulado da janela — em m³, SEM o "/mês" do VMM. */
function formatVolumeTotal(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m³`;
}

/**
 * R$ per cubic metre — the unit of a margin, as opposed to the plain currency
 * of a total. Same shape as the "R$ / m³" indicator in the opportunity's
 * "Análise financeira" card; spelled out in the value (not the label) because
 * that is what this card already does for Volume total ("… m³/mês").
 */
function formatCurrencyPerM3(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} /m³`;
}

function CalcRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between gap-3 border-b border-(--color-border) py-1.5 text-(length:--t-caption) last:border-b-0">
      <span className="text-(--color-text-muted)">{label}</span>
      {/* The number never wraps: with a long label the label is what reflows,
          not "R$ 1.234,56 /m³" broken across two lines. */}
      <b className={`shrink-0 whitespace-nowrap ${valueClassName ?? ""}`}>
        {value}
      </b>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProposalAutoCalcBlock
// ---------------------------------------------------------------------------

/**
 * "Cálculos automáticos" side card (`03-proposta-ciclo1.html:267-273`).
 *
 * Derives VMM, Volume total, Receita total and Margem média from the saved
 * product lines, and the four resource rows from the financial resources plus
 * the investments. Shows "—" until the respective data is available.
 *
 * Positioned in the sticky right-column sidebar, below "Painel ao vivo"
 * (`ProposalIndicatorsBlock`).
 *
 * ⚠️ **Deliberate deviation from the prototype** (Bug 67537 / VBR-570): the
 * prototype's third row is "Margem total" = Σ(volume × margem), a monthly
 * total in R$ (`03-proposta-ciclo1.html:271`). Vibra asked for the margin
 * *averaged* over the products and weighted by volume, so the row is "Margem
 * média ponderada" and the unit is **R$/m³** — the same numerator over Σ
 * volumes. Keeping plain-currency formatting would invite comparing it with
 * "Receita total" as if they were the same quantity.
 *
 * ⚠️ The bug report says "tela de oportunidade" and asked for the label
 * "Margem Média da Oportunidade", but this card only exists on the **proposal**
 * screens (the opportunity has "Análise financeira", fed by the ARP) and the
 * number is derived from *this* proposal's product lines. Naming it "da
 * Oportunidade" would be a false label, so the **scope is the proposal**
 * (VBR-570 option A) — the report is read as calling the proposal, which is
 * opened from the opportunity, an "oportunidade". An opportunity-wide average
 * over every elected proposal would be a different number, in a different
 * card, and needs backend aggregation. Not to be confused with
 * `OpportunityIndicators.margemMedia`, which comes from the ARP — same unit
 * (R$/m³) since 25/08/2026, but a different number: that one is the ARP's, this
 * one is derived locally from the product lines.
 *
 * ## As quatro linhas de recursos (ADO — 09/09/2026)
 *
 * A linha `Investimento Vibra` — que era Σ `valorTotal` dos RECURSOS
 * FINANCEIROS, apesar do nome — saiu e deu lugar a quatro, por pedido do
 * negócio: `Recursos Antecipados`, `Recursos Postecipados`, `Recursos Totais` e
 * `Percentual de Recursos Antecipados`. A conta vive em
 * `financial-resource-totals.ts`; leia lá as decisões de cada balde.
 *
 * ⚠️ **O percentual DIVERGE do "% Antecipação" do card logo acima**, e a
 * divergência é decisão de produto, não descuido. `ProposalIndicatorsBlock`
 * exibe o `percentualAntecipacao` que o backend persiste em
 * `proposal_indicators.advance_percentage` — o número que alimenta o **ARP**
 * (TIR/VPL) e a **aderência de padrão de BP da SNEG** (meta de 40%) — e ele
 * considera SÓ recursos financeiros. Este soma também os **investimentos**,
 * porque foi isso que o negócio pediu em 09/09/2026 (*"deve seguir apenas o
 * escopo do que foi pedido … exatamente com os cálculos que estão lá"*), depois
 * de a divergência lhe ser apresentada. Nada no backend foi tocado. Se os dois
 * percentuais lado a lado incomodarem na UAT, o conserto é escolher UMA
 * definição — nunca alinhar as duas por acidente, porque mexer na do backend
 * move TIR e alçada.
 *
 * ⚠️ As três linhas de dinheiro exigem as **duas** fontes (recursos E
 * investimentos) e mostram "—" se qualquer uma falhar. Exibir o split sem os
 * investimentos seria um número silenciosamente errado, indistinguível do certo
 * na tela.
 *
 * ## VMM, Volume total e R$/m³ (ADO — 11/09/2026)
 *
 * ⚠️ **"Volume total (efetivo)" sempre exibiu o VMM** — a soma dos `volume` das
 * linhas, que são m³/**mês**. O rótulo dizia "total" ao lado de um valor
 * mensal: número certo sob nome errado, que é a classe de defeito que ninguém
 * enxerga na tela. A linha virou **`VMM`** (o número NÃO mudou) e ao lado dela
 * entrou **`Volume total`** de verdade, Σ (volume × `hvMeses` da própria
 * linha) — ver `volumeTotalM3`, que explica por que o prazo é o da LINHA e não
 * o do contrato.
 *
 * ⚠️ **`R$/m³` daqui não é o `R$ / m³` do "Painel ao vivo"**, logo acima na
 * mesma coluna. Aquele é o `indiceRealL` do ARP (hoje quase sempre "Não
 * informado pelo ARP"); este é derivação local pedida pelo negócio — Recursos
 * Totais ÷ Volume total, as duas linhas deste próprio card. Não os unifique
 * sem decisão de negócio: são numeradores diferentes.
 */
export function ProposalAutoCalcBlock({
  proposalId,
  listProductLines = defaultListProductLines,
  getFinancialResources = defaultGetFinancialResources,
  getInvestments = defaultGetInvestments,
  refreshSignal = 0,
}: Props) {
  const [vmm, setVmm] = useState<number | null>(null);
  const [volumeTotal, setVolumeTotal] = useState<number | null>(null);
  const [receitaTotal, setReceitaTotal] = useState<number | null>(null);
  const [margemMedia, setMargemMedia] = useState<number | null>(null);
  const [totais, setTotais] = useState<RecursosTotais | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [linesResult, resourcesResult, investmentsResult] =
        await Promise.allSettled([
          listProductLines(proposalId),
          getFinancialResources(proposalId),
          getInvestments(proposalId),
        ]);

      if (cancelled) return;

      if (linesResult.status === "fulfilled") {
        const lines = linesResult.value;
        setVmm(vmmM3PorMes(lines));
        setVolumeTotal(volumeTotalM3(lines));
        setReceitaTotal(
          lines.reduce((sum, l) => sum + l.volume * l.precoFinal, 0),
        );
        setMargemMedia(margemMediaPonderada(lines));
      }

      /*
       * As DUAS fontes, e por isso a conjunção: um split que omite os
       * investimentos é indistinguível do correto na tela, e o "—" é a única
       * resposta honesta. Nada é escrito quando falha — o valor anterior
       * permanece visível, que é o refresh quieto da CA-4.
       */
      if (
        resourcesResult.status === "fulfilled" &&
        investmentsResult.status === "fulfilled"
      ) {
        setTotais(
          recursosTotais(
            resourcesResult.value.items,
            investmentsResult.value.totalInvestimentos,
          ),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    proposalId,
    listProductLines,
    getFinancialResources,
    getInvestments,
    refreshSignal,
  ]);

  /*
   * Derivado na renderização, não em estado: ele é função pura das duas linhas
   * que o card já mostra, e um terceiro `useState` abriria a chance de ficar
   * fora de sincronia com elas.
   */
  const rsPorM3 =
    totais !== null && volumeTotal !== null
      ? reaisPorM3(totais.total, volumeTotal)
      : null;

  return (
    <section
      aria-labelledby="auto-calc-title"
      className="rounded-[var(--radius-md)] border border-[rgba(65,128,32,0.2)] bg-[rgba(65,128,32,0.06)] px-5 py-[18px]"
    >
      <h3
        id="auto-calc-title"
        className="mb-2 text-(length:--t-caption) font-bold"
      >
        Cálculos automáticos
      </h3>
      <CalcRow label="VMM" value={vmm !== null ? formatVolume(vmm) : "—"} />
      <CalcRow
        label="Volume total"
        value={volumeTotal !== null ? formatVolumeTotal(volumeTotal) : "—"}
      />
      <CalcRow
        label="Receita total"
        value={receitaTotal !== null ? formatCurrency(receitaTotal) : "—"}
      />
      <CalcRow
        label="Margem média ponderada"
        value={margemMedia !== null ? formatCurrencyPerM3(margemMedia) : "—"}
      />
      {/*
        As três linhas de dinheiro herdam o vermelho que `Investimento Vibra`
        tinha: é a mesma saída de caixa da Vibra, agora repartida. O percentual
        fica neutro — é uma razão, não um desembolso.
      */}
      <CalcRow
        label="Recursos Antecipados"
        value={totais !== null ? formatCurrency(totais.antecipados) : "—"}
        valueClassName="text-(--red-700)"
      />
      <CalcRow
        label="Recursos Postecipados"
        value={totais !== null ? formatCurrency(totais.postecipados) : "—"}
        valueClassName="text-(--red-700)"
      />
      <CalcRow
        label="Recursos Totais"
        value={totais !== null ? formatCurrency(totais.total) : "—"}
        valueClassName="text-(--red-700)"
      />
      <CalcRow
        label="Percentual de Recursos Antecipados"
        value={
          /*
           * `null` no percentual é "não há denominador" (nenhum recurso e nenhum
           * investimento), distinto de um 0% medido — que acontece quando só há
           * postecipado. Um `0%` fabricado se lê como percentual apurado.
           */
          totais?.percentualAntecipados != null
            ? formatPercentFromDecimal(totais.percentualAntecipados)
            : "—"
        }
      />
      <CalcRow
        label="R$/m³"
        value={
          /*
           * Recursos Totais ÷ Volume total — as duas linhas logo acima. "—"
           * quando falta qualquer um dos dois lados: sem recursos não há
           * numerador conhecido, e sem volume não há denominador. Um
           * "R$ 0,00 /m³" fabricado se leria como desembolso apurado.
           */
          rsPorM3 !== null ? formatCurrencyPerM3(rsPorM3) : "—"
        }
      />
    </section>
  );
}
