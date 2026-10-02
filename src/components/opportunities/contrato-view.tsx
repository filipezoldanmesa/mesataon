'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { sapAndName } from '@/lib/clients/customer-reference';
import { AnalisesCard } from '@/components/opportunities/analises-card';
import { ParecerReadonlySection } from '@/components/opportunities/parecer-readonly-section';
import { StatusPill, type PillVariant } from '@/components/status-pill';
import { Spinner } from '@/components/spinner';
import { ToastContainer, useToast } from '@/components/toast';
import { useCalculationPolling } from '@/hooks/use-calculation-polling';
import { useConfirm } from '@/components/confirm-dialog';
import { useConsultorSoFranquia } from '@/hooks/use-consultor-so-franquia';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/auth-permissions';
import { extractErrorMessage } from '@/lib/api-errors';
import { withBasePath } from '@/lib/base-path';
import {
  getOpportunityDetail as defaultGetDetail,
  getOpportunityProposals as defaultGetProposals,
} from '@/lib/opportunities/opportunity-detail.data';
import type {
  OpportunityDetail,
  OpportunityProposal,
  OpportunityStatus,
} from '@/lib/opportunities/types';
import { statusPropostaExibido } from '@/lib/opportunities/status-proposta-exibido';
import { camposNovaImagemPista } from '@/lib/opportunities/nova-imagem-pista';
import { camposTextosDoLt } from '@/lib/opportunities/textos-do-lt';
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
import { proposalHref } from '@/lib/proposals/proposal-href';
import { getChecklist as defaultGetChecklist } from '@/lib/documents/documents.data';
import type { ChecklistResult } from '@/lib/documents/types';
import {
  getContratoReadModel as defaultGetContrato,
  ContratoForbiddenError,
} from '@/lib/contratos/contrato.data';
import { NotFoundScreen } from '@/components/not-found-screen';
import { formatDateBR } from '@/lib/franquia/format';
import { getObra as defaultGetObra } from '@/lib/obras/obras.data';
import { formatSlaEmDias, prazoDaObra } from '@/lib/obras/obra-prazo';
import type {
  Obra,
  ObraAndamento,
  ObraReadModel,
  ObraStatusInterno,
} from '@/lib/obras/obra-mapping';
import type {
  ContratoReadModel,
  HeadPill,
  PendenciaContratoItem,
} from '@/lib/contratos/contrato-mapping';
import { EtapaContrato } from '@/lib/contratos/types';
import { contratoPillVariant } from '@/lib/contratos/pill-variant';
import { sendbarVisivel } from '@/lib/contratos/sendbar-visivel';
import { ehRetornoDoDocuSign, PARAMS_DE_RETORNO } from '@/lib/contratos/retorno-docusign';
import { useJanelaDocusign } from '@/hooks/use-janela-docusign';
import type { JanelaDocusign } from '@/lib/contratos/janela-docusign';
import { MinutaSection } from '@/components/opportunities/contrato/minuta-section';
import { AlertaAlteracaoMinutaPadrao } from '@/components/opportunities/contrato/alerta-alteracao-minuta-padrao';
import { LacunasDeMinuta } from '@/components/opportunities/contrato/lacunas-de-minuta';
import { MinutaAtribuicaoMeta } from '@/components/opportunities/minuta-atribuicao-meta';
import { OpportunityFlowTabs } from '@/components/opportunities/opportunity-flow-tabs';
import { phaseStateForEtapa } from '@/components/opportunities/opportunity-phase-stepper';
import { TotaisRecursosFinanceirosCard } from '@/components/opportunities/totais-recursos-financeiros-card';
import { SalesforceRecordLink } from '@/components/opportunities/salesforce-record-link';
import { AssinaturaSection } from '@/components/opportunities/contrato/assinatura-section';
import { AnularEnvioDialog } from '@/components/opportunities/contrato/anular-envio-dialog';
import { EnviarHomologadaDialog } from '@/components/opportunities/contrato/enviar-homologada-dialog';
import { TermoCessaoSection } from '@/components/opportunities/contrato/termo-cessao-section';
import {
  abrirPosicionamentoDocusign,
  anularEnvioHomologada,
  enviarTermoParaHomologada,
  sincronizarAssinatura,
  type SignatarioHomologada,
} from '@/lib/contratos/contrato.api';
import {
  EnviarAssinaturaDialog,
  type EnviarAssinaturaPayload,
} from '@/components/opportunities/contrato/enviar-assinatura-dialog';
import { CadeiaAprovacaoCard } from '@/components/opportunities/cadeia-aprovacao-card';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error' | 'not-found' | 'forbidden';

type Props = {
  opportunityId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  getDetail?: (id: string) => Promise<OpportunityDetail>;
  /** Injectable for tests. */
  getProposals?: (id: string) => Promise<OpportunityProposal[]>;
  /** Injectable for tests. */
  getChecklist?: (id: string) => Promise<ChecklistResult>;
  /** Injectable for tests. */
  getContrato?: (id: string) => Promise<ContratoReadModel>;
  /** Injetável para teste, como os demais fetchers desta tela. */
  getObra?: (id: string) => Promise<ObraReadModel>;
};

// ---------------------------------------------------------------------------
// Design tokens / helpers
// ---------------------------------------------------------------------------

function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '—';
}

/** Pill variant for the head pill's variant field from the backend. */
function headPillVariant(v: 'i' | 's' | 'w'): PillVariant {
  return v === 's' ? 'success' : v === 'w' ? 'warning' : 'info';
}

