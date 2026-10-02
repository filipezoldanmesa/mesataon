"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CardCollapseToggle,
  useCardCollapse,
} from "@/components/proposals/card-collapse";

import { usePicklist } from "@/hooks/use-picklist";
import { PicklistField } from "@/lib/picklists/picklists.types";
import { FieldLabel } from "@/components/ui/field-label";
import { Select } from "@/components/ui/select";

import {
  createFinancialItem as defaultCreate,
  deleteFinancialItem as defaultDelete,
  listFinancialItemTypes as defaultListTypes,
  listFinancialItems as defaultList,
  updateFinancialItem as defaultUpdate,
} from "@/lib/proposals/financial-items.data";
import type {
  CategoriaFinanceiro,
  CreateFinancialItemInput,
  FinancialItem,
  FinancialItemMutationResult,
  FinancialItemType,
  FinancialSummary,
  FinancialItemsSnapshot,
  IndiceCorrecao,
  PeriodicidadeItem,
  RecordTypeFinanceiro,
  UpdateFinancialItemInput,
} from "@/lib/proposals/financial-items.types";
import {
  CATEGORIA_LABELS,
  FinancialItemCriticaError,
  GnvVolumeInvalidError,
  PERIODICIDADE_LABELS,
  RECORD_TYPE_LABELS,
  RequiredItemConflictError,
} from "@/lib/proposals/financial-items.types";
import { usePermissions } from "@/hooks/use-permissions";
import { Permission } from "@/lib/auth-permissions";
import {
  BlocoAjusteAction,
  useProposalViewMode,
} from "@/components/proposals/proposal-view-mode";
import { BlocoProposta } from "@/lib/proposals/ajuste";
import { useConfirm } from "@/components/confirm-dialog";
import { isExpiredSessionError } from "@/lib/api-errors";
import { redirectToLogin } from "@/lib/auth";
import { withOneRetry } from "@/lib/with-retry";
import { maskMoneyInput, parseMoneyInput } from "@/lib/franquia/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = "loading" | "loaded" | "error";

type ModalState = { mode: "create" } | { mode: "edit"; item: FinancialItem };

type Props = {
  proposalId: string;
  /** Injectable for tests; defaults to the real BFF client (financial-items.data.ts). */
  listTypes?: (proposalId: string) => Promise<FinancialItemType[]>;
  /**
   * Loads the proposal's existing receitas/despesas. Mandatory items are
   * auto-seeded by the backend upon proposal creation (HU-21 / RN-F9-02), so
   * on first render the list already contains the parametrised required items
   * with `obrigatoria=true`. The LT can then edit their values and add
   * optional items on top.
   */
  list?: (proposalId: string) => Promise<FinancialItemsSnapshot>;
  createItem?: (
    proposalId: string,
    input: CreateFinancialItemInput,
  ) => Promise<FinancialItemMutationResult>;
  updateItem?: (
    proposalId: string,
    itemId: string,
    input: UpdateFinancialItemInput,
  ) => Promise<FinancialItemMutationResult>;
  deleteItem?: (proposalId: string, itemId: string) => Promise<void>;
  /**
   * Called after an item is successfully created, edited, or deleted.
   * Wired by the parent to bump the auto-calc refresh signal so
   * `ProposalAutoCalcBlock` can re-fetch when F9 data changes (Bug 67533).
   *
   * Note: the card's four displayed lines (volume, receita, margem, investimento)
   * do not yet aggregate F9 items — this callback is plumbed as a prerequisite
   * for that future aggregation and to keep the wiring consistent with
   * `FinancialResourcesBlock.onResourcesChanged`.
   */
  onItemsChanged?: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null): string {
  // Guard `null` — the backend may return null when a value has not been set
  // yet (e.g. a newly-created required item with no amount), which is a
  // distinct state from "zero" and must not crash the block.
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formats a "YYYY-MM-DD" date string as "dd/mm/aaaa" without timezone shifts. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Recomputes the financial summary locally after a delete (no summary in the 204 response). */
function recomputeSummary(items: FinancialItem[]): FinancialSummary {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  /**
   * `valorFinal` é `null` quando o BFF mascara (fora de produção). Tratar null
   * como 0 produziria um total ERRADO exibido como se fosse real, então a soma
   * inteira vira `null` — o mesmo que o backend devolveria mascarado.
   */
  const sum = (categoria: FinancialItem["categoria"]): number | null => {
    const vals = items
      .filter((i) => i.categoria === categoria)
      .map((i) => i.valorFinal);
    if (vals.some((v) => v === null)) return null;
    return round2((vals as number[]).reduce((acc, v) => acc + v, 0));
  };
  const totalReceitas = sum("RECEITA");
  const totalDespesas = sum("DESPESA");
  return {
    totalReceitas,
    totalDespesas,
    // Saldo só existe se os dois lados forem conhecidos.
    saldo:
      totalReceitas === null || totalDespesas === null
        ? null
        : round2(totalReceitas - totalDespesas),
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ onAdd }: { onAdd: (() => void) | null }) {
  return (
    <div>
      <div
        className="mb-3 rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
        data-testid="empty-state"
      >
        Nenhuma receita ou despesa adicionada ainda.
      </div>
      {onAdd && <AddButton onClick={onAdd} />}
    </div>
  );
}

function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onDismiss, 3000);
    return () => clearTimeout(id);
  }, [message, onDismiss]);

  return (
    <div
      role="alert"
      data-testid="delete-conflict-toast"
      className="fixed bottom-5 left-1/2 z-50 max-w-[80%] -translate-x-1/2 rounded-[var(--radius-xs)] bg-(--neutral-900) px-4 py-2.5 text-center text-[13px] text-white shadow-lg"
    >
      {message}
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="add-item-button"
      /*
       * Prototype `.addrow`: #418020 → --secondary-500 (not -600, which is the
       * darker #326517), #f9f9f9 → --neutral-25, hover #eee → --neutral-50.
       * `leading-[normal]`: see `BTN_CLASS` — buttons are missing from the
       * line-height reset in globals.css.
       */
      className="mt-2.5 rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-[9px] text-(length:--t-caption) leading-[normal] font-bold text-(--secondary-500) transition-colors hover:bg-(--neutral-50)"
    >
      + Adicionar receita/despesa
    </button>
  );
}

/**
 * Prototype `rt + ' · ' + fintipo` — "Receita · Licença de Uso de Marca (CLUM)".
 *
 * The open-ended types the business added in ADO 67584 are named after their own
 * record type, so composing both halves verbatim would repeat the same words
 * ("Outras Receitas · Outras Receitas"). When they match, one is enough.
 */
