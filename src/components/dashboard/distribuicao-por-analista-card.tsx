'use client';

import { Spinner } from '@/components/spinner';
import type { AnalistaItem, SectionResult } from '@/lib/dashboard/resumo-mapping';

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

function Loading() {
  return (
    <div className="flex items-center justify-center py-10">
      <Spinner label="Carregando distribuição por analista…" />
    </div>
  );
}

function Empty() {
  return (
    <p className="py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
      Nenhum dado disponível.
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
// Bar row — mirrors .arow (01-visao-geral.html lines 58–62, 188–195)
// ---------------------------------------------------------------------------

type BarRowProps = {
  label: string;
  percentual: number;
  quantidade: number;
  /** When true: label colour and bar fill use the red verdict tokens (CA-5 analog for
      "Sem analista" — it is a verdict that action is needed, not a measure). */
  isUnassigned?: boolean;
};

/**
 * Exportada para os quadros da Evolução do Dashboard SNEG (Distribuição por
 * fase e a versão com status desta): o pedido é "no mesmo estilo de
 * Distribuição por analista", e uma segunda cópia da barra divergiria dela.
 */
export function BarRow({ label, percentual, quantidade, isUnassigned = false }: BarRowProps) {
  return (
    /* Prototype .arow: flex, space-between, t-caption, 9px vertical padding, border-bottom */
    <div className="flex items-center justify-between border-b border-(--color-border) py-[9px] text-(length:--t-caption) last:border-b-0">
      <span
        className={`w-[120px] shrink-0${isUnassigned ? ' text-(--red-700)' : ''}`}
      >
        {label}
      </span>
      {/* Prototype .bar: flex-1, 8px height, neutral-100 background, overflow hidden */}
      <span className="mx-3 h-2 flex-1 overflow-hidden rounded-full bg-(--neutral-100)">
        {/* "Sem analista" bar: --red-500 verdict fill (prototype line 194). Others: --secondary-500. */}
        <i
          aria-hidden="true"
          className={`block h-full rounded-full${isUnassigned ? ' bg-(--red-500)' : ' bg-(--secondary-500)'}`}
          style={{ width: `${Math.max(0, Math.min(100, percentual))}%` }}
        />
      </span>
      <b>{quantidade}</b>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** Loading while dashboard is fetching data. */
  loading?: boolean;
  /**
   * Section result from the backend — null means the widget is not present for
   * this persona (the grid will not render this card in that case).
   */
  section?: SectionResult<AnalistaItem> | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * "Distribuição por analista" card (DISTRIBUICAO_POR_ANALISTA widget · F1).
 *
 * Mirrors the prototype card at lines 188–195 of 01-visao-geral.html:
 * analyst name + bar + count.  The "Sem analista" row (nomeAnalista === null)
 * uses --red-700 for the label and --red-500 for the bar fill — these are
 * veredito colours (an action is required to assign the opportunity), NOT a
 * measurement in the DS traffic-light sense.
 *
 * Tokens used:
 *   - normal bar fill: --secondary-500 (#418020)
 *   - normal bar track: --neutral-100 (#e6e6e6)
 *   - "Sem analista" label: --red-700 (#791f1f)
 *   - "Sem analista" bar: --red-500 (#e24b4a)
 */
export function DistribuicaoPorAnalistaCard({ loading = false, section }: Props) {
  return (
    <div className="rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-[18px_20px]">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-(length:--t-h3) font-bold">Distribuição por analista</h2>
      </div>

      {loading && <Loading />}

      {!loading && !section && (
        <p className="py-6 text-center text-(length:--t-caption) text-(--color-text-muted)">
          Nenhum dado disponível.
        </p>
      )}

      {!loading && section?.status === 'error' && <ErrorState fonte={section.fonte} />}

      {!loading && section?.status === 'ok' && section.items.length === 0 && <Empty />}

      {!loading && section?.status === 'ok' && section.items.length > 0 && (
        <div>
          {section.items.map((item, idx) => {
            const isUnassigned = item.nomeAnalista === null;
            const label = item.nomeAnalista ?? 'Sem analista';
            return (
              <BarRow
                key={isUnassigned ? `__sem_analista__-${idx}` : `${item.nomeAnalista}-${idx}`}
                label={label}
                percentual={item.percentual}
                quantidade={item.quantidade}
                isUnassigned={isUnassigned}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
