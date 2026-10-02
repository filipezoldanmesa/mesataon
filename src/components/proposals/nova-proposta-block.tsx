"use client";

import { useRef, useState } from "react";

import { PicklistSelect } from "@/components/picklists/picklist-select";
import { PicklistField } from "@/lib/picklists/picklists.types";
import {
  Finalidade,
  TipoContrato,
  TipoProposta,
  tipoContratoLabel,
} from "@/lib/picklists/salesforce-values";
import { FieldLabel } from "@/components/ui/field-label";
import {
  deriveSalesHorizonMonths,
  formatSalesHorizon,
} from "@/lib/proposals/sales-horizon";
import { Select } from "@/components/ui/select";
import {
  CardCollapseToggle,
  useCardCollapse,
} from "@/components/proposals/card-collapse";
import {
  analysisWindowError,
  snapToFirstDayOfMonth,
  snapToLastDayOfMonth,
} from "@/lib/proposals/proposal-date-validation";
import { validateConsumptionWindow } from "@/lib/proposals/consumption-window";
import type {
  ProposalContractType,
  ProposalDateConstraints,
  ProposalFinalidade,
} from "@/lib/proposals/proposal-creation.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The form state kept inside the modal.
 * All string fields default to '' (empty), which is "not set".
 */
export interface ProposalFormData {
  tipoContrato: ProposalContractType | "";
  finalidade: ProposalFinalidade | "";
  dataInicioAnalise: string;
  dataFimAnalise: string;
  programaAcelera: "" | "sim" | "nao";
  possuiInvestimentos: "" | "sim" | "nao";
  /** e.g. "1,0" — default on first open. */
  horizonteVendas: string;
  dataInicioConsumo: string;
  dataFimConsumo: string;
}

/**
 * Temporary screen-level recorte: only these finalidades are offered for now
 * (product decision, 11/08/2026). The catalog keeps the full value set and the
 * API still accepts any valid member — to lift the restriction, delete this
 * constant and the `allow` prop on the Finalidade `PicklistSelect` below.
 * Mirrors the same recorte on the opportunity-creation screen.
 */
const FINALIDADE_ALLOW = [
  Finalidade.Implantacao,
  Finalidade.Vinculacao,
] as const;

const EMPTY_FORM: ProposalFormData = {
  tipoContrato: "",
  finalidade: "",
  dataInicioAnalise: "",
  dataFimAnalise: "",
  programaAcelera: "",
  possuiInvestimentos: "",
  horizonteVendas: "1,0",
  dataInicioConsumo: "",
  dataFimConsumo: "",
};

/** Block UI state machine. */
type BlockState = "empty" | "modal-open" | "filled";

/**
 * RN-F3-02 — the only two contract types a PCR proposal may be created with.
 *
 * Salesforce is broader here: `valueSettings` enables SIX values for
 * `Tipo_de_Proposta__c = PCR` (`CPCVM Produto`, `CPCVM Volume`,
 * `CPCVM + Sublocação`, `CLUM Liquido`, `BR Mania`, `Lubrax +`), and QA reported
 * all six on screen (VBR-463). The extra four are legitimate CRM values — they
 * are simply out of scope for this flow — so the narrowing belongs HERE and not
 * in the catalog, which is a verbatim transcription of Vibra's picklist document
 * shared by every other screen.
 *
 * Same mechanism as `FINALIDADE_ALLOW` above, and equally reversible: delete the
 * constant and the `allow` prop on the Tipo de contrato `PicklistSelect`.
 *
 * Named members, not string literals: a typo is then a compile error rather than
 * an option that silently disappears from the dropdown.
 */
const PCR_TIPOS_CONTRATO_PERMITIDOS = [
  TipoContrato.CpcvmVolume,
  TipoContrato.ClumLiquido,
] as const;

/**
 * The prototype's `.in` control (`docs/design/prototype/vibra-ui.css:92-95`)
 * for the modal's `<input>` elements: a FILLED surface with a 2px underline —
 * no box border, no radius. `input.in` also pins the height at 44px
 * (`03-proposta-nova.html:86`) so the date pickers line up with the selects.
 *
 * ⚠️ **Inputs only. Never pass this to `Select`/`PicklistSelect`.** Those render
 * the DS `Select`, whose default `variant="bottom-border"` already IS this
 * control, and whose `className` lands on the OUTER WRAPPER (layout/width only).
 * Handing it the fill and the underline therefore paints a second field around
 * the real one — the nested-box regression QA caught on "Tipo de contrato".
 *
 * Focus green is `--secondary-500`: that token IS the prototype's `#418020`.
 *
 * The disabled state keeps the enabled fill: the prototype's `#f4f5f5` differs
 * from `--neutral-40` (`#f2f2f2`) by an imperceptible amount, and what actually
 * separates the states in the design is the lighter underline and the muted
 * text. Adding a raw hex for it would break the no-hex rule (ADR-0018) to no
 * visible end.
 */
