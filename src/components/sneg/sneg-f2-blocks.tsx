'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getOpportunityProposals } from '@/lib/opportunities/opportunity-detail.data';
import type { OpportunityProposal } from '@/lib/opportunities/types';

import { AnalisesConsumidasBlock } from './analises-consumidas-block';
import { ConferenciaPreenchimentoBlock } from './conferencia-preenchimento-block';
import { ProposalsInAnalysisBlock } from './proposals-in-analysis-block';
import { TriagemMaturidadeBlock } from './triagem-maturidade-block';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  opportunityId: string;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Wrapper for the four SNEG F2 main-column blocks (VBR-255):
 *
 *   1. Propostas em análise         — lists proposals, enables "Devolver"
 *   2. Triagem e maturidade         — viability + policy warnings
 *   3. Conferência do preenchimento — read-only review of the selected proposal
 *   4. Análises consumidas          — DDI / Perfil / Docs / TIR·VPL
 *
 * Manages the selected proposal state: clicking a proposal in block 1 surfaces
 * its data in block 3. Defaults to the first proposal available.
 */
export function SnegF2Blocks({ opportunityId }: Props) {
  const [proposals, setProposals] = useState<OpportunityProposal[]>([]);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Reset stale selection before fetching for the new opportunityId
    setSelectedProposalId(null);

    getOpportunityProposals(opportunityId)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setProposals(data);
        // Auto-select the first proposal for the conferência block
        if (data.length > 0) {
          setSelectedProposalId(data[0]!.id);
        }
      })
      .catch(() => {
        // Non-blocking — ProposalsInAnalysisBlock handles its own error state
      });

    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  const handlePendenciaCreated = useCallback(
    (pendenciaId: string, bloco: string) => {
      // Future: notify the lateral pendências panel via shared context
      // For now the lateral panel's refresh is triggered server-side and
      // the .reqtag is already shown in the card by ConferenciaPreenchimentoBlock.
      void pendenciaId;
      void bloco;
    },
    [],
  );

  return (
    <div className="space-y-4">
      {/* Block 1 — Propostas em análise */}
      <ProposalsInAnalysisBlock opportunityId={opportunityId} />

      {/* Block 2 — Triagem e maturidade */}
      <TriagemMaturidadeBlock opportunityId={opportunityId} />

      {/* Block 3 — Conferência do preenchimento (per selected proposal) */}
      {selectedProposalId ? (
        <ConferenciaPreenchimentoBlock
          proposalId={selectedProposalId}
          opportunityId={opportunityId}
          onPendenciaCreated={handlePendenciaCreated}
        />
      ) : proposals.length === 0 ? null : (
        // Still loading proposals — skip until selectedProposalId resolves
        <div
          className="animate-pulse rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
          aria-hidden="true"
        >
          <div className="h-4 w-48 rounded bg-(--neutral-100)" />
        </div>
      )}

      {/* Block 4 — Análises consumidas */}
      <AnalisesConsumidasBlock opportunityId={opportunityId} />
    </div>
  );
}
