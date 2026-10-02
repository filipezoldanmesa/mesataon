import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { RequirePermission } from '@/components/auth/require-permission';
import { NovaPropostaFranquiaScreen } from '@/components/franquia/nova-proposta-franquia-screen';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { Permission } from '@/lib/auth-permissions';
import { BandeiraFranquia, isBandeiraFranquia } from '@/lib/franquia/types';

export const metadata: Metadata = {
  title: 'Nova proposta de franquia · Vibra Gestor de Oportunidades',
};

/**
 * `/oportunidades/[id]/propostas/nova/franquia?tipo=ZBRM|ZLUB`
 *
 * Renders `03-proposta-franquia.html` — the prototype's "Nova proposta de
 * franquia" screen (FRQ-F1 / FRQ-15 entry point): the same five-card layout the
 * proposal screen uses, with each card starting empty and a "+ Cadastrar…"
 * modal filling it in.
 *
 * Gated by `FranquiaPropostaManage` — a profile without it gets the plain
 * not-found screen (naming the restriction would confirm the route exists);
 * the API enforces the real 403.
 *
 * `tipo` picks the band. Absent or unknown ⇒ ZBRM, the same side the prototype
 * defaults to (`?t=` absent ⇒ `brmania`), and the backend validates the value it
 * receives regardless.
 */
export default async function NovaFranquiaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { id } = await params;
  const { tipo } = await searchParams;
  const bandeira = isBandeiraFranquia(tipo) ? tipo : BandeiraFranquia.BrMania;

  return (
    <AppShell
      breadcrumb={
        <OpportunityBreadcrumb
          opportunityId={id}
          permission={Permission.FranquiaPropostaManage}
          leaf={['Nova proposta de franquia']}
        />
      }
    >
      <RequirePermission permission={Permission.FranquiaPropostaManage}>
        <NovaPropostaFranquiaScreen opportunityId={id} bandeira={bandeira} />
      </RequirePermission>
    </AppShell>
  );
}