const INPUT_CLS =
  "h-11 w-full min-w-0 rounded-none border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) " +
  "px-3 py-[11px] text-(length:--t-caption) leading-[1.5] text-(--neutral-800) " +
  "transition-colors placeholder:text-(--neutral-500) " +
  "focus:outline-none focus:border-(--secondary-500) " +
  "disabled:cursor-not-allowed disabled:border-(--neutral-200) disabled:text-(--neutral-500)";

/**
 * The prototype's `.addrow` button (`03-proposta-nova.html:27-28`): an OUTLINED
 * button — green border, pale fill, 9px/16px padding — not a text link.
 *
 * Both `.addrow` buttons in this modal share it ("+ Cadastrar dados da
 * proposta" and "↻ Repetir datas da análise no consumo"), so the two cannot
 * drift apart. Every colour is the prototype's exact value: `#418020` is
 * `--secondary-500` (the call sites had `--secondary-600`, `#326517`, which is a
 * visibly darker green), `#f9f9f9` is `--neutral-25` (it was a raw hex, which
 * ADR-0018 forbids) and the `#eee` hover is `--neutral-50`.
 *
 * No margin here — spacing belongs to each call site — and no `cursor-pointer`:
 * `globals.css` already gives it to every enabled `<button>` in `@layer base`.
 */
const ADDROW_CLS =
  "inline-flex items-center rounded-(--radius-xxs) border border-(--secondary-500) " +
  "bg-(--neutral-25) px-4 py-[9px] text-(length:--t-caption) font-bold text-(--secondary-500) " +
  "hover:bg-(--neutral-50) disabled:cursor-not-allowed disabled:opacity-40";

type Props = {
  /**
   * Read-only Salesforce-sourced fields displayed inside the modal.
   *
   * `null` (the default) means "no source resolved this yet" and renders as a
   * NAMED gap, never as a plausible literal: this block used to default
   * `areaUsuario` to the string `'DCVIM'`, which is indistinguishable from real
   * Salesforce data on screen and was reported as such in QA (COR-4).
   *
   * A proibição segue valendo depois de 24/08/2026, quando o backend passou a
   * resolver e persistir o valor: o componente exibe o que o prop trouxe e não
   * opina — é o que impede banco e tela de discordarem.
   */
  areaUsuario?: string | null;
  centroDeLucro?: string | null;
  /**
   * Server-derived date limits (RN-F5-04), read from
   * `GET /api/proposals/date-constraints` by the page.
   *
   * `null` means the source did not answer — the field then carries NO limit hint
   * and never blocks: inventing a date on the client would look exactly like the
   * real rule on screen, and the API enforces it on submit regardless.
   */
  dateConstraints?: ProposalDateConstraints | null;
  /**
   * Seeds the block from a previously-saved draft (e.g. restored from
   * localStorage on reload) so it opens already in the "filled" state.
   */
  initialData?: ProposalFormData | null;
  /**
   * Called whenever the saved form data changes (including when the user
   * opens the modal and clicks "Concluir"). The page-level sendbar listens
   * to this to enable / disable its "Concluir" action.
   * Receives `null` when no data has been saved yet.
   */
  onDataSaved?: (data: ProposalFormData | null) => void;
};

/**
 * A read-only field fed by an upstream source.
 *
 * When `value` is null/blank the input shows an em dash and the label carries
 * `gapHint`, so an absent source reads as "we could not resolve this" instead of
 * a mute "—" that looks like a legitimately empty value (CLAUDE.md: "Campo sem
 * fonte nomeia a integração que falta, não vira `-` mudo").
 */
function ReadonlyField({
  label,
  value,
  gapHint,
}: {
  label: string;
  value: string | null;
  gapHint?: string;
}) {
  const resolved = value?.trim() ? value : null;

  return (
    <div className="min-w-0">
      <FieldLabel htmlFor={`ro-${label}`} hint={resolved ? undefined : gapHint}>
        {label}
      </FieldLabel>
      <input
        id={`ro-${label}`}
        type="text"
        value={resolved ?? "—"}
        disabled
        aria-disabled="true"
        className={INPUT_CLS}
      />
    </div>
  );
}

