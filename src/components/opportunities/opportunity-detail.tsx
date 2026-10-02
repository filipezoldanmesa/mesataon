'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { customerReference, sapAndName } from '@/lib/clients/customer-reference';
import { TipoProposta } from '@/lib/proposals/franquia-proposal.types';
import { formatInstantDateBR } from '@/lib/date-format';
import {
  opportunityAssetClassPills,
  opportunityAssetClassText,
} from '@/lib/opportunities/asset-class';
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
import {
  SITUACAO_MAPA_DA_REDE_FIELD_LABEL,
  STATUS_MAPA_DA_REDE_FIELD_LABEL,
  STATUS_MAPA_DA_REDE_HELP,
  textoSituacaoMapaDaRede,
  textoStatusMapaDaRede,
} from '@/lib/mapa-da-rede';
import {
  ALTERACAO_MINUTA_PADRAO_FIELD_LABEL,
  DESCRICAO_ALTERACAO_MINUTA_PADRAO_FIELD_LABEL,
  textoAlteracaoMinutaPadrao,
} from '@/lib/opportunities/alteracao-minuta-padrao';
import { FieldHint } from '@/components/field-hint';

import { StatusPill, type PillVariant } from '@/components/status-pill';
import { DevolucaoAoLtNote } from '@/components/opportunities/devolucao-ao-lt-note';
import { RoyaltyFranquiaNote } from '@/components/opportunities/royalty-franquia-note';
import { DdiDetalhesTrigger } from '@/components/opportunities/ddi-detalhes-trigger';
import { SalesforceRecordLink } from '@/components/opportunities/salesforce-record-link';
import {
  PRIMARY_ACTION_BTN,
  SECONDARY_OUTLINE_BTN,
} from '@/components/button';
import { IN_FIELD, IN_LABEL, IN_SELECT } from '@/components/ui/field-classes';
import { Gate1SendToAnalysis } from '@/components/opportunities/gate1-send-to-analysis';
import {
  getOpportunityDetail,
  getOpportunityProposals,
  getOpportunityTeam,
  patchOpportunityDetail,
  putOpportunityProposals,
} from '@/lib/opportunities/opportunity-detail.data';
import { listPendencias } from '@/lib/pendencias/pendencias.data';
import { PendenciasCard } from '@/components/opportunities/pendencias-card';
import type { ListPendenciasResult } from '@/lib/pendencias/types';
import { getChecklist } from '@/lib/documents/documents.data';
import type { ChecklistResult, DocStatus } from '@/lib/documents/types';
import { getDdiResult, runDdi } from '@/lib/opportunities/ddi.data';
import { DDI_RISK_PILL } from '@/lib/opportunities/ddi-risk-pill';
import {
  DDI_SITUACAO_PILL,
  situacaoTemVeredito,
} from '@/lib/opportunities/ddi-situacao-pill';
import type { DdiResult } from '@/lib/opportunities/ddi.types';
import type {
  OpportunityDetail as OpportunityDetailType,
  OpportunityPatchPayload,
  OpportunityProposal,
  OpportunityStatus,
  OpportunityTeamMember,
  TriggerTransitionResult,
} from '@/lib/opportunities/types';
import { OpportunityNotFoundError } from '@/lib/opportunities/types';
import { statusPropostaExibido } from '@/lib/opportunities/status-proposta-exibido';
import { camposNovaImagemPista } from '@/lib/opportunities/nova-imagem-pista';
import {
  camposTextosDoLt,
  PARECER_LT_FIELD_LABEL,
} from '@/lib/opportunities/textos-do-lt';
import { equipeMetaBarValue } from '@/lib/opportunities/equipe-meta-bar';
import {
  CardCollapseToggle,
  useCardCollapse,
} from '@/components/proposals/card-collapse';
import { AlcadaSagaPanel } from '@/components/opportunities/alcada-saga-panel';
import { TotaisRecursosFinanceirosCard } from '@/components/opportunities/totais-recursos-financeiros-card';
import { AnaliseView } from '@/components/opportunities/analise-view';
import { AprovacaoView } from '@/components/opportunities/aprovacao-view';
import { ContratoView } from '@/components/opportunities/contrato-view';
import {
  CalculatingNotice,
  CalculationUnavailableNotice,
  STALE_VALUES_CLASS,
  StaleValuesCaption,
  UnknownStatusNotice,
} from '@/components/indicators/indicator-notices';
import { useCalculationPolling } from '@/hooks/use-calculation-polling';
import {
  IndicatorStatus,
  INDICATOR_STATUS_LABEL,
  INDICATOR_STATUS_PILL_VARIANT,
} from '@/lib/opportunities-indicators/indicator-status';
import { formatPercentFromDecimal } from '@/lib/opportunities-indicators/format';
import { recalculateOpportunityIndicators as defaultRecalculateIndicators } from '@/lib/opportunities-indicators/opportunity-indicators.data';
import {
  AGUARDANDO_PROPOSTAS_MSG,
  consolidadoFoiSubmetido,
} from '@/lib/opportunities-indicators/recalculo-consolidado';
import { OpportunityFlowTabs } from '@/components/opportunities/opportunity-flow-tabs';
import { GarantiasIndicadasCard } from '@/components/opportunities/garantias-indicadas-card';
import { Permission } from '@/lib/auth-permissions';
import { usePermissions } from '@/hooks/use-permissions';
import { useSendbarReserve } from '@/hooks/use-sendbar-reserve';
import { NovaPropostaSelectorModal } from '@/components/proposals/nova-proposta-modal';
import { TeamSection } from '@/components/opportunities/team-section';
import { teamMemberQualifier } from '@/lib/opportunities/team.types';
import { PicklistSelect } from '@/components/picklists/picklist-select';
import { PicklistField } from '@/lib/picklists/picklists.types';
import { Finalidade } from '@/lib/picklists/salesforce-values';
import { RecebedorClientCombobox } from '@/components/opportunities/recebedor-client-combobox';
import { searchClients } from '@/lib/clients/clients.data';
import { rotaDoApp } from '@/lib/navegacao-segura';

/**
 * Same screen-level recorte the creation wizard applies (`FINALIDADE_ALLOW` in
 * `nova-oportunidade.tsx`) — a product decision of 11/08/2026, not an API limit.
 *
 * `PicklistSelect`'s `allow` only ever TIGHTENS the catalog and spares the value
 * already chosen, so an opportunity sitting on `Renovação` stays readable and
 * selectable while the offered set stays the two the product asked for. A
 * hardcoded local list would instead render raw Salesforce values as labels and
 * drift from the catalog the rest of the app reads.
 */
const FINALIDADE_ALLOW = [Finalidade.Implantacao, Finalidade.Vinculacao] as const;

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

/**
 * Stable module-level default for `loadPendencies`. Must NOT be an inline
 * arrow in the prop default: `fetchDetail` (useCallback) depends on
 * `loadPendencies`, so a fresh function each render would make `fetchDetail`
 * unstable and re-trigger its effect on every render (infinite reload loop,
 * screen stuck in "Carregando").
 */
const defaultLoadPendencies = (opportunityId: string): Promise<ListPendenciasResult> =>
  listPendencias({ opportunityRef: opportunityId });

/**
 * Stable module-level default for `loadDocuments` (same rationale as
 * `defaultLoadPendencies`). Loads the opportunity's document checklist for the
 * summary section; failures keep the section hidden.
 */
const defaultLoadDocuments = (opportunityId: string): Promise<ChecklistResult> =>
  getChecklist(opportunityId);

/**
 * Stable module-level default for `loadDdi` — loads the DDI (Integridade)
 * summary for the "Análises" aside card. Before GATE 1 the endpoint has no
 * analysis (404/503); failures render the card as "Não iniciada".
 */
const defaultLoadDdi = (opportunityId: string): Promise<DdiResult | null> =>
  getDdiResult(opportunityId);

/**
 * Stable module-level default for `retryDdi` — re-runs the integrity due
 * diligence (`POST .../ddi:run`). The only path in the interface to a DDI stuck
 * in `ERRO`, which otherwise blocks GATE 1 forever (ADO 67943).
 */
const defaultRetryDdi = (opportunityId: string): Promise<DdiResult | null> =>
  runDdi(opportunityId);

/**
 * Stable module-level default for `loadTeam` — fetches the opportunity team
 * members via the BFF (`GET /api/opportunities/:id/team`). On error returns []
 * so the header degrades gracefully to "—" without blocking the detail render.
 */
const defaultLoadTeam = (opportunityId: string): Promise<OpportunityTeamMember[]> =>
  getOpportunityTeam(opportunityId);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadStatus = 'loading' | 'loaded' | 'error' | 'not-found';
type SaveStatus = 'idle' | 'saving' | 'error';

