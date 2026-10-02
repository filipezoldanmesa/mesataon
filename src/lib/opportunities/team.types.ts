/**
 * Types for the opportunity team (HU-01 — Equipe da oportunidade).
 *
 * API contract (FE-owns, establishes §"Equipe da oportunidade" in epic VBR-70):
 *
 *   GET  /v1/opportunities/:id/team
 *        → { members: TeamMember[], canManage: boolean }
 *
 *   POST /v1/opportunities/:id/team
 *        body: { userId: string, role: TeamMemberRole }
 *        → 201 TeamMember
 *
 *   DELETE /v1/opportunities/:id/team/:memberId
 *        → 204
 *
 *   PUT  /v1/opportunities/:id/team/principal
 *        body: { memberId: string }
 *        → 200 TeamMember
 */

import { primaryRoleLabel } from '@/lib/auth-roles';

export type TeamMemberRole =
  | 'exec_expansao'
  | 'exec_br_mania'
  | 'exec_lubrax'
  | 'outros';

export const ROLE_LABELS: Record<TeamMemberRole, string> = {
  exec_expansao: 'Executivo de expansão e otimização',
  exec_br_mania: 'Executivo de franquia BR Mania',
  exec_lubrax: 'Executivo de franquia Lubrax+',
  outros: 'Demais membros',
};

/**
 * Resolves the pt-BR label of a member's função for display.
 *
 * The backend `funcao` is a machine value (`outros`, `exec_expansao`) and the
 * screen must never print it raw (CLAUDE.md — "texto de tela nunca é valor de
 * máquina"): the team chips were showing "· outros" for every member added to
 * the "Demais membros" bucket. An unmapped value falls back to the raw string
 * so a bucket added on the backend surfaces as a visible gap instead of
 * disappearing behind a generic label.
 */
export function teamRoleLabel(role: string): string {
  return ROLE_LABELS[role as TeamMemberRole] ?? role;
}

/**
 * Qualifica a pessoa no chip/modal da equipe, na precedência do protótipo
 * (`01b-oportunidade.html:145` — `Ana Ribeiro · LT · SP Capital · principal`):
 *
 * 1. **perfil de acesso** (`roles` → `ROLE_LABEL`) — é o que o protótipo
 *    escreve ("LT", "SNEG");
 * 2. **cargo do diretório** (`jobTitle`) — reserva para quem legitimamente não
 *    tem perfil: membro de balde de executivo tem `roles: []` por design
 *    (ADR-0043 §4), e para ele o cargo é justamente a informação útil;
 * 3. **balde de franquia** (`role` → {@link teamRoleLabel}) — último recurso.
 *
 * `null` quando nada é conhecido (linha anterior à migration …099): o chamador
 * OMITE o trecho em vez de escrever um rótulo genérico. Foi o contrário disso
 * que fez o chip afirmar "Demais membros" para o LT principal.
 *
 * A escolha do perfil é do `primaryRoleLabel` — o mesmo do chip do header —,
 * que prefere perfil de identidade a papel de capacidade (um Gerente Varejo é
 * "Gerente Varejo", não "Aprovador") e descarta valor desconhecido em vez de
 * renderizá-lo cru. Reusado de propósito: uma segunda regra faria a mesma
 * pessoa ser rotulada de um jeito no header e de outro no chip.
 */
export function teamMemberQualifier(member: {
  roles?: string[];
  jobTitle?: string | null;
  role?: string;
}): string | null {
  const profile = primaryRoleLabel(member.roles);
  if (profile) return profile;

  const jobTitle = member.jobTitle?.trim();
  if (jobTitle) return jobTitle;

  if (member.role) return teamRoleLabel(member.role);
  return null;
}

export const ALL_ROLES: TeamMemberRole[] = [
  'exec_expansao',
  'exec_br_mania',
  'exec_lubrax',
  'outros',
];

export interface TeamMember {
  /** Team membership id (unique per opportunity). */
  id: string;
  /** Directory user id. */
  userId: string;
  name: string;
  email?: string;
  role: TeamMemberRole;
  /**
   * Perfis de acesso e cargo, snapshot do diretório na inclusão — o que
   * {@link teamMemberQualifier} precisa para qualificar a pessoa pelo PERFIL
   * antes de cair no balde.
   *
   * A BFF (`/api/opportunities/:id/team`) já emitia os três; faltavam aqui. Sem
   * eles o qualificador caía direto no `role`, e o card do LT principal dizia
   * "Demais membros" para o LT — o mesmo defeito que o Bug 67589 corrigiu nos
   * chips do detalhe. Ficou latente enquanto o `TeamSection` não era montado.
   */
  roles?: string[];
  jobTitle?: string | null;
  /** Região/diretoria na inclusão. Ausente com o diretório real (ADR-0031). */
  zone?: string;
  /** Human-readable area/regional info, e.g. "SP Capital · Ger. São Paulo". */
  area?: string;
  isPrincipal: boolean;
}

export interface OpportunityTeam {
  members: TeamMember[];
  /** Whether the current user may add/remove members (criador, gestor or SNEG). */
  canManage: boolean;
}

/*
 * A forma de FIO do backend (`teamRole`/`funcao`/`region`) vive em
 * `team-mapping.ts`, junto do mapper que a traduz — é a BFF que fala com ela, e
 * o cliente do browser só conhece a forma de TELA acima. Havia aqui um par
 * `BackendTeamMember`/`BackendTeamResponse` que *"espelhava TeamMember"*: dois
 * tipos com o nome de "backend" descrevendo o payload já mapeado, e um `as` que
 * carimbava o retorno da BFF sem nada verificar. Foi o que deixou o passthrough
 * cru do `POST`/`PUT` compilar (ADO 67910).
 */

export interface AddTeamMemberPayload {
  userId: string;
  role: TeamMemberRole;
}

export interface ChangePrincipalPayload {
  memberId: string;
}
