'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Spinner } from '@/components/spinner';
import { useCalculationPolling } from '@/hooks/use-calculation-polling';
import { StatusPill, type PillVariant } from '@/components/status-pill';
import { ToastContainer, useToast } from '@/components/toast';
import { CadeiaAprovacaoCard } from '@/components/opportunities/cadeia-aprovacao-card';
import { SalesforceRecordLink } from '@/components/opportunities/salesforce-record-link';
import { AnalisesCard } from '@/components/opportunities/analises-card';
import { PendenciasCard } from '@/components/opportunities/pendencias-card';
import { ParecerReadonlySection } from '@/components/opportunities/parecer-readonly-section';
import { getChecklist as defaultGetChecklist } from '@/lib/documents/documents.data';
import type { ChecklistResult } from '@/lib/documents/types';
import { listPendencias } from '@/lib/pendencias/pendencias.data';
import type { ListPendenciasResult } from '@/lib/pendencias/types';
import { OpportunityFlowTabs } from '@/components/opportunities/opportunity-flow-tabs';
import { TotaisRecursosFinanceirosCard } from '@/components/opportunities/totais-recursos-financeiros-card';
import {
  AprovacaoForbiddenError,
  getAprovacao as defaultGetAprovacao,
  refreshAprovacao as defaultRefreshAprovacao,
} from '@/lib/aprovacao/aprovacao.data';
import { NotFoundScreen } from '@/components/not-found-screen';
import { ESTADO_EM_APROVACAO } from '@/lib/aprovacao/aprovacao.types';
import type { Aprovacao } from '@/lib/aprovacao/aprovacao.types';
import type { OpportunityDetail } from '@/lib/opportunities/types';
import { statusPropostaExibido } from '@/lib/opportunities/status-proposta-exibido';
import { camposNovaImagemPista } from '@/lib/opportunities/nova-imagem-pista';
import { camposTextosDoLt } from '@/lib/opportunities/textos-do-lt';
import { proposalHref } from '@/lib/proposals/proposal-href';
import { opportunityAssetClassText } from '@/lib/opportunities/asset-class';
import { textoJanelaConsumo } from '@/lib/opportunities/janela-consumo';
import {
  FINALIDADE_FIELD_LABEL,
  textoFinalidade,
} from '@/lib/opportunities/finalidade-oportunidade';
import {
  AREAS_VENDA_FIELD_LABEL,
  ZONA_VENDA_FIELD_LABEL,
  textoAreasVenda,
  textoZonaVenda,
} from '@/lib/opportunities/zona-venda-oportunidade';
import { formatInstantDateBR as fmtInstantDateBR } from '@/lib/date-format';

type Props = {
  opportunityId: string;
  /** Already-loaded detail — the parent has it; refetching would flash the screen. */
  opportunity: OpportunityDetail;
  /** Called after a successful advance so the parent re-reads the phase. */
  onAdvanced?: () => void;
  /** Injectable for tests. */
  getAprovacao?: (id: string) => Promise<Aprovacao>;
  /** Injectable for tests. */
  refreshAprovacao?: (id: string) => Promise<Aprovacao>;
  /** Injectable for tests. */
  /** Injectable for tests. */
  getChecklist?: (id: string) => Promise<ChecklistResult>;
  /** Injectable for tests. */
  loadPendencias?: (id: string) => Promise<ListPendenciasResult>;
};

/** ADO 68478 — as pendências da oportunidade, não paginadas (o card conta as ativas). */
const defaultLoadPendencias = (opportunityId: string): Promise<ListPendenciasResult> =>
  listPendencias({ opportunityRef: opportunityId });

/** pt-BR labels for the checklist statuses shown on this screen. */
const DOC_STATUS_LABEL: Record<string, string> = {
  validado: 'Validado',
  anexado: 'Anexado',
  pendente: 'Pendente',
  vencido: 'Vencido',
  repo: 'Do repositório',
};

function pillVariant(pill: string): PillVariant {
  switch (pill) {
    case 's':
      return 'success';
    case 'w':
      return 'warning';
    case 'd':
      return 'danger';
    case 'i':
      return 'info';
    default:
      return 'neutral';
  }
}


function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-(length:--t-caption) tracking-[.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="mt-0.5 text-(length:--t-caption) font-bold">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
      <h2 className="mb-3.5 text-(length:--t-h4) font-bold">{title}</h2>
      {children}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-(--color-border) py-2 last:border-b-0">
      <span className="text-(length:--t-caption) tracking-[.3px] text-(--color-text-muted)">
        {label}
      </span>
      <span className="text-(length:--t-caption) font-bold">{value}</span>
    </div>
  );
}

