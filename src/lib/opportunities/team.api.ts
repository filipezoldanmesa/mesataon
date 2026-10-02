/**
 * Real opportunity team client — calls the BFF routes (`/api/opportunities/*`),
 * which inject the httpOnly session Bearer server-side. Same signatures as
 * team.mock.ts; components/hooks never import this directly — use team.data.ts.
 */

import { throwApiError } from '@/lib/api-errors';
import { apiUrl } from '@/lib/base-path';

import type {
  AddTeamMemberPayload,
  OpportunityTeam,
  TeamMember,
} from './team.types';

function teamBase(opportunityId: string, ...sub: string[]): string {
  // Sub-path segments go THROUGH `apiUrl` — never concatenated onto the result.
  // The prefixed form ends in "/", so `${teamBase(id)}/principal` produced
  // `…/team//principal` (seen in dev; tolerated by the router, but not by design).
  return apiUrl('opportunities', opportunityId, 'team', ...sub);
}

export async function getTeam(opportunityId: string): Promise<OpportunityTeam> {
  const res = await fetch(teamBase(opportunityId));
  if (!res.ok) throw new Error(`Falha ao carregar equipe (${res.status}).`);
  // A BFF já entrega a forma de tela (`team-mapping.ts`) — nas TRÊS rotas que
  // devolvem membro, desde o ADO 67910. Antes só o `GET` era mapeado.
  return (await res.json()) as OpportunityTeam;
}

export async function addMember(
  opportunityId: string,
  payload: AddTeamMemberPayload,
): Promise<TeamMember> {
  const res = await fetch(teamBase(opportunityId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 403) throw new Error('Sem permissão para adicionar membros.');
  if (!res.ok) await throwApiError(res, 'Falha ao adicionar membro');
  return (await res.json()) as TeamMember;
}

/**
 * ⚠️ **`POST`, e não `DELETE`** — esta chamada sai do BROWSER, e o host do web
 * está atrás do edge (Akamai) que recusa o método: `501 Unsupported Request` em
 * qualquer path, sem consultar o origin (ADO 67557/67796). A rota BFF continua
 * aceitando `DELETE` com a mesma implementação, para quem chamar de um ambiente
 * sem o edge no caminho.
 */
export async function removeMember(
  opportunityId: string,
  memberId: string,
): Promise<void> {
  const res = await fetch(
    teamBase(opportunityId, memberId),
    { method: 'POST' },
  );
  if (res.status === 403) throw new Error('Sem permissão para remover membros.');
  if (!res.ok && res.status !== 204)
    await throwApiError(res, 'Falha ao remover membro');
}

export async function changePrincipal(
  opportunityId: string,
  userId: string,
): Promise<TeamMember> {
  // Backend promotes/creates the principal by directory userId (not membership
  // id) — it can even add someone not yet on the team.
  const res = await fetch(teamBase(opportunityId, 'principal'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (res.status === 403) throw new Error('Sem permissão para trocar o LT principal.');
  if (!res.ok) await throwApiError(res, 'Falha ao trocar LT principal');
  return (await res.json()) as TeamMember;
}
