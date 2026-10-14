"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useCalculationPolling } from "@/hooks/use-calculation-polling";
import { usePermissions } from "@/hooks/use-permissions";
import { Permission } from "@/lib/auth-permissions";
import { useProposalViewMode } from "@/components/proposals/proposal-view-mode";
import { StatusPill } from "@/components/status-pill";
import {
  CalculatingNotice,
  CalculationInProgressNotice,
  CalculationUnavailableNotice,
  STALE_VALUES_CLASS,
  StaleValuesCaption,
  UnknownStatusNotice,
} from "@/components/indicators/indicator-notices";
import {
  getProposalIndicators as defaultLoad,
  recalculateProposalIndicators as defaultRecalculate,
} from "@/lib/opportunities-indicators/proposal-indicators.data";
import type { ProposalIndicatorsSnapshot } from "@/lib/opportunities-indicators/types";
import { formatPercentFromDecimal } from "@/lib/opportunities-indicators/format";
import {
  ArpUnavailableError,
  INDICATOR_STATUS_LABEL,
  INDICATOR_STATUS_PILL_VARIANT,
  IndicatorStatus,
  IndicatorsCalculationInProgressError,
  narrowIndicatorStatus,
  ProposalNotReadyForIndicatorsError,
} from "@/lib/opportunities-indicators/types";
import { isExpiredSessionError } from "@/lib/api-errors";
import { redirectToLogin } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The four UI states required by OPP-F7 (HU-12/HU-13.2): `loading`
 * (carregando), `never-calculated` (nunca calculado), `loaded` (atualizado)
 * and `error` (erro ao carregar o snapshot — distinto do ARP indisponível,
 * que só ocorre durante um recálculo e é rastreado via `recalcStatus`).
 */
type LoadStatus = "loading" | "never-calculated" | "loaded" | "error";
type RecalcStatus =
  | "idle"
  | "recalculating"
  | "error-arp"
  /** 409 — a calculation is already in flight for this proposal (VBR-401). */
  | "error-in-progress"
  | "error-not-ready"
  | "error-generic";

type Props = {
  proposalId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  load?: (id: string) => Promise<ProposalIndicatorsSnapshot | null>;
  /** Injectable for tests; defaults to the real BFF client. */
  recalculate?: (id: string) => Promise<ProposalIndicatorsSnapshot>;
  /**
   * Bump to force a quiet re-read of the snapshot after a sibling block mutates
   * financial data (product lines, financial resources, financial items — Bug
   * 67579). Counter — two mutations are two events. The initial value (0) is
   * intentionally skipped so the mount fetch is not duplicated.
   *
   * Uses `refreshQuietly` (not `fetchIndicators`) so the panel does NOT blank
   * during revalidation — the user can keep reading the values while the badge
   * updates from "Atualizado" to "Desatualizado".
   */
  refreshSignal?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCurrencyMasked(value: number): string {
  return formatCurrency(value);
}

function formatDecimal(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/**
 * Moeda por metro cúbico — `R$ 297,12 /m³`.
 *
 * O protótipo de 21/08/2026 compõe assim (`brl(v) + '/m³'`, `ciclo1.js`), e a
 * Feature 66401 tipa `R$ / m³`, `Margem EBITDA (R$ / m³)` e
 * `Margem Média (R$ / m³)` como `Moeda`. Os três compartilham um formatador
 * para não divergirem no sufixo.
 */
function formatCurrencyPerM3(value: number): string {
  return `${formatCurrency(value)} /m³`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RecalcButton({
  onClick,
  isLoading,
  disabled = false,
  label,
}: {
  onClick: () => void;
  isLoading: boolean;
  /**
   * Disables the CTA without showing the in-button spinner — used while the ARP
   * is processing (`em_calculo`), when the progress is reported by the notice
   * above and a second request would only be refused with 409.
   */
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading || disabled}
      aria-label={isLoading ? "Calculando…" : label}
      className="w-full cursor-pointer rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--secondary-600) px-4 py-2.5 text-center text-(length:--t-caption) font-bold text-white transition hover:bg-(--secondary-700) disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
          />
          Calculando…
        </span>
      ) : (
        label
      )}
    </button>
  );
}

