"use client";

import { useEffect, useState } from "react";

import { FieldLabel } from "@/components/ui/field-label";
import { getProposalDateConstraints as defaultGetConstraints } from "@/lib/proposals/proposal-creation.data";
import type { ProposalDateConstraints } from "@/lib/proposals/proposal-creation.types";
import {
  analysisWindowError,
  snapToFirstDayOfMonth,
  snapToLastDayOfMonth,
} from "@/lib/proposals/proposal-date-validation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalysisWindowModalProps {
  /** Período atualmente persistido — o formulário abre com ele. */
  dataInicioAnalise: string;
  dataFimAnalise: string;
  /** Persiste o novo período. Rejeita com a frase do backend. */
  onSave: (janela: {
    dataInicioAnalise: string;
    dataFimAnalise: string;
  }) => Promise<void>;
  onClose: () => void;
  /** Injetável nos testes; por padrão lê `GET /api/proposals/date-constraints`. */
  getConstraints?: () => Promise<ProposalDateConstraints | null>;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

/**
 * O controle `.in` do protótipo (`vibra-ui.css:92-95`) — superfície preenchida
 * com sublinhado de 2px, sem borda de caixa. Mesma classe que o modal "Dados da
 * proposta" da criação usa nos seus `<input type="date">`, para os dois campos
 * serem visualmente o MESMO campo nas duas telas.
 */
const INPUT_CLS =
  "h-11 w-full rounded-t-[var(--radius-xs)] border-0 border-b-2 " +
  "border-(--color-border-strong) bg-(--neutral-40) px-3 " +
  "text-(length:--t-caption) focus:border-(--secondary-500) focus:outline-none";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Modal "Editar período da análise" do bloco "Dados da proposta".
 *
 * ## Por que um modal, e não campos inline no card
 *
 * O card é a leitura da proposta salva, e os dois campos são um PAR: aceitar
 * uma ponta de cada vez deixaria a proposta passar por um estado intermediário
 * inválido (fim antes do início) a cada correção. O modelo de preenchimento do
 * protótipo é o mesmo em toda a plataforma — grade somente-leitura + modal que
 * a edita.
 *
 * ## O veredito é UM SÓ, compartilhado com a criação
 *
 * `analysisWindowError` é o mesmo predicado que o modal de criação e a sendbar
 * usam, e os limites vêm do SERVIDOR (`GET /api/proposals/date-constraints`) —
 * nunca calculados aqui, porque mudam na virada do mês. Fonte silenciosa
 * (`null`) ⇒ sem `min` e sem bloqueio pelas regras que dependem do relógio: um
 * limite inventado no cliente é indistinguível da regra real na tela, e o
 * backend recusa de qualquer forma.
 *
 * O *snap* (1º dia do mês no início, último dia no fim) reproduz as regras
 * `Data_Inicio_Analise_Primeiro_Dia` / `Data_Fim_Analise_Ultimo_Dia` do org: o
 * dia que o usuário clicou não carrega informação que o formulário precise
 * preservar — o que ele escolheu foi o MÊS.
 */
export function AnalysisWindowModal({
  dataInicioAnalise,
  dataFimAnalise,
  onSave,
  onClose,
  getConstraints = defaultGetConstraints,
}: AnalysisWindowModalProps) {
  const [inicio, setInicio] = useState(dataInicioAnalise);
  const [fim, setFim] = useState(dataFimAnalise);
  const [constraints, setConstraints] = useState<ProposalDateConstraints | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getConstraints().then((res) => {
      if (!cancelled) setConstraints(res);
    });
    return () => {
      cancelled = true;
    };
  }, [getConstraints]);

  // Escape fecha — mesmo comportamento das demais modais da plataforma.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const validationError = analysisWindowError(inicio, fim, constraints);
  const incompleto = !inicio || !fim;
  const inalterado = inicio === dataInicioAnalise && fim === dataFimAnalise;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // O guard fica também aqui porque o form envia no Enter mesmo com o botão
    // desabilitado fora do alcance do teclado.
    if (saving || incompleto || inalterado || validationError) return;

    setServerError(null);
    setSaving(true);
    try {
      await onSave({ dataInicioAnalise: inicio, dataFimAnalise: fim });
    } catch (err) {
      // Falha MANTÉM o modal aberto com o que o usuário digitou: a frase do
      // backend nomeia o limite, e fechar aqui apagaria a correção junto.
      setServerError(
        err instanceof Error
          ? err.message
          : "Falha ao alterar o período da análise.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      data-testid="analysis-window-modal-overlay"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-auto bg-black/40 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-window-modal-title"
        data-testid="analysis-window-modal"
        className="relative m-auto w-full max-w-[520px] rounded-[var(--radius-md)] bg-(--color-surface) px-7 py-[26px] shadow-[0_8px_30px_rgba(0,0,0,.2)]"
      >
        <h3
          id="analysis-window-modal-title"
          className="mb-1 text-(length:--t-h4) font-bold"
        >
          Editar período da análise
        </h3>
        <p className="mb-5 text-(length:--t-caption) text-(--color-text-muted)">
          O período define o prazo do contrato e alimenta o cálculo dos
          indicadores — ao salvar, TIR e VPL são recalculados.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid grid-cols-2 gap-4 max-[520px]:grid-cols-1">
            <div>
              <FieldLabel htmlFor="janela-inicio">Início da análise</FieldLabel>
              <input
                id="janela-inicio"
                type="date"
                data-testid="input-inicio-analise"
                className={INPUT_CLS}
                value={inicio}
                min={constraints?.minDataInicioAnalise}
                onChange={(e) => {
                  setServerError(null);
                  setInicio(
                    e.target.value ? snapToFirstDayOfMonth(e.target.value) : "",
                  );
                }}
              />
            </div>

            <div>
              <FieldLabel htmlFor="janela-fim">Fim da análise</FieldLabel>
              <input
                id="janela-fim"
                type="date"
                data-testid="input-fim-analise"
                className={INPUT_CLS}
                value={fim}
                min={constraints?.minDataFimAnalise}
                onChange={(e) => {
                  setServerError(null);
                  setFim(
                    e.target.value ? snapToLastDayOfMonth(e.target.value) : "",
                  );
                }}
              />
            </div>
          </div>

          {validationError && (
            <p
              role="alert"
              data-testid="janela-validation-error"
              className="mt-3 text-(length:--t-caption) text-(--color-danger)"
            >
              {validationError}
            </p>
          )}

          {serverError && (
            <p
              role="alert"
              data-testid="janela-server-error"
              className="mt-3 text-(length:--t-caption) text-(--color-danger)"
            >
              {serverError}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              data-testid="janela-cancelar"
              onClick={onClose}
              className="rounded-[var(--radius-xxs)] border border-(--color-border-strong) px-5 py-2 text-(length:--t-caption) font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="janela-salvar"
              disabled={
                saving || incompleto || inalterado || Boolean(validationError)
              }
              aria-disabled={
                saving || incompleto || inalterado || Boolean(validationError)
              }
              className="rounded-[var(--radius-xxs)] bg-(--secondary-500) px-5 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-hover) disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Salvando…" : "Salvar período"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