type Props = {
  opportunityId: string;
  /** Injectable for tests; defaults to the real BFF client. */
  load?: (id: string) => Promise<OpportunityDetailType>;
  /** Lists the proposals created for the opportunity (F3) — injectable for tests. */
  loadProposals?: (id: string) => Promise<OpportunityProposal[]>;
  /** Loads the opportunity team (principal + apoios) — injectable for tests. */
  loadTeam?: (id: string) => Promise<OpportunityTeamMember[]>;
  patch?: (id: string, data: OpportunityPatchPayload) => Promise<OpportunityDetailType>;
  putProposals?: (id: string, ids: string[]) => Promise<OpportunityDetailType>;
  loadPendencies?: (id: string) => Promise<ListPendenciasResult>;
  /** Loads the document checklist for the "Documentos da oportunidade" summary. */
  loadDocuments?: (id: string) => Promise<ChecklistResult>;
  /** Loads the DDI (Integridade) summary for the "Análises" card. */
  loadDdi?: (id: string) => Promise<DdiResult | null>;
  /** Re-runs the DDI from the "Análises" card — injectable for tests. */
  retryDdi?: (id: string) => Promise<DdiResult | null>;
  /** CTA da "Análise financeira" — injectable for tests. */
  recalculateIndicators?: (id: string) => Promise<unknown>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/*
 * Keyed by `OpportunityStatus` — the ACCENTED values the BFF actually emits
 * (`EM_ANALISE → 'análise'`, see `app/api/opportunities/list/route.ts`), and
 * typed as `Record<OpportunityStatus, …>` so a missing/misspelled key is a
 * compile error instead of a silent fallback.
 *
 * They were keyed `analise`/`aprovacao`/`concluida` (unaccented), so every
 * lookup for those three phases missed: the chip fell back to the raw machine
 * value — "análise" in the header AND in the STATUS field — and the pill lost
 * its variant. Reproduced right after GATE 1, which sets the status optimistically.
 */
const STATUS_VARIANT: Record<OpportunityStatus, PillVariant> = {
  preenchimento: 'warning',
  'análise': 'info',
  'aprovação': 'info',
  contrato: 'success',
  'concluída': 'neutral',
};

const STATUS_LABEL: Record<OpportunityStatus, string> = {
  preenchimento: 'Em preenchimento',
  'análise': 'Em análise',
  'aprovação': 'Em aprovação',
  contrato: 'Em contrato',
  'concluída': 'Concluída',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Date + time of an ISO-8601 instant (used for "Último cálculo"). */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sales zones arrive as a comma-joined list from the CRM (`buildAreaVenda`). A
 * long list stretches the header, so cap the display at the first two zones and
 * append an ellipsis when there are more.
 */
function formatSalesZone(salesZone: string | null): string | null {
  if (!salesZone) return null;
  const zones = salesZone
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);
  if (zones.length === 0) return null;
  if (zones.length <= 2) return zones.join(', ');
  return `${zones.slice(0, 2).join(', ')}, …`;
}

/** Section card wrapper used throughout the detail screen. */
function Section({
  id,
  title,
  action,
  collapsible = false,
  children,
}: {
  id?: string;
  title: string;
  action?: React.ReactNode;
  /**
   * Whether this card collapses from its own header.
   *
   * Per-card, not global: the prototype marks exactly which sections carry the
   * chevron (`01b-oportunidade.html` puts `onclick="toggleSec(this)"` on
   * "Análise financeira", "Documentos da oportunidade" and "Garantias", and
   * leaves "Dados da oportunidade" and "Propostas desta oportunidade" fixed).
   * Collapsing everything would be a different screen.
   */
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const collapse = useCardCollapse();

  return (
    <div
      id={id}
      {...(collapsible ? collapse.sectionProps : {})}
      className="mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
    >
      <div
        {...(collapsible ? collapse.headProps : {})}
        className="mb-3.5 flex items-baseline justify-between gap-2.5"
      >
        <h2 className="text-(length:--t-h4) font-bold">{title}</h2>
        {action}
        {collapsible && <CardCollapseToggle {...collapse.toggleProps} />}
      </div>
      {children}
    </div>
  );
}

/** Pill variant + label for a checklist doc status in the summary section. */
function docStatusPill(status: DocStatus): { variant: PillVariant; label: string } {
  switch (status) {
    case 'validado':
      return { variant: 'success', label: 'Validado' };
    case 'anexado':
      return { variant: 'info', label: 'Anexado' };
    case 'vencido':
      return { variant: 'danger', label: 'Vencido' };
    case 'repo':
      return { variant: 'info', label: 'No repositório' };
    default:
      return { variant: 'warning', label: 'Pendente' };
  }
}


/**
 * "Análises" aside card (F10 — mirrors the prototype `01b` `.anpanel`). Shows
 * the DDI/Integridade risk as a pill. The DDI only exists after GATE 1, so
 * before analysis (or on load error) it renders "Não iniciada".
 *
 * ## `error` carries the REASON and a way out (ADO 67943)
 *
 * The prototype only ever draws the happy path (`pill s Baixo`), so this card
 * shipped with a bare red "Erro" pill and nothing else. Measured on stage in
 * `OPP-2026-000028`: the DDI failed at creation, the card said "Erro" with no
 * explanation, GATE 1 refused `ENVIAR_PARA_ANALISE` on `ddi_finalizado`, and
 * the sendbar's deep link ("Ver análise (DDI) →") landed right back on this
 * mute pill. Three days later the opportunity was still in `Em preenchimento`.
 *
 * So the failed state now renders (a) the pt-BR `rationale` the backend
 * persisted — which names what happened and what clears it — and (b) "Tentar
 * novamente", the only path in the interface to `POST .../ddi:run`.
 *
 * The CTA is offered for EVERY failure reason on purpose. The retry worker
 * refuses the ones whose answer cannot change on its own (each attempt bills a
 * NeoWay credit), but a human retry is exactly what picks up an upstream fix —
 * the document corrected in the CRM, the credential reprovisioned.
 *
 * ## Só na fase de PREENCHIMENTO (11/09/2026)
 *
 * Da análise em diante a tela troca de VIEW (`AnaliseView`/`AprovacaoView`/
 * `ContratoView`), e a lateral de lá monta o `AnalisesCard` compartilhado. Este
 * card fica onde ainda não há análise
 * a resumir, e fica porque é ele que carrega o "↻ Tentar novamente": o card
 * compartilhado não tem esse CTA, e usá-lo aqui deixaria uma DDI encalhada sem
 * nenhuma saída na interface, justamente na fase em que o GATE 1 a cobra.
 */
function DdiAnalisesCard({
  ddi,
  error,
  canRetry,
  onRetry,
  opportunityId,
  opportunityCode,
}: {
  ddi: DdiResult | null;
  error: boolean;
  /** Whether this profile may trigger a re-run (write-capable profiles only). */
  canRetry: boolean;
  /** Re-runs the DDI and reloads the summary. Resolves when the reload is done. */
  onRetry: () => Promise<void>;
  /** Alvo do detalhamento (ADO 67882) — o modal recarrega a análise no clique. */
  opportunityId: string;
  /** Subtítulo do modal: a oportunidade a que a análise se refere. */
  opportunityCode: string;
}) {
  const [retrying, setRetrying] = useState(false);
  const failed = !error && ddi?.status === 'error';
  /*
   * "Não aplicável" com o MOTIVO ao lado (ADO 67943, reaberto em 31/08/2026).
   *
   * O negócio pediu que a DDI não fosse solicitada quando o LT elege só
   * franquia; o backend suprime a solicitação e devolve `NAO_ELEGIVEL` com o
   * `racional` que nomeia o conserto. A frase é dele (ADR-0018) — a tela
   * renderiza. Sem ela sobraria uma pill muda, que é exatamente o defeito que a
   * primeira rodada deste ticket corrigiu no estado de erro.
   */
  const naoAplicavel = !error && ddi?.status === 'not_eligible';

  let indicator: React.ReactNode;
  if (error) {
    indicator = <StatusPill variant="neutral" size="sm">Não iniciada</StatusPill>;
  } else if (!ddi) {
    indicator = <span className="text-[12px] text-(--color-text-muted)">Carregando…</span>;
  } else if (ddi.status === 'not_eligible') {
    indicator = <StatusPill variant="neutral" size="sm">Não aplicável</StatusPill>;
  } else if (ddi.status === 'in_progress') {
    indicator = <StatusPill variant="info" size="sm">Em análise</StatusPill>;
  } else if (ddi.status === 'completed' && ddi.riskLevel) {
    const risk = DDI_RISK_PILL[ddi.riskLevel];
    /*
     * A pill é o GATILHO do detalhamento (ADO 67882).
     *
     * *"não apareceu nenhuma informação com o LT com a informação do risco"* —
     * e não aparecia: o card dizia só "Alto", e o `DdiPanel` (racional, score,
     * achados, parecer) só era montado dentro de um ticket `ddi:*`. Emitido o
     * parecer, a pendência da Integridade fecha e o LT ficava sem nenhuma
     * superfície onde ler a análise. Mesmo componente na linha equivalente do
     * workspace SNEG, para as duas telas não divergirem.
     *
     * Só neste ramo: "Não iniciada", "Em análise" e "Não aplicável" não têm
     * detalhe a mostrar, e "Erro" já traz racional e CTA próprios logo abaixo
     * (ADO 67943).
     */
    /*
     * A SITUAÇÃO ao lado do risco (ADO 67882 · 09/09/2026).
     *
     * *"na oportunidade ainda não tá como aprovado"* — e não estava: emitido o
     * parecer, a linha ficava com um `Médio` âmbar e mais nada, enquanto o
     * backend já dizia `LIBERADA`. O veredito da Integridade existia e não tinha
     * superfície nesta tela. O protótipo concorda (`01c:481`, `pill "Aprovado ·
     * 85"`): esta linha carrega veredito, não só risco.
     *
     * Duas pílulas, nunca uma composta: risco e situação são vereditos de donos
     * diferentes (motor × Integridade), e fundi-los num `Liberada · Médio` verde
     * pintaria um risco médio com a cor de aprovado.
     *
     * `situacaoTemVeredito` mantém `CONCLUIDA` com uma pílula só — ali não houve
     * parecer (risco BAIXO, RN-F10-07), e é o caso que o `01b:253` desenha.
     */
    const situacao = situacaoTemVeredito(ddi.situacao)
      ? DDI_SITUACAO_PILL[ddi.situacao]
      : null;
    indicator = (
      <DdiDetalhesTrigger opportunityId={opportunityId} subtitulo={opportunityCode}>
        <span className="flex flex-wrap items-center justify-end gap-1">
          {situacao ? (
            <StatusPill
              variant={situacao.variant}
              size="sm"
              data-testid="ddi-situacao-pill"
            >
              {situacao.label}
            </StatusPill>
          ) : null}
          <StatusPill variant={risk.variant} size="sm">{risk.label}</StatusPill>
        </span>
      </DdiDetalhesTrigger>
    );
  } else if (ddi.status === 'error') {
    indicator = <StatusPill variant="danger" size="sm">Erro</StatusPill>;
  } else {
    indicator = <StatusPill variant="neutral" size="sm">Não iniciada</StatusPill>;
  }

  async function handleRetry(): Promise<void> {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <aside
      id="ddi"
      className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-5"
    >
      <h2 className="mb-3.5 text-(length:--t-h4) font-bold">Análises</h2>
      <div className="flex items-center justify-between gap-3 border-t border-(--color-border) py-2.5 text-(length:--t-caption) first:border-t-0 first:pt-0">
        <span className="text-(--color-text-muted)">DDI · Integridade</span>
        {indicator}
      </div>
      {naoAplicavel && ddi?.rationale && (
        <p
          data-testid="ddi-nao-aplicavel-motivo"
          className="mt-1 text-[12px] leading-snug text-(--color-text-muted)"
        >
          {ddi.rationale}
        </p>
      )}
      {failed && (
        <div className="mt-1 space-y-2">
          {/* The sentence is the backend's — it is what distinguishes "the tool
              has no record for this CNPJ" from "the tool is down", which used to
              render identically. A row written before the reason existed has no
              sentence; the generic line is the honest stand-in. */}
          <p className="text-[12px] leading-snug text-(--color-text-muted)">
            {ddi?.rationale ??
              'A due diligence de integridade não foi concluída. Execute a análise novamente.'}
          </p>
          {canRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="text-[12px] font-bold text-(--secondary-600) underline disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retrying ? 'Executando…' : '↻ Tentar novamente'}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

/** Label + value pair used in the data grid. */
/*
 * `simNao` virou `simNaoLabel` em `lib/opportunities/nova-imagem-pista.ts`, ao
 * lado da regra que decide QUAIS linhas de nova imagem existem — as outras três
 * telas com card de dados precisavam das duas coisas (ADO 67941).
 */
function DataField({
  label,
  value,
  fullWidth,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  fullWidth?: boolean;
  /** Texto do ⓘ ao lado do rótulo — ver {@link FieldHint}. */
  hint?: string;
}) {
  return (
    /*
     * ⚠️ **`col-span-full`, NUNCA `col-span-2`** — este é o defeito que quebrou
     * o card no mobile (relato de 17/09/2026, print do stage).
     *
     * `col-span-2` é largura fixa em COLUNAS, não "largura inteira": num grid de
     * UMA coluna ele pede duas, e o CSS atende criando uma **coluna implícita**,
     * que é `auto` (dimensionada pelo conteúdo). O card inteiro então vira
     * `minmax(0,1fr) auto`: a primeira coluna espreme até quebrar a razão social
     * uma palavra por linha, e os campos seguintes passam a alternar entre as
     * duas — exatamente o "TÍTULO|FINALIDADE" sobreposto do print. Basta UM
     * campo `fullWidth` para derrubar a grade toda, e há quatro aqui (Descrição,
     * Centros de lucro, Briefing, Parecer do LT).
     *
     * `col-span-full` é `grid-column: 1 / -1` — "todas as colunas que
     * existirem" —, então vale em 1 ou em 2 e não depende do breakpoint. É o que
     * `sneg-analise-shell` já usava no átomo dele (`col-span-full`, linha 588),
     * e é por isso que aquela tela nunca apresentou o defeito.
     */
    <div className={fullWidth ? 'col-span-full' : undefined}>
      <div className="text-[12px] font-normal uppercase tracking-[0.3px] text-(--color-text-muted)">
        {label}
        {hint ? <FieldHint text={hint} label={label} /> : null}
      </div>
      <div className="mt-0.5 text-(length:--t-caption) font-bold">{value ?? '—'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Garantias section — editable card (01b): the LT registers MULTIPLE indicated
// guarantees inline via a modal (add / edit / remove). Component + data layer
// live in `garantias-indicadas-card.tsx` / `lib/garantia/indicacoes.*`.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

/**
 * Campos do modal.
 *
 * A **Adesão ao PIM não está aqui**: o PIM é o `Programa Acelera+`, perguntado
 * (e obrigatório) nos dados da proposta, e o valor que vai ao Salesforce é
 * derivado da proposta PCR eleita. `OpportunityPatchPayload` ainda carrega
 * `pimAdesao` porque a API o aceita como **override** (suporte, e o caso de
 * duas PCR eleitas divergentes) — só nenhuma tela o envia.
 */
type EditFields = Omit<
  Required<OpportunityPatchPayload>,
  | 'pimAdesao'
  | 'possuiNovaImagemPista'
  | 'seraColocadaNovaImagemPista'
  | 'alteracaoMinutaPadrao'
  | 'descricaoAlteracaoMinutaPadrao'
> & {
  /**
   * Nova imagem de pista — mesma tri-estado, e mesma razão: o Salesforce só
   * aceita o campo quando há resposta, e o `/simulate` da alçada recusa
   * enquanto estiver em branco.
   */
  possuiNovaImagemPista: '' | 'sim' | 'nao';
  seraColocadaNovaImagemPista: '' | 'sim' | 'nao';
  /**
   * "Haverá alteração da minuta padrão?" (ADO 68438) — tri-estado pela mesma
   * razão: o campo do Salesforce é picklist restrita `Sim`/`Não` e aceita
   * nulo, e `''` é "não respondido", que NÃO é `Não`.
   */
  alteracaoMinutaPadrao: '' | 'sim' | 'nao';
  /**
   * Descrição da alteração — string simples (nunca tri-estado): o campo é
   * texto livre, e vazio significa "não escrita". Ela só é enviada, e só é
   * exigida, com a resposta "Sim".
   */
  descricaoAlteracaoMinutaPadrao: string;
};

function EditModal({
  initial,
  saving,
  error,
  onSave,
  onClose,
}: {
  initial: EditFields;
  saving: boolean;
  error: string;
  onSave: (fields: OpportunityPatchPayload) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<EditFields>(initial);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Traz o motivo para o campo de visão e o anuncia. Sem isto a mensagem podia
  // renderizar fora da dobra e o clique em Salvar parecia não ter efeito.
  useEffect(() => {
    if (!error) return;
    const node = errorRef.current;
    if (!node) return;
    // jsdom não implementa scrollIntoView — a checagem mantém o teste de
    // componente honesto sem abrir mão do comportamento no browser.
    node.scrollIntoView?.({ block: 'nearest' });
    node.focus();
  }, [error]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Only send changed fields
    const patch: OpportunityPatchPayload = {};
    if (fields.title !== initial.title) patch.title = fields.title;
    if (fields.description !== initial.description) patch.description = fields.description;
    if (fields.briefing !== initial.briefing) patch.briefing = fields.briefing;
    if (fields.parecerLt !== initial.parecerLt) patch.parecerLt = fields.parecerLt;
    // Empty string is the "— sem alteração —" sentinel (the backend does not
    // accept an empty string as a valid Finalidade). Only patch when the user
    // picked a concrete value AND it differs from the current one.
    if (fields.finalidade !== '' && fields.finalidade !== initial.finalidade) {
      patch.finalidade = fields.finalidade;
    }
    // Só envia quando há um cliente escolhido E ele mudou. Voltar para vazio
    // não é enviável: '' significaria "mesmo do cliente" para a CRIAÇÃO, mas o
    // PATCH não tem como desfazer um vínculo já gravado, e o backend recusa a
    // string vazia — a recusa aparecia sem que nada na tela explicasse.
    if (
      fields.clientRecebedorId !== '' &&
      fields.clientRecebedorId !== initial.clientRecebedorId
    ) {
      patch.clientRecebedorId = fields.clientRecebedorId;
    }
    if (
      fields.possuiNovaImagemPista !== initial.possuiNovaImagemPista &&
      fields.possuiNovaImagemPista !== ''
    ) {
      patch.possuiNovaImagemPista = fields.possuiNovaImagemPista === 'sim';
    }
    // Só viaja com "Possui = Não": é a única combinação que o picklist
    // dependente do Salesforce habilita. Enviar com "Sim" gravaria um valor
    // que a tela do próprio org não oferece.
    if (
      fields.possuiNovaImagemPista === 'nao' &&
      fields.seraColocadaNovaImagemPista !== initial.seraColocadaNovaImagemPista &&
      fields.seraColocadaNovaImagemPista !== ''
    ) {
      patch.seraColocadaNovaImagemPista =
        fields.seraColocadaNovaImagemPista === 'sim';
    }
    /*
     * ADO 68438. `''` NUNCA é enviado: ele significa "não respondido", e
     * mandá-lo como `false` gravaria "Não" no Salesforce — que é exatamente o
     * default silencioso que este campo veio corrigir.
     */
    if (
      fields.alteracaoMinutaPadrao !== initial.alteracaoMinutaPadrao &&
      fields.alteracaoMinutaPadrao !== ''
    ) {
      patch.alteracaoMinutaPadrao = fields.alteracaoMinutaPadrao === 'sim';
    }
    /*
     * A descrição da alteração só viaja com o "Sim". Com "Não" (ou em branco) ela nem
     * é enviada: quem a LIMPA é o backend, com a mesma regra que a criação
     * aplica — duas limpezas divergiriam no caso ambíguo.
     */
    if (
      fields.alteracaoMinutaPadrao === 'sim' &&
      fields.descricaoAlteracaoMinutaPadrao.trim() !==
        initial.descricaoAlteracaoMinutaPadrao.trim()
    ) {
      patch.descricaoAlteracaoMinutaPadrao =
        fields.descricaoAlteracaoMinutaPadrao.trim();
    }
    onSave(patch);
  }

  return (
    /* Overlay */
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[var(--radius-md)] bg-white shadow-[0_20px_50px_rgba(0,0,0,.3)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-(--color-border) px-5 py-4">
          <h4
            id="edit-modal-title"
            className="text-(length:--t-h4) font-bold"
          >
            Editar oportunidade
          </h4>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="cursor-pointer text-2xl leading-none text-(--color-text-muted) hover:text-(--neutral-900)"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
            <div>
              <label
                htmlFor="edit-title"
                className={IN_LABEL}
              >
                Título
              </label>
              <input
                id="edit-title"
                type="text"
                value={fields.title}
                onChange={(e) => setFields((f) => ({ ...f, title: e.target.value }))}
                className={IN_FIELD}
              />
            </div>

            <div>
              <label
                htmlFor="edit-description"
                className={IN_LABEL}
              >
                Descrição
              </label>
              <textarea
                id="edit-description"
                rows={3}
                value={fields.description}
                onChange={(e) => setFields((f) => ({ ...f, description: e.target.value }))}
                className={`${IN_FIELD} resize-y`}
              />
            </div>

            <div>
              <label
                htmlFor="edit-briefing"
                className={IN_LABEL}
              >
                Briefing (opcional)
              </label>
              <textarea
                id="edit-briefing"
                rows={3}
                value={fields.briefing}
                onChange={(e) => setFields((f) => ({ ...f, briefing: e.target.value }))}
                className={`${IN_FIELD} resize-y`}
              />
            </div>

            {/*
              * "Parecer do LT" (ADO 68473) — logo abaixo do briefing, que é
              * onde o pedido o colocou. Campo PRÓPRIO, e não um apêndice do
              * briefing: um descreve o revendedor, o outro é a leitura do LT
              * sobre ESTA negociação. E não é o parecer TÉCNICO do analista
              * SNEG — ver `lib/opportunities/textos-do-lt.ts`.
              */}
            <div>
              <label
                htmlFor="edit-parecer-lt"
                className={IN_LABEL}
              >
                {PARECER_LT_FIELD_LABEL} (opcional)
              </label>
              <textarea
                id="edit-parecer-lt"
                rows={3}
                value={fields.parecerLt}
                onChange={(e) =>
                  setFields((f) => ({ ...f, parecerLt: e.target.value }))
                }
                className={`${IN_FIELD} resize-y`}
              />
            </div>

            <div>
              <label
                htmlFor="edit-finalidade"
                className={IN_LABEL}
              >
                Finalidade
              </label>
              {/*
                * Catalog-backed, exactly like the creation wizard. This field
                * shipped as a free-text <input>, so any string reached a
                * Salesforce restricted picklist and the PATCH answered 400 —
                * with the message rendered below the fold (see the alert
                * placement further down). VBR-640.
                */}
              <PicklistSelect
                id="edit-finalidade"
                data-testid="edit-finalidade"
                field={PicklistField.QuoteFinalidade}
                controllingValue={TipoProposta.PCR}
                controllingLabel="Tipo de proposta"
                value={fields.finalidade}
                onChange={(value) => setFields((f) => ({ ...f, finalidade: value }))}
                allow={FINALIDADE_ALLOW}
              />
            </div>

            <div>
              <label
                htmlFor="edit-client-recebedor"
                className={IN_LABEL}
              >
                Cliente recebedor
              </label>
              {/*
                * Selecionado pela mesma busca de cliente da criação — nunca
                * digitado. Era um <input> livre, então um Código SAP com um
                * dígito trocado virava vínculo de domínio, e apagar o campo
                * mandava string vazia no PATCH (VBR-640).
                */}
              <RecebedorClientCombobox
                id="edit-client-recebedor"
                display={fields.clientRecebedorId}
                disabled={saving}
                search={searchClients}
                onSelect={(client) =>
                  // The REFERENCE (Código SAP, or the CRM id of a prospect —
                  // ADR-0055), never `sapCode` alone, which is "" for a prospect.
                  setFields((f) => ({ ...f, clientRecebedorId: customerReference(client) }))
                }
                onClear={() => setFields((f) => ({ ...f, clientRecebedorId: '' }))}
              />
            </div>

            {/*
              * Nova imagem de pista — o TERCEIRO gate do `/simulate`.
              *
              * O Salesforce tem um trigger que sugere a resposta a partir do
              * cadastro do cliente (`Account.Nova_Imagem__c`), mas deixa em
              * branco quando a conta não tem nova imagem registrada — 84% delas.
              * Depois, a alçada recusa enquanto o campo estiver vazio. Por isso
              * a tela pergunta. Diferente da Adesão ao PIM, que passou a ser
              * derivada do `Programa Acelera+` da proposta: aqui não existe
              * campo de proposta de onde derivar.
              */}
            <div>
              <label
                htmlFor="edit-possui-imagem-pista"
                className={IN_LABEL}
              >
                Possui nova imagem de pista
              </label>
              <select
                id="edit-possui-imagem-pista"
                value={fields.possuiNovaImagemPista}
                onChange={(e) =>
                  setFields((f) => ({
                    ...f,
                    possuiNovaImagemPista: e.target
                      .value as EditFields['possuiNovaImagemPista'],
                  }))
                }
                className={IN_SELECT}
              >
                <option value="">Selecione…</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
              <p className="mt-1 text-[12px] text-(--color-text-muted)">
                O Salesforce exige esta resposta antes de calcular a alçada.
                Vem preenchida do cadastro do cliente quando ele informa.
              </p>
            </div>

            {/*
              * Só aparece com "Possui = Não": é a única combinação que o
              * picklist dependente do Salesforce habilita. Renderizá-lo sempre
              * ofereceria uma escolha que o org não aceita.
              */}
            {fields.possuiNovaImagemPista === 'nao' && (
              <div>
                <label
                  htmlFor="edit-sera-colocada-imagem-pista"
                  className={IN_LABEL}
                >
                  Será colocada nova imagem de pista
                </label>
                <select
                  id="edit-sera-colocada-imagem-pista"
                  value={fields.seraColocadaNovaImagemPista}
                  onChange={(e) =>
                    setFields((f) => ({
                      ...f,
                      seraColocadaNovaImagemPista: e.target
                        .value as EditFields['seraColocadaNovaImagemPista'],
                    }))
                  }
                  className={IN_SELECT}
                >
                  <option value="">Selecione…</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
                <p className="mt-1 text-[12px] text-(--color-text-muted)">
                  Nesta negociação. O Salesforce exige a resposta quando o posto
                  ainda não tem nova imagem.
                </p>
              </div>
            )}

            {/*
              * "Haverá alteração da minuta padrão?" (ADO 68438).
              *
              * O destino é `Alteracao_Minuta_Padrao__c`, que o Salesforce tem
              * na Cotação E na Oportunidade (e copia de uma para a outra). A
              * plataforma sempre ENVIOU o campo, derivando-o de um booleano da
              * proposta que nasce `true` e cujo único controle de escrita não
              * está montado em tela nenhuma — resultado medido em 15/09/2026:
              * 41 de 41 oportunidades nossas afirmam "Não" no org sem que
              * ninguém tenha respondido. Esta é a pergunta que faltava.
              *
              * "Selecione…" NÃO é "Não": em branco o campo é OMITIDO do
              * payload.
              */}
            <div>
              <label
                htmlFor="edit-alteracao-minuta-padrao"
                className={IN_LABEL}
              >
                Haverá alteração de minuta padrão?
              </label>
              <select
                id="edit-alteracao-minuta-padrao"
                value={fields.alteracaoMinutaPadrao}
                onChange={(e) =>
                  setFields((f) => ({
                    ...f,
                    alteracaoMinutaPadrao: e.target
                      .value as EditFields['alteracaoMinutaPadrao'],
                  }))
                }
                className={IN_SELECT}
              >
                <option value="">Selecione…</option>
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
              </select>
              <p className="mt-1 text-[12px] text-(--color-text-muted)">
                Marque &quot;Sim&quot; quando a minuta do contrato não seguirá o
                padrão. A resposta vai para a Cotação e a Oportunidade no
                Salesforce.
              </p>
            </div>

            {/*
              * Descrição da alteração — renderizada SÓ com "Sim", e obrigatória ali.
              *
              * É o texto que a fase de minuta exibe no alerta acima da lista
              * de minutas. Com "Não" não há nada a justificar: o campo some e
              * o backend limpa o que estivesse guardado, para o alerta não
              * ressuscitar com o texto de outra negociação.
              */}
            {fields.alteracaoMinutaPadrao === 'sim' && (
              <div>
                <label
                  htmlFor="edit-descricao-alteracao-minuta-padrao"
                  className={IN_LABEL}
                >
                  {DESCRICAO_ALTERACAO_MINUTA_PADRAO_FIELD_LABEL}
                </label>
                <textarea
                  id="edit-descricao-alteracao-minuta-padrao"
                  value={fields.descricaoAlteracaoMinutaPadrao}
                  onChange={(e) =>
                    setFields((f) => ({
                      ...f,
                      descricaoAlteracaoMinutaPadrao: e.target.value,
                    }))
                  }
                  rows={3}
                  maxLength={2000}
                  required
                  className={`${IN_FIELD} resize-y`}
                />
                <p className="mt-1 text-[12px] text-(--color-text-muted)">
                  Descreva o que muda em relação à minuta padrão. O texto
                  aparece como alerta na fase de minuta.
                </p>
              </div>
            )}

          </div>

          {/*
            * Erro FORA do container que rola.
            *
            * A mensagem do backend sempre chegou aqui (`handleSave` captura e
            * põe em `saveError`) — mas renderizada no fim de um
            * `max-h-[70vh] overflow-y-auto`, ou seja abaixo da dobra, enquanto o
            * footer visível só voltava de "Salvando…" para "Salvar". Do ponto de
            * vista de quem clica, salvar não fazia nada. Agora fica colada ao
            * footer, com `aria-live` e foco, para o motivo aparecer onde o olho
            * já está (VBR-640).
            */}
          {error && (
            <p
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              aria-live="assertive"
              data-testid="edit-modal-error"
              className="border-t border-(--color-danger-bg) bg-(--color-danger-bg) px-5 py-3 text-(length:--t-caption) text-(--color-danger)"
            >
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-(--color-border) px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className={SECONDARY_OUTLINE_BTN}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={PRIMARY_ACTION_BTN}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Proposal card
// ---------------------------------------------------------------------------

function ProposalCard({
  proposal,
  opportunityId,
  fase,
  elected,
  canElect,
  onToggleElect,
  saving,
  selectable,
  selected,
  onToggleSelect,
}: {
  proposal: OpportunityProposal;
  opportunityId: string;
  /**
   * Fase da oportunidade — é ela que dá o status exibido da proposta
   * (`statusPropostaExibido`), nos mesmos sinais que a trilha do topo recebe.
   *
   * ⚠️ Este corpo é o que os perfis SEM `AprovacaoView`/`ContractView` recebem
   * em TODAS as fases (a CCOB entre eles), então ele precisa da derivação tanto
   * quanto as telas gateadas: sem ela a CCOB lia "Em análise" numa oportunidade
   * já em minuta. Antes do GATE 1 a derivação devolve o mesmo texto do status
   * cru, então nada se perde na fase de preenchimento.
   */
  fase: { backendState?: string; status?: OpportunityStatus };
  elected: boolean;
  /** Permission.OpportunityCompose — electing is the LT/EV's act (RN-F2-04). */
  canElect: boolean;
  onToggleElect: (id: string) => void;
  saving: boolean;
  /** POSTO proposals can be checked to compare scenarios (02-comparacao). */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  return (
    <div className="mb-2.5 rounded-[var(--radius-xs)] border border-(--color-border)">
      <div className="p-3.5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {/* Compare checkbox — only for POSTO proposals (scenario comparison). */}
            {selectable && (
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleSelect(proposal.id)}
                aria-label={`Selecionar ${proposal.code} para comparar cenários`}
                className="mt-0.5 size-[17px] shrink-0 cursor-pointer accent-(--secondary-600)"
              />
            )}
            <div>
            <div className="text-(length:--t-caption) font-bold">
              {proposal.code} · {proposal.title}
              {elected && (
                <span className="ml-2 inline-flex items-center rounded-full bg-(--secondary-100) px-2 py-0.5 text-[11px] font-bold text-(--secondary-600)">
                  ★ Eleita
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-[14px] text-(--color-text-muted)">
                {statusPropostaExibido(proposal.status, fase)}
                {proposal.authorName ? ` · autor ${proposal.authorName}` : ''}
              </span>
              {proposal.indicatorStatus !== null && (
                <StatusPill
                  variant={INDICATOR_STATUS_PILL_VARIANT[proposal.indicatorStatus]}
                  size="sm"
                >
                  TIR: {INDICATOR_STATUS_LABEL[proposal.indicatorStatus]}
                </StatusPill>
              )}
            </div>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            {/*
             * Electing a proposal is the LT/EV's act (RN-F2-04 — PRD §7.2
             * Atores): the button is gated by Permission.OpportunityCompose,
             * mirroring the @Roles on PUT .../proposals. WriteOnly alone was
             * too broad — SNEG (and every non-read-only profile) got a button
             * whose click the API now answers with 403. The "★ Eleita" badge
             * above still tells everyone WHICH proposal is elected — that is
             * read-only information.
             */}
            {canElect && (
              <button
                type="button"
                onClick={() => onToggleElect(proposal.id)}
                disabled={saving}
                aria-pressed={elected}
                className={`cursor-pointer rounded-[var(--radius-xxs)] border px-3 py-1.5 text-(length:--t-caption) font-bold transition disabled:opacity-40 ${
                  elected
                    ? 'border-(--secondary-600) bg-(--secondary-100) text-(--secondary-600)'
                    : 'border-(--secondary-500) bg-white text-(--secondary-500) hover:bg-(--neutral-40)'
                }`}
              >
                {elected ? '★ Eleita' : 'Eleger'}
              </button>
            )}
            {/* Opens the full proposal screen (F4–F9 blocks) on its own page
                at /propostas/[proposalId], rendered from the proposal.
                Franchise proposals (ZBRM/ZLUB) land on /propostas/[id]/franquia. */}
            <Link
              href={proposalHref(opportunityId, proposal.id, proposal.tipoProposta)}
              className="inline-flex items-center rounded-[var(--radius-xxs)] bg-(--secondary-500) px-3 py-1.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-hover)"
            >
              Exibir →
            </Link>
          </div>
        </div>

        {/* Fill progress bar — omitted while the backend produces no filling
            signal for the list (a 0% bar would read as "nada preenchido"). */}
        {proposal.fillPercent !== null && (
          <>
            <div className="my-2.5 h-[7px] overflow-hidden rounded-full bg-(--neutral-100)">
              <div
                role="progressbar"
                aria-valuenow={proposal.fillPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Dados da proposta preenchidos: ${proposal.fillPercent}%`}
                style={{ width: `${proposal.fillPercent}%` }}
                className="h-full rounded-full bg-(--secondary-500)"
              />
            </div>
            {/*
              * "Dados da proposta", não "Preenchimento" seco (VBR-645).
              *
              * A barra conta os 8 CAMPOS CORE ESCALARES da proposta e nada mais
              * — não produtos, não recursos financeiros, não fotos, não
              * indicadores (escopo decidido pelo produto, ver
              * `proposalFillPercent`). Com o rótulo genérico ela respondia, aos
              * olhos do LT, a pergunta do GATE 1 ("está pronta para enviar?"),
              * e aí "63%" com todos os blocos preenchidos lê como bug. Quem
              * responde prontidão é a sendbar, que lista o que falta.
              *
              * Qualificar em vez de trocar a métrica: a definição é decisão de
              * produto, e alinhá-la ao gate é pergunta para a Vibra — não uma
              * mudança a tomar por conta aqui.
              */}
            <div className="flex justify-between text-[14px] text-(--color-text-muted)">
              <span
                title="Percentual dos campos da proposta (tipo, finalidade, datas, horizonte, prazo, responsáveis). Não inclui produtos, recursos financeiros nem fotos — a prontidão para envio é a da barra inferior."
              >
                Dados da proposta {proposal.fillPercent}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Opportunity detail screen (F2 — 01b-oportunidade.html).
 * Covers the four UI states: carregando / preenchido / vazio(404) / erro.
 *
 * Sections:
 *  - Header (code, status, title, client)
 *  - Dados da oportunidade (read-only grid + team chips + editable via modal)
 *  - Análise financeira (TIR/VPL/bonificação) — placeholder when null (F7 slot).
 *    ONE card, ONE grid: there is no nested "Resultado Financeiro" sub-card,
 *    and reintroducing one would duplicate TIR/VPL (see the comment above the
 *    `financeiro` Section and the regression test in the spec).
 *  - Propostas desta oportunidade (elect / compose via PUT /proposals)
 *  - Resumo de pendências (stub — integrates when épico Pendências exists)
 */
export function OpportunityDetail({
  opportunityId,
  load = getOpportunityDetail,
  loadProposals = getOpportunityProposals,
  loadTeam = defaultLoadTeam,
  patch = patchOpportunityDetail,
  putProposals = putOpportunityProposals,
  loadPendencies = defaultLoadPendencies,
  loadDocuments = defaultLoadDocuments,
  loadDdi = defaultLoadDdi,
  retryDdi = defaultRetryDdi,
  recalculateIndicators = defaultRecalculateIndicators,
}: Props) {
  const { can, canWrite } = usePermissions();
  /*
   * "↻ Recalcular / Simular (ARP)" espelha o `@Roles(...OPPORTUNITY_COMPOSITION_ROLES)`
   * de `indicators:recalculate` — a linha "Criar/Editar oportunidade e proposta"
   * da Matriz RBAC v2.1 (28/09/2026). `canWrite` deixava CCOB e Integridade
   * dispararem o ARP.
   */
  const canRecalcular = can(Permission.OpportunityCompose);
  /*
   * Matriz RBAC v2.1 (28/09/2026) — "Análise DDI · Visualizar" exclui
   * Visualizador, CCOB, Gestor de Franquias e Consultor de Expansão: para eles
   * `GET .../ddi` responde 403, então o card não é montado e nada é buscado.
   */
  const canSeeDdi = can(Permission.DdiView);

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [opportunity, setOpportunity] = useState<OpportunityDetailType | null>(null);
  const [pendencySummary, setPendencySummary] = useState<ListPendenciasResult | null>(null);
  const [documentsSummary, setDocumentsSummary] = useState<ChecklistResult | null>(null);
  const [ddiSummary, setDdiSummary] = useState<DdiResult | null>(null);
  const [ddiError, setDdiError] = useState(false);
  /**
   * Bumped after a manual re-run so the summary effect re-fetches. A counter,
   * not a boolean: two retries in a row are two events (same reasoning as the
   * indicator panel's `refreshSignal`).
   */
  const [ddiRefreshSignal, setDdiRefreshSignal] = useState(0);
  /**
   * Relê o card "Pendências" quando a composição muda (16/09/2026).
   *
   * Eleger uma proposta de franquia sem FAP ABRE uma pendência
   * (`FranquiaFapPendenciaConsumer`), e desmarcar a encerra — mas o efeito de
   * carga só dependia de `opportunityId`, então o card ficava com o retrato
   * anterior até um F5. Como o card se esconde quando não há nenhuma ATIVA, o
   * sintoma era literalmente *"o card de pendências desaparece"*.
   *
   * ⚠️ O produtor é um listener ASSÍNCRONO do evento de composição, então esta
   * releitura pode chegar antes da escrita dele — mesmo contrato dos sinais
   * irmãos (DDI, alçada, GATE 1). O worker de 60 s e a próxima carga da tela são
   * a rede; sem o sinal, não havia rede nenhuma antes do F5.
   */
  const [pendenciasRefreshSignal, setPendenciasRefreshSignal] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState('');

  // Elected proposals (local optimistic state)
  const [electedIds, setElectedIds] = useState<Set<string>>(new Set());
  const [proposalSaving, setProposalSaving] = useState(false);
  const [proposalError, setProposalError] = useState('');

  // POSTO proposals selected to compare scenarios (02-comparacao). Comparison
  // is posto-only (per prototype 01b): the button enables at ≥2 selected.
  const router = useRouter();
  /*
   * Gerenciar a equipe DEPOIS do salvamento (ADO 67802 / Bug 67527-c).
   *
   * A inclusão de membro só existia na tela de CRIAÇÃO (`nova-oportunidade.tsx`
   * monta o `AddMemberModal`); aqui a equipe era só leitura — o docstring do
   * `TeamSummaryModal`, o modal de leitura da barra de metadados (removido no
   * ADO 67984), registrava isso ("Management … lives on the creation screen").
   * E `TeamSection`, que tem inclusão, remoção e a busca
   * escopada por balde, existia completo e não era montado em tela nenhuma
   * (mesmo caso do `AlcadaSagaPanel`).
   *
   * Isso tornava a Exceção Programada INALCANÇÁVEL: escrever nela exige perfil
   * de franquia **e** participação em `opportunity_members`, e a proposta de
   * franquia só nasce depois do salvamento — quando a participação já não podia
   * mais ser concedida. Medido nesta base: LT 403, Consultor de Expansão 403,
   * Gestor de Franquias 404, e só ADMIN (bypass de suporte) 201.
   */
  const [teamEditing, setTeamEditing] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(new Set());
  const toggleCompare = useCallback((id: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // GATE 1 — Envio para análise (F8)
  const [gate1RefreshSignal, setGate1RefreshSignal] = useState(0);
  /*
   * ADO 68189 — a altura da sendbar do GATE 1 é VARIÁVEL (a lista do que falta
   * cresce com o que o backend devolve e reflui em telas estreitas), então a
   * reserva é medida. Ver o call site, no rodapé.
   */
  const { sendbarRef, sendbarReserva } = useSendbarReserve();
  /**
   * Bumped whenever something outside the alçada panel can change its vereditos:
   * saving the opportunity's dados (the gate reads finalidade, TIR status, the
   * elected set) and the GATE 2 transition (which submits the alçada as a
   * pre-commit effect). The panel only ever reloaded from its own actions, so a
   * 200 elsewhere left it showing the previous verdict (VBR-645). Counter, not
   * flag — two saves are two events.
   */
  const [alcadaRefreshSignal, setAlcadaRefreshSignal] = useState(0);
  const [gate1SuccessMsg, setGate1SuccessMsg] = useState('');

  // Garantia flow refresh (CA-1 VBR-536) — separate from gate1RefreshSignal so
  // that registering a garantia does not re-check GATE 1 readiness.
  const [garantiaFlowRefreshSignal, setGarantiaFlowRefreshSignal] = useState(0);

  // Nova proposta modal (FRQ-15) — opens the proposal-type selector.
  const [novaPropModalOpen, setNovaPropModalOpen] = useState(false);

  /**
   * A última leitura da listagem de propostas FALHOU.
   *
   * É um fato distinto de "a oportunidade não tem proposta", e a única razão de
   * existir é que o card renderiza os dois a partir da mesma lista vazia. Ver o
   * bloco de `fetchDetail` para o incidente que o produziu.
   */
  const [proposalsUnavailable, setProposalsUnavailable] = useState(false);
  /*
   * Espelho da última lista COMITADA, para `fetchDetail` recuperá-la quando a
   * releitura falha. É `ref` e não leitura de `opportunity` de propósito:
   * `fetchDetail` é `useCallback` e roda no `useEffect` que depende dele —
   * incluir a oportunidade nas deps o recriaria a cada carga e o efeito
   * dispararia em laço.
   */
  const proposalsRef = useRef<OpportunityProposal[]>([]);
  useEffect(() => {
    proposalsRef.current = opportunity?.propostas ?? [];
  }, [opportunity]);


  /**
   * @param options.quiet - Re-reads without blanking the screen and without
   *   surfacing failures. Used by the indicators revalidation loop
   *   (`em_calculo`): a spinner on every tick would hide the numbers the user is
   *   looking at, and a failed background read must leave the last payload on
   *   screen — the next tick tries again.
   */
  const fetchDetail = useCallback(async (options?: { quiet?: boolean }) => {
    const quiet = options?.quiet === true;
    if (!quiet) {
      setLoadStatus('loading');
      setErrorMsg('');
    }
    try {
      /*
       * Proposals (F3) and team members are fetched in parallel with the detail
       * — each has its own endpoint, and neither blocks nor fails the render.
       *
       * ⚠️ A leitura das propostas NÃO degrada mais para `[]` em silêncio
       * (11/09/2026). Ela caía num `.catch(() => [])`, e como o mapper do
       * detalhe já devolve `propostas: []`, uma falha de rede virava um vazio
       * AFIRMATIVO: o card dizia "Nenhuma proposta criada ainda" — a mesma
       * frase de uma oportunidade que de fato não tem proposta —, e junto
       * sumia a sendbar do GATE 1, que só monta com `propostas.length > 0`.
       * Medido na `PCR-VITORIA-000106/2026` (stage, 11/09 16:49 BRT): a
       * proposta estava íntegra no banco, eleita, e a tela afirmou por 20
       * minutos que não existia; o LT então mexeu na composição e a esvaziou
       * de verdade. Agora "não deu para ler" é um fato próprio, com frase e
       * retry — nunca um vazio.
       */
      const [data, proposals, team] = await Promise.all([
        load(opportunityId),
        loadProposals(opportunityId).then(
          (value) => ({ ok: true as const, value }),
          () => ({ ok: false as const, value: [] as OpportunityProposal[] }),
        ),
        loadTeam(opportunityId).catch((): OpportunityTeamMember[] => []),
      ]);
      /*
       * `isElected` vem do backend (`eleita`, RN-F2-04) — antes era resolvido
       * aqui cruzando com `proposalIds`, o que deixava todos os OUTROS
       * consumidores desta mesma listagem com `false` permanente.
       */
      if (proposals.ok) {
        if (proposals.value.length > 0) {
          data.propostas = proposals.value;
        }
      } else if (proposalsRef.current.length > 0) {
        /*
         * Preserva o que já estava na tela: uma releitura que falha não pode
         * apagar uma lista que foi lida bem. Sem nada lido antes, `data` fica
         * como veio — e o card mostra só o aviso, nunca "sem proposta".
         */
        data.propostas = proposalsRef.current;
      }
      setProposalsUnavailable(!proposals.ok);
      // Team always overwrites the default `[]` from the mapper — the endpoint
      // is the single source of truth. An empty result means no members yet.
      data.team = team;
      setOpportunity(data);
      setElectedIds(new Set(data.propostas.filter((p) => p.isElected).map((p) => p.id)));
      setLoadStatus('loaded');
    } catch (err) {
      if (quiet) return;
      if (err instanceof OpportunityNotFoundError) {
        setLoadStatus('not-found');
      } else {
        setErrorMsg(
          err instanceof Error ? err.message : 'Erro ao carregar a oportunidade.',
        );
        setLoadStatus('error');
      }
    }
  }, [load, loadProposals, loadTeam, opportunityId]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  // Pendency summary loads independently of the main detail — it's a secondary
  // teaser (OPP-F2), so a slow or failing pendency fetch must NOT block or fail
  // the opportunity/indicators render. On error, keep the accordion hidden.
  useEffect(() => {
    let active = true;
    loadPendencies(opportunityId)
      .then((summary) => {
        if (active) setPendencySummary(summary);
      })
      .catch(() => {
        if (active) setPendencySummary(null);
      });
    return () => {
      active = false;
    };
  }, [loadPendencies, opportunityId, pendenciasRefreshSignal]);

  // Document checklist summary — secondary teaser (like the pendency summary):
  // a slow/failing fetch must NOT block the detail render; keep it hidden on error.
  useEffect(() => {
    let active = true;
    loadDocuments(opportunityId)
      .then((summary) => {
        if (active) setDocumentsSummary(summary);
      })
      .catch(() => {
        if (active) setDocumentsSummary(null);
      });
    return () => {
      active = false;
    };
  }, [loadDocuments, opportunityId]);

  // DDI (Integridade) summary for the "Análises" card — secondary/non-blocking.
  // Before GATE 1 the endpoint has no analysis, so failures render "Não iniciada".
  useEffect(() => {
    // Sem `DdiView` a leitura só daria 403 — o card nem é montado.
    if (!canSeeDdi) return;
    let active = true;
    setDdiError(false);
    loadDdi(opportunityId)
      .then((result) => {
        if (active) setDdiSummary(result);
      })
      .catch(() => {
        if (active) {
          setDdiSummary(null);
          setDdiError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [loadDdi, opportunityId, ddiRefreshSignal, canSeeDdi]);

  /**
   * Re-runs the DDI from the "Análises" card and reloads the summary.
   *
   * The reload happens on BOTH outcomes, and that is the point: a refused run
   * answers 503 and the BFF replaces a 5xx body with its own phrase, so the
   * reason never survives the hop — but the backend has just persisted it on the
   * analysis row, so re-reading is what puts the new sentence on screen. A retry
   * that failed for a different reason than the last one must say so.
   *
   * It also bumps `gate1RefreshSignal`: a run that now finishes is exactly what
   * clears `ddi_finalizado`, and the sendbar would otherwise keep refusing until
   * someone reloaded the page.
   */
  const handleRetryDdi = useCallback(async () => {
    try {
      await retryDdi(opportunityId);
    } catch {
      // Swallowed on purpose: the verdict the user needs is the reason now
      // persisted on the row, which the reload below brings in. A toast saying
      // "falhou" on top of it would be the mute pill all over again.
    }
    setDdiRefreshSignal((n) => n + 1);
    setGate1RefreshSignal((n) => n + 1);
  }, [opportunityId, retryDdi]);


  // ---------------------------------------------------------------------------
  // Edit handlers
  // ---------------------------------------------------------------------------

  function openEdit() {
    setSaveStatus('idle');
    setSaveError('');
    setEditOpen(true);
  }

  async function handleSave(patch_payload: OpportunityPatchPayload) {
    if (!opportunity) return;
    if (Object.keys(patch_payload).length === 0) {
      setEditOpen(false);
      return;
    }
    setSaveStatus('saving');
    setSaveError('');
    try {
      const updated = await patch(opportunity.id, patch_payload);
      /*
       * The PATCH response is the F2 detail projection: it carries NEITHER the
       * proposals NOR the team (`propostas: []`, `team: []` from the mapper),
       * because each lives behind its own endpoint. Replacing the whole object
       * with it therefore blanked "Tipo" (derived from the proposals) and the
       * "Equipe da oportunidade" card, which then fixed themselves on reload
       * (VBR-635 §16) — the same trap `handleToggleElect` already works around.
       *
       * Carry the loaded slices over so there is no blank frame, then re-read
       * quietly to pick up anything the save changed downstream.
       */
      setOpportunity({
        ...updated,
        propostas: opportunity.propostas,
        team: opportunity.team,
      });
      setSaveStatus('idle');
      setEditOpen(false);
      // The saved fields feed the alçada gate (finalidade, PIM, nova imagem),
      // which lives behind its own endpoint and would otherwise keep the
      // pre-save verdict on screen (VBR-645).
      setAlcadaRefreshSignal((n) => n + 1);
      void fetchDetail({ quiet: true });
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : 'Erro ao salvar as alterações.',
      );
      setSaveStatus('error');
    }
  }

  // ---------------------------------------------------------------------------
  // Elect / compose handlers
  // ---------------------------------------------------------------------------

  async function handleToggleElect(proposalId: string) {
    if (!opportunity) return;
    const next = new Set(electedIds);
    if (next.has(proposalId)) {
      next.delete(proposalId);
    } else {
      next.add(proposalId);
    }
    setElectedIds(next);
    setProposalSaving(true);
    setProposalError('');
    try {
      const updated = await putProposals(opportunity.id, [...next]);
      // The PUT response doesn't carry the proposal objects (propostas: []) —
      // preserve the already-loaded list and just re-flag isElected from `next`.
      setOpportunity({
        ...updated,
        propostas: opportunity.propostas.map((p) => ({ ...p, isElected: next.has(p.id) })),
      });
      setElectedIds(next);
      // Electing/un-electing a proposal can change GATE 1 readiness (RN-F8-01)
      // and the composition the alçada saga integrates (ADR-0037).
      setGate1RefreshSignal((n) => n + 1);
      setAlcadaRefreshSignal((n) => n + 1);
      /*
       * E o card "Análises" também (ADO 67943 · 31/08/2026).
       *
       * A composição eleita é justamente o que decide se a DDI é solicitada:
       * eleger só franquia a suprime, eleger a PCR a traz de volta. Sem esta
       * releitura o card ficaria com o veredito da composição ANTERIOR — a
       * sendbar ao lado pararia de cobrar a DDI enquanto o card continuaria em
       * "Erro", com o CTA de retentativa oferecendo uma execução que o backend
       * agora ignora. Duas superfícies da mesma tela discordando.
       */
      setDdiRefreshSignal((n) => n + 1);
      // E o card "Pendências": eleger uma franquia sem FAP abre a cobrança e
      // desmarcá-la a encerra (16/09/2026) — ver `pendenciasRefreshSignal`.
      setPendenciasRefreshSignal((n) => n + 1);
      /*
       * Electing a posto (PCR) proposal makes the backend fire the consolidated
       * ARP calculation. The PUT response is built before that submit lands, so
       * re-read the detail quietly to pick up `indicadores.status = em_calculo`.
       * Without it the calculation runs invisibly and the user has no way to
       * tell whether anything is happening.
       */
      void fetchDetail({ quiet: true });
    } catch (err) {
      // Revert optimistic state
      setElectedIds(new Set(opportunity.propostas.filter((p) => p.isElected).map((p) => p.id)));
      setProposalError(
        err instanceof Error ? err.message : 'Erro ao atualizar as propostas.',
      );
    } finally {
      setProposalSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // GATE 1 — Envio para análise handlers (F8, HU-14.2)
  // ---------------------------------------------------------------------------

  function handleGate1Transitioned(_result: TriggerTransitionResult) {
    if (!opportunity) return;
    /*
     * `backendState` moves TOGETHER with `status` — the view for this phase is
     * chosen by `backendState === 'EM_ANALISE'` (the LT analysis view, `01c`),
     * so updating only `status` left the fill-phase layout on screen (eleger
     * proposta / enviar à análise) for an opportunity already in análise, until
     * the user reloaded by hand.
     */
    setOpportunity({ ...opportunity, status: 'análise', backendState: 'EM_ANALISE' });
    setGate1SuccessMsg(
      'Oportunidade enviada para análise — as análises automáticas foram disparadas e os responsáveis foram notificados.',
    );
  }

  function handleGate1NeedsRefresh() {
    void fetchDetail();
  }

  /**
   * A alçada avançou sozinha — releia a prontidão do GATE 1.
   *
   * ⚠️ **O painel relê sozinho (polling) e a sendbar NÃO**: a prontidão é
   * estado desta tela, relida só nas ações que ela própria executa (eleger
   * proposta, retentar a DDI, a borda `em_calculo →` dos indicadores). Desde
   * 19/09/2026 o GATE 1 exige a alçada **acionada com sucesso**
   * (`avaliarAlcadaParaGate1`), e o desfecho dela é ASSÍNCRONO: o `/simulate`
   * responde 202 e o veredito chega por leitura do
   * `AlcadaSimulationPollWorker` — quando não é o `AlcadaAutoAcionamentoService`
   * que dispara tudo sem clique nenhum. Sem este aviso o painel passava a
   * exibir a cadeia de níveis e a barra logo abaixo continuava dizendo "Alçada
   * ainda não acionada com sucesso", com o CTA desabilitado, até o F5.
   *
   * O backend estava certo dos dois lados (`Gate1ReadinessService` é o
   * predicado único); o que faltava era o sinal de VOLTA — o par do
   * `alcadaRefreshSignal`. É o MESMO cabeamento que o `SnegAnaliseShell` já
   * tinha para o GATE 2 (`handleAlcadaProntidaoMudou` lá), e esta era a única
   * das duas telas que montam o painel sem escutá-lo.
   *
   * `useCallback` com deps vazias: o painel guarda o callback numa ref para
   * manter a identidade de `reload` estável, e uma função nova a cada render
   * do pai refaria a leitura inicial em laço.
   */
  const handleAlcadaProntidaoMudou = useCallback(() => {
    setGate1RefreshSignal((n) => n + 1);
  }, []);

  // ---------------------------------------------------------------------------
  // Indicadores consolidados (OPP-F7 / VBR-401, VBR-403)
  // ---------------------------------------------------------------------------
  // The consolidated snapshot travels in the opportunity payload itself
  // (`indicadores` JSONB, written by `OpportunityArpCallbackWorker` with
  // tir/vpl/tma/calculadoEm/status) — there is no second fetch and no nested
  // sub-card: the "Análise financeira" card renders ONE grid, as the prototype
  // (`01b-oportunidade.html`) does.
  //
  // The calculation is asynchronous: while `em_calculo` the numbers in the slot
  // are the PREVIOUS ones (HU-13.2), so they are captioned and subordinated,
  // and the section revalidates on its own until the callback lands.

  const indicadores = opportunity?.indicadores ?? null;
  const indicatorStatus = indicadores?.status ?? null;
  /** Present slot whose `status` this frontend does not recognise → safe state. */
  const indicatorStatusUnknown = indicadores !== null && indicatorStatus === null;
  const isCalculating = indicatorStatus === IndicatorStatus.EmCalculo;
  const calculationUnavailable = indicatorStatus === IndicatorStatus.Indisponivel;
  const indicatorIsOutdated = indicatorStatus === IndicatorStatus.Desatualizado;
  /*
   * `desatualizado` entrou aqui em 04/09/2026, junto do CTA. Ele significa que
   * um insumo de proposta eleita mudou depois do último cálculo — logo o que
   * está no slot é a rodada ANTERIOR, exatamente como em `em_calculo`.
   * Enquanto o card não tinha botão, marcá-lo apenas subordinaria números sem
   * oferecer conserto; agora o conserto está ao lado.
   */
  const indicatorValuesAreStale =
    isCalculating || calculationUnavailable || indicatorStatusUnknown || indicatorIsOutdated;

  const revalidateIndicators = useCallback(() => {
    void fetchDetail({ quiet: true });
  }, [fetchDetail]);

  // ── CTA "↻ Recalcular / Simular (ARP)" da "Análise financeira" ────────────
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcErro, setRecalcErro] = useState<string | null>(null);
  const [recalcAviso, setRecalcAviso] = useState<string | null>(null);

  const handleRecalcularIndicadores = useCallback(async () => {
    // O guard vive TAMBÉM aqui: esconder o botão é UX, e o clique não é a
    // única forma de chegar ao handler.
    if (!canWrite || recalcBusy || isCalculating) return;
    setRecalcBusy(true);
    setRecalcErro(null);
    setRecalcAviso(null);
    try {
      const resultado = await recalculateIndicators(opportunityId);
      /*
       * O backend só consolida quando TODA proposta eleita está com a TIR
       * atualizada (regra de 04/09/2026). Quando ele segura, nada muda na pill
       * — e sem esta frase o clique não teria retorno visível nenhum.
       */
      if (!consolidadoFoiSubmetido(resultado)) {
        setRecalcAviso(AGUARDANDO_PROPOSTAS_MSG);
      }
    } catch (err) {
      setRecalcErro(
        err instanceof Error
          ? err.message
          : 'Falha ao recalcular os indicadores consolidados.',
      );
    } finally {
      setRecalcBusy(false);
      /*
       * Relê nos DOIS desfechos. No sucesso é a releitura que põe o card em
       * "Em cálculo" — a resposta do ARP é um aceite (202), não o resultado
       * (VBR-401), então nada muda na tela sem ela. E num 409 é ela que
       * mostra o cálculo que já está em voo, que é justamente o que o usuário
       * queria pedir.
       */
      revalidateIndicators();
    }
  }, [
    canWrite,
    recalcBusy,
    isCalculating,
    recalculateIndicators,
    opportunityId,
    revalidateIndicators,
  ]);

  const { exhausted: pollExhausted } = useCalculationPolling(
    isCalculating,
    revalidateIndicators,
  );

  /*
   * The ARP result arrives by callback, so the calculation finishing is only
   * observable as the `em_calculo` → terminal edge. GATE 1 readiness requires
   * `indicadores.tir/vpl` filled, so the sendbar checklist has to be re-read
   * exactly there — otherwise it keeps saying the indicators are missing until
   * the user reloads by hand.
   */
  const lastIndicatorStatusRef = useRef<IndicatorStatus | null>(indicatorStatus);
  useEffect(() => {
    const previous = lastIndicatorStatusRef.current;
    lastIndicatorStatusRef.current = indicatorStatus;
    if (
      previous === IndicatorStatus.EmCalculo &&
      indicatorStatus !== IndicatorStatus.EmCalculo
    ) {
      setGate1RefreshSignal((n) => n + 1);
    }
  }, [indicatorStatus]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  if (loadStatus === 'loading') {
    return (
      <>
        <div role="status" aria-live="polite" aria-busy="true" className="space-y-3">
          <span className="sr-only">Carregando oportunidade…</span>
          <div className="h-32 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
          <div className="h-48 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
          <div className="h-56 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        </div>
      </>
    );
  }

  if (loadStatus === 'not-found') {
    return (
      <>
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-12 text-center"
        >
          <p className="text-(length:--t-h4) font-bold">Oportunidade não encontrada</p>
          <p className="mt-1 text-(length:--t-caption) text-(--color-text-muted)">
            O código solicitado não existe ou você não tem acesso.
          </p>
          <Link
            href="/oportunidades"
            className="mt-4 inline-flex font-bold text-(--secondary-600) hover:underline"
          >
            ← Voltar para oportunidades
          </Link>
        </div>
      </>
    );
  }

  if (loadStatus === 'error') {
    return (
      <>
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-6 py-12 text-center"
        >
          <p className="text-(--color-danger)">{errorMsg}</p>
          <button
            type="button"
            onClick={() => void fetchDetail()}
            className="mt-3 cursor-pointer font-bold text-(--secondary-600) hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      </>
    );
  }

  if (!opportunity) return null;

  /*
   * Fase EM_ANALISE ⇒ esta MESMA rota vira a tela da oportunidade em análise.
   *
   * No protótipo `01b` e `01c` são a mesma tela em fases diferentes: o
   * "Enviar para análise" do `01b` faz
   * `window.location.href = '01c-oportunidade-analise*.html'`
   * (01b-oportunidade.html:274). Não é uma página separada — é a oportunidade
   * depois de entrar em análise. Renderizar sempre o layout de preenchimento
   * (eleger proposta, enviar à análise) deixava o LT sem o andamento da
   * análise, o que a SNEG pediu a ELE e as pendências dele.
   */
  if (opportunity.backendState === 'EM_ANALISE') {
    return (
      /*
       * UMA tela para todos os perfis (`AnaliseView`) desde 25/08/2026: o que
       * varia é o que ela deixa editar, não o que ela mostra. Antes havia uma
       * composição paralela para quem não é analista, e ela ficou estritamente
       * mais pobre. Sem link "ver como outro perfil".
       */
      <div className="pb-[88px]">
        {/*
          GATE 1 success feedback survives the view switch.

          The transition flips `backendState`, so this branch takes over
          immediately (as in the prototype, where `01b` navigates to `01c`) — and
          the confirmation, which used to live in the fill layout below, would
          vanish in the same tick, leaving the LT with a different screen and no
          statement that the submission worked.
        */}
        {gate1SuccessMsg && (
          <p
            role="status"
            aria-live="polite"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--secondary-200) bg-(--secondary-100) px-3.5 py-2.5 text-(length:--t-caption) font-bold text-(--secondary-700)"
          >
            {gate1SuccessMsg}
          </p>
        )}
        <AnaliseView
          opportunityId={opportunityId}
          hideBackToOpportunity
          /*
           * A devolução (`DEVOLVER_AO_LT`) tira a oportunidade de `EM_ANALISE`,
           * e é ESTE componente que ramifica por `backendState` — sem reler, o
           * workspace da SNEG ficava na tela até o reload manual. Releitura, e
           * não flip otimista como o GATE 1: o estado novo traz o motivo, o
           * autor e a data da devolução, que a tela não teria como fabricar.
           */
          onNeedsRefresh={() => void fetchDetail({ quiet: true })}
        />
      </div>
    );
  }

  /*
   * Fase "Em aprovação" ⇒ tela `01d-oportunidade-aprovacao.html`.
   *
   * Antes de 19/08/2026 `EM_APROVACAO` não tinha branch nenhum e caía no
   * fallback — o layout de PREENCHIMENTO (01b). Uma oportunidade esperando a
   * alçada mostrava o formulário do LT, com a sendbar "Enviar para análise",
   * como se nada tivesse acontecido.
   */
  /*
   * ⚠️ Gated por `AprovacaoView` pela MESMA razão que a fase Contrato: a fase
   * substitui a tela inteira, então um perfil sem a permissão recebia o read
   * model com 403 e a `AprovacaoView` respondia `NotFoundScreen` — a
   * oportunidade INTEIRA desaparecia para quem a abriu pela listagem, onde ela
   * continua legitimamente visível.
   *
   * Medido em 20/08/2026 com o perfil **CCOB** na OPP-2026-000057: o read model
   * da oportunidade respondia 200, `GET .../garantia` respondia 200 — e a
   * página inteira dizia "Página não encontrada". Ou seja, quem precisa abrir a
   * oportunidade para analisar a garantia era exatamente quem a perdia.
   *
   * Sem a permissão, cai na visão padrão de leitura abaixo, e é seguro pelo
   * mesmo motivo: a única sendbar dali é a do GATE 1, condicionada a
   * `status === 'preenchimento'`, e uma oportunidade em aprovação nunca está
   * nesse status.
   */
  if (opportunity.backendState === 'EM_APROVACAO') {
    return (
      <AprovacaoView
        opportunityId={opportunityId}
        opportunity={opportunity}
        // O avanço muda a fase; recarregar é o que troca esta view pela
        // ContratoView, do mesmo jeito que o GATE 1 troca para a AnaliseView.
        onAdvanced={() => void fetchDetail()}
      />
    );
  }

  /*
   * Fases da fase Contrato (EM_MINUTA / EM_ASSINATURA / EM_PAGAMENTO / CONCLUIDA)
   * ⇒ esta mesma rota renderiza a ContratoView (01f / 01g / 01h / 01j).
   *
   * Regra da rota: "a tela da oportunidade muda com a FASE, não com a rota".
   * Nenhuma rota nova é criada — seria uma URL que ninguém alcança (CLAUDE.md).
   */
  /*
   * ⚠️ SEM gate de perfil (16/09/2026) — a tela é da FASE, não do papel.
   *
   * Havia aqui um `can(Permission.ContractView)`, e o fallback para a visão de
   * preenchimento parecia inofensivo ("é só leitura"). Não era: o corpo de
   * baixo é a tela de EDIÇÃO, com outro conjunto de cards, outro formato de
   * propostas e a pill derivada do `status` grosso. Medido no stage em
   * `PCR-VITORIA-000123/2026`: como LT a oportunidade mostrava "Em Minuta" e as
   * seções Minuta/Assinatura/Contrato; como CCOB mostrava "Em contrato",
   * "Análise financeira", "Garantias" e o painel da saga da alçada — nada disso
   * é a tela daquela fase — e nenhuma seção do contrato. A visão mais pobre era
   * a de quem opera a fase.
   *
   * O 403 que justificava o gate deixou de existir: `GET .../contrato` e
   * `GET .../aprovacao` não filtram mais por papel, e o que recorta é o PAYLOAD
   * (`contrato-read-roles.ts` / `obra-read-roles.ts`). A escrita continua
   * fechada onde sempre esteve — `ContractDraftManage`,
   * `ContractSignatureSend`, `ContractSignatureRemind`,
   * `ContractBankDataRequest` — e a sendbar nega por default o que não estiver
   * mapeado.
   */
  if (
    opportunity.backendState === 'EM_MINUTA' ||
    opportunity.backendState === 'EM_ASSINATURA' ||
    opportunity.backendState === 'EM_PAGAMENTO' ||
    opportunity.backendState === 'CONCLUIDA'
  ) {
    return (
      <div className="pb-[88px]">
        <ContratoView opportunityId={opportunityId} />
      </div>
    );
  }

  // Group proposals by bandeira/negócio. Proposals without one (the backend
  // does not expose it yet) fall into a single unlabelled bucket — the heading
  // is only rendered for named groups.
  const proposalGroups = opportunity.propostas.reduce<Record<string, OpportunityProposal[]>>(
    (acc, p) => {
      const key = p.group ?? '';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    },
    {},
  );

  // Scenario comparison (02-comparacao) is posto-only: count PCR proposals to
  // decide whether to offer the "Comparar cenários" control.
  const postoCount = opportunity.propostas.filter(
    (p) => p.tipoProposta === TipoProposta.PCR,
  ).length;

  // Build edit initial values from current opportunity
  const editInitial: EditFields = {
    title: opportunity.title,
    description: opportunity.description ?? '',
    briefing: opportunity.briefing ?? '',
    parecerLt: opportunity.parecerLt ?? '',
    finalidade: opportunity.finalidade ?? '',
    clientRecebedorId: opportunity.clientRecebedorId ?? '',
    possuiNovaImagemPista:
      opportunity.possuiNovaImagemPista === null
        ? ''
        : opportunity.possuiNovaImagemPista
          ? 'sim'
          : 'nao',
    seraColocadaNovaImagemPista:
      opportunity.seraColocadaNovaImagemPista === null
        ? ''
        : opportunity.seraColocadaNovaImagemPista
          ? 'sim'
          : 'nao',
    alteracaoMinutaPadrao:
      opportunity.alteracaoMinutaPadrao === null ||
      opportunity.alteracaoMinutaPadrao === undefined
        ? ''
        : opportunity.alteracaoMinutaPadrao
          ? 'sim'
          : 'nao',
    descricaoAlteracaoMinutaPadrao:
      opportunity.descricaoAlteracaoMinutaPadrao ?? '',
  };

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Header card                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-2 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-5">
        <div className="flex flex-wrap items-center gap-2.5 text-(length:--t-caption)">
          {/*
           * Derived from the proposals, never asserted.
           *
           * This was the literal string `POSTO`. A freshly created opportunity
           * with zero proposals therefore claimed to be a posto (measured on
           * OPP-2026-000057, 20/08/2026), and so did a franchise-only one — the
           * home screen counts 3 BR Mania and 2 Lubrax+, so it is not an edge.
           * Nothing assertable ⇒ no pill, which is the repo rule: the UI omits
           * what the backend does not produce instead of inventing it.
           */}
          {opportunityAssetClassPills(opportunity.propostas).map((label) => (
            <StatusPill key={label} variant="neutral">
              {label}
            </StatusPill>
          ))}
          <StatusPill variant={STATUS_VARIANT[opportunity.status] ?? 'neutral'}>
            {STATUS_LABEL[opportunity.status] ?? opportunity.status}
          </StatusPill>
          <span className="text-(--color-text-muted)">{opportunity.code}</span>
          {/*
            * O identificador do Salesforce ao lado do nosso — ADO 68142.
            *
            * O org sobrescreve `Opportunity.Name` com o sequencial dele
            * (medido ao vivo em 03/09/2026: 0 de 40 oportunidades desta
            * plataforma mantêm o valor que enviamos), então `4567384` é o
            * número que o negócio tem na mão quando está no CRM. Sem ele aqui,
            * cruzar os dois lados era impossível nas duas direções.
            *
            * Prefixado com "SF" porque é um número de OUTRO sistema: solto ao
            * lado de `PCR-…` ele leria como uma segunda numeração nossa.
            * Ausente ⇒ nada é renderizado (a oportunidade ainda não foi
            * integrada, e "SF —" afirmaria uma lacuna de fonte que não existe).
            */}
          {/*
            * ADO 68142 (reabertura de 03/09/2026) — o número é LINK para o
            * registro no org: *"a Michelle solicitou um link para abrir uma aba
            * direto no Salesforce com a Oportunidade"*. Sem `salesforceUrl` ele
            * volta a ser texto, nunca um link morto.
            */}
          {opportunity.salesforceCode && (
            <span className="text-(--color-text-muted)">
              <SalesforceRecordLink
                code={opportunity.salesforceCode}
                url={opportunity.salesforceUrl}
                prefix="· SF "
                testId="opp-header-sf-code"
              />
            </span>
          )}
        </div>

        <h1 className="mt-1.5 mb-0.5 text-(length:--t-h2) font-bold leading-tight">
          {opportunity.title}
        </h1>
        <div className="text-(length:--t-caption) text-(--color-text-muted)">
          <Link
            href={`/clientes/${opportunity.clientId}`}
            className="font-bold text-(--secondary-600) hover:underline"
          >
            {opportunity.clientName}
          </Link>
          {(() => {
            const rest = [
              opportunity.clientDocument,
              opportunity.franchises.length > 0 ? opportunity.franchises.join(' · ') : null,
              formatSalesZone(opportunity.salesZone),
            ].filter(Boolean);
            return rest.length > 0 ? ` · ${rest.join(' · ')}` : null;
          })()}
        </div>

        {/*
          * Nota da devolução — logo abaixo da linha do cliente, antes da barra
          * de metadados. É a resposta à pergunta "por que isto voltou para
          * mim?", e ela precisa estar onde o olho já está (título → cliente),
          * não no fim da página nem dentro de um card que colapsa.
          */}
        <DevolucaoAoLtNote devolucao={opportunity.devolucaoAoLt} />

        {/* Meta bar — Responsável · Zona de venda · Equipe da oportunidade.
            Sempre exibidos (com "—" quando sem dado). O bloco "Valor estimado"
            do protótipo foi removido a pedido do produto; a data de criação
            permanece à direita. */}
        <div className="mt-4 flex flex-wrap gap-9 border-t border-(--color-border) pt-4">
          <div>
            <div className="text-[12px] uppercase tracking-[0.3px] text-(--color-text-muted)">
              Responsável
            </div>
            <div className="mt-0.5 text-(length:--t-caption) font-bold">
              {opportunity.owner
                ? `${opportunity.owner}${opportunity.ownerRole ? ` · ${opportunity.ownerRole}` : ''}`
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-[12px] uppercase tracking-[0.3px] text-(--color-text-muted)">
              {ZONA_VENDA_FIELD_LABEL}
            </div>
            <div className="mt-0.5 text-(length:--t-caption) font-bold">
              {textoZonaVenda(opportunity.profitCenters) ?? '—'}
            </div>
          </div>
          <div>
            <div className="text-[12px] uppercase tracking-[0.3px] text-(--color-text-muted)">
              Equipe da oportunidade
            </div>
            {/*
              * SÓ o escritório de vendas da conta — ADO 67984 (reaberto em
              * 02/09/2026), que REVISA o Bug 67589: a barra listava o
              * escritório seguido dos primeiros nomes da equipe e um chip
              * "+N" que abria a lista completa. A regra e o porquê da reversão
              * (inclusive por que o rótulo continua este) vivem em
              * `equipeMetaBarValue`, que é o predicado único desta barra — a
              * versão anterior tinha uma segunda cópia da regra dentro do
              * próprio teste.
              *
              * A equipe segue inteira nos chips da seção "Equipe" do card
              * "Dados da oportunidade", com "Gerenciar equipe" ao lado.
              */}
            <div className="mt-0.5 text-(length:--t-caption) font-bold">
              {equipeMetaBarValue(opportunity.salesOffice)}
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[12px] text-(--color-text-muted)">
              Criada em {formatInstantDateBR(opportunity.createdAt)}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Trilhas paralelas (oj2 — Fluxo Principal · Garantia · Obra)         */}
      {/* Principal avança para "Em análise" após o GATE 1 (F8).             */}
      {/* ------------------------------------------------------------------ */}
      <OpportunityFlowTabs
        opportunityId={opportunity.id}
        backendState={opportunity.backendState}
        status={opportunity.status}
        refreshSignal={garantiaFlowRefreshSignal}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Timeline da oportunidade (F4 — HU-05): card removido da fase        */}
      {/* Preenchimento (nada aconteceu ainda). O componente permanece nas    */}
      {/* demais fases (AnaliseView, ContratoView). — CA-1/CA-2 VBR-463.     */}
      {/* ------------------------------------------------------------------ */}

      {gate1SuccessMsg && (
        <p
          role="status"
          aria-live="polite"
          className="mt-3 rounded-[var(--radius-xs)] border border-(--secondary-200) bg-(--secondary-100) px-3.5 py-2.5 text-(length:--t-caption) font-bold text-(--secondary-700)"
        >
          {gate1SuccessMsg}
        </p>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Dados da oportunidade (esq.) + Análises/DDI (aside dir.) — .dlayout  */}
      {/* ------------------------------------------------------------------ */}
      {/*
        ⚠️ `min-[961px]:`, nunca `lg:` — o protótipo colapsa o `.layout` em
        `max-width:960px` e o `lg` do Tailwind é 1024px, deslocando a quebra em
        64px. Mesma regra (e mesma razão) dos outros três shells da
        oportunidade; ver `design-tokens.test.ts`, que agora cobre este arquivo.
      */}
      <div className="grid items-start gap-4 min-[961px]:grid-cols-[1fr_320px]">
      {/* Left column: every opportunity box stacked at one shared width. */}
      <div className="flex min-w-0 flex-col">
      <Section
        title="Dados da oportunidade"
        action={
          // Gate the edit button behind Permission.OpportunityEdit: the backend
          // PATCH endpoint is restricted to LT | SNEG | ADMIN (COR-12).
          // WriteOnly (Permission.Write) is too broad — roles like CCOB and
          // COMPLIANCE hold Write but not OpportunityEdit and would see a button
          // that answers 403.
          can(Permission.OpportunityEdit) && (
            <button
              type="button"
              onClick={openEdit}
              className="cursor-pointer text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
            >
              Editar
            </button>
          )
        }
      >
        {/* Ordem e labels espelham exatamente o protótipo 01b-oportunidade-nova.
            Campos sem dado no backend renderizam "—" (ver tabela de gaps). */}
        {/*
          ⚠️ **Uma coluna até 960px — é o `.dgrid` do protótipo**, que colapsa em
          `@media(max-width:960px)`. Era `max-sm:grid-cols-1` (640px), então
          entre 640 e 960 a tela mantinha DUAS colunas onde o desenho tem uma:
          com "Título" e "Cliente (SAP + Razão Social)" lado a lado, a razão
          social quebrava uma palavra por linha e o rótulo da coluna da direita
          encostava no da esquerda ("TÍTULOFINALIDADE"). Relatado em 17/09/2026
          com print do stage contra o protótipo.

          Os 7 protótipos da oportunidade (01b, 01b-nova, 01c, 01c-lt, 01d, 01f,
          01h) trazem a MESMA regra, sem exceção — não é escolha desta tela.
        */}
        <div className="grid grid-cols-1 gap-x-7 gap-y-3 min-[961px]:grid-cols-2">
          <DataField label="Título" value={opportunity.title} />
          {/* ADO 68242 — ver `finalidade-oportunidade.ts`. */}
          <DataField
            label={FINALIDADE_FIELD_LABEL}
            value={textoFinalidade(opportunity.finalidade)}
          />
          <DataField label="Código" value={opportunity.code} />
          {/*
            * Par do campo acima: o mesmo fato nos dois sistemas, lado a lado.
            * `DataField` já rende "—" para nulo, e aqui o travessão é a
            * resposta certa — "ainda não integrada ao Salesforce" é fato de
            * negócio (o vínculo só nasce no primeiro acionamento da alçada).
            */}
          {/*
            * O `null` explícito é load-bearing: `DataField` rende `value ?? '—'`,
            * e um `<SalesforceRecordLink>` que devolve `null` NÃO é `null` para
            * o `??` — é um elemento que renderiza vazio. Sem o ternário o
            * travessão de "ainda não integrada" desaparecia da tela.
            */}
          <DataField
            label="Oportunidade no Salesforce"
            value={
              opportunity.salesforceCode ? (
                <SalesforceRecordLink
                  code={opportunity.salesforceCode}
                  url={opportunity.salesforceUrl}
                  testId="opp-card-sf-code"
                />
              ) : null
            }
          />
          <DataField
            label="Status"
            value={
              <StatusPill variant={STATUS_VARIANT[opportunity.status] ?? 'neutral'} size="sm">
                {STATUS_LABEL[opportunity.status] ?? opportunity.status}
              </StatusPill>
            }
          />
          <DataField
            label="Cliente (SAP + Razão Social)"
            value={sapAndName(opportunity)}
          />
          {/*
           * Derived from the proposals, same source as the header pills.
           * Was the literal `—`: a permanently empty field reads as data the
           * system failed to load, not as "there is no proposal yet".
           */}
          <DataField
            label="Tipo"
            value={opportunityAssetClassText(opportunity.propostas) ?? '—'}
          />
          <DataField label="Descrição" value={opportunity.description ?? '—'} fullWidth />
          {/*
            * `opened_at` / `completed_at` / `created_at` are `timestamptz` —
            * INSTANTS. Slicing them to ten characters took the UTC calendar
            * day, so anything created after 21:00 BRT displayed tomorrow's
            * date, while the pendências of the same opportunity (which parse
            * the instant) displayed today's (VBR-635 §3).
            */}
          {/*
            * ADO 68242 — as datas de início/fim de CONSUMO.
            *
            * O protótipo tem esta linha neste card em nove telas; o código a
            * tinha em UMA (o workspace SNEG), e lá exibia `—` porque os dois
            * campos eram `null` chumbado no mapper. O backend passou a derivá-la
            * da proposta ELEITA (`janelaConsumo`) — a janela de análise É a de
            * consumo (RN-F5-04) —, então a linha existe onde o protótipo a põe.
            */}
          <DataField
            label="Datas de início/fim de consumo"
            value={textoJanelaConsumo(opportunity.startDate, opportunity.endDate)}
          />
          <DataField
            label="Data de abertura"
            value={formatInstantDateBR(opportunity.dataAbertura ?? opportunity.createdAt)}
          />
          <DataField
            label="Data de conclusão"
            value={formatInstantDateBR(opportunity.dataConclusao)}
          />
          {/* Grupo Empresa — não existe no OpportunityDto (mapping = null). */}
          <DataField label="Grupo Empresa" value={opportunity.companyGroup ?? '—'} />
          <DataField label="Criado por" value={opportunity.createdBy || '—'} />
          <DataField
            label={AREAS_VENDA_FIELD_LABEL}
            value={textoAreasVenda(opportunity.salesZone) ?? '—'}
            fullWidth
          />
          {/* Consolidado da proposta de posto (F4) — PRD F2 bloco principal. */}
          <DataField
            label="Situação atual do posto"
            value={
              opportunity.situacaoPosto
                ? opportunity.situacaoPosto.details
                  ? `${opportunity.situacaoPosto.label} · ${opportunity.situacaoPosto.details}`
                  : opportunity.situacaoPosto.label
                : '—'
            }
          />
          {/*
            * Mapa da Rede do CLIENTE (09/09/2026) — logo abaixo da situação do
            * posto, como o negócio pediu.
            *
            * SEMPRE renderizados, inclusive vazios: é o par que explica por que
            * a oportunidade pôde (ou não pôde) ser criada aqui, e escondê-lo no
            * caso vazio deixaria o card mudo justamente sobre a conta que não
            * participa do mapa — que é a maioria.
            *
            * ⚠️ `—` no Status NÃO é o mesmo que "fora do mapa": o `''` da
            * fórmula do org é ausência de status. Quem afirma o mapa é a
            * Situação, no campo ao lado. Ver `lib/mapa-da-rede.ts`.
            */}
          <DataField
            label={STATUS_MAPA_DA_REDE_FIELD_LABEL}
            value={textoStatusMapaDaRede(opportunity.mapaDaRede?.status) ?? '—'}
            hint={STATUS_MAPA_DA_REDE_HELP}
          />
          <DataField
            label={SITUACAO_MAPA_DA_REDE_FIELD_LABEL}
            value={
              textoSituacaoMapaDaRede(opportunity.mapaDaRede?.situacao) ?? '—'
            }
          />
          {/*
            * "Haverá alteração de minuta padrão?" (ADO 68438) — o rótulo é o do
            * ticket, e o do próprio campo no Salesforce ("Haverá alteração da
            * Minuta Padrão?").
            *
            * ⚠️ `—` aqui significa **não respondido**, e é diferente de "Não".
            * Renderizar "Não" para o campo vazio reencenaria o defeito: a
            * plataforma afirmava "Não" no org em 41 de 41 oportunidades sem que
            * ninguém tivesse respondido. O travessão é a leitura honesta, e o
            * botão "Editar" é onde a resposta é dada.
            */}
          <DataField
            label={ALTERACAO_MINUTA_PADRAO_FIELD_LABEL}
            value={textoAlteracaoMinutaPadrao(opportunity.alteracaoMinutaPadrao)}
          />
          {/*
            * A descrição da alteração só aparece quando existe — e ela só existe com a
            * resposta "Sim" (o backend limpa a coluna nos demais casos).
            * Renderizar a linha vazia sugeriria um campo por preencher numa
            * negociação que segue o padrão.
            */}
          {opportunity.descricaoAlteracaoMinutaPadrao && (
            <DataField
              label={DESCRICAO_ALTERACAO_MINUTA_PADRAO_FIELD_LABEL}
              value={opportunity.descricaoAlteracaoMinutaPadrao}
            />
          )}
          {/*
            * A "Finalidade" subiu para a primeira grade do card (ADO 68242), no
            * lugar do "Tipo de negociação". Ela vivia aqui como "extra do
            * backend"; repeti-la produzia o MESMO campo duas vezes na mesma
            * tela — medido em 09/09/2026, `FINALIDADE / Implantação` aparecia
            * acima e de novo ao lado da situação do posto.
            */}
          {/*
            * Nova imagem de pista — o campo que o gate da alçada manda preencher.
            *
            * Só o modal de edição o tinha, então a recusa "informe nos dados da
            * oportunidade" apontava para um card onde ele não aparecia (ADO
            * 67941). Sempre renderizado, inclusive vazio: é justamente o estado
            * "não respondido" que trava a alçada, e escondê-lo devolveria o card
            * a não dizer nada sobre a pendência.
            */}
          {/*
            * A regra (quais linhas, com que rótulo) vive em
            * `lib/opportunities/nova-imagem-pista.ts` desde 02/09/2026 — as
            * outras três telas com card de dados ficaram sem o campo quando ele
            * entrou aqui, e é justamente no workspace SNEG que a alçada recusa
            * por ele.
            */}
          {camposNovaImagemPista(opportunity).map((c) => (
            <DataField key={c.label} label={c.label} value={c.value} />
          ))}
          {/*
            * ADO 68473 — briefing + "Parecer do LT", os dois textos do LT.
            *
            * A regra (quais linhas, com que rótulo) vive em
            * `lib/opportunities/textos-do-lt.ts` desde 18/09/2026: o briefing
            * existia SÓ aqui, e quem lê a oportunidade nas fases seguintes
            * (SNEG, aprovação, contrato) não o alcançava. Renderizados sempre,
            * inclusive vazios — ver o módulo para o porquê.
            */}
          {camposTextosDoLt(opportunity).map((c) => (
            <DataField key={c.label} label={c.label} value={c.value} fullWidth />
          ))}
        </div>

        {/* Team */}
        {(opportunity.team.length > 0 || canWrite) && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[14px] uppercase tracking-[0.3px] text-(--color-text-muted)">
                Equipe
              </div>
              {/*
               * O CTA renderiza só para quem escreve. A autoridade REAL é do
               * backend (`assertCanManageTeam` — RN-F1-02: LT principal,
               * gestor/superior ou SNEG), e é o `TeamSection` que reflete isso
               * por `canManage`; aqui `canWrite` é apenas o piso de
               * somente-leitura, o mesmo que o `ReadOnlyProfileGuard` aplica.
               */}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    /*
                     * Ao FECHAR, relê o detalhe em modo quieto: os chips são
                     * `opportunity.team`, e sem a releitura eles ficariam com a
                     * equipe anterior à edição. Quieto porque branquear a tela
                     * inteira ao sair de uma edição bem-sucedida esconde
                     * justamente o resultado dela.
                     */
                    if (teamEditing) void fetchDetail({ quiet: true });
                    setTeamEditing((prev) => !prev);
                  }}
                  className="ml-auto cursor-pointer rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-white px-3 py-1 text-(length:--t-small) font-bold text-(--secondary-600) hover:bg-(--secondary-100)"
                  data-testid="equipe-gerenciar"
                >
                  {teamEditing ? 'Concluir' : 'Gerenciar equipe'}
                </button>
              )}
            </div>
            {teamEditing ? (
              /*
               * Substitui os chips em vez de somar-se a eles: o `TeamSection`
               * já lista a equipe inteira por balde, e o balde é o que permite
               * escolher um executivo de franquia (ADR-0043). Duas listas do
               * mesmo fato, uma acima da outra, é ruído.
               */
              <div className="mt-2.5">
                <TeamSection opportunityId={opportunityId} mode="edit" />
              </div>
            ) : (
            <div className="mt-1.5 flex flex-wrap gap-2" data-testid="equipe-chips">
              {opportunity.team.length === 0 ? (
                <span className="text-(length:--t-small) text-(--color-text-muted)">
                  Nenhum membro na equipe.
                </span>
              ) : (
                opportunity.team.map((member) => (
                <span
                  key={member.id}
                  className="rounded-full bg-(--neutral-60) px-3 py-1 text-(length:--t-small) font-bold"
                >
                  {member.name}
                  {/* Protótipo `01b`: "Ana Ribeiro · LT · SP Capital ·
                      principal". O qualificador prefere o PERFIL ao balde de
                      franquia — este chip imprimia `member.role` (valor de
                      máquina, e depois o rótulo do balde), afirmando "Demais
                      membros" até para o LT principal. Trecho ausente é
                      OMITIDO, nunca substituído por um rótulo genérico, e a
                      composição é uma junção só: concatenar pedaços deixava
                      espaço duplo quando o primeiro deles faltava. */}
                  {(() => {
                    const parts = [
                      teamMemberQualifier(member),
                      member.zone,
                      member.isPrincipal ? 'principal' : null,
                    ].filter(Boolean);
                    if (parts.length === 0) return null;
                    return (
                      <span className="font-normal text-(--color-text-muted)">
                        {' '}
                        · {parts.join(' · ')}
                      </span>
                    );
                  })()}
                </span>
                ))
              )}
            </div>
            )}
          </div>
        )}
      </Section>
      {/* ------------------------------------------------------------------ */}
      {/* Propostas desta oportunidade                                         */}
      {/* ------------------------------------------------------------------ */}
      <Section
        id="propostas"
        title="Propostas desta oportunidade"
        action={
          // Creating a proposal is the LT/EV's act (PRD F3): without either
          // create permission the selector modal would render zero options.
          opportunity.propostas.length > 0 &&
          (can(Permission.ProposalManage) ||
            can(Permission.FranquiaPropostaManage)) ? (
            <button
              type="button"
              onClick={() => setNovaPropModalOpen(true)}
              className="inline-flex cursor-pointer items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-white px-3 py-1.5 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-40)"
            >
              + Nova proposta
            </button>
          ) : undefined
        }
      >
        {proposalError && (
          <p
            role="alert"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--color-danger-bg) bg-(--color-danger-bg) px-3 py-2 text-(length:--t-caption) text-(--color-danger)"
          >
            {proposalError}
          </p>
        )}

        {/*
          "Não deu para ler" NUNCA se parece com "não há proposta".
          A frase diz o que é desconhecido (e não o que é falso) e oferece o
          conserto. `role="alert"` porque isto contradiz o resto da tela: quem
          está olhando precisa saber que a seção abaixo pode estar incompleta.
        */}
        {proposalsUnavailable && (
          <div
            role="alert"
            data-testid="propostas-indisponiveis"
            className="mb-3 rounded-[var(--radius-xs)] border border-(--color-danger-bg) bg-(--color-danger-bg) px-3 py-2 text-(length:--t-caption) text-(--color-danger)"
          >
            <p className="font-bold">Não foi possível carregar as propostas.</p>
            <p>
              Esta lista pode estar incompleta — não conclua que a oportunidade está sem
              proposta.
            </p>
            <button
              type="button"
              onClick={() => void fetchDetail({ quiet: true })}
              className="mt-1.5 cursor-pointer font-bold underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/*
          O estado de vazio é uma AFIRMAÇÃO ("esta oportunidade não tem
          proposta") e um convite a criar a primeira — então só aparece quando a
          leitura respondeu. Com a leitura falhada, o aviso acima é a única
          coisa que a tela tem o direito de dizer.
        */}
        {!proposalsUnavailable && Object.keys(proposalGroups).length === 0 && (
          <div className="rounded-[var(--radius-md)] border border-dashed border-(--color-border-strong) bg-(--neutral-25) px-5 py-9 text-center">
            <p className="mb-4 text-(length:--t-body) font-bold">
              Nenhuma proposta criada ainda
            </p>
            {(can(Permission.ProposalManage) ||
              can(Permission.FranquiaPropostaManage)) && (
              <button
                type="button"
                onClick={() => setNovaPropModalOpen(true)}
                className="inline-flex cursor-pointer items-center rounded-[var(--radius-xxs)] bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-hover)"
              >
                + Nova proposta
              </button>
            )}
          </div>
        )}

        {Object.entries(proposalGroups).map(([group, proposals]) => (
          <div key={group}>
            {group && (
              <div className="mb-2.5 mt-5 border-b border-(--color-border) pb-1.5 text-(length:--t-caption) font-bold first:mt-1.5">
                {group}
              </div>
            )}
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                opportunityId={opportunityId}
                fase={{
                  backendState: opportunity.backendState,
                  status: opportunity.status,
                }}
                elected={electedIds.has(proposal.id)}
                canElect={can(Permission.OpportunityCompose)}
                onToggleElect={(id) => void handleToggleElect(id)}
                saving={proposalSaving}
                selectable={proposal.tipoProposta === TipoProposta.PCR}
                selected={selectedForCompare.has(proposal.id)}
                onToggleSelect={toggleCompare}
              />
            ))}
          </div>
        ))}

        {/* Comparar cenários (POSTO) — enabled at ≥2 selected (prototype 01b
            `.actions`). Shown only when the opportunity has ≥2 POSTO proposals. */}
        {postoCount >= 2 && (
          <div className="mt-4 flex justify-start">
            {/*
              * Prototype #btnCmp: turns primary (green fill, white text) once ≥2
              * are selected; disabled uses the shared `.btn:disabled` look —
              * grey (--disabled-bg) fill, (--disabled-text) text, no border.
              */}
            <button
              type="button"
              disabled={selectedForCompare.size < 2}
              onClick={() =>
                router.push(rotaDoApp('oportunidades', opportunityId, 'comparacao'))
              }
              className={`inline-flex items-center rounded-[var(--radius-xxs)] border px-4 py-2 text-(length:--t-caption) font-bold transition ${
                selectedForCompare.size >= 2
                  ? 'cursor-pointer border-(--secondary-500) bg-(--secondary-500) text-white hover:bg-(--secondary-hover)'
                  : 'cursor-not-allowed border-transparent bg-(--disabled-bg) text-(--neutral-500)'
              }`}
            >
              Comparar cenários ({selectedForCompare.size}) →
            </button>
          </div>
        )}
      </Section>


      {/* ------------------------------------------------------------------ */}
      {/* Análise financeira (consolidado F7 — PRD F2 bloco principal;         */}
      {/* protótipo 01b "Análise financeira"). Datas de análise ainda NÃO      */}
      {/* existem no DTO da oportunidade (gap de backend) → "—".               */}
      {/*                                                                     */}
      {/* UM card, UMA grade — como no protótipo. Antes havia um sub-quadro    */}
      {/* "Resultado Financeiro" ANINHADO aqui dentro (card com borda e fundo  */}
      {/* próprios, buscando o snapshot por conta própria), que repetia TIR e  */}
      {/* VPL já exibidos acima: dois quadros para os mesmos números, e cada   */}
      {/* um podia mostrar um valor diferente enquanto o outro não recarregava.*/}
      {/* O snapshot já viaja no payload da oportunidade (`indicadores`), então*/}
      {/* o aviso e as medidas ficam nesta mesma grade.                        */}
      {/*                                                                     */}
      {/* ⚠️ O header TEM pill de status e CTA de recálculo desde 04/09/2026,  */}
      {/* revisando a decisão anterior de não ter nenhum dos dois ("Atualizado"/*/}
      {/* "Desatualizado" não pediam ação do LT). Com o botão ao lado, passam a */}
      {/* pedir: o status é o que diz SE vale clicar. O protótipo segue sem     */}
      {/* pill aqui — a divergência é deliberada.                               */}
      {/* ------------------------------------------------------------------ */}
      {/*
       * Order is the prototype's: Dados → Propostas → Análise financeira →
       * Documentos → Garantias (`01b-oportunidade.html`, nesta sequência). O
       * card financeiro vinha antes das propostas, e a leitura ficava invertida
       * — os números consolidados apareciam antes de o leitor saber sobre quais
       * propostas eles foram calculados.
       */}
      <Section
        id="financeiro"
        title="Análise financeira"
        collapsible
        action={
          /*
           * Pill + CTA (ADO — 04/09/2026). O protótipo não tem nenhum dos dois,
           * e a decisão anterior de omiti-los foi explícita: "'Atualizado' /
           * 'Desatualizado' não pedem ação nenhuma do LT". Passam a pedir —
           * com o botão ao lado, o status é o que diz SE clicar.
           */
          indicatorStatus || (canRecalcular && indicadores !== null) ? (
            <div className="flex items-center gap-2.5">
              {indicatorStatus && (
                <StatusPill
                  data-testid="financeiro-status-pill"
                  variant={INDICATOR_STATUS_PILL_VARIANT[indicatorStatus]}
                >
                  {INDICATOR_STATUS_LABEL[indicatorStatus]}
                </StatusPill>
              )}
              {canRecalcular && (
                <button
                  type="button"
                  data-testid="financeiro-recalcular"
                  onClick={() => void handleRecalcularIndicadores()}
                  /*
                   * Habilitado durante o cálculo, o clique só poderia render
                   * 409 — e leria como "nada está acontecendo, clique de novo".
                   */
                  disabled={recalcBusy || isCalculating}
                  className="inline-flex cursor-pointer items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-white px-3 py-1.5 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-40) disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {recalcBusy ? 'Enviando…' : '↻ Recalcular / Simular (ARP)'}
                </button>
              )}
            </div>
          ) : undefined
        }
      >
        {recalcErro && (
          <p
            role="alert"
            data-testid="financeiro-recalcular-erro"
            className="mb-3 text-(length:--t-caption) text-(--color-danger)"
          >
            {recalcErro}
          </p>
        )}
        {recalcAviso && !recalcErro && (
          <p
            role="status"
            data-testid="financeiro-recalcular-aviso"
            className="mb-3 text-(length:--t-caption) text-(--color-text-muted)"
          >
            {recalcAviso}
          </p>
        )}
        {isCalculating && (
          <CalculatingNotice
            testId="calculating-banner"
            exhausted={pollExhausted}
            onRefresh={revalidateIndicators}
          />
        )}
        {calculationUnavailable && (
          /*
           * `manual` desde 04/09/2026: o card ganhou o CTA de recálculo, então
           * "recalcule para tentar novamente" passou a apontar para um botão
           * que EXISTE — logo acima, no header. Era `automatic` justamente
           * porque não existia.
           */
          <CalculationUnavailableNotice
            testId="calculation-unavailable-banner"
            reason={indicadores?.mensagemErro ?? null}
          />
        )}
        {indicatorStatusUnknown && <UnknownStatusNotice testId="unknown-status-banner" />}

        {/*
         * Never calculated. With no CTA here, this copy is the whole affordance:
         * the consolidated calculation is fired by the backend when a posto (PCR)
         * proposal is elected, so the empty state has to say what fills it.
         */}
        {indicadores === null && (
          <p
            data-testid="indicators-never-calculated"
            className="mb-3 text-(length:--t-caption) italic text-(--color-text-muted)"
          >
            Os indicadores econômicos consolidados (TIR/VPL) são calculados automaticamente
            quando uma proposta de posto é eleita para esta oportunidade — ou agora, por
            &ldquo;Recalcular / Simular (ARP)&rdquo;.
          </p>
        )}

        {indicadores?.calculadoEm && (
          <p className="mb-3 text-(length:--t-small) text-(--color-text-muted)">
            Último cálculo: <strong>{formatTimestamp(indicadores.calculadoEm)}</strong>
          </p>
        )}

        {/*
         * HU-13.2 — while the ARP recalculates (or after a calculation that did
         * not finish) the slot still holds the PREVIOUS values: they are
         * captioned and subordinated, never rendered as the current result.
         */}
        {indicatorValuesAreStale && (
          <StaleValuesCaption testId="financeiro-stale-values-caption" />
        )}
        {/*
         * ADO 68009 — por que a TIR não mudou ao eleger a franquia.
         *
         * Fica ACIMA da grade, junto das demais notas do card, e não como um
         * `DataField` de largura inteira: é a explicação dos números, não mais
         * um deles.
         */}
        <RoyaltyFranquiaNote franquias={opportunity?.franquiasSemRoyalty} />
        <div
          data-testid="financeiro-fields"
          data-stale={indicatorValuesAreStale ? 'true' : 'false'}
          // "Análise financeira" é o SEGUNDO `.dgrid` do 01b (o outro é "Dados
          // da oportunidade"), então carrega a mesma quebra em 961px.
          className={`grid grid-cols-1 gap-x-7 gap-y-3 min-[961px]:grid-cols-2${
            indicatorValuesAreStale ? ` ${STALE_VALUES_CLASS}` : ''
          }`}
        >
          <DataField
            label="TIR da oportunidade"
            value={
              opportunity.indicadores?.tir != null
                ? formatPercentFromDecimal(opportunity.indicadores.tir)
                : '—'
            }
          />
          <DataField
            label="VPL da oportunidade"
            value={
              opportunity.indicadores?.vpl != null
                ? formatCurrency(opportunity.indicadores.vpl)
                : '—'
            }
          />
          <DataField
            label="% bonificação antecipada"
            value={
              opportunity.indicadores?.percentualAntecipacao != null
                ? formatPercentFromDecimal(opportunity.indicadores.percentualAntecipacao)
                : '—'
            }
          />
          <DataField
            label="VMM"
            value={
              opportunity.vmm != null
                ? `${opportunity.vmm.toLocaleString('pt-BR')} m³/mês`
                : '—'
            }
          />
          {/*
            * ADO 67583/67593 — quando o cálculo terminou e o R$/m³ mesmo assim
            * não veio, a tela NOMEIA a fonte em vez de exibir `—` mudo.
            *
            * As duas ausências são fatos diferentes e levam a ações diferentes:
            * sem cálculo nenhum (`calculadoEm` nulo) o traço é a resposta certa
            * — não há o que esperar; com cálculo concluído e o campo vazio, a
            * lacuna é do ARP, que devolve `indiceRealL: null` (pendência
            * registrada no ADR-0039). Colapsar as duas no mesmo traço foi o que
            * fez o campo parecer defeito nosso.
            *
            * Nada é fabricado: derivar o valor localmente produziria um número
            * indistinguível de um real. E a escala é do backend
            * (`arpRealPerLiterToRealPerM3`, ×1000) — a tela não converte.
            */}
          <DataField
            label="Resultado R$/m³"
            value={
              opportunity.indicadores?.rsPorM3 != null ? (
                `R$ ${opportunity.indicadores.rsPorM3.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /m³`
              ) : indicadores?.calculadoEm ? (
                <span
                  data-testid="financeiro-rs-por-m3-gap"
                  className="font-normal text-(--color-text-muted)"
                >
                  Não informado pelo ARP
                </span>
              ) : (
                '—'
              )
            }
          />
          {/*
           * TMA closes the grid instead of opening it: the prototype's seven
           * fields keep their order, and the measure the ARP also returns is not
           * dropped just because the static mock had no slot for it. Already a
           * percentage (11.05 = 11,05%) — unlike `tir`, it is NOT converted.
           */}
          <DataField
            label="TMA aplicável"
            value={
              indicadores?.tma != null
                ? `${indicadores.tma.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
                : '—'
            }
          />
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Totais - Recursos Financeiros — os seis campos da `Opportunity` no   */}
      {/* Salesforce, somados sobre as propostas eleitas.                      */}
      {/*                                                                     */}
      {/* Montado SEM condição de fase: quem decide se o card se aplica é o    */}
      {/* backend, que devolve o slot `null` enquanto a oportunidade está em   */}
      {/* preenchimento. Nesta tela, portanto, ele só aparece na visão de      */}
      {/* leitura de uma fase posterior — o caminho de fallback de quem não    */}
      {/* tem `AprovacaoView`/`ContractView`.                                  */}
      {/*                                                                     */}
      {/* Logo abaixo de "Análise financeira" de propósito: os dois falam do   */}
      {/* dinheiro consolidado da oportunidade, e este detalha o que a linha   */}
      {/* "% bonificação antecipada" resume.                                   */}
      {/* ------------------------------------------------------------------ */}
      <TotaisRecursosFinanceirosCard
        totais={opportunity.totaisRecursosFinanceiros}
        className="mt-4"
      />

      {/* ------------------------------------------------------------------ */}
      {/* Garantias (GAR-F1 — read model from backend)                       */}
      {/* Decision: section is READ-ONLY. Write path is the pendência ticket  */}
      {/* (PRD §7.2). Gated by GarantiaView — 403 callers see nothing.        */}
      {/*                                                                     */}
      {/* Fica ACIMA de "Documentos da oportunidade" por decisão de produto    */}
      {/* (ADO 67919, 26/08/2026). É divergência deliberada do protótipo       */}
      {/* `01b-oportunidade.html`, que traz Garantias DEPOIS de Documentos —   */}
      {/* registrada aqui em vez de reconciliada em silêncio, porque quem ler  */}
      {/* o protótipo vai encontrar a ordem antiga. A mesma ordem vale no      */}
      {/* workspace SNEG (`sneg-analise-shell.tsx`): as duas telas são a mesma */}
      {/* oportunidade em fases diferentes, e ordens distintas fariam o card   */}
      {/* saltar de lugar ao entrar em análise.                                */}
      {/* ------------------------------------------------------------------ */}
      {can(Permission.GarantiaView) && (
        <Section id="garantias" title="Garantias" collapsible>
          <GarantiasIndicadasCard
            opportunityId={opportunity.id}
            onMutated={() => setGarantiaFlowRefreshSignal((n) => n + 1)}
          />
        </Section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Documentos da oportunidade (F9) — resumo + link p/ o checklist       */}
      {/* completo. Carrega de forma independente; oculto se falhar/vazio.     */}
      {/* ------------------------------------------------------------------ */}
      {documentsSummary && documentsSummary.docs.length > 0 && (
        <Section title="Documentos da oportunidade" collapsible>
          <p className="-mt-1 mb-3.5 text-(length:--t-caption) text-(--color-text-muted)">
            Reunidos no nível da oportunidade e reaproveitados por todas as propostas — não é
            preciso reenviar a cada cenário.
          </p>
          <div className="flex flex-col gap-2">
            {/* Compact summary: cap the list so the detail page stays scannable;
                the full checklist lives behind "Gerenciar documentos →". */}
            {documentsSummary.docs.slice(0, 6).map((doc) => {
              const pill = docStatusPill(doc.status);
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5 text-(length:--t-caption)"
                >
                  <span>{doc.name}</span>
                  <StatusPill variant={pill.variant}>{pill.label}</StatusPill>
                </div>
              );
            })}
          </div>
          {documentsSummary.docs.length > 6 && (
            <p className="mt-2.5 text-(length:--t-caption) text-(--color-text-muted)">
              + {documentsSummary.docs.length - 6} outros documentos
            </p>
          )}
          <div className="mt-3.5">
            <Link
              href={`/oportunidades/${opportunityId}/documentos`}
              className="inline-flex cursor-pointer items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-white px-3 py-1.5 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-40)"
            >
              Gerenciar documentos →
            </Link>
          </div>
        </Section>
      )}

      </div>

        {/* Right column: "Análises" (DDI) + "Pendências" + "Processo de alçada"
            cards stacked, sticky as a unit so they stay visible while the left
            column scrolls. */}
        <div
          data-testid="opportunity-aside"
          className="mt-4 flex flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        >
          {/* ---------------------------------------------------------------- */}
          {/* "Análises" (F10) — o card LOCAL da DDI.                            */}
          {/*                                                                    */}
          {/* ⚠️ Aqui não há ternário desde 16/09/2026, e a razão é que este     */}
          {/* corpo deixou de alcançar as fases posteriores ao GATE 1: a tela da */}
          {/* oportunidade troca para `AnaliseView`/`AprovacaoView`/             */}
          {/* `ContratoView` pela FASE, sem consultar perfil. Quem montava o     */}
          {/* `AnalisesCard` compartilhado aqui era o caminho de quem não tinha  */}
          {/* `AprovacaoView`/`ContractView` — e esse caminho era o defeito, não */}
          {/* a solução: ele entregava a tela de EDIÇÃO a quem só devia ler.     */}
          {/*                                                                    */}
          {/* O card local É o certo nesta fase: antes do GATE 1 não há análise  */}
          {/* a resumir, e é ele que traz o "↻ Tentar novamente" da DDI — a      */}
          {/* única superfície da interface para `POST .../ddi:run` (ADO 67943). */}
          {/* ---------------------------------------------------------------- */}
          {/* Matriz RBAC v2.1 · "Análise DDI · Visualizar" — sem ela, sem card. */}
          {canSeeDdi && (
          <DdiAnalisesCard
            ddi={ddiSummary}
            error={ddiError}
            /* Espelha `DDI_RUN_ROLES` (24/09/2026). Era `canWrite` porque
               `POST .../ddi:run` não tinha `@Roles`; com o gate, `canWrite`
               ofereceria o botão a CCOB, SPCOM, BP Financeiro e TI Sustentação,
               e o clique terminaria em 403. */
            canRetry={can(Permission.DdiRun)}
            onRetry={handleRetryDdi}
            opportunityId={opportunity.id}
            opportunityCode={opportunity.code}
          />
          )}
          <PendenciasCard summary={pendencySummary} opportunityCode={opportunity.code} />
          {/* ---------------------------------------------------------------- */}
          {/* Processo de alçada (ADR-0037 / BPMN SF01–SF08).                    */}
          {/*                                                                    */}
          {/* Vive AQUI, na fase de preenchimento, e não só no workspace SNEG.    */}
          {/* O BPMN modela `simular → ajustar → simular` em ciclo, e quem ajusta */}
          {/* a proposta é o LT: com o painel só em `EM_ANALISE`, ele teria de    */}
          {/* atravessar o GATE 1 antes de saber em que alçada a proposta cai —   */}
          {/* que é justamente a informação que decide se ela está pronta para o  */}
          {/* GATE 1. O acionamento CRIA no primeiro clique e ATUALIZA nos        */}
          {/* seguintes, então re-simular reflete os valores atuais.              */}
          {/*                                                                    */}
          {/* Fica na coluna LATERAL, não na principal (pedido do produto): a     */}
          {/* esquerda é a leitura da oportunidade (dados, propostas, financeiro, */}
          {/* documentos, garantias) e a direita acompanha os processos que       */}
          {/* correm em paralelo — DDI e pendências. A alçada é um deles, e sendo */}
          {/* sticky o painel acompanha a rolagem em vez de sumir da tela         */}
          {/* enquanto o LT ajusta a proposta que ele mede.                       */}
          {/*                                                                    */}
          {/* Fecha a coluna, abaixo de "Pendências" (pedido do produto). O card */}
          {/* de pendências é colapsável e nasce recolhido, então o que fica      */}
          {/* acima deste painel é curto e ele continua alcançável mesmo com este */}
          {/* container rolando por conta própria (`max-h`/`overflow-y-auto`).    */}
          {/*                                                                    */}
          {/* Reusa o `AlcadaSagaPanel` do workspace SNEG em vez de um card       */}
          {/* próprio: o veredito, a cadeia de níveis e o gate são os mesmos, e   */}
          {/* duas superfícies para o mesmo processo divergiriam.                 */}
          {/*                                                                    */}
          {/* Sem `<Section>` em volta: o painel já traz o próprio cartão (borda, */}
          {/* fundo e `h2` no mesmo nível dos demais cards da lateral), e         */}
          {/* envolvê-lo duplicaria a moldura e o título. Sem `mt-4` também: o    */}
          {/* ritmo desta coluna é o `gap-4` do flex, e a margem própria abriria  */}
          {/* um vão a mais entre ele e o card seguinte.                          */}
          {/* O `id` fica no wrapper para a âncora continuar endereçável, como no */}
          {/* workspace SNEG.                                                     */}
          {/* ---------------------------------------------------------------- */}
          <div id="alcada">
            <AlcadaSagaPanel
              opportunityId={opportunity.id}
              refreshSignal={alcadaRefreshSignal}
              /* O aviso de VOLTA: a alçada acionada com sucesso é critério do
                 GATE 1 desde 19/09/2026, e ela conclui de forma assíncrona —
                 ver {@link handleAlcadaProntidaoMudou}. */
              onProntidaoMudou={handleAlcadaProntidaoMudou}
            />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Envio para análise — GATE 1 (F8, HU-14) — barra fixa no rodapé       */}
      {/* (sendbar do protótipo 01b-oportunidade). Só aparece quando há ≥1     */}
      {/* proposta: a tela de oportunidade nova/vazia (01b-oportunidade-nova)  */}
      {/* NÃO tem sendbar — cria-se uma proposta primeiro.                     */}
      {/*                                                                      */}
      {/* ⚠️ ...OU quando a oportunidade foi devolvida ao LT (18/09/2026): o   */}
      {/* motivo tem de ficar visível "até o LT enviar novamente para          */}
      {/* análise", e sem esta ponta ele sumiria justamente se o LT apagasse   */}
      {/* as propostas apontadas na devolução. Não vale para a oportunidade    */}
      {/* nova, que nunca foi devolvida — o protótipo segue respeitado.        */}
      {/* ------------------------------------------------------------------ */}
      {opportunity.status === 'preenchimento' &&
        (opportunity.propostas.length > 0 || opportunity.devolucaoAoLt) && (
        <>
          {/*
            Reserva MEDIDA, não chumbada (ADO 68189).
            Era `h-28` (112px), a altura da barra de uma linha só. Com o rodapé
            listando o que falta — e desde que o gate de franquia entrou na
            pré-checagem, são até seis itens — a barra passou a 134px medidos, e
            os 22px de diferença ficavam por baixo dela: o fim do conteúdo
            inalcançável. Mesmo defeito, e mesma correção, das sendbars de
            franquia; por isso o hook é compartilhado em vez de um número novo.
          */}
          <div aria-hidden="true" style={{ height: sendbarReserva }} />
          <div
            ref={sendbarRef}
            role="region"
            aria-label="Enviar para análise (GATE 1)"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-(--color-border) bg-(--color-surface) shadow-[0_-2px_8px_rgba(0,0,0,0.08)]"
          >
            <div className="mx-auto flex max-h-[40vh] max-w-(--grid-max) flex-col gap-2 overflow-y-auto px-6 py-3">
              {/*
                * O motivo da devolução, ACIMA do gesto de reenviar (pedido de
                * 18/09/2026: "sempre exibido na barra inferior ... até o LT
                * enviar novamente para análise").
                *
                * A nota do cabeçalho continua onde estava — ela responde a
                * pergunta no momento em que a tela abre. O que faltava era a
                * permanência: a tela de preenchimento é longa, e o motivo saía
                * de cena exatamente enquanto o LT corrige o que foi apontado.
                *
                * Quem decide "até quando" é o backend: `devolucaoAoLt` só chega
                * enquanto a fase é de preenchimento, então reenviada a
                * oportunidade a linha some sozinha — sem um segundo predicado
                * aqui, que discordaria do primeiro no caso ambíguo.
                */}
              <DevolucaoAoLtNote devolucao={opportunity.devolucaoAoLt} local="sendbar" />
              <div className="flex w-full items-center">
                <Gate1SendToAnalysis
                  opportunityId={opportunity.id}
                  currentState={opportunity.backendState}
                  refreshSignal={gate1RefreshSignal}
                  onTransitioned={handleGate1Transitioned}
                  onNeedsRefresh={handleGate1NeedsRefresh}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Edit modal                                                            */}
      {/* ------------------------------------------------------------------ */}
      {editOpen && (
        <EditModal
          initial={editInitial}
          saving={saveStatus === 'saving'}
          error={saveError}
          onSave={(fields) => void handleSave(fields)}
          onClose={() => {
            // Sem isto a mensagem da tentativa anterior reaparece na próxima
            // abertura por qualquer caminho que não seja `openEdit`.
            setSaveError('');
            setSaveStatus('idle');
            setEditOpen(false);
          }}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Nova proposta modal (FRQ-15)                                         */}
      {/* ------------------------------------------------------------------ */}
      {novaPropModalOpen && opportunity && (
        <NovaPropostaSelectorModal
          opportunityId={opportunity.id}
          onClose={() => setNovaPropModalOpen(false)}
        />
      )}

    </>
  );
}
