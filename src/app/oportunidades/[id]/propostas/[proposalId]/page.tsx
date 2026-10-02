import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { ProposalDetailPanel } from '@/components/proposals/proposal-detail-panel';
import { ProposalOpportunityHeader } from '@/components/proposals/proposal-opportunity-header';
import { proposalHref } from '@/lib/proposals/proposal-href';
import { resolveProposalBreadcrumb } from '@/lib/server/proposal-breadcrumb';

export const metadata: Metadata = {
  title: 'Proposta · Vibra Gestor de Oportunidades',
};

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string; proposalId: string }>;
}) {
  const { id, proposalId } = await params;
  const { codigo: proposalCode, tipoProposta } =
    await resolveProposalBreadcrumb(proposalId);

  /*
   * Esta página renderiza os blocos do POSTO (PCR). Uma proposta de FRANQUIA
   * (ZBRM/ZLUB) que chegue aqui — URL digitada, favorito antigo, um link
   * montado antes de `proposalHref` existir — abriria a tela errada, e com o
   * painel "↻ Recalcular / Simular (ARP)" ao lado: a VBR-570 eliminou o cálculo
   * ARP por proposta de franquia, então aquele CTA chamaria uma rota que não
   * existe mais, sobre um número que ninguém calcula.
   *
   * A regra de roteamento continua vindo de `proposalHref` — este é o encosto
   * para quem chega por fora dele, não uma segunda cópia do ternário (foi uma
   * cópia dessas que causou a VBR-508). Por isso os DOIS lados da comparação
   * saem dele: `tipoProposta: null` é, por definição, esta tela genérica.
   *
   * `redirect()` lança por dentro; fica FORA do try/catch de `resolveProposal`
   * de propósito, senão o catch engoliria o sinal do Next.
   */
  const canonico = proposalHref(id, proposalId, tipoProposta);
  if (canonico !== proposalHref(id, proposalId, null)) {
    redirect(canonico);
  }

  return (
    <AppShell
      breadcrumb={
        <OpportunityBreadcrumb
          opportunityId={id}
          leaf={[proposalCode]}
        />
      }
    >
      {/* Salesforce header: client, opportunity, responsible (CA-4: shows error faixa on failure).
          proposalId enables the full head card: status pills, proposal code, finalidade
          in H1, and meta grid (Responsável / Cliente / Oportunidade / Tipo de proposta). */}
      <ProposalOpportunityHeader opportunityId={id} proposalId={proposalId} />

      {/*
       * All detail blocks in the official prototype order (F4 → F5 → F5 → F6 → F9).
       * The canonical view is the inline expansion on the opportunity detail screen
       * (tela única); this page exists as a direct-URL fallback using the same panel.
       */}
      <div className="mt-4">
        <ProposalDetailPanel proposalId={proposalId} opportunityId={id} />
      </div>
    </AppShell>
  );
}
