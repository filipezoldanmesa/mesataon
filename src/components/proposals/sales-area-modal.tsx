"use client";

import { useEffect, useState } from "react";

import { Select } from "@/components/ui/select";
import { getOpportunityPrefill } from "@/lib/opportunities/opportunity-creation.api";
import {
  allowedSalesAreas,
  defaultSalesAreaCode,
  describeAreaVendaAllow,
  salesAreaOptionLabel,
} from "@/lib/opportunities/sales-area-scope";
import type { OpportunitySalesAreaOption } from "@/lib/opportunities/types";

/**
 * Escolha da área de venda de uma oportunidade que não tem nenhuma
 * (ADO 67913).
 *
 * ⚠️ **Preenchimento único, não edição.** O backend recusa com 409 quando a
 * oportunidade já tem área, então este modal só é alcançável a partir da
 * recusa do seletor de produto — nunca de um botão "editar área".
 *
 * As opções são as áreas aprovadas da conta, recortadas por
 * {@link allowedSalesAreas}: a MESMA função e a MESMA constante que a tela de
 * criação usa. Uma segunda lista aqui divergiria da criação, e o usuário veria
 * na oportunidade existente uma opção que a criação não oferece.
 */
export function SalesAreaModal({
  postoRef,
  onConfirm,
  onClose,
}: {
  /** Código SAP do cliente da oportunidade — chave do prefill. */
  postoRef: string;
  onConfirm: (areaVendaCode: string) => Promise<void>;
  onClose: () => void;
}) {
  const [areas, setAreas] = useState<OpportunitySalesAreaOption[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getOpportunityPrefill(postoRef)
      .then((prefill) => {
        if (!alive) return;
        setAreas(allowedSalesAreas(prefill?.salesAreas));
        /*
         * O MESMO default da tela de criação (`defaultSalesAreaCode`): opção
         * única nasce escolhida e, com várias, a de `Vendas Indiretas`
         * (16/09/2026). Repetir a regra aqui faria a mesma conta abrir com uma
         * área escolhida na criação e em "Selecione…" neste modal.
         */
        setCode(defaultSalesAreaCode(prefill?.salesAreas));
        setStatus("loaded");
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [postoRef]);

  async function handleConfirm() {
    if (!code) return;
    setSaving(true);
    setError("");
    try {
      await onConfirm(code);
    } catch (err: unknown) {
      // A frase do backend é a que nomeia o conserto (409 "já tem área",
      // 400 "fora das áreas aprovadas") — não a sobrescreva.
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao definir a área de venda.",
      );
      setSaving(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      /*
       * `z-[210]`, acima do `z-[200]` do modal de produto: este abre POR CIMA
       * dele (é o conserto da recusa que aquele mostrou). Com `z-50` o modal
       * renderizava no DOM e ficava invisível atrás — o clique no CTA parecia
       * não fazer nada.
       */
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-area-modal-title"
        className="w-full max-w-[520px] rounded-(--radius-xs) bg-white p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <h4
            id="sales-area-modal-title"
            className="text-(length:--t-h4) font-bold"
          >
            Área de venda da oportunidade
          </h4>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="text-[22px] leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            &times;
          </button>
        </div>
        <p className="mb-4 text-[13px] text-(--color-text-muted)">
          É ela que define quais produtos a proposta pode oferecer. Depois de
          definida, não pode ser trocada.
        </p>

        {status === "loading" && (
          <p className="text-[13px] text-(--color-text-muted)">
            Carregando áreas…
          </p>
        )}
        {status === "error" && (
          <p className="text-[13px] text-(--color-danger)">
            Falha ao carregar as áreas de venda da conta.
          </p>
        )}
        {status === "loaded" && areas.length === 0 && (
          // Nomeia a ausência em vez de listar as áreas que o MVP não atende —
          // mesmo critério da tela de criação (CA-2 / VBR-518).
          <p
            className="text-[13px] text-(--yellow-700)"
            data-testid="sales-area-modal-vazio"
          >
            Esta conta não tem área de {describeAreaVendaAllow()} no cadastro do
            Salesforce. Inclua a área no cadastro do cliente para seguir.
          </p>
        )}
        {status === "loaded" && areas.length > 0 && (
          <Select
            id="sales-area-modal-select"
            data-testid="sales-area-modal-select"
            value={code}
            onChange={setCode}
            placeholder="Selecione a área desta oportunidade…"
            options={areas.map((a) => ({
              value: a.code,
              label: salesAreaOptionLabel(a),
            }))}
          />
        )}

        {error && (
          <p role="alert" className="mt-2 text-[13px] text-(--color-danger)">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-(--radius-xxs) border border-(--color-border) px-4 py-2 text-[13px] font-bold text-(--color-text) transition hover:bg-(--neutral-40) disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="sales-area-modal-confirmar"
            onClick={() => void handleConfirm()}
            disabled={saving || !code}
            className="rounded-(--radius-xxs) border border-(--secondary-500) bg-(--secondary-500) px-4 py-2 text-[13px] font-bold text-white transition hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Definir área"}
          </button>
        </div>
      </div>
    </div>
  );
}
