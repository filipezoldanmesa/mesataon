'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getPicklistOptions as defaultGetPicklistOptions } from '@/lib/picklists/picklists.data';
import {
  PicklistFilterOutcome,
  type PicklistField,
  type PicklistOption,
  type PicklistOptions,
} from '@/lib/picklists/picklists.types';

export type PicklistStatus = 'loading' | 'loaded' | 'error';

export interface UsePicklistResult {
  status: PicklistStatus;
  options: PicklistOption[];
  /** The Salesforce default, when the picklist declares one. */
  defaultValue: string | null;
  /**
   * True when this is a dependent picklist whose controlling value has not been
   * answered yet. The select must be DISABLED with a hint — not populated with
   * every value, which would offer pairs the CRM refuses.
   */
  awaitingController: boolean;
  /**
   * True when the controlling value was answered but the CRM publishes no
   * dependent value for it. Every active value is offered — the select stays
   * usable — and the caller must show the gap so the full list is not mistaken
   * for a filtered one.
   */
  noPublishedValues: boolean;
  /** `Objeto.Campo__c` of origin — surfaced in the error state for support. */
  salesforceField: string | null;
  reload: () => void;
}

export interface UsePicklistOptions {
  /** Injected in tests; defaults to the real data module. */
  fetchOptions?: typeof defaultGetPicklistOptions;
}

/**
 * Loads a Salesforce picklist's options, re-fetching whenever its controlling
 * value changes.
 *
 * The options are NOT bundled in the frontend: the backend owns the value sets
 * and the dependency filtering (`GET /v1/picklists/:field`), the same way it
 * owns `statusPermitidos` for the pendência machine. A local copy of 44–316
 * values would drift the moment Vibra edits a picklist they own.
 *
 * A failure surfaces as `status: 'error'`, never as an empty list: an empty list
 * is a real answer from the catalog ("this controlling value enables nothing"),
 * so collapsing a failure into it would make the form claim there is nothing to
 * pick.
 */
export function usePicklist(
  field: PicklistField,
  controllingValue?: string | null,
  { fetchOptions = defaultGetPicklistOptions }: UsePicklistOptions = {},
): UsePicklistResult {
  const [state, setState] = useState<{ status: PicklistStatus; data: PicklistOptions | null }>({
    status: 'loading',
    data: null,
  });
  const [reloadToken, setReloadToken] = useState(0);

  // Guards against a slow response for a previous controlling value landing
  // after a newer one — same race the client-search hook handles.
  const requestSeq = useRef(0);

  /*
   * The fetcher is read through a ref so it is NOT an effect dependency. A caller
   * that passes an inline arrow (`fetchOptions={(f) => ...}`) creates a new
   * identity every render, and depending on it would re-fire the effect on every
   * render — an endless request loop in a component that looks correct.
   */
  const fetchRef = useRef(fetchOptions);
  fetchRef.current = fetchOptions;

  useEffect(() => {
    const seq = ++requestSeq.current;
    let active = true;
    setState({ status: 'loading', data: null });

    fetchRef.current(field, controllingValue ?? null)
      .then((data) => {
        if (!active || seq !== requestSeq.current) return;
        setState({ status: 'loaded', data });
      })
      .catch(() => {
        if (!active || seq !== requestSeq.current) return;
        setState({ status: 'error', data: null });
      });

    return () => {
      active = false;
    };
  }, [field, controllingValue, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const data = state.data;

  return {
    status: state.status,
    options: data?.options ?? [],
    defaultValue: data?.options.find((option) => option.isDefault)?.value ?? null,
    awaitingController: data?.outcome === PicklistFilterOutcome.ControladorAusente,
    noPublishedValues: data?.outcome === PicklistFilterOutcome.SemValorPublicado,
    salesforceField: data?.salesforceField ?? null,
    reload,
  };
}
