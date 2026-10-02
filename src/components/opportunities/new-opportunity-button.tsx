'use client';

import { ButtonLink } from '@/components/button-link';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';

/**
 * "+ Nova oportunidade" CTA — the single call site of the create-opportunity
 * entry point (home, carteira de clientes, Visão 360º and the opportunity list).
 *
 * Renders nothing for a profile that may not create one (RN-F2-07): a
 * Visualizador or Expansão user would otherwise walk into a 403 at the end of the
 * wizard. Centralized so the permission is checked once instead of in four
 * screens that would drift apart.
 */
export function NewOpportunityButton({ clientId }: { clientId?: string }) {
  const { can } = usePermissions();

  if (!can(Permission.OpportunityCreate)) return null;

  const href = clientId
    ? `/oportunidades/nova?clientId=${encodeURIComponent(clientId)}`
    : '/oportunidades/nova';

  return <ButtonLink href={href}>+ Nova oportunidade</ButtonLink>;
}
