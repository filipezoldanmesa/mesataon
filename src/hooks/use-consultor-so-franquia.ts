'use client';

import { useEffect, useState } from 'react';

import { usePermissions } from '@/hooks/use-permissions';
import { Role } from '@/lib/auth-roles';
import { getOpportunityProposals } from '@/lib/opportunities/opportunity-detail.api';
import { isFranquiaTipo } from '@/lib/proposals/franquia-proposal.types';
import type { TipoProposta } from '@/lib/proposals/franquia-proposal.types';

/** Papéis de capacidade — não são perfil, então não contam como "outro papel". */
const CAPACIDADES: ReadonlySet<string> = new Set([Role.Approver, Role.Compliance]);

/**
 * Espelho de `ConsultorSoFranquiaGuard` (API): o Consultor de Expansão elabora
 * minuta e envia contrato para assinatura *"apenas propostas de franquia"*
 * (Matriz RBAC v2.1). Sem este hook a tela oferecia "+ Adicionar documento" e o
 * envio numa oportunidade só de posto — e o clique respondia 403.
 *
 * Devolve `true` para quem não age exclusivamente como Consultor (a regra não o
 * alcança) e, para o Consultor, só quando a oportunidade tem proposta BR Mania
 * ou Lubrax+. Enquanto não sabe, devolve `false`: "não sei" nunca oferece a
 * ação.
 */
export function useConsultorSoFranquia(opportunityId: string): boolean {
  const { roles } = usePermissions();
  const somenteConsultor =
    roles.includes(Role.ConsultorExpansao) &&
    roles.every((r) => r === Role.ConsultorExpansao || CAPACIDADES.has(r));

  const [temFranquia, setTemFranquia] = useState<boolean | null>(null);

  useEffect(() => {
    if (!somenteConsultor) return;
    let ativo = true;
    getOpportunityProposals(opportunityId)
      .then((propostas) => {
        if (ativo) {
          setTemFranquia(
            propostas.some((p) => isFranquiaTipo(p.tipoProposta as TipoProposta | null)),
          );
        }
      })
      .catch(() => {
        if (ativo) setTemFranquia(false);
      });
    return () => {
      ativo = false;
    };
  }, [opportunityId, somenteConsultor]);

  return !somenteConsultor || temFranquia === true;
}