/*
 * `whitespace-nowrap` on the value is load-bearing, not polish.
 *
 * CSS offers a break opportunity after a hyphen, so `-R$ 299.654,40` wrapped
 * between the sign and the amount and left a lone `-` at the end of the line —
 * visually the same glyph family as the `—` this very panel uses for "no
 * value", i.e. a negative VPL read as a missing one. The same number rendered
 * correctly on the wider opportunity card, which is why it only showed up in
 * the narrow sidebar (VBR-635 §14).
 */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-xs)] border border-(--color-border) px-2.5 py-2">
      <div className="text-[12px] tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="mt-0.5 whitespace-nowrap text-(length:--t-body) font-bold">
        {value}
      </div>
    </div>
  );
}

function CalcRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-(--color-border) py-1.5 text-(length:--t-caption) last:border-b-0">
      <span className="text-(--color-text-muted)">{label}</span>
      {/* Same reason as `Field`: a negative amount must not split after the sign. */}
      <b className="whitespace-nowrap">{value}</b>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * "Painel ao vivo" da proposta (OPP-F7, HU-12/HU-13.2 — `03-proposta-nova.html:246-262`).
 * Renders the proposal-level economic indicators (TIR/VPL/TMA/% antecipação
 * + R$/m³, margens, indicador de rentabilidade e comprometimento da margem)
 * from `ProposalIndicators`, expõe a ação "↻ Recalcular / Simular (ARP)" e o
 * `status` do snapshot.
 *
 * Cobre os quatro estados de UI — nunca calculado / carregando / preenchido /
 * erro — mais o **`em cálculo`** do ciclo assíncrono do ARP (VBR-401/VBR-403).
 *
 * HU-12.1: mudar uma variável financeira (F5/F6) marca o status como
 * "Desatualizado" no backend; recalcular volta a "Atualizado". HU-12.2: edição
 * não-financeira não altera o status — este componente apenas reflete o `status`
 * retornado pelo backend, sem lógica própria de invalidação.
 *
 * HU-13.2 — **o recálculo não devolve resultado**: o ARP aceita o pedido (202) e
 * o backend responde `em_calculo` com os números do cálculo anterior. Enquanto
 * durar esse estado, os valores ficam legendados e subordinados (nunca "atuais")
 * e o CTA de recálculo fica desabilitado; a seção revalida sozinha e, se o
 * resultado não chegar, oferece "Atualizar" em vez de girar para sempre. Se o
 * cálculo termina em falha (`indisponivel`) ou se o submit falha de verdade
 * (503), a tela diz o que aconteceu e o CTA volta.
 *
 * "Alçada estimada" (`ix-alcada` no protótipo) é escopo do F8/Aprovação —
 * deliberadamente não implementada aqui.
 */
