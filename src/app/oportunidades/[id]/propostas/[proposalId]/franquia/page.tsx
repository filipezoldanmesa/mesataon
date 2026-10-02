import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { RequirePermission } from '@/components/auth/require-permission';
import { PropostaFranquiaScreen } from '@/components/franquia/proposta-franquia-screen';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { resolveProposalBreadcrumb } from '@/lib/server/proposal-breadcrumb';
import { Permission } from '@/lib/auth-permissions';

export const metadata: Metadata = {
  title: 'Proposta de franquia · Vibra Gestor de Oportunidades',
};

/**
 * `/oportunidades/[id]/propostas/[proposalId]/franquia`
 *
 * Franchise proposal screen (`03-proposta-franquia.html`, FRQ-11).
 *
 * ## Why a dedicated route instead of branching inside the proposal page
 *
 * The generic proposal page renders the PCR (posto) blocks. Sniffing the
 * proposal type there to swap the entire screen would mean fetching the
 * proposal just to decide what to fetch next, and would leave the franchise
 * screen without an addressable URL. A dedicated segment keeps both screens
 * declarative and is reachable from the two places that lead to it: the
 * franchise creation flow (`propostas/nova/franquia`) and the proposal list on
 * the opportunity. Same reasoning as ADR-0023 §D3 for `garantia`.
 *
 * Gated by `FranquiaView` — profiles without it get the plain not-found screen
 * (never "acesso restrito"); the API enforces the real 403.
 */
export default async function PropostaFranquiaPage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}) {
  const { id, proposalId } = await params;
  /*
   * ADO 68185 (07/09) — o breadcrumb mostra o CÓDIGO, não o `P-` + UUID.
   *
   * Medido em staging: esta tela exibia `P-DE9D1F48 · Franquia` enquanto o card
   * da oportunidade, ao lado, mostrava `PCR-GOP-00000096/2026` para a mesma
   * proposta. A leitura é a MESMA da rota irmã (posto) — ver
   * `resolveProposalBreadcrumb` para por que ela é compartilhada.
   */
  const { codigo } = await resolveProposalBreadcrumb(proposalId);

  return (
    <AppShell
      breadcrumb={
        <OpportunityBreadcrumb
          opportunityId={id}
          permission={Permission.FranquiaView}
          leaf={[`${codigo} · Franquia`]}
        />
      }
    >
      <RequirePermission permission={Permission.FranquiaView}>
        <PropostaFranquiaScreen opportunityId={id} proposalId={proposalId} />
      </RequirePermission>
    </AppShell>
  );
}
