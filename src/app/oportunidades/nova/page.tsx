import { AppShell } from '@/components/app-shell';
import { RequirePermission } from '@/components/auth/require-permission';
import { NovaOportunidade } from '@/components/opportunities/nova-oportunidade';
import { PermissionBreadcrumb } from '@/components/permission-breadcrumb';
import { Permission } from '@/lib/auth-permissions';

export default async function NovaOportunidadePage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  // When opened from a client's 360º ("+ Nova oportunidade"), the SAP code
  // arrives as ?clientId= so the form pre-selects that client (see
  // NovaOportunidade's `initialClientId`).
  const { clientId } = await searchParams;

  return (
    <AppShell
      breadcrumb={
        <PermissionBreadcrumb
          permission={Permission.OpportunityCreate}
          items={[
            { label: 'Oportunidades', href: '/oportunidades' },
            { label: 'Nova oportunidade' },
          ]}
        />
      }
    >
      {/* RN-F2-07: only the profiles allowed to create an opportunity get the
          wizard; the backend gates POST /v1/opportunities the same way. */}
      <RequirePermission permission={Permission.OpportunityCreate}>
        <NovaOportunidade initialClientId={clientId} />
      </RequirePermission>
    </AppShell>
  );
}
