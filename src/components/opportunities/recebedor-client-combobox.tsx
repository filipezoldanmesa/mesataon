'use client';

/**
 * Extracted from `nova-oportunidade.tsx` so the opportunity EDIT modal can use
 * the same control (VBR-640). It was defined inline there, which is why the edit
 * modal shipped with a free-text `<input>` for the same field — and a typed SAP
 * code that nobody chose reached the domain vínculo.
 */
import { useEffect, useRef, useState } from 'react';

import { sapOrProspect } from '@/lib/clients/customer-reference';
import { useClientSearch } from '@/hooks/use-client-search';
import { maskClientQuery } from '@/lib/clients/format';
import type { ClientSummary } from '@/lib/clients/types';

/** Debounce for the client search, matching the creation wizard. */
const DEBOUNCE_MS = 300;

/** DS field styling, copied verbatim from the creation wizard's `FIELD`. */
const FIELD =
  'w-full rounded-none border-0 border-b-2 border-(--neutral-600) bg-(--neutral-40) px-3 py-[11px] text-(length:--t-caption) text-(--neutral-800) outline-none transition-colors placeholder:text-(--neutral-500) focus:border-(--secondary-500) disabled:cursor-not-allowed disabled:border-(--neutral-200) disabled:bg-(--disabled-bg) disabled:text-(--disabled-text)';

/**
 * "Cliente recebedor" combobox — the same client search as "Buscar cliente",
 * selection-only (a typed SAP code is a search term, never a submitted value).
 *
 * The backend stores the receiving client's SAP code and defaults to the
 * selected client's own code when the field is empty
 * (`OpportunitiesService.create`), so:
 *  - picking a result commits that client's SAP code;
 *  - clearing the input commits '' — "same as the client" (the placeholder);
 *  - blurring with uncommitted text reverts to the last committed display,
 *    so free text can never reach the payload.
 */
export function RecebedorClientCombobox({
  id = 'nova-opp-recebedor',
  display,
  disabled,
  search,
  onSelect,
  onClear,
}: {
  /**
   * DOM id of the input — the `<label htmlFor>` of the host screen must match.
   * Defaulted for the creation wizard; the edit modal passes its own, because
   * two inputs sharing one id would break both labels.
   */
  id?: string;
  /** Committed display text (prefill SAP code or the picked client). */
  display: string;
  disabled: boolean;
  search: (query: string) => Promise<ClientSummary[]>;
  onSelect: (client: ClientSummary) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState(display);
  const [open, setOpen] = useState(false);
  const { status, results, error, runSearch, reset } = useClientSearch(search);

  // Writing the committed display back into the input must not re-trigger the
  // search effect (same guard as the main client search box).
  const suppressSearchRef = useRef(false);

  // Latest onClear without making it an effect dependency (the parent passes
  // an inline arrow, so a dep would re-run the search effect every render).
  const onClearRef = useRef(onClear);
  onClearRef.current = onClear;

  // Read by the deferred blur handler at fire time. Capturing render-time
  // values instead would make a blur caused by PICKING an option revert the
  // input to the pre-selection text 160 ms later — display and payload would
  // disagree.
  const displayRef = useRef(display);
  displayRef.current = display;
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    suppressSearchRef.current = true;
    setQuery(display);
    setOpen(false);
  }, [display]);

  useEffect(() => {
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    const term = query.trim();
    if (term === '') {
      reset();
      setOpen(false);
      // Emptying the input commits the clear right away (not on blur): a
      // submit via Enter must never carry the value the user just removed.
      onClearRef.current();
      return;
    }
    setOpen(true);
    const timer = setTimeout(() => void runSearch(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch, reset]);

  function handleBlur() {
    // 160 ms window (same as LtCard) so an option's mousedown lands first.
    setTimeout(() => {
      setOpen(false);
      // Uncommitted free text reverts — it is a search term, never a value.
      // Read through the refs: after a pick, query is already synced to the
      // new display and this is a no-op.
      const committed = displayRef.current;
      const current = queryRef.current;
      if (current.trim() !== '' && current !== committed) {
        suppressSearchRef.current = true;
        setQuery(committed);
      }
    }, 160);
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-resultados`}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(maskClientQuery(e.target.value))}
        onBlur={handleBlur}
        disabled={disabled}
        aria-disabled={disabled}
        placeholder="Mesmo do cliente (padrão)"
        className={FIELD}
      />

      {open && (
        <div
          id={`${id}-resultados`}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 overflow-hidden rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white shadow-[var(--shadow-card)]"
        >
          {status === 'loading' && (
            <div
              role="status"
              aria-live="polite"
              className="px-3 py-2.5 text-(length:--t-small) text-(--color-text-muted)"
            >
              Buscando…
            </div>
          )}

          {status === 'error' && (
            <div className="px-3 py-2.5 text-(length:--t-small)">
              <span className="text-(--color-danger)">{error}</span>
            </div>
          )}

          {status === 'loaded' && results.length === 0 && (
            <div className="px-3 py-2.5 text-(length:--t-small) text-(--color-text-muted)">
              Nenhum cliente cadastrado com esse termo.
            </div>
          )}

          {status === 'loaded' &&
            results.map((client: ClientSummary) => (
              <button
                key={client.id}
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={() => onSelect(client)}
                className="block w-full cursor-pointer border-b border-(--color-border) px-3 py-2.5 text-left last:border-b-0 hover:bg-(--secondary-100)"
              >
                <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
                  {client.name}
                </div>
                <div className="text-[12px] text-(--color-text-muted)">
                  {sapOrProspect(client.sapCode)} · {client.document} · {client.location}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}