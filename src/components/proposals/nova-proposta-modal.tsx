"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import {
  TipoProposta,
  TIPO_PROPOSTA_LABEL,
} from '@/lib/proposals/franquia-proposal.types';
import { rotaDoApp } from '@/lib/navegacao-segura';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  opportunityId: string;
  /** Called to close the modal (X or backdrop click). */
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Proposal type option data
// ---------------------------------------------------------------------------

interface ProposalTypeOption {
  tipo: string;
  label: string;
  description: string;
  /** Null means no permission is required. */
  requiredPermission: Permission | null;
  href: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Modal for selecting the proposal type when creating a new proposal
 * (FRQ-15 — "Pontos de entrada da franquia").
 *
 * Always shows the PCR (Posto) option. ZBRM (BR Mania) and ZLUB (Lubrax+)
 * franchise options are visible only for sessions with `FranquiaPropostaManage`
 * (`@Roles(LT, ConsultorExpansao, Admin)` on the backend). Hiding is a UX
 * measure only; the BFF enforces the 403 regardless.
 *
 * Navigation:
 *   PCR  → `/oportunidades/:id/propostas/nova`
 *   ZBRM → `/oportunidades/:id/propostas/nova/franquia?tipo=ZBRM`
 *   ZLUB → `/oportunidades/:id/propostas/nova/franquia?tipo=ZLUB`
 */
export function NovaPropostaSelectorModal({ opportunityId, onClose }: Props) {
  const router = useRouter();
  const { can } = usePermissions();

  const options: ProposalTypeOption[] = [
    {
      tipo: TipoProposta.PCR,
      label: TIPO_PROPOSTA_LABEL[TipoProposta.PCR],
      description: "Proposta do posto — pista de combustíveis",
      // PRD F3 (Atores: LT/EV) — mirrors @Roles on POST .../proposals.
      requiredPermission: Permission.ProposalManage,
      href: rotaDoApp('oportunidades', opportunityId, 'propostas', 'nova'),
    },
    {
      tipo: TipoProposta.ZBRM,
      label: TIPO_PROPOSTA_LABEL[TipoProposta.ZBRM],
      description: "Loja de conveniência",
      requiredPermission: Permission.FranquiaPropostaManage,
      href: `${rotaDoApp('oportunidades', opportunityId, 'propostas', 'nova', 'franquia')}?tipo=ZBRM`,
    },
    {
      tipo: TipoProposta.ZLUB,
      label: TIPO_PROPOSTA_LABEL[TipoProposta.ZLUB],
      description: "Troca de óleo / serviços",
      requiredPermission: Permission.FranquiaPropostaManage,
      href: `${rotaDoApp('oportunidades', opportunityId, 'propostas', 'nova', 'franquia')}?tipo=ZLUB`,
    },
  ];

  // Filter options by permission: PCR needs ProposalManage (PRD F3 — LT/EV);
  // ZBRM/ZLUB need FranquiaPropostaManage. This is UI-only gating (the API
  // enforces the real 403); offering an option that opens a 403 is a dead end.
  const visibleOptions = options.filter(
    (opt) => opt.requiredPermission === null || can(opt.requiredPermission),
  );

  function handleSelect(href: string) {
    onClose();
    router.push(href);
  }

  // Close on Escape.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    /* Overlay (.np-ov) */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nova proposta — selecionar tipo"
      data-testid="nova-proposta-modal"
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-auto bg-black/40 px-4 py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal card (.np) */}
      <div className="relative m-auto w-full max-w-[560px] rounded-[var(--radius-md)] bg-white px-7 py-[26px] shadow-[0_8px_30px_rgba(0,0,0,.2)]">
        {/* Close (.np-x) — absolute top-right circle */}
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute top-3 right-3.5 flex size-8 items-center justify-center rounded-full text-[22px] leading-none text-(--color-text-muted) hover:bg-(--neutral-40)"
        >
          &times;
        </button>

        <h4 className="mb-4 text-(length:--t-h4) font-bold">Nova proposta</h4>

        {/* Options (.np-opt) — bordered cards with a code badge */}
        {visibleOptions.map((opt) => (
          <button
            key={opt.tipo}
            type="button"
            data-testid={`nova-proposta-option-${opt.tipo}`}
            onClick={() => handleSelect(opt.href)}
            className="mb-2.5 flex w-full items-center gap-3 rounded-[var(--radius-xs)] border border-(--color-border) bg-white px-4 py-3.5 text-left transition-colors hover:border-(--secondary-300) hover:bg-(--secondary-100) focus:outline-none focus:border-(--secondary-300) focus:bg-(--secondary-100)"
          >
            <span className="min-w-0">
              <span className="block text-(length:--t-caption) font-bold">
                {opt.label}
              </span>
              <span className="mt-0.5 block text-[14px] text-(--color-text-muted)">
                {opt.description}
              </span>
            </span>
            <span className="ml-auto text-[12px] font-bold whitespace-nowrap text-(--color-text-muted)">
              {opt.tipo}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
