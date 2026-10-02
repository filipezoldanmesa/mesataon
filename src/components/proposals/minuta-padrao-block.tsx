"use client";

import { useState } from "react";

import { WriteOnly } from "@/components/auth/write-only";
import { usePermissions } from "@/hooks/use-permissions";
import { updateProposal } from "@/lib/proposals/proposal.api";
import type {
  ProposalStatus,
  UpdateMinutaPadraoPayload,
} from "@/lib/proposals/proposal.types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MinutaPadraoBlockProps {
  proposalId: string;
  /** Initial value from the backend (default true = standard minuta). */
  minutaPadrao?: boolean;
  /** Netlex consultation code already on record, if any. */
  netlexConsultaCodigo?: string | null;
  /** Current proposal status — drives the edit window guard. */
  status?: ProposalStatus;
  /** Called after a successful PATCH (parent can refresh proposal state). */
  onUpdated?: (
    minutaPadrao: boolean,
    netlexConsultaCodigo: string | null,
    consultaJuridicaPendente: boolean,
  ) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Label typography class (matches DS spec: 14px uppercase letter-spacing). */
const LABEL_CLS =
  "block text-[14px] font-bold uppercase tracking-[0.3px] text-(--color-text-muted) mb-1";

/** Input style class (DS spec: --t-caption, border-strong, radius-xs, 9px 11px). */
const INPUT_CLS =
  "w-full rounded-[var(--radius-xs)] border border-(--color-border-strong) " +
  "px-[11px] py-[9px] text-(length:--t-caption) bg-white";

/** Statuses in which the minuta-padrão fields may be edited (CTR-F1 window guard). */
const EDITABLE_STATUSES: readonly ProposalStatus[] = [
  "EM_PREENCHIMENTO",
  "DEVOLVIDA",
];

