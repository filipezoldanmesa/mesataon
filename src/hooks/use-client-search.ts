'use client';

import { useCallback, useRef, useState } from 'react';

import type { ClientSummary } from '@/lib/clients/types';

export type SearchStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type UseClientSearch = {
  status: SearchStatus;
  results: ClientSummary[];
  error: string;
  runSearch: (term: string) => Promise<void>;
  reset: () => void;
};

/**
 * Async state machine for the client search (idle → loading → loaded | error),
 * shared by the home autocomplete and the list screen. Keeps a request sequence
 * so out-of-order responses from fast typing can't overwrite a newer result.
 *
 * `search` should be a stable reference (module fn or memoized) — it is a dep
 * of `runSearch`.
 */
export function useClientSearch(
  search: (query: string) => Promise<ClientSummary[]>,
): UseClientSearch {
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [results, setResults] = useState<ClientSummary[]>([]);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const runSearch = useCallback(
    async (term: string) => {
      if (term.trim() === '') {
        seq.current += 1;
        setStatus('idle');
        setResults([]);
        return;
      }

      const mySeq = (seq.current += 1);
      setStatus('loading');
      setError('');

      try {
        const found = await search(term);
        if (mySeq !== seq.current) return; // a newer search superseded this one
        setResults(found);
        setStatus('loaded');
      } catch (err) {
        if (mySeq !== seq.current) return;
        setError(err instanceof Error ? err.message : 'Erro ao buscar clientes.');
        setStatus('error');
      }
    },
    [search],
  );

  const reset = useCallback(() => {
    seq.current += 1;
    setStatus('idle');
    setResults([]);
    setError('');
  }, []);

  return { status, results, error, runSearch, reset };
}
