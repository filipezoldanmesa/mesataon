'use client';

import Link from 'next/link';
import { useState } from 'react';

import { isPendenciaAtiva } from '@/lib/pendencias/types';
import type { ListPendenciasResult } from '@/lib/pendencias/types';

// ---------------------------------------------------------------------------
// Opportunity-level pendency card (OPP-F2) — real data from the Pendências
// module (opportunity-scoped). Sibling of the "Análises" card in the right
// aside column: a collapsible card whose header toggles the pending-item list
// (each row links to the full panel at `/pendencias?opp=<code>`). Hidden when
// there are no pendencies.
//
// ⚠️ Saiu de dentro de `opportunity-detail.tsx` em 17/09/2026 (ADO 68478) para
// ser o MESMO card nas duas telas que o mostram — o corpo de preenchimento e a
// `AprovacaoView`. O ticket relatou as pendências "sumindo" ao enviar para
// aprovação: elas continuavam abertas, e o que mudava era a tela (a fase
// `EM_APROVACAO` troca o corpo inteiro). Duas implementações divergiriam
// justamente no recorte de "ativas", que é o que faz o contador ser honesto.
// ---------------------------------------------------------------------------

export function PendenciasCard({
  summary,
  opportunityCode,
}: {
  summary: ListPendenciasResult | null;
  opportunityCode: string;
}) {
  // Collapsed by default — keeps the aside compact; the header toggles the list.
  const [open, setOpen] = useState(false);

  /*
   * Só as ATIVAS — o card conta e lista o que ainda pede ação.
   *
   * `GET /v1/pendencias` não filtra por padrão e o parâmetro `status` aceita um
   * valor só, então nenhuma query pede "as abertas" (que são duas: `Aberta` e
   * `Em tratativa`). Enquanto isso não era filtrado aqui, o card somava as
   * resolvidas e chamava o resultado de "N aberta(s)": a Integridade emitia o
   * parecer, `ddi:parecer` era encerrada, e a OPP do LT seguia dizendo
   * "1 aberta · PN-00xx · DDI: emitir parecer" (ADO 67882) — o LT ia cobrar uma
   * tarefa que ninguém mais podia executar (`POST .../resolver` recusa essa
   * origem com 400).
   *
   * A contagem é EXATA porque a chamada do detalhe é não paginada
   * (`listPendencias({ opportunityRef })`, sem `limit` ⇒ `items` é o conjunto
   * inteiro). `summary.total` NÃO serve: ele conta os quatro status.
   */
  const ativas = (summary?.items ?? []).filter((p) => isPendenciaAtiva(p.status));

  if (!summary || ativas.length === 0) return null;

  const panelHref = `/pendencias?opp=${encodeURIComponent(opportunityCode)}`;
  // Cap the aside list so a long backlog doesn't stretch the card; the full
  // set lives behind "Exibir painel →".
  const top = ativas.slice(0, 4);

  return (
    <aside
      id="pendencias"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-baseline justify-between gap-2 text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-(length:--t-h4) font-bold">Pendências</span>
          <span className="rounded-full bg-(--yellow-100) px-2 py-0.5 text-[11px] font-bold text-(--yellow-700)">
            {ativas.length} {ativas.length === 1 ? 'aberta' : 'abertas'}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`text-(--color-text-muted) transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div id="pendencias-list">
          {/* First row keeps its top border so it reads as the divider under the
              title — mirrors the "Análises" card. */}
          <div className="mt-3.5 flex flex-col">
            {top.map((p) => (
              <Link
                key={p.id}
                href={panelHref}
                className="flex items-center justify-between gap-2.5 border-t border-(--color-border) py-2.5 text-(length:--t-caption) text-(--color-text) hover:text-(--secondary-600)"
              >
                <span>
                  {p.code} · {p.title}
                </span>
                <span aria-hidden="true" className="shrink-0 font-bold text-(--secondary-600)">
                  →
                </span>
              </Link>
            ))}
          </div>

          <Link
            href={panelHref}
            className="mt-3.5 inline-flex items-center text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
          >
            Exibir painel →
          </Link>
        </div>
      )}
    </aside>
  );
}
