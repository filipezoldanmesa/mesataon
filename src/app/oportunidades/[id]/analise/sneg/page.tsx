import type { Metadata } from 'next';

import { RequirePermission } from '@/components/auth/require-permission';
import { AppShell } from '@/components/app-shell';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { SnegAnaliseShell } from '@/components/opportunities/sneg-analise-shell';
import { Permission } from '@/lib/auth-permissions';

export const metadata: Metadata = {
  title: 'Análise da proposta (SNEG) · Vibra Gestor de Oportunidades',
};

/**
 * SNEG analysis screen — `/oportunidades/[id]/analise/sneg`.
 *
 * This is the **explicit URL** of the workspace, kept stable for deep links and
 * for the VBR-225 Playwright suite that exercises `/analise` separately. It is
 * not how an analyst normally arrives: on `/oportunidades/[id]` and
 * `/oportunidades/[id]/analise`, `AnaliseView` already resolves this same shell
 * from the caller's access profile, so nobody has to navigate to a persona.
 *
 * Covers: header, meta block, 1fr/340px grid, sticky side panel and sendbar.
 *
 * Audience: the SNEG analyst (and TI Admin). Any other profile gets the
 * "Acesso restrito" screen — the backend gates the same data with
 * `@Roles(SNEG, ADMIN)`, so this is only the honest UI for that 403.
 */
export default async function SnegAnalisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell
      breadcrumb={
        <OpportunityBreadcrumb
          opportunityId={id}
          permission={Permission.SnegAnalysis}
          leaf={['Análise SNEG']}
        />
      }
    >
      {/*
       * Wrapper reserves space for the fixed sendbar (88px) so page content
       * is never obscured beneath it. Scoped here instead of body so other
       * pages are unaffected.
       */}
      <div className="pb-[88px]">
        <RequirePermission permission={Permission.SnegAnalysis}>
          <SnegAnaliseShell opportunityId={id} />
        </RequirePermission>
      </div>
    </AppShell>
  );
}
