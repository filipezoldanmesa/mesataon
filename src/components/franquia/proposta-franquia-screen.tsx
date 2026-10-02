'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { NotFoundScreen } from '@/components/not-found-screen';
import { Spinner } from '@/components/spinner';
import { StatusPill } from '@/components/status-pill';
import { ToastContainer, useToast } from '@/components/toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useSendbarReserve } from '@/hooks/use-sendbar-reserve';
import { Permission } from '@/lib/auth-permissions';
import { AnaliseModeProvider } from '@/components/franquia/analise-mode';
import { SendbarPendencias } from '@/components/franquia/sendbar-pendencias';
import { SolicitarAjusteDialog } from '@/components/franquia/solicitar-ajuste-dialog';
import { CofSection } from '@/components/franquia/cof-section';
import { DadosFranquiaSection } from '@/components/franquia/dados-franquia-section';
import { ExcecoesSection } from '@/components/franquia/excecoes-section';
import { FapPotencialSection } from '@/components/franquia/fap-potencial-section';
import { ModeloParametrosSection } from '@/components/franquia/modelo-parametros-section';
import { ParecerFranquiaSection } from '@/components/franquia/parecer-franquia-section';
import { franquiaPillVariant } from '@/lib/franquia/types';
import {
  getPropostaFranquia as defaultGetPropostaFranquia,
  PropostaFranquiaForbiddenError,
  PropostaFranquiaNotFoundError,
} from '@/lib/franquia/proposta-franquia.data';
import type { PropostaFranquiaReadModel } from '@/lib/franquia/proposta-franquia-mapping';
import {
  BTN_GHOST,
  BTN_PRIMARY,
  Block,
  IndicadoresFranquiaPanel,
} from '@/components/franquia/franquia-ui';
import { formatBrlString } from '@/lib/franquia/format';
import { BLOCO_FRANQUIA_LABEL, BlocoFranquia } from '@/lib/franquia/ajuste';
import {
  solicitarAjusteFranquia as defaultSolicitarAjuste,
  SolicitarAjusteValidationError,
} from '@/lib/franquia/ajuste.data';
import { getOpportunityDetail as defaultGetOpportunityDetail } from '@/lib/opportunities/opportunity-detail.data';
import { responsavelDaOportunidade } from '@/lib/opportunities/responsavel';
import { getTeam as defaultGetTeam } from '@/lib/opportunities/team.data';
import type { OpportunityTeam } from '@/lib/opportunities/team.types';
import type { OpportunityDetail } from '@/lib/opportunities/types';
import { rotaDoApp } from '@/lib/navegacao-segura';

type LoadStatus = 'loading' | 'loaded' | 'error' | 'not-found' | 'forbidden';

type Props = {
  opportunityId: string;
  proposalId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  getPropostaFranquia?: (
    opportunityId: string,
    proposalId: string,
  ) => Promise<PropostaFranquiaReadModel>;
  /** Injectable for tests. */
  solicitarAjuste?: typeof defaultSolicitarAjuste;
  /**
   * Injectable for tests. Feeds the breadcrumb (OPP code) and the head meta
   * (Cliente / Oportunidade), mirroring the prototype's head card — the
   * franchise read model doesn't carry client/opportunity identity.
   */
  getOpportunity?: (id: string) => Promise<OpportunityDetail>;
  /**
   * Injectable for tests. Alimenta o "Responsável" da linha meta — o LT
   * principal da equipe, a MESMA fonte da tela de proposta de posto
   * (`ProposalOpportunityHeader`).
   *
   * ⚠️ Antes o slot mostrava `dados.evNome`, o executivo que o roteamento J10
   * designava. Ele nunca resolveu (a tabela era consultada com região e UF
   * vazias) e a J10 saiu do produto em 21/09/2026, então o campo é nulo por
   * construção — e o EV já tem rótulo próprio ("Executivo de franquia") no card
   * "Dados da franquia", de modo que repeti-lo aqui duplicava o card.
   */
  getTeam?: (id: string) => Promise<OpportunityTeam>;
};

