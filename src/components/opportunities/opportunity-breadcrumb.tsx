'use client';

import { useEffect, useState } from 'react';

import { Breadcrumb, type Crumb } from '@/components/breadcrumb';
import { usePermissions } from '@/hooks/use-permissions';
import type { Permission } from '@/lib/auth-permissions';
import { getOpportunityDetail } from '@/lib/opportunities/opportunity-detail.data';

/**
 * Full-width breadcrumb for opportunity routes, showing the business code
 * (e.g. "OPP-0428") instead of the raw route id. Server pages only carry the
 * internal id, so this Client Component resolves the code with one lightweight
 * fetch, showing "…" while loading and on fetch failure — never the raw UUID
 * (machine value), never a blank crumb (CA-3, VBR-463).
 *
 * `leaf` are the trailing crumbs after the code (the current page); when empty
 * the code itself is the current page (opportunity detail), rendered non-link.
 *
 * `permission`, when set, gates the whole bar exactly like {@link PermissionBreadcrumb}:
 * a gated opportunity route (garantia, análise SNEG, proposta de franquia) must
 * not name itself above the {@link NotFoundScreen} an unauthorized session sees.
 */
export function OpportunityBreadcrumb({
  opportunityId,
  leaf = [],
  permission,
  loadCode = (id) => getOpportunityDetail(id).then((opp) => opp.code),
}: {
  opportunityId: string;
  leaf?: string[];
  permission?: Permission;
  /** Resolves the business code from the route id. Injectable for tests. */
  loadCode?: (id: string) => Promise<string>;
}) {
  const { can, isLoading } = usePermissions();
  const [code, setCode] = useState<string | null>(null);

  // Gated route: no decision until the session resolves, then only if allowed.
  const denied = permission !== undefined && (isLoading || !can(permission));

  useEffect(() => {
    if (!opportunityId || denied) return;
    let active = true;
    loadCode(opportunityId)
      .then((resolved) => {
        if (active) setCode(resolved);
      })
      .catch(() => {
        /* keep the uppercased-id fallback */
      });
    return () => {
      active = false;
    };
    // `loadCode` is an injectable seam (a fresh function each render by default);
    // the fetch keys on opportunityId, so re-running it on loadCode identity
    // would loop. Intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId, denied]);

  if (denied) return null;

  // CA-3 (VBR-463): never render the raw route id in the breadcrumb — a UUID
  // is a machine value, not user-facing text ("texto de tela nunca é valor de
  // máquina"). Show a neutral placeholder until the business code resolves.
  const label = code ?? '…';
  const hasLeaf = leaf.length > 0;

  const items: Crumb[] = [
    { label: 'Oportunidades', href: '/oportunidades' },
    hasLeaf ? { label, href: `/oportunidades/${opportunityId}` } : { label },
    ...leaf.map((label) => ({ label })),
  ];

  return <Breadcrumb items={items} />;
}