export function ProposalIndicatorsBlock({
  proposalId,
  load = defaultLoad,
  recalculate = defaultRecalculate,
  refreshSignal = 0,
}: Props) {
  /** Read-only profiles get no write controls (mirrors ReadOnlyProfileGuard). */
  const { can } = usePermissions();
  // PRD F3–F9 (Atores: LT/EV): mirrors the @Roles on the block's write routes.
  const canWriteRole = can(Permission.ProposalManage);
  // Analysis layer (03-proposta-analise): edits close for EVERY profile
  // while the proposal is under analysis — role alone is not enough.
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;

  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [recalcStatus, setRecalcStatus] = useState<RecalcStatus>("idle");
  /*
   * A frase do backend para o 400. O mesmo status recusa por mais de uma regra
   * (produtos/recursos ausentes, investimento sem Descrição — ADO 68425), e só
   * o backend sabe qual delas foi; o banner mostra a dele e guarda a genérica
   * para quando não vier nenhuma.
   */
  const [notReadyMotivo, setNotReadyMotivo] = useState<string | null>(null);
  const [data, setData] = useState<ProposalIndicatorsSnapshot | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchIndicators = useCallback(() => {
    setLoadStatus("loading");
    setRecalcStatus("idle");

    load(proposalId)
      .then((result) => {
        if (!mountedRef.current) return;
        setData(result);
        setLoadStatus(result ? "loaded" : "never-calculated");
      })
      .catch((err: unknown) => {
        if (isExpiredSessionError(err)) {
          redirectToLogin();
          return;
        }
        if (!mountedRef.current) return;
        setLoadStatus("error");
      });
  }, [proposalId, load]);

  useEffect(() => {
    fetchIndicators();
  }, [fetchIndicators]);

  /**
   * Re-reads the snapshot **without** blanking the panel — used by the
   * `em_calculo` revalidation, which would otherwise flash the loading state on
   * every tick. A fresh GET also supersedes any previous recalculation error
   * (the 409/503 banner has no reason to survive a newer read).
   */
  const refreshQuietly = useCallback(() => {
    load(proposalId)
      .then((result) => {
        if (!mountedRef.current) return;
        setData(result);
        setLoadStatus(result ? "loaded" : "never-calculated");
        setRecalcStatus("idle");
      })
      .catch(() => {
        /*
         * A failed background revalidation is not worth destroying the panel
         * over: the snapshot on screen is still the last thing the backend
         * said, and the next tick tries again.
         */
      });
  }, [proposalId, load]);

  /**
   * Bug 67579: re-read quietly whenever a sibling block bumps `refreshSignal`.
   * The initial value (0) is skipped so the mount fetch above is not duplicated.
   * `refreshQuietly` keeps the current values on screen while the badge updates
   * from "Atualizado" to "Desatualizado" — no spinner, no blanked panel.
   */
  useEffect(() => {
    if (!refreshSignal) return;
    refreshQuietly();
  }, [refreshSignal, refreshQuietly]);

  const handleRecalculate = useCallback(async () => {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    setRecalcStatus("recalculating");

    try {
      const result = await recalculate(proposalId);
      if (!mountedRef.current) return;
      setData(result);
      setLoadStatus("loaded");
      setRecalcStatus("idle");
    } catch (err) {
      if (!mountedRef.current) return;

      if (err instanceof ArpUnavailableError) {
        // HU-13.2: never promote the stale snapshot as definitive — keep the
        // previously loaded numbers (if any) visible, but flag the status
        // distinctly instead of leaving it as "atualizado"/"desatualizado".
        setRecalcStatus("error-arp");
        return;
      }

      if (err instanceof IndicatorsCalculationInProgressError) {
        /*
         * 409: a calculation is already running. Re-read so the snapshot shows
         * `em_calculo` (and the revalidation loop takes over) instead of leaving
         * the user in front of a stale "Desatualizado" with an enabled CTA.
         */
        setRecalcStatus("error-in-progress");
        refreshQuietly();
        return;
      }

      if (err instanceof ProposalNotReadyForIndicatorsError) {
        setNotReadyMotivo(err.message);
        setRecalcStatus("error-not-ready");
        return;
      }

      setRecalcStatus("error-generic");
    }
  }, [proposalId, recalculate, canWrite, refreshQuietly]);

  const isRecalculating = recalcStatus === "recalculating";
  const arpUnavailable = recalcStatus === "error-arp";

  /*
   * The status is narrowed through the type guard, never trusted raw: an
   * unrecognised value falls into the safe state (values not presented as
   * current, CTA disabled) instead of defaulting to a member.
   */
  const status = narrowIndicatorStatus(data?.status);
  const statusUnknown = data !== null && status === null;
  const isCalculating = status === IndicatorStatus.EmCalculo;
  const calculationUnavailable = status === IndicatorStatus.Indisponivel;

  /**
   * Whether a previous ARP result actually exists to be stale.
   *
   * `% Antecipação` is excluded on purpose: it is derived locally from the
   * financial resources when the calculation is SUBMITTED, so it is current
   * even mid-calculation. Only the metrics the ARP sends back can be "from the
   * previous calculation".
   */
  const hasPreviousArpResult =
    data !== null &&
    [
      data.tir,
      data.vpl,
      data.tma,
      data.rsPorM3,
      data.margemEbitda,
      data.margemMedia,
      data.indicadorRentabilidade,
    ].some((value) => value !== null);

  /*
   * HU-13.2: the stored numbers are the previous calculation, not the current
   * result — but only say so when there IS a previous one. On the FIRST
   * simulation every ARP metric is `—`, and captioning that "valores do cálculo
   * anterior" asserts a calculation that never happened (F-17.1).
   */
  const valuesAreStale =
    hasPreviousArpResult &&
    (isCalculating ||
      calculationUnavailable ||
      arpUnavailable ||
      statusUnknown);

  /** Revalidates while the ARP processes; gives up (and says so) when the budget ends. */
  const { exhausted: pollExhausted } = useCalculationPolling(
    isCalculating,
    refreshQuietly,
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section
      aria-labelledby="proposal-indicators-title"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      <div className="mb-3.5 flex items-baseline justify-between">
        <h3
          id="proposal-indicators-title"
          className="text-(length:--t-h4) font-bold"
        >
          Painel ao vivo
        </h3>
        {loadStatus === "loaded" && data && (
          <StatusPill
            variant={
              arpUnavailable
                ? "danger"
                : status !== null
                  ? INDICATOR_STATUS_PILL_VARIANT[status]
                  : "neutral"
            }
            size="sm"
          >
            {arpUnavailable
              ? "Indisponível"
              : status !== null
                ? INDICATOR_STATUS_LABEL[status]
                : /* Unknown value shows raw so the gap is visible, never a generic label. */
                  data.status}
          </StatusPill>
        )}
      </div>

      {/* Loading state */}
      {loadStatus === "loading" && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          data-testid="proposal-indicators-loading"
          className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
          />
          Carregando indicadores…
        </div>
      )}

      {/* Error state — initial load failure */}
      {loadStatus === "error" && (
        <div
          role="alert"
          data-testid="proposal-indicators-load-error"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
        >
          Falha ao carregar os indicadores da proposta. Verifique sua conexão e
          tente novamente.
          <button
            type="button"
            onClick={() => fetchIndicators()}
            className="ml-2 cursor-pointer font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Never calculated */}
      {loadStatus === "never-calculated" && (
        <div data-testid="proposal-indicators-never-calculated">
          {arpUnavailable && <ArpUnavailableBanner />}
          {recalcStatus === "error-in-progress" && (
            <CalculationInProgressNotice testId="proposal-calculation-in-progress-banner" />
          )}
          {recalcStatus === "error-not-ready" && (
            <NotReadyBanner motivo={notReadyMotivo} />
          )}
          {recalcStatus === "error-generic" && <GenericRecalcErrorBanner />}
          <p className="mb-3 text-(length:--t-caption) italic text-(--color-text-muted)">
            Os indicadores econômicos (TIR/VPL) desta proposta ainda não foram
            calculados.
          </p>
          {/* Read-only profiles get no write control at all (the API answers 403). */}
          {canWrite && (
            <RecalcButton
              onClick={() => void handleRecalculate()}
              isLoading={isRecalculating}
              label="Simular (ARP)"
            />
          )}
        </div>
      )}

      {/* Loaded — data present */}
      {loadStatus === "loaded" && data && (
        <div data-testid="proposal-indicators-loaded">
          {arpUnavailable && <ArpUnavailableBanner />}
          {isCalculating && (
            <CalculatingNotice
              testId="proposal-calculating-banner"
              exhausted={pollExhausted}
              onRefresh={refreshQuietly}
            />
          )}
          {calculationUnavailable && (
            <CalculationUnavailableNotice
              testId="proposal-calculation-unavailable-banner"
              reason={data.mensagemErro ?? null}
            />
          )}
          {statusUnknown && (
            <UnknownStatusNotice testId="proposal-unknown-status-banner" />
          )}
          {recalcStatus === "error-in-progress" && (
            <CalculationInProgressNotice testId="proposal-calculation-in-progress-banner" />
          )}
          {recalcStatus === "error-not-ready" && (
            <NotReadyBanner motivo={notReadyMotivo} />
          )}
          {recalcStatus === "error-generic" && <GenericRecalcErrorBanner />}

          {data.calculadoEm && (
            <p className="mb-3 text-(length:--t-small) text-(--color-text-muted)">
              Último cálculo:{" "}
              <strong>{formatTimestamp(data.calculadoEm)}</strong>
            </p>
          )}

          {/*
           * HU-13.2 — while a calculation is in flight (or after one that did
           * not finish) the numbers below belong to the previous snapshot: they
           * are captioned as such and visually subordinated, never rendered as
           * the current result.
           */}
          {valuesAreStale && (
            <StaleValuesCaption testId="proposal-stale-values-caption" />
          )}

          <div
            data-testid="proposal-indicators-values"
            data-stale={valuesAreStale ? "true" : "false"}
            className={valuesAreStale ? STALE_VALUES_CLASS : undefined}
          >
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="TIR proposta (a.a.)"
                value={
                  data.tir !== null ? formatPercentFromDecimal(data.tir) : "—"
                }
              />
              <Field
                label="VPL proposta"
                value={data.vpl !== null ? formatCurrencyMasked(data.vpl) : "—"}
              />
              <Field
                label="TMA"
                value={
                  data.tma !== null
                    ? `${data.tma.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
                    : "—"
                }
              />
              <Field
                label="% Antecipação"
                value={
                  data.percentualAntecipacao !== null
                    ? formatPercentFromDecimal(data.percentualAntecipacao)
                    : "—"
                }
              />
            </div>

            <div className="mt-2.5">
              {/*
                ADO 67593 / UAT 25/08/2026 — "Campo R$ / m³ não está sendo
                preenchido".
                
                O campo chega `null` porque o ARP devolve `indiceRealL: null`
                (pendência do ADR-0039, suspeita `receitasDespesas` desligado).
                Isso é fato da FONTE, e a tela precisa dizê-lo: sem cálculo
                nenhum o traço é a resposta certa — não há o que esperar —, mas
                com o cálculo concluído e o campo vazio o traço mudo faz a lacuna
                do ARP parecer defeito nosso. Mesmo tratamento que a 360º da
                oportunidade já dá ao mesmo campo
                (`opportunity-detail.tsx`, `financeiro-rs-por-m3-gap`).

                Nada é derivado localmente: um número fabricado aqui seria
                indistinguível de um real.
              */}
              <CalcRow
                label="R$ / m³"
                value={
                  data.rsPorM3 !== null ? (
                    formatCurrencyPerM3(data.rsPorM3)
                  ) : data.calculadoEm ? (
                    <span
                      data-testid="rs-por-m3-gap"
                      className="font-normal text-(--color-text-muted)"
                    >
                      Não informado pelo ARP
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              {/*
                ⚠️ Moeda por m³, NÃO percentual — foi assim que a UAT viu
                "EBITDA acima de 100%": o ARP devolveu 297,12 (R$/m³), o backend
                dividia por 100 e a tela multiplicava de volta com "%". Feature
                66401 tipa as duas como `Moeda`; o protótipo de 21/08/2026
                renderiza `brl(...) + '/m³'` sob exatamente estes rótulos.
              */}
              <CalcRow
                label="Margem EBITDA (R$/m³)"
                value={
                  data.margemEbitda !== null
                    ? formatCurrencyPerM3(data.margemEbitda)
                    : "—"
                }
              />
              <CalcRow
                label="Margem média (R$/m³)"
                value={
                  data.margemMedia !== null
                    ? formatCurrencyPerM3(data.margemMedia)
                    : "—"
                }
              />
              <CalcRow
                label="Indicador de rentabilidade"
                value={
                  data.indicadorRentabilidade !== null
                    ? formatDecimal(data.indicadorRentabilidade)
                    : "—"
                }
              />
              <CalcRow
                label="Comprometimento da margem"
                value={
                  data.comprometimento !== null
                    ? formatDecimal(data.comprometimento)
                    : "—"
                }
              />
            </div>
          </div>

          {canWrite && (
            <div className="mt-3.5">
              <RecalcButton
                onClick={() => void handleRecalculate()}
                isLoading={isRecalculating}
                /*
                 * `em_calculo` (or an unreadable status) disables the CTA: a
                 * second request would be refused with 409 and, worse, would
                 * read as "nothing is happening, click again".
                 */
                disabled={isCalculating || statusUnknown}
                label="↻ Recalcular / Simular (ARP)"
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Banners
// ---------------------------------------------------------------------------

function ArpUnavailableBanner() {
  return (
    <div
      role="alert"
      data-testid="proposal-arp-unavailable-banner"
      className="mb-3 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
    >
      ⚠ Serviço ARP indisponível. Os valores exibidos não são definitivos —
      tente recalcular em instantes.
    </div>
  );
}

/**
 * ⚠️ O texto vem do BACKEND (`motivo`), porque o 400 tem mais de uma causa e a
 * frase fixa mandava o LT conferir produtos e recursos quando o problema estava
 * no card de Investimentos (ADO 68425). A frase local é fallback para resposta
 * sem corpo, não o padrão.
 */
function NotReadyBanner({ motivo }: { motivo?: string | null }) {
  return (
    <div
      role="alert"
      data-testid="proposal-not-ready-banner"
      className="mb-3 rounded-[var(--radius-xs)] border border-(--yellow-300) bg-(--yellow-100) px-3 py-2.5 text-(length:--t-caption) text-(--yellow-700)"
    >
      {motivo?.trim()
        ? motivo
        : "Defina os produtos e os recursos financeiros da proposta antes de calcular os indicadores."}
    </div>
  );
}

function GenericRecalcErrorBanner() {
  return (
    <div
      role="alert"
      data-testid="proposal-recalc-error-banner"
      className="mb-3 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
    >
      Falha ao recalcular os indicadores. Tente novamente.
    </div>
  );
}