function composeItemTitle(item: FinancialItem): string {
  const recordTypeLabel = RECORD_TYPE_LABELS[item.recordType];
  if (
    item.tipoNome.trim().toLocaleLowerCase("pt-BR") ===
    recordTypeLabel.toLocaleLowerCase("pt-BR")
  ) {
    return recordTypeLabel;
  }
  return `${recordTypeLabel} · ${item.tipoNome}`;
}

function ItemCard({
  item,
  busy,
  onEdit,
  onDelete,
  showActions = true,
}: {
  item: FinancialItem;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** false while the proposal is under analysis — edits are closed. */
  showActions?: boolean;
}) {
  return (
    <div
      data-testid={`item-card-${item.id}`}
      className="mb-2.5 rounded-[var(--radius-xs)] border border-(--color-border) px-4 py-3.5"
    >
      {/* Prototype `.rec-card-h` (`ciclo1.js:329`). */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5">
        {/*
         * Composed title, as the prototype composes it: `rt + ' · ' + fintipo`
         * → "Receita · Licença de Uso de Marca (CLUM)", "Outra Despesa ·
         * Royalties GNV".
         *
         * The two coloured chips this card used to carry are gone. They restated
         * the title's own first half (record type) and the action slot's own
         * verdict (obrigatória), so the row said the same thing three times while
         * the fields that identify the item — categoria, descrição — were not
         * shown at all. `Categoria` is now the first body field, as in the
         * prototype.
         */}
        <span
          className="text-(length:--t-caption) font-bold"
          data-testid={`item-title-${item.id}`}
        >
          {/*
           * The two halves collapse when they say the same thing: the open-ended
           * types are named after their own record type ("Outras Receitas"), so
           * composing them verbatim would read "Outras Receitas · Outras
           * Receitas" (ADO 67584).
           */}
          {composeItemTitle(item)}
        </span>
        {showActions && (
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              data-testid={`${item.obrigatoria ? "detail" : "edit"}-button-${item.id}`}
              /* Prototype `.lnk-edit` — outlined, 14px = --t-caption, 5px/12px. */
              className="rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-white px-3 py-[5px] text-(length:--t-caption) leading-[normal] font-bold text-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {/*
               * A mandatory item is a Vibra parameter: every field of it comes
               * from the catalogue, so the modal it opens has nothing to edit
               * (VBR-584). Labelling it "Editar" would promise an edit the
               * backend answers with 422.
               */}
              {item.obrigatoria ? "Detalhes" : "Editar"}
            </button>
            {item.obrigatoria ? (
              /*
               * A parameterised item cannot be removed, so the slot says WHY
               * instead of holding a disabled Excluir — a control that can never
               * be pressed is dead control (prototype `addFin`, `ciclo1.js:314`).
               */
              <span
                data-testid={`required-badge-${item.id}`}
                title="Item parametrizado/obrigatório — não pode ser removido"
                className="px-1.5 py-[5px] text-[12px] font-bold text-(--color-text-muted)"
              >
                Obrigatório
              </span>
            ) : (
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                data-testid={`delete-button-${item.id}`}
                /* Prototype `.lnk-del` — bare red link, 5px/6px padding. */
                className="border-none bg-none px-1.5 py-[5px] text-(length:--t-caption) leading-[normal] font-bold text-(--red-700) hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Excluindo…" : "Excluir"}
              </button>
            )}
          </div>
        )}
      </div>

      {/*
       * Prototype `.sit-resumo`: two columns, `gap:12px 24px`. Field order and
       * labels follow `ciclo1.js:331-338`.
       *
       * `Valor total` is the one field the app adds. It stays, next to the
       * `Valor` it derives from: the prototype shows a monthly figure and no
       * total, and a reader comparing items over a 5-year período needs the
       * total the backend already computes (`valorFinal`).
       */}
      <div className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-3 text-[12px] text-(--color-text-muted) sm:grid-cols-2">
        <div>
          <div className="uppercase tracking-wide">Categoria</div>
          <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
            {CATEGORIA_LABELS[item.categoria]}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide">Valor</div>
          <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
            {formatCurrency(item.valor)}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide">Valor total</div>
          <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
            {formatCurrency(item.valorFinal)}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide">Descrição</div>
          <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
            {item.descricao?.trim() ? item.descricao : "—"}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide">Índice de correção</div>
          <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
            {item.indiceCorrecao ?? "Nenhum"}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide">Periodicidade</div>
          <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
            {PERIODICIDADE_LABELS[item.periodicidade]}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide">Período</div>
          <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
            {formatDate(item.dataInicial)} → {formatDate(item.dataFinal)}
          </div>
        </div>
        {item.volumeGnvCtf != null && (
          <div>
            <div className="uppercase tracking-wide">Volume GNV/CTF</div>
            <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
              {item.volumeGnvCtf.toLocaleString("pt-BR")} m³
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal (add / edit)
// In EM_PREENCHIMENTO / DEVOLVIDA all fields are editable.
// In EM_ANALISE only valor / volumeGnvCtf / bypass can be changed — the
// backend enforces this; the edit button is hidden (showActions = canWrite)
// so the modal is never reached from a read-only proposal in the UI.
// ---------------------------------------------------------------------------

type FormValues = {
  /**
   * Prototype's "Tipo (record type)" control (`#fm-tipo`). **Not** a payload
   * field: the backend derives `recordType` from the chosen
   * `FinancialItemType`, so this only narrows the "Tipo financeiro" list — and
   * it snaps to the selected type's own record type, so the two controls can
   * never disagree on screen.
   */
  recordType: RecordTypeFinanceiro | "";
  financialItemTypeId: string;
  descricao: string;
  valor: string;
  indiceCorrecao: IndiceCorrecao | "";
  periodicidade: PeriodicidadeItem | "";
  dataInicial: string;
  dataFinal: string;
  volumeGnvCtf: string;
};

const EMPTY_FORM: FormValues = {
  recordType: "",
  financialItemTypeId: "",
  descricao: "",
  // Empty so the placeholder shows; the mask keeps it formatted once the user
  // types. In the create flow the type-selection pre-fill also uses the mask.
  valor: "",
  indiceCorrecao: "",
  periodicidade: "",
  dataInicial: "",
  dataFinal: "",
  volumeGnvCtf: "",
};

const RECORD_TYPE_ORDER = Object.keys(
  RECORD_TYPE_LABELS,
) as RecordTypeFinanceiro[];

/** Prototype `catFromRT`: the three DESPESA* record types are the despesa side. */
function categoriaFromRecordType(
  recordType: RecordTypeFinanceiro | "",
): CategoriaFinanceiro | "" {
  if (recordType === "") return "";
  return recordType.includes("DESPESA") ? "DESPESA" : "RECEITA";
}

/**
 * The prototype hardcodes all six record types; here only the ones with at
 * least one eligible type are offered, because a record type with none would
 * leave "Tipo financeiro" empty — a dead control.
 */
function availableRecordTypes(
  types: FinancialItemType[],
): RecordTypeFinanceiro[] {
  const present = new Set(types.map((t) => t.recordType));
  return RECORD_TYPE_ORDER.filter((rt) => present.has(rt));
}

function initialForm(
  modal: ModalState,
  types: FinancialItemType[],
  horizonStart?: string,
  horizonEnd?: string,
): FormValues {
  if (modal.mode === "create") {
    // Prototype opens on "Receita"; here on the first record type the
    // parametrisation actually offers.
    return {
      ...EMPTY_FORM,
      recordType: availableRecordTypes(types)[0] ?? "",
      /*
       * RN-F9-03: a vigência do item tem de caber no horizonte de análise da
       * proposta, e o horizonte inteiro é o default — a MESMA convenção que o
       * backend já aplica aos itens obrigatórios (`seedRequired` grava
       * `dataInicial = proposal.dataInicioAnalise` e
       * `dataFinal = proposal.dataFimAnalise`). Um item manual que nasce com a
       * mesma vigência dos obrigatórios é o caso comum; digitar as duas datas
       * à mão a cada item era trabalho para chegar no mesmo lugar.
       *
       * `?? ""` e não uma data plausível: horizonte ausente (snapshot que não
       * respondeu) deixa o campo vazio. Uma data inventada aqui seria
       * indistinguível de uma escolha do usuário na tela e viajaria para
       * `numMeses`/`valorFinal` — e daí para a TIR.
       */
      dataInicial: horizonStart ?? "",
      dataFinal: horizonEnd ?? "",
    };
  }
  const item = modal.item;
  return {
    recordType: item.recordType,
    financialItemTypeId: item.financialItemTypeId,
    descricao: item.descricao ?? "",
    // Format the existing valor using the currency mask so the edit field
    // looks identical to freshly-typed input (CA-1). `null` → empty string
    // (BFF masking scenario — never shows "null" inside the input).
    valor:
      item.valor != null
        ? maskMoneyInput(item.valor.toFixed(2).replace(".", ""))
        : "",
    indiceCorrecao: item.indiceCorrecao ?? "",
    periodicidade: item.periodicidade,
    dataInicial: item.dataInicial,
    dataFinal: item.dataFinal,
    volumeGnvCtf: item.volumeGnvCtf != null ? String(item.volumeGnvCtf) : "",
  };
}

/**
 * Bottom-border input style — prototype `.in` (03-proposta-nova.html).
 * Used for `<input>` elements. `<select>` → `<Select>` DS component (no className).
 * Disabled tokens: --disabled-bg (#f4f5f5), --disabled-text (#767676) from globals.css.
 */
const FIELD_CLASS =
  "w-full min-w-0 rounded-none border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) px-3 py-[11px] text-(length:--t-caption) text-(--neutral-800) placeholder:text-(--neutral-500) focus:border-(--secondary-500) focus:outline-none disabled:cursor-not-allowed disabled:border-(--neutral-200) disabled:bg-(--disabled-bg) disabled:text-(--disabled-text)";

/**
 * Prototype `.pm .fgrid.c2`: 20px/24px gaps, bottom-aligned, single column
 * under 600px (`@media(max-width:600px)` — the prototype's own breakpoint).
 */
const ROW_CLASS =
  "mb-[18px] grid grid-cols-1 items-end gap-x-6 gap-y-5 min-[601px]:grid-cols-2";

/** Prototype `.pm .rec-sub:first-of-type` (14px = --t-caption; margin: 4px 0 10px). */
const SUBHEAD_CLASS =
  "mt-1 mb-2.5 text-(length:--t-caption) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)";

/**
 * Prototype `.btn` (vibra-ui.css): --t-caption, bold, radius-xxs, 9px/16px
 * padding, 1px border. `:disabled` repaints the button (#f4f5f5 bg →
 * --neutral-50, #767676 text → --neutral-500, transparent border) instead of
 * fading it — an opacity wash also dims the border and reads as a different
 * control.
 *
 * The base declares the border WIDTH only: each variant owns the colour. With
 * `border-transparent` here too, the ghost button's `border-(--secondary-500)`
 * lost — utilities of equal specificity are resolved by stylesheet order, not
 * by the order they appear in the class string — and Cancelar rendered with no
 * visible border at all.
 *
 * `leading-[normal]` is load-bearing, not cosmetic: globals.css restores the
 * prototype's `line-height: normal` for input/textarea/select, but NOT for
 * button, so Tailwind Preflight's `line-height: inherit` hands the button the
 * body's 1.5 — 21px instead of ~16px, i.e. 41px tall against the prototype's
 * 36px. (`leading-normal` is Tailwind's 1.5; the CSS keyword needs the
 * brackets.)
 */
const BTN_CLASS =
  "inline-flex items-center gap-2 rounded-[var(--radius-xxs)] border px-4 py-[9px] text-(length:--t-caption) leading-[normal] font-bold transition-colors disabled:cursor-not-allowed disabled:border-transparent disabled:bg-(--neutral-50) disabled:text-(--neutral-500)";

/** Prototype `.btn-ghost`: #f9f9f9 → --neutral-25, #418020 → --secondary-500, hover #eee → --neutral-50. */
const BTN_GHOST_CLASS = `${BTN_CLASS} border-(--secondary-500) bg-(--neutral-25) text-(--secondary-500) hover:bg-(--neutral-50)`;

/** Prototype `.btn-primary`: #418020 → --secondary-500, hover #3c781e → --secondary-600, borderless. */
const BTN_PRIMARY_CLASS = `${BTN_CLASS} border-transparent bg-(--secondary-500) text-white hover:bg-(--secondary-600)`;

function FinancialItemModal({
  modal,
  types,
  saving,
  criticas,
  horizonStart,
  horizonEnd,
  onClose,
  onSubmit,
}: {
  modal: ModalState;
  types: FinancialItemType[];
  saving: boolean;
  criticas: string[];
  /** RN-F9-03: início do horizonte de análise da proposta (YYYY-MM-DD). Vem do servidor. */
  horizonStart?: string;
  /** RN-F9-03: fim do horizonte de análise da proposta (YYYY-MM-DD). Vem do servidor. */
  horizonEnd?: string;
  onClose: () => void;
  onSubmit: (
    input: CreateFinancialItemInput | UpdateFinancialItemInput,
  ) => void;
}) {
  /** Read-only profiles cannot submit (mirrors ReadOnlyProfileGuard). */
  const { can } = usePermissions();
  // PRD F3–F9 (Atores: LT/EV): mirrors the @Roles on the block's write routes.
  const canWriteRole = can(Permission.ProposalManage);
  // Analysis layer (03-proposta-analise): edits close for EVERY profile
  // while the proposal is under analysis — role alone is not enough.
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;
  // Financial items share `Recurso_Financeiro_Da_Cotacao__c.Indice_De_Correcao__c`
  // with financial resources in the CRM, so both read the same catalog entry.
  const { options: indiceCorrecaoOptions } = usePicklist(
    PicklistField.RecursoFinanceiroIndiceCorrecao,
  );
  const isEdit = modal.mode === "edit";
  /**
   * VBR-584 (Bug ADO 67560): every field of a mandatory item is a Vibra
   * parameter — the amount comes from the account's regional column of
   * `Parametros_Da_Oportunidade__c`, the índice/periodicidade from the
   * catalogue defaults and the window from the analysis horizon. Leaving the
   * amount writable let R$ 678,65 be persisted as R$ 0,01 and travel to the
   * ARP. The screen locks it; the backend answers 422 (the enforcement).
   *
   * Manual items are untouched — VBR-552 structural editing stands.
   */
  const locked = isEdit && modal.item.obrigatoria;

  const [values, setValues] = useState<FormValues>(() =>
    initialForm(modal, types, horizonStart, horizonEnd),
  );

  /**
   * CA-4: track which of the three auto-filled fields the user has explicitly
   * changed so that switching types never overwrites a custom value.
   */
  const [touchedFields, setTouchedFields] = useState<
    Set<"descricao" | "indiceCorrecao" | "periodicidade" | "valor">
  >(new Set());

  // In edit mode values.financialItemTypeId starts as the current item's type
  // and may be changed by the user just like in create mode.
  const selectedType = types.find((t) => t.id === values.financialItemTypeId);
  const isGnvCtf = selectedType?.isGnvCtf ?? false;
  /**
   * VBR-595 (Bug ADO 67585): the four `Receita - Royalties GNV …` bands take
   * their amount from the "Parâmetros da Oportunidade" table, maintained by the
   * BP Financeiro. The LT picks the band; it does not price it.
   *
   * Narrower than `locked` on purpose — only the amount. Volume GNV, dates,
   * periodicidade and índice stay the LT's (VBR-552), and the volume is exactly
   * the field these items exist to carry, so locking the whole fieldset would
   * strand them.
   *
   * Keyed on the type SELECTED in the form, not on the item being edited: in
   * create mode there is no item yet, and switching the type has to move the
   * lock with it.
   */
  const valorLocked = locked || (selectedType?.cataloguePriced ?? false);

  /** Prototype's `#fm-cat`: derived from the record type, never typed. */
  const categoria = categoriaFromRecordType(values.recordType);
  /**
   * Prototype `finTipoOpts(catFromRT(rt))` — the list narrows by CATEGORIA, not
   * by exact record type, so picking "Receita Inicial" still shows every
   * receita type. `handleTypeChange` then snaps the record type to the one the
   * chosen type actually carries.
   */
  const selectableTypes = useMemo(
    () => types.filter((t) => t.categoria === categoria),
    [types, categoria],
  );

  // Always show the full list of available record types (both in create and
  // edit mode). In edit mode the initial value pre-selects the item's current
  // record type so the dropdown has a sensible default.
  const recordTypeOptions = useMemo(() => availableRecordTypes(types), [types]);

  function handleRecordTypeChange(recordType: RecordTypeFinanceiro) {
    const nextCategoria = categoriaFromRecordType(recordType);
    // Read current type to decide whether we're crossing categories.
    // Event handlers are synchronous so `values` is not stale here.
    const current = types.find((t) => t.id === values.financialItemTypeId);
    const keepType = current != null && current.categoria === nextCategoria;
    if (!keepType) {
      // Crossing to the other side (receita ⇄ despesa) wipes all defaults and
      // resets the touched-fields tracker so type defaults can land again (CA-4).
      setTouchedFields(new Set());
    }
    setValues((prev) => {
      if (keepType) return { ...prev, recordType };
      return {
        ...prev,
        recordType,
        financialItemTypeId: "",
        descricao: "",
        indiceCorrecao: "",
        periodicidade: "",
        volumeGnvCtf: "",
      };
    });
  }

  function handleTypeChange(typeId: string) {
    const type = types.find((t) => t.id === typeId);
    setValues((prev) => {
      const next: FormValues = {
        ...prev,
        financialItemTypeId: typeId,
        recordType: type?.recordType ?? prev.recordType,
      };
      // Prototype `fmApply`: the model's own defaults land in the form when
      // the type is picked — but only when the user has not already typed a
      // custom value for that field (CA-3 / touchedFields guard).
      //
      // `defaultDescricao` is used (not `descricao`): `descricao` is the
      // human-readable selector label; `defaultDescricao` is the pre-fill
      // text that should appear in the item's description field.
      if (!touchedFields.has("descricao")) {
        next.descricao = type?.defaultDescricao ?? "";
      }
      if (!touchedFields.has("indiceCorrecao")) {
        next.indiceCorrecao = type?.defaultIndiceCorrecao ?? "";
      }
      if (!touchedFields.has("periodicidade")) {
        next.periodicidade = type?.defaultPeriodicidade ?? "";
      }
      // Pre-fill valor in pt-BR currency mask format so the field looks the
      // same as user-typed input (CA-1). `0` is a valid business default —
      // keep it; never replace a value the user already typed (touchedFields
      // guard). `Number()` normalises the TypeORM numeric-as-string edge case.
      /*
       * The `touchedFields` guard does NOT apply to a catalogue-priced type
       * (VBR-595): its amount is not the user's to keep. Typing a value, then
       * switching to a GNV band, would leave that number sitting in a field the
       * form has just made read-only — and the API answers 422 on submit, for a
       * value the user can no longer reach to correct.
       */
      const priced = type?.cataloguePriced ?? false;
      if (priced || !touchedFields.has("valor")) {
        next.valor =
          type?.defaultValor != null
            ? maskMoneyInput(
                Number(type.defaultValor).toFixed(2).replace(".", ""),
              )
            : "";
      }
      return next;
    });
  }

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    /*
     * Read-only profile: the API answers 403, and a form still submits on Enter
     * even with the button hidden — so the guard lives in the handler too.
     */
    if (!canWrite) return;
    e.preventDefault();
    // Nothing is editable on a parameterised item — Enter must not submit
    // either (VBR-584).
    if (locked) return;

    if (isEdit) {
      // Send all editable fields so the backend can apply any that changed.
      // Structural fields (type, periodicidade, dates, índice) are only
      // accepted by the backend while the proposal is in EM_PREENCHIMENTO /
      // DEVOLVIDA; the edit button is hidden in other phases so this path is
      // never reached via the UI when it would be rejected.
      const input: UpdateFinancialItemInput = {
        financialItemTypeId: values.financialItemTypeId,
        valor: parsedValor!,
        periodicidade: values.periodicidade as PeriodicidadeItem,
        dataInicial: values.dataInicial,
        dataFinal: values.dataFinal,
      };
      input.descricao = values.descricao.trim();
      if (values.indiceCorrecao) input.indiceCorrecao = values.indiceCorrecao;
      if (isGnvCtf) input.volumeGnvCtf = Number(values.volumeGnvCtf);
      onSubmit(input);
      return;
    }

    const input: CreateFinancialItemInput = {
      financialItemTypeId: values.financialItemTypeId,
      valor: parsedValor!,
      periodicidade: values.periodicidade as PeriodicidadeItem,
      dataInicial: values.dataInicial,
      dataFinal: values.dataFinal,
    };
    if (values.descricao.trim()) input.descricao = values.descricao.trim();
    if (values.indiceCorrecao) input.indiceCorrecao = values.indiceCorrecao;
    if (isGnvCtf) input.volumeGnvCtf = Number(values.volumeGnvCtf);
    onSubmit(input);
  }

  // valor must be a positive number — the backend's `@IsPositive()` rejects
  // 0/negative with a 400, so gate submit client-side to avoid a confusing
  // round-trip. The field uses a pt-BR currency mask, so parse with
  // `parseMoneyInput` rather than `Number()`.
  const parsedValor = parseMoneyInput(values.valor);
  const validValor = parsedValor !== null && parsedValor > 0;

  /**
   * RN-F9-03: dataFinal deve ser >= dataInicial.
   * Só valida quando ambas estão preenchidas; se vazia, deixa o backend recusar.
   *
   * Vale nos DOIS modos: com a edição estrutural liberada em
   * EM_PREENCHIMENTO/DEVOLVIDA, as datas passaram a ser editáveis também no
   * modo edição — o antigo guard `!isEdit` deixaria justamente esse caminho
   * salvar um período invertido.
   */
  const dateOrderError =
    values.dataInicial !== "" &&
    values.dataFinal !== "" &&
    values.dataFinal < values.dataInicial
      ? "A data final deve ser igual ou posterior à data inicial (RN-F9-03)."
      : null;

  /**
   * RN-F9-03, outra metade: a vigência tem de caber no horizonte de análise da
   * proposta — `dataInicial >= horizonStart` e `dataFinal <= horizonEnd`, ambos
   * INCLUSIVOS (é o mesmo predicado de `assertDatesWithinHorizon` no backend;
   * note que a regra do recurso financeiro é diferente — lá o limite inferior é
   * exclusivo, por decisão de produto do Bug-67514).
   *
   * O `min`/`max` dos inputs limita o CALENDÁRIO, e só ele: o formulário é
   * `noValidate` e digitar ou colar uma data atravessa os dois atributos. Sem
   * esta checagem a recusa só aparecia como 422 do backend, depois do
   * round-trip — o mesmo backstop que o bloco de recursos financeiros já tem.
   *
   * Fora do horizonte é a comparação de strings `YYYY-MM-DD`: ordem
   * lexicográfica == ordem cronológica. Horizonte ausente ⇒ nenhuma checagem
   * (não há contra o que comparar) e o backend continua sendo a autoridade.
   */
  const horizonError =
    horizonStart &&
    horizonEnd &&
    ((values.dataInicial !== "" && values.dataInicial < horizonStart) ||
      (values.dataFinal !== "" && values.dataFinal > horizonEnd))
      ? `A vigência do item deve estar dentro do horizonte de análise da proposta (${formatDate(horizonStart)} a ${formatDate(horizonEnd)}) (RN-F9-03).`
      : null;

  // Edit mode now requires the same fields as create: all structural fields
  // are editable and must be filled before saving.
  const canSubmit =
    values.financialItemTypeId !== "" &&
    validValor &&
    values.periodicidade !== "" &&
    values.dataInicial !== "" &&
    values.dataFinal !== "" &&
    dateOrderError === null &&
    horizonError === null &&
    (!isGnvCtf || values.volumeGnvCtf !== "");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fin-modal-title"
      data-testid="financial-item-modal"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/40 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Prototype `.pm`: 660px, 30px/32px padding, no header/footer rules. */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="relative m-auto max-h-[92vh] w-full max-w-[660px] overflow-auto rounded-[var(--radius-md)] bg-white px-8 py-[30px] shadow-[0_8px_30px_rgba(0,0,0,0.2)]"
      >
        {/* Prototype `.pm-x`: 32px circle pinned to the corner. */}
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute top-3 right-3.5 flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none text-(--color-text-muted) hover:bg-(--neutral-40) hover:text-(--neutral-900)"
        >
          &times;
        </button>

        {/* Prototype `.pm h4`: the ONLY gap down to the first row is this 2px —
            `.pm .fgrid` carries no margin-top. */}
        <h4
          id="fin-modal-title"
          className="mb-0.5 text-(length:--t-h4) font-bold"
        >
          {/* Prototype `openFinModal` (`ciclo1.js:351`) — "Editar receita/despesa". */}
          {locked
            ? "Receita/despesa parametrizada"
            : isEdit
              ? "Editar receita/despesa"
              : "Adicionar receita/despesa"}
        </h4>

        {/*
         * Why the fields are inert. Muted, never `--color-danger`: nothing
         * failed — this is how a parameterised item is supposed to behave
         * (VBR-584). It also names the way out, so the modal is not a dead end.
         */}
        {locked && (
          <p
            data-testid="locked-item-note"
            className="mt-2 mb-[18px] text-(length:--t-caption) text-(--color-text-muted)"
          >
            Item obrigatório parametrizado pela Vibra: os valores vêm da tabela
            de Parâmetros da Oportunidade (por região) e não podem ser alterados
            aqui. Para lançar um valor próprio, adicione uma receita/despesa.
          </p>
        )}

        {/* Críticas — blocking (HU-20.2) */}
        {criticas.length > 0 && (
          <div
            role="alert"
            data-testid="critica-alert"
            /* Not in the prototype (HU-20.2): keeps the row rhythm (18px). */
            className="mt-3 mb-[18px] rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
          >
            <ul className="list-inside list-disc">
              {criticas.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {/*
         * Every field of the modal lives inside this fieldset, so `locked`
         * makes the whole set inert BY CONSTRUCTION rather than one
         * `disabled` prop at a time (ADO 67586 / VBR-596). The per-field
         * `disabled={locked}` below stays as the second belt — `Select` is not
         * a native control, so it has to carry the state itself — but a field
         * added here later is already locked on a mandatory item without
         * anyone having to remember the flag.
         *
         * The "×", the title, the notices and the footer are OUTSIDE on
         * purpose: `fieldset[disabled]` disables descendant buttons too, and
         * "Fechar" has to stay pressable.
         *
         * `min-w-0` because a fieldset defaults to `min-inline-size:
         * min-content`, which would let a wide row push it past the modal.
         *
         * The wrapped rows are deliberately NOT re-indented: a 200-line
         * whitespace diff would bury the one line that changes behaviour.
         */}
        <fieldset
          disabled={locked}
          data-testid="financial-item-fields"
          className="min-w-0"
        >
          {/* Record type · tipo financeiro — editable in EM_PREENCHIMENTO / DEVOLVIDA */}
          <div className={ROW_CLASS}>
            <div className="min-w-0">
              {/*
               * "Tipo", never "Tipo (record type)": `record type` is our internal
               * vocabulary for the classification, and screen text is never a
               * machine value (ADO 67584 / VBR-594).
               */}
              <FieldLabel htmlFor="fm-rt" size="caption">
                Tipo
              </FieldLabel>
              <Select
                id="fm-rt"
                value={values.recordType}
                onChange={(v) =>
                  handleRecordTypeChange(v as RecordTypeFinanceiro)
                }
                options={recordTypeOptions.map((rt) => ({
                  value: rt,
                  label: RECORD_TYPE_LABELS[rt],
                }))}
                disabled={locked}
              />
            </div>
            <div className="min-w-0">
              <FieldLabel htmlFor="fm-tipo" size="caption" required>
                Tipo financeiro
              </FieldLabel>
              <Select
                id="fm-tipo"
                value={values.financialItemTypeId}
                onChange={handleTypeChange}
                // CA-3: use the human-readable descricao for the label; fall back
                // to nome only when descricao is absent (legacy seed rows).
                options={selectableTypes.map((t) => ({
                  value: t.id,
                  label: t.descricao ?? t.nome,
                }))}
                disabled={locked}
              />
            </div>
          </div>

          <div className={SUBHEAD_CLASS}>Detalhes</div>

          <div className={ROW_CLASS}>
            <div className="min-w-0">
              <FieldLabel htmlFor="fm-cat" size="caption">
                Categoria
              </FieldLabel>
              <input
                id="fm-cat"
                type="text"
                // Derived from the record type (prototype `#fm-cat`) — never typed.
                value={categoria === "" ? "" : CATEGORIA_LABELS[categoria]}
                readOnly
                disabled
                className={FIELD_CLASS}
              />
            </div>
            <div className="min-w-0">
              <FieldLabel htmlFor="fm-valor" size="caption" required>
                Valor (R$)
              </FieldLabel>
              {/* Text input with pt-BR currency mask (CA-1): digits are entered
                as cents and formatted in real time (e.g. "180000" → "1.800,00").
                `parseMoneyInput` reverses the mask on submit. */}
              <input
                id="fm-valor"
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={values.valor}
                onChange={(e) => {
                  setTouchedFields((prev) => new Set([...prev, "valor"]));
                  setValues((v) => ({
                    ...v,
                    valor: maskMoneyInput(e.target.value),
                  }));
                }}
                // Parameterised amount — same treatment as `#fm-cat` above.
                // `valorLocked` also covers a catalogue-priced type, where the
                // rest of the modal stays editable (VBR-595).
                readOnly={valorLocked}
                disabled={valorLocked}
                className={FIELD_CLASS}
              />
              {/*
               * Shown only for the catalogue-priced case (VBR-595). A mandatory
               * item already has the whole fieldset inert and its own notice, and
               * repeating the explanation on one field there would read as if only
               * that field were locked.
               *
               * Says who maintains the number, because "não editável" alone leaves
               * the LT with nowhere to go — and says the volume is still theirs,
               * so they do not give up on the field they actually came to fix.
               */}
              {valorLocked && !locked && (
                <p
                  data-testid="valor-parametrizado-hint"
                  className="mt-1 text-(length:--t-caption) text-(--color-text-muted)"
                >
                  Valor parametrizado pela Vibra — mantido pelo BP Financeiro
                  {isGnvCtf ? ". O volume GNV continua editável." : "."}
                </p>
              )}
            </div>
          </div>

          <div className="mb-[18px]">
            <FieldLabel htmlFor="fm-desc" size="caption">
              Descrição
            </FieldLabel>
            <input
              id="fm-desc"
              type="text"
              placeholder="Descrição do item"
              value={values.descricao}
              onChange={(e) => {
                setTouchedFields((prev) => new Set([...prev, "descricao"]));
                setValues((v) => ({ ...v, descricao: e.target.value }));
              }}
              readOnly={locked}
              disabled={locked}
              className={FIELD_CLASS}
            />
          </div>

          <div className={ROW_CLASS}>
            <div className="min-w-0">
              <FieldLabel htmlFor="fm-idx" size="caption">
                Índice de correção
              </FieldLabel>
              {/*
              The hardcoded trio was 3 of the 18 values Salesforce actually
              has — and `IGPM` was not even one of them (`IGP-M` is). The
              catalog serves the full set with its own labels.
            */}
              <Select
                id="fm-idx"
                value={values.indiceCorrecao}
                onChange={(v) => {
                  setTouchedFields(
                    (prev) => new Set([...prev, "indiceCorrecao"]),
                  );
                  setValues((prev) => ({
                    ...prev,
                    indiceCorrecao: v as IndiceCorrecao,
                  }));
                }}
                placeholder="Nenhum"
                options={indiceCorrecaoOptions}
                disabled={locked}
              />
            </div>
            <div className="min-w-0">
              <FieldLabel htmlFor="fm-per" size="caption" required>
                Periodicidade
              </FieldLabel>
              <Select
                id="fm-per"
                value={values.periodicidade}
                onChange={(v) => {
                  setTouchedFields(
                    (prev) => new Set([...prev, "periodicidade"]),
                  );
                  setValues((prev) => ({
                    ...prev,
                    periodicidade: v as PeriodicidadeItem,
                  }));
                }}
                options={(
                  Object.keys(PERIODICIDADE_LABELS) as PeriodicidadeItem[]
                ).map((p) => ({
                  value: p,
                  label: PERIODICIDADE_LABELS[p],
                }))}
                disabled={locked}
              />
            </div>
          </div>

          <div className={ROW_CLASS}>
            <div className="min-w-0">
              <FieldLabel htmlFor="fm-di" size="caption" required>
                Data inicial
              </FieldLabel>
              <input
                id="fm-di"
                type="date"
                value={values.dataInicial}
                onChange={(e) =>
                  setValues((v) => ({ ...v, dataInicial: e.target.value }))
                }
                min={horizonStart}
                max={horizonEnd}
                readOnly={locked}
                disabled={locked}
                className={FIELD_CLASS}
              />
            </div>
            <div className="min-w-0">
              <FieldLabel htmlFor="fm-df" size="caption" required>
                Data final
              </FieldLabel>
              <input
                id="fm-df"
                type="date"
                value={values.dataFinal}
                onChange={(e) =>
                  setValues((v) => ({ ...v, dataFinal: e.target.value }))
                }
                min={horizonStart}
                max={horizonEnd}
                readOnly={locked}
                disabled={locked}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          {/* RN-F9-03: data final anterior à inicial */}
          {dateOrderError && (
            <div
              role="alert"
              data-testid="date-order-error"
              className="mb-[18px] rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
            >
              {dateOrderError}
            </div>
          )}

          {/* RN-F9-03: vigência fora do horizonte de análise da proposta.
            Bloco próprio, não uma mensagem só: as duas violações têm consertos
            diferentes (inverter as datas × trazê-las para dentro da janela) e
            podem coexistir. */}
          {horizonError && (
            <div
              role="alert"
              data-testid="date-horizon-error"
              className="mb-[18px] rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
            >
              {horizonError}
            </div>
          )}

          {/* Prototype `#fmGnvWrap`: own row, half width (RN-F9-04). */}
          {isGnvCtf && (
            <div className={ROW_CLASS} data-testid="gnv-field">
              <div className="min-w-0">
                <FieldLabel htmlFor="fm-gnv" size="caption" required>
                  Volume GNV/CTF (m³)
                </FieldLabel>
                <input
                  id="fm-gnv"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="criação por faixa de volume"
                  value={values.volumeGnvCtf}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, volumeGnvCtf: e.target.value }))
                  }
                  /*
                   * The backend still accepts `volumeGnvCtf` on a mandatory item
                   * (it is not a catalogue field), but the catalogue has no
                   * mandatory GNV type and `seedRequired` skips them — so there
                   * is no path that needs this editable while everything around
                   * it is locked.
                   */
                  readOnly={locked}
                  disabled={locked}
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          )}
        </fieldset>

        {/* Prototype `.pm-foot`. */}
        <div className="mt-6 flex justify-end gap-3">
          {/*
           * A parameterised item has no editable field, so there is no Salvar:
           * a CTA that can never change anything is dead control (VBR-584).
           */}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={locked ? BTN_PRIMARY_CLASS : BTN_GHOST_CLASS}
          >
            {locked ? "Fechar" : "Cancelar"}
          </button>
          {!locked && (
            <button
              type="submit"
              disabled={saving || !canSubmit}
              className={BTN_PRIMARY_CLASS}
            >
              {saving ? "Salvando…" : isEdit ? "Salvar" : "Adicionar"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FinancialItemsBlock({
  proposalId,
  listTypes = defaultListTypes,
  list = defaultList,
  createItem = defaultCreate,
  updateItem = defaultUpdate,
  deleteItem = defaultDelete,
  onItemsChanged,
}: Props) {
  /** Read-only profiles get no write controls (mirrors ReadOnlyProfileGuard). */
  const { can } = usePermissions();
  // PRD F3–F9 (Atores: LT/EV): mirrors the @Roles on the block's write routes.
  const canWriteRole = can(Permission.ProposalManage);
  // Analysis layer (03-proposta-analise): edits close for EVERY profile
  // while the proposal is under analysis — role alone is not enough.
  const { readOnly } = useProposalViewMode();
  const canWrite = canWriteRole && !readOnly;
  /** Confirmação das ações destrutivas desta tela. */
  const confirm = useConfirm();

  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [items, setItems] = useState<FinancialItem[]>([]);
  const [summary, setSummary] = useState<FinancialSummary>({
    totalReceitas: 0,
    totalDespesas: 0,
    saldo: 0,
  });
  const [types, setTypes] = useState<FinancialItemType[]>([]);
  /** RN-F9-03: horizonte de análise da proposta vindo do servidor. */
  const [horizonStart, setHorizonStart] = useState<string | undefined>(
    undefined,
  );
  const [horizonEnd, setHorizonEnd] = useState<string | undefined>(undefined);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [criticas, setCriticas] = useState<string[]>([]);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Incremented on each fetchItems call; lets in-flight .then callbacks
  // detect that a newer fetch has superseded them (e.g. proposalId changed
  // while the component stayed mounted).
  const fetchGenRef = useRef(0);

  // Initial load: list the proposal's existing receitas/despesas — mandatory
  // items are already seeded by the backend on creation (HU-21); also fetch
  // eligible types so the add-item modal can populate its dropdown (HU-20.1).
  //
  // CA-2: types and items are fetched independently so a types failure only
  // degrades the "add item" select (the modal's dropdown shows empty), while
  // items that are already created remain visible. One automatic retry is
  // applied to each fetch for transient 5xx / network errors (CA-3/CA-4).
  const fetchItems = useCallback(() => {
    setLoadStatus("loading");
    const gen = ++fetchGenRef.current;

    withOneRetry(() => list(proposalId))
      .then((snapshot) => {
        if (!mountedRef.current || fetchGenRef.current !== gen) return;
        setItems(snapshot.items);
        setSummary(snapshot.summary);
        setHorizonStart(snapshot.dataInicioAnalise);
        setHorizonEnd(snapshot.dataFimAnalise);
        setLoadStatus("loaded");
      })
      .catch((err: unknown) => {
        if (isExpiredSessionError(err)) {
          redirectToLogin();
          return;
        }
        if (!mountedRef.current || fetchGenRef.current !== gen) return;
        setLoadStatus("error");
      });

    // Types load independently: failure degrades the select, not the block.
    withOneRetry(() => listTypes(proposalId))
      .then((typeList) => {
        if (!mountedRef.current || fetchGenRef.current !== gen) return;
        setTypes(typeList);
      })
      .catch(() => {
        // Intentional: a types failure only means the "add item" select is
        // empty. The block stays visible with the already-loaded items.
      });
  }, [proposalId, list, listTypes]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openCreateModal = useCallback(() => {
    setCriticas([]);
    setModal({ mode: "create" });
  }, []);

  const openEditModal = useCallback((item: FinancialItem) => {
    setCriticas([]);
    setModal({ mode: "edit", item });
  }, []);

  const closeModal = useCallback(() => {
    if (saving) return;
    setModal(null);
    setCriticas([]);
  }, [saving]);

  const handleSubmit = useCallback(
    async (input: CreateFinancialItemInput | UpdateFinancialItemInput) => {
      if (!modal) return;
      setSaving(true);
      setCriticas([]);

      try {
        const result =
          modal.mode === "create"
            ? await createItem(proposalId, input as CreateFinancialItemInput)
            : await updateItem(
                proposalId,
                modal.item.id,
                input as UpdateFinancialItemInput,
              );

        if (!mountedRef.current) return;

        setItems((prev) => {
          if (modal.mode === "create") return [...prev, result.item];
          return prev.map((i) => (i.id === result.item.id ? result.item : i));
        });
        setSummary(result.summary);
        setModal(null);
        onItemsChanged?.();
      } catch (err) {
        if (!mountedRef.current) return;

        if (
          err instanceof FinancialItemCriticaError ||
          err instanceof GnvVolumeInvalidError
        ) {
          setCriticas([err.message]);
          return;
        }
        setCriticas(["Falha ao salvar o item. Tente novamente."]);
      } finally {
        if (mountedRef.current) setSaving(false);
      }
    },
    [modal, proposalId, createItem, updateItem, onItemsChanged],
  );

  const handleDelete = useCallback(
    async (item: FinancialItem) => {
      if (busyItemId) return;
      setBusyItemId(item.id);

      try {
        await deleteItem(proposalId, item.id);
        if (!mountedRef.current) return;

        setItems((prev) => {
          const next = prev.filter((i) => i.id !== item.id);
          setSummary(recomputeSummary(next));
          return next;
        });
        onItemsChanged?.();
      } catch (err) {
        if (!mountedRef.current) return;

        if (err instanceof RequiredItemConflictError) {
          setToast(err.message);
        } else {
          setToast("Falha ao remover o item. Tente novamente.");
        }
      } finally {
        if (mountedRef.current) setBusyItemId(null);
      }
    },
    [busyItemId, deleteItem, proposalId, onItemsChanged],
  );

  const isEmpty = useMemo(() => items.length === 0, [items]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Prototype: every `.block` card collapses from its own header (ciclo1.js
  // `initCollapse`), starting expanded.
  const collapse = useCardCollapse();
  return (
    <section
      aria-labelledby="financial-items-title"
      {...collapse.sectionProps}
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      {confirm.dialog}
      <div {...collapse.headProps} className="mb-3 flex items-center gap-2.5">
        <h3
          id="financial-items-title"
          className="text-(length:--t-h4) font-bold"
        >
          Receitas e Despesas da Oportunidade
        </h3>
        <BlocoAjusteAction bloco={BlocoProposta.Financeiro} />
        <CardCollapseToggle {...collapse.toggleProps} />
      </div>

      {loadStatus === "loading" && (
        <div
          role="status"
          aria-label="Carregando receitas e despesas…"
          className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="loading-state"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
          />
          Carregando…
        </div>
      )}

      {loadStatus === "error" && (
        <div
          role="alert"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
          data-testid="load-error-state"
        >
          Falha ao carregar as receitas e despesas. Verifique sua conexão e
          tente novamente.
          <button
            type="button"
            onClick={fetchItems}
            className="ml-2 cursor-pointer font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {loadStatus === "loaded" && (
        <div data-testid="filled-state">
          {isEmpty ? (
            /* Read-only profile: the empty state keeps its message, loses the CTA. */
            <EmptyState onAdd={canWrite ? openCreateModal : null} />
          ) : (
            <>
              <div>
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    busy={busyItemId === item.id}
                    showActions={canWrite}
                    onEdit={() => openEditModal(item)}
                    onDelete={() =>
                      confirm.ask({
                        title: "Excluir receita/despesa?",
                        description: `"${item.descricao ?? item.tipoNome ?? "Item"}" sai do resultado financeiro da proposta.`,
                        confirmLabel: "Excluir",
                        tone: "danger",
                        onConfirm: () => handleDelete(item),
                      })
                    }
                  />
                ))}
              </div>
              {/* Write control: hidden for a read-only profile (the API answers 403). */}
              {canWrite && <AddButton onClick={openCreateModal} />}

              <div
                data-testid="totals"
                className="mt-4 flex flex-wrap gap-6 text-(length:--t-caption)"
              >
                <div>
                  <span className="text-(--color-text-muted)">
                    Total receitas:{" "}
                  </span>
                  <strong data-testid="total-receitas">
                    {formatCurrency(summary.totalReceitas)}
                  </strong>
                </div>
                <div>
                  <span className="text-(--color-text-muted)">
                    Total despesas:{" "}
                  </span>
                  <strong data-testid="total-despesas">
                    {formatCurrency(summary.totalDespesas)}
                  </strong>
                </div>
                <div>
                  <span className="text-(--color-text-muted)">Saldo: </span>
                  <strong data-testid="total-saldo">
                    {formatCurrency(summary.saldo)}
                  </strong>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {modal && (
        <FinancialItemModal
          modal={modal}
          types={types}
          saving={saving}
          criticas={criticas}
          horizonStart={horizonStart}
          horizonEnd={horizonEnd}
          onClose={closeModal}
          onSubmit={(input) => void handleSubmit(input)}
        />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </section>
  );
}
