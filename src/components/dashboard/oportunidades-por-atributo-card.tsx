'use client';

import { Spinner } from '@/components/spinner';
import type { AtributoItem, SectionResult } from '@/lib/dashboard/resumo-mapping';

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

function Loading() {
  return (
    <div className="flex items-center justify-center py-10">
      <Spinner label="Carregando oportunidades por atributo…" />
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
// Bar row — mirrors .arow (01-visao-geral.html lines 58–62)
// ---------------------------------------------------------------------------

function BarRow({ label, percentual, quantidade }: { label: string; percentual: number; quantidade: number }) {
  return (
    /* Prototype .arow: flex, space-between, t-caption, 9px vertical padding, border-bottom */
    <div className="flex items-center justify-between border-b border-(--color-border) py-[9px] text-(length:--t-caption) last:border-b-0">
      <span className="w-[120px] shrink-0">{label}</span>
      {/* Prototype .bar: flex-1, 8px height, neutral-100 background, overflow hidden */}
      <span className="mx-3 h-2 flex-1 overflow-hidden rounded-full bg-(--neutral-100)">
        {/* Prototype .bar i: secondary-500 fill (#418020) */}
        <i
          aria-hidden="true"
          className="block h-full rounded-full bg-(--secondary-500)"
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
  section?: SectionResult<AtributoItem> | null;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * "Oportunidades por atributo" card (OPORTUNIDADES_POR_ATRIBUTO widget · F1).
 *
 * Mirrors the prototype card at lines 181–186 of 01-visao-geral.html:
 * attribute label + horizontal bar (proportional) + absolute count.
 *
 * Tokens used:
 *   - bar fill: --secondary-500 (#418020)
 *   - bar track: --neutral-100 (#e6e6e6)
 */
export function OportunidadesPorAtributoCard({ loading = false, section }: Props) {
  /*
   * Frase do backend (`porAtributo.escopoLabel`), nunca composta aqui: a tela
   * não sabe qual persona é recortada, e uma cópia da regra divergiria do
   * número que ela legenda.  Ausente ⇒ nada é escrito.
   */
  const escopoLabel = section?.escopoLabel ?? null;

  return (
    /*
     * `h-full`: na grade 2×2 do BP Financeiro este card divide a linha com
     * "Indicadores da SNEG" — sem ele a borda terminaria no meio da linha
     * (a célula estica; o card não).
     */
    <div className="h-full rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-[18px_20px]">
      <div className="mb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-(length:--t-h3) font-bold">Oportunidades por atributo</h2>
        </div>
        {escopoLabel && (
          /*
           * O card passou a contar menos para a SNEG (pedido de 20/09/2026).
           * Sem esta linha, a contagem menor é indistinguível de dado faltando.
           */
          <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
            {escopoLabel}
          </p>
        )}
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
          {section.items.map((item) => (
            <BarRow
              key={item.atributo}
              /* pt-BR label from the backend — `atributo` is the machine value. */
              label={item.label}
              percentual={item.percentual}
              quantidade={item.quantidade}
            />
          ))}
        </div>
      )}
    </div>
  );
}
