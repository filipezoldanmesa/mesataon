import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { RequirePermission } from '@/components/auth/require-permission';
import { GarantiaScreen } from '@/components/garantia/garantia-screen';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { Permission } from '@/lib/auth-permissions';

export const metadata: Metadata = {
  title: 'Garantia · Vibra Gestor de Oportunidades',
};

/**
 * Garantia route — `/oportunidades/[id]/garantia` (GAR-17).
 *
 * Deliberate route deviation (ADR-0023): CCOB's guarantee view lives at its own
 * URL instead of re-using the `/oportunidades/[id]` phase-driven render, because
 * the audience (CCOB) and the prototype link (`garantia.html`) are both distinct
 * from the LT/SNEG paths. The `← Oportunidade` link is real navigation; the
 * prototype's `Ver como SNEG →` artefact was removed by ADR-0018.
 *
 * Gate: `GarantiaView` — only LT, SNEG, CCOB and Admin may open this route.
 * Callers outside those roles see the NotFoundScreen (UX + information hygiene).
 * The API enforces the same gate via `@Roles(...)`.
 *
 * Content: `GarantiaScreen` — one component, three estados driven by the
 * backend read model (GAR-16 / VBR-342). No navigation between URLs.
 */
export default async function GarantiaPage({
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
          permission={Permission.GarantiaView}
          leaf={['Garantia']}
        />
      }
    >
      <RequirePermission permission={Permission.GarantiaView}>
        <GarantiaScreen opportunityId={id} />
      </RequirePermission>
    </AppShell>
  );
}
