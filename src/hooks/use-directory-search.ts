'use client';

import { useCallback, useRef, useState } from 'react';

import type { DirectoryUser } from '@/lib/opportunities/directory.types';
import { DirectoryGapError } from '@/lib/opportunities/directory.types';

export type DirectorySearchStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type UseDirectorySearch = {
  status: DirectorySearchStatus;
  results: DirectoryUser[];
  error: string;
  /**
   * Whether the error can never be fixed by retrying — today the Entra group
   * behind this bucket has no object id yet (ADR-0043 §6). The modal uses it to
   * suppress the retry button: a control that cannot succeed is a dead control.
   */
  permanent: boolean;
  runSearch: (term: string) => Promise<void>;
  reset: () => void;
};

/**
 * Async state machine for the collaborator directory search (idle → loading →
 * loaded | error). Guards against out-of-order responses (race condition on
 * fast typing) via a monotonic sequence counter.
 *
 * `search` should be a stable reference (module function or memoized callback).
 *
 * `searchesEmptyTerm` decides what an empty box MEANS for this source. For a
 * team bucket it means "the whole group" — small, and the backend answers it on
 * purpose — so the list loads on open and comes back when the term is cleared.
 * For the general population it means "nothing yet": that source spans the 12
 * profile groups and the BFF requires 2 characters, so an empty term stays idle.
 */
export function useDirectorySearch(
  search: (query: string) => Promise<DirectoryUser[]>,
  { searchesEmptyTerm = false }: { searchesEmptyTerm?: boolean } = {},
): UseDirectorySearch {
  const [status, setStatus] = useState<DirectorySearchStatus>('idle');
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [error, setError] = useState('');
  const [permanent, setPermanent] = useState(false);
  const seq = useRef(0);

  const runSearch = useCallback(
    async (term: string) => {
      if (term.trim() === '' && !searchesEmptyTerm) {
        seq.current += 1;
        setStatus('idle');
        setResults([]);
        return;
      }

      const mySeq = (seq.current += 1);
      setStatus('loading');
      setError('');
      setPermanent(false);

      try {
        const found = await search(term);
        if (mySeq !== seq.current) return; // superseded by a newer search
        setResults(found);
        setStatus('loaded');
      } catch (err) {
        if (mySeq !== seq.current) return;
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao buscar colaboradores.',
        );
        setPermanent(err instanceof DirectoryGapError);
        setStatus('error');
      }
    },
    [search, searchesEmptyTerm],
  );

  const reset = useCallback(() => {
    seq.current += 1;
    setStatus('idle');
    setResults([]);
    setError('');
    setPermanent(false);
  }, []);

  return { status, results, error, permanent, runSearch, reset };
}
