"use client";

import { useEffect, useState } from "react";
import {
  CardCollapseToggle,
  useCardCollapse,
} from "@/components/proposals/card-collapse";

import { AnalysisWindowModal } from "@/components/proposals/analysis-window-modal";
import { BlocoAjusteAction } from "@/components/proposals/proposal-view-mode";
import { usePermissions } from "@/hooks/use-permissions";
import { Permission } from "@/lib/auth-permissions";
import { janelaAnaliseEditavel } from "@/lib/proposals/janela-analise";
import { BlocoProposta } from "@/lib/proposals/ajuste";
import { prazoContratoLabel } from "@/lib/proposals/contract-term";
import {
  getProposal as defaultGetProposal,
  updateProposalAnalysisWindow as defaultUpdateAnalysisWindow,
} from "@/lib/proposals/proposal.data";
import { withOneRetry } from "@/lib/with-retry";
import type { ProposalSummary } from "@/lib/proposals/proposal.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  proposalId: string;
  /**
   * Proposal summary provided by the parent (`ProposalDetailPanel`) as part of
   * the shared single-fetch pattern (CA-5 / VBR-548). When present, no
   * additional `GET /api/proposals/:id` call is made — the block renders from
   * this value directly.
   *
   * When absent (e.g. in isolated tests that inject `getProposal`), the block
   * falls back to fetching the proposal itself.
   */
  proposalSummary?: ProposalSummary | null;
  /** Injectable for tests; only used when `proposalSummary` is not passed. */
  getProposal?: (id: string) => Promise<ProposalSummary>;
  /**
   * Chamado com a proposta já atualizada depois de uma correção do período,
   * para o pai (`ProposalDetailPanel`) substituir o estado compartilhado — sem
   * isso os demais blocos, que recebem o MESMO objeto, seguiriam com a janela
   * antiga até um reload.
   */
  onProposalUpdated?: (proposal: ProposalSummary) => void;
  /** Injectable for tests. */
  updateAnalysisWindow?: typeof defaultUpdateAnalysisWindow;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FINALIDADE_LABEL: Record<string, string> = {
  VINCULACAO: "Vinculação",
  IMPLANTACAO: "Implantação",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[12px] uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div
        className="mt-0.5 text-(length:--t-caption) font-bold truncate"
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProposalDataBlock
// ---------------------------------------------------------------------------

/**
 * Read-only "Dados da proposta" block for the proposal detail page
 * (`03-proposta-ciclo1.html:150-156`).
 *
 * In production, receives `proposalSummary` from `ProposalDetailPanel` — no
 * additional fetch is made (CA-5). When `proposalSummary` is not provided
 * (isolated tests), falls back to `getProposal` with a single auto-retry.
 *
 * On error, shows an alert matching the pattern of `ProposalIndicatorsBlock`
 * (CA-6): border-red-300 + retry button (VBR-548).
 */
export function ProposalDataBlock({
  proposalId,
  proposalSummary,
  getProposal = defaultGetProposal,
  onProposalUpdated,
  updateAnalysisWindow = defaultUpdateAnalysisWindow,
}: Props) {
  const { can, canWrite } = usePermissions();
  const [modalAberto, setModalAberto] = useState(false);
  // Only used in fallback mode (no proposalSummary prop).
  const [fetchedProposal, setFetchedProposal] =
    useState<ProposalSummary | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [retryCount, setRetryCount] = useState(0);

  // If a proposalSummary was provided by the parent, skip fetching entirely.
  const isManagedByParent = proposalSummary !== undefined;

  useEffect(() => {
    if (isManagedByParent) return;

    let cancelled = false;
    setLoadStatus("loading");

    withOneRetry(() => getProposal(proposalId))
      .then((p) => {
        if (cancelled) return;
        setFetchedProposal(p);
        setLoadStatus("loaded");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [proposalId, getProposal, isManagedByParent, retryCount]);

  // Resolve the data source: parent-provided or self-fetched.
  const data: ProposalSummary | null = isManagedByParent
    ? (proposalSummary ?? null)
    : fetchedProposal;
  const effectiveLoadStatus: "loading" | "loaded" | "error" = isManagedByParent
    ? "loaded"
    : loadStatus;

  const fields: { label: string; value: string }[] = data
    ? [
        { label: "Tipo de proposta", value: "PCR (Revendedor)" },
        {
          label: "Finalidade",
          value: FINALIDADE_LABEL[data.finalidade] ?? data.finalidade,
        },
        {
          // Campo 4 do modal "Dados da proposta" no protótipo — e, desde
          // 24/08/2026, a resposta que governa a Adesão ao PIM no Salesforce
          // (o PIM É este programa). Esconder o dado que decide o gate da
          // alçada seria o defeito. Medida neutra, nunca pill.
          //
          // `undefined` ⇒ `—`, NUNCA "Não": ausência do campo no payload não é
          // uma resposta.
          label: "Programa Acelera+",
          value:
            data.aceleraMais === undefined
              ? "—"
              : data.aceleraMais
                ? "Sim"
                : "Não",
        },
        { label: "Início da análise", value: fmtDate(data.dataInicioAnalise) },
        { label: "Fim da análise", value: fmtDate(data.dataFimAnalise) },
        {
          /*
           * O prazo do contrato, pedido pelo negócio em 08/09/2026: o card
           * mostrava as duas pontas da janela e não o prazo que elas produzem,
           * então quem analisa tinha de contar os meses de cabeça — e a conta
           * não é uma subtração (ver `prazoContratoLabel`).
           *
           * Fica DEPOIS das duas datas de propósito: é o que elas derivam, e
           * lê-lo antes das pontas obrigaria o leitor a procurar a origem do
           * número. Medida neutra, nunca pill.
           */
          label: "Prazo do contrato",
          value: prazoContratoLabel(data.prazoContratoMeses),
        },
      ]
    : [];

  /*
   * ADO — "o LT colocou a data errada e quer realizar a alteração do período,
   * não consta o campo para editar". O card é somente leitura por desenho; o
   * que faltava era a porta para corrigir o período, e ela tem TRÊS condições
   * independentes:
   *
   *  - perfil (`ProposalAnalysisWindowEdit`, espelho do `@Roles` da rota) e
   *    `canWrite`, que é o gate dos perfis somente-leitura;
   *  - janela (`janelaAnaliseEditavel`) — depois do envio para aprovação o
   *    período é somente leitura, e é exatamente o que o negócio pediu;
   *  - dados carregados, porque o modal abre com o período atual preenchido.
   *
   * Esconder o CTA nunca esconde o FATO: as duas datas continuam na grade para
   * todo mundo, em qualquer status — quem não pode corrigir ainda precisa ler o
   * período para saber por que a proposta está como está.
   */
  const podeEditarJanela =
    canWrite &&
    can(Permission.ProposalAnalysisWindowEdit) &&
    janelaAnaliseEditavel(data?.status) &&
    Boolean(data?.dataInicioAnalise && data?.dataFimAnalise);

  async function handleSalvarJanela(janela: {
    dataInicioAnalise: string;
    dataFimAnalise: string;
  }): Promise<void> {
    const atualizada = await updateAnalysisWindow(proposalId, janela);
    // Quando o bloco se auto-busca (modo isolado), ele é o dono do estado;
    // quando o pai manda o resumo, quem substitui é o pai. Atualizar os dois
    // mantém o card correto nos dois modos sem uma releitura.
    setFetchedProposal(atualizada);
    onProposalUpdated?.(atualizada);
    setModalAberto(false);
  }

  // Prototype: every `.block` card collapses from its own header (ciclo1.js
  // `initCollapse`), starting expanded.
  const collapse = useCardCollapse();
  return (
    <section
      aria-labelledby="proposal-data-title"
      {...collapse.sectionProps}
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      <div {...collapse.headProps} className="mb-3.5 flex items-center gap-2.5">
        <h3 id="proposal-data-title" className="text-(length:--t-h4) font-bold">
          Dados da proposta
        </h3>
        <BlocoAjusteAction bloco={BlocoProposta.Dados} />
        <CardCollapseToggle {...collapse.toggleProps} />
      </div>

      {effectiveLoadStatus === "loading" && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="flex items-center gap-2 py-2 text-(length:--t-caption) text-(--color-text-muted)"
        >
          <span
            aria-hidden="true"
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--secondary-500) border-t-transparent"
          />
          Carregando dados da proposta…
        </div>
      )}

      {effectiveLoadStatus === "error" && (
        <div
          role="alert"
          data-testid="proposal-data-load-error"
          className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-3 py-2.5 text-(length:--t-caption) text-(--red-700)"
        >
          Falha ao carregar os dados da proposta. Verifique sua conexão e tente
          novamente.
          <button
            type="button"
            onClick={() => setRetryCount((n) => n + 1)}
            className="ml-2 cursor-pointer font-bold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {effectiveLoadStatus === "loaded" && data && (
        <div
          data-testid="proposal-data-summary"
          className="grid grid-cols-1 min-[601px]:grid-cols-2 gap-x-6 gap-y-3"
        >
          {fields.map(({ label, value }) => (
            <SummaryField key={label} label={label} value={value} />
          ))}
        </div>
      )}

      {/*
       * O `.addrow` do protótipo: grade somente-leitura + botão no RODAPÉ que
       * abre a modal correspondente. É como toda a plataforma edita os dados de
       * um card — o irmão logo abaixo ("+ Cadastrar situação do posto e
       * imóvel") usa exatamente esta forma, e `AddRowButton` a repete nos cards
       * de franquia. No header ele lia como um link colado ao título, que é
       * outro tipo de elemento (ali moram o "Solicitar ajuste" da análise e o
       * chevron de colapso).
       *
       * As classes acompanham o IRMÃO desta tela (`posto-situation-block`), não
       * o `AddRowButton` de `franquia-ui` — importá-lo acoplaria o bloco de
       * posto ao módulo de franquia por causa de um botão.
       */}
      {effectiveLoadStatus === "loaded" && podeEditarJanela && (
        <button
          type="button"
          data-testid="editar-periodo-analise"
          onClick={() => setModalAberto(true)}
          className="mt-3.5 rounded-[var(--radius-xxs)] border border-(--secondary-600) bg-(--neutral-40) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-600) transition hover:bg-(--neutral-100)"
        >
          Editar período da análise
        </button>
      )}

      {modalAberto && data?.dataInicioAnalise && data?.dataFimAnalise && (
        <AnalysisWindowModal
          dataInicioAnalise={data.dataInicioAnalise}
          dataFimAnalise={data.dataFimAnalise}
          onSave={handleSalvarJanela}
          onClose={() => setModalAberto(false)}
        />
      )}
    </section>
  );
}
