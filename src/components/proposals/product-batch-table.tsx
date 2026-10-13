"use client";

/**
 * Batch entry of the proposal's product lines (US 69180).
 *
 * One editable table replaces "add a product at a time": the backend pre-fills
 * every eligible product (dates, volume, margem realizada, incoterm, payment
 * term) and the user keeps, edits or removes rows, then saves them all at once.
 *
 * - The screen only renders and edits. Suggestions, the sales horizon and every
 *   verdict on what is missing come from the backend (`product-batch.types.ts`).
 * - Autosave: every edit is saved as a draft after a short pause, and once more
 *   when the user leaves the screen. "Limpar campos" drops the draft.
 * - "Salvar" sends only the selected rows, all or nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useConfirm } from "@/components/confirm-dialog";
import {
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from "@/components/button";
import { CloseIcon, CopyDownIcon } from "@/components/icons";
import { PicklistSelect } from "@/components/picklists/picklist-select";
import { usePermissions } from "@/hooks/use-permissions";
import { Permission } from "@/lib/auth-permissions";
import { isExpiredSessionError } from "@/lib/api-errors";
import { redirectToLogin } from "@/lib/auth";
import { PicklistField } from "@/lib/picklists/picklists.types";
import {
  addProductToBatch as defaultAdd,
  clearProductBatch as defaultClear,
  getProductBatch as defaultGet,
  saveProductBatchDraft as defaultSaveDraft,
  submitProductBatch as defaultSubmit,
} from "@/lib/proposals/product-batch.data";
import type {
  ProductBatchDraft,
  ProductBatchRow,
  ProductBatchRowError,
} from "@/lib/proposals/product-batch.types";
import { ProductBatchValidationError } from "@/lib/proposals/product-batch.types";
import { listEligibleProducts as defaultListEligible } from "@/lib/proposals/product-lines.data";
import { deriveDaysFromSapCode } from "@/lib/proposals/sap-payment-term-days";
import type {
  EligibleProduct,
  EligibleProductListing,
  ProductLine,
} from "@/lib/proposals/types";

const AUTOSAVE_DELAY_MS = 800;

/** Bottom-border cell input — the same look as `DS_INPUT` of the product block, tighter for a table. */
const CELL_INPUT =
  "w-full bg-(--neutral-40) border-0 border-b-2 border-(--neutral-600) rounded-none h-[45px] px-3 py-[11px] leading-[1.5] tracking-[.2px] text-(length:--t-caption) text-(--neutral-800) placeholder:text-(--neutral-500) focus:outline-none focus:border-(--secondary-500) disabled:cursor-not-allowed disabled:bg-(--disabled-bg) disabled:border-(--neutral-200) disabled:text-(--disabled-text)";
const CELL_INPUT_INVALID = "border-(--color-danger)";
const TH =
  "px-2 py-2 text-left text-(length:--t-small) font-bold uppercase tracking-[0.3px] text-(--color-text-muted)";
const ICON_BTN =
  "inline-flex size-8 items-center justify-center rounded-[var(--radius-xxs)] text-(--color-text-muted) transition hover:bg-(--neutral-40) hover:text-(--neutral-800) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--secondary-700) disabled:cursor-not-allowed disabled:opacity-40";

type LoadStatus = "loading" | "loaded" | "error";
type AutosaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  proposalId: string;
  /** Products already saved in the proposal — they never show up in the table. */
  savedLines: ProductLine[];
  /** Bounds of the consumption dates (the proposal's analysis window). */
  minConsumo?: string | null;
  maxConsumo?: string | null;
  /** Called after the selected rows became product lines. */
  onSaved: (lines: ProductLine[]) => void;
  /** Injectable for tests; default to the BFF client. */
  get?: (proposalId: string) => Promise<ProductBatchDraft>;
  saveDraft?: typeof defaultSaveDraft;
  clear?: (proposalId: string) => Promise<ProductBatchDraft>;
  add?: (proposalId: string, produtoCodigo: string) => Promise<ProductBatchRow>;
  submit?: (
    proposalId: string,
    linhas: ProductBatchRow[],
  ) => Promise<ProductLine[]>;
  listEligible?: (
    proposalId: string,
    q?: string,
  ) => Promise<EligibleProductListing>;
};

/** "1.234,56" → 1234.56 · "" → null. Anything else that is not a number → null. */
function parseNumber(text: string): number | null {
  const clean = text.replace(/\./g, "").replace(",", ".").trim();
  if (clean === "") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value: number | null, maxFraction = 4): string {
  if (value === null) return "";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: maxFraction });
}

function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

