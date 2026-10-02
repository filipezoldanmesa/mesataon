import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { RequirePermission } from '@/components/auth/require-permission';
import { GarantiaDetalhesScreen } from '@/components/garantia/garantia-detalhes-screen';
import { OpportunityBreadcrumb } from '@/components/opportunities/opportunity-breadcrumb';
import { Permission } from '@/lib/auth-permissions';

export const metadata: Metadata = {
  title: 'Detalhe da garantia · Vibra Gestor de Oportunidades',
};

/**
 * TW-01 — o detalhamento de UMA garantia, em página própria.
 *
 * *"Na tela de garantias, a ação 'Abrir' deve abrir o detalhamento da garantia em
 * nova página."* (`Ajustes_Fluxo_Garantia_GOP_v0.1` §7)
 *
 * Substitui o modal por linha que a spec de 28/08/2026 tinha introduzido, e é o
 * que o protótipo sempre fez (`garantias.html` → `garantia.html`). O modal foi
 * REMOVIDO, não mantido em paralelo: duas superfícies para o mesmo detalhe
 * divergiriam — a divergência que aquela mesma spec veio consertar.
 *
 * Gate: `GarantiaView`, o MESMO da lista. Um gate diferente aqui deixaria a lista
 * oferecer um link que a página recusa; a API aplica o mesmo por `@Roles(...)`.
 *
 * ⚠️ O `garantiaId` NÃO é validado aqui. É identificador opaco, e a tela responde
 * "não encontrada" quando ele não está na lista da oportunidade — que é a
 * resposta certa tanto para URL velha (garantia removida) quanto para digitada.
 * Uma regex de UUID recusaria o que o backend aceita, a lição do `@IsUUID` no
 * `analistaId`.
 */
export default async function GarantiaDetalhePage({
  params,
}: {
  params: Promise<{ id: string; garantiaId: string }>;
}) {
  const { id, garantiaId } = await params;

  return (
    <AppShell
      breadcrumb={
        <OpportunityBreadcrumb
          opportunityId={id}
          permission={Permission.GarantiaView}
          leaf={['Garantia', 'Detalhe']}
        />
      }
    >
      <RequirePermission permission={Permission.GarantiaView}>
        <GarantiaDetalhesScreen opportunityId={id} garantiaId={garantiaId} />
      </RequirePermission>
    </AppShell>
  );
}
