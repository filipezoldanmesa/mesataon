'use client';

import { useCallback, useState } from 'react';

import type { AddTeamMemberPayload, OpportunityTeam, TeamMember } from '@/lib/opportunities/team.types';

export type TeamLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type UseOpportunityTeam = {
  status: TeamLoadStatus;
  team: OpportunityTeam | null;
  error: string;
  /** Reload the full team list. */
  loadTeam: () => Promise<void>;
  /** Add a member; updates team state on success. Returns error string on failure. */
  addMember: (payload: AddTeamMemberPayload) => Promise<string | null>;
  /** Remove a member by membership id. Returns error string on failure. */
  removeMember: (memberId: string) => Promise<string | null>;
  /** Set a member as the principal LT (by directory userId). Returns error string on failure. */
  changePrincipal: (userId: string) => Promise<string | null>;
};

type TeamFns = {
  getTeam: (opportunityId: string) => Promise<OpportunityTeam>;
  addMember: (opportunityId: string, payload: AddTeamMemberPayload) => Promise<TeamMember>;
  removeMember: (opportunityId: string, memberId: string) => Promise<void>;
  changePrincipal: (opportunityId: string, userId: string) => Promise<TeamMember>;
};

/**
 * State machine for the opportunity team section.
 * Accepts injectable data functions so tests can inject mocks without
 * touching the module-level selectors.
 */
export function useOpportunityTeam(
  opportunityId: string,
  fns: TeamFns,
): UseOpportunityTeam {
  const [status, setStatus] = useState<TeamLoadStatus>('idle');
  const [team, setTeam] = useState<OpportunityTeam | null>(null);
  const [error, setError] = useState('');

  const loadTeam = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const data = await fns.getTeam(opportunityId);
      setTeam(data);
      setStatus('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar equipe.');
      setStatus('error');
    }
  }, [opportunityId, fns]);

  const addMember = useCallback(
    async (payload: AddTeamMemberPayload): Promise<string | null> => {
      try {
        const member = await fns.addMember(opportunityId, payload);
        setTeam((prev) =>
          prev ? { ...prev, members: [...prev.members, member] } : prev,
        );
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Erro ao adicionar membro.';
      }
    },
    [opportunityId, fns],
  );

  const removeMember = useCallback(
    async (memberId: string): Promise<string | null> => {
      try {
        await fns.removeMember(opportunityId, memberId);
        setTeam((prev) =>
          prev
            ? { ...prev, members: prev.members.filter((m) => m.id !== memberId) }
            : prev,
        );
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Erro ao remover membro.';
      }
    },
    [opportunityId, fns],
  );

  const changePrincipal = useCallback(
    async (userId: string): Promise<string | null> => {
      try {
        const updated = await fns.changePrincipal(opportunityId, userId);
        setTeam((prev) => {
          if (!prev) return prev;

          const members = prev.members.map((m) =>
            m.id === updated.id ? updated : { ...m, isPrincipal: false },
          );

          /*
           * O novo LT pode NÃO estar na equipe ainda (ADO 67910): desde que o
           * seletor de "Trocar" passou a oferecer a população de `Role.LT` do
           * diretório, o caso comum é justamente esse — e o backend
           * (`OpportunityTeamService.changePrincipal`) cria a linha. Com um
           * `map` sozinho, o promovido não casava com ninguém e era descartado,
           * enquanto os outros já tinham sido rebaixados: nenhum membro com
           * `isPrincipal`, e o card lia "Nenhum LT principal definido.".
           */
          return {
            ...prev,
            members: members.some((m) => m.id === updated.id)
              ? members
              : [...members, updated],
          };
        });
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Erro ao trocar LT principal.';
      }
    },
    [opportunityId, fns],
  );

  return { status, team, error, loadTeam, addMember, removeMember, changePrincipal };
}
