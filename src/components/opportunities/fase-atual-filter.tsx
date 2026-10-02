'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { FASE_ATUAL_OPTIONS } from '@/lib/opportunities/types';
import type { FaseAtual } from '@/lib/opportunities/types';

/**
 * Select multivalor "Fase atual" da listagem de oportunidades (23/09/2026).
 *
 * Substituiu as abas "Todas / Em preenchimento / … / Concluídas", que só
 * aceitavam UMA fase por vez e tinham cinco valores grossos — "Contrato"
 * juntava minuta, assinatura, ativação e pagamento.
 *
 * Por que não o `Select` do DS: ele é de valor ÚNICO (espelha o `.vdd` do
 * protótipo, com `<select>` nativo por baixo). Aqui o usuário marca várias
 * fases, então o painel é um grupo de checkboxes — o controle nativo que
 * leitor de tela e teclado já entendem — atrás de um gatilho com a mesma
 * forma do select de franquia ao lado.
 *
 * Cada opção mostra a contagem daquela fase. A contagem vem da BFF e NÃO segue
 * o próprio filtro de fase (ver `OpportunityCounts`): marcar "Em análise" não
 * pode zerar o número exibido ao lado de "Em minuta".
 *
 * Nenhuma fase marcada = todas — é o estado inicial, e o gatilho diz isso.
 */
export function FaseAtualFilter({
  value,
  counts,
  onChange,
}: {
  value: readonly FaseAtual[];
  /** Contagem por fase; `null` enquanto a primeira carga não voltou. */
  counts: Record<FaseAtual, number> | null;
  onChange: (next: FaseAtual[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Fecha ao clicar fora e no Esc — o mesmo contrato de qualquer dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = new Set(value);

  const toggle = (fase: FaseAtual) => {
    // Mantém a ORDEM DO FLUXO, não a ordem dos cliques: o resumo do gatilho e
    // a query ficam estáveis para a mesma seleção.
    onChange(
      FASE_ATUAL_OPTIONS.map((o) => o.value).filter((f) =>
        f === fase ? !selected.has(f) : selected.has(f),
      ),
    );
  };

  const resumo =
    value.length === 0
      ? 'Todas'
      : value.length === 1
        ? (FASE_ATUAL_OPTIONS.find((o) => o.value === value[0])?.label ?? value[0])
        : `${value.length} selecionadas`;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="filtro-fase-atual"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-[var(--radius-xs)] border bg-white px-3 py-2.5 text-(length:--t-caption) ${
          value.length > 0 ? 'border-(--neutral-900)' : 'border-(--color-border-strong)'
        }`}
      >
        <span className="font-bold text-(--neutral-900)">Fase atual:</span>
        <span className="text-(--neutral-800)">{resumo}</span>
        {/* Mesmo chevron do `Select` do DS (`.vdd-cv` do protótipo). */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="var(--neutral-500)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Fase atual"
          className="absolute left-0 z-20 mt-1 min-w-64 rounded-[var(--radius-xs)] border border-(--color-border) bg-white py-1 shadow-(--shadow-menu)"
        >
          {FASE_ATUAL_OPTIONS.map((o) => {
            const checked = selected.has(o.value);
            return (
              <label
                key={o.value}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-(length:--t-caption) hover:bg-(--neutral-40) ${
                  checked ? 'font-bold text-(--secondary-600)' : 'text-(--neutral-900)'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="h-4 w-4 accent-(--secondary-500)"
                />
                <span className="flex-1">{o.label}</span>
                <span className="text-[12px] font-normal text-(--color-text-muted)">
                  {counts ? counts[o.value] : '—'}
                </span>
              </label>
            );
          })}
          {value.length > 0 && (
            <div className="mt-1 border-t border-(--color-border) px-3 pt-2 pb-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