function isEditable(status: ProposalStatus | undefined): boolean {
  if (!status) return true; // unknown status — assume editable for UX
  return EDITABLE_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * CTR-F1 (HU-02 / RN-F1-03 / RN-F1-05): "Não seguirá a minuta padrão" block.
 *
 * Renders:
 *  - A checkbox "Esta proposta não seguirá a minuta padrão" (HU-02).
 *  - When checked: a text field "Código da consulta ao jurídico (Netlex)"
 *    with the hint "A consulta corre em paralelo e não bloqueia o fluxo."
 *    (anchored to RN-F1-03).
 *
 * Permission guard:
 *  - The whole write form is wrapped in `<WriteOnly>` (hidden for read-only
 *    profiles — Visualizador, Expansão).
 *  - The submit handler also checks `canWrite` so a form submitted via Enter
 *    without the button being visible still gets refused.
 *
 * Edit window: the block shows a read-only notice when the proposal is in a
 * state outside EM_PREENCHIMENTO/DEVOLVIDA.
 */
export function MinutaPadraoBlock({
  proposalId,
  minutaPadrao: initialMinutaPadrao = true,
  netlexConsultaCodigo: initialCodigo = null,
  status,
  onUpdated,
}: MinutaPadraoBlockProps) {
  const { canWrite } = usePermissions();

  const [checked, setChecked] = useState(!initialMinutaPadrao);
  const [codigo, setCodigo] = useState(initialCodigo ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState(false);
  const [saved, setSaved] = useState(false);

  const editWindowOpen = isEditable(status);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Permission guard — also checked here because form fires on Enter even
    // with the submit button hidden (WriteOnly wraps the button only).
    if (!canWrite) return;
    if (!editWindowOpen) return;

    setError(null);
    setSaved(false);
    setPendingNotice(false);
    setLoading(true);

    const payload: UpdateMinutaPadraoPayload = {
      minutaPadrao: !checked,
      ...(checked && codigo.trim()
        ? { netlexConsultaCodigo: codigo.trim() }
        : {}),
    };

    try {
      const result = await updateProposal(proposalId, payload);
      setPendingNotice(result.consultaJuridicaPendente);
      setSaved(true);
      onUpdated?.(
        result.minutaPadrao,
        result.netlexConsultaCodigo,
        result.consultaJuridicaPendente,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao atualizar a proposta.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      data-testid="minuta-padrao-block"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
    >
      <h2 className="text-(length:--t-h4) font-bold mb-3.5">
        Minuta do contrato
      </h2>

      {/* Read-only notice when outside the edit window */}
      {!editWindowOpen && (
        <p
          data-testid="edit-window-closed"
          className="text-(length:--t-caption) text-(--color-text-muted) mb-3"
        >
          A marcação de minuta padrão não pode ser alterada após o envio para
          aprovação.
        </p>
      )}

      {/* Read-only display when outside the edit window. Reads the PERSISTED
          value (props), never the local draft state: if `status` closes the
          edit window mid-edit, the display must show what is actually saved. */}
      {!editWindowOpen && (
        <div
          data-testid="readonly-display"
          className="text-(length:--t-caption)"
        >
          <span className="font-bold">
            {initialMinutaPadrao
              ? "Seguirá a minuta padrão"
              : "Não seguirá a minuta padrão"}
          </span>
          {!initialMinutaPadrao && initialCodigo && (
            <span className="ml-2 text-(--color-text-muted)">
              · Código Netlex:{" "}
              <span className="font-medium">{initialCodigo}</span>
            </span>
          )}
        </div>
      )}

      {/* Edit form — only within the edit window */}
      {editWindowOpen && (
        <form
          onSubmit={handleSubmit}
          data-testid="minuta-padrao-form"
          noValidate
        >
          {/* Checkbox row */}
          <WriteOnly>
            <label
              className="flex items-center gap-2.5 cursor-pointer"
              data-testid="checkbox-label"
            >
              <input
                type="checkbox"
                data-testid="checkbox-nao-padrao"
                checked={checked}
                onChange={(e) => {
                  setChecked(e.target.checked);
                  if (!e.target.checked) setCodigo("");
                  setError(null);
                  setSaved(false);
                }}
                className="h-4 w-4 rounded border-(--color-border-strong) accent-(--secondary-600)"
              />
              <span className="text-(length:--t-caption) font-medium">
                Esta proposta não seguirá a minuta padrão
              </span>
            </label>
          </WriteOnly>

          {/* Read-only state for profiles without write permission */}
          {!canWrite && (
            <div
              data-testid="readonly-checkbox-state"
              className="text-(length:--t-caption)"
            >
              {checked
                ? "Não seguirá a minuta padrão"
                : "Seguirá a minuta padrão"}
            </div>
          )}

          {/* Conditional: Netlex code field — shown only when "não padrão" is checked */}
          {checked && (
            <div data-testid="netlex-code-field" className="mt-4">
              <label htmlFor="netlex-consulta-codigo" className={LABEL_CLS}>
                Código da consulta ao jurídico (Netlex)
              </label>
              <WriteOnly>
                <input
                  id="netlex-consulta-codigo"
                  type="text"
                  data-testid="input-netlex-codigo"
                  value={codigo}
                  onChange={(e) => {
                    setCodigo(e.target.value);
                    setError(null);
                    setSaved(false);
                  }}
                  className={INPUT_CLS}
                  placeholder="Ex.: NLX-00123"
                  maxLength={200}
                  aria-describedby="netlex-hint"
                />
              </WriteOnly>
              <p
                id="netlex-hint"
                data-testid="netlex-hint"
                className="mt-1 text-(length:--t-caption) text-(--color-text-muted)"
              >
                A consulta corre em paralelo e não bloqueia o fluxo. (RN-F1-03)
              </p>
            </div>
          )}

          {/* Advisory notice: code still pending */}
          {pendingNotice && (
            <p
              data-testid="consulta-pendente-notice"
              role="status"
              className="mt-2 text-(length:--t-caption) text-(--yellow-700)"
            >
              Atenção: a proposta está marcada como exceção de minuta padrão,
              mas o código de consulta ao jurídico ainda não foi informado.
            </p>
          )}

          {/* Error message */}
          {error && (
            <p
              data-testid="error-message"
              role="alert"
              className="mt-2 text-(length:--t-caption) text-(--color-danger)"
            >
              {error}
            </p>
          )}

          {/* Save confirmation */}
          {saved && !error && (
            <p
              data-testid="saved-confirmation"
              role="status"
              className="mt-2 text-(length:--t-caption) text-(--secondary-600)"
            >
              Dados de minuta salvos com sucesso.
            </p>
          )}

          {/* Submit button — inside WriteOnly so read-only profiles never see it */}
          <WriteOnly>
            <button
              type="submit"
              data-testid="save-btn"
              disabled={loading}
              aria-disabled={loading}
              className="mt-4 cursor-pointer rounded-[var(--radius-xxs)] bg-(--secondary-500) px-5 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-hover) disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Salvando…" : "Salvar"}
            </button>
          </WriteOnly>
        </form>
      )}
    </div>
  );
}
