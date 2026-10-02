import type { Metadata } from 'next';
import { Suspense } from 'react';

import { AppShell } from '@/components/app-shell';
import { RequirePermission } from '@/components/auth/require-permission';
import { GovernancaScreen } from '@/components/governanca/governanca-screen';
import { PermissionBreadcrumb } from '@/components/permission-breadcrumb';
import { Permission } from '@/lib/auth-permissions';

export const metadata: Metadata = {
  title: 'Governança · Vibra Gestor de Oportunidades',
};

/**
 * Governança — trilha de auditoria + as telas de parametrização (ADO 67867).
 *
 * O gate da rota é `Permission.GovernancaAccess` — BP Financeiro, Gestor de
 * Franquias e TI Administrador, os três perfis do pedido de 20/09/2026. Cada
 * aba mantém o gate próprio dentro de {@link GovernancaScreen}, então o perfil
 * que entra vê só as seções da audiência dele.
 *
 * ⚠️ Era a **união** das permissões de dentro (`GOVERNANCA_PERMISSIONS`),
 * derivada do catálogo de superfícies; ela não distingue "tem alguma coisa aqui
 * dentro" de "pode entrar na Governança", e o pedido separou as duas — ver o
 * docblock da permissão.
 *
 * Perfis fora do gate continuam recebendo `NotFoundScreen` — sem vazamento de
 * informação sobre quais superfícies restritas existem.
 *
 * `Suspense` é obrigatório porque o `AuditoriaPanel` usa `useSearchParams()`
 * (período, chip e busca vão para a URL — CA-1).
 *
 * O breadcrumb diz "Governança · Parametrização", como o protótipo
 * (`15-governanca.html`): a tela perdeu o cartão de cabeçalho com o título e a
 * linha de perfil, então é ele — com o item ativo do menu — quem nomeia a
 * página.
 */
export default function GovernancaPage() {
  return (
    <AppShell
      breadcrumb={
        <PermissionBreadcrumb
          permission={Permission.GovernancaAccess}
          items={[{ label: 'Governança · Parametrização' }]}
        />
      }
    >
      <RequirePermission permission={Permission.GovernancaAccess}>
        <Suspense>
          <GovernancaScreen />
        </Suspense>
      </RequirePermission>
    </AppShell>
  );
}
