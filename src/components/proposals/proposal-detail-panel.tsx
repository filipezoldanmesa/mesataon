"use client";

import { useCallback, useEffect, useState } from "react";

import { SolicitarAjusteDialog } from "@/components/franquia/solicitar-ajuste-dialog";
import { FinancialItemsBlock } from "@/components/proposals/financial-items-block";
import { FinancialResourcesBlock } from "@/components/proposals/financial-resources-block";
import { InvestmentsBlock } from "@/components/proposals/investments-block";
import { TableauLinkCard } from "@/components/proposals/tableau-link-card";
import { PostoSituationBlock } from "@/components/proposals/posto-situation-block";
import { ProductLinesBlock } from "@/components/proposals/product-lines-block";
import { ProposalAutoCalcBlock } from "@/components/proposals/proposal-auto-calc-block";
import { ProposalDataBlock } from "@/components/proposals/proposal-data-block";
import { ProposalIndicatorsBlock } from "@/components/proposals/proposal-indicators-block";
import {
  ProposalViewModeProvider,
  type ProposalViewMode,
} from "@/components/proposals/proposal-view-mode";
import { ToastContainer, useToast } from "@/components/toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Permission } from "@/lib/auth-permissions";
import { HttpError, isExpiredSessionError } from "@/lib/api-errors";
import { redirectToLogin } from "@/lib/auth";
import {
  BLOCO_PROPOSTA_LABEL,
  type BlocoProposta,
} from "@/lib/proposals/ajuste";
import {
  solicitarAjusteBloco as defaultSolicitarAjuste,
  SolicitarAjusteValidationError,
} from "@/lib/proposals/ajuste.data";
import {
  getProposal as defaultGetProposal,
  reenviarProposal as defaultReenviarProposal,
} from "@/lib/proposals/proposal.data";
import type { ProposalSummary } from "@/lib/proposals/proposal.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProposalLoadError = "not-found" | "unavailable";

/**
 * Renders all proposal detail blocks in the official prototype layout
 * (`03-proposta-ciclo1.html`):
 *
 *  Left column (main blocks, prototype order F3→F4→F5→F5→F6→F9):
 *   - Dados da proposta              :150-156
 *   - Situação do posto e imóvel     :158-167  / modal :306-351
 *   - Inteligência de mercado / VMM  :169-189
 *   - Produtos e simulação comercial :191-208  / modal :277-304
 *   - Recursos financeiros           :210-225  / modal :353-381
 *   - Receitas e Despesas            :227-237  / modal :418-448
 *
 *  Right column (sticky sidebar):
 *   - Painel ao vivo (F7 indicators) :246-265
 *   - Cálculos automáticos           :267-273
 *
 * Used inline on the opportunity detail screen so that no split navigation to
 * a separate route is required.
 *
 * ## Single `GET /api/proposals/:id` per load (CA-5 / VBR-548)
 *
 * `getProposal` is called ONCE here and the result is passed down to every
 * block that needs it (`ProposalDataBlock`, `PostoSituationBlock`,
 * `ProductLinesBlock`, `FinancialResourcesBlock`). Individual blocks no longer
 * fetch this endpoint — they consume the `proposalSummary` prop instead.
 *
 * ## Error handling (CA-2 / CA-3 / VBR-548)
 *
 * Rather than six blocks showing identical red boxes, the panel shows one
 * verdict: 401 → login redirect; 404 → "not found"; 5xx/network → one alert
 * with a single retry that re-fetches and re-renders all blocks.
 *
 * ## Analysis (read-only) layer — prototype `03-proposta-analise.html`
 *
 * Resolved by the AUDIENCE and the PHASE, never by a query string (the
 * prototype's `analise-proposta.js` reads `?role=` only because a static page
 * has no session — same reasoning as `AnaliseView`, ADR-0018) — e os dois
 * vereditos de fase vêm do BACKEND, não de uma leitura do status aqui:
 *
 * - `editavel: false` ⇒ every edit CTA hidden, for the LT too;
 * - `analiseEmCurso` + `Permission.SnegAnalysis` ⇒ per-block "Solicitar ajuste"
 *   (opens or reuses a pendência to the LT — RN-F3-01/F2-03) plus the context
 *   banner naming the mode.
 *
 * ⚠️ Os dois eram `status === "EM_ANALISE"` até 10/09/2026, e o status ERRA nos
 * dois sentidos: ele nunca sai de `EM_ANALISE` quando a oportunidade avança
 * (então o analista seguia com "Solicitar ajuste" e o LT lia "em análise pela
 * SNEG" com a oportunidade em minuta), e uma proposta criada já em fase
 * posterior nasce `EM_PREENCHIMENTO` (então a tela inteira abria editável ali).
 * Quem cruza status × estado da oportunidade é o backend, que agora também
 * recusa a escrita com 400 (`assertFaseEditavel`).
 *
 * Veredito ausente ⇒ somente-leitura e sem afordância de análise: nenhuma ação
 * é oferecida sobre uma proposta cuja fase não se conseguiu ler.
 */
