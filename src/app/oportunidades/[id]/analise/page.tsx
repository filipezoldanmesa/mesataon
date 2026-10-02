import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { AnaliseView } from '@/components/opportunities/analise-view';

export const metadata: Metadata = {
  title: 'Oportunidade em análise · Vibra Gestor de Oportunidades',
};

/**
 * Oportunidade em análise — UMA tela, para todos os perfis.
 *
 * Até 25/08/2026 a composição era resolvida pelo perfil: o analista recebia o
 * workspace `04-analise-sneg.html` e todo o resto uma visão paralela do LT,
 * montada aqui e passada como `ltView`. As duas divergiram e a do LT ficou
 * estritamente mais pobre — ver o docblock de {@link AnaliseView}. Agora o
 * shell é a única tela e o que varia é o que ela deixa EDITAR.
 *
 * O cabeçalho também saiu daqui: o shell traz o seu próprio, e nesta rota ele
 * mantém o "← Oportunidade" (só a rota da oportunidade passa
 * `hideBackToOpportunity`, para a tela não linkar para si mesma).
 */
export default async function OportunidadeAnalisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <AppShell
      breadcrumb={
        <OpportunityBreadcrumb opportunityId={id} leaf={['Em análise']} />
      }
    >
      {/*
       * Reserves room for the fixed sendbar (88px — the prototype's
       * `body { padding-bottom: 88px }`), scoped here so other pages are
       * unaffected.
       */}
      <div className="pb-[88px]">
        <AnaliseView opportunityId={id} />
      </div>
    </AppShell>
  );
}
