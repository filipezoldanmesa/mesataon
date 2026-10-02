'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type KeyboardEvent } from 'react';

import { sapOrProspect } from '@/lib/clients/customer-reference';
import { useClientSearch } from '@/hooks/use-client-search';
import { searchClients as defaultSearch } from '@/lib/clients/clients.data';
import { maskClientQuery } from '@/lib/clients/format';
import type { ClientSummary } from '@/lib/clients/types';
import { rotaDoApp } from '@/lib/navegacao-segura';

const DEBOUNCE_MS = 300;

/** Salesforce "new account/prospect" destination (HU-01.2). Seam via env. */
const SALESFORCE_URL = process.env.NEXT_PUBLIC_SALESFORCE_URL ?? '#';

type Props = {
  /** Injectable for tests; defaults to the configured data source. */
  search?: (query: string) => Promise<ClientSummary[]>;
};

/**
 * Home search bar (F1 entry point) — 1:1 with the prototype `.searchbar`
 * (01-visao-geral). Single input accepting SAP code / CNPJ / CPF / razão social
 * / cidade with an autocomplete dropdown; Enter selects the first result, a
 * click routes to the 360º view parameterized by id/SAP.
 */
export function ClientSearchBox({ search = defaultSearch }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { status, results, error, runSearch, reset } = useClientSearch(search);

  useEffect(() => {
    const term = query.trim();
    if (term === '') {
      reset();
      setOpen(false);
      return;
    }
    setOpen(true);
    const timer = setTimeout(() => void runSearch(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch, reset]);

  function goToClient(client: ClientSummary) {
    router.push(rotaDoApp('clientes', client.id));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (results.length > 0) goToClient(results[0]); // Enter → first result
    }
  }

  return (
    <div className="mt-5 flex items-center gap-3 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-4 py-3 max-md:flex-wrap">
      <div className="shrink-0">
        <div className="text-(length:--t-caption) font-bold text-(--neutral-900)">
          Buscar cliente
        </div>
        <div className="text-(length:--t-small) text-(--color-text-muted)">
          Nome, CNPJ, Código SAP ou cidade
        </div>
      </div>

      <div className="relative flex-1 max-md:order-3 max-md:basis-full">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="cliente-resultados"
          aria-label="Buscar cliente"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(maskClientQuery(event.target.value))}
          onKeyDown={onKeyDown}
          placeholder="Ex.: Posto Vibra Centro, 12.345.678/0001-90, 152201..."
          className="w-full rounded-[var(--radius-xs)] border border-(--color-border-strong) px-3 py-2.5 text-(length:--t-caption)"
        />

        {open && (
          <div
            id="cliente-resultados"
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[var(--radius-xs)] border border-(--color-border-strong) bg-white shadow-[var(--shadow-card)]"
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
                <span className="text-(--color-danger)">{error}</span>{' '}
                <button
                  type="button"
                  onClick={() => void runSearch(query)}
                  className="cursor-pointer font-bold text-(--secondary-600) hover:underline"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {status === 'loaded' && results.length === 0 && (
              <div className="px-3 py-2.5 text-(length:--t-small) text-(--color-text-muted)">
                <p>Nenhum cliente cadastrado com “{query}”.</p>
                <a
                  href={SALESFORCE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-bold text-(--secondary-600) hover:underline"
                >
                  Criar prospect no Salesforce ›
                </a>
              </div>
            )}

            {status === 'loaded' &&
              results.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => goToClient(client)}
                  className="flex w-full cursor-pointer items-center justify-between gap-2.5 border-b border-(--color-border) px-3 py-2.5 text-left last:border-b-0 hover:bg-(--secondary-100)"
                >
                  <span
                    className={`text-(length:--t-caption) font-bold ${client.kind === 'prospect' ? 'text-(--secondary-600)' : 'text-(--neutral-900)'}`}
                  >
                    {client.name}
                  </span>
                  <span className="text-[11px] text-(--color-text-muted)">
                    {sapOrProspect(client.sapCode)} · {client.document}
                  </span>
                </button>
              ))}
          </div>
        )}
      </div>

      <Link
        href="/clientes"
        className="shrink-0 cursor-pointer rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-[9px] text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-50)"
      >
        Exibir todos
      </Link>
    </div>
  );
}