export function ProposalDetailPanel({
  proposalId,
  opportunityId,
  getProposal = defaultGetProposal,
  solicitarAjuste = defaultSolicitarAjuste,
  reenviarProposal = defaultReenviarProposal,
}: {
  proposalId: string;
  /**
   * Oportunidade dona da proposta — repassada ao bloco de recursos financeiros
   * para a obra do Converge, cuja API é chaveada por oportunidade (ADR-0048).
   * Opcional: ausente, o seletor de obra fica desabilitado e nenhuma chamada ao
   * Converge acontece.
   */
  opportunityId?: string;
  /** Injectable for tests. */
  getProposal?: typeof defaultGetProposal;
  solicitarAjuste?: typeof defaultSolicitarAjuste;
  reenviarProposal?: typeof defaultReenviarProposal;
}) {
  const { can, canWrite, isLoading: permissionsLoading } = usePermissions();
  const toast = useToast();

  // ── Shared proposal fetch (CA-5) ──────────────────────────────────────────
  const [proposal, setProposal] = useState<ProposalSummary | null | undefined>(
    undefined,
  );
  const [proposalLoadError, setProposalLoadError] =
    useState<ProposalLoadError | null>(null);
  const [fetchTrigger, setFetchTrigger] = useState(0);

  // ── Reenviar à análise (HU-F2-03 — o LT corrige e reenvia) ───────────────
  const [reenviarBusy, setReenviarBusy] = useState(false);
  const [reenviarErro, setReenviarErro] = useState<string | null>(null);

  // ── Auto-calc refresh signal ──────────────────────────────────────────────
  const [autoCalcRefreshSignal, setAutoCalcRefreshSignal] = useState(0);
  /*
   * Em qual seção está a obra desta proposta (SH-02). O painel guarda os dois
   * lados porque o SH-03 troca o rótulo do botão nas DUAS seções, e nenhuma
   * delas enxerga a lista da outra.
   */
  const [obraEmRecursos, setObraEmRecursos] = useState(false);
  const [obraEmInvestimentos, setObraEmInvestimentos] = useState(false);
  /*
   * Sinais CRUZADOS de "a obra mudou na outra seção".
   *
   * ⚠️ São DOIS, cada bloco lendo o do vizinho — e não um só compartilhado.
   * Com um contador único, quem removeu a obra receberia o próprio bump e
   * releria uma lista que acabou de reler: duas requisições a mais por clique,
   * sem nada novo para mostrar. É a mesma simetria de
   * `temObraNaOutraSecao`/`onObraPresenteChange`, que já cruza as duas seções.
   */
  const [obraSignalParaRecursos, setObraSignalParaRecursos] = useState(0);
  const [obraSignalParaInvestimentos, setObraSignalParaInvestimentos] =
    useState(0);

  // ── "Solicitar ajuste" per block (SNEG) ──────────────────────────────────
  const [blocoEmAjuste, setBlocoEmAjuste] = useState<BlocoProposta | null>(
    null,
  );
  const [ajusteBusy, setAjusteBusy] = useState(false);
  const [ajusteErro, setAjusteErro] = useState<string | null>(null);
  const [blocosSolicitados, setBlocosSolicitados] = useState<
    Set<BlocoProposta>
  >(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setProposalLoadError(null);

    getProposal(proposalId)
      .then((loaded) => {
        if (!cancelled) setProposal(loaded);
      })
      .catch((err: unknown) => {
        if (cancelled) return;

        // 401 — session expired. Redirect to login so the user is not stuck on
        // N "Tentar novamente" buttons that will never converge (CA-3 / VBR-548).
        //
        // Through `redirectToLogin`, never a bare assignment to
        // `window.location`: the dead cookie has to be cleared first, or the
        // middleware sees a session-looking cookie and bounces the user off
        // /login — a redirect loop (VBR-489). It also drops the cached profile
        // and tells the other tabs (VBR-540).
        if (isExpiredSessionError(err)) {
          redirectToLogin();
          return;
        }

        // 404 — proposal does not exist (wrong URL or was deleted).
        if (err instanceof HttpError && err.status === 404) {
          setProposalLoadError("not-found");
          return;
        }

        // 5xx / network / anything else: transient; the user can retry.
        setProposalLoadError("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [getProposal, proposalId, fetchTrigger]);

  const handleReenviar = useCallback(async () => {
    // Read-only profiles: the API answers 403, and the guard lives here too
    // because the click path is not the only way in.
    if (!canWrite) return;
    setReenviarBusy(true);
    setReenviarErro(null);
    try {
      setProposal(await reenviarProposal(proposalId));
      toast.addToast("Proposta reenviada à análise da SNEG.", "success");
    } catch (err) {
      // Show the backend's reason ("Proposta não está devolvida") rather than a
      // generic failure — it is the only thing that tells the LT what to do.
      setReenviarErro(
        err instanceof Error ? err.message : "Falha ao reenviar a proposta.",
      );
    } finally {
      setReenviarBusy(false);
    }
  }, [canWrite, reenviarProposal, proposalId, toast]);

  const abrirAjuste = useCallback((bloco: BlocoProposta) => {
    setAjusteErro(null);
    setBlocoEmAjuste(bloco);
  }, []);

  const enviarAjuste = useCallback(
    async (comentario: string) => {
      if (blocoEmAjuste === null) return;
      setAjusteBusy(true);
      setAjusteErro(null);
      try {
        const result = await solicitarAjuste(
          proposalId,
          blocoEmAjuste,
          comentario,
        );
        setBlocosSolicitados((prev) => new Set(prev).add(blocoEmAjuste));
        setBlocoEmAjuste(null);
        toast.addToast(
          `Ajuste solicitado ao LT em "${BLOCO_PROPOSTA_LABEL[blocoEmAjuste]}" — pendência ${result.pendenciaCode ?? "criada"}.`,
          "success",
        );
      } catch (err) {
        // The dialog stays open with the text intact: the analyst's sentence is
        // the whole payload, and closing on failure would discard it.
        setAjusteErro(
          err instanceof SolicitarAjusteValidationError || err instanceof Error
            ? err.message
            : "Falha ao solicitar o ajuste.",
        );
      } finally {
        setAjusteBusy(false);
      }
    },
    [blocoEmAjuste, solicitarAjuste, proposalId, toast],
  );

  // ── Page-level error verdict (CA-2 / VBR-548) ─────────────────────────────
  //
  // When the single shared `getProposal` fetch fails, all blocks would fail
  // independently with the same root cause. Instead of N identical red boxes,
  // we render ONE verdict: either "not found" or "unavailable / retry".
  //
  if (proposalLoadError === "not-found") {
    return (
      <div
        role="alert"
        data-testid="proposal-load-not-found"
        className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-8 text-center"
      >
        <p className="text-(length:--t-caption) font-bold text-(--neutral-700)">
          Proposta não encontrada.
        </p>
        <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
          Verifique o endereço ou volte à oportunidade e selecione uma proposta
          existente.
        </p>
      </div>
    );
  }

  if (proposalLoadError === "unavailable") {
    return (
      <div
        role="alert"
        data-testid="proposal-load-error"
        className="rounded-[var(--radius-xs)] border border-(--red-300) bg-(--red-100) px-4 py-3 text-(length:--t-caption) text-(--red-700)"
      >
        Não foi possível carregar a proposta. Verifique sua conexão e tente
        novamente.
        <button
          type="button"
          onClick={() => setFetchTrigger((n) => n + 1)}
          className="ml-2 cursor-pointer font-bold underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  /*
   * Wait for the shared fetch before rendering the blocks (CA-5).
   *
   * The blocks decide whether the parent manages the proposal by testing
   * `proposalSummary !== undefined`. Rendering them while this fetch is still
   * in flight makes every one of them read `undefined`, conclude nobody is
   * managing it, and fetch `GET /api/proposals/:id` for itself — five
   * duplicate round-trips per page load, measured on this screen. Holding the
   * tree back for one request (150–1100ms locally) is what makes the single
   * fetch actually single.
   */
  if (proposal === undefined) {
    return (
      <div
        role="status"
        data-testid="proposal-loading"
        className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-8 text-center text-(length:--t-caption) text-(--color-text-muted)"
      >
        Carregando proposta…
      </div>
    );
  }

  const devolvida = proposal?.status === "DEVOLVIDA";
  /*
   * Somente-leitura é veredito do BACKEND (`editavel`), não uma segunda leitura
   * do status aqui. O status sozinho errava nos dois sentidos desde que a
   * oportunidade passou a avançar sem mexer na proposta: ele nunca sai de
   * `EM_ANALISE`, e a proposta criada já em fase posterior nasce
   * `EM_PREENCHIMENTO` — abrindo a tela inteira para edição dentro de uma
   * oportunidade em minuta, que é o que o backend agora recusa com 400.
   *
   * Ausente ⇒ somente leitura: prometer edição por desconhecimento é a
   * divergência tela × gate.
   */
  const somenteLeitura = proposal?.editavel !== true;
  /*
   * A análise ACONTECENDO — também do backend. Antes era `emAnalise`, e como o
   * status fica congelado, o analista seguia com "Solicitar ajuste" (que abre
   * pendência ao LT) e o LT seguia lendo "proposta em análise pela SNEG" com a
   * oportunidade já em aprovação, minuta ou assinatura.
   */
  const analiseEmCurso = proposal?.analiseEmCurso === true;
  /*
   * Veredito do backend — ausente ⇒ `false`, nunca oferecer por desconhecimento.
   * Ver `ProposalSummary.reenvioHabilitado`.
   */
  const podeReenviar = proposal?.reenvioHabilitado === true;
  const modoAnalista =
    analiseEmCurso && !permissionsLoading && can(Permission.SnegAnalysis);

  const mode: ProposalViewMode = {
    readOnly: somenteLeitura,
    analise: modoAnalista
      ? { blocosSolicitados, onSolicitarAjuste: abrirAjuste }
      : null,
  };

  return (
    <ProposalViewModeProvider value={mode}>
      {/*
        Proposta devolvida — o que a SNEG pediu, e a ação de reenviar.

        Sem isto o LT clicava em "Corrigir e reenviar →" e caía numa tela que
        não dizia o pedido nem oferecia como devolvê-la à análise. O motivo vem
        do backend (`motivoDevolucao`), não do ticket de pendência.

        Cores do `.recall-banner` do protótipo (azul/info): a devolução é
        informação de fluxo, não falha do sistema.
      */}
      {devolvida && (
        <div
          data-testid="proposta-devolvida-banner"
          className="mb-4 rounded-[var(--radius-xs)] border border-(--blue-200) bg-(--blue-100) px-3.5 py-3 text-(length:--t-caption) text-(--blue-800)"
        >
          <b>Proposta devolvida pela SNEG.</b>{" "}
          {proposal?.motivoDevolucao ? (
            <>
              Motivo:{" "}
              <span className="whitespace-pre-line">
                {proposal.motivoDevolucao}
              </span>
            </>
          ) : (
            "Nenhum motivo foi registrado."
          )}
          {/*
            ⚠️ A instrução MUDOU em 28/08/2026, e a anterior ficou falsa nas
            duas metades: devolver uma proposta agora devolve a OPORTUNIDADE ao
            preenchimento, então não há "reenviar a proposta" e as demais NÃO
            seguem em análise — elas voltam junto e estão editáveis.

            O veredito é do backend (`reenvioHabilitado`), nunca uma segunda
            leitura da regra aqui: ele espelha exatamente as recusas de
            `ProposalsService.reenviar`.
          */}
          <div className="mt-1 text-(--color-text-muted)">
            {podeReenviar
              ? "Corrija os pontos apontados e reenvie para a análise."
              : "Corrija os pontos apontados e envie a oportunidade para análise — " +
                "as demais propostas voltaram para preenchimento e são reenviadas junto."}
          </div>
          {reenviarErro && (
            <p role="alert" className="mt-2 font-bold text-(--color-danger)">
              {reenviarErro}
            </p>
          )}
          {/*
            Sem CTA quando o backend recusaria: um botão cuja única resposta é
            400 é controle morto, e a frase acima já nomeia o conserto — que
            fica na barra fixa da oportunidade, não aqui.
          */}
          {canWrite && podeReenviar && (
            <button
              type="button"
              data-testid="proposta-reenviar"
              onClick={() => void handleReenviar()}
              disabled={reenviarBusy}
              className="mt-3 rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-4 py-2 text-[13px] font-bold text-white transition hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reenviarBusy ? "Reenviando…" : "Reenviar para análise"}
            </button>
          )}
        </div>
      )}

      {/* Context banner — prototype `.an-banner` (analise-proposta.js).
          Só enquanto a análise ACONTECE: depois dela a proposta continua
          somente-leitura, mas por já ter passado da fase — não por estar "em
          análise pela SNEG", que era o que a faixa afirmava em minuta. */}
      {analiseEmCurso && (
        <div
          className="mb-4 rounded-[var(--radius-xs)] border border-(--secondary-200) bg-(--secondary-100) px-3.5 py-2.5 text-(length:--t-caption) font-bold text-(--secondary-600)"
          data-testid="proposta-analise-banner"
        >
          {modoAnalista
            ? 'Visão da análise (SNEG) — proposta em somente-leitura para o LT. Use "Solicitar ajuste" em cada bloco para pedir correção (gera pendência ao LT).'
            : "Somente-leitura — oportunidade em análise pela SNEG. Você será notificado se houver pendência ou devolução para correção."}
        </div>
      )}

      {/* Same inline-style trap the nova-proposta mega-screen had: an inline
          `gridTemplateColumns` cannot be overridden by a media query, so the
          330px panel column survived at every width and the page scrolled
          sideways — which drags the content out from under every `fixed` modal
          overlay on it. Collapses at 920px, matching the sibling mega-screens. */}
      <div className="grid grid-cols-[1fr_330px] items-start gap-6 max-[920px]:grid-cols-1">
        {/* ── Left column: main proposal blocks ── */}
        <div className="flex flex-col gap-4">
          {/* F3 — Dados da proposta (read-only view of the saved proposal data).
              `proposalSummary` is the shared fetch result — no separate call (CA-5). */}
          <ProposalDataBlock
            proposalId={proposalId}
            proposalSummary={proposal}
            /* A correção do período devolve a proposta atualizada; substituir o
               estado compartilhado aqui é o que mantém os blocos irmãos (que
               recebem o MESMO objeto) falando da mesma janela. */
            onProposalUpdated={setProposal}
          />

          {/* F4 — Situação do posto e do imóvel.
              `proposalSummary` passes `finalidade` for the dependent picklist (CA-5). */}
          <PostoSituationBlock
            proposalId={proposalId}
            proposalSummary={proposal}
          />

          {/* F5 — Tableau VMM: minimal CTA card (no fetch); full block removed per VBR-503 */}
          <TableauLinkCard />

          {/* F5 — Produtos e simulação comercial.
              `proposalSummary` passes `dataFimAnalise` + `supplyCenterCode` (CA-5). */}
          <ProductLinesBlock
            proposalId={proposalId}
            opportunityId={opportunityId}
            proposalSummary={proposal}
            onLinesChanged={() => setAutoCalcRefreshSignal((n) => n + 1)}
          />

          {/* F6 — Recursos financeiros (verba BP / alerta ZFPJ).
              `proposalSummary` gates by `finalidade` (RN-F6-01) and provides the
              analysis period for dataLiberacao validation (CA-5). */}
          {/*
            SH-02/SH-03 — a obra é da PROPOSTA e gera itens de um tipo só. O
            painel cruza as duas seções porque nenhuma delas lê a lista da
            vizinha: sem isto, a de recursos ofereceria "+ Adicionar obra" numa
            proposta que já tem uma nos investimentos, e o backend recusaria
            com 422.
          */}
          <FinancialResourcesBlock
            proposalId={proposalId}
            opportunityId={opportunityId}
            proposalSummary={proposal}
            onResourcesChanged={() => setAutoCalcRefreshSignal((n) => n + 1)}
            temObraNaOutraSecao={obraEmInvestimentos}
            onObraPresenteChange={setObraEmRecursos}
            /*
             * Mexeu na obra AQUI ⇒ avisa os INVESTIMENTOS. O vínculo é da
             * PROPOSTA (`UNIQUE (proposal_id)`), então remover a obra de um
             * lado apaga a do outro — e sem o aviso a vizinha seguia exibindo
             * os cartões e o "Remover obra" de uma obra que não existe mais,
             * até um F5.
             */
            onObraChanged={() => {
              setAutoCalcRefreshSignal((n) => n + 1);
              setObraSignalParaInvestimentos((n) => n + 1);
            }}
            obraExternaSignal={obraSignalParaRecursos}
          />

          {/* Investimentos — o card fica entre Recursos financeiros e
              Receitas/Despesas, como o protótipo o insere.
              `onInvestmentsChanged` é obrigatório: o investimento viaja na
              estrutura `investimentos` do payload do ARP, então editá-lo muda a
              TIR e o backend marca a proposta como `desatualizado` — sem o bump
              o "Painel ao vivo" seguiria dizendo "Atualizado" até um reload.
              (O comentário anterior dizia que investimento não alimenta o ARP:
              nasceu caduco, no mesmo commit que o pôs no payload.) */}
          <InvestmentsBlock
            proposalId={proposalId}
            opportunityId={opportunityId}
            onInvestmentsChanged={() => setAutoCalcRefreshSignal((n) => n + 1)}
            temObraNaOutraSecao={obraEmRecursos}
            onObraPresenteChange={setObraEmInvestimentos}
            /* O par simétrico: mexeu aqui ⇒ avisa os RECURSOS FINANCEIROS. */
            onObraChanged={() => {
              setAutoCalcRefreshSignal((n) => n + 1);
              setObraSignalParaRecursos((n) => n + 1);
            }}
            obraExternaSignal={obraSignalParaInvestimentos}
          />

          {/* F9 — Receitas e Despesas da oportunidade */}
          <FinancialItemsBlock
            proposalId={proposalId}
            onItemsChanged={() => setAutoCalcRefreshSignal((n) => n + 1)}
          />
        </div>

        {/* ── Right column: sticky live-panel + auto-calc ── */}
        <aside className="sticky top-4 flex flex-col gap-3.5 self-start max-[920px]:static">
          {/* F7 — Painel ao vivo (TIR / VPL / bonificação) */}
          <ProposalIndicatorsBlock
            proposalId={proposalId}
            refreshSignal={autoCalcRefreshSignal}
          />

          {/* Cálculos automáticos (volume / receita / margem / investimento Vibra) */}
          <ProposalAutoCalcBlock
            proposalId={proposalId}
            refreshSignal={autoCalcRefreshSignal}
          />
        </aside>
      </div>

      <SolicitarAjusteDialog
        blocoLabel={
          blocoEmAjuste === null ? null : BLOCO_PROPOSTA_LABEL[blocoEmAjuste]
        }
        busy={ajusteBusy}
        error={ajusteErro}
        onCancel={() => setBlocoEmAjuste(null)}
        onSubmit={(comentario) => void enviarAjuste(comentario)}
      />
      <ToastContainer toasts={toast.toasts} onDismiss={toast.removeToast} />
    </ProposalViewModeProvider>
  );
}
