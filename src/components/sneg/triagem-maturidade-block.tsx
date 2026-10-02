'use client';

import { useEffect, useRef, useState } from 'react';

import { getSnegViability as defaultGetViability } from '@/lib/sneg/sneg-analysis.data';
import type {
  AvisoPolitica,
  SnegViability,
  ViabilidadeResultado,
} from '@/lib/sneg/sneg-analysis.types';
import { StatusPill } from '@/components/status-pill';
import type { PillVariant } from '@/components/status-pill';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RESULTADO_LABEL: Record<ViabilidadeResultado, string> = {
  OK: 'OK',
  ATENCAO: 'Atenção',
  INVIAVEL: 'Inviável',
};

const RESULTADO_VARIANT: Record<ViabilidadeResultado, PillVariant> = {
  OK: 'success',
  ATENCAO: 'warning',
  INVIAVEL: 'danger',
};

/** Strip colors per aviso severity — CRITICO red, AVISO yellow, INFO info-blue. */
const SEVERIDADE_STRIP_CLASS: Record<AvisoPolitica['severidade'], string> = {
  CRITICO: 'border-(--red-500) bg-(--red-100) text-(--red-700)',
  AVISO: 'border-(--yellow-300) bg-(--yellow-100) text-(--yellow-700)',
  INFO: 'border-(--color-border) bg-(--color-info-bg) text-(--color-info)',
};

const SEVERIDADE_LABEL: Record<AvisoPolitica['severidade'], string> = {
  CRITICO: 'Trava crítica',
  AVISO: 'Aviso de política',
  INFO: 'Informação',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error';

type Props = {
  opportunityId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  getViability?: (id: string) => Promise<SnegViability>;
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * A single cell of the prototype's `.kv` grid: a 14px uppercase muted label
 * (`.kv .l`) above a `--t-caption` bold value (`.kv .v`) — stacked, not a
 * side-by-side row. The grid itself (`1fr 1fr`, `gap 12px 24px`) is the parent.
 */
function KvCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="mt-0.5 text-(length:--t-caption) font-bold">{children}</div>
    </div>
  );
}

/**
 * Warning strip for a single policy alert, colored by severity (CA-F2-02).
 *
 * Mirrors the prototype line exactly — `<b>Aviso de política</b> — {mensagem}`:
 * only the severity label is bold, the sentence is not. The backend message
 * already states the consequence ("gera exceção e eleva a alçada. Detalhado no
 * parecer."), so nothing is appended: restating `elevaAlcada` in prose here
 * duplicated the sentence on screen. The flag's own surface is the alçada
 * (painel "Travas finais e alçada" and the parecer), not this strip.
 */
function PolicyWarningStrip({ aviso }: { aviso: AvisoPolitica }) {
  return (
    <div
      role="alert"
      className={`rounded-[var(--radius-xs)] border px-3 py-[10px] text-(length:--t-caption) ${SEVERIDADE_STRIP_CLASS[aviso.severidade]}`}
      data-testid="policy-warning"
      data-eleva-alcada={aviso.elevaAlcada ? 'true' : 'false'}
    >
      <b>{SEVERIDADE_LABEL[aviso.severidade]}</b>
      {' — '}
      {aviso.mensagem}
    </div>
  );
}

/** Formats a criterion value for the negociado × referência table. */
function formatValor(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * "Triagem e maturidade" block — SNEG F2 (VBR-255).
 *
 * Displays the automatic viability check result (CA-F2-01):
 *  - "Resultado de viabilidade" pill — OK / Atenção / Inviável
 *  - "Dados do tipo de proposta" — summary text from the backend
 *  - Policy warning strips — one per aviso returned (CA-F2-02);
 *    zero warnings → no strip rendered at all.
 *
 * Covers four UI states: loading, loaded, empty (no viability data), error.
 */
export function TriagemMaturidadeBlock({
  opportunityId,
  getViability = defaultGetViability,
}: Props) {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [viability, setViability] = useState<SnegViability | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadStatus('loading');

    getViability(opportunityId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setViability(data);
        setLoadStatus('loaded');
      })
      .catch(() => {
        if (cancelled || !mountedRef.current) return;
        setLoadStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [opportunityId, getViability]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section
      aria-labelledby="triagem-title"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      <h2 id="triagem-title" className="mb-3 text-(length:--t-h4) font-bold">
        Triagem e maturidade
      </h2>

      {loadStatus === 'loading' && (
        <div
          role="status"
          aria-label="Carregando triagem e maturidade…"
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

      {loadStatus === 'error' && (
        <div
          role="alert"
          data-testid="error-state"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
        >
          Falha ao carregar os dados de triagem. Verifique sua conexão e tente novamente.
        </div>
      )}

      {loadStatus === 'loaded' && viability === null && (
        <div
          data-testid="empty-state"
          className="rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
        >
          Dados de triagem não disponíveis para esta oportunidade.
        </div>
      )}

      {loadStatus === 'loaded' && viability !== null && (
        <div data-testid="loaded-state">
          {/* `.kv` — grid 1fr 1fr, gap 12px 24px (1 column below 961px) */}
          <div className="mb-3 grid grid-cols-1 gap-x-6 gap-y-3 min-[961px]:grid-cols-2">
            <KvCell label="Resultado de viabilidade">
              <StatusPill variant={RESULTADO_VARIANT[viability.resultado]}>
                {RESULTADO_LABEL[viability.resultado]}
              </StatusPill>
            </KvCell>
            <KvCell label="Dados do tipo de proposta">
              Carregados automaticamente
            </KvCell>
          </div>

          {/* Evaluated criteria — RN-F2-01 (negociado × referência × situação) */}
          {viability.criterios.length > 0 && (
            <table className="mb-4 w-full text-(length:--t-caption)" data-testid="criterios-table">
              <thead>
                <tr>
                  {['Critério', 'Avaliado', 'Referência', 'Situação'].map((h) => (
                    <th
                      key={h}
                      className="border-b border-(--color-border) px-2 py-[7px] text-left text-(length:--t-caption) font-bold uppercase tracking-[.3px] text-(--color-text-muted)"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {viability.criterios.map((criterio) => (
                  <tr key={criterio.codigo}>
                    <td className="border-b border-(--color-border) p-2 [tr:last-child_&]:border-b-0">
                      {criterio.titulo}
                    </td>
                    <td className="border-b border-(--color-border) p-2 [tr:last-child_&]:border-b-0">
                      {formatValor(criterio.valorAvaliado)}
                    </td>
                    <td className="border-b border-(--color-border) p-2 [tr:last-child_&]:border-b-0">
                      {formatValor(criterio.referencia)}
                    </td>
                    <td
                      className={`border-b border-(--color-border) p-2 font-bold [tr:last-child_&]:border-b-0 ${
                        criterio.resultado === 'OK'
                          ? 'text-(--secondary-600)'
                          : criterio.resultado === 'ATENCAO'
                            ? 'text-(--yellow-700)'
                            : 'text-(--red-700)'
                      }`}
                    >
                      {RESULTADO_LABEL[criterio.resultado]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Policy warning strips — CA-F2-02: render only when there are warnings */}
          {viability.avisos.length > 0 && (
            <div className="space-y-2" data-testid="policy-warnings">
              {viability.avisos.map((aviso) => (
                <PolicyWarningStrip key={aviso.codigo} aviso={aviso} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
