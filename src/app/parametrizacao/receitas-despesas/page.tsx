import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { RequirePermission } from '@/components/auth/require-permission';
import { NotFoundScreen } from '@/components/not-found-screen';
import { ValoresFinanceirosScreen } from '@/components/parametrizacao/valores-financeiros-screen';
import { PermissionBreadcrumb } from '@/components/permission-breadcrumb';
import { Permission } from '@/lib/auth-permissions';
import { SHOW_RECEITAS_DESPESAS_SURFACE } from '@/lib/governanca/receitas-despesas-visibility';

export const metadata: Metadata = {
  title: 'Parametrização de Receitas e Despesas · Vibra Gestor de Oportunidades',
};

/**
 * Amounts of the "Parâmetros da Oportunidade" catalogue — Bug ADO 67585 / VBR-595.
 *
 * Route of its own rather than a tab under `/sneg/parametrizacao`: that page was
 * titled "Parametrização SNEG" and gated on the permission of the SNEG tables,
 * while this one belongs to the TI Administrador. Hanging it there would have
 * required a union gate on the route and a title that names the wrong owner.
 * (Aquela tela foi REMOVIDA em 21/09/2026 — ficou sem nenhuma seção, e o último
 * bloco dela virou a aba "Padrões de BP" da Governança.)
 *
 * No prototype exists for this screen (the only mention of parametrization in
 * the prototype is an undesigned "Governança" placeholder card on
 * `01-visao-geral`), so the layout follows the DS. Esta tela nunca esteve no
 * menu global: era alcançada pelo cartão da aba "Parametrização" da Governança,
 * e o `← Voltar para Governança` é a saída.
 *
 * ## ⚠️ OCULTA desde 21/09/2026 — e a rota fecha junto com o cartão
 *
 * > *"Ocultar Receitas e Despesas de Governança, pois se for preciso ajustar,
 * > faremos pelo banco de dados."*
 *
 * `SHOW_RECEITAS_DESPESAS_SURFACE` tira o cartão do catálogo **e** faz esta rota
 * responder `NotFoundScreen`. As duas metades leem o MESMO switch de propósito:
 * o cartão era o único link para cá, então escondê-lo sozinho deixaria a tela
 * viva só para quem tem a URL salva — uma superfície que o negócio acredita não
 * existir, escrevendo a tabela que ele passou a ajustar pelo banco. Foi
 * exatamente a metade que voltou como bug em `/sneg/parametrizacao`
 * (20→21/09/2026).
 *
 * ⚠️ **Nada foi apagado:** a tela, a BFF e o `@Roles(ADMIN)` de
 * `/v1/financial-item-types` continuam onde estavam — reverter é ligar a
 * constante, e só.
 *
 * Profiles outside the gate get NotFoundScreen — no information leak about which
 * restricted surfaces exist.
 */
export default function ParametrizacaoReceitasDespesasPage() {
  /*
   * Oculta: a mesma resposta que um perfil sem o gate recebe. `NotFoundScreen`, e
   * não redirecionamento para `/governanca` — o conteúdo não mudou de lugar
   * (esse é o caso de `/franquia/parametrizacao`), então mandar o usuário para a
   * Governança prometeria uma seção que ele não vai achar lá.
   */
  if (!SHOW_RECEITAS_DESPESAS_SURFACE) {
    return (
      <AppShell>
        <NotFoundScreen />
      </AppShell>
    );
  }

  return (
    <AppShell
      breadcrumb={
        <PermissionBreadcrumb
          permission={Permission.FinancialItemTypeParametrizacaoManage}
          /*
           * "Governança" é crumb CLICÁVEL, não decoração: esta tela não está no
           * menu global e é alcançada pelos cartões da Governança — sem ela o
           * breadcrumb lia `🏠 » <tela>` e não havia rota de volta a não ser o
           * botão do navegador.
           *
           * ⚠️ A crumb é GATEADA por `GovernancaAccess` (20/09/2026): ter o gate
           * desta rota deixou de implicar entrada na Governança, e uma crumb que
           * leva ao `NotFoundScreen` é pior que crumb nenhuma. Mesma razão do
           * gate do `VoltarParaGovernanca`. O caso vivo era a SNEG, que abria
           * estas telas por URL direta; ela perdeu as permissões em 21/09/2026 e
           * o gate FICA como rede para o próximo perfil na mesma situação.
           */
          items={[
            {
              label: 'Governança',
              href: '/governanca',
              permission: Permission.GovernancaAccess,
            },
            { label: 'Parametrização de Receitas e Despesas' },
          ]}
        />
      }
    >
      <RequirePermission permission={Permission.FinancialItemTypeParametrizacaoManage}>
        <ValoresFinanceirosScreen />
      </RequirePermission>
    </AppShell>
  );
}