/**
 * "Em aprovação" screen — 1:1 with `01d-oportunidade-aprovacao.html`.
 *
 * ### Why this screen did not exist
 *
 * `opportunity-detail.tsx` routed `EM_ANALISE` to the analysis views and the
 * contract phases to `ContratoView`; `EM_APROVACAO` fell through to the
 * **preenchimento** layout (01b). An opportunity waiting on the alçada showed
 * the LT's fill-in form, with the "Enviar para análise" sendbar, as if nothing
 * had happened.
 *
 * ### The Salesforce card is the point of the screen
 *
 * The prototype states it plainly: *"O fluxo de aprovação corre no Salesforce —
 * o acompanhamento e a aprovação acontecem por lá. Esta tela mostra apenas o
 * andamento."* So the screen reports and links; it does not try to approve.
 *
 * ### Sem CTA de avanço — o protótipo está certo (11/09/2026)
 *
 * Houve aqui um botão "Iniciar minuta", desvio deliberado do protótipo: ele era
 * a saída manual para o caso de a leitura automática da aprovação demorar ou
 * estar desligada. O negócio o recusou — *"Esse botão Iniciar minuta não deve
 * existir. A etapa de minuta deve iniciar automaticamente depois que o processo
 * de aprovação no SF acabar."* Ele também dava uma leitura falsa: oferecido numa
 * oportunidade ainda EM aprovação, sugeria que quem decide o avanço é esta tela.
 *
 * O avanço é do backend (`AprovacaoSyncService`, ADR-0044). Quando ele não se
 * aplica, o motivo aparece em `avancoAutomatico.motivo` — frase do backend,
 * verbatim.
 *
 * ### E a tela não espera um clique para saber (ADO 68479 · 17/09/2026)
 *
 * O "↻ Atualizar" continua aqui — ele é a saída de quem quer conferir AGORA —,
 * mas deixou de ser o que faz a tela sair de um veredito vencido: a abertura
 * relê o org uma vez e, enquanto a fase for `EM_APROVACAO`, a revalidação
 * continua em cadeia (`useCalculationPolling`, sem orçamento). O negócio abriu
 * o ticket com a frase que nomeia o defeito: *"não vai ter ninguém para ficar
 * atualizando manualmente ou clicar para atualizar para ir para fase em
 * minutas"*.
 */