/**
 * `03-proposta-franquia.html` — franchise proposal screen (FRQ-11 shell).
 *
 * One request per render: the whole screen is composed from the FRQ-9 read
 * model (`GET .../franquia/:proposalId/contrato`). Each section carries its own
 * `SectionResult`, so a failing source degrades that card alone.
 *
 * Layout mirrors the prototype: head card (pills + meta), two columns with a
 * sticky indicator panel, and a fixed sendbar. The collapse breakpoint is
 * `min-[921px]:` because the prototype collapses at `max-width:920px` — using
 * `lg:`/`md:` would move it (ADR-0018 §breakpoints).
 *
 * A 403 renders the plain not-found screen rather than "acesso restrito":
 * naming the restriction confirms the resource exists (CLAUDE.md).
 *
 * FRQ-12/13/14 slot their blocks into the marked positions below; this slice
 * ships the shell, "Dados da franquia" and "FAP e potencial do ponto".
 */
export function PropostaFranquiaScreen({
  opportunityId,
  proposalId,
  getPropostaFranquia = defaultGetPropostaFranquia,
  solicitarAjuste = defaultSolicitarAjuste,
  getOpportunity = defaultGetOpportunityDetail,
  getTeam = defaultGetTeam,
}: Props) {
  const { can } = usePermissions();
  const toast = useToast();
  const router = useRouter();

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [model, setModel] = useState<PropostaFranquiaReadModel | null>(null);

  /*
   * Reserva medida para a barra `fixed` — a lista de pendências abre e fecha, e
   * o texto do backend reflui em telas estreitas. Compartilhada com a tela de
   * criação, que seguia com o `pb-[88px]` chumbado (ver `useSendbarReserve`).
   */
  const { sendbarRef, sendbarReserva } = useSendbarReserve();

  // Opportunity identity for the breadcrumb/meta (prototype head card). Best
  // effort: a failure here never degrades the screen — the fallbacks render.
  const [opportunity, setOpportunity] = useState<OpportunityDetail | null>(null);
  useEffect(() => {
    let cancelled = false;
    getOpportunity(opportunityId)
      .then((opp) => {
        if (!cancelled) setOpportunity(opp);
      })
      .catch(() => {
        /* keep fallbacks */
      });
    return () => {
      cancelled = true;
    };
  }, [getOpportunity, opportunityId]);

  /*
   * Equipe da oportunidade — alimenta só o "Responsável" da linha meta. Best
   * effort pela mesma razão da leitura acima: uma falha aqui deixa o campo em
   * "—", nunca derruba a tela da proposta.
   */
  const [team, setTeam] = useState<OpportunityTeam | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTeam(opportunityId)
      .then((t) => {
        if (!cancelled) setTeam(t);
      })
      .catch(() => {
        /* keep fallbacks */
      });
    return () => {
      cancelled = true;
    };
  }, [getTeam, opportunityId]);

  // ── Analysis mode (FRQ-14) ───────────────────────────────────────────────
  const [blocoEmAjuste, setBlocoEmAjuste] = useState<BlocoFranquia | null>(null);
  const [ajusteBusy, setAjusteBusy] = useState(false);
  const [ajusteErro, setAjusteErro] = useState<string | null>(null);
  const [blocosSolicitados, setBlocosSolicitados] = useState<Set<BlocoFranquia>>(
    () => new Set(),
  );

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setModel(await getPropostaFranquia(opportunityId, proposalId));
      setStatus('loaded');
    } catch (err) {
      if (err instanceof PropostaFranquiaNotFoundError) setStatus('not-found');
      else if (err instanceof PropostaFranquiaForbiddenError) setStatus('forbidden');
      else setStatus('error');
    }
  }, [getPropostaFranquia, opportunityId, proposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const abrirAjuste = useCallback((bloco: BlocoFranquia) => {
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
          `Ajuste solicitado ao LT em "${BLOCO_FRANQUIA_LABEL[blocoEmAjuste]}" — pendência ${result.pendenciaCode ?? 'criada'}.`,
          'success',
        );
      } catch (err) {
        // The dialog stays open with the text intact: the analyst's sentence is
        // the whole payload, and closing on failure would discard it.
        setAjusteErro(
          err instanceof SolicitarAjusteValidationError || err instanceof Error
            ? err.message
            : 'Falha ao solicitar o ajuste.',
        );
      } finally {
        setAjusteBusy(false);
      }
    },
    [blocoEmAjuste, solicitarAjuste, proposalId, toast],
  );

  if (status === 'loading') {
    return (
      <div className="py-16" data-testid="proposta-franquia-loading">
        <Spinner label="Carregando a proposta de franquia…" />
      </div>
    );
  }

  if (status === 'not-found' || status === 'forbidden') {
    return <NotFoundScreen />;
  }

  if (status === 'error' || model === null) {
    return (
      <div
        className="my-6 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6"
        data-testid="proposta-franquia-error"
      >
        <p className="text-(length:--t-caption) text-(--color-text)">
          Não foi possível carregar a proposta de franquia.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className={`${BTN_PRIMARY} mt-3`}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const dados = model.dadosFranquia.data;
  const { vereditos, sendbar } = model;

  /*
   * Analysis (read-only) view — decided by the AUDIENCE and the PHASE, not by a
   * query string: a profile holding the analysis permission opening uma proposta
   * cuja análise está ACONTECENDO. The prototype uses `?preenchida=1`/
   * `?modo=analise` only because a static page had no session (ADR-0018, same
   * reasoning as `AnaliseView`).
   *
   * ⚠️ A fase vem do backend (`vereditos.analiseEmCurso`) e não de
   * `statusProposta` (10/09/2026): o status da proposta NUNCA sai de
   * `EM_ANALISE` quando a oportunidade avança, então esta tela seguia em "visão
   * da análise" — com "Solicitar ajuste" em cada bloco, que abre pendência ao
   * LT — sobre uma análise encerrada, com a oportunidade em minuta.
   *
   * Veredito ausente resolve para "não está em análise": nenhum controle de
   * analista é oferecido sobre uma proposta cuja fase não se conseguiu ler.
   */
  const modoAnalise =
    vereditos.analiseEmCurso === true && can(Permission.SnegAnalysis);

  return (
    <AnaliseModeProvider
      value={
        modoAnalise
          ? { blocosSolicitados, onSolicitarAjuste: abrirAjuste }
          : null
      }
    >
    {/*
      O espaço reservado para a sendbar é MEDIDO, não uma constante. O `pb-[88px]`
      que estava aqui (e que está hardcoded em 7 telas) dimensiona uma barra de
      UMA linha; esta barra cresce com a lista de pendências e chegou a 197px
      medidos com 7 itens — 109px além do reservado. Como a barra é `fixed`, o
      excedente fica POR CIMA do conteúdo: o último card ("Exceções
      Programadas") não só ficava ilegível, ele deixava de receber clique, e
      rolar não resolvia porque o documento já estava no fim.
    */}
    <div
      data-testid="proposta-franquia-conteudo"
      style={{ paddingBottom: sendbarReserva }}
    >
      {/* ── Head card ──────────────────────────────────────────────────── */}
      <header className="mt-2 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-[22px] py-5">
        <div className="flex flex-wrap items-center gap-2.5">
          {dados !== null && (
            <>
              <StatusPill variant="neutral" data-testid="head-bandeira">
                {dados.bandeiraLabel.toUpperCase()}
              </StatusPill>
              <StatusPill
                variant={franquiaPillVariant(dados.statusPropostaPill)}
                data-testid="head-status"
              >
                {dados.statusPropostaLabel}
              </StatusPill>
            </>
          )}
          {modoAnalise && (
            <StatusPill variant="info" data-testid="head-somente-leitura">
              Somente leitura · análise
            </StatusPill>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-(length:--t-h2) font-bold">
              {dados === null
                ? 'Proposta de franquia'
                : `Proposta de franquia — ${dados.bandeiraLabel}`}
            </h1>
            {/*
             * Prototype `.head .sub` — "Vinculada ao posto OPP-0428 · Posto Vibra
             * Centro-SP · Contratação". The franchise always hangs off a posto
             * proposal (RN-F1-03), and that link is what the heading states; the
             * creation screen already carries the same line. Rendered only from
             * what is actually known: an absent part is dropped, never guessed.
             */}
            {opportunity !== null && (
              <p
                className="mt-0.5 text-(length:--t-caption) text-(--color-text-muted)"
                data-testid="head-sub"
              >
                Vinculada à oportunidade{' '}
                <b className="text-(--neutral-900)">{opportunity.code}</b>
                {opportunity.clientName ? ` · ${opportunity.clientName}` : ''}
                {opportunity.type ? ` · ${opportunity.type}` : ''}
              </p>
            )}
          </div>
          <Link
            href={`/oportunidades/${encodeURIComponent(opportunityId)}`}
            className={BTN_GHOST}
          >
            ← Oportunidade
          </Link>
        </div>

        {/* Prototype meta row: Responsável · Cliente · Oportunidade · Tipo de
            proposta. Situação da loja / tipo de implantação already live in
            the "Dados da franquia" card — repeating them here diverged from
            the prototype and duplicated the card. */}
        {dados !== null && (
          <dl className="mt-4 flex flex-wrap gap-9 border-t border-(--color-border) pt-4">
            {/*
             * LT principal da equipe — a mesma fonte da proposta de posto. Era
             * `dados.evNome` (o EV do roteamento J10), que nunca resolveu e cuja
             * tabela saiu do produto em 21/09/2026; o EV já tem rótulo próprio
             * no card "Dados da franquia". Ver a prop `getTeam`.
             */}
            <MetaItem
              label="Responsável"
              value={responsavelDaOportunidade(team?.members)}
            />
            <MetaItem label="Cliente" value={opportunity?.clientName ?? null} />
            <MetaItem
              label="Oportunidade"
              value={
                opportunity
                  ? [opportunity.code, opportunity.type]
                      .filter(Boolean)
                      .join(' · ')
                  : null
              }
            />
            {/*
             * VBR-506: the SAP material code (ZBRM/ZLUB) moved to "Grupo de
             * contas" in the "Dados da franquia" block — repeating it here is
             * now redundant.
             */}
            <MetaItem label="Tipo de proposta" value={`Franquia ${dados.bandeiraLabel}`} />
          </dl>
        )}
      </header>

      {/*
       * `.layout` do protótipo — `1fr 340px`, colapsando em ≤920px.
       *
       * ⚠️ A grade e o `aside` andam JUNTOS. A VBR-570 removeu o painel daqui
       * (a TIR/VPL por proposta de franquia deixou de existir) e deixou a grade
       * para trás: os 340px viraram faixa morta e espremeram todos os cards em
       * ~2/3 da largura. O painel volta com as duas linhas que a plataforma de
       * fato calcula, e `franquia-layout-columns.test.ts` prende os dois.
       */}
      <div className="mt-[18px] grid grid-cols-1 items-start gap-6 min-[921px]:grid-cols-[1fr_340px]">
        {/*
         * `min-w-0` não é cosmético: sem ele o item de grid fica com
         * `min-width: auto` (= min-content) e a tabela do Anexo A — sete colunas
         * de cabeçalho longo — ALARGA a primeira coluna além de `1fr`, jogando o
         * `aside` de 340px para fora do enquadramento e pondo scroll horizontal
         * no body (ADO · 26/08/2026). O `overflow-x-auto` da tabela só rola
         * dentro de um container que possa encolher.
         */}
        <div className="min-w-0">
          <DadosFranquiaSection
            opportunityId={opportunityId}
            proposalId={proposalId}
            dados={model.dadosFranquia}
            fap={model.fapPotencialFotos}
            editavel={vereditos.editavelPorFranquia.dadosFranquia}
            onChanged={() => void load()}
          />

          {/* The FAP sub-section belongs to the "Dados da franquia" card in the
              prototype, but owns three independent write paths — it lives in its
              own card so the read-only block above stays declarative, and so the
              analyst can flag it on its own (FRQ-14). */}
          <Block
            title="FAP e potencial do ponto"
            bloco={BlocoFranquia.FapPotencial}
          >
            <FapPotencialSection
              opportunityId={opportunityId}
              proposalId={proposalId}
              fap={model.fapPotencialFotos}
              editavel={vereditos.editavelPorFranquia.fapPotencialFotos}
              parecerExigido={vereditos.parecerExigido}
              parecerExigidoAlerta={vereditos.parecerExigidoAlerta}
              onChanged={() => void load()}
            />
          </Block>

          <ModeloParametrosSection
            opportunityId={opportunityId}
            proposalId={proposalId}
            bandeira={dados?.bandeira ?? null}
            parametros={model.modeloParametros}
            royalties={model.royaltiesCalculados}
            estrutura={model.estruturaExcecoes}
            editavelParametros={vereditos.editavelPorFranquia.modeloParametros}
            editavelEstrutura={vereditos.editavelPorFranquia.estruturaExcecoes}
            royaltyPremiadoIrreversivel={vereditos.royaltyPremiadoIrreversivel}
            onChanged={() => void load()}
          />

          {/*
           * "Royalties e consolidação econômica" (prototype block 3,
           * `03-proposta-franquia.html:173-191`) was REMOVED by the 14/08
           * decision — deliberate divergence from the prototype, on the grounds
           * that it restates what "Modelo de loja e royalties" already carries
           * and what the side panel already reports (`Royalties (a.a.)`).
           *
           * ⚠️ `model.royaltiesCalculados` is still consumed — by
           * `ModeloParametrosSection` — and the backend
           * calculation (`franquia-f3.service`) is untouched: it still feeds the
           * parecer and the opportunity's consolidated economics. Only the block
           * is gone.
           */}
          <ExcecoesSection
            opportunityId={opportunityId}
            proposalId={proposalId}
            estrutura={model.estruturaExcecoes}
            /*
             * `excecoesProgramadas`, e NÃO `estruturaExcecoes` (ADO 67802): as
             * duas perguntas deixaram de ter a mesma resposta. Aquele campo
             * governa os LIMITES do royalty, que continuam sendo do time de
             * franquia; este conhece a fase da proposta e libera o LT enquanto
             * ela está em preenchimento ou devolvida.
             */
            editavel={vereditos.editavelPorFranquia.excecoesProgramadas}
            // Lubrax+ has no "Teto máximo" (RN-F2-06 / prototype `EXC_TYPES`).
            bandeira={model.dadosFranquia.data?.bandeira ?? undefined}
            onChanged={() => void load()}
          />

          {/* Renders nothing when the opinion is dispensado (below the J10
              limit and no record) — mirror of RN-F4-02. */}
          <ParecerFranquiaSection
            opportunityId={opportunityId}
            franquiaId={dados?.franquiaId ?? null}
            parecer={model.parecerFranquia}
            parecerExigido={vereditos.parecerExigido}
            statusProposta={dados?.statusProposta ?? null}
            editavel={vereditos.editavelPorFranquia.parecerFranquia}
            onChanged={() => void load()}
          />

          {/* Renders nothing when the COF does not apply — the backend's
              verdict is the presence of the record (RN-F5-01). */}
          {/*
           * O gate do destinatário é o de `dadosFranquia`, não um veredito
           * próprio: o e-mail é gravado pelo MESMO `PATCH .../dados`, então
           * inventar um `editavelPorFranquia.cof` faria a tela decidir por conta
           * própria sobre uma rota cujo dono já respondeu.
           */}
          <CofSection
            opportunityId={opportunityId}
            proposalId={proposalId}
            cof={model.cof}
            editavel={vereditos.editavelPorFranquia.dadosFranquia}
            onChanged={() => void load()}
          />
        </div>

        {/*
         * Segunda coluna. Duas linhas, não as quatro do protótipo: TIR e VPL
         * por proposta de franquia deixaram de existir na VBR-570 — o royalty
         * virou insumo do cálculo CONSOLIDADO da oportunidade, e o endpoint de
         * recálculo por franquia saiu junto. Reintroduzi-las aqui prometeria um
         * número que nenhum backend calcula.
         */}
        <IndicadoresFranquiaPanel
          bandeiraLabel={dados?.bandeiraLabel ?? '—'}
          royaltyAnualBrl={
            model.royaltiesCalculados.status === 'ok'
              ? formatBrlString(model.royaltiesCalculados.data?.royaltyAnualBrl)
              : null
          }
          indisponivel={model.royaltiesCalculados.status === 'unavailable'}
        />
      </div>

      {/* ── Sendbar (backend-authoritative) ────────────────────────────── */}
      {/* Prototype `.sendbar`: `padding 12px max(24px, calc((100% - --grid-max)/2
          + 24px))` keeps the bar content aligned with the centered container. */}
      <div
        ref={sendbarRef}
        className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-6 border-t border-(--color-border) bg-(--color-surface) py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
        style={{
          paddingLeft: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
          paddingRight: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
        }}
      >
        <div className="text-(length:--t-caption)" data-testid="sendbar-mensagem">
          <b>{modoAnalise ? 'Proposta de franquia em análise' : sendbar.mensagem}</b>
          {modoAnalise ? (
            <span className="text-(--color-text-muted)">
              {' '}· visualização somente leitura.
            </span>
          ) : (
            sendbar.mensagemDetalhe !== null && (
              <span className="text-(--color-text-muted)"> · {sendbar.mensagemDetalhe}</span>
            )
          )}
          {/* What is still missing, listed by the backend (HU-07.2). Not shown
              in analysis: that list is the LT's to-do, not the analyst's.

              Colapsada por padrão AQUI: chega-se a esta tela para ler a proposta
              inteira, e a lista aberta era uma parede de 197px sobre o conteúdo.
              Na tela de CRIAÇÃO o mesmo componente nasce aberto — lá a lista é a
              resposta ao bloco que a pessoa acabou de salvar. */}
          {!modoAnalise && <SendbarPendencias pendencias={vereditos.pendenciasEnvio} />}
        </div>

        {/*
         * In analysis the bar carries a NAVIGATIONAL CTA back to the analysis
         * workspace — the analyst has no mutation to make from this bar, and the
         * proposal's own "enviar para análise" belongs to the LT. Navigation is
         * not gated by a write permission because it mutates nothing.
         *
         * Otherwise: `acaoLabel: null` ⇒ the bar is informative and renders NO
         * button. A permanently disabled CTA is dead control (CLAUDE.md §Sendbar).
         */}
        {modoAnalise ? (
          <Link
            href={`/oportunidades/${encodeURIComponent(opportunityId)}/analise`}
            className={`${BTN_PRIMARY} shrink-0`}
            data-testid="sendbar-voltar-analise"
          >
            Voltar à análise
          </Link>
        ) : (
          sendbar.acaoLabel !== null && (
            /*
             * `franquia.proposta:enviar-analise` is NAVIGATIONAL: the send to
             * analysis is the opportunity-level flow (eleger propostas, DDI,
             * documentos — the workflow transition moves every proposal), so
             * the enabled CTA hands the user to the opportunity screen — the
             * prototype's "Concluir" does exactly this navigation. A button
             * that does nothing when pressed is dead control (CLAUDE.md
             * §Sendbar).
             */
            <button
              type="button"
              disabled={!sendbar.acaoHabilitada}
              title={sendbar.motivoBloqueio ?? undefined}
              onClick={() => {
                if (sendbar.acaoEvento === 'franquia.proposta:enviar-analise') {
                  router.push(rotaDoApp('oportunidades', opportunityId));
                }
              }}
              className={`${BTN_PRIMARY} shrink-0`}
              data-testid="sendbar-acao"
            >
              {sendbar.acaoLabel}
            </button>
          )
        )}
      </div>

      <SolicitarAjusteDialog
        blocoLabel={
          blocoEmAjuste === null ? null : BLOCO_FRANQUIA_LABEL[blocoEmAjuste]
        }
        busy={ajusteBusy}
        error={ajusteErro}
        onCancel={() => setBlocoEmAjuste(null)}
        onSubmit={(comentario) => void enviarAjuste(comentario)}
      />
      <ToastContainer toasts={toast.toasts} onDismiss={toast.removeToast} />
    </div>
    </AnaliseModeProvider>
  );
}

function MetaItem({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[14px] uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </dt>
      <dd className="mt-0.5 text-(length:--t-caption) font-bold">{value ?? '—'}</dd>
    </div>
  );
}
