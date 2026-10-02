import type { TeamMember, TeamMemberRole } from './team.types';

/**
 * Wire shape of `OpportunityMember` as the backend serializes it
 * (`apps/api/src/opportunities/dto/team-member.dto.ts`). Declared explicitly
 * because the BFF is the only place the two vocabularies meet: the backend
 * speaks `teamRole`/`funcao`/`region`, the screen speaks `role`/`isPrincipal`/
 * `zone`.
 */
export interface BackendTeamMember {
  id: string;
  userId: string;
  name: string;
  email?: string;
  /** Structural position: `lt_principal` | `apoio` | `colaborador`. */
  teamRole?: string;
  /** Função/especialidade (balde de franquia) — maps 1:1 to the FE role. */
  funcao?: string | null;
  /** Cargo no diretório, snapshot da inclusão (migration …099). */
  jobTitle?: string | null;
  /** Região/diretoria, snapshot da inclusão. */
  region?: string | null;
  /** Perfis de acesso conhecidos na inclusão (valores do enum Role). */
  roles?: string[] | null;
}

export interface BackendTeam {
  principal: BackendTeamMember | null;
  members: BackendTeamMember[];
}

/** Structural position that makes a member THE accountable owner (RN-F1-01). */
const LT_PRINCIPAL = 'lt_principal';

/**
 * Backend member → screen member. **Single mapper for the three routes that
 * return one** (`GET team`, `POST team`, `PUT team/principal`) — ADO 67910.
 *
 * ## Por que isto existe
 *
 * Só o `GET` mapeava. O `POST` e o `PUT` faziam `NextResponse.json(await
 * res.json())` — passthrough cru, o anti-padrão que o CLAUDE.md nomeia: compila
 * (a rota não é tipada) e falha só em runtime. Os dois campos que a tela usa
 * para posicionar a pessoa — `role` (balde) e `isPrincipal` — **não existem no
 * payload do backend**, então voltavam `undefined`, e o `as TeamMember` do
 * `team.api.ts` os deixava passar.
 *
 * Os dois sintomas do ADO 67910 saem daí, e nenhum é do backend (a linha era
 * gravada corretamente — foi o que o relator viu pelo perfil do LT):
 *
 *  - **`+ Adicionar`**: com `role: undefined` o chip não casa
 *    `members.filter(m => m.role === role)` e some de TODOS os baldes. A tela
 *    seguia dizendo "Ninguém adicionado", o usuário clicava de novo e aí sim
 *    vinha erro — o 409 "Usuário já é membro", mascarado pela BFF como
 *    "Falha ao adicionar membro." Daí o relato *"mesmo exibindo erro … ele
 *    adicionou esse membro"*.
 *  - **`Trocar` LT**: com `isPrincipal: undefined`, o `changePrincipal` do hook
 *    rebaixa todo mundo (`isPrincipal: false`) e promove ninguém — o card
 *    passava a ler **"Nenhum LT principal definido."** É o título do ticket.
 *
 * `isPrincipal` é derivado do `teamRole` porque é o único fato que as TRÊS
 * respostas carregam — o `POST` e o `PUT` devolvem um membro solto, sem
 * envelope. É a mesma verdade que o slot `principal` do `GET`: o `splitTeam` do
 * backend separa os dois exatamente por esse campo. O `GET` ainda passa o
 * veredito explícito (`isPrincipal`), porque ali o envelope É a afirmação do
 * endpoint e derivá-la de novo abriria espaço para os dois discordarem.
 */
export function mapTeamMember(
  m: BackendTeamMember,
  isPrincipal = m.teamRole === LT_PRINCIPAL,
): TeamMember {
  return {
    id: m.id,
    userId: m.userId,
    name: m.name,
    email: m.email,
    role: (m.funcao ?? 'outros') as TeamMemberRole,
    // Qualificação da pessoa (Bug 67589 / protótipo `01b`: "Ana Ribeiro · LT ·
    // SP Capital · principal"). Valores de MÁQUINA atravessam a BFF — quem
    // resolve rótulo é o front (`teamMemberQualifier`), como no resto do app.
    roles: m.roles ?? [],
    jobTitle: m.jobTitle ?? null,
    zone: m.region ?? undefined,
    area: undefined,
    isPrincipal,
  };
}

/**
 * Backend team (`{principal, members}`) → screen team (`{members, canManage}`).
 *
 * `canManage` has no backend field yet — defaulted true (the RolesGuard still
 * enforces mutations server-side, and `TeamSection` intersects it with the
 * read-only profile check).
 */
export function mapTeam(b: BackendTeam): { members: TeamMember[]; canManage: boolean } {
  const members = [
    ...(b.principal ? [mapTeamMember(b.principal, true)] : []),
    ...(b.members ?? []).map((m) => mapTeamMember(m, false)),
  ];

  return { members, canManage: true };
}
