"use client";

import { useEffect, useState } from "react";

import { getAlcadaPreview as defaultGetPreview } from "@/lib/analise/analise.data";
import type { AlcadaPreview } from "@/lib/analise/analise.types";

type Props = {
  opportunityId: string;
  /**
   * Bump to re-fetch the preview — the page increments it whenever a proposal
   * block is saved (the alert must follow the data, not keystrokes).
   */
  refreshKey?: number;
  /** Injectable for tests; defaults to the real BFF client. */
  getPreview?: (id: string) => Promise<AlcadaPreview>;
};

/**
 * Approval-level alert shown during proposal filling (RN-F7-03 / A31 —
 * VBR-290). Renders nothing while there is no elevation signal and no
 * suggested level — the empty state is silence, not an empty card. Load
 * failures are also silent: the alert is advisory; it must never block or
 * clutter the filling flow.
 */
export function AlcadaAlertBanner({
  opportunityId,
  refreshKey = 0,
  getPreview = defaultGetPreview,
}: Props) {
  const [preview, setPreview] = useState<AlcadaPreview | null>(null);

  useEffect(() => {
    let cancelled = false;

    getPreview(opportunityId)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [opportunityId, refreshKey, getPreview]);

  if (!preview || (!preview.alcadaElevada && !preview.nivel)) return null;

  return (
    <div
      role="status"
      data-testid="alcada-alert"
      className="rounded-[var(--radius-md)] border border-(--yellow-300) bg-(--color-warning-bg) px-5 py-4 text-(length:--t-caption) text-(--color-warning)"
    >
      <p className="font-bold">
        {preview.nivel
          ? `Alçada sugerida: ${preview.nivel.nivel}${preview.nivel.descricao ? ` — ${preview.nivel.descricao}` : ""}`
          : "Esta proposta tende a exigir alçada superior"}
      </p>
      {preview.motivos.length > 0 && (
        <ul
          className="mt-1 list-disc pl-5 font-normal"
          data-testid="alcada-motivos"
        >
          {preview.motivos.map((motivo) => (
            <li key={`${motivo.origem}:${motivo.codigo}:${motivo.mensagem}`}>
              {motivo.mensagem}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-(length:--t-small) font-normal opacity-80">
        Determinado automaticamente a partir das políticas e do padrão de BP —
        detalhado no parecer técnico (RN-F7-03).
      </p>
    </div>
  );
}
