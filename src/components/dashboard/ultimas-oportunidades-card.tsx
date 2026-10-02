'use client';

import Link from 'next/link';

import { Spinner } from '@/components/spinner';
import type { OportunidadeItem } from '@/lib/dashboard/resumo-mapping';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

function Loading() {
  return (
    <div className="flex items-center justify-center py-10">
      <Spinner label="Carregando oportunidades…" />
    </div>
  );
}

function Empty() {
  return (
    <p className="py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Nenhuma oportunidade encontrada.
    </p>
  );
}

function ErrorState({ fonte }: { fonte: string }) {
  return (
    <p className="py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Falha ao carregar dados de{' '}
      <span className="font-bold">{fonte}</span>. Tente novamente mais tarde.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type UltimasOportunidadesCardStatus = 'loading' | 'ok' | 'empty' | 'error';

type Props = {
  /** Current state of the card. */
  status?: UltimasOportunidadesCardStatus;
  /** Opportunity rows — used when status is 'ok'. */
  items?: OportunidadeItem[];
  /** Integration name shown in the error state (CA-5). */
  fonte?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * "Últimas oportunidades" card (PRINCIPAIS_OPORTUNIDADES widget · F1).
 *
 * Mirrors the prototype's "Principais por valor" table (01-visao-geral.html,
 * lines 172–178): opportunity code / client / phase / estimated value, with a
 * link to the detail route.
 *
 * Prototype tokens:
 *   - link colour: --secondary-600 (#326517)
 *   - table header: uppercase, --color-text-muted, 12px → text-(length:--t-small)
 */
export function UltimasOportunidadesCard({
  status = 'loading',
  items = [],
  fonte = 'CRM',
}: Props) {
  return (
    <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-[18px_20px]">
      {/* Card header */}
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-(length:--t-h3) font-bold">Últimas oportunidades</h2>
        <Link
          href="/oportunidades"
          className="text-(length:--t-caption) font-bold text-(--secondary-600)"
        >
          Exibir todas ›
        </Link>
      </div>

      {/* States */}
      {status === 'loading' && <Loading />}
      {status === 'empty' && <Empty />}
      {status === 'error' && <ErrorState fonte={fonte} />}
      {status === 'ok' && items.length > 0 && (
        <table className="w-full border-collapse text-(length:--t-caption)">
          <thead>
            <tr>
              {/* Prototype .ptable th: 12px, uppercase, muted, 700 */}
              {['Oportunidade', 'Fase', 'Valor estimado'].map((h) => (
                <th
                  key={h}
                  className="border-b border-(--color-border) px-2 py-2 text-left text-(length:--t-small) font-bold uppercase text-(--color-text-muted)"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="border-b border-(--color-border) px-2 py-[9px]">
                  <Link
                    href={`/oportunidades/${item.id}`}
                    className="font-bold text-(--secondary-600) hover:underline"
                  >
                    {item.code ?? item.id}
                  </Link>
                  {item.nomeCliente && (
                    <div className="text-(length:--t-small) text-(--color-text-muted)">
                      {item.nomeCliente}
                    </div>
                  )}
                </td>
                <td className="border-b border-(--color-border) px-2 py-[9px] text-(--color-text-muted)">
                  {item.fase}
                </td>
                <td className="border-b border-(--color-border) px-2 py-[9px] font-bold whitespace-nowrap">
                  {item.valorEstimado != null ? formatBRL(item.valorEstimado) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
