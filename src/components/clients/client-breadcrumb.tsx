'use client';

import { useEffect, useState } from 'react';

import { Breadcrumb, type Crumb } from '@/components/breadcrumb';
import { getClient } from '@/lib/clients/clients.data';

/**
 * Full-width breadcrumb for client routes, showing the client's name instead
 * of the raw route id. Server pages only carry the internal CRM id, so this
 * Client Component resolves the name with one lightweight fetch, showing "…"
 * while loading and on fetch failure — never the raw id (machine value),
 * never a blank crumb (CA-3).
 *
 * `leaf` are the trailing crumbs after the client name (the current page);
 * when empty the name itself is the current page (360º view), rendered
 * non-link. When non-empty the name is a link back to `/clientes/{id}`.
 *
 * Usage:
 *   360º:        <ClientBreadcrumb clientId={id} />
 *   Documentos:  <ClientBreadcrumb clientId={id} leaf={['Documentos']} />
 */
export function ClientBreadcrumb({
  clientId,
  leaf = [],
  loadName = (id) => getClient(id).then((c) => c.name),
}: {
  clientId: string;
  leaf?: string[];
  /** Resolves the client name from the route id. Injectable for tests. */
  loadName?: (id: string) => Promise<string>;
}) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    loadName(clientId)
      .then((resolved) => {
        if (active) setName(resolved);
      })
      .catch(() => {
        /* keep the '…' placeholder on failure — never expose the raw id */
      });
    return () => {
      active = false;
    };
    // `loadName` is an injectable seam (a fresh function each render by default);
    // the fetch keys on clientId, so re-running it on loadName identity would loop.
    // Intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // CA-3: never render the raw route id in the breadcrumb — a CRM id is a
  // machine value, not user-facing text ("texto de tela nunca é valor de
  // máquina"). Show a neutral placeholder until the name resolves.
  const label = name ?? '…';
  const hasLeaf = leaf.length > 0;

  const items: Crumb[] = [
    { label: 'Clientes', href: '/clientes' },
    hasLeaf ? { label, href: `/clientes/${clientId}` } : { label },
    ...leaf.map((l) => ({ label: l })),
  ];

  return <Breadcrumb items={items} />;
}
