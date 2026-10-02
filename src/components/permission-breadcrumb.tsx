'use client';

import { Breadcrumb, type Crumb } from '@/components/breadcrumb';
import { usePermissions } from '@/hooks/use-permissions';
import type { Permission } from '@/lib/auth-permissions';

/**
 * Uma crumb que só aparece para quem tem `permission` (20/09/2026).
 *
 * ⚠️ Existe porque a trilha pode nomear uma página que o usuário desta rota
 * **não** alcança. O caso que a criou: `/sneg/parametrizacao` linka a Governança
 * na crumb anterior, e entre 20/09 e 21/09/2026 a SNEG abria aquela tela
 * (a permissão daquela tela, mantida na época) sem ter entrada na Governança
 * (`GovernancaAccess`) — a crumb levaria ao `NotFoundScreen`. Mesma razão do gate
 * do `VoltarParaGovernanca`, e o gate permanece pelo mesmo motivo que o de lá:
 * o par "tem a tela, não tem a área" pode voltar a aparecer com qualquer perfil
 * novo.
 *
 * Sem `permission` a crumb é incondicional, que é o comportamento de todas as
 * outras.
 */
export type PermissionCrumb = Crumb & { permission?: Permission };

/**
 * Full-width {@link Breadcrumb} for a route gated by {@link RequirePermission}.
 *
 * The breadcrumb bar is rendered in the {@link AppShell} `breadcrumb` slot, which
 * sits OUTSIDE the gated `children`. Rendering it unconditionally would name the
 * route (e.g. "Garantia", "Análise SNEG") above the {@link NotFoundScreen}
 * that an unauthorized session sees — the exact information leak RequirePermission
 * exists to prevent (a route that answers "não encontrada" must not carry a
 * breadcrumb confirming it exists). So this wrapper mirrors the same gate: it
 * renders the bar only for a session that holds `permission`, and nothing while
 * the session is still loading (never a flash-then-hide).
 */
export function PermissionBreadcrumb({
  permission,
  items,
}: {
  /** A single permission, or a list meaning **any of** — mirrors {@link RequirePermission}. */
  permission: Permission | readonly Permission[];
  items: PermissionCrumb[];
}) {
  const { can, isLoading } = usePermissions();

  const permitidas = Array.isArray(permission) ? permission : [permission];
  if (isLoading || !permitidas.some((p) => can(p))) {
    return null;
  }

  /*
   * Uma crumb com `permission` só entra para quem a tem. O `href` é descartado
   * junto com ela — nunca vira texto: uma crumb "Governança" inerte no meio da
   * trilha afirma que a página existe na hierarquia do usuário quando ela
   * responde "não encontrada" para ele.
   */
  const visiveis: Crumb[] = items
    .filter((item) => !item.permission || can(item.permission))
    .map(({ label, href }) => ({ label, href }));

  return <Breadcrumb items={visiveis} />;
}