/** Pill variant for analise line's statusPill field. */
function analisePillVariant(v: 'i' | 'w' | 's' | 'n' | 'd' | null): PillVariant {
  return contratoPillVariant(v);
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CollapsibleSection({
  id,
  title,
  defaultOpen = false,
  unavailable = false,
  revealSignal,
  children,
}: {
  id?: string;
  title: string;
  defaultOpen?: boolean;
  unavailable?: boolean;
  /**
   * Counter that opens (and focuses) this section when it *changes*.
   *
   * A counter rather than a boolean because the caller is requesting an event
   * ("reveal this now"), not owning the state: the user must stay free to
   * collapse the section afterwards, which a controlled `open` prop would
   * fight. Undefined = nobody reveals this section from outside.
   */
  revealSignal?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLElement>(null);
  const firstSignal = useRef(revealSignal);

  useEffect(() => {
    // Skip the initial render: only a *change* is a reveal request.
    if (revealSignal === undefined || revealSignal === firstSignal.current) return;
    setOpen(true);
    const el = sectionRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Move focus too, so the jump is not mouse-only (the section carries
    // tabIndex={-1} for exactly this).
    el.focus({ preventScroll: true });
  }, [revealSignal]);

  return (
    <section
      id={id}
      ref={sectionRef}
      tabIndex={revealSignal === undefined ? undefined : -1}
      className="mb-4 scroll-mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) focus:outline-none"
    >
      {/* section header (.sh) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-[18px] text-left"
      >
        <h2 className="text-(length:--t-h4) font-bold">{title}</h2>
        {unavailable && (
          <span className="text-[11px] font-bold text-(--color-warning)">Indisponível</span>
        )}
        {/* chevron: 0deg when open (pointing down), -90deg when collapsed (pointing left) */}
        <span
          aria-hidden="true"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', display: 'inline-block', transition: 'transform 200ms' }}
          className="shrink-0 text-(--color-text-muted) hover:text-(--secondary-500)"
        >
          ▾
        </span>
      </button>

      {/* body — hidden when collapsed */}
      {open && (
        <div className="border-t border-(--color-border) px-5 pb-5 pt-4">
          {children}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Non-collapsible section (Dados da oportunidade)
// ---------------------------------------------------------------------------

function DataSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]">
      <div className="mb-3.5 flex items-baseline justify-between gap-3">
        <h2 className="text-(length:--t-h4) font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/** `.dgrid` cell — 14px uppercase muted label over a caption bold value. */
function DField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
      </div>
      <div className="text-(length:--t-caption) font-bold">{value ?? '—'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opportunity data section
// ---------------------------------------------------------------------------

function DadosOportunidadeSection({
  opportunity,
  headPill,
  faseLabel,
}: {
  opportunity: OpportunityDetail;
  /**
   * Backend verdict about the CONTRACT, shown in the header. Used here only for
   * the pill's color — its text belongs to the header, not to this field.
   */
  headPill: HeadPill;
  /**
   * pt-BR label of the opportunity's backend state, from the same
   * `OPPORTUNITY_STATE_LABEL` catalog the listing reads.
   *
   * Not `opportunity.status`, which is the COARSE front phase and collapses
   * `EM_MINUTA`/`EM_ASSINATURA`/`EM_PAGAMENTO` into `contrato` — deriving the
   * label from it printed "Em contrato" here while the header read "Em minuta".
   * `faseLabel` is precise AND shares its source with the listing, so this
   * field can drift from neither.
   */
  faseLabel: string;
}) {
  const [showMore, setShowMore] = useState(false);

  return (
    <DataSection title="Dados da oportunidade">
      {/*
        Primary grid: 2-column with main fields.

        ⚠️ **961px, não 761px** (17/09/2026) — o `.dgrid` do protótipo colapsa em
        `max-width:960px` nos 7 arquivos da oportunidade, `01h-oportunidade-contrato`
        inclusive. Ver o mesmo card em `opportunity-detail`/`sneg-analise-shell`.
      */}
      <div className="grid grid-cols-1 gap-x-7 gap-y-3 min-[961px]:grid-cols-2">
        <DField label="Código" value={opportunity.code} />
        {/*
         * The FASE of the opportunity, not the contract pill.
         *
         * This field is labelled "Status" inside a card called "Dados da
         * oportunidade", and it was rendering `headPill` — which describes the
         * CONTRACT. On a concluded opportunity that produced three spellings of
         * one state in a single journey (measured on OPP-2026-000055,
         * 20/08/2026): the listing said "Concluída", this field said "Contrato
         * ativo", and the sendbar said "Contrato concluído".
         *
         * `faseLabel` comes from the same `OPPORTUNITY_STATE_LABEL` catalog the
         * listing reads, so the two can no longer drift. The contract pill is
         * not wrong — it is just the header's job, and it still renders there.
         */}
        <DField
          label="Status"
          value={
            <StatusPill variant={headPillVariant(headPill.variant)} size="sm">
              {faseLabel}
            </StatusPill>
          }
        />
        <DField
          label="Cliente (SAP + Razão Social)"
          value={sapAndName(opportunity)}
        />
        <DField label="Tipo" value={opportunity.type || '—'} />
        <DField
          label="Proprietário"
          value={
            opportunity.owner
              ? `${opportunity.owner}${opportunity.ownerRole ? ` · ${opportunity.ownerRole}` : ''}`
              : '—'
          }
        />
      </div>

      {/* Expandable "Mais informações" block */}
      {showMore && (
        <div className="mt-4 grid grid-cols-1 gap-x-7 gap-y-3 border-t border-(--color-border) pt-4 min-[961px]:grid-cols-2">
          {/* ADO 68242 — ver `finalidade-oportunidade.ts`. */}
          <DField
            label={FINALIDADE_FIELD_LABEL}
            value={textoFinalidade(opportunity.finalidade) ?? '—'}
          />
          <DField label="Grupo Empresa" value={opportunity.companyGroup ?? '—'} />
          {/*
            * ⚠️ NÃO reintroduza aqui um campo "Zona de venda": nesta fase ela
            * vive no CABEÇALHO (18/09/2026), ao lado de Proprietário e Código.
            * O campo de volta daria duas respostas para o mesmo fato na mesma
            * tela. As áreas de venda seguem no card, no campo próprio delas.
            */}
          {/* ADO 68242 — ver `textoJanelaConsumo`. */}
          <DField
            label="Datas de início/fim de consumo"
            value={
              textoJanelaConsumo(opportunity.startDate, opportunity.endDate) ??
              '—'
            }
          />
          <DField
            label="Data de abertura"
            value={fmtDateBR(opportunity.dataAbertura ?? opportunity.createdAt)}
          />
          <DField
            label="Data de conclusão"
            value={fmtDateBR(opportunity.dataConclusao)}
          />
          <DField label="Criado por" value={opportunity.createdBy || '—'} />
          {/*
            * ADO 68142 — o número do org, com link, também na fase Contrato.
            *
            * O primeiro passe do ticket levou o campo às telas de preenchimento
            * e de análise; esta ficou sem, e é justamente a fase em que o
            * registro do org já existe há mais tempo (a alçada rodou antes) e em
            * que alguém que está no CRM vai querer cruzar os dois lados. Mesma
            * lição do `possuiNovaImagemPista`, cujo campo existiu em UMA tela e
            * travou a alçada nas outras três.
            */}
          <DField
            label="Oportunidade no Salesforce"
            value={
              opportunity.salesforceCode ? (
                <SalesforceRecordLink
                  code={opportunity.salesforceCode}
                  url={opportunity.salesforceUrl}
                  testId="contrato-sf-code"
                />
              ) : (
                '—'
              )
            }
          />
          <DField
            label={AREAS_VENDA_FIELD_LABEL}
            value={textoAreasVenda(opportunity.salesZone) ?? '—'}
          />
          {/*
            * Nova imagem de pista — leitura, pela mesma razão da tela de
            * aprovação: o campo governa o gate da alçada (ADO 67941) e é
            * contexto do que foi simulado.
            */}
          {camposNovaImagemPista(opportunity).map((c) => (
            <DField key={c.label} label={c.label} value={c.value} />
          ))}
          <DField
            label="Descrição"
            value={opportunity.description ?? '—'}
          />
          {/*
            * ADO 68473 — briefing + "Parecer do LT". Até 18/09/2026 o briefing
            * só existia na tela de PREENCHIMENTO, então quem lê a oportunidade
            * daqui em diante não alcançava o texto em que o LT explica o
            * negócio. Regra compartilhada pelas quatro telas — ver
            * `textos-do-lt.ts`.
            */}
          {camposTextosDoLt(opportunity).map((c) => (
            <DField key={c.label} label={c.label} value={c.value} />
          ))}

          {/* Equipe chips */}
          {/*
            `col-span-full`, não `col-span-2`: num grid de uma coluna (o card
            fechado, abaixo de 961px) o span fixo cria uma coluna IMPLÍCITA e
            desmonta a grade inteira. Ver o átomo `DataField` em
            `opportunity-detail`, onde o defeito foi medido.
          */}
          {opportunity.team.length > 0 && (
            <div className="col-span-full">
              <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
                Equipe
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {opportunity.team.map((member) => (
                  <span
                    key={member.id}
                    className="rounded-full bg-(--neutral-60) px-3 py-1 text-(length:--t-small) font-bold"
                  >
                    {member.name}
                    <span className="font-normal text-(--color-text-muted)">
                      {' '}· {member.role}
                      {member.zone ? ` · ${member.zone}` : ''}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="mt-3 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
      >
        {showMore ? 'Menos informações' : 'Mais informações'}
      </button>
    </DataSection>
  );
}

// ---------------------------------------------------------------------------
// Propostas section
// ---------------------------------------------------------------------------

function PropostasSection({
  proposals,
  opportunityId,
  fase,
}: {
  proposals: OpportunityProposal[];
  opportunityId: string;
  /**
   * Fase da oportunidade, nos mesmos três sinais que a trilha do topo recebe —
   * é ela que dá o status exibido de cada proposta (`statusPropostaExibido`).
   */
  fase: { backendState?: string; status?: OpportunityStatus; etapa?: string };
}) {
  if (proposals.length === 0) {
    return (
      <CollapsibleSection title="Propostas">
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Nenhuma proposta encontrada.
        </p>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection title="Propostas">
      <div className="flex flex-col gap-2">
        {proposals.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5"
          >
            <div>
              <div className="text-(length:--t-caption) font-bold">
                {p.code} · {p.title}
              </div>
              <div className="mt-0.5 text-(length:--t-caption) text-(--color-text-muted)">
                {statusPropostaExibido(p.status, fase)}
                {p.authorName ? ` · Autor: ${p.authorName}` : ''}
              </div>
            </div>
            <Link
              href={proposalHref(opportunityId, p.id, p.tipoProposta)}
              className="shrink-0 rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-0) px-3 py-1.5 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-40)"
            >
              Exibir proposta
            </Link>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}

// ---------------------------------------------------------------------------
// Documentos section
// ---------------------------------------------------------------------------

function DocumentosSection({
  checklist,
  opportunityId,
}: {
  checklist: ChecklistResult | null;
  opportunityId: string;
}) {
  const docs = checklist?.docs ?? [];

  if (docs.length === 0) return null;

  const DOC_STATUS_PILL: Record<string, PillVariant> = {
    validado: 'success',
    anexado: 'info',
    vencido: 'danger',
    repo: 'info',
  };

  return (
    <CollapsibleSection title="Documentos da oportunidade">
      <div className="flex flex-col gap-2">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5 text-(length:--t-caption)"
          >
            <span>{doc.name}</span>
            <StatusPill variant={DOC_STATUS_PILL[doc.status] ?? 'warning'}>
              {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
            </StatusPill>
          </div>
        ))}
      </div>
      <div className="mt-3.5">
        <Link
          href={`/oportunidades/${opportunityId}/documentos`}
          className="text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
        >
          Gerenciar documentos →
        </Link>
      </div>
    </CollapsibleSection>
  );
}

// ---------------------------------------------------------------------------
// Obra (Converge) panel card — protótipos 01h / 01i / 01j
// ---------------------------------------------------------------------------

/** Uma linha rótulo/valor da coluna lateral, no padrão `.an` do protótipo. */
function ObraLinha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-t border-(--color-border) py-2.5 text-(length:--t-caption) first:border-t-0 first:pt-0">
      <span className="text-(--color-text-muted)">{rotulo}</span>
      <span className="flex items-center gap-1 font-bold">{children}</span>
    </div>
  );
}

/**
 * Card `Obra · <tipo>` (B7), na coluna lateral ao lado de "Cadeia de aprovação"
 * e "Análises" — que é onde os protótipos `01h`/`01i`/`01j` o colocam.
 *
 * Renderiza quando **existe obra vinculada**, e não por sub-fase: o `01f`
 * (minuta) não mostra o card porque aquela oportunidade não tem obra, não porque
 * a fase o proíba. Visibilidade dirigida por dado é o padrão do repo.
 *
 * ## O SLA é em DIAS, e é ele que determina o prazo (16/09/2026)
 *
 * O negócio declarou a unidade que a fonte nunca declarou — *"o prazo é
 * determinado pelo SLA, que é em dias (…) a data do prazo seria a data inicio +
 * SLA"*. Com isso caem as duas divergências que o card mantinha enquanto a
 * unidade era desconhecida: o SLA passa a sair **"37 dias"** (era `37` cru) e o
 * **prazo é derivado** (`prazoDaObra`), com o `FlowEndDate` da fonte como
 * reserva para a obra cujo callback não traz SLA. ⚠️ As duas contas **não
 * coincidem** no callback de evidência — a regra e o porquê da precedência estão
 * em `lib/obras/obra-prazo.ts`.
 *
 * ## Uma divergência DELIBERADA do protótipo permanece
 *
 * **"SLA restante" não existe.** O protótipo o mostra como pill; derivá-lo
 * exigiria uma data de referência ("restante em relação a quando?") que a fonte
 * não publica. Um número inventado ali seria indistinguível de um real.
 *
 * ## Estados
 *
 * `andamento === null` é **"nenhum callback ainda"**, não "obra parada": a obra
 * pode ter sido vinculada há minutos. O card ainda renderiza — o vínculo É
 * informação —, com uma frase que diz exatamente isso em vez de uma pill
 * inventada.
 */
function ObraCard({
  obra,
  andamento,
  statusInterno,
}: {
  obra: Obra;
  andamento: ObraAndamento | null;
  statusInterno: ObraStatusInterno | null;
}) {
  /*
   * Derivado do SLA; `FlowEndDate` é a reserva. Ver o docstring — a precedência
   * é do derivado porque a regra do prazo é a que o negócio enunciou.
   */
  const prazo = andamento
    ? (prazoDaObra(andamento.inicio, andamento.sla) ?? andamento.fim)
    : null;
  // `null` **e** string vazia suprimem a linha: o backend já converte `""` em
  // `null`, mas um rótulo em branco ao lado de "SLA" não informa nada.
  const slaLabel = andamento ? formatSlaEmDias(andamento.sla) : null;
  /*
   * O gate dos dois campos que só fazem sentido depois que o Converge abre a
   * obra. Vem RESOLVIDO do backend (`obraAcompanhadaNoConverge`).
   */
  const acompanhada = statusInterno?.acompanhadaNoConverge === true;

  return (
    <aside className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
      <h2 className="mb-3.5 text-(length:--t-h4) font-bold">Obra · {obra.tipo}</h2>
      <div className="flex flex-col">
        {/*
          ⚠️ São DOIS números, e o rótulo passou a dizer qual é qual (18/09/2026):
          este é o da ESTIMATIVA (o orçamento, vindo do `GetEstimates`) e o de
          baixo é o da OBRA (`ConstructionId`, que nasce no callback). Enquanto
          este se chamava "Obra (Converge)", o único número da tela era o da
          estimativa com o nome do outro.
        */}
        <ObraLinha rotulo="Estimativa">{obra.estimateId}</ObraLinha>

        {/*
          O número da obra só existe depois que o Converge a abre — daí o gate.
          `acompanhadaNoConverge` é veredito do BACKEND: comparar nome de status
          aqui divergiria assim que um degrau novo entrasse na escada.
        */}
        {acompanhada && andamento?.constructionId && (
          <ObraLinha rotulo="Obra">{andamento.constructionId}</ObraLinha>
        )}

        {/*
          O status derivado é o PRINCIPAL — é o que a especificação define como "o
          status da obra exibido na oportunidade". O do Converge vem logo abaixo
          porque a HU-04.1 pede explicitamente "o status vindo do Converge": são
          fatos diferentes e a tela mostra os dois, em vez de escolher um.
        */}
        {statusInterno?.status && (
          <ObraLinha rotulo="Status">
            <StatusPill variant={analisePillVariant(codigoDePill(statusInterno.pill))} size="sm">
              {statusInterno.status}
            </StatusPill>
          </ObraLinha>
        )}

        {/*
          ⚠️ "Status no Converge" também só a partir de "Aguardando início"
          (18/09/2026). Antes disso a linha dizia "Aguardando o Converge informar
          o andamento" para TODA obra recém-vinculada — uma espera que não é
          espera: o Converge só fala depois de abrir a obra, e a frase soava como
          integração atrasada.
        */}
        {acompanhada && andamento && (
          <ObraLinha rotulo="Status no Converge">
            <StatusPill variant={analisePillVariant(pillDoAndamento(andamento))} size="sm">
              {andamento.statusLabel}
            </StatusPill>
          </ObraLinha>
        )}

        {/*
          O cronograma NÃO entra no gate: ele só existe com callback, e um
          callback com datas antes de "Aguardando início" é fato do Converge que
          a tela não tem por que esconder.
        */}
        {andamento && (
          <>
            {(andamento.inicio || prazo) && (
              <ObraLinha rotulo="Início / prazo">
                {[formatDateBR(andamento.inicio), formatDateBR(prazo)]
                  .map((d) => d || '—')
                  .join(' → ')}
              </ObraLinha>
            )}
            {/* Em dias — ver o docstring. */}
            {slaLabel && <ObraLinha rotulo="SLA">{slaLabel}</ObraLinha>}
            {andamento.holdTimeInDays !== null && (
              <ObraLinha rotulo="Dias em hold">{andamento.holdTimeInDays}</ObraLinha>
            )}
          </>
        )}
      </div>

      {/*
        A barra só existe com percentual. `null` é "não há por onde calcular"
        (o callback não trouxe fases) — desenhar uma barra vazia afirmaria que
        nada foi feito.
      */}
      {andamento?.percentualAvanco !== null && andamento !== null && (
        <div className="mt-3">
          <div className="flex justify-between text-(length:--t-caption) text-(--color-text-muted)">
            <span>Progresso das fases</span>
            <b className="text-(--color-text)">{andamento.percentualAvanco}%</b>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-(--neutral-100)">
            <i
              className="block h-full rounded-full bg-(--secondary-500)"
              style={{ width: `${andamento.percentualAvanco}%` }}
            />
          </div>
        </div>
      )}
    </aside>
  );
}

/**
 * O código de pill do backend, estreitado para o que o `StatusPill` aceita.
 *
 * Valor fora do conjunto conhecido vira `n` (neutro) — nunca `s`: uma pill verde
 * é a única que AFIRMA que a obra vai bem, e um código que não sabemos ler não
 * pode afirmar nada.
 */
function pillDoAndamento(a: ObraAndamento): 'i' | 'w' | 's' | 'n' | 'd' {
  return codigoDePill(a.statusPill);
}

/**
 * Estreita um código de pill vindo do backend.
 *
 * Fora do conjunto conhecido vira `n` (neutro) — nunca `s`: verde é a única cor
 * que AFIRMA que a obra vai bem, e um código que não sabemos ler não pode
 * afirmar nada.
 */
function codigoDePill(codigo: string): 'i' | 'w' | 's' | 'n' | 'd' {
  const codigos = ['i', 'w', 's', 'n', 'd'] as const;
  return (codigos as readonly string[]).includes(codigo)
    ? (codigo as 'i' | 'w' | 's' | 'n' | 'd')
    : 'n';
}

// ---------------------------------------------------------------------------
// Pendências panel card
// ---------------------------------------------------------------------------

function PendenciasCard({ pendencias }: { pendencias: { total: number; itens: PendenciaContratoItem[] } }) {
  if (pendencias.total === 0) return null;

  return (
    <aside className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
      <div className="mb-3.5 flex items-baseline gap-2">
        <h2 className="text-(length:--t-h4) font-bold">Pendências</h2>
        <span className="rounded-full bg-(--yellow-100) px-2 py-0.5 text-[11px] font-bold text-(--yellow-700)">
          {pendencias.total}
        </span>
      </div>
      <div className="flex flex-col">
        {pendencias.itens.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-2.5 border-t border-(--color-border) py-2.5 text-(length:--t-caption) first:border-t-0 first:pt-0"
          >
            <div className="min-w-0">
              <div className="font-bold">{item.titulo}</div>
              {/* Context line — without it, two pendências opened from the same
                  catalog rule render identically and the LT cannot tell which
                  document is missing. Omitted when the backend has none. */}
              {item.detalhe && (
                <div className="mt-0.5 text-(--color-text-muted)">{item.detalhe}</div>
              )}
              {item.responsavelDisplay && (
                <div className="mt-0.5 text-(--color-text-muted)">
                  {item.responsavelDisplay}
                </div>
              )}
            </div>
            {item.podeResolver && (
              <Link
                href={item.href}
                className="shrink-0 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
              >
                Resolver
              </Link>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Section slots (CTR-15 / CTR-16 will fill these)
// ---------------------------------------------------------------------------

/**
 * CTR-15 — Assinatura section wrapper.
 *
 * Delegates to `AssinaturaSection` for the full DocuSign envelope block.
 * Handles the `unavailable` SectionResult gracefully.
 */
function AssinaturaBlock({
  opportunityId,
  assinatura,
  defaultOpen,
  revealSignal,
  onRevalidate,
  onToast,
  onAnular,
}: {
  opportunityId: string;
  assinatura: ContratoReadModel['assinatura'];
  defaultOpen?: boolean;
  /** Bumped by the sendbar's "Ver signatários" CTA. */
  revealSignal?: number;
  onRevalidate?: () => void;
  /** Opens the "Anular envio" modal. Absent ⇒ the control is not rendered. */
  onAnular?: () => void;
  onToast?: (message: string, variant?: 'success' | 'error') => void;
}) {
  if (assinatura.status === 'unavailable') {
    return (
      <CollapsibleSection
        id="assinatura"
        title="Assinatura"
        defaultOpen={defaultOpen}
        revealSignal={revealSignal}
        unavailable
      >
        <p
          role="alert"
          className="text-(length:--t-caption) text-(--color-warning)"
        >
          {assinatura.error ?? 'Informações de assinatura temporariamente indisponíveis.'}
        </p>
      </CollapsibleSection>
    );
  }

  if (!assinatura.data || assinatura.data.pacotes.length === 0) {
    return (
      <CollapsibleSection
        id="assinatura"
        title="Assinatura"
        defaultOpen={defaultOpen}
        revealSignal={revealSignal}
      >
        <p className="text-(length:--t-caption) text-(--color-text-muted)">
          Assinatura eletrônica em preparação.
        </p>
      </CollapsibleSection>
    );
  }

  return (
    <CollapsibleSection
        id="assinatura"
        title="Assinatura"
        defaultOpen={defaultOpen}
        revealSignal={revealSignal}
      >
      <AssinaturaSection
        opportunityId={opportunityId}
        assinatura={assinatura.data}
        onRevalidate={onRevalidate}
        onToast={onToast}
      />
      {/* "Anular envio" (protótipo 01g). Fica AQUI e não na sendbar porque a
          sendbar oferece a próxima ação do fluxo, e anular é o desfazer da
          anterior — misturar as duas na mesma barra faria o CTA principal mudar
          de significado conforme o estado. */}
      {onAnular && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            data-testid="anular-envio-btn"
            onClick={onAnular}
            className="rounded-[var(--radius-xxs)] border border-(--color-border) px-3.5 py-2 text-(length:--t-caption) font-bold text-(--color-danger) hover:bg-(--color-danger-bg)"
          >
            Anular envio
          </button>
        </div>
      )}
    </CollapsibleSection>
  );
}

// ---------------------------------------------------------------------------
// Seção "Contrato" (CTR-16 · §1)
// ---------------------------------------------------------------------------

/**
 * Lista, somente leitura, dos contratos que a oportunidade tem **no
 * Salesforce**, com o status de lá.
 *
 * ⚠️ **A fonte é o org, não a tabela local** (decisão de 10/09/2026). A seção
 * já prometia isso no texto, mas lia `contrato.contratos` — a lista LOCAL,
 * cujas colunas `codigoExterno`/`estadoExterno` nasceram como espelho do CRM e
 * nunca foram preenchidas por ninguém. O resultado era linha sem número e sem
 * pill de status. A lista local continua no payload porque é ela que dirige a
 * etapa da fase; o que a tela exibe é `contratosCrm`.
 *
 * - `unavailable` → erro da seção (a fonte caiu, **não** "sem contrato").
 * - `data === []`  → estado vazio legítimo, com a frase padrão.
 * - Sem CTA: ativar contrato e liberar pagamento seguem no Salesforce (PRD v1.0 §3).
 */
function ContratoSection({
  contratos,
  defaultOpen,
}: {
  contratos: ContratoReadModel['contratosCrm'];
  defaultOpen?: boolean;
}) {
  if (contratos.status === 'unavailable') {
    return (
      <CollapsibleSection
        id="contrato-ativo"
        title="Contrato"
        defaultOpen={defaultOpen}
        unavailable
      >
        <p
          role="alert"
          className="text-(length:--t-caption) text-(--color-warning)"
        >
          {contratos.error ?? 'Informações do contrato temporariamente indisponíveis.'}
        </p>
      </CollapsibleSection>
    );
  }

  const items = contratos.data ?? [];

  return (
    <CollapsibleSection id="contrato-ativo" title="Contrato" defaultOpen={defaultOpen}>
      {items.length === 0 ? (
        <div
          className="rounded-[var(--radius-xs)] border border-dashed border-(--color-border-strong) p-5 text-center text-(length:--t-caption) text-(--color-text-muted)"
          data-testid="contratos-crm-empty"
        >
          Nenhum contrato criado ainda.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5"
              data-testid="contrato-crm-row"
            >
              <div className="min-w-0 flex-1">
                {/* .mt = <ContractNumber> · <RecordType.Name> */}
                <div className="text-(length:--t-caption) font-bold">
                  {contratoCrmTitulo(item)}
                </div>
                {/* .mm = situação + vigência, quando o org as tem */}
                {contratoCrmDetalhe(item) && (
                  <div className="mt-0.5 text-(length:--t-caption) text-(--color-text-muted)">
                    {contratoCrmDetalhe(item)}
                  </div>
                )}
              </div>
              {/* Pill: status do Salesforce, verbatim */}
              {item.status && (
                <StatusPill
                  variant={contratoPillVariant(item.statusPill)}
                  size="sm"
                >
                  {item.status}
                </StatusPill>
              )}
            </div>
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

/**
 * Título da linha: número do contrato e tipo, ambos do org.
 *
 * ⚠️ Falta de valor NÃO vira rótulo inventado. Sem tipo (registro antigo do org
 * sem RecordType) sobra o número; sem número sobra o tipo; sem os dois, o
 * marcador de contrato sem identificação — nunca uma linha em branco, que
 * leria como defeito da tela.
 */
function contratoCrmTitulo(item: {
  numero: string | null;
  tipo: string | null;
}): string {
  const partes = [item.numero, item.tipo].filter(
    (parte): parte is string => Boolean(parte),
  );
  return partes.length > 0 ? partes.join(' · ') : 'Contrato sem identificação no Salesforce';
}

/**
 * Sub-linha: situação de vigência e o período, quando o org os tem.
 *
 * Vigência sem data final aparece como "a partir de …" — é o estado normal de
 * contrato em elaboração (medido: `EndDate` nulo em todos os contratos desta
 * plataforma), e escrever um fim que não existe afirmaria prazo.
 */
function contratoCrmDetalhe(item: {
  situacao: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
}): string | null {
  const partes: string[] = [];
  if (item.situacao) {
    partes.push(item.situacao);
  }
  if (item.vigenciaInicio && item.vigenciaFim) {
    partes.push(
      `Vigência ${formatIsoDate(item.vigenciaInicio)} a ${formatIsoDate(item.vigenciaFim)}`,
    );
  } else if (item.vigenciaInicio) {
    partes.push(`Vigência a partir de ${formatIsoDate(item.vigenciaInicio)}`);
  }
  return partes.length > 0 ? partes.join(' · ') : null;
}

/**
 * `YYYY-MM-DD` → `DD/MM/YYYY`.
 *
 * ⚠️ Sem `new Date()`: o construtor lê a string ISO como UTC e, em fuso
 * negativo, `2026-09-01` renderiza como 31/08. O valor do Salesforce é `date`
 * (sem hora) — não há fuso a converter, só a ordem dos campos a trocar.
 */
function formatIsoDate(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

// ---------------------------------------------------------------------------
// Sendbar
// ---------------------------------------------------------------------------

/**
 * Permission required by each sendbar `acaoEvento`, mirroring the `@Roles(...)`
 * of the corresponding backend action route. An evento with no entry keeps the
 * CTA visible — the API is the enforcement point, and hiding an unmapped CTA
 * would silently remove the only action of a whole etapa.
 */
/**
 * Ações da sendbar que NÃO são escrita — e por isso não pedem permissão.
 *
 * Lista explícita para que o default do `canActOnSendbar` possa NEGAR: sem ela,
 * "ação que não está no mapa" e "ação que não precisa de permissão" seriam a
 * mesma coisa, e a segunda é a que faz a primeira passar despercebida.
 */
export const SENDBAR_ACOES_SEM_PERMISSAO: ReadonlySet<string> = new Set([
  // Navega para o acompanhamento do envelope — não muda nada.
  'contrato:ver-assinatura',
]);

/** Permissões que o Consultor de Expansão só exerce em oportunidade com franquia. */
const ACOES_SO_FRANQUIA_PARA_CONSULTOR: ReadonlySet<Permission> = new Set([
  Permission.ContractDraftManage,
  Permission.ContractSignatureSend,
  Permission.ContractSignatureVoid,
]);

export const SENDBAR_ACTION_PERMISSION: Record<string, Permission> = {
  // `contrato:gerar` saiu do mapa junto com o CTA: o backend não emite mais a
  // ação enquanto a geração automática pelo Netlex estiver desativada
  // (contrato-read-model.service.ts). Anexar a minuta continua gated por
  // `ContractDraftManage` no botão "+ Adicionar documento".
  'contrato:substituir': Permission.ContractDraftManage,
  'contrato:enviar': Permission.ContractSignatureSend,
  // Abrir a tela de posicionamento é o passo que SUBSTITUI o envio automático:
  // o `@Roles(SNEG, ADMIN)` da rota é o mesmo de `contrato/assinatura:enviar`,
  // então a permissão é a mesma.
  'contrato:posicionar': Permission.ContractSignatureSend,
  // Mesma rota (`contrato/assinatura:posicionar`), mesmo `@Roles`: o que muda é
  // QUAL pacote o clique endereça, e isso viaja no evento em vez de a tela
  // deduzir pela lista de pacotes.
  'contrato:posicionar-homologada': Permission.ContractSignatureSend,
  // Idem para o envio do Termo de Cessão à homologada — é um envio de envelope.
  'contrato:enviar-homologada': Permission.ContractSignatureSend,
  'contrato:reenviar': Permission.ContractSignatureRemind,
  'contrato:solicitar-ritm': Permission.ContractBankDataRequest,
  'contrato:concluir': Permission.ContractConclude,
  // `contrato:ver-assinatura` is deliberately absent: it navigates to the
  // Assinatura section and mutates nothing, so anyone who can see the page can
  // use it. The reminder itself stays gated at the button that sends it.
};

function Sendbar({
  sendbar,
  onAction,
  canAct,
}: {
  sendbar: ContratoReadModel['sendbar'];
  /** Permission-gated action handler. Undefined = no handler registered yet. */
  onAction?: () => void | Promise<void>;
  /**
   * Whether the current profile may trigger THIS etapa's CTA (resolved from
   * `acaoEvento`, not from a single hard-coded permission). Hiding the button is
   * UX only — the API still answers 403.
   */
  canAct: boolean;
}) {
  return (
    <div
      role="region"
      aria-label="Ações do contrato"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-(--color-border) bg-(--color-surface) shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
    >
      <div
        className="mx-auto flex max-w-(--grid-max) items-center justify-between gap-6 py-4"
        style={{
          paddingLeft: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
          paddingRight: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
        }}
      >
        {/* Left: message */}
        <div className="min-w-0 flex-1">
          <p className="text-(length:--t-caption) font-bold">{sendbar.mensagem}</p>
          {sendbar.mensagemDetalhe && (
            <p className="mt-0.5 text-(length:--t-caption) text-(--color-text-muted)">
              {sendbar.mensagemDetalhe}
            </p>
          )}
        </div>

        {/*
         * Right: CTA button.
         *
         * Rendered only when the backend actually offers an action
         * (`acaoLabel`/`acaoEvento` non-null) AND the profile may trigger it.
         * A null label means the bar is informational — an envelope already out
         * used to render a permanently disabled "Reenviar link ao signatário"
         * whose subtitle told the user to go press a different button.
         */}
        {sendbar.acaoLabel && sendbar.acaoEvento && canAct && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              disabled={!sendbar.acaoHabilitada}
              onClick={onAction ? () => void onAction() : undefined}
              aria-label={
                !sendbar.acaoHabilitada && sendbar.motivoBloqueio
                  ? `${sendbar.acaoLabel} — ${sendbar.motivoBloqueio}`
                  : sendbar.acaoLabel
              }
              className="rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendbar.acaoLabel}
            </button>
            {!sendbar.acaoHabilitada && sendbar.motivoBloqueio && (
              <p
                role="note"
                className="text-[11px] font-bold text-(--color-text-muted)"
              >
                {sendbar.motivoBloqueio}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Contract phase view (`01f`/`01g`/`01h`/`01i`/`01j` — CTR-F6).
 *
 * Rendered when `backendState ∈ { EM_MINUTA, EM_ASSINATURA, EM_PAGAMENTO, CONCLUIDA }`.
 * The page `/oportunidades/[id]` dispatches here; no new route is created.
 *
 * Sections:
 *  1. Dados da oportunidade (non-collapsible)
 *  2. Propostas (collapsible, collapsed)
 *  3. Documentos (collapsible, collapsed)
 *  4. Parecer SNEG (read-only — CTR-14 slot)
 *  5. Minuta (CTR-14) — open when etapaAtual === MINUTA
 *  6. Assinatura (CTR-15) — open when etapaAtual === ASSINATURA
 *  7. Contrato + Dados bancários (CTR-16) — open when etapaAtual ∈ {CADASTRO,ATIVACAO,PAGAMENTO}
 *
 * Aside (sticky 340px above 960px):
 *  - Cadeia de aprovação (omitted when null)
 *  - Análises (linhas from backend)
 *  - Pendências
 *  - Obra (omitted when null)
 *
 * Sendbar: fixed bar with backend-authoritative CTA.
 */
export function ContratoView({
  opportunityId,
  getDetail = defaultGetDetail,
  getProposals = defaultGetProposals,
  getChecklist = defaultGetChecklist,
  getContrato = defaultGetContrato,
  getObra = defaultGetObra,
}: Props) {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  /** Bumped by the "Ver signatários" CTA to open + scroll to the Assinatura section. */
  const [assinaturaReveal, setAssinaturaReveal] = useState(0);
  const [detail, setDetail] = useState<OpportunityDetail | null>(null);
  const [showAnularDialog, setShowAnularDialog] = useState(false);
  const [anularPending, setAnularPending] = useState(false);
  const [contrato, setContrato] = useState<ContratoReadModel | null>(null);
  const [obra, setObra] = useState<ObraReadModel | null>(null);
  const [proposals, setProposals] = useState<OpportunityProposal[]>([]);
  const [checklist, setChecklist] = useState<ChecklistResult | null>(null);
  const [showEnviarDialog, setShowEnviarDialog] = useState(false);
  const [enviarPending, setEnviarPending] = useState(false);
  // Termo de Cessão → empresa homologada (13/09/2026).
  const [showHomologadaDialog, setShowHomologadaDialog] = useState(false);
  const [homologadaPending, setHomologadaPending] = useState(false);
  const [homologadaError, setHomologadaError] = useState<string | null>(null);
  const [showAnularHomologadaDialog, setShowAnularHomologadaDialog] = useState(false);
  const [anularHomologadaPending, setAnularHomologadaPending] = useState(false);
  // Abrir a tela do DocuSign é uma navegação para fora: o botão fica em
  // "Abrindo…" até o browser sair, senão um clique duplo pede duas URLs de uso
  // único e a segunda invalida a primeira.
  const [posicionarPending, setPosicionarPending] = useState(false);
  /**
   * A tela está relendo a situação do envelope depois do retorno do DocuSign.
   *
   * Enquanto for `true` a barra é INFORMATIVA: o dado em mãos é o de antes do
   * envio e oferecer ação sobre ele mostraria um botão já vencido. Ver o
   * `useEffect` de retorno.
   */
  const [confirmandoRetorno, setConfirmandoRetorno] = useState(false);
  // Recusa do último envio, renderizada DENTRO do modal (que segue aberto).
  const [enviarError, setEnviarError] = useState<string | null>(null);

  const { toasts, addToast, removeToast } = useToast();
  const { can } = usePermissions();
  const consultorLiberado = useConsultorSoFranquia(opportunityId);
  const confirm = useConfirm();

  const canSignatureSend = can(Permission.ContractSignatureSend);
  const canSignatureVoid = can(Permission.ContractSignatureVoid);
  const canConclude = can(Permission.ContractConclude);

  // Permission of the CTA the backend is offering in THIS etapa. Gating the
  // whole sendbar on ContractDraftManage would hide "Reenviar link" and
  // "Solicitar RITM" from the LT, who may perform both.
  const acaoEvento = contrato?.sendbar.acaoEvento;
  const acaoPermission = acaoEvento
    ? SENDBAR_ACTION_PERMISSION[acaoEvento]
    : undefined;
  /*
   * ⚠️ Default NEGA (16/09/2026). Era `: true` — uma ação fora do mapa ficava
   * habilitada para todo mundo.
   *
   * Enquanto esta tela era `[LT, SNEG, Admin]` o furo era pequeno; desde que ela
   * passou a ser a tela de TODO perfil que abre a oportunidade, uma `acaoEvento`
   * nova nasceria oferecida à CCOB, ao Visualizador e à Integridade. O 403 do
   * backend continua sendo a garantia, mas o botão não pode existir.
   *
   * A exceção é nomeada, não inferida: `contrato:ver-assinatura` NÃO é escrita —
   * é a navegação para o acompanhamento do envelope, e por isso não pede
   * permissão. `sendbar-acoes-mapeadas.test.ts` falha se o backend passar a
   * emitir uma ação que não esteja nem no mapa nem nesta lista.
   */
  const canActOnSendbar = acaoPermission
    ? can(acaoPermission) &&
      // Minuta e assinatura do Consultor: só com franquia (ConsultorSoFranquiaGuard).
      (!ACOES_SO_FRANQUIA_PARA_CONSULTOR.has(acaoPermission) || consultorLiberado)
    : acaoEvento != null && SENDBAR_ACOES_SEM_PERMISSAO.has(acaoEvento);

  // fetchData must be defined before handleSendbarAction (which uses it).
  /**
   * @param quiet - skips the loading state, so a background revalidation does
   *   not blank the panel. Every poll tick would otherwise flash the skeleton
   *   over content the user is reading.
   */
  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoadStatus('loading');
    setErrorMsg('');

    try {
      const [det, ctr, props, docs, obr] = await Promise.all([
        getDetail(opportunityId),
        getContrato(opportunityId),
        getProposals(opportunityId).catch((): OpportunityProposal[] => []),
        getChecklist(opportunityId).catch(
          (): ChecklistResult => ({
            docs: [],
            opportunityId,
            opportunityCode: '',
            opportunityName: '',
            opportunityState: '',
            stages: [],
            outrasOrigens: [],
            obrigatoriedadeDispensada: null,
          }),
        ),
        /*
         * A obra é um card LATERAL: uma queda dela não pode derrubar a tela do
         * contrato. `null` aqui significa "não deu para saber", e o card
         * simplesmente não renderiza — mesma degradação do `getProposals`.
         */
        getObra(opportunityId).catch((): ObraReadModel | null => null),
      ]);

      /*
       * The two reads run in parallel, and the contract read model can move
       * the opportunity while it is being built: opening the screen right after
       * the package was activated in Salesforce concludes an opportunity with
       * no Mútuo/Novo Mútuo/Concessão Financeira before the read model answers
       * (22/09/2026). The detail, read in the same instant, still says
       * `EM_PAGAMENTO` — and the track, fed by it, pointed at "Ativação" under
       * a card already saying "Concluída". When the two disagree the read model
       * is the newer one, so the detail is read once more.
       */
      const detAtual =
        ctr.fase !== det.backendState
          ? await getDetail(opportunityId).catch(() => det)
          : det;

      setDetail(detAtual);
      setContrato(ctr);
      setObra(obr);
      setProposals(props);
      setChecklist(docs);
      setLoadStatus('loaded');
    } catch (err) {
      // A quiet revalidation must not tear down a working screen: the envelope
      // is still out for signature and the next tick may well succeed.
      if (quiet) return;

      // A 403 is not a failure to recover from — it is "this page is not for
      // you". It gets the plain not-found screen (CLAUDE.md): naming the denial
      // would confirm the opportunity exists, and "Tentar novamente" would
      // invite a retry that can never succeed.
      if (err instanceof ContratoForbiddenError) {
        setLoadStatus('forbidden');
        return;
      }
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao carregar o contrato.';
      setErrorMsg(msg);
      setLoadStatus('error');
    }
  }, [opportunityId, getDetail, getContrato, getProposals, getChecklist, getObra]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /**
   * Retorno da Embedded Sender View do DocuSign (13/09/2026).
   *
   * O fornecedor devolve o browser para `?docusign=retorno` quando a pessoa sai
   * da tela de posicionamento — e esse redirect diz **apenas** que ela saiu:
   * pode ter clicado em Send, salvo o rascunho ou simplesmente fechado. Por
   * isso o estado real é relido da API do fornecedor (§6 do guia técnico: "não
   * confie apenas no redirect").
   *
   * ⚠️ O parâmetro é REMOVIDO da URL logo em seguida, com `replaceState`: sem
   * isso, um F5 ou um "voltar" refariam a sincronização a cada visita à página,
   * e a barra de endereços ficaria para sempre anunciando um retorno que já
   * aconteceu.
   */
  /**
   * Relê a situação do envelope depois de uma passagem pela tela do DocuSign.
   *
   * **Ponto único dos DOIS caminhos de retorno** — a janela que se fecha
   * (`useJanelaDocusign`) e a navegação de página inteira (o `useEffect`
   * abaixo, quando o popup foi bloqueado). Duas implementações divergiriam
   * exatamente no ambiente onde só uma delas roda.
   *
   * ⚠️ `confirmandoRetorno` é marcado ANTES de qualquer `await` — é o que evita
   * a barra piscar uma ação já vencida (14/09/2026). A leitura em mãos é a de
   * ANTES da sincronização, onde o envelope ainda é rascunho: a barra
   * renderizava "Posicionar campos e enviar" por alguns segundos e sumia
   * sozinha quando o `:sincronizar` chegava. Nessa janela o botão existia e era
   * mentira — clicar respondia 409 sobre um envio que a pessoa acabou de fazer.
   */
  const confirmarRetorno = useCallback(async () => {
    setConfirmandoRetorno(true);
    try {
      await sincronizarAssinatura(opportunityId);
    } catch (err) {
      // Degrada sem bloquear: quem volta da tela do DocuSign tem de ver a
      // oportunidade. O worker de reconciliação e o webhook Connect cobrem o
      // estado depois.
      addToast(
        err instanceof Error
          ? err.message
          : 'Não foi possível confirmar a situação do envelope agora.',
        'error',
      );
    } finally {
      // Só libera a barra DEPOIS de a releitura chegar: soltar antes devolveria
      // a barra antiga por um instante, que é o defeito.
      await fetchData(true);
      setConfirmandoRetorno(false);
    }
  }, [opportunityId, addToast, fetchData]);

  /**
   * Janela do DocuSign (14/09/2026). Fecha sozinha ao terminar e dispara a
   * releitura — o usuário não clica em mais nada.
   *
   * Não é iframe porque **não pode ser**: os dois hosts da Sender View mandam
   * `frame-ancestors 'self'`. O porquê medido está em `janela-docusign.ts`.
   */
  const janelaDocusign = useJanelaDocusign({
    oportunidadeId: opportunityId,
    onEncerrada: () => void confirmarRetorno(),
  });

  /*
   * Fallback: popup bloqueado ⇒ houve navegação de página inteira, e o DocuSign
   * devolveu o browser para a página de retorno, que redirecionou para cá com o
   * marcador. Este caminho continua sendo de primeira classe — bloqueador de
   * popup corporativo é comum.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!ehRetornoDoDocuSign(url.searchParams)) return;

    for (const chave of PARAMS_DE_RETORNO) url.searchParams.delete(chave);
    window.history.replaceState(null, '', url.toString());

    void confirmarRetorno();
  }, [confirmarRetorno]);

  /**
   * Keeps the signature section current while an envelope is out for signature.
   *
   * Without this the counters only moved on a full page reload, which is what
   * a person watching for a signature ends up doing by hand — repeatedly.
   *
   * The "is it still out?" question is NOT re-derived here: `contrato:ver-assinatura`
   * is the backend's own verdict that a package is in circulation, and it is
   * already what decides the sendbar. Recomputing it from the packages would
   * give the screen a second opinion, free to disagree with the bar right above.
   *
   * No budget (`null`): a signature waits on a person and can legitimately take
   * days. The bounded budget that suits an ARP calculation would offer an
   * "Atualizar" button while the envelope is simply still out.
   */
  const assinaturaEmCirculacao =
    contrato?.sendbar?.acaoEvento === 'contrato:ver-assinatura';

  useCalculationPolling(
    assinaturaEmCirculacao,
    useCallback(() => {
      void fetchData(true);
    }, [fetchData]),
    null,
  );

  /**
   * Pede uma Sender View para o pacote `sequencia` e navega para ela.
   *
   * Ponto único dos três chamadores — o CTA do rascunho, o envio do pacote
   * principal e o envio à homologada —, porque os três têm de sair da aplicação
   * do mesmo jeito. Enquanto só o CTA do rascunho fazia isso, os dois envios
   * terminavam na própria tela com o envelope parado: "enviado" na frase,
   * rascunho no DocuSign, ninguém notificado.
   *
   * ⚠️ A URL é de USO ÚNICO e vale poucos minutos: é pedida no clique e usada
   * na linha seguinte. Guardá-la em estado para reusar entrega um link que
   * responde erro de autenticação.
   */
  const abrirPosicionamento = useCallback(
    async (sequencia: 1 | 2, janela: JanelaDocusign) => {
      const { url } = await abrirPosicionamentoDocusign(opportunityId, sequencia);
      // Sem janela (popup bloqueado) `apontar` navega a página inteira — o
      // comportamento anterior a esta mudança.
      janela.apontar(url);
    },
    [opportunityId],
  );

  /**
   * Depois de criar um envelope: leva ao Tagger **se** ele tiver nascido
   * rascunho. Devolve `true` quando navegou.
   *
   * ⚠️ A pergunta é feita ao BACKEND, não deduzida do modo (`rascunho` é
   * veredito dele, releitura do que acabou de ser gravado). Em
   * `DOCUSIGN_TAB_PLACEMENT_MODE=anchor_string` — o caminho de rollback — o
   * envelope **já sai enviado**, e encadear ali responderia 409 e mostraria um
   * erro sobre um envio que deu certo. Derivar do rótulo do CTA seria a tela
   * aprendendo o modo da integração por adivinhação de texto.
   */
  const seguirParaPosicionamento = useCallback(
    async (sequencia: 1 | 2, janela: JanelaDocusign): Promise<boolean> => {
      const natureza = sequencia === 2 ? 'TERMO_CESSAO_HOMOLOGADA' : 'PRINCIPAL';
      const atual = await getContrato(opportunityId);
      const rascunho = atual.assinatura.data?.pacotes.some(
        (p) => p.rascunho && p.natureza === natureza,
      );
      if (!rascunho) return false;

      await abrirPosicionamento(sequencia, janela);
      return true;
    },
    [opportunityId, abrirPosicionamento],
  );

  /**
   * Single sendbar action handler, dispatching on the backend `acaoEvento`.
   *
   * Decision: the CTA lives in the Sendbar ONLY (never duplicated inside a
   * section). Each branch re-checks its own permission before mutating — the
   * button may be reached by non-UI paths (Enter on a focused button), and
   * write-controls.test.tsx requires the handler to consult the permission layer
   * whenever a mutation client is imported. The API still enforces 403.
   *
   * "Enviar para assinatura" moves the state machine AND notifies external
   * parties → it passes through useConfirm() (CLAUDE.md §"Ação destrutiva").
   */
  const handleSendbarAction = useCallback(async () => {
    // Navigational, not a mutation: the reminder is per-signer and lives in the
    // Assinatura section, so the bar takes the user there instead of being a
    // disabled button that names an action it cannot perform. No permission
    // check — it only opens and scrolls to a section already on screen.
    if (acaoEvento === 'contrato:ver-assinatura') {
      setAssinaturaReveal((n) => n + 1);
      return;
    }

    if (acaoEvento === 'contrato:enviar') {
      if (!canSignatureSend) return;
      // The signatories are required by the API (`EnviarAssinaturaDto`), so the
      // CTA opens the form instead of firing the request. Sending with no body
      // answered `400 VALIDATION_ERROR` every time.
      setShowEnviarDialog(true);
      return;
    }

    /*
     * "Posicionar campos e enviar" — Embedded Sender View (13/09/2026).
     *
     * Navega para fora da aplicação, para a tela do próprio DocuSign, onde a
     * pessoa arrasta os campos e clica em Send. **Não** passa por `useConfirm`:
     * abrir a tela não envia nada e não move estado nenhum — quem envia é o
     * botão de lá.
     *
     * ⚠️ A URL é de uso único e vale poucos minutos, por isso ela é pedida no
     * clique e usada na linha seguinte. Guardá-la em estado para "reusar depois"
     * entregaria um link que responde erro de autenticação.
     */
    /*
     * ⚠️ QUAL pacote vem do EVENTO, não da lista de pacotes (14/09/2026).
     * A tela pegava o PRIMEIRO rascunho e o backend preferia o PRINCIPAL: com
     * os dois em rascunho, a barra falava de um e o clique abria o outro. Quem
     * decide é quem escreveu a frase.
     */
    if (acaoEvento === 'contrato:posicionar' || acaoEvento === 'contrato:posicionar-homologada') {
      if (!canSignatureSend || posicionarPending) return;
      // ⚠️ A janela abre PRIMEIRO, no gesto — ver `abrirJanelaDocusign`.
      const janela = janelaDocusign.abrir();
      setPosicionarPending(true);
      try {
        await abrirPosicionamento(
          acaoEvento === 'contrato:posicionar-homologada' ? 2 : 1,
          janela,
        );
      } catch (err) {
        janela.fechar();
        addToast(
          err instanceof Error
            ? err.message
            : 'Erro ao abrir a tela de posicionamento do DocuSign.',
          'error',
        );
      } finally {
        /*
         * ⚠️ Antes da janela, o sucesso levava a página embora e este estado
         * nunca precisava voltar. Agora a página sobrevive: sem o `finally` o
         * botão ficaria desabilitado para sempre depois do primeiro clique.
         */
        setPosicionarPending(false);
      }
      return;
    }

    if (acaoEvento === 'contrato:enviar-homologada') {
      if (!canSignatureSend) return;
      // Os signatários da homologada são digitados (não há fonte para eles
      // hoje), então o CTA abre o formulário em vez de disparar o envio.
      setHomologadaError(null);
      setShowHomologadaDialog(true);
      return;
    }

    /*
     * Last move of the flow (`CONCLUIR`). Confirmed because it closes the
     * opportunity and `CONCLUIDA` has no transition out of it — the
     * confirmation names that, since the platform cannot observe the SAP
     * activation it is asserting is done (PRD Contratos §3 keeps cadastro,
     * ativação and payment release in Salesforce).
     */
    if (acaoEvento === 'contrato:concluir') {
      if (!canConclude) return;
      confirm.ask({
        title: 'Concluir oportunidade',
        description:
          'A oportunidade será encerrada e não há retorno desta fase. ' +
          'Confirme apenas depois que o cadastro, a ativação e a liberação de ' +
          'pagamento tiverem sido concluídos no Salesforce.',
        confirmLabel: 'Concluir',
        onConfirm: async () => {
          try {
            const res = await fetch(
              withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/transitions`),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'CONCLUIR',
                  currentState: 'EM_PAGAMENTO',
                }),
              },
            );
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              throw new Error(
                extractErrorMessage(
                  body,
                  `Falha ao concluir a oportunidade (${res.status}).`,
                ),
              );
            }
            addToast('Oportunidade concluída.', 'success');
            void fetchData();
          } catch (err) {
            // `useConfirm` swallows the rejection (it only keeps the dialog
            // open), so the message has to be raised here or the failure would
            // be silent — the dialog would just sit there.
            addToast(
              err instanceof Error
                ? err.message
                : 'Erro ao concluir a oportunidade.',
              'error',
            );
            throw err;
          }
        },
      });
      return;
    }
  }, [
    acaoEvento,
    canSignatureSend,
    canConclude,
    confirm,
    opportunityId,
    fetchData,
    addToast,
    contrato,
    posicionarPending,
  ]);

  /**
   * Envia o Termo de Cessão assinado para a empresa homologada.
   *
   * A recusa fica DENTRO do modal (que segue aberto), pela mesma razão do envio
   * principal: um toast nasce atrás do diálogo e fica ilegível justamente quando
   * é a única coisa a ler — e o que foi digitado se perderia.
   */
  const handleEnviarHomologada = useCallback(
    async (signatarios: SignatarioHomologada[]) => {
      if (!canSignatureSend) return;
      // ⚠️ PRIMEIRA instrução, antes de qualquer `await`: a ativação do gesto
      // expira em segundos e a URL só existe depois de 3 chamadas de rede.
      const janela = janelaDocusign.abrir();
      setHomologadaError(null);
      setHomologadaPending(true);
      try {
        await enviarTermoParaHomologada(opportunityId, signatarios);
        setShowHomologadaDialog(false);

        /*
         * ⚠️ O envelope da homologada também NASCE EM RASCUNHO no modo Sender
         * View — criá-lo não notifica ninguém. Por isso o clique segue direto
         * para o Tagger: é lá que a pessoa posiciona os campos e clica em Send.
         *
         * Sem este encadeamento o usuário voltava para a tela, lia "Termo de
         * Cessão enviado" e ficava SEM AÇÃO NENHUMA — o único botão capaz de
         * despachar o envelope é o da barra, e a empreiteira nunca recebia
         * nada. Medido ao vivo em 14/09/2026.
         *
         * Falhar aqui NÃO é fatal: o rascunho existe, e ao recarregar a barra
         * oferece "Posicionar campos e enviar" para retomá-lo (guia §7).
         */
        try {
          if (await seguirParaPosicionamento(2, janela)) return;
          // Modo `anchor_string`: o envelope já saiu, e aí "enviado" é verdade.
          // Não há Tagger a abrir, então a janela não tem por que ficar.
          janela.fechar();
          addToast('Termo de Cessão enviado para a empresa homologada.', 'success');
        } catch {
          janela.fechar();
          addToast(
            'O envelope da homologada foi criado, mas a tela do DocuSign não abriu. ' +
              'Use “Posicionar campos e enviar” para retomar.',
            'error',
          );
        }
        void fetchData();
      } catch (err) {
        // Falha do ENVIO: nem envelope houve. Não deixar janela órfã.
        janela.fechar();
        setHomologadaError(
          err instanceof Error
            ? err.message
            : 'Erro ao enviar o Termo de Cessão à empresa homologada.',
        );
      } finally {
        setHomologadaPending(false);
      }
    },
    [
      canSignatureSend,
      opportunityId,
      addToast,
      fetchData,
      seguirParaPosicionamento,
      janelaDocusign,
    ],
  );

  /**
   * Anula APENAS o envio do Termo de Cessão à homologada, liberando o reenvio.
   *
   * ⚠️ Não é `handleAnular`: aquele vai pela transição `ANULAR_ENVIO` e devolve
   * TODOS os contratos para a minuta. Aqui o contrato principal já está
   * assinado, e devolvê-lo desfaria assinaturas válidas por causa da homologada.
   */
  const handleAnularHomologada = useCallback(
    async ({ motivo }: { motivo: string }) => {
      if (!canSignatureVoid) return;
      setAnularHomologadaPending(true);
      try {
        await anularEnvioHomologada(opportunityId, motivo);
        setShowAnularHomologadaDialog(false);
        addToast('Envio do Termo de Cessão anulado — é possível enviar novamente.', 'success');
        void fetchData();
      } catch (err) {
        addToast(
          err instanceof Error ? err.message : 'Erro ao anular o envio do Termo de Cessão.',
          'error',
        );
      } finally {
        setAnularHomologadaPending(false);
      }
    },
    [canSignatureVoid, opportunityId, addToast, fetchData],
  );

  /**
   * Submits the signatory form to the envelope route.
   *
   * The permission is re-checked here because the dialog can be reached by
   * non-UI paths; the API still answers 403 either way.
   */
  const handleEnviarAssinatura = useCallback(
    async (payload: EnviarAssinaturaPayload) => {
      if (!canSignatureSend) return;

      // ⚠️ PRIMEIRA instrução, antes de qualquer `await` — ver
      // `abrirJanelaDocusign`. A URL da Sender View só existe depois de três
      // chamadas de rede, e a ativação do gesto não sobrevive a isso.
      const janela = janelaDocusign.abrir();
      setEnviarError(null);
      setEnviarPending(true);
      try {
        // ADR-0044: o envio é a transição GATE 3, não uma rota isolada.
        //
        // Enquanto a tela chamava `contrato/assinatura/enviar` direto, o
        // envelope saía e o estado da OPORTUNIDADE ficava em `EM_MINUTA` para
        // sempre — o stepper continuava em "Minuta" com o pacote já em
        // circulação. Pela transição, o envelope é o efeito pré-commit: os
        // guards (inclusive o prazo legal de 14 dias da COF) são avaliados
        // ANTES de o envelope sair, e o estado só muda se o DocuSign aceitar.
        //
        // A oportunidade já em `EM_ASSINATURA` (reenvio) segue pela rota
        // direta, que é idempotente — a transição responderia 422 por não haver
        // caminho a partir daquele estado.
        const jaEmAssinatura = detail?.backendState === 'EM_ASSINATURA';
        const res = jaEmAssinatura
          ? await fetch(
              withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/contrato/assinatura/enviar`),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              },
            )
          : await fetch(
              withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/transitions`),
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  event: 'ENVIAR_PARA_ASSINATURA',
                  currentState: detail?.backendState ?? 'EM_MINUTA',
                  assinatura: payload,
                }),
              },
            );
        if (!res.ok) {
          /*
           * ⚠️ NÃO leia `body.error`: no corpo do Nest esse campo é o NOME do
           * status HTTP ("Unprocessable Entity"), e o motivo vive em `message`.
           * Como `error` está sempre presente, o `??` nunca caía no fallback e
           * a frase do backend era descartada em silêncio — foi assim que a
           * recusa do DocuSign (minuta sem o marcador de assinatura) chegou ao
           * CEO como `Erro: Unprocessable Entity`, em 11/09/2026, no stage.
           * `extractErrorMessage` é o extrator único do repo exatamente por
           * isso: prioriza `errors[].message` > `message` > `error`.
           */
          const body = (await res.json().catch(() => ({}))) as Parameters<
            typeof extractErrorMessage
          >[0];
          throw new Error(
            extractErrorMessage(
              body,
              `Falha ao enviar para assinatura (${res.status}).`,
            ),
          );
        }
        setShowEnviarDialog(false);

        /*
         * Guia técnico §10.2 — UM clique (14/09/2026).
         *
         * No modo Sender View o envelope nasce RASCUNHO: este passo só o criou,
         * e ninguém foi notificado. Quem envia é o botão Send da tela do
         * DocuSign, então o clique segue direto para lá — e é por isso que o
         * CTA se chama "Posicionar campos e enviar" (o rótulo vem do backend,
         * que conhece o modo).
         *
         * Dizer "Contrato enviado para assinatura" aqui era afirmar um disparo
         * que ainda dependia de alguém clicar em Send.
         *
         * Falha ao abrir a tela NÃO é fatal: o rascunho existe e a barra passa
         * a oferecer a retomada (guia §7).
         */
        try {
          if (await seguirParaPosicionamento(1, janela)) return;
          // Modo `anchor_string`: o envelope saiu de fato neste clique. Sem
          // Tagger a abrir, a janela não tem por que ficar.
          janela.fechar();
          addToast('Contrato enviado para assinatura.', 'success');
        } catch {
          janela.fechar();
          addToast(
            'O envelope foi criado, mas a tela do DocuSign não abriu. ' +
              'Use “Posicionar campos e enviar” para retomar.',
            'error',
          );
        }
        void fetchData();
      } catch (err) {
        // O modal segue aberto para não perder o que foi digitado — e é por
        // isso que a frase vai PARA DENTRO dele: um toast nasce atrás do modal
        // e fica ilegível justamente quando é a única coisa a ler.
        // Falha do ENVIO: nem envelope houve. Não deixar janela órfã.
        janela.fechar();
        setEnviarError(
          err instanceof Error ? err.message : 'Erro ao enviar para assinatura.',
        );
      } finally {
        setEnviarPending(false);
      }
    },
    [
      canSignatureSend,
      opportunityId,
      addToast,
      fetchData,
      detail,
      seguirParaPosicionamento,
      janelaDocusign,
    ],
  );

  /**
   * Voids the envelope and returns the opportunity to the minuta phase
   * (protótipo `01g`).
   *
   * Goes through the transition, not a contract route: `ANULAR_ENVIO` is the
   * state change, and the DocuSign void is its pre-commit effect — the envelope
   * dies upstream BEFORE the platform says the package is back in drafting.
   * The reverse order would let a signatory sign a package we already consider
   * dead.
   */
  const handleAnular = useCallback(
    async ({ motivo }: { motivo: string }) => {
      if (!canSignatureVoid) return;

      setAnularPending(true);
      try {
        const res = await fetch(
          withBasePath(`/api/opportunities/${encodeURIComponent(opportunityId)}/transitions`),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'ANULAR_ENVIO',
              currentState: 'EM_ASSINATURA',
              motivoAnulacao: motivo,
            }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            extractErrorMessage(body, `Falha ao anular o envio (${res.status}).`),
          );
        }
        setShowAnularDialog(false);
        addToast('Envelope anulado — oportunidade voltou para a minuta.', 'success');
        void fetchData();
      } catch (err) {
        // Modal stays open with the typed reason — a failed action that closes
        // the modal looks like it worked.
        addToast(
          err instanceof Error ? err.message : 'Erro ao anular o envio.',
          'error',
        );
      } finally {
        setAnularPending(false);
      }
    },
    [canSignatureVoid, opportunityId, addToast, fetchData],
  );

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loadStatus === 'loading') {
    return (
      <>
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="flex justify-center py-16"
        >
          <Spinner label="Carregando contrato…" />
        </div>
      </>
    );
  }

  // ── Forbidden (403) ──────────────────────────────────────────────────────
  // Same screen as a URL that does not exist, and it names neither the profile
  // nor the permission. The API keeps the real enforcement.

  if (loadStatus === 'forbidden') {
    return <NotFoundScreen />;
  }

  // ── Error ────────────────────────────────────────────────────────────────

  if (loadStatus === 'error' || !detail || !contrato) {
    return (
      <>
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-12 text-center"
        >
          <p className="text-(--color-danger)">
            {errorMsg || 'Erro ao carregar o contrato.'}
          </p>
          <button
            type="button"
            onClick={() => void fetchData()}
            className="mt-3 font-bold text-(--secondary-600) hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      </>
    );
  }

  // ── Determine which phase section is open ────────────────────────────────

  const isMinutaOpen =
    contrato.etapaAtual === EtapaContrato.Minuta;
  const isAssinaturaOpen =
    contrato.etapaAtual === EtapaContrato.Assinatura;
  const isContratoOpen =
    contrato.etapaAtual === EtapaContrato.Cadastro ||
    contrato.etapaAtual === EtapaContrato.Ativacao ||
    contrato.etapaAtual === EtapaContrato.Pagamento;
  /**
   * A seção "Contrato" abre também na MINUTA — é a fase em que o pedido nasceu
   * (10/09/2026): quem está montando a minuta precisa ver quais contratos o
   * Salesforce já criou e em que status eles estão. Nas etapas de cadastro em
   * diante ela continua aberta pelo mesmo motivo de antes.
   *
   * O bloco de dados bancários NÃO acompanha: ele é o GATE 3, e abrir na minuta
   * mostraria um gate que ainda não é a vez de ninguém resolver.
   */
  const isContratoSectionOpen =
    isContratoOpen || contrato.etapaAtual === EtapaContrato.Minuta;


  const pendencias =
    contrato.pendencias.status === 'ok' && contrato.pendencias.data
      ? contrato.pendencias.data
      : null;

  return (
    <>
      {/* ── Header (.head) ──────────────────────────────────────────────── */}
      <div className="mb-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusPill variant={headPillVariant(contrato.headPill.variant)}>
            {contrato.headPill.texto}
          </StatusPill>
        </div>
        <h1 className="mt-2 text-(length:--t-h2) font-bold leading-tight">
          {detail.title}
        </h1>
        <div className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
          <Link
            href={`/clientes/${detail.clientId}`}
            className="font-bold text-(--secondary-600) hover:underline"
          >
            {detail.clientName}
          </Link>
          {detail.clientDocument ? ` · ${detail.clientDocument}` : ''}
        </div>

        {/* meta row */}
        <div className="mt-4 flex flex-wrap gap-9 border-t border-(--color-border) pt-4">
          <div>
            <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
              Proprietário
            </div>
            <div className="mt-0.5 text-(length:--t-caption) font-bold">
              {detail.owner
                ? `${detail.owner}${detail.ownerRole ? ` · ${detail.ownerRole}` : ''}`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
              Código
            </div>
            <div className="mt-0.5 text-(length:--t-caption) font-bold">{detail.code}</div>
          </div>
          {/*
            * A zona do LT no TOPO desta fase (18/09/2026). Ela vivia no
            * "Mais informações" do card de dados, atrás de um clique: o
            * cabeçalho do contrato mostrava dois campos, e quem chegava aqui
            * perdia de vista a zona que as outras três fases exibem de relance.
            * Subiu de lá para cá — não foi copiada, senão a mesma resposta
            * apareceria duas vezes na mesma tela.
            */}
          <div>
            <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
              {ZONA_VENDA_FIELD_LABEL}
            </div>
            <div className="mt-0.5 text-(length:--t-caption) font-bold">
              {textoZonaVenda(detail.profitCenters) ?? '—'}
            </div>
          </div>
          {/*
           * Quem responde pela MINUTA, ao lado de Proprietário/Código/Zona —
           * o par exato do "Analista SNEG · reatribuir" que a análise mostra na
           * barra `sneg-meta` do cabeçalho dela.
           *
           * ⚠️ Nasceu dentro da seção "Minuta" (a 5ª colapsável) e ninguém o
           * achava: quem opera a fase relatou "não estou vendo o botão de
           * reatribuir" com a tela certa aberta e o card já carregado. SUBIU
           * para cá — não foi copiado, pela mesma razão que a Zona de venda
           * acima: a mesma resposta em dois pontos da tela dá duas versões do
           * mesmo fato.
           *
           * Ele mesmo decide se aparece: some antes de a oportunidade entrar na
           * fase (404 ⇒ `null`), e o link de reatribuir é gateado, mas o NOME
           * não.
           */}
          <MinutaAtribuicaoMeta opportunityId={opportunityId} />
        </div>
      </div>

      {/*
       * Trilhas paralelas (Fluxo Principal · Garantia · Obra) — o MESMO
       * componente que todas as outras fases montam.
       *
       * ⚠️ A fase de contrato era a última que ainda desenhava a régua antiga
       * (`OpportunityPhaseStepper`, só a trilha principal). O usuário notou em
       * "Cadastro / Ativação" — *"a timeline voltou para o layout antigo. Sem
       * mostrar obra e/ou garantia"* —, mas a troca acontecia ao ENTRAR na fase
       * de contrato (`EM_MINUTA`), e é justamente onde garantia e obra mais
       * importam: a minuta depende da garantia lavrada e a ativação depende da
       * obra confirmada. Ver as duas trilhas exigia voltar a uma tela anterior.
       *
       * Dirigido pela etapa do CONTRATO, como o header/breadcrumb/STATUS acima
       * — o estado da oportunidade fica para trás dela (enviar o envelope
       * avança `MINUTA → ASSINATURA` antes de `backendState` acompanhar), então
       * usar `backendState` aqui punha a trilha em "Minuta" enquanto o resto da
       * página dizia "Em assinatura" (RN-F6-01). Oportunidade concluída mantém
       * precedência pelo `status` (`concluída` → último passo).
       */}
      <OpportunityFlowTabs
        opportunityId={opportunityId}
        backendState={phaseStateForEtapa(contrato.etapaTrilha) ?? detail.backendState}
        status={detail.status}
        /*
         * A etapa vai TAMBÉM crua, não só por `phaseStateForEtapa`: `CADASTRO`,
         * `ATIVACAO` e `PAGAMENTO` colapsam no mesmo `EM_PAGAMENTO`, então o
         * estado não sabe qual dos dois passos finais está ativo. Só a etapa
         * sabe (VBR-636).
         *
         * ⚠️ É `etapaTrilha`, não `etapaAtual`: `contracts.stage` nunca passa de
         * `CADASTRO` (cadastro, ativação e liberação de pagamento correm no
         * Salesforce), então com a etapa crua o passo "Em pagamento" era
         * INALCANÇÁVEL e toda oportunidade pós-assinatura ficava em "Ativação"
         * até `CONCLUIDA` pular para o último passo. Quem desempata os dois é o
         * espelho do org, e o veredito é do backend (21/09/2026).
         */
        etapa={contrato.etapaTrilha}
        /*
         * 22/09/2026 — sem Mútuo, Novo Mútuo ou Concessão Financeira o passo
         * "Em pagamento" é pulado. Veredito do backend; a trilha só o desenha
         * como "Não se aplica", nunca com o check verde de um pagamento feito.
         */
        pagamentoPulado={contrato.pagamentoNaoSeAplica}
      />


      {/* ── Two-column layout (.layout) ────────────────────────────────── */}
      {/* 1fr 340px above 961px; 1-col below */}
      <div className="grid items-start gap-[22px] min-[961px]:grid-cols-[1fr_340px]">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          {/* 1. Dados da oportunidade */}
          <DadosOportunidadeSection
            opportunity={detail}
            headPill={contrato.headPill}
            faseLabel={contrato.faseLabel}
          />

          {/* 2. Propostas (collapsible, collapsed) */}
          <PropostasSection
            proposals={proposals}
            opportunityId={opportunityId}
            /*
             * A MESMA resolução da trilha logo acima (e pela mesma razão): a
             * etapa do contrato corre à frente do estado da oportunidade, e só
             * ela separa "Cadastro / Ativação" de "Em pagamento".
             */
            fase={{
              backendState: phaseStateForEtapa(contrato.etapaTrilha) ?? detail.backendState,
              status: detail.status,
              etapa: contrato.etapaTrilha,
            }}
          />

          {/*
            * 2b. Totais - Recursos Financeiros — os seis campos da
            * `Opportunity` no Salesforce, somados sobre os recursos financeiros
            * das propostas eleitas.
            *
            * Sem condição de fase: o backend devolve o slot `null` enquanto a
            * oportunidade está em preenchimento, e esta view só existe nas fases
            * do contrato. Depois de "Propostas" pela mesma razão das outras
            * telas — é sobre as eleitas que ele soma. `mb-4` é o ritmo desta
            * coluna (o mesmo de `CollapsibleSection`/`DataSection`).
            */}
          <TotaisRecursosFinanceirosCard
            totais={detail.totaisRecursosFinanceiros}
            className="mb-4"
          />

          {/* 3. Documentos da oportunidade */}
          <DocumentosSection checklist={checklist} opportunityId={opportunityId} />

          {/*
            4. Parecer técnico — SNEG (leitura), o MESMO componente da tela de
            aprovação.

            Era um stub: um título, a frase de rodapé e um comentário dizendo
            que a CTR-14 montaria o painel aqui. O parecer é o documento que
            sustenta o contrato que esta tela está gerando, e ele não muda de
            conteúdo ao mudar de fase — some da tela é que não pode.

            ⚠️ É também o alvo da âncora `#parecer` do card "Análises" ao lado:
            sem esta seção o botão "Ir para o parecer" rolaria para lugar
            nenhum. Nunca `ParecerPanel`: aquele EDITA, gera e emite, e aqui o
            parecer é documento de registro.
          */}
          <div className="mb-4">
            <ParecerReadonlySection opportunityId={opportunityId} />
          </div>

          {/* 5. Minuta (CTR-14) */}
          {/*
           * Uma seção só, com o corpo alternando. O responsável pela minuta NÃO
           * mora aqui — ele está na barra de metadados do cabeçalho, junto de
           * Proprietário/Código/Zona (ver o comentário lá). Repeti-lo aqui daria
           * duas respostas para o mesmo fato na mesma tela.
           */}
          <CollapsibleSection
            id="minuta"
            title="Minuta"
            defaultOpen={isMinutaOpen}
            unavailable={contrato.minutas.status === 'unavailable'}
          >
            {/*
              FORA do branch de propósito: o alerta não depende da lista de
              minutas, e a falha de leitura DELA não pode apagar o aviso de que
              a minuta não segue o padrão — que é o que muda a conferência do
              documento.
            */}
            <AlertaAlteracaoMinutaPadrao aviso={contrato.alteracaoMinutaPadrao} />
            {/*
              Fora da `MinutaSection` de propósito, como o alerta acima: a lista
              de minutas degrada sozinha, e a falha DELA não pode apagar o aviso
              de que o org tem um contrato sem minuta aqui.
            */}
            <LacunasDeMinuta lacunas={contrato.lacunasDeMinuta} />
            {contrato.minutas.status === 'unavailable' ? (
              <p role="alert" className="text-(length:--t-caption) text-(--color-warning)">
                {contrato.minutas.error ?? 'Informações da minuta temporariamente indisponíveis.'}
              </p>
            ) : (
              <MinutaSection
                minutas={contrato.minutas.data ?? []}
                readiness={contrato.readiness.minuta}
                opportunityId={opportunityId}
                onRevalidate={() => void fetchData()}
              />
            )}
          </CollapsibleSection>

          {/* 6. Assinatura (CTR-15) */}
          <AssinaturaBlock
            opportunityId={opportunityId}
            assinatura={contrato.assinatura}
            defaultOpen={isAssinaturaOpen}
            revealSignal={assinaturaReveal}
            onRevalidate={() => void fetchData()}
            onToast={(msg, variant) => addToast(msg, variant ?? 'info')}
            onAnular={
              canSignatureVoid && detail?.backendState === 'EM_ASSINATURA'
                ? () => setShowAnularDialog(true)
                : undefined
            }
          />

          {/*
            6b. Termo de Cessão (protótipo `01g`, `#cessao` — 13/09/2026).

            Renderiza SÓ quando o Termo se aplica, isto é, quando a oportunidade
            tem obra vinculada por recursos financeiros. O veredito é do backend
            (`termoCessao.aplicavel`); derivar isso aqui exigiria que a tela
            conhecesse o vínculo de obra da proposta.

            Seção degradada some junto: uma leitura que falhou não pode virar
            "não se aplica" — quem precisa saber que ela caiu é o suporte, e o
            `status` viaja no payload para isso.
          */}
          {contrato.termoCessao.status === 'ok' && contrato.termoCessao.data?.aplicavel && (
            <CollapsibleSection
              id="termo-cessao"
              title="Termo de Cessão"
              defaultOpen={isAssinaturaOpen}
            >
              <TermoCessaoSection
                termo={contrato.termoCessao.data}
                pacoteHomologada={
                  contrato.assinatura.data?.pacotes.find(
                    (p) => p.natureza === 'TERMO_CESSAO_HOMOLOGADA',
                  ) ?? null
                }
                onEnviar={
                  contrato.termoCessao.data.podeEnviar && canSignatureSend
                    ? () => {
                        setHomologadaError(null);
                        setShowHomologadaDialog(true);
                      }
                    : undefined
                }
                onAnular={
                  contrato.termoCessao.data.podeAnular && canSignatureVoid
                    ? () => setShowAnularHomologadaDialog(true)
                    : undefined
                }
              />
            </CollapsibleSection>
          )}

          {/* 7a. Contrato (CTR-16 §1) — contratos do Salesforce, com o status de lá */}
          <ContratoSection
            contratos={contrato.contratosCrm}
            defaultOpen={isContratoSectionOpen}
          />

          {/*
            A seção "Dados bancários e fornecedor" (CTR-16 §2) foi RETIRADA da
            tela em 10/09/2026, em todas as etapas: o cadastro de fornecedor e
            a abertura do RITM no Service Now correm hoje fora desta
            plataforma, e a seção anunciava um gate que ninguém opera por aqui.

            O backend segue intacto — `GET .../contrato/dados-bancarios`,
            `POST .../contrato/dados-bancarios:solicitar-ritm` e o slot
            `dadosBancarios` do read model continuam publicados e alimentando
            o `pagamento-readiness`. Restaurar a seção é remontá-la a partir de
            `git show <este commit>^:apps/web/src/components/opportunities/contrato-view.tsx`.
          */}
        </div>

        {/* ── Aside panel (.panel) — sticky above 961px ──────────────── */}
        <div className="flex flex-col gap-4 min-[961px]:sticky min-[961px]:top-4">
          {/*
            Obra (Converge) — protótipos 01h/01i/01j. Renderiza quando existe
            obra VINCULADA; o andamento pode não ter chegado ainda, e o card
            diz isso em vez de inventar uma pill.
          */}
          {obra?.selecionada && (
            <ObraCard
              obra={obra.selecionada}
              andamento={obra.andamento}
              statusInterno={obra.statusInterno}
            />
          )}

          {/*
            Análises — o MESMO card da fase de análise e da aprovação
            (ADO — 10/09/2026).

            Antes esta tela recebia a seção `analises` PRONTA do read model do
            contrato, e ela tinha UMA linha ("Análise de perfil (crédito)") com
            as outras marcadas `deferred` no código desde a entrega: da minuta
            em diante o usuário perdia de vista viabilidade, DDI, garantia,
            documentação, TIR/VPL, alçada e recomendação — tudo o que sustentou
            a decisão que gerou o contrato. A seção do backend foi REMOVIDA no
            mesmo PR: mantê-la sem consumidor deixaria uma segunda fonte da
            mesma informação.
          */}
          <AnalisesCard opportunityId={opportunityId} codigo={detail.code} />

          {/* Pendências */}
          {pendencias && pendencias.total > 0 && (
            <PendenciasCard pendencias={pendencias} />
          )}

          {/*
            Cadeia de aprovação (protótipos 01f/01g) — omitida quando não há
            retrato lido do Salesforce. Antes o card era um <aside> com título e
            NADA embaixo, porque o backend devolvia `null` fixo.

            ⚠️ Fica ABAIXO de Pendências (pedido do negócio, 10/09/2026): a
            aprovação já aconteceu quando esta tela abre — é registro do que
            sustentou o contrato —, enquanto a pendência é o que ainda pede ação
            de alguém. O que exige ação vem primeiro na coluna.
          */}
          {contrato.cadeiaAprovacao !== null && (
            <CadeiaAprovacaoCard
              outcomeLabel={contrato.cadeiaAprovacao.outcomeLabel}
              outcomePill={contrato.cadeiaAprovacao.pill}
              lidoEm={contrato.cadeiaAprovacao.lidoEm}
              niveis={contrato.cadeiaAprovacao.niveis}
            />
          )}

          {/* Obra — omitted when null */}
          {contrato.obra !== null && (
            <aside className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5">
              <h2 className="mb-3.5 text-(length:--t-h4) font-bold">Obra · Nova Imagem</h2>
            </aside>
          )}
        </div>
      </div>

      {/* ── Sendbar (fixed bar at the bottom) ───────────────────────────── */}
      {/* Omitida da assinatura em diante a pedido do negócio (11/09/2026) —
          `sendbarVisivel` carrega o porquê e o que reabre. É omissão de FRONT:
          o read model continua emitindo a barra inteira. */}
      {confirmandoRetorno || janelaDocusign.aguardando ? (
        /*
         * Retorno do DocuSign em confirmação. A barra existe e não oferece
         * nada: o estado em mãos é o de ANTES do envio, e o CTA dele
         * ("Posicionar campos e enviar") já não vale — clicar responderia 409.
         * Some sozinha quando a releitura chega.
         */
        <Sendbar
          sendbar={{
            mensagem: janelaDocusign.aguardando
              ? 'Posicionando os campos no DocuSign'
              : 'Confirmando a situação no DocuSign',
            mensagemDetalhe: janelaDocusign.aguardando
              ? 'A tela do DocuSign está aberta em outra janela. Posicione os campos de ' +
                'assinatura e clique em Enviar por lá — a janela fecha sozinha e esta tela ' +
                'se atualiza.'
              : 'Estamos relendo o envelope no DocuSign para saber o que aconteceu. ' +
                'Isso leva alguns segundos.',
            acaoLabel: null,
            acaoEvento: null,
            acaoHabilitada: false,
            motivoBloqueio: null,
          }}
          onAction={handleSendbarAction}
          canAct={false}
        />
      ) : (
        sendbarVisivel(detail.backendState, contrato.sendbar.acaoEvento) && (
          <Sendbar
            sendbar={contrato.sendbar}
            onAction={handleSendbarAction}
            canAct={canActOnSendbar}
          />
        )
      )}

      {/* Signatory form for "Enviar para assinatura" (CTR-8 — HU-03.1) */}
      <EnviarAssinaturaDialog
        open={showEnviarDialog}
        pending={enviarPending}
        error={enviarError}
        signatarioLt={contrato.readiness.assinatura.signatarioLt}
        representanteSugerido={contrato.readiness.assinatura.representanteSugerido}
        onCancel={() => {
          setEnviarError(null);
          setShowEnviarDialog(false);
        }}
        onSubmit={(payload) => void handleEnviarAssinatura(payload)}
      />

      {/* "Anular envio" (protótipo 01g — modal #modalAnular) */}
      {showAnularDialog && (
        <AnularEnvioDialog
          envelopeLabel={
            contrato.assinatura.status === 'ok'
              ? (contrato.assinatura.data?.pacotes[0]?.envelopeExternoId ?? null)
              : null
          }
          pending={anularPending}
          onCancel={() => setShowAnularDialog(false)}
          onConfirm={handleAnular}
        />
      )}

      {/* Termo de Cessão → empresa homologada (13/09/2026) */}
      {showHomologadaDialog && (
        <EnviarHomologadaDialog
          pending={homologadaPending}
          erro={homologadaError}
          onCancel={() => setShowHomologadaDialog(false)}
          onConfirm={(signatarios) => void handleEnviarHomologada(signatarios)}
        />
      )}

      {/*
        "Anular envio" do Termo de Cessão — o MESMO diálogo do pacote principal,
        com outro handler. A lista fechada de motivos é a mesma decisão de
        negócio (o motivo vai para o envelope e para a trilha SOX), e uma cópia
        com outros motivos faria duas anulações registrarem vocabulários
        diferentes para o mesmo tipo de fato.
      */}
      {showAnularHomologadaDialog && (
        <AnularEnvioDialog
          envelopeLabel={
            contrato.assinatura.status === 'ok'
              ? (contrato.assinatura.data?.pacotes.find(
                  (p) => p.natureza === 'TERMO_CESSAO_HOMOLOGADA',
                )?.envelopeExternoId ?? null)
              : null
          }
          consequencia={
            'a empresa homologada deixa de poder assinar — o contrato principal, ' +
            'já assinado, não é afetado e o Termo pode ser enviado de novo'
          }
          pending={anularHomologadaPending}
          onCancel={() => setShowAnularHomologadaDialog(false)}
          onConfirm={handleAnularHomologada}
        />
      )}

      {/* Toast container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Confirm dialog for state-machine-moving actions */}
      {confirm.dialog}
    </>
  );
}