/**
 * Two-column grid inside the modal, at the prototype's spacing
 * (`03-proposta-nova.html:104` — `.pm .fgrid{gap:20px 24px}`); it was rendering
 * at a uniform 12px, which packs the rows much tighter than the design.
 *
 * The prototype also sets `align-items:end`, which is NOT carried over: it lines
 * the cells up by their bottoms, and this form renders inline validation
 * messages under some fields. A cell showing a date error would drag its
 * neighbour's input down to match — a misalignment the static prototype cannot
 * exhibit because it has no inline errors.
 *
 * The two columns are decided by a CONTAINER query (`@md` = 28rem of the modal
 * body), not by the viewport. The card is capped at `max-w-xl`, so its inner
 * width barely follows the screen: a `min-[601px]` breakpoint kept two columns
 * on a 610px-wide screen — where each date field gets ~250px and the native
 * picker crowds the label — and would keep them at any width above that no
 * matter how narrow the modal itself was. Querying the body means the fields
 * collapse exactly when THEY run out of room.
 */
function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-5 @md:grid-cols-2 short:gap-y-4">
      {children}
    </div>
  );
}

/** Formats a YYYY-MM-DD date to Brazilian locale (dd/mm/aaaa). */
function fmtDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ---------------------------------------------------------------------------
// Summary grid (shows data after modal is saved)
// ---------------------------------------------------------------------------