/**
 * A number field that keeps what the user is typing ("12," must not collapse to
 * "12" mid-keystroke) and reports the parsed value on every change.
 */
function NumberCell({
  id,
  value,
  onChange,
  disabled,
  invalid,
  label,
  placeholder,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
  invalid: boolean;
  label: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(formatNumber(value));
  const focused = useRef(false);

  // Follows the row when it changes from outside (clear, autosave response).
  useEffect(() => {
    if (!focused.current) setText(formatNumber(value));
  }, [value]);

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={text}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setText(formatNumber(value));
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNumber(e.target.value));
      }}
      className={`${CELL_INPUT} ${invalid ? CELL_INPUT_INVALID : ""}`}
    />
  );
}

export function ProductBatchTable({
  proposalId,
  savedLines,
  minConsumo = null,
  maxConsumo = null,
  onSaved,
  get = defaultGet,
  saveDraft = defaultSaveDraft,
  clear = defaultClear,
  add = defaultAdd,
  submit = defaultSubmit,
  listEligible = defaultListEligible,
}: Props) {
  const { can } = usePermissions();
  const canWrite = can(Permission.ProposalManage);
  const confirm = useConfirm();

  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [rows, setRows] = useState<ProductBatchRow[]>([]);
  const [restrita, setRestrita] = useState(true);
  const [autosave, setAutosave] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [rowErrors, setRowErrors] = useState<ProductBatchRowError[]>([]);

  // Refs let the debounce and the unmount flush see the latest rows.
  const rowsRef = useRef<ProductBatchRow[]>([]);
  rowsRef.current = rows;
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const genRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(() => {
    setLoadStatus("loading");
    const gen = ++genRef.current;
    get(proposalId)
      .then((draft) => {
        if (!mountedRef.current || genRef.current !== gen) return;
        setRows(draft.linhas);
        setRestrita(draft.restritaAoCliente);
        setSavedAt(draft.atualizadoEm);
        dirtyRef.current = false;
        setLoadStatus("loaded");
      })
      .catch((err: unknown) => {
        if (isExpiredSessionError(err)) {
          redirectToLogin();
          return;
        }
        if (!mountedRef.current || genRef.current !== gen) return;
        setLoadStatus("error");
      });
  }, [get, proposalId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Saves the draft now. The response only brings back the derived horizon. */
  const flush = useCallback(
    async (keepalive = false) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      if (mountedRef.current) setAutosave("saving");
      try {
        const draft = await saveDraft(proposalId, rowsRef.current, {
          keepalive,
        });
        if (!mountedRef.current) return;
        setSavedAt(draft.atualizadoEm);
        setAutosave("saved");
        // Only the derived horizon comes back from the backend; the rest of
        // each row stays as typed (the user may have kept editing meanwhile).
        const hv = new Map(draft.linhas.map((l) => [l.produtoCodigo, l.hvMeses]));
        setRows((prev) =>
          prev.map((l) => ({ ...l, hvMeses: hv.get(l.produtoCodigo) ?? l.hvMeses })),
        );
      } catch {
        dirtyRef.current = true;
        if (mountedRef.current) setAutosave("error");
      }
    },
    [proposalId, saveDraft],
  );

  /** Every edit goes through here: it updates the rows and schedules the autosave. */
  const edit = useCallback(
    (update: (prev: ProductBatchRow[]) => ProductBatchRow[]) => {
      setRows((prev) => update(prev));
      setRowErrors([]);
      setSubmitError("");
      dirtyRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  // Leaving the screen records what was filled in so far.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        void saveDraft(proposalId, rowsRef.current, { keepalive: true }).catch(
          () => undefined,
        );
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [proposalId, saveDraft]);

  function patchRow(codigo: string, patch: Partial<ProductBatchRow>) {
    edit((prev) =>
      prev.map((l) => (l.produtoCodigo === codigo ? { ...l, ...patch } : l)),
    );
  }

  /** Copies the parameters that repeat across products from the row above. */
  function copyFromAbove(index: number) {
    edit((prev) =>
      prev.map((l, i) => {
        if (i !== index || index === 0) return l;
        const above = prev[index - 1];
        return {
          ...l,
          inicioConsumo: above.inicioConsumo,
          fimConsumo: above.fimConsumo,
          incoterm: above.incoterm,
          prazoPagamento: above.prazoPagamento,
        };
      }),
    );
  }

  function removeRow(codigo: string) {
    edit((prev) => prev.filter((l) => l.produtoCodigo !== codigo));
  }

  function toggleAll(selecionado: boolean) {
    edit((prev) => prev.map((l) => ({ ...l, selecionado })));
  }

  async function handleSubmit() {
    if (saving) return;
    setSaving(true);
    setSubmitError("");
    setRowErrors([]);
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      const created = await submit(proposalId, rowsRef.current);
      if (!mountedRef.current) return;
      const codigos = new Set(created.map((l) => l.produtoCodigo));
      setRows((prev) => prev.filter((l) => !codigos.has(l.produtoCodigo)));
      dirtyRef.current = false;
      setAutosave("idle");
      onSaved(created);
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ProductBatchValidationError) {
        setRowErrors(err.erros);
        setSubmitError(err.message);
      } else {
        setSubmitError(
          err instanceof Error
            ? err.message
            : "Falha ao salvar os produtos. Tente novamente.",
        );
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  async function handleClear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    dirtyRef.current = false;
    const draft = await clear(proposalId);
    if (!mountedRef.current) return;
    setRows(draft.linhas);
    setRestrita(draft.restritaAoCliente);
    setSavedAt(draft.atualizadoEm);
    setRowErrors([]);
    setSubmitError("");
    setAutosave("idle");
  }

  const hasError = (codigo: string, field: string) =>
    rowErrors.some((e) => e.produtoCodigo === codigo && e.field === field);

  const selected = rows.filter((l) => l.selecionado);
  const totalVolume = selected.reduce((sum, l) => sum + (l.volume ?? 0), 0);
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const taken = new Set([
    ...savedLines.map((l) => l.produtoCodigo),
    ...rows.map((l) => l.produtoCodigo),
  ]);

  if (loadStatus === "loading") {
    return (
      <div
        role="status"
        aria-label="Carregando produtos elegíveis…"
        className="flex items-center gap-2 py-4 text-(length:--t-caption) text-(--color-text-muted)"
        data-testid="product-batch-loading"
      >
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
        />
        Carregando produtos elegíveis…
      </div>
    );
  }

  if (loadStatus === "error") {
    return (
      <div
        role="alert"
        className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
        data-testid="product-batch-error"
      >
        Falha ao carregar os produtos elegíveis. Verifique sua conexão e tente
        novamente.
        <button
          type="button"
          onClick={load}
          className="ml-2 cursor-pointer font-bold underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div data-testid="product-batch">
      {confirm.dialog}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-(length:--t-body) font-bold">Incluir produtos</h4>
        <span
          role="status"
          className="text-(length:--t-small) text-(--color-text-muted)"
          data-testid="product-batch-autosave"
        >
          {autosave === "saving" && "Salvando rascunho…"}
          {autosave === "saved" && savedAt && (
            <>
              Rascunho salvo às{" "}
              {new Date(savedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </>
          )}
          {autosave === "error" &&
            "Não foi possível salvar o rascunho. Tentaremos de novo na próxima alteração."}
        </span>
      </div>

      {rows.length === 0 ? (
        <div
          className="mb-3 rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="product-batch-empty"
        >
          {restrita
            ? "Nenhum produto pendente de inclusão."
            : "Este cliente não tem produtos cadastrados em “Produtos Elegíveis”. Use “+ Adicionar produto” para buscar e incluir."}
        </div>
      ) : (
        <div className="overflow-x-auto" data-testid="product-batch-table">
          <table className="w-full min-w-[1280px] text-(length:--t-caption)">
            <thead>
              <tr className="border-b border-(--color-border)">
                <th className={`${TH} w-10`}>
                  <input
                    type="checkbox"
                    aria-label="Marcar todos os produtos"
                    checked={allSelected}
                    disabled={!canWrite}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th className={TH}>Produto · cód.</th>
                <th className={TH}>Início consumo</th>
                <th className={TH}>Fim consumo</th>
                <th className={TH}>HV (meses)</th>
                <th className={TH}>Qtd. mesa (m³/mês)</th>
                <th className={TH}>Volume (m³/mês)</th>
                <th className={TH}>Margem realizada</th>
                <th className={TH}>Margem proposta</th>
                <th className={TH}>Incoterm</th>
                <th className={TH}>Prazo de pagamento</th>
                <th className={TH}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const codigo = row.produtoCodigo;
                const rowId = `pb-${codigo}`;
                const dim = !row.selecionado ? "opacity-60" : "";
                return (
                  <tr
                    key={codigo}
                    data-testid="product-batch-row"
                    className="border-b border-(--color-border) align-middle"
                  >
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Manter ${row.produtoNome} na proposta`}
                        checked={row.selecionado}
                        disabled={!canWrite}
                        onChange={(e) =>
                          patchRow(codigo, { selecionado: e.target.checked })
                        }
                      />
                    </td>
                    <td className={`min-w-[190px] px-2 py-3 ${dim}`}>
                      <div className="font-bold">{row.produtoNome}</div>
                      <div className="text-(length:--t-small) text-(--color-text-muted)">
                        {codigo}
                        {row.base ? ` · ${row.base}` : ""}
                      </div>
                    </td>
                    <td className={`px-2 py-2 ${dim}`}>
                      <input
                        id={`${rowId}-inicio`}
                        type="date"
                        aria-label={`Início do consumo de ${row.produtoNome}`}
                        aria-invalid={hasError(codigo, "inicioConsumo") || undefined}
                        value={row.inicioConsumo.slice(0, 10)}
                        min={minConsumo ?? undefined}
                        max={maxConsumo ?? undefined}
                        disabled={!canWrite}
                        onChange={(e) =>
                          patchRow(codigo, { inicioConsumo: e.target.value })
                        }
                        className={`${CELL_INPUT} ${hasError(codigo, "inicioConsumo") ? CELL_INPUT_INVALID : ""}`}
                      />
                    </td>
                    <td className={`px-2 py-2 ${dim}`}>
                      <input
                        id={`${rowId}-fim`}
                        type="date"
                        aria-label={`Fim do consumo de ${row.produtoNome}`}
                        aria-invalid={hasError(codigo, "fimConsumo") || undefined}
                        value={row.fimConsumo.slice(0, 10)}
                        min={minConsumo ?? undefined}
                        max={maxConsumo ?? undefined}
                        disabled={!canWrite}
                        onChange={(e) =>
                          patchRow(codigo, { fimConsumo: e.target.value })
                        }
                        className={`${CELL_INPUT} ${hasError(codigo, "fimConsumo") ? CELL_INPUT_INVALID : ""}`}
                      />
                    </td>
                    <td className={`px-2 py-3 ${dim}`}>
                      {row.hvMeses === null ? "—" : row.hvMeses}
                    </td>
                    <td className={`px-2 py-3 ${dim}`}>
                      {row.quantidadeMesa === null
                        ? "—"
                        : formatNumber(row.quantidadeMesa)}
                    </td>
                    <td className={`px-2 py-2 ${dim}`}>
                      <NumberCell
                        id={`${rowId}-volume`}
                        label={`Volume de ${row.produtoNome}`}
                        value={row.volume}
                        disabled={!canWrite}
                        invalid={hasError(codigo, "volume")}
                        onChange={(volume) => patchRow(codigo, { volume })}
                      />
                    </td>
                    <td className={`px-2 py-3 ${dim}`}>
                      {formatMoney(row.margemRealizada)}
                    </td>
                    <td className={`px-2 py-2 ${dim}`}>
                      <NumberCell
                        id={`${rowId}-margem`}
                        label={`Margem proposta de ${row.produtoNome}`}
                        value={row.margemProposta}
                        disabled={!canWrite}
                        invalid={false}
                        placeholder={
                          row.margemRealizada === null
                            ? undefined
                            : formatNumber(row.margemRealizada)
                        }
                        onChange={(margemProposta) =>
                          patchRow(codigo, { margemProposta })
                        }
                      />
                    </td>
                    <td className={`w-[170px] min-w-[170px] max-w-[170px] px-2 py-2 ${dim}`}>
                      <PicklistSelect
                        id={`${rowId}-incoterm`}
                        field={PicklistField.ProductLineIncoterm}
                        value={row.incoterm}
                        disabled={!canWrite}
                        placeholder="Selecione…"
                        onChange={(incoterm) => patchRow(codigo, { incoterm })}
                      />
                    </td>
                    <td className={`w-[210px] min-w-[210px] max-w-[210px] px-2 py-2 ${dim}`}>
                      <PicklistSelect
                        id={`${rowId}-prazo`}
                        field={PicklistField.ProductLinePrazoPagamento}
                        value={row.prazoPagamento}
                        disabled={!canWrite}
                        placeholder="Selecione…"
                        filter={(code) => deriveDaysFromSapCode(code) !== null}
                        onChange={(prazoPagamento) =>
                          patchRow(codigo, { prazoPagamento })
                        }
                      />
                    </td>
                    <td className="px-2 py-2">
                      {canWrite && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className={ICON_BTN}
                            disabled={index === 0}
                            title="Copiar datas, incoterm e prazo da linha de cima"
                            aria-label={`Copiar da linha de cima para ${row.produtoNome}`}
                            onClick={() => copyFromAbove(index)}
                          >
                            <CopyDownIcon className="size-4" />
                          </button>
                          <button
                            type="button"
                            className={ICON_BTN}
                            title="Excluir da lista"
                            aria-label={`Excluir ${row.produtoNome} da lista`}
                            onClick={() => removeRow(codigo)}
                          >
                            <CloseIcon className="size-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr data-testid="product-batch-total" className="bg-(--neutral-40)">
                <td />
                <td className="px-2 py-3 font-bold" colSpan={5}>
                  Total de volume ({selected.length}{" "}
                  {selected.length === 1 ? "produto marcado" : "produtos marcados"})
                </td>
                <td className="whitespace-nowrap px-2 py-3 font-bold" colSpan={2}>
                  {formatNumber(totalVolume)} m³/mês
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {submitError && (
        <div
          role="alert"
          className="mt-3 rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
          data-testid="product-batch-submit-error"
        >
          <p className="font-bold">{submitError}</p>
          {rowErrors.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {rowErrors.map((e) => (
                <li key={`${e.produtoCodigo}-${e.field}`}>{e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canWrite && (
        <ProductAdder
          proposalId={proposalId}
          taken={taken}
          listEligible={listEligible}
          onPick={async (product) => {
            const row = await add(proposalId, product.codigo);
            edit((prev) => [...prev, row]);
          }}
        />
      )}

      {canWrite && (
        <div className="mt-4 flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            className={SECONDARY_OUTLINE_BTN}
            disabled={saving}
            onClick={() =>
              confirm.ask({
                title: "Limpar campos?",
                description:
                  "Tudo o que foi preenchido nesta lista é apagado e os produtos voltam às sugestões do sistema.",
                confirmLabel: "Limpar campos",
                tone: "danger",
                onConfirm: handleClear,
              })
            }
          >
            Limpar campos
          </button>
          <button
            type="button"
            className={PRIMARY_ACTION_BTN}
            disabled={saving || selected.length === 0}
            onClick={() => void handleSubmit()}
            data-testid="product-batch-save"
          >
            {saving
              ? "Salvando…"
              : `Salvar ${selected.length === 1 ? "1 produto" : `${selected.length} produtos`}`}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "+ Adicionar produto": a search over the eligible products that are not yet in
 * the table or in the proposal. Used when the customer has no registered list
 * (the table starts empty) or to bring back a product that was excluded.
 */
function ProductAdder({
  proposalId,
  taken,
  listEligible,
  onPick,
}: {
  proposalId: string;
  taken: Set<string>;
  listEligible: (
    proposalId: string,
    q?: string,
  ) => Promise<EligibleProductListing>;
  onPick: (product: EligibleProduct) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<EligibleProduct[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      listEligible(proposalId, q)
        .then((listing) => {
          if (cancelled) return;
          setMessage("");
          setResults(listing.produtos.filter((p) => !taken.has(p.codigo)));
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setMessage("Não foi possível buscar os produtos. Tente novamente.");
          }
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, q, proposalId, listEligible, taken]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${SECONDARY_OUTLINE_BTN} mt-3`}
      >
        + Adicionar produto
      </button>
    );
  }

  return (
    <div
      className="mt-3 rounded-[var(--radius-xs)] border border-(--color-border) p-3"
      data-testid="product-batch-adder"
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          autoFocus
          aria-label="Buscar produto elegível"
          placeholder="Buscar por nome ou código"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className={CELL_INPUT}
        />
        <button
          type="button"
          className={ICON_BTN}
          aria-label="Fechar a busca de produtos"
          onClick={() => setOpen(false)}
        >
          <CloseIcon className="size-4" />
        </button>
      </div>
      {message && (
        <p className="mt-2 text-(length:--t-caption) text-(--red-700)">{message}</p>
      )}
      {!message && results.length === 0 && (
        <p className="mt-2 text-(length:--t-caption) text-(--color-text-muted)">
          Nenhum produto elegível encontrado.
        </p>
      )}
      <ul className="mt-2 max-h-56 list-none space-y-1 overflow-y-auto p-0">
        {results.slice(0, 20).map((p) => (
          <li key={p.codigo}>
            <button
              type="button"
              className="w-full rounded-[var(--radius-xxs)] px-2 py-2 text-left text-(length:--t-caption) hover:bg-(--neutral-40)"
              onClick={() => {
                void onPick(p)
                  .then(() => setOpen(false))
                  .catch((err: unknown) =>
                    setMessage(
                      err instanceof Error
                        ? err.message
                        : "Não foi possível adicionar o produto.",
                    ),
                  );
              }}
            >
              <span className="font-bold">{p.nome}</span> · {p.codigo}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