export function AprovacaoView({
  opportunityId,
  opportunity,
  onAdvanced,
  getAprovacao = defaultGetAprovacao,
  refreshAprovacao = defaultRefreshAprovacao,
  getChecklist = defaultGetChecklist,
  loadPendencias = defaultLoadPendencias,
}: Props) {
  const { toasts, addToast, removeToast } = useToast();

  const [aprovacao, setAprovacao] = useState<Aprovacao | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error' | 'forbidden'>(
    'loading',
  );
  const [refreshing, setRefreshing] = useState(false);
  const [maisInfo, setMaisInfo] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [checklistErro, setChecklistErro] = useState(false);
  const [pendencias, setPendencias] = useState<ListPendenciasResult | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setAprovacao(await getAprovacao(opportunityId));
      setStatus('loaded');
    } catch (err) {
      // A profile without access must not see a partial screen: the header,
      // the proposals and the analyses would still render, and the Garantia
      // link would lead to another 403. Same screen as a URL that does not
      // exist — it names neither the profile nor the permission.
      setStatus(err instanceof AprovacaoForbiddenError ? 'forbidden' : 'error');
    }
  }, [getAprovacao, opportunityId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Documents load on their own: a checklist outage must degrade ONE section,
  // never the approval card the screen exists for.
  useEffect(() => {
    let alive = true;
    getChecklist(opportunityId)
      .then((r) => {
        if (alive) setChecklist(r);
      })
      .catch(() => {
        if (alive) setChecklistErro(true);
      });
    return () => {
      alive = false;
    };
  }, [getChecklist, opportunityId]);

  /*
   * ADO 68478 — as pendências, pelo MESMO caminho da tela de preenchimento.
   *
   * Degrada como o checklist acima: falha de leitura deixa `null`, e o card
   * simplesmente não renderiza. Nunca "0 pendências", que afirmaria o contrário
   * do que se sabe.
   */
  useEffect(() => {
    let alive = true;
    loadPendencias(opportunityId)
      .then((r) => {
        if (alive) setPendencias(r);
      })
      .catch(() => {
        if (alive) setPendencias(null);
      });
    return () => {
      alive = false;
    };
  }, [loadPendencias, opportunityId]);

  /**
   * Re-reads the org on demand.
   *
   * QUIET, like the alçada panel's own refresh: it does not go back to the
   * loading state, because blanking the card would hide exactly the values the
   * user is waiting to see change.
   *
   * This is the action that was missing. The snapshot is written by a worker
   * polling every 5 minutes, so GATE 3 could sit blocked that long showing a
   * verdict the org had already superseded — and reloading did not help, since
   * the staleness is in the persisted snapshot (VBR-629).
   */
  const releituraEmVoo = useRef(false);

  /**
   * Relê o org e aplica o resultado — o corpo que o botão manual e a
   * revalidação automática compartilham.
   *
   * `silencioso` governa apenas a AFORDÂNCIA (o estado do botão "↻ Atualizar"):
   * a releitura de fundo não pode piscar "Atualizando…" a cada ciclo numa tela
   * que ninguém pediu para atualizar.
   */
  const releitura = useCallback(
    async (silencioso: boolean) => {
      // Duas releituras concorrentes (o tique do ciclo e o clique do usuário)
      // produziriam duas escritas de snapshot e dois avisos de avanço.
      if (releituraEmVoo.current) return;
      releituraEmVoo.current = true;
      if (!silencioso) setRefreshing(true);
      try {
        const atual = await refreshAprovacao(opportunityId);
        setAprovacao(atual);
        setStatus('loaded');

        /*
         * A releitura AVANÇA a oportunidade quando o org já aprovou (o backend
         * chama o mesmo predicado do worker). Quando isso acontece, esta tela
         * deixou de ser a tela certa — a fase agora é minuta — e quem sabe disso
         * é o pai, que escolhe a view pelo estado.
         *
         * Sem este aviso o usuário via a fase mudar só no próximo reload: o
         * `OpportunityDetail` é Client Component e guarda o estado em memória, e
         * um `router.refresh()` daqui não o alcançaria (mesma lição do
         * `AnaliseView.onNeedsRefresh`, ADO de 27/08/2026).
         */
        if (atual.estadoAtual !== ESTADO_EM_APROVACAO) {
          addToast('Alçada aprovada no Salesforce — oportunidade avançou para a minuta.', 'success');
          onAdvanced?.();
        }
      } catch (err) {
        // A failed re-read must not destroy a snapshot that is still the last
        // thing the org said; only a 403 changes what this profile may see.
        if (err instanceof AprovacaoForbiddenError) setStatus('forbidden');
      } finally {
        releituraEmVoo.current = false;
        if (!silencioso) setRefreshing(false);
      }
    },
    [addToast, onAdvanced, opportunityId, refreshAprovacao],
  );

  const handleRefresh = useCallback(() => releitura(false), [releitura]);

  /** Releitura de fundo — usada na abertura da tela e a cada tique. */
  const revalidar = useCallback(() => {
    void releitura(true);
  }, [releitura]);

  /*
   * ADO 68479 — ao ABRIR a tela, o org é relido uma vez.
   *
   * O `GET` de `load()` é servido pelo SNAPSHOT (de propósito: são quatro round
   * trips SOQL, e a tela é renderizada a cada navegação), então quem acabou de
   * aprovar no Salesforce e veio conferir encontrava o veredito da última
   * varredura. Medido na `PCR-PERN-000167/2026`: cinco níveis aprovados às
   * 19:16Z e, às 19:21Z, a tela ainda dizia "Em aprovação · próximo nível" —
   * com um botão "↻ Atualizar" como única saída. O negócio reportou isso como
   * *"não vai ter ninguém para ficar clicando para atualizar"*.
   */
  const aberturaRelida = useRef<string | null>(null);
  useEffect(() => {
    if (status !== 'loaded') return;
    if (aberturaRelida.current === opportunityId) return;
    aberturaRelida.current = opportunityId;
    revalidar();
  }, [opportunityId, revalidar, status]);

  /*
   * E enquanto a tela fica aberta, ela continua revalidando.
   *
   * **Sem orçamento (`null`)**, pelo mesmo motivo do envelope de assinatura em
   * circulação: a decisão depende de PESSOAS na hierarquia do Salesforce e pode
   * levar horas. Um orçamento devolveria um "Atualizar" no meio de uma espera
   * legítima — a afordância que este ticket veio eliminar. A cadeia para
   * sozinha quando a fase muda, porque `estadoAtual` deixa de ser
   * `EM_APROVACAO`.
   */
  const aguardandoDecisao =
    status === 'loaded' && aprovacao?.estadoAtual === ESTADO_EM_APROVACAO;
  useCalculationPolling(aguardandoDecisao, revalidar, null);


  const propostas = opportunity.propostas ?? [];

  if (status === 'forbidden') {
    return <NotFoundScreen />;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── Head ─────────────────────────────────────────────────────────── */}
      <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <StatusPill variant="info">Em aprovação</StatusPill>
        </div>
        <h1 className="text-(length:--t-h2) font-bold">{opportunity.title}</h1>
        <div className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
          {opportunity.code} · {propostas.length}{' '}
          {propostas.length === 1 ? 'proposta' : 'propostas'} · {opportunity.clientName}
          {opportunity.clientDocument ? ` · ${opportunity.clientDocument}` : ''}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 min-[961px]:grid-cols-4">
          <Field label="Responsável (LT)" value={`${opportunity.owner} · ${opportunity.ownerRole}`} />
          {/* Relato de 17/09/2026 — ver `zona-venda-oportunidade.ts`. */}
          <Field
            label={ZONA_VENDA_FIELD_LABEL}
            value={textoZonaVenda(opportunity.profitCenters) ?? '—'}
          />
          <Field label="Grupo Empresa" value={opportunity.companyGroup ?? '—'} />
          <Field
            label="Franquias"
            value={opportunity.franchises.length > 0 ? opportunity.franchises.join(' · ') : '—'}
          />
        </div>
      </div>

      {/* ── Trilhas paralelas (Fluxo Principal · Garantia · Obra) ─────────── */}
      <OpportunityFlowTabs
        opportunityId={opportunityId}
        backendState={opportunity.backendState}
      />

      <div className="grid gap-5 min-[961px]:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Coluna principal ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">
          <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
            <h2 className="mb-3.5 text-(length:--t-h4) font-bold">Dados da oportunidade</h2>
            <div className="grid gap-4 sm:grid-cols-2 min-[961px]:grid-cols-3">
              <Field label="Código" value={opportunity.code} />
              <Field label="Status" value="Em aprovação" />
              <Field label="Cliente" value={opportunity.clientName} />
              {/*
                * The two "Tipo" fields were SWAPPED against the fill-in screen
                * (01b), which is where the user saw them a phase earlier.
                *
                * `OpportunityDetail.type` IS the negotiation type — the mapper
                * builds it as `TIPO_LABEL[b.tipoNegociacao]`. The asset class
                * ("Posto", "Franquia BR Mania") is derived from the proposals by
                * `opportunityAssetClassText`. And `tipoNegociacao` is a slot the
                * mapper never fills, so reading it here printed a permanent em
                * dash for a value the previous screen had shown (VBR-635 §10).
                */}
              <Field
                label="Tipo"
                value={opportunityAssetClassText(propostas) ?? '—'}
              />
              {/* ADO 68242 — ver `finalidade-oportunidade.ts`. */}
              <Field
                label={FINALIDADE_FIELD_LABEL}
                value={textoFinalidade(opportunity.finalidade) ?? '—'}
              />
              <Field label="Data de abertura" value={fmtInstantDateBR(opportunity.dataAbertura)} />
              <Field label="Criado por" value={opportunity.createdBy} />
              <Field
                label={AREAS_VENDA_FIELD_LABEL}
                value={textoAreasVenda(opportunity.salesZone) ?? '—'}
              />
              {/*
                * Nova imagem de pista — mesma razão do workspace SNEG: o campo
                * governa o gate da alçada e vivia só na tela de preenchimento
                * (ADO 67941). Aqui é leitura pura: nesta fase a alçada já foi
                * enviada, e o valor é contexto do que foi simulado.
                */}
              {camposNovaImagemPista(opportunity).map((c) => (
                <Field key={c.label} label={c.label} value={c.value} />
              ))}
            </div>

            {/* "Mais informações" — o expander do protótipo, com a Equipe. */}
            {maisInfo && (
              <div className="mt-4 border-t border-(--color-border) pt-4">
                <div className="grid gap-4 sm:grid-cols-2 min-[961px]:grid-cols-3">
                  {/* "Grupo Empresa" and "Zona de venda" are already in the head
                      grid above; repeating them here duplicated two fields on the
                      same screen (and both are still backend gaps → "—"). */}
                  {/*
                    * A "Finalidade" subiu para o card acima (ADO 68242), no
                    * lugar do "Tipo de negociação". Repeti-la aqui daria duas
                    * respostas para o mesmo fato na mesma tela — o defeito que
                    * o comentário deste bloco já registra para "Grupo Empresa"
                    * e "Zona de venda".
                    */}
                  {/* ADO 68242 — ver `textoJanelaConsumo`. */}
                  <Field
                    label="Datas de início/fim de consumo"
                    value={
                      textoJanelaConsumo(
                        opportunity.startDate,
                        opportunity.endDate,
                      ) ?? '—'
                    }
                  />
                  <Field
                    label="Data de conclusão"
                    value={fmtInstantDateBR(opportunity.dataConclusao)}
                  />
                  <Field
                    label="Cliente recebedor"
                    value={opportunity.clientRecebedorName ?? opportunity.clientName}
                  />
                  <Field label="Descrição" value={opportunity.description ?? '—'} />
                  {/*
                  * ADO 68473 — briefing + "Parecer do LT". Até 18/09/2026 o
                  * briefing só existia na tela de PREENCHIMENTO, então quem
                  * lê a oportunidade daqui em diante não alcançava o texto em
                  * que o LT explica o negócio. A regra é compartilhada pelas
                  * quatro telas que montam este card — ver `textos-do-lt.ts`.
                  */}
                  {camposTextosDoLt(opportunity).map((c) => (
                    <Field key={c.label} label={c.label} value={c.value} />
                  ))}
                </div>

                <div className="mt-4">
                  <div className="text-(length:--t-caption) tracking-[.3px] text-(--color-text-muted)">
                    Equipe
                  </div>
                  {opportunity.team.length === 0 ? (
                    <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
                      Nenhum membro na equipe.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {opportunity.team.map((m) => (
                        <span
                          key={m.id}
                          className="rounded-full border border-(--color-border) bg-(--neutral-25) px-3 py-1 text-(length:--t-caption) font-bold"
                        >
                          {m.name}{' '}
                          <small className="font-normal text-(--color-text-muted)">
                            · {m.role}
                            {m.zone ? ` · ${m.zone}` : ''}
                            {m.isPrincipal ? ' · principal' : ''}
                          </small>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMaisInfo((v) => !v)}
              aria-expanded={maisInfo}
              className="mt-4 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
            >
              {maisInfo ? 'Menos informações' : 'Mais informações'}
            </button>
          </section>

          <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
            <h2 className="mb-3.5 text-(length:--t-h4) font-bold">Propostas</h2>
            {propostas.length === 0 ? (
              <p className="text-(length:--t-caption) text-(--color-text-muted)">
                Nenhuma proposta nesta oportunidade.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {propostas.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) p-3.5"
                  >
                    <div className="min-w-0">
                      <StatusPill variant="success">
                        {/*
                          * A proposta acompanha a FASE da oportunidade — ver
                          * `statusPropostaExibido`. O `ProposalStatus` para em
                          * `EM_ANALISE`, então este pill dizia "Em análise" numa
                          * oportunidade já em aprovação (e assim seguiria até a
                          * conclusão).
                          */}
                        {statusPropostaExibido(p.status, {
                          backendState: opportunity.backendState,
                        })}
                      </StatusPill>
                      <div className="mt-1.5 text-(length:--t-caption) font-bold">
                        {p.code} · {p.title}
                        {p.group ? ` · ${p.group}` : ''}
                      </div>
                      {p.authorName && (
                        <div className="text-(length:--t-caption) text-(--color-text-muted)">
                          Autor: {p.authorName}
                        </div>
                      )}
                    </div>
                    {/*
                      * ⚠️ `<Link>`, NUNCA `<a>` cru (ADO 68246).
                      *
                      * O Next só prefixa o `basePath` (`/stage/gestor-oportunidades-web`)
                      * em `<Link>`, `useRouter` e assets internos — um `<a href>` sai com
                      * o path NU. Local a variável é vazia e o link funciona; em
                      * dev/stage/prod ele cai fora do basePath E fora da regra `/prefix/*`
                      * do ALB, que responde `404: Route not found on Internal ALB` — a tela
                      * branca do print do ticket.
                      *
                      * Esta era a ÚNICA das cinco telas que montam este CTA com âncora
                      * crua; as outras quatro (`contrato-view`, `sneg-analise-shell`,
                      * `opportunity-detail`, `proposals-in-analysis-block`) sempre usaram
                      * `<Link>`. O teste de componente não distingue as duas — ele afere o
                      * `href` renderizado, e com `basePath` vazio elas são idênticas —, daí
                      * o gate estático `internal-link.test.ts`.
                      */}
                    <Link
                      className="rounded-[var(--radius-xxs)] border border-(--color-border) px-3.5 py-2 text-(length:--t-caption) font-bold text-(--color-text) hover:bg-(--neutral-40)"
                      href={proposalHref(opportunityId, p.id, p.tipoProposta)}
                    >
                      Exibir proposta
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/*
            * Totais - Recursos Financeiros — os seis campos da `Opportunity` no
            * Salesforce, somados sobre os recursos financeiros das propostas
            * eleitas.
            *
            * Sem condição de fase: o backend devolve o slot `null` enquanto a
            * oportunidade está em preenchimento, e esta view só existe em
            * `EM_APROVACAO`. Vem depois de "Propostas" pela mesma razão do
            * workspace da análise — é sobre as eleitas que ele soma. Sem
            * `className`: a coluna já dá o ritmo (`gap-5`).
            */}
          <TotaisRecursosFinanceirosCard totais={opportunity.totaisRecursosFinanceiros} />

          {/* Documentos da oportunidade — protótipo 01d, somente leitura. */}
          <section className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
            <h2 className="mb-3.5 text-(length:--t-h4) font-bold">Documentos da oportunidade</h2>
            {checklistErro ? (
              <p className="text-(length:--t-caption) text-(--color-text-muted)">
                Não foi possível carregar os documentos.
              </p>
            ) : !checklist ? (
              <Spinner label="Carregando documentos…" />
            ) : (
              <>
                <ul className="flex flex-col">
                  {checklist.docs
                    .filter((d) => d.required)
                    .map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-3 border-b border-(--color-border) py-2 last:border-b-0"
                      >
                        <span className="text-(length:--t-caption)">{doc.name}</span>
                        <StatusPill variant={doc.status === 'validado' ? 'success' : 'warning'}>
                          {DOC_STATUS_LABEL[doc.status] ?? doc.status}
                        </StatusPill>
                      </li>
                    ))}
                </ul>
                <Link
                  className="mt-3.5 inline-flex rounded-[var(--radius-xxs)] border border-(--color-border) px-3.5 py-2 text-(length:--t-caption) font-bold hover:bg-(--neutral-40)"
                  href={`/oportunidades/${encodeURIComponent(opportunityId)}/documentos`}
                >
                  Gerenciar documentos →
                </Link>
              </>
            )}
          </section>

          {/* Parecer técnico — SNEG (somente leitura nesta fase). */}
          <ParecerReadonlySection opportunityId={opportunityId} />
        </div>

        {/* ── Aside ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 min-[961px]:sticky min-[961px]:top-4">
          <Card title="Aprovação no Salesforce">
            {status === 'loading' && <Spinner label="Carregando aprovação…" />}

            {status === 'error' && (
              <p className="text-(length:--t-caption) text-(--color-text-muted)">
                Não foi possível carregar o andamento da aprovação.
              </p>
            )}

            {status === 'loaded' && aprovacao && (
              <>
                {/*
                  * ADO 68142 — o número é link, e o `salesforceId` cru saiu do
                  * fallback.
                  *
                  * Aquele `?? aprovacao.salesforceId` punha um id de 18 chars
                  * (`0068800001AnirFAAR`) num campo rotulado "Nº da
                  * oportunidade" — valor de máquina onde se espera número de
                  * negócio, e o id já viaja dentro do `href` do CTA "Abrir no
                  * Salesforce" logo abaixo. Sem código, "Não integrada" é a
                  * resposta honesta (o vínculo nasce no 1º acionamento da
                  * alçada), e é a MESMA condição que esconde o CTA.
                  */}
                <Row
                  label="Nº da oportunidade (Salesforce)"
                  value={
                    aprovacao.salesforceCode ? (
                      <SalesforceRecordLink
                        code={aprovacao.salesforceCode}
                        url={aprovacao.salesforceUrl}
                        testId="aprovacao-sf-code"
                      />
                    ) : (
                      'Não integrada'
                    )
                  }
                />
                <Row
                  label="Status"
                  value={
                    <StatusPill variant={pillVariant(aprovacao.outcomePill)}>
                      {aprovacao.outcomeLabel}
                    </StatusPill>
                  }
                />
                {/*
                  * ADO 68247 — "Etapa no Salesforce", não "Etapa no CRM".
                  *
                  * O card inteiro nomeia o sistema ("Aprovação no Salesforce",
                  * "Nº da oportunidade (Salesforce)", "Abrir no Salesforce", e a
                  * nota que diz que o fluxo corre lá): uma única linha dizendo
                  * "CRM" obriga o leitor a inferir que os dois são a mesma
                  * coisa. Pedido do negócio, e o valor é literalmente o
                  * `StageName` do org.
                  */}
                {aprovacao.stageName && (
                  <Row label="Etapa no Salesforce" value={aprovacao.stageName} />
                )}

                {/*
                  * ADO 68194 — a orientação da REPROVAÇÃO, e ela vem ANTES da
                  * nota genérica abaixo.
                  *
                  * Aquela nota diz que "o acompanhamento e a aprovação
                  * acontecem por lá"; lida sozinha depois de uma reprovação,
                  * junto da Tarefa que o org abre ("Proposta Rejeitada -
                  * Realizar ajustes"), ela empurra o LT a corrigir no
                  * Salesforce — o desfecho que o ticket veio impedir. O
                  * veredito específico precede o geral, e o qualifica.
                  *
                  * A frase é do BACKEND, verbatim, e é a MESMA da pendência
                  * aberta ao LT (ADR-0018).
                  *
                  * Tom de ATENÇÃO (`--yellow-700`), nunca `--color-danger`:
                  * nada falhou no sistema — a alçada decidiu, e o texto é
                  * orientação. `role="status"`, não `alert`.
                  */}
                {aprovacao.orientacaoReprovacao && (
                  <p
                    role="status"
                    data-testid="aprovacao-orientacao-reprovacao"
                    className="mt-3 rounded-[var(--radius-xs)] border-l-2 border-(--yellow-700) bg-(--neutral-25) px-3 py-2.5 text-(length:--t-caption) text-(--color-text)"
                  >
                    {aprovacao.orientacaoReprovacao}
                  </p>
                )}

                <div className="mt-3 rounded-[var(--radius-xs)] bg-(--color-info-bg) px-3 py-2.5 text-(length:--t-caption) text-(--color-info)">
                  O fluxo de aprovação corre no <b>Salesforce</b> — o acompanhamento e a
                  aprovação acontecem por lá. Esta tela mostra apenas o andamento.
                </div>

                {/*
                  * Read action — not gated by permission: it mutates nothing of
                  * the business, it only asks the org again. Whoever may see
                  * this card may refresh it.
                  */}
                <button
                  type="button"
                  data-testid="aprovacao-refresh-btn"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                  className="mt-3 flex w-full items-center justify-center rounded-[var(--radius-xxs)] border border-(--color-border) px-3.5 py-2 text-(length:--t-caption) font-bold hover:bg-(--neutral-40) disabled:opacity-50"
                >
                  {refreshing ? 'Atualizando…' : '↻ Atualizar'}
                </button>

                {aprovacao.erroLeitura && (
                  <p className="mt-2 text-(length:--t-caption) text-(--color-text-muted)">
                    Última leitura do Salesforce falhou. Os dados exibidos podem estar
                    desatualizados.
                  </p>
                )}

                {/*
                  * Por que o avanço automático não aconteceu.
                  *
                  * A plataforma avança sozinha quando a alçada aprova (ADR-0044),
                  * e a recusa era engolida num log: a oportunidade ficava parada
                  * com esta tela dizendo apenas "Aprovada", e o usuário concluía
                  * que o automático não existe. A frase vem do backend, verbatim
                  * (ADR-0018) — e é a MESMA que a transição devolveria no 422.
                  *
                  * Tom de ATENÇÃO (`--yellow-700`), nunca `--color-danger`, e
                  * `role="status"`: nada quebrou — um gate está fechado.
                  */}
                {aprovacao.avancoAutomatico?.motivo && (
                  <div
                    role="status"
                    data-testid="aprovacao-avanco-motivo"
                    className="mt-2 rounded-[var(--radius-xs)] border-l-2 border-(--yellow-700) bg-(--neutral-25) px-3 py-2.5 text-(length:--t-caption) text-(--color-text)"
                  >
                    <p>
                      A aprovação no Salesforce foi reconhecida. Para seguir para a
                      minuta, ainda falta:
                    </p>

                    {/*
                      * `whitespace-pre-line` e NUNCA um `split`.
                      *
                      * O backend manda uma string só, com as obrigações separadas
                      * por `\n\n` (`FranquiaContratoGateGuard`). Fatiar prosa vinda
                      * do backend para montar uma lista aqui tornaria a tela refém
                      * do separador — mudá-lo lá viraria um parágrafo colado aqui,
                      * em silêncio. O CSS respeita as quebras que o backend já
                      * decidiu, e um motivo de uma linha só (garantia, perfil de
                      * crédito, Salesforce) renderiza exatamente como antes.
                      */}
                    <p
                      data-testid="aprovacao-avanco-motivo-texto"
                      className="mt-2 whitespace-pre-line"
                    >
                      {aprovacao.avancoAutomatico.motivo}
                    </p>

                    {/*
                      * A promessa é verdadeira e é a resposta à queixa que abriu o
                      * ADO 68231 ("aprovou e não atualizou"): o
                      * `AprovacaoReconciliationWorker` reavalia a cada 5 min e o
                      * `POST .../aprovacao:refresh` reavalia sob demanda, os dois
                      * pelo MESMO `AprovacaoAvancoService`. Sem esta linha o leitor
                      * conclui que ainda precisa clicar em algo depois de resolver.
                      *
                      * Fica no FRONT porque vale para QUALQUER motivo de recusa — o
                      * backend continua devolvendo só os fatos.
                      */}
                    <p className="mt-2">
                      Assim que isso for resolvido, a oportunidade avança para a
                      minuta automaticamente.
                    </p>

                    {/*
                      * O deep link que faltava (ADO 68231 · 15/09/2026).
                      *
                      * Esta tela NOMEAVA a pendência e não dava como chegar nela: na
                      * fase `EM_APROVACAO` o corpo inteiro é a `AprovacaoView`, que
                      * não tem card de pendências (fiel ao protótipo `01d`, cujas
                      * seções são Dados · Propostas · Documentos · Parecer). E o
                      * painel `/pendencias` não resolve sozinho: ele é recortado por
                      * RESPONSABILIDADE, então a pendência da caixa `FRANQUIA` não
                      * aparece para SNEG nem para CCOB.
                      *
                      * ⚠️ O `?opp=` é o que muda isso: naquele ramo o backend troca o
                      * recorte de responsabilidade pelo de ACESSO
                      * (`PendenciasService`), então quem enxerga a oportunidade
                      * enxerga as pendências dela. `opportunityRef` casa por id OU
                      * por `o.code`, e o código é o que a faixa do painel exibe
                      * ("Filtrando pendências da oportunidade X") — um UUID ali não
                      * diria nada a quem lê.
                      *
                      * Renderiza SEMPRE que há motivo, sem consultar antes se existe
                      * pendência aberta: no pior caso o painel abre dizendo "nenhuma
                      * pendência neste filtro", que é informação verdadeira — e não
                      * um link morto. Um fetch a mais aqui pagaria um caminho de
                      * erro a mais para evitar uma frase honesta.
                      */}
                    <Link
                      href={`/pendencias?opp=${encodeURIComponent(opportunity.code)}`}
                      data-testid="aprovacao-avanco-pendencias-link"
                      className="mt-2 inline-block font-bold text-(--secondary-600) no-underline hover:underline"
                    >
                      Ver pendências desta oportunidade →
                    </Link>
                  </div>
                )}

                {/* Dead links teach the user the control does not work — the CTA
                    only renders when there IS a record to open. */}
                {aprovacao.salesforceUrl && (
                  <a
                    className="mt-3 flex w-full items-center justify-center rounded-[var(--radius-xxs)] border border-(--color-border) px-3.5 py-2 text-(length:--t-caption) font-bold hover:bg-(--neutral-40)"
                    href={aprovacao.salesforceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir no Salesforce ↗
                  </a>
                )}

              </>
            )}
          </Card>

          {/*
            O MESMO card da fase de análise (ADO — 10/09/2026). A cópia que
            vivia aqui tinha perdido a linha "Parecer SNEG", os gatilhos de
            detalhamento da DDI e do Perfil, o recorte por permissão e a
            reclassificação da DDI — ver `AnalisesCard`.

            ⚠️ Sem prop `indicadores`: o card lê o snapshot consolidado
            (`GET .../indicators`), que é a fonte da linha "TIR / VPL" na tela
            de análise. `opportunity.indicadores` viaja no payload da
            oportunidade e seria a SEGUNDA fonte dos mesmos números — o defeito
            do sub-quadro "Resultado Financeiro", em que dois blocos mostravam
            valores diferentes enquanto um não recarregava.
          */}
          <AnalisesCard opportunityId={opportunityId} codigo={opportunity.code} />

          {/*
            ⚠️ Desvio deliberado do protótipo `01d` (ADO 68478 · 17/09/2026).

            O relato foi *"E depois as pendências sumiram"*: a oportunidade
            avança para `EM_APROVACAO`, esta view substitui o corpo INTEIRO — e
            ela não tinha card de pendências. As linhas continuavam ABERTAS no
            banco; o que sumiu foi a superfície que as mostrava, e nada na tela
            dizia isso. A `ContratoView`, a fase seguinte, sempre teve o card;
            só a de aprovação não tinha.

            Mudar de fase não pode esconder o FATO — é o mesmo princípio que
            impede esconder um CTA de esconder o motivo pelo qual a coisa está
            parada. O deep link logo acima (ADO 68231) continua: ele aparece
            quando o AVANÇO para a minuta está bloqueado, e nomeia o motivo; o
            card responde outra pergunta ("o que ainda está aberto aqui?") e
            aparece mesmo quando o avanço não está bloqueado.
          */}
          <PendenciasCard summary={pendencias} opportunityCode={opportunity.code} />

          {status === 'loaded' && aprovacao && aprovacao.cadeiaAprovacao.length > 0 && (
            <CadeiaAprovacaoCard
              outcomeLabel={aprovacao.outcomeLabel}
              outcomePill={aprovacao.outcomePill}
              lidoEm={aprovacao.lidoEm}
              niveis={aprovacao.cadeiaAprovacao.map((n) => ({
                ator: n.ator,
                status: n.status,
                statusLabel: n.statusLabel,
                pill: n.pill,
                concluidaEm: n.concluidaEm,
                comentario: n.comentario,
              }))}
            />
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