function ProposalDataSummary({
  data,
  onEdit,
}: {
  data: ProposalFormData;
  onEdit: () => void;
}) {
  const items: { label: string; value: string }[] = [
    { label: "Tipo de proposta", value: "PCR (Revendedor)" },
    {
      label: "Tipo de contrato",
      // Catalog LABEL ("CPCVM Volume Total"), not the persisted API name
      // ("CPCVM Volume") — the same text the select above offered.
      value: tipoContratoLabel(data.tipoContrato) || "—",
    },
    {
      label: "Finalidade",
      value: data.finalidade || "—",
    },
    {
      label: "Programa Acelera+",
      value: data.programaAcelera === "sim" ? "Sim" : "Não",
    },
    {
      label: "Possui investimentos",
      value: data.possuiInvestimentos === "sim" ? "Sim" : "Não",
    },
    {
      // Derivado, nunca digitado: o campo saiu do modal (era obrigatório e não
      // existia no DTO de criação — o LT preenchia um número que nunca saía do
      // browser). Segue no resumo porque é a referência que o LT quer ver.
      label: "Horizonte de vendas",
      value: formatSalesHorizon(
        deriveSalesHorizonMonths(data.dataInicioAnalise, data.dataFimAnalise),
      ),
    },
    {
      label: "Início da análise",
      value: fmtDate(data.dataInicioAnalise),
    },
    { label: "Fim da análise", value: fmtDate(data.dataFimAnalise) },
    {
      label: "Início do consumo",
      value: fmtDate(data.dataInicioConsumo || data.dataInicioAnalise),
    },
    {
      label: "Fim do consumo",
      value: fmtDate(data.dataFimConsumo || data.dataFimAnalise),
    },
  ];

  return (
    <div data-testid="proposal-data-summary">
      <div className="grid grid-cols-1 min-[601px]:grid-cols-2 gap-x-6 gap-y-2.5 mt-2">
        {items.map(({ label, value }) => (
          <div key={label} className="min-w-0">
            <div className="text-[12px] uppercase tracking-[0.3px] text-(--color-text-muted)">
              {label}
            </div>
            <div
              className="text-(length:--t-caption) font-bold mt-0.5 truncate"
              title={value}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        data-testid="edit-btn"
        onClick={onEdit}
        className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-xxs)] border border-(--secondary-600) px-4 py-1.5 text-(length:--t-caption) font-bold text-(--secondary-600) hover:bg-(--secondary-50)"
      >
        Editar dados
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * "Dados da proposta" block for the Nova Proposta mega-screen (F3 —
 * `03-proposta-nova.html:149-155`, modal `03-proposta-nova.html:383-416`).
 *
 * The block manages local form state only — it does NOT call the API.
 * The actual proposal creation (`POST /v1/opportunities/:id/proposals`) is
 * triggered by the page-level sendbar "Concluir" button, which reads
 * `onDataSaved` to obtain the filled values.
 *
 * UI states:
 *  - empty:      no data saved yet; shows empty-state CTA
 *  - modal-open: data-entry modal is visible
 *  - filled:     data saved; shows read-only summary + "Editar dados" link
 *
 * Business rules enforced here (RN-F3-02):
 *  - tipoProposta is always "PCR" — rendered as a disabled read-only field
 *  - tipoContrato is restricted to `CPCVM Volume` / `CLUM Liquido`
 *    (`PCR_TIPOS_CONTRATO_PERMITIDOS`), stricter than the CRM's own matrix
 *
 * RN-F3-03 (finalidade conditions F4–F6 blocks) is enforced at the page level
 * via `onDataSaved`; this block only persists the chosen value.
 */
export function NovaPropostaBlock({
  areaUsuario = null,
  centroDeLucro = null,
  dateConstraints = null,
  initialData = null,
  onDataSaved,
}: Props) {
  const [blockState, setBlockState] = useState<BlockState>(
    initialData ? "filled" : "empty",
  );
  const [savedData, setSavedData] = useState<ProposalFormData | null>(
    initialData,
  );
  const [form, setForm] = useState<ProposalFormData>(initialData ?? EMPTY_FORM);
  // Prototype: every `.block` card collapses from its own header, starting open.
  const collapse = useCardCollapse();

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const showAcelaraAlert = form.programaAcelera === "nao";

  const minFimAnalise = dateConstraints?.minDataFimAnalise ?? "";
  const minInicioAnalise = dateConstraints?.minDataInicioAnalise ?? "";

  // RN-F5-04 + fim >= inicio. The verdict is the shared one (see
  // `analysisWindowError`) so the modal and the page sendbar cannot disagree.
  const analysisDateError = analysisWindowError(
    form.dataInicioAnalise,
    form.dataFimAnalise,
    dateConstraints,
  );

  /*
   * ADO 67913 — as datas de consumo passam a ser cobradas DENTRO da janela da
   * análise ("editáveis para quaisquer datas dentro do período compreendido
   * entre início e fim da análise"). Antes só se checava `fim >= início`, e os
   * dois campos eram os únicos inputs de data deste modal sem limite nenhum.
   *
   * O veredito é o `validateConsumptionWindow` compartilhado — o MESMO que o
   * modal de produto usa e que espelha o `assertConsumptionWindow` do backend.
   * Uma segunda regra aqui divergiria exatamente no caso de borda.
   *
   * Continua OPCIONAL: só valida com as duas preenchidas, porque o predicado
   * compartilhado trata campo vazio como "informe" e estas datas não são
   * obrigatórias na criação (`canSave` não as exige).
   */
  const consumoDateError =
    form.dataInicioConsumo && form.dataFimConsumo
      ? (validateConsumptionWindow({
          inicioConsumo: form.dataInicioConsumo,
          fimConsumo: form.dataFimConsumo,
          dataInicioAnalise: form.dataInicioAnalise || null,
          dataFimAnalise: form.dataFimAnalise || null,
        }) ?? "")
      : "";

  const canSave =
    form.tipoContrato !== "" &&
    form.finalidade !== "" &&
    form.dataInicioAnalise !== "" &&
    form.dataFimAnalise !== "" &&
    form.programaAcelera !== "" &&
    form.possuiInvestimentos !== "" &&
    !analysisDateError &&
    !consumoDateError;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /*
   * ADO 67913 — as datas de consumo nascem espelhando as da análise, e a
   * edição do usuário NUNCA é sobrescrita.
   *
   * "Intocado" é um ref por campo, não um `useEffect` comparando valores: o
   * efeito não distingue "o usuário digitou exatamente a data da análise" de
   * "ninguém mexeu", e reescreveria a resposta dele no próximo ajuste da
   * janela. Mesmo padrão dos pré-preenchimentos do modal de produto
   * (`clientIncotermApplied`).
   *
   * Reabrir o modal com dado já salvo conta como TOCADO: aquele valor é
   * resposta de alguém, e o espelho não pode engoli-la.
   */
  const consumoInicioTouched = useRef(Boolean(initialData?.dataInicioConsumo));
  const consumoFimTouched = useRef(Boolean(initialData?.dataFimConsumo));

  function openModal() {
    // Pre-fill modal with previously saved data (if any)
    const next = savedData ?? EMPTY_FORM;
    consumoInicioTouched.current = Boolean(next.dataInicioConsumo);
    consumoFimTouched.current = Boolean(next.dataFimConsumo);
    setForm(next);
    setBlockState("modal-open");
  }

  function closeModal() {
    setBlockState(savedData ? "filled" : "empty");
  }

  function setField<K extends keyof ProposalFormData>(
    key: K,
    value: ProposalFormData[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Espelha uma data da análise na de consumo correspondente enquanto esta
   * estiver intocada (ADO 67913).
   */
  function setAnalysisDate(
    analysisKey: "dataInicioAnalise" | "dataFimAnalise",
    consumoKey: "dataInicioConsumo" | "dataFimConsumo",
    touched: React.MutableRefObject<boolean>,
    value: string,
  ) {
    setForm((prev) => ({
      ...prev,
      [analysisKey]: value,
      ...(touched.current ? {} : { [consumoKey]: value }),
    }));
  }

  /**
   * Copy analysis dates into consumption date fields.
   *
   * Com o espelho automático acima, este botão virou o "restaurar" — a saída de
   * quem editou e quer voltar ao período da análise. Por isso ele também
   * **destrava** o espelho: depois de restaurar, os campos voltam a ser
   * mirrors, senão o próximo ajuste da janela deixaria o consumo para trás.
   */
  function repeatAnalysisDates() {
    consumoInicioTouched.current = false;
    consumoFimTouched.current = false;
    setForm((prev) => ({
      ...prev,
      dataInicioConsumo: prev.dataInicioAnalise,
      dataFimConsumo: prev.dataFimAnalise,
    }));
  }

  function handleConcluir() {
    if (!canSave) return;
    setSavedData(form);
    onDataSaved?.(form);
    setBlockState("filled");
  }

  function handleEdit() {
    openModal();
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {/* Block card */}
      <div
        data-testid="nova-proposta-block"
        {...collapse.sectionProps}
        className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
      >
        {/* Same `.block` card as the other five (prototype `initCollapse`): the
            header stays visible and the body folds away. */}
        <h2
          {...collapse.headProps}
          className="mb-3.5 flex items-center gap-2.5 text-(length:--t-h4) font-bold"
        >
          Dados da proposta
          <CardCollapseToggle {...collapse.toggleProps} />
        </h2>

        {/* Empty state */}
        {blockState === "empty" && (
          <div
            data-testid="empty-state"
            className="flex flex-col items-start gap-3"
          >
            <p className="text-(length:--t-caption) text-(--color-text-muted)">
              Nenhum dado de proposta cadastrado ainda.
            </p>
            <button
              type="button"
              data-testid="open-modal-btn"
              onClick={openModal}
              className={ADDROW_CLS}
            >
              + Cadastrar dados da proposta
            </button>
          </div>
        )}

        {/* Filled summary */}
        {blockState === "filled" && savedData && (
          <ProposalDataSummary data={savedData} onEdit={handleEdit} />
        )}
      </div>

      {/* Modal overlay */}
      {blockState === "modal-open" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="nova-proposta-modal-title"
          data-testid="nova-proposta-modal"
          /*
           * `items-start` + `my-auto` on the card, NOT `items-center`: a flex
           * container centering a child taller than itself overflows in BOTH
           * directions, and the overflow above the top edge is unreachable even
           * with `overflow-y-auto` (the browser has no scroll range there). The
           * pair below centers while it fits and anchors to the top when it does
           * not, so the overlay's own scroll can reach the whole card.
           */
          /*
           * `z-[200]`, not `z-50`: the page that hosts this block renders a
           * FIXED sendbar (`fixed bottom-0 z-50`) as a sibling AFTER `<main>`,
           * while this overlay lives inside `<main>`. With equal z-index the
           * later element in the DOM paints on top, so the sendbar covered the
           * bottom strip of the modal — the "Concluir" button showed up sliced
           * in half, with the sendbar's own hint legible behind it. Matches the
           * `z-[200]` the proposal-type selector modal already uses.
           */
          /*
           * `short:p-0` — on a short viewport the 32-40px of vertical inset is
           * the difference between the last field being reachable and being
           * below the fold, and the dimmed strip around the card buys nothing
           * there. Dropping the horizontal inset too is what makes it a real
           * sheet on a phone (390px wide instead of 358px, which the two date
           * inputs side by side actually feel); on a WIDE short window the card
           * keeps its `max-w-xl` cap and simply centres, so nothing stretches.
           */
          className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-5 short:p-0"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          {/*
           * THE WHOLE CARD SCROLLS, and the header/footer are `sticky` inside
           * it — the same shape the sibling modals use (produtos, recursos
           * financeiros, situação do posto), so the CTA is both pinned and
           * impossible to clip.
           *
           * The previous attempt split the scroll (header/footer `shrink-0`,
           * body `flex-1 min-h-0`). That relies on the body actually shrinking;
           * when it does not, the footer is pushed past the card's bottom edge
           * and `overflow-hidden` cuts it off — the "Concluir" button sliced in
           * half, with no scroll range to reach it. Here there is no such
           * dependency: content that does not fit becomes scroll, and the
           * footer rides along at the bottom of the viewport regardless.
           *
           * `dvh` (not `vh`) so the mobile URL bar does not eat the footer.
           */}
          {/*
           * `short:` turns the floating card into a full-height sheet: it takes
           * the whole viewport height (the overlay dropped its vertical inset)
           * and loses the rounding, which would otherwise be clipped corners
           * sitting exactly on the screen edge. The width cap is untouched — a
           * 1400×600 window is short, not narrow, and a full-width sheet there
           * would be worse than the card.
           */}
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-[var(--radius-md)] bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)] sm:max-h-[calc(100dvh-2.5rem)] short:max-h-dvh short:rounded-none">
            {/* Modal header — sticky so the title stays while the form scrolls. */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-(--color-border) bg-white px-5 py-4 sm:px-6 short:py-2.5">
              <h4
                id="nova-proposta-modal-title"
                className="text-(length:--t-h4) font-bold"
              >
                Dados da proposta
              </h4>
              <button
                type="button"
                aria-label="Fechar"
                onClick={closeModal}
                className="cursor-pointer text-2xl leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
              >
                ×
              </button>
            </div>

            {/*
             * `@container` makes the field grid below query THIS box instead of
             * the viewport (see FieldGrid): the card is capped at `max-w-xl`, so
             * a viewport breakpoint says nothing about the width the fields
             * actually get.
             */}
            <div className="@container space-y-4 px-5 py-4 sm:px-6 sm:py-5 short:space-y-3 short:py-3">
              {/* Row 1: tipo de proposta (PCR, fixed) + tipo de contrato */}
              <FieldGrid>
                <ReadonlyField
                  label="Tipo de proposta"
                  value="PCR (Revendedor)"
                />
                <div>
                  <FieldLabel htmlFor="prop-contrato" required>
                    Tipo de contrato
                  </FieldLabel>
                  {/*
                    Options come from the catalog, filtered by the proposal type
                    and then narrowed to RN-F3-02. The old hardcoded pair
                    (`CPCVM`/`CLUM`) were not Salesforce values at all — the real
                    ones are `CPCVM Volume` and `CLUM Liquido`, out of 65. The
                    labels shown are the catalog's ("CPCVM Volume Total",
                    "CLUM Líquidos"), never retyped here.
                  */}
                  <PicklistSelect
                    id="prop-contrato"
                    data-testid="field-tipo-contrato"
                    field={PicklistField.QuoteTipoContrato}
                    controllingValue={TipoProposta.Pcr}
                    controllingLabel="Tipo de proposta"
                    allow={PCR_TIPOS_CONTRATO_PERMITIDOS}
                    value={form.tipoContrato}
                    onChange={(v) =>
                      setField("tipoContrato", v as ProposalContractType | "")
                    }
                    required
                  />
                </div>
              </FieldGrid>

              {/* Row 2: finalidade + Programa Acelera+ */}
              <FieldGrid>
                <div>
                  <FieldLabel htmlFor="prop-finalidade" required>
                    Finalidade
                  </FieldLabel>
                  <PicklistSelect
                    id="prop-finalidade"
                    data-testid="field-finalidade"
                    field={PicklistField.QuoteFinalidade}
                    controllingValue={TipoProposta.Pcr}
                    controllingLabel="Tipo de proposta"
                    value={form.finalidade}
                    onChange={(v) =>
                      setField("finalidade", v as ProposalFinalidade | "")
                    }
                    allow={FINALIDADE_ALLOW}
                    required
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="prop-acelera" required>
                    Programa Acelera+
                  </FieldLabel>
                  <Select
                    id="prop-acelera"
                    data-testid="field-programa-acelera"
                    value={form.programaAcelera}
                    onChange={(v) =>
                      setField("programaAcelera", v as "" | "sim" | "nao")
                    }
                    options={[
                      { value: "sim", label: "Sim" },
                      { value: "nao", label: "Não" },
                    ]}
                    placeholder="Selecione…"
                    required
                    variant="bottom-border"
                  />
                  {/*
                   * Os dois nomes do mesmo programa se encontram aqui: o
                   * negócio chama de Acelera+, o Salesforce de PIM
                   * (`PimAdesao__c`). É esta resposta que viaja ao org e
                   * libera o cálculo da alçada — sem a linha, quem recebe a
                   * recusa não tem como saber que o conserto é este campo.
                   * Fora do alerta âmbar de propósito: aquele fala de
                   * aprovação gerencial, outro assunto.
                   */}
                  <p className="mt-1 text-[12px] text-(--color-text-muted)">
                    É esta resposta que vai ao Salesforce como a{" "}
                    <strong>Adesão ao PIM</strong> e libera o cálculo da alçada.
                  </p>
                  {showAcelaraAlert && (
                    <div
                      role="note"
                      data-testid="acelera-alert"
                      className="mt-1.5 rounded-[var(--radius-xs)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700"
                    >
                      <strong>Atenção:</strong> sem o Programa Acelera+, esta
                      proposta precisará de aprovação do gerente antes de
                      prosseguir.
                    </div>
                  )}
                </div>
              </FieldGrid>

              {/* Row 3: área do usuário (read-only) + centro de lucro (read-only) */}
              <FieldGrid>
                {/*
                  "Área do usuário" é `Gerencia_Do_Usuario__c` (value set
                  `Gerencia_Do_Usuario`: DCVIM/DCB2B/AVIA/LUB/DD).

                  O valor vem do BACKEND, que desde 24/08/2026 persiste a
                  gerência DESTA plataforma na criação da oportunidade e da
                  proposta — o mesmo `DCVIM` que a integração já enviava ao
                  Salesforce. Medido: o org atribui `DCVIM` a 22 das 23
                  oportunidades que criamos, pelo default
                  `$User.Area_Do_Usuario__c` do usuário de integração (que tem
                  `DCVIM` desde 17/08/2026 — a afirmação anterior, de que estava
                  nulo, era de 07/08 e caducou).

                  ⚠️ O componente NUNCA cai no literal por conta própria: se
                  caísse, banco e tela poderiam discordar, e um valor fabricado
                  lê na tela exatamente como dado real. Sem valor, mostra `—` e o
                  label nomeia a lacuna.
                */}
                <ReadonlyField
                  label="Área do usuário"
                  value={areaUsuario}
                  gapHint="gerência não registrada nesta oportunidade"
                />
                {/*
                  Same relabel as the opportunity screen: the value is
                  `Account.Zona_de_vendas_da_conta__c`, a formula over the sales
                  zone of the seller on the account's profit centre ("RN06"),
                  not the profit-centre code ("DAC0TNA006"). Measured 16/08/2026
                  — see architecture/Salesforce-Evidencias-Centro-De-Lucro-2026-08-16.md.
                */}
                <ReadonlyField
                  label="Zona de vendas (centro de lucro)"
                  value={centroDeLucro}
                  gapHint="não informado no Salesforce"
                />
              </FieldGrid>

              {/* Row 4: possui investimentos + horizonte de vendas */}
              <FieldGrid>
                <div>
                  <FieldLabel htmlFor="prop-investimentos" required>
                    Possui investimentos
                  </FieldLabel>
                  <Select
                    id="prop-investimentos"
                    data-testid="field-possui-investimentos"
                    value={form.possuiInvestimentos}
                    onChange={(v) =>
                      setField("possuiInvestimentos", v as "" | "sim" | "nao")
                    }
                    options={[
                      { value: "nao", label: "Não" },
                      { value: "sim", label: "Sim" },
                    ]}
                    placeholder="Selecione…"
                    required
                    variant="bottom-border"
                  />
                </div>
              </FieldGrid>

              {/* Row 5: datas de análise */}
              <FieldGrid>
                <div>
                  <FieldLabel
                    htmlFor="prop-ini-analise"
                    required
                    /* The floor is the org's, not ours: the CRM refuses the Quote
                       when the analysis starts before the earliest month the rule
                       allows (`Data_Inicio_Analise_Mes_Seguite_Criacao`; the offset
                       is org configuration, `0` since VBR-547). The hint names the
                       DATE the API sent and never which month that is — see
                       `analysisWindowError`. Omitted when the API is silent. */
                    hint={
                      minInicioAnalise
                        ? `1º dia do mês, a partir de ${fmtDate(minInicioAnalise)}`
                        : "1º dia do mês"
                    }
                  >
                    Data início da análise
                  </FieldLabel>
                  <input
                    id="prop-ini-analise"
                    type="date"
                    data-testid="field-data-inicio"
                    value={form.dataInicioAnalise}
                    /* Snap to the 1st: the rule is "the month you chose", so the
                       day clicked carries no information worth keeping — and a
                       date the CRM will reject should never survive the blur. */
                    onChange={(e) =>
                      setAnalysisDate(
                        "dataInicioAnalise",
                        "dataInicioConsumo",
                        consumoInicioTouched,
                        e.target.value
                          ? snapToFirstDayOfMonth(e.target.value)
                          : "",
                      )
                    }
                    /* Native floor from the API's value — the picker itself greys
                       out impossible dates. Absent ⇒ no `min` at all. */
                    min={minInicioAnalise || undefined}
                    aria-invalid={analysisDateError ? true : undefined}
                    aria-describedby={
                      analysisDateError ? "prop-fim-analise-error" : undefined
                    }
                    required
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="prop-fim-analise"
                    required
                    /* Named limit while the field is still empty — the rule is not
                       obvious from the label, and discovering it in a 400 was the
                       QA finding. Omitted entirely when the source is silent. */
                    hint={
                      minFimAnalise
                        ? `último dia do mês, a partir de ${fmtDate(minFimAnalise)}`
                        : "último dia do mês"
                    }
                  >
                    Data fim da análise
                  </FieldLabel>
                  <input
                    id="prop-fim-analise"
                    type="date"
                    data-testid="field-data-fim"
                    value={form.dataFimAnalise}
                    /* Snap to the last day of the chosen month — same reasoning as
                       the start date (`Data_Fim_Analise_Ultimo_Dia`). */
                    onChange={(e) =>
                      setAnalysisDate(
                        "dataFimAnalise",
                        "dataFimConsumo",
                        consumoFimTouched,
                        e.target.value
                          ? snapToLastDayOfMonth(e.target.value)
                          : "",
                      )
                    }
                    /* Native floor from the API's value — the picker itself greys
                       out impossible dates. Absent ⇒ no `min` at all. */
                    min={minFimAnalise || undefined}
                    aria-invalid={analysisDateError ? true : undefined}
                    aria-describedby={
                      analysisDateError ? "prop-fim-analise-error" : undefined
                    }
                    required
                    className={INPUT_CLS}
                  />
                  {analysisDateError && (
                    <p
                      role="alert"
                      id="prop-fim-analise-error"
                      data-testid="date-error"
                      className="mt-1 text-[12px] text-(--color-danger)"
                    >
                      {analysisDateError}
                    </p>
                  )}
                </div>
              </FieldGrid>

              {/* Row 6: datas de consumo */}
              <FieldGrid>
                <div>
                  <FieldLabel htmlFor="prop-ini-consumo">
                    Data início do consumo
                  </FieldLabel>
                  <input
                    id="prop-ini-consumo"
                    type="date"
                    data-testid="field-data-ini-consumo"
                    value={form.dataInicioConsumo}
                    onChange={(e) => {
                      consumoInicioTouched.current = true;
                      setField("dataInicioConsumo", e.target.value);
                    }}
                    /* Limites nativos da janela da análise (ADO 67913) — o
                       picker cinza o impossível em vez de deixar o usuário
                       descobrir num erro. Ausentes ⇒ nenhum limite. */
                    min={form.dataInicioAnalise || undefined}
                    max={form.dataFimAnalise || undefined}
                    aria-invalid={consumoDateError ? true : undefined}
                    aria-describedby={
                      consumoDateError ? "prop-fim-consumo-error" : undefined
                    }
                    className={INPUT_CLS}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="prop-fim-consumo">
                    Data fim do consumo
                  </FieldLabel>
                  <input
                    id="prop-fim-consumo"
                    type="date"
                    data-testid="field-data-fim-consumo"
                    value={form.dataFimConsumo}
                    onChange={(e) => {
                      consumoFimTouched.current = true;
                      setField("dataFimConsumo", e.target.value);
                    }}
                    min={
                      form.dataInicioConsumo ||
                      form.dataInicioAnalise ||
                      undefined
                    }
                    max={form.dataFimAnalise || undefined}
                    aria-invalid={consumoDateError ? true : undefined}
                    aria-describedby={
                      consumoDateError ? "prop-fim-consumo-error" : undefined
                    }
                    className={INPUT_CLS}
                  />
                  {consumoDateError && (
                    <p
                      role="alert"
                      id="prop-fim-consumo-error"
                      data-testid="consumo-date-error"
                      className="mt-1 text-[12px] text-(--color-danger)"
                    >
                      {consumoDateError}
                    </p>
                  )}
                </div>
              </FieldGrid>

              {/* Repeat analysis dates shortcut */}
              <button
                type="button"
                data-testid="btn-repetir-datas"
                onClick={repeatAnalysisDates}
                /* `||`, não `&&`: com só UMA data da análise preenchida o
                   clique copiava a vazia por cima da outra data de consumo —
                   apagava a resposta do usuário em vez de restaurá-la. */
                disabled={!form.dataInicioAnalise || !form.dataFimAnalise}
                className={ADDROW_CLS}
              >
                ↻ Repetir datas da análise no consumo
              </button>
            </div>

            {/* Modal footer — `.pm-foot` (03-proposta-nova.html:108) is a bare
                flex row with no rule above it; the separator was ours.
                `sticky bottom-0` + opaque background: the CTA sits at the
                bottom edge of the card whatever the screen height, and the form
                scrolls underneath it.

                The separator comes back under `short:` only. The prototype is a
                page that never scrolls, so a bare row reads fine there; on a
                short viewport the form DOES slide under this opaque band, and
                without a rule the fields are sliced mid-glyph with nothing
                saying there is more above. Below 760px the card always scrolls,
                so the rule appears exactly when it carries information. */}
            <div className="sticky bottom-0 z-10 flex items-center justify-end bg-white px-5 py-4 sm:px-6 short:border-t short:border-(--color-border) short:py-2.5">
              <button
                type="button"
                data-testid="submit-btn"
                onClick={handleConcluir}
                disabled={!canSave}
                aria-disabled={!canSave}
                className="cursor-pointer rounded-[var(--radius-xxs)] bg-(--secondary-500) px-6 py-2.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-hover) disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
