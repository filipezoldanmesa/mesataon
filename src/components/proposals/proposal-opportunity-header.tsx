"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { StatusPill, type PillVariant } from "@/components/status-pill";
import {
  getOpportunityDetail as defaultLoad,
  getOpportunityProposals as defaultGetProposals,
} from "@/lib/opportunities/opportunity-detail.data";
import { responsavelDaOportunidade } from "@/lib/opportunities/responsavel";
import { getTeam as defaultGetTeam } from "@/lib/opportunities/team.data";
import type { OpportunityTeam } from "@/lib/opportunities/team.types";
import type {
  OpportunityDetail,
  OpportunityProposal,
} from "@/lib/opportunities/types";
import { statusPropostaExibido } from "@/lib/opportunities/status-proposta-exibido";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = "loading" | "loaded" | "error";

type Props = {
  opportunityId: string;
  /**
   * When provided, loads proposal-specific data (status pill, code, finalidade
   * in H1) alongside the opportunity header. Omit on pages where no persisted
   * proposal is available yet (the "nova proposta" flow uses its own
   * inline header).
   */
  proposalId?: string;
  /** Injectable for tests; defaults to the real BFF API call. */
  load?: (id: string) => Promise<OpportunityDetail>;
  /**
   * Injectable for tests; defaults to the real BFF API call. The opportunity
   * detail projection doesn't carry a populated `owner`/`ownerRole` yet (F2
   * gap) — "Responsável" is sourced from the LT principal of the opportunity
   * team instead, which is real end-to-end.
   */
  getTeam?: (id: string) => Promise<OpportunityTeam>;
  /** Injectable for tests; only called when `proposalId` is provided. */
  getProposals?: (
    id: string,
    options?: { incluirNaoEleitas?: boolean },
  ) => Promise<OpportunityProposal[]>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/*
 * A COR continua vindo do status de máquina da proposta, não da fase: o único
 * veredito que ela carrega é `DEVOLVIDA` (danger). O TEXTO é derivado da fase
 * (`statusPropostaExibido`) — pintar por fase transformaria "Em minuta" em
 * semáforo sem que nada ali seja aprovação ou falha.
 */
const PROPOSAL_STATUS_PILL_VARIANT: Record<string, PillVariant> = {
  EM_PREENCHIMENTO: "warning",
  EM_ANALISE: "info",
  DEVOLVIDA: "danger",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="mt-0.5 text-(length:--t-caption) font-bold">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProposalOpportunityHeader
// ---------------------------------------------------------------------------

/**
 * Displays the full head card for proposal pages (`03-proposta-ciclo1.html:127-145`):
 * status pills (opportunity type / proposal status / proposal code), H1
 * ("Proposta · [type] · [title] · [finalidade]"), sub-line (opportunity
 * reference), back link, and meta grid (Responsável / Cliente / Oportunidade
 * / Tipo de proposta).
 *
 * When `proposalId` is provided, the header additionally loads and shows the
 * proposal's status pill, display code and finalidade. The proposal data is
 * sourced from the opportunity proposals list (`getProposals`), eliminating
 * one of the formerly-duplicate `GET /api/proposals/:id` calls (VBR-548 CA-5).
 *
 * Per CA-4, an unavailable Salesforce must NOT block the proposal page from
 * rendering: a failed opportunity load emits a visible error faixa (so the
 * user knows something is missing) instead of silently omitting the whole
 * header. The error path keeps the page's detail blocks accessible.
 *
 * @example
 * <ProposalOpportunityHeader opportunityId={id} proposalId={proposalId} />
 */
export function ProposalOpportunityHeader({
  opportunityId,
  proposalId,
  load = defaultLoad,
  getTeam = defaultGetTeam,
  getProposals = defaultGetProposals,
}: Props) {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(
    null,
  );
  const [team, setTeam] = useState<OpportunityTeam | null>(null);
  const [proposalMeta, setProposalMeta] = useState<OpportunityProposal | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    // Kick off all fetches in parallel; core and proposal groups are separate
    // so that TypeScript can resolve types cleanly.
    const oppPromise = load(opportunityId);
    const teamPromise = getTeam(opportunityId);
    /*
     * `incluirNaoEleitas`: a partir da análise a listagem devolve só as eleitas
     * (RN-F2-04), e é dela que sai o metadado da proposta ABERTA — sem pedir as
     * não eleitas, abrir uma proposta descartada renderizaria o cabeçalho sem
     * pill e sem título. Quem pode vê-las continua sendo decisão do backend, que
     * ignora o parâmetro para perfil sem autoridade de composição.
     */
    const proposalsPromise = proposalId
      ? getProposals(opportunityId, { incluirNaoEleitas: true })
      : null;

    void (async () => {
      const [oppResult, teamResult] = await Promise.allSettled([
        oppPromise,
        teamPromise,
      ]);

      if (cancelled) return;

      if (oppResult.status === "rejected") {
        setStatus("error");
        return;
      }

      let proposalMetaData: OpportunityProposal | null = null;

      if (proposalsPromise) {
        const psResult = await Promise.allSettled([proposalsPromise]);
        if (cancelled) return;

        if (psResult[0].status === "fulfilled" && proposalId) {
          proposalMetaData =
            psResult[0].value.find((p) => p.id === proposalId) ?? null;
        }
      }

      setOpportunity(oppResult.value);
      setTeam(teamResult.status === "fulfilled" ? teamResult.value : null);
      setProposalMeta(proposalMetaData);
      setStatus("loaded");
    })();

    return () => {
      cancelled = true;
    };
  }, [opportunityId, proposalId, load, getTeam, getProposals]);

  // CA-4: while loading, render nothing so the blocks below are not blocked.
  if (status === "loading") {
    return null;
  }

  // CA-4: on error, emit a visible faixa so the user knows the header failed
  // to load. The faixa does NOT name a cause: this fetch can fail because the
  // API is down, the DB is down or the CRM is down, and naming Salesforce
  // would send the reader after the wrong team whenever it is one of the other
  // two (measured with the API stopped — the faixa still blamed Salesforce).
  // The detail blocks still render below.
  if (status === "error" || !opportunity) {
    return (
      <div
        data-testid="proposal-opportunity-header-error"
        className="mb-2 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-4 text-(length:--t-caption) text-(--color-text-muted)"
      >
        Não foi possível carregar as informações da oportunidade. Os detalhes da
        proposta abaixo permanecem acessíveis.
      </div>
    );
  }

  /*
   * O `· LT` era um literal FIXO aqui. Criar oportunidade é aberto a seis
   * perfis, então uma criada pela SNEG lia "Fulana · LT" — rótulo plausível e
   * indistinguível de um correto. O qualificador agora sai do perfil da pessoa,
   * pelo mesmo helper que o chip da equipe usa.
   */
  const responsavel = responsavelDaOportunidade(team?.members) ?? "—";

  /*
   * H1 = "Proposta · [opportunity.type] · [proposal.title]", where
   * `proposalMeta.title` is already "<finalidade> · <tipo de contrato>"
   * (`mapProposalListItem`).
   *
   * The finalidade was ALSO appended as its own segment, so the heading read
   * "Proposta · Contratação · Vinculação · CPCVM Volume · Vinculação" — the
   * same word twice in one line. It is appended only when there is no
   * `proposalMeta.title` to carry it (proposal list unavailable).
   */
  const h1Segments = ["Proposta"];
  if (opportunity.type) h1Segments.push(opportunity.type);
  // `proposalMeta.title` is already "<finalidade> · <tipo de contrato>"
  // (`mapProposalListItem`). When the proposals list did not load, the
  // segment is simply omitted — no fabricated fallback.
  if (proposalMeta?.title) {
    h1Segments.push(proposalMeta.title);
  }

  const oportunidadeLabel = [opportunity.code, opportunity.title]
    .filter(Boolean)
    .join(" · ");

  const tipoProposta = ["PCR", opportunity.type].filter(Boolean).join(" · ");

  // `proposalMeta.status` comes from the proposals list — same source the
  // former `getProposal` call used, eliminating one of the six duplicate
  // GET /api/proposals/:id fetches (VBR-548 CA-5).
  const proposalStatus = proposalMeta?.status;
  /*
   * A pill acompanha a FASE da oportunidade, não o status parado da proposta.
   * `ProposalStatus` tem três membros e o ciclo termina na análise: `EM_ANALISE`
   * é o último estado que a proposta chega a ter, então esta pill dizia
   * "Em análise" numa oportunidade já em minuta — e seguiria dizendo até a
   * conclusão, contradizendo a tela de onde o usuário acabou de clicar.
   * `aprovacao-view` e `contrato-view` já derivavam; este cabeçalho, a terceira
   * superfície que lista o status de uma proposta, ficou para trás.
   *
   * `etapa` não é passada porque o detalhe da oportunidade não a carrega — sem
   * ela `EM_PAGAMENTO` cai no passo ANTERIOR ("Cadastro / Ativação"), que é a
   * degradação deliberada de `opportunityPhaseIndex`: nunca afirmar uma fase
   * adiante da realidade.
   */
  const proposalStatusLabel = proposalStatus
    ? statusPropostaExibido(proposalStatus, {
        backendState: opportunity.backendState,
        status: opportunity.status,
      })
    : undefined;
  const proposalCode = proposalMeta?.code;

  return (
    <div
      data-testid="proposal-opportunity-header"
      className="mt-2 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-5"
    >
      {/* Top row: pills + H1 + sub-line on the left; back link on the right */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Status pills: opportunity type / proposal status / proposal code */}
          <div className="flex flex-wrap items-center gap-2">
            {opportunity.type && (
              <StatusPill variant="neutral">
                {opportunity.type.toUpperCase()}
              </StatusPill>
            )}
            {proposalStatus && (
              <StatusPill
                variant={
                  PROPOSAL_STATUS_PILL_VARIANT[proposalStatus] ?? "neutral"
                }
              >
                {proposalStatusLabel}
              </StatusPill>
            )}
            {proposalCode && (
              <span className="text-[12px] text-(--color-text-muted)">
                {proposalCode}
              </span>
            )}
          </div>

          {/* H1 */}
          <h1 className="mb-0.5 mt-1.5 text-(length:--t-h2) font-bold tracking-[-0.6px]">
            {h1Segments.join(" · ")}
          </h1>

          {/* Sub-line: opportunity reference */}
          <p className="text-(length:--t-caption) text-(--color-text-muted)">
            Oportunidade{" "}
            <strong className="text-(--neutral-900)">{opportunity.code}</strong>
            {opportunity.title && <> · {opportunity.title}</>}
          </p>
        </div>

        {/* Back link */}
        <Link
          href={`/oportunidades/${opportunityId}`}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-3 py-1.5 text-(length:--t-caption) font-bold text-(--secondary-600) hover:bg-(--neutral-40)"
        >
          ← Oportunidade
        </Link>
      </div>

      {/* Meta grid */}
      <div className="mt-4 flex flex-wrap gap-9 border-t border-(--color-border) pt-4">
        <MetaField label="Responsável" value={responsavel} />
        <MetaField label="Cliente" value={opportunity.clientName} />
        <MetaField label="Oportunidade" value={oportunidadeLabel || "—"} />
        <MetaField label="Tipo de proposta" value={tipoProposta} />
      </div>
    </div>
  );
}
