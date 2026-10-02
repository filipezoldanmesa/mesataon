/**
 * Mirror of the backend `Role` enum (`apps/api/src/auth/roles.enum.ts`) — the
 * RBAC vocabulary that arrives in `AuthUser.roles`.
 *
 * Declared `as const` so every comparison is against a NAMED member, never a
 * loose string literal. The backend stays the single source of truth: this file
 * only lets the UI *display* a role and *hide* what the caller cannot use — the
 * real enforcement is the API (403), never the absence of a button.
 *
 * Two kinds of member, as on the backend:
 * - profile roles: one per access profile (perfil de acesso ⇄ Entra group);
 * - capability roles (`Approver`, `Compliance`): cross-profile authority, granted
 *   by composition, so they never identify the user's profile. `Integridade` is
 *   the PROFILE that grants `Compliance` — the capability alone has no label of
 *   its own in the header chip.
 */
export const Role = {
  LT: 'LT',
  BpFinanceiro: 'BP_FINANCEIRO',
  Sneg: 'SNEG',
  Visualizador: 'VISUALIZADOR',
  Admin: 'ADMIN',
  Spcom: 'SPCOM',
  Ccob: 'CCOB',
  GerenteVarejo: 'GERENTE_VAREJO',
  Expansao: 'EXPANSAO',
  GestorFranquias: 'GESTOR_FRANQUIAS',
  TiSustentacao: 'TI_SUSTENTACAO',
  ConsultorExpansao: 'CONSULTOR_EXPANSAO',
  Integridade: 'INTEGRIDADE',
  Approver: 'APPROVER',
  Compliance: 'COMPLIANCE',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** pt-BR label of each role — matches the profile names in Vibra's IAM sheet. */
export const ROLE_LABEL: Record<Role, string> = {
  [Role.LT]: 'Líder de Território',
  [Role.BpFinanceiro]: 'BP Financeiro',
  [Role.Sneg]: 'SNEG',
  [Role.Visualizador]: 'Visualizador',
  [Role.Admin]: 'TI Administrador',
  [Role.Spcom]: 'SPCOM',
  [Role.Ccob]: 'CCOB',
  [Role.GerenteVarejo]: 'Gerente Varejo',
  [Role.Expansao]: 'Expansão',
  [Role.GestorFranquias]: 'Gestor de Franquias',
  [Role.TiSustentacao]: 'TI Sustentação',
  [Role.ConsultorExpansao]: 'Consultor de Expansão',
  [Role.Integridade]: 'Integridade',
  [Role.Approver]: 'Aprovador',
  [Role.Compliance]: 'Compliance',
};

/** Roles that express cross-profile authority instead of a profile identity. */
const CAPABILITY_ROLES: readonly Role[] = [Role.Approver, Role.Compliance];

export function isRole(value: string): value is Role {
  return Object.prototype.hasOwnProperty.call(ROLE_LABEL, value);
}

/**
 * Label of the role that identifies the signed-in user (what the header chip
 * shows). Prefers a profile role over a capability role — a Gerente Varejo is
 * "Gerente Varejo", not "Aprovador". Unknown values are ignored rather than
 * rendered raw, so a drifted backend role never leaks an enum string into the UI.
 */
export function primaryRoleLabel(roles: string[] | undefined): string | null {
  const known = (roles ?? []).filter(isRole);
  const profileRole = known.find((role) => !CAPABILITY_ROLES.includes(role));

  const role = profileRole ?? known[0];

  return role ? ROLE_LABEL[role] : null;
}
