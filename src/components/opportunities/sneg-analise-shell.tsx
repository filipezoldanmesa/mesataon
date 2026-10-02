'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { sapAndName } from '@/lib/clients/customer-reference';
import { ToastContainer, useToast } from '@/components/toast';
import {
  getAnaliseSneg as defaultGetAnalise,
  getApprovalReadiness as defaultGetApprovalReadiness,
  getPendenciasResumo as defaultGetPendencias,
  liberarParaAprovacao as defaultLiberarParaAprovacao,
  reatribuirAnalista as defaultReatribuir,
} from '@/lib/analise/analise.data';
import type {
  AlcadaPreview,
  AnaliseFase,
  AnaliseSneg,
  ApprovalReadiness,
  PendenciasPanelResult,
  ReatribuirAnalistaPayload,
  SnegViability,
} from '@/lib/analise/analise.types';
import {
  ANALISE_FASE_LABEL,
  AnaliseNaoAbertaError,
} from '@/lib/analise/analise.types';
import { devolverProposal as defaultDevolverProposal } from '@/lib/sneg/sneg-analysis.data';
import { devolverOportunidadeAoLt as defaultDevolverOportunidade } from '@/lib/analise/analise.data';
import {
  getOpportunityDetail as defaultGetDetail,
  getOpportunityProposals as defaultGetProposals,
} from '@/lib/opportunities/opportunity-detail.data';
import type { OpportunityDetail, OpportunityProposal } from '@/lib/opportunities/types';
import { PROPOSAL_STATUS_LABEL, ProposalStatus } from '@/lib/opportunities/types';
import { camposNovaImagemPista } from '@/lib/opportunities/nova-imagem-pista';
import { camposTextosDoLt } from '@/lib/opportunities/textos-do-lt';
import { prazoContratoLabel } from '@/lib/proposals/contract-term';
import { proposalHref } from '@/lib/proposals/proposal-href';
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
  textoAreasVenda,
  textoZonaVenda,
} from '@/lib/opportunities/zona-venda-oportunidade';
// Analista SNEG: o recorte é o grupo do Entra do perfil SNEG, lido pelo eixo
// `ENTRA_TEAM_DIRECTORY_DRIVER` — o mesmo que a escrita
// (`AnaliseSnegService.reatribuir`) resolve. Ver `searchSnegAnalysts`.
import { searchSnegAnalysts as defaultSearchAnalistas } from '@/lib/opportunities/directory.data';
import { type DirectoryUser } from '@/lib/opportunities/directory.types';
import { DirectoryPickerModal } from '@/components/directory/directory-picker-modal';
import { DirectoryUserList } from '@/components/directory/directory-user-list';
import {
  getChecklist as defaultGetChecklist,
  setDocValidation as defaultSetDocValidation,
  solicitarReenvioDocumento as defaultSolicitarReenvioDocumento,
} from '@/lib/documents/documents.data';
import type { ChecklistDoc, ChecklistResult } from '@/lib/documents/types';
import type { DdiResult } from '@/lib/opportunities/ddi.types';
import { SalesforceRecordLink } from '@/components/opportunities/salesforce-record-link';
import type { PerfilRiscoResumo } from '@/lib/perfil-credito/perfil-risco-resumo';
import {
  getOpportunityIndicators as defaultGetIndicators,
  recalculateOpportunityIndicators as defaultRecalculateIndicators,
} from '@/lib/opportunities-indicators/opportunity-indicators.data';
import {
  AGUARDANDO_PROPOSTAS_MSG,
  consolidadoFoiSubmetido,
} from '@/lib/opportunities-indicators/recalculo-consolidado';
import type { OpportunityIndicatorsSnapshot } from '@/lib/opportunities-indicators/types';
import {
  IndicatorStatus,
  INDICATOR_STATUS_LABEL,
  INDICATOR_STATUS_PILL_VARIANT,
  narrowIndicatorStatus,
} from '@/lib/opportunities-indicators/indicator-status';
import { formatPercentFromDecimal } from '@/lib/opportunities-indicators/format';
import {
  CalculatingNotice,
  CalculationUnavailableNotice,
  STALE_VALUES_CLASS,
  StaleValuesCaption,
  UnknownStatusNotice,
} from '@/components/indicators/indicator-notices';
import { useCalculationPolling } from '@/hooks/use-calculation-polling';
import { getParecer as defaultGetParecer } from '@/lib/opportunities/parecer.data';
import type { Parecer } from '@/lib/opportunities/parecer.types';
import type { GarantiaTrackResult } from '@/lib/garantia/garantia-track.types';
import { AlcadaSagaPanel } from '@/components/opportunities/alcada-saga-panel';
import { GarantiasIndicadasCard } from '@/components/opportunities/garantias-indicadas-card';
import { TotaisRecursosFinanceirosCard } from '@/components/opportunities/totais-recursos-financeiros-card';
import { ParecerPanel } from '@/components/opportunities/parecer-panel';
import { AnalisesCard } from '@/components/opportunities/analises-card';
import type { AsideSlice } from '@/components/opportunities/use-aside-load';
import { OpportunityFlowTabs } from '@/components/opportunities/opportunity-flow-tabs';
import { RoyaltyFranquiaNote } from '@/components/opportunities/royalty-franquia-note';
import { StatusPill } from '@/components/status-pill';
import type { PillVariant } from '@/components/status-pill';
import { Select } from '@/components/ui/select';
import { DevolverOportunidadeModal } from '@/components/opportunities/devolver-oportunidade-modal';
import { usePermissions } from '@/hooks/use-permissions';
import {
  podeResolverPendencia,
  rotuloCtaPendencia,
} from '@/lib/pendencias/resolve-cta';
import { Permission } from '@/lib/auth-permissions';
import { rotaDoApp } from '@/lib/navegacao-segura';

// ---------------------------------------------------------------------------
// Props — all data functions are injectable for tests
// ---------------------------------------------------------------------------

/**
 * A linha "Perfil / Risco" já resolvida pelo predicado único
 * (`resumoPerfilRisco`, ADO 67983). `null` = a concessão não exige levantamento.
 */
type CreditRiskRow = PerfilRiscoResumo | null;

type Props = {
  opportunityId: string;
  loadAnalise?: (id: string) => Promise<AnaliseSneg>;
  loadApprovalReadiness?: (id: string) => Promise<ApprovalReadiness>;
  loadPendencias?: (id: string) => Promise<PendenciasPanelResult>;
  reatribuir?: (id: string, p: ReatribuirAnalistaPayload) => Promise<AnaliseSneg>;
  /** Per-proposal devolução (RN-F2-03 / ADR-0016) — not a workflow event. */
  devolverProposal?: (proposalId: string, motivo: string) => Promise<void>;
  devolverOportunidade?: (opportunityId: string, motivo: string) => Promise<void>;
  /**
   * A oportunidade saiu de `EM_ANALISE` — quem montou este shell precisa reler.
   *
   * **As DUAS saídas o disparam**: `DEVOLVER_AO_LT` (destino: preenchimento) e o
   * GATE 2 `ENVIAR_PARA_APROVACAO` (destino: `AprovacaoView`).
   *
   * ⚠️ Este docblock afirmava que o GATE 2 "não precisa, porque o
   * `router.refresh()` de lá já cobria o caminho que importava". **Era falso**, e
   * a consequência foi medida em `PCR-RODSUL-000094/2026` (08/09/2026): a
   * sendbar da análise continuava na tela depois de um envio bem-sucedido. O
   * `refresh()` revalida Server Components, e a tela da fase é escolhida por
   * `backendState` no estado de um Client Component que não remonta — o mesmo
   * motivo pelo qual a devolução precisou disto. O que o destino é (preenchimento
   * ou aprovação) nunca foi a variável; o que importa é que o pai não remonta.
   *
   * Ver o docblock de `AnaliseView.onNeedsRefresh` e o de `handleLiberar`.
   */
  onNeedsRefresh?: () => void;
  liberarParaAprovacao?: (id: string) => Promise<void>;
  loadProposals?: (id: string) => Promise<OpportunityProposal[]>;
  searchAnalistas?: (q: string) => Promise<DirectoryUser[]>;
  /** Opportunity header/data card (01c `.head` + "Dados da oportunidade"). */
  loadDetail?: (id: string) => Promise<OpportunityDetail>;
  /** "Documentos da oportunidade" + the Hub line of the Análises card. */
  loadChecklist?: (id: string) => Promise<ChecklistResult>;
  /** Conferência SNEG do documento (RN-F9-03). Injetável nos testes. */
  validarDocumento?: (
    id: string,
    docId: string,
    validado: boolean,
  ) => Promise<ChecklistDoc>;
  /** Abre a pendência de reenvio ao LT. Injetável nos testes. */
  solicitarReenvioDoc?: (id: string, docName: string) => Promise<void>;
  loadViability?: (id: string) => Promise<SnegViability>;
  loadDdi?: (id: string) => Promise<DdiResult | null>;
  loadCreditRisk?: (id: string) => Promise<CreditRiskRow>;
  loadIndicators?: (id: string) => Promise<OpportunityIndicatorsSnapshot | null>;
  /** CTA da "Análise financeira" — injectable for tests. */
  recalculateIndicators?: (id: string) => Promise<unknown>;
  loadAlcadaPreview?: (id: string) => Promise<AlcadaPreview>;
  loadParecer?: (id: string) => Promise<Parecer | null>;
  loadGarantiaTrack?: (id: string) => Promise<GarantiaTrackResult>;
  /**
   * When false, the components that own their data fetching (flow tabs,
   * ParecerPanel) are not mounted (test seam).
   */
  renderMainBlocks?: boolean;
  /**
   * Set when this shell IS the opportunity screen (the profile-resolved view at
   * `/oportunidades/[id]`), where "← Oportunidade" would link to the page you
   * are already on.
   */
  hideBackToOpportunity?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

type Loaded<T> =
  | { status: 'loading' }
  | { status: 'loaded'; value: T }
  | { status: 'error' };

/** Small per-source loader — each aside row degrades in isolation. */
/**
 * One-shot load with an optional re-read trigger.
 *
 * `refreshSignal` is a COUNTER, not a boolean: two saves are two events, and a
 * flag would coalesce them. `0` is the mount value, so passing nothing keeps the
 * previous behaviour exactly.
 *
 * The re-read is QUIET — it does not go back to `loading`. Blanking the row
 * would hide the very value the user is watching change, and the row is a
 * single pill: a spinner there is noise, not feedback.
 */
/**
 * @param enabled quando `false`, NADA é buscado.
 *
 *   Serve às linhas cuja rota é gated (`garantia`, `perfil-credito`, ambas
 *   `@Roles(LT, SNEG, CCOB, ADMIN)`): o chamador já não vai renderizá-las, e
 *   disparar a requisição assim mesmo tomaria um 403 a cada render — enchendo
 *   o log do servidor de negativas previsíveis para descartar a resposta em
 *   seguida. O estado fica em `loading` para sempre, e isso é irrelevante
 *   justamente porque nada é renderizado a partir dele.
 */
function useLoad<T>(
  fn: (id: string) => Promise<T>,
  id: string,
  refreshSignal = 0,
  enabled = true,
): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState((prev) =>
      // Only the mount pass shows `loading`; a refresh keeps the current value.
      refreshSignal === 0 ? { status: 'loading' } : prev,
    );
    fn(id)
      .then((value) => {
        if (active) setState({ status: 'loaded', value });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [fn, id, refreshSignal, enabled]);

  return state;
}

function faseToPillVariant(fase: AnaliseFase): PillVariant {
  const MAP: Record<AnaliseFase, PillVariant> = {
    em_analise: 'info',
    com_pendencia: 'warning',
    devolvida: 'danger',
    concluida: 'success',
    liberada: 'success',
  };
  return MAP[fase];
}

const PROPOSAL_PILL: Record<ProposalStatus, PillVariant> = {
  [ProposalStatus.EmPreenchimento]: 'neutral',
  [ProposalStatus.EmAnalise]: 'info',
  [ProposalStatus.Devolvida]: 'warning',
};

/** `.doc` status pills — labels straight from the prototype vocabulary. */
const DOC_STATUS_LABEL: Record<ChecklistDoc['status'], string> = {
  validado: 'Validado',
  /*
   * "Aguardando conferência", não "Anexado" — e a diferença é o conserto do
   * relato de 01/09/2026 ("não conseguimos identificar qual o documento").
   *
   * `anexado` é o ÚNICO estado que trava o GATE 2 (`documentos_nao_validados`),
   * e "Anexado" descreve o que já aconteceu em vez do que falta acontecer. Nesta
   * tela — a do analista que confere — o rótulo tem de ser a pergunta que ele
   * responde. As outras telas seguem com "Anexado", que é o correto ali: elas
   * relatam o estado do arquivo, não pedem ação de conferência.
   */
  anexado: 'Aguardando conferência',
  pendente: 'Pendente',
  vencido: 'Vencido',
  repo: 'No repositório',
};

/**
 * ⚠️ `anexado` era **`success`** — o MESMO verde de `validado`.
 *
 * O único estado que bloqueia o envio vestia a cor de "pronto", e um pill existe
 * justamente para ser lido pela cor: numa lista de 6 linhas o analista varria
 * verde/amarelo e concluía que os anexados estavam conferidos. Pior, as ações
 * (`Validar` × `✓ Validado`) só aparecem para quem tem `DocumentValidate` —
 * para todo o resto era verde contra verde, com a diferença só na palavra.
 *
 * `warning` e não `info`: o item **exige uma ação de quem está olhando a tela**,
 * e é a mesma família de "Exceção/Atenção" que `pendente` usa — os dois são "não
 * está resolvido", com rótulos que dizem qual dos dois é. As demais telas usam
 * `info` porque lá o estado é informativo, não uma tarefa (`opportunity-detail`,
 * `opportunity-checklist`, `contrato-view`). ⚠️ Nunca `danger`: nada falhou.
 */
const DOC_STATUS_PILL: Record<ChecklistDoc['status'], PillVariant> = {
  validado: 'success',
  anexado: 'warning',
  pendente: 'warning',
  vencido: 'danger',
  repo: 'info',
};

/**
 * O chip de uma linha do checklist — rótulo + variante.
 *
 * Função e não `Record`, porque `anexado` tem DOIS significados e o `status`
 * sozinho não os separa:
 *
 *  - `anexado` com documento no hub ⇒ **aguarda conferência** e trava o GATE 2;
 *  - `anexado` com `satisfiedExternally` ⇒ a exigência já foi atendida por fora
 *    (as fotos do bloco da proposta — VBR-642) e está **fora** do gate.
 *
 * Dar "Aguardando conferência" em amarelo ao segundo anunciaria uma tarefa que
 * não existe — e mandaria o analista procurar exatamente onde não há o que fazer,
 * que é o defeito que este passe veio consertar. Ele fica `info`: estado
 * informativo, sem ação, com a nota ao lado dizendo onde a evidência mora.
 */
function docStatusChip(doc: ChecklistDoc): { label: string; variant: PillVariant } {
  if (doc.status === 'anexado' && doc.satisfiedExternally) {
    return { label: 'Anexado', variant: 'info' };
  }
  return {
    label: DOC_STATUS_LABEL[doc.status] ?? doc.status,
    variant: DOC_STATUS_PILL[doc.status] ?? 'neutral',
  };
}

/** Aguarda conferência AGORA? — o predicado do gate, aplicado a uma linha. */
function aguardaConferencia(doc: ChecklistDoc): boolean {
  return doc.status === 'anexado' && !doc.satisfiedExternally;
}

/**
 * Quantas linhas do checklist o card mostra FECHADO — o desenho do protótipo.
 *
 * É um PISO, não um teto: `visiveisFechado` o levanta para caber tudo o que
 * aguarda conferência, e o `+ N outros documentos` abre o resto. Ver o docblock
 * daquele cálculo para o relato que as duas coisas respondem.
 */
const VISIVEIS_FECHADO = 6;

/**
 * A ordem das linhas do card: o que aguardava conferência **no carregamento**
 * primeiro.
 *
 * O card mostra 6 de N linhas fechado — então, na ordem da tabela de
 * parametrização, o item que trava o GATE 2 podia estar entre os escondidos. Foi
 * o que aconteceu na oportunidade do relato: 17 documentos, 6 visíveis, e a
 * barra recusando por um documento que a tela não mostrava. Nenhuma ação de tela
 * resolvia — o analista tinha de abrir "Gerenciar documentos" e caçar.
 *
 * ⚠️ Esta ordenação sozinha só resolve enquanto as bloqueantes CABEM no corte;
 * quem garante que nenhuma fica de fora é o `visiveisFechado` (17/09/2026).
 *
 * ## ⚠️ Por que a prioridade é um SNAPSHOT, e não o estado atual
 *
 * A primeira versão ordenava pelo status **vivo**, e isso produziu um defeito
 * pior que o original: ao validar, a linha deixava de aguardar conferência, caía
 * de volta para a posição dela no catálogo (22 de 27, no cenário medido) e
 * **desaparecia do card** — o corte de 6 a engolia. Na tela lia-se como "cliquei
 * em Validar e o estado não mudou", e o "Validado" só aparecia quando a fila de
 * pendentes encurtava e a linha voltava para as 6 visíveis. Relatado em
 * 01/09/2026 exatamente assim: *"apenas quando eu clico no próximo o anterior
 * altera o valor para validado"*.
 *
 * Com o snapshot, o override muda o **pill e as ações** da linha — nunca a
 * posição dela: quem valida vê a linha ficar verde **no lugar**. A ordem só é
 * recalculada quando o checklist é recarregado, que é quando o analista está
 * chegando à tela em vez de trabalhando nela.
 *
 * Estável (comparador de dois valores) para que o resto da lista preserve a
 * ordem do catálogo — reordenar tudo faria o checklist parecer outro a cada
 * render.
 */
function ordenarPorConferencia(
  docs: readonly ChecklistDoc[],
  aguardavamNoCarregamento: ReadonlySet<string>,
): ChecklistDoc[] {
  const prioridade = (doc: ChecklistDoc) =>
    aguardavamNoCarregamento.has(doc.id) ? 0 : 1;
  return [...docs].sort((a, b) => prioridade(a) - prioridade(b));
}

/**
 * Per-document actions of the document conference (RN-F9-03 — the SNEG's and the
 * CCOB's since 31/08/2026), as the prototype draws them at the right edge of
 * each `.doc` row:
 *
 *  - not validated yet ⇒ **Validar** · **Solicitar reenvio**
 *  - validated         ⇒ **✓ Validado** (state, muted) · **Desfazer**
 *
 * The two states are exclusive on purpose: after validating there is nothing to
 * "validar" and nothing to reject, so those controls are removed rather than
 * left permanently disabled.
 *
 * A row with no document attached (`pendente`/`repo`) offers NOTHING to
 * validate — there is no file to look at. Only `Solicitar reenvio` would make
 * sense there, and it is the LT's upload that resolves it, not a rejection.
 *
 * ⚠️ **`repositoryDocumentId`, não `status`, é o que decide se há arquivo.** Uma
 * linha `satisfiedExternally` (VBR-642) chega como `anexado` sem documento no
 * hub: `ChecklistDoc.id` ali é a chave sintética `<category>::<type>`, e a BFF
 * recusa `validar`/`desfazer` com ela **antes da rede**. Ou seja, o `Validar`
 * que a linha oferecia era controle morto — e pior, num item que está FORA do
 * gate, então o analista gastava o clique justamente onde ele não destrava nada.
 */
function DocValidationActions({
  doc,
  busy,
  onValidar,
  onDesfazer,
  onSolicitarReenvio,
}: {
  doc: ChecklistDoc;
  busy: boolean;
  onValidar: () => void;
  onDesfazer: () => void;
  onSolicitarReenvio: () => void;
}) {
  const statusComArquivo =
    doc.status === 'validado' || doc.status === 'anexado' || doc.status === 'vencido';
  if (!statusComArquivo || doc.repositoryDocumentId === null) return null;

  const linkCls =
    'cursor-pointer whitespace-nowrap border-none bg-transparent font-bold text-(--secondary-600) hover:underline disabled:cursor-not-allowed disabled:opacity-50';

  if (doc.status === 'validado') {
    return (
      <span className="flex shrink-0 items-center gap-3.5">
        <span className="whitespace-nowrap text-(--color-text-muted)">✓ Validado</span>
        <button
          type="button"
          disabled={busy}
          onClick={onDesfazer}
          className={linkCls}
          data-testid={`doc-desfazer-${doc.id}`}
        >
          {busy ? 'Desfazendo…' : 'Desfazer'}
        </button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-3.5">
      <button
        type="button"
        disabled={busy}
        onClick={onValidar}
        className={linkCls}
        data-testid={`doc-validar-${doc.id}`}
      >
        {busy ? 'Validando…' : 'Validar'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onSolicitarReenvio}
        className={linkCls}
        data-testid={`doc-reenvio-${doc.id}`}
      >
        Solicitar reenvio
      </button>
    </span>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

/**
 * Instante ISO-8601 com HORA — "Último cálculo" do card financeiro.
 *
 * Separado de {@link fmtDate} de propósito: o cálculo consolidado roda várias
 * vezes por dia, então só a data não responde a pergunta que o analista faz
 * ("estes números são de antes ou depois do meu ajuste?"). Mesma composição da
 * tela de preenchimento, para o mesmo rótulo não aparecer em dois formatos.
 */
function formatCalculatedAt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * `.who` line of a pendência row ("→ LT · E-mail").
 *
 * Joins only what the backend produced: an em dash placeholder for a missing
 * responsável/canal reads as broken data on screen ("→ Integridade · —"), and a
 * pendência with neither has no routing line at all.
 */
function routingLabel(
  responsavel: string | null | undefined,
  canal: string | null | undefined,
): string | null {
  const parts = [responsavel, canal].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0,
  );

  return parts.length > 0 ? `→ ${parts.join(' · ')}` : null;
}

// ---------------------------------------------------------------------------
// Layout primitives — straight from the 01c prototype CSS
// ---------------------------------------------------------------------------

/** `.sec` — main-column section card: `padding 18px 20px`, `margin-bottom 16px`. */
function Sec({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title: string;
  /** Controles à direita do título (pill de status, CTA). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mb-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-[18px]"
    >
      <div className="mb-3.5 flex items-baseline justify-between gap-2.5">
        <h2 className="text-(length:--t-h4) font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** `.panel .card` — side panel card: `padding 16px`, `.card-t` 14px bold. */
function Card({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-4">
      <h3 className="mb-2.5 text-(length:--t-caption) font-bold">
        {title}
        {count !== undefined && (
          <span className="text-(--color-text-muted)"> · {count}</span>
        )}
      </h3>
      {hint && (
        <p className="mb-1.5 text-(length:--t-caption) text-(--color-text-muted)">{hint}</p>
      )}
      {children}
    </div>
  );
}

/** `.dgrid`/`.kv` label + value pair. */
function DItem({
  l,
  v,
  full,
}: {
  l: string;
  v: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'col-span-full' : undefined}>
      <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
        {l}
      </div>
      <div className="mt-0.5 text-(length:--t-caption) font-bold">{v}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reatribuir modal — o MESMO seletor de colaborador do "Adicionar à equipe"
// (RN-F1-02: a escrita referencia o id do analista, nunca um nome digitado)
// ---------------------------------------------------------------------------

/**
 * Escolhe o novo analista SNEG numa **lista**, não numa caixa de busca.
 *
 * ## ADO 67877
 *
 * O relato foi *"não está apresentando nenhum colaborador para efetuar a
 * distribuição"*, e o comentário precisou o pedido: *"deveria trazer uma lista
 * das pessoas disponíveis para seleção"*. Duas coisas estavam erradas ao mesmo
 * tempo, e consertar só uma manteve o sintoma:
 *
 *  1. **A fonte.** `searchSnegAnalysts` lia `GET /v1/directory/users?role=SNEG`,
 *     servido pelo `ENTRA_DIRECTORY_DRIVER` — `fake` em dev e em stage (medido
 *     em `GET /health` em 27/08/2026). A lista trazia o SEED sintético
 *     (`Ana Beatriz Souza`) enquanto o "Adicionar membro" da mesma tela trazia
 *     gente do Entra. Corrigido na própria função de busca.
 *  2. **O desenho.** Este modal era escrito à mão: input + botão "Buscar", sem
 *     debounce, sem estado de carregamento e sem distinguir "grupo vazio" de
 *     "fonte caiu". Agora usa {@link DirectoryPickerModal} +
 *     {@link DirectoryUserList}, os mesmos componentes do seletor de equipe e da
 *     troca de LT principal — o padrão do DS (`modal-ov`/`modal-h`/`modal-search`
 *     do protótipo `01a-nova-oportunidade.html:219-227`).
 *
 * ⚠️ **O motivo fica, e é por isso que existe rodapé.** O "Adicionar à equipe"
 * age no clique da linha; aqui não pode: o motivo entra na trilha SOX
 * (`AnaliseAuditAction.Reatribuida`) e é digitado DEPOIS da escolha. A linha
 * escolhida fica destacada (`selectedId`) e o `Confirmar` fecha o ato.
 */
function ReatribuirModal({
  onConfirm,
  onCancel,
  loading,
  searchAnalistas,
}: {
  onConfirm: (payload: ReatribuirAnalistaPayload) => void;
  onCancel: () => void;
  loading: boolean;
  searchAnalistas: (q: string) => Promise<DirectoryUser[]>;
}) {
  const [selected, setSelected] = useState<DirectoryUser | null>(null);
  const [motivo, setMotivo] = useState('');

  return (
    <DirectoryPickerModal
      title="Reatribuir analista SNEG"
      subtitle="Analista SNEG"
      onClose={onCancel}
      footer={
        <>
          <label
            htmlFor="reatribuir-motivo"
            className="mb-1 block text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
          >
            Motivo (opcional)
          </label>
          <input
            id="reatribuir-motivo"
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={loading}
            placeholder="Motivo da reatribuição"
            className="w-full rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2 text-(length:--t-caption) font-[inherit] disabled:opacity-60"
            aria-label="Motivo da reatribuição"
          />

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-1.5 text-(length:--t-caption) font-bold hover:bg-(--neutral-40) disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() =>
                selected &&
                onConfirm({
                  analistaId: selected.id,
                  ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
                })
              }
              disabled={loading || !selected}
              className="rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-3 py-1.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </>
      }
    >
      <DirectoryUserList
        search={searchAnalistas}
        onPick={setSelected}
        selectedId={selected?.id ?? null}
        /*
         * Lista ao ABRIR, com termo vazio: um grupo de perfil é pequeno e é
         * exatamente o que o relator pediu ver sem digitar nada.
         */
        autoLoad
        ctaLabel="Selecionar"
        placeholder="Nome ou e-mail do analista"
        inputAriaLabel="Buscar analista"
        /*
         * Vazio NOMEADO: o grupo `VBR_GOP_SNEG_*` pode legitimamente não ter
         * gente, e aí a lista vem vazia com tudo funcionando — um espaço em
         * branco leria como defeito da tela, que é o sintoma deste bug.
         */
        emptyScopeMessage="Nenhum analista SNEG no grupo de acesso. Verifique com a TI."
        listTestId="reatribuir-results"
        emptyTestId="reatribuir-vazio"
      />
    </DirectoryPickerModal>
  );
}

// ---------------------------------------------------------------------------
// Devolver modal — picks ONE proposal (RN-F2-03) + required motivo
// ---------------------------------------------------------------------------

function DevolverModal({
  proposals,
  initialProposalId,
  onConfirm,
  onCancel,
  loading,
}: {
  proposals: OpportunityProposal[];
  initialProposalId?: string;
  onConfirm: (proposalId: string, motivo: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [proposalId, setProposalId] = useState(
    initialProposalId ?? proposals[0]?.id ?? '',
  );
  const [motivo, setMotivo] = useState('');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="devolver-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
    >
      <div className="w-full max-w-md rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-[var(--shadow-card)]">
        <h3 id="devolver-title" className="mb-1 text-(length:--t-h4) font-bold">
          Devolver ao LT
        </h3>
        <p className="mb-4 text-(length:--t-caption) text-(--color-text-muted)">
          Apenas a proposta selecionada volta ao LT — as demais permanecem em
          análise (RN-F2-03).
        </p>

        {proposals.length === 0 ? (
          <p
            className="text-(length:--t-caption) text-(--color-text-muted)"
            data-testid="devolver-empty"
          >
            Nenhuma proposta disponível para devolução.
          </p>
        ) : (
          <>
            <label
              htmlFor="devolver-proposta"
              className="mb-1 block text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
            >
              Proposta
            </label>
            <Select
              id="devolver-proposta"
              value={proposalId}
              onChange={(v) => setProposalId(v)}
              disabled={loading}
              options={proposals.map((p) => ({
                value: p.id,
                label: [p.code, p.title, p.group].filter(Boolean).join(' · '),
              }))}
              variant="boxed"
            />

            <label
              htmlFor="devolver-motivo"
              className="mb-1 mt-4 block text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)"
            >
              Motivo
            </label>
            <textarea
              id="devolver-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              disabled={loading}
              placeholder="Motivo da devolução — visível para o LT"
              className="min-h-[70px] w-full rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2 text-(length:--t-caption) font-[inherit] disabled:opacity-60"
            />
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-1.5 text-(length:--t-caption) font-bold hover:bg-(--neutral-40) disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="devolver-confirm"
            onClick={() => onConfirm(proposalId, motivo.trim())}
            disabled={loading || !proposalId || !motivo.trim()}
            className="rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-3 py-1.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Devolvendo…' : 'Devolver'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enviar modal — the 01c prototype's `#modalEnviar`, verbatim copy
// ---------------------------------------------------------------------------

function EnviarModal({
  onContinuar,
  onClose,
  loading,
}: {
  onContinuar: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enviar-title"
        className="relative w-full max-w-[440px] rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) p-6 shadow-[var(--shadow-card)]"
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          disabled={loading}
          className="absolute right-3.5 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none text-(--color-text-muted) hover:bg-(--neutral-40)"
        >
          ×
        </button>
        <h3 id="enviar-title" className="mb-2.5 text-(length:--t-h4) font-bold">
          Enviar para aprovação
        </h3>
        <p className="mb-5 text-(length:--t-caption) leading-relaxed text-(--color-text)">
          A proposta será enviada para aprovação através do Salesforce.
        </p>
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            data-testid="enviar-continuar"
            onClick={onContinuar}
            disabled={loading}
            className="rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Enviando…' : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * SNEG "Em análise" screen — 1:1 with `01c-oportunidade-analise.html`:
 * head (title + meta), multi-track flow tabs, main column (Dados da
 * oportunidade · Propostas em análise · Análise financeira · Totais de recursos
 * financeiros · Garantias · Documentos da oportunidade · Parecer técnico) and
 * the sticky side panel (Análises · Pendências · Governança), closed by the
 * fixed sendbar.
 *
 * A ordem da coluna principal é a MESMA da tela de preenchimento
 * (`opportunity-detail.tsx`): as duas são a mesma oportunidade em fases
 * diferentes, e ordens distintas fariam os cards saltarem de lugar no GATE 1.
 * "Análise financeira", "Totais" e "Garantias" são divergências deliberadas do
 * protótipo `01c` — cada uma anotada no seu bloco.
 *
 * Integration is preserved verbatim (roteiro E2E da alçada):
 *  - "Enviar para aprovação" → prototype modal → workflow event
 *    ENVIAR_PARA_APROVACAO (GATE 2 — CrmIntegradoGuard checks the Salesforce
 *    links created by "Acionar alçada").
 *  - The alçada saga panel (BPMN SF01–SF08 · ADR-0037) stays in the side
 *    panel — the prototype's 01d "Aprovação no Salesforce" card only exists
 *    after the phase advances, but acionar/sincronizar/simular happen HERE.
 *  - "Devolver ao LT" → per-proposal POST /proposals/:id/devolver (RN-F2-03).
 */
export function SnegAnaliseShell({
  opportunityId,
  loadAnalise = defaultGetAnalise,
  loadApprovalReadiness = defaultGetApprovalReadiness,
  loadPendencias = defaultGetPendencias,
  reatribuir = defaultReatribuir,
  devolverProposal = defaultDevolverProposal,
  devolverOportunidade = defaultDevolverOportunidade,
  onNeedsRefresh,
  liberarParaAprovacao = defaultLiberarParaAprovacao,
  loadProposals = defaultGetProposals,
  searchAnalistas = defaultSearchAnalistas,
  loadDetail = defaultGetDetail,
  loadChecklist = defaultGetChecklist,
  validarDocumento = defaultSetDocValidation,
  solicitarReenvioDoc = defaultSolicitarReenvioDocumento,
  loadViability,
  loadDdi,
  loadCreditRisk,
  loadIndicators = defaultGetIndicators,
  recalculateIndicators = defaultRecalculateIndicators,
  loadAlcadaPreview,
  loadParecer = defaultGetParecer,
  loadGarantiaTrack,
  renderMainBlocks = true,
  hideBackToOpportunity = false,
}: Props) {
  // ── data state ────────────────────────────────────────────────────────────
  const [analiseStatus, setAnaliseStatus] = useState<LoadStatus>('loading');
  const [analise, setAnalise] = useState<AnaliseSneg | null>(null);
  const [analiseError, setAnaliseError] = useState('');
  /**
   * O 404 é "a análise ainda não existe", e isso NÃO é falha (ADO 68256).
   *
   * A tela inteira virava uma caixa VERMELHA dizendo *"Falha ao carregar a
   * análise SNEG (404)"* — para todo perfil, porque este shell é a tela da
   * oportunidade nessa fase. Medido em staging na `OPP-2026-000004`, pelo perfil
   * Integridade, que chegou aqui pelo CTA "Analisar integridade" do card
   * Pendências.
   *
   * Nada quebrou: antes do GATE 1 a análise não tem por que existir, e depois
   * dele é uma inconsistência que a plataforma repara sozinha (o
   * `SnegDistribuicaoCatchUpWorker` abre a linha que falta em até 60 s). O flag
   * troca a caixa de erro por uma informativa com a frase do BACKEND — é ele
   * que sabe em que fase a oportunidade está, e é ela que nomeia o conserto.
   */
  const [analiseNaoAberta, setAnaliseNaoAberta] = useState(false);

  // Readiness feeds only the sendbar (state label + block reason); a load
  // failure keeps the button blocked, which is the safe default — no separate
  // error surface needed.
  const [, setReadinessStatus] = useState<LoadStatus>('loading');
  const [readiness, setReadiness] = useState<ApprovalReadiness | null>(null);

  const [pendenciasStatus, setPendenciasStatus] = useState<LoadStatus>('loading');
  const [pendencias, setPendencias] = useState<PendenciasPanelResult | null>(null);

  const [proposals, setProposals] = useState<OpportunityProposal[]>([]);

  const { can } = usePermissions();

  /*
   * ── as DUAS linhas do painel que vêm de rota gated ──────────────────────
   *
   * `GET .../garantia` e `GET .../perfil-credito` são ambas
   * `@Roles(LT, SNEG, CCOB, ADMIN)`. Enquanto esta tela era só do analista, o
   * assunto não existia; servindo os 13 perfis, os 9 de fora daquele conjunto
   * tomam 403 — e um 403 aqui NÃO é indisponibilidade: é "esta linha não é
   * sua". Renderizá-la como "Indisponível" convidaria a uma nova tentativa que
   * jamais funciona.
   *
   * As permissões são declaradas SEPARADAS embora hoje tenham o mesmo conjunto
   * de papéis: são duas rotas distintas, e amarrar uma à outra faria a tela
   * seguir a permissão errada no dia em que um dos dois `@Roles` mudar.
   */
  const canSeeGarantia = can(Permission.GarantiaView);

  const detail = useLoad(loadDetail, opportunityId);
  const checklist = useLoad(loadChecklist, opportunityId);
  /**
   * Bumped pelo polling do cálculo assíncrono do ARP (ver
   * {@link useCalculationPolling} abaixo). Contador, não booleano: dois ticks
   * são dois eventos.
   */
  const [indicatorsRefresh, setIndicatorsRefresh] = useState(0);
  /**
   * O snapshot consolidado — UMA leitura para as DUAS superfícies desta tela: a
   * linha "TIR / VPL (oportunidade)" do painel "Análises" e o card "Análise
   * financeira" da coluna principal.
   *
   * ⚠️ Compartilhar a leitura não é economia, é a correção de um defeito
   * conhecido. Na tela de preenchimento existiu um sub-quadro "Resultado
   * Financeiro" que buscava o snapshot por conta própria ao lado da grade que já
   * exibia TIR e VPL: dois blocos para os mesmos números, cada um capaz de
   * mostrar um valor diferente enquanto o outro não recarregava. Aqui a linha e
   * o card leem o MESMO `indicators`, então não têm como divergir.
   *
   * Por isso o card **não** usa `d.indicadores` (o snapshot que viaja no payload
   * da oportunidade), embora a tela de preenchimento use: ali aquela é a única
   * fonte, aqui ela seria a segunda. Cada tela com uma fonte só.
   */
  const indicators = useLoad(loadIndicators, opportunityId, indicatorsRefresh);
  /*
   * Bumped after every parecer save. "Recomendação" comes straight from the
   * parecer and "Alçada sugerida" is derived from it (`parecer.alcadaSugerida`
   * is one of the signals `AlcadaPreviewService` composes), so both rows went
   * stale the moment the analyst picked a recommendation and stayed that way
   * until the next navigation (VBR-635 §4).
   */
  const [parecerRefresh, setParecerRefresh] = useState(0);
  /**
   * Bumped after the GATE 2 attempt so the alçada panel re-reads.
   *
   * `router.push` here very often targets the URL we are already on (this
   * workspace IS what `/oportunidades/[id]` renders while the phase is
   * `EM_ANALISE`), so nothing unmounts and `router.refresh()` does not touch a
   * client-side fetch effect. GATE 2 submits the alçada as a pre-commit effect,
   * so the panel's "envio" milestone changes on a 200 and stayed stale on
   * screen (VBR-645). Bumped on the failure path too: a 409 means the backend
   * knows something about the saga that the panel does not.
   */
  const [alcadaRefresh, setAlcadaRefresh] = useState(0);
  /**
   * Bumpado pelo aviso de volta do painel da alçada (`onProntidaoMudou`).
   *
   * A linha "Alçada sugerida" do card "Análises" é o TOPO da cadeia simulada
   * (`AlcadaSugeridaService` — ADO 68241), então ela sai de "Não acionada" /
   * "Não concluída" para o nível exatamente quando a saga conclui. O
   * `refreshSignal` do card só era bumpado pelo parecer e pela garantia, e
   * nenhum dos dois é a sincronização: o card ficava com o rótulo de ausência
   * ao lado de um painel já exibindo a cadeia inteira.
   */
  const [alcadaProntidaoRefresh, setAlcadaProntidaoRefresh] = useState(0);
  /**
   * Bumped by the inline `GarantiasIndicadasCard`'s `onMutated` (Task 7) so
   * the "Andamento da análise" row re-reads the same subprocess the card just
   * changed — same wiring `opportunity-detail.tsx` already uses for
   * `OpportunityFlowTabs`.
   */
  const [garantiaFlowRefresh, setGarantiaFlowRefresh] = useState(0);

  const parecerRow = useLoad(loadParecer, opportunityId, parecerRefresh);

  // ── indicadores consolidados: estados do cálculo assíncrono (OPP-F7) ──────
  //
  // As MESMAS derivações da tela de preenchimento, a partir do MESMO status.
  // Existem porque o cálculo é assíncrono (VBR-401): o slot continua com os
  // números do cálculo ANTERIOR enquanto o ARP processa, então eles são
  // legendados e subordinados em vez de renderizados como o resultado atual
  // (HU-13.2).
  const snapshot = indicators.status === 'loaded' ? indicators.value : null;
  const indicatorStatus = narrowIndicatorStatus(snapshot?.status);
  /** Slot presente cujo `status` este frontend não reconhece → estado seguro. */
  const indicatorStatusUnknown = snapshot !== null && indicatorStatus === null;
  const isCalculating = indicatorStatus === IndicatorStatus.EmCalculo;
  const calculationUnavailable = indicatorStatus === IndicatorStatus.Indisponivel;
  const indicatorIsOutdated = indicatorStatus === IndicatorStatus.Desatualizado;
  /*
   * `desatualizado` entrou junto do CTA (04/09/2026): um insumo de proposta
   * eleita mudou depois do último cálculo, então o slot carrega a rodada
   * ANTERIOR — mesmo caso de `em_calculo`. A MESMA derivação da tela de
   * preenchimento, a partir do mesmo status.
   */
  const indicatorValuesAreStale =
    isCalculating || calculationUnavailable || indicatorStatusUnknown || indicatorIsOutdated;

  const revalidateIndicators = useCallback(() => {
    setIndicatorsRefresh((n) => n + 1);
  }, []);

  // ── CTA "↻ Recalcular / Simular (ARP)" da "Análise financeira" ────────────
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcErro, setRecalcErro] = useState<string | null>(null);
  const [recalcAviso, setRecalcAviso] = useState<string | null>(null);

  const handleRecalcularIndicadores = useCallback(async () => {
    if (recalcBusy || isCalculating) return;
    setRecalcBusy(true);
    setRecalcErro(null);
    setRecalcAviso(null);
    try {
      const resultado = await recalculateIndicators(opportunityId);
      // Segurado (alguma eleita não está atualizada): a pill não muda, então
      // sem esta frase o clique não teria retorno visível.
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
       * Relê nos dois desfechos: no sucesso é o que põe o card em "Em cálculo"
       * (a resposta do ARP é um aceite, não o resultado — VBR-401), e num 409
       * é o que mostra o cálculo que já está em voo.
       */
      revalidateIndicators();
    }
  }, [
    recalcBusy,
    isCalculating,
    recalculateIndicators,
    opportunityId,
    revalidateIndicators,
  ]);

  /*
   * O resultado do ARP chega por callback, então o fim do cálculo só é
   * observável relendo o snapshot. A releitura do `useLoad` é QUIETA (não volta
   * para `loading`), que é exatamente o que este hook exige: branquear o card a
   * cada tick esconderia os valores que a pessoa está esperando mudar.
   *
   * O orçamento é derivado do backend (ver `POLL_BUDGET_MS`); esgotado, o card
   * troca o spinner por um "Atualizar" explícito.
   */
  const { exhausted: pollExhausted } = useCalculationPolling(
    isCalculating,
    revalidateIndicators,
  );

  // ── action state ──────────────────────────────────────────────────────────
  const [reatribuirOpen, setReatribuirOpen] = useState(false);
  const [reatribuirLoading, setReatribuirLoading] = useState(false);

  const [devolverOpen, setDevolverOpen] = useState(false);
  const [devolverOppOpen, setDevolverOppOpen] = useState(false);
  const [devolverInitialId, setDevolverInitialId] = useState<string | undefined>();
  const [devolverLoading, setDevolverLoading] = useState(false);

  const [enviarOpen, setEnviarOpen] = useState(false);
  const [liberarLoading, setLiberarLoading] = useState(false);

  // ── conferência de documentos (RN-F9-03) ──────────────────────────────────
  //
  // `useLoad` não expõe reload, e recarregar o checklist inteiro para uma linha
  // piscaria o card. As linhas afetadas ficam num mapa de override — e o valor
  // guardado é o item que o BACKEND devolveu, recalculado pelo mesmo engine que
  // monta o card, nunca um status virado aqui (`vencido` vence a validação, e
  // só o engine sabe disso).
  const [docAction, setDocAction] = useState<string | null>(null);
  const [docOverrides, setDocOverrides] = useState<Record<string, ChecklistDoc>>({});
  /**
   * O card de documentos está expandido? (17/09/2026)
   *
   * Fechado é o desenho do protótipo — 6 linhas e um resumo do resto. O que
   * mudou é que o resumo virou CONTROLE: ver `VISIVEIS_FECHADO` e o relato da
   * `FAP Lubrax+` que ele responde.
   */
  const [docsExpandido, setDocsExpandido] = useState(false);

  const [dadosMore, setDadosMore] = useState(false);

  const router = useRouter();
  const { toasts, addToast, removeToast } = useToast();

  // ── load all data in parallel ─────────────────────────────────────────────

  const refreshAnalise = useCallback(async () => {
    try {
      setAnalise(await loadAnalise(opportunityId));
      setAnaliseStatus('loaded');
    } catch {
      // Keep the previously loaded header on refresh failures.
    }
  }, [opportunityId, loadAnalise]);

  const refreshPendencias = useCallback(async () => {
    try {
      setPendencias(await loadPendencias(opportunityId));
      setPendenciasStatus('loaded');
    } catch {
      setPendenciasStatus('error');
    }
  }, [opportunityId, loadPendencias]);

  const refreshReadiness = useCallback(async () => {
    try {
      setReadiness(await loadApprovalReadiness(opportunityId));
      setReadinessStatus('loaded');
    } catch {
      setReadinessStatus('error');
    }
  }, [opportunityId, loadApprovalReadiness]);

  /**
   * O que a tela relê quando a saga da alçada avança sozinha.
   *
   * Duas superfícies dependem do resultado dela e nenhuma é atualizada por ação
   * desta tela: a sendbar do GATE 2 (critério `alcada_nao_simulada`) e a linha
   * "Alçada sugerida" do card "Análises".
   */
  const handleAlcadaProntidaoMudou = useCallback(() => {
    void refreshReadiness();
    setAlcadaProntidaoRefresh((n) => n + 1);
  }, [refreshReadiness]);

  const refreshProposals = useCallback(async () => {
    try {
      setProposals(await loadProposals(opportunityId));
    } catch {
      // Non-blocking: the proposals section shows an empty state.
    }
  }, [opportunityId, loadProposals]);

  const fetchAll = useCallback(() => {
    let cancelled = false;

    setAnaliseStatus('loading');
    setAnaliseNaoAberta(false);
    loadAnalise(opportunityId)
      .then((data) => {
        if (!cancelled) {
          setAnalise(data);
          setAnaliseStatus('loaded');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          // ADO 68256 — 404 é informação, não falha. Ver `analiseNaoAberta`.
          setAnaliseNaoAberta(err instanceof AnaliseNaoAbertaError);
          setAnaliseError(
            err instanceof Error ? err.message : 'Erro ao carregar a análise.',
          );
          setAnaliseStatus('error');
        }
      });

    setReadinessStatus('loading');
    loadApprovalReadiness(opportunityId)
      .then((data) => {
        if (!cancelled) {
          setReadiness(data);
          setReadinessStatus('loaded');
        }
      })
      .catch(() => {
        if (!cancelled) setReadinessStatus('error');
      });

    setPendenciasStatus('loading');
    loadPendencias(opportunityId)
      .then((data) => {
        if (!cancelled) {
          setPendencias(data);
          setPendenciasStatus('loaded');
        }
      })
      .catch(() => {
        if (!cancelled) setPendenciasStatus('error');
      });

    loadProposals(opportunityId)
      .then((data) => {
        if (!cancelled) setProposals(data);
      })
      .catch(() => {
        // Non-blocking: the proposals section shows an empty state.
      });

    return () => {
      cancelled = true;
    };
  }, [
    opportunityId,
    loadAnalise,
    loadApprovalReadiness,
    loadPendencias,
    loadProposals,
  ]);

  useEffect(() => {
    return fetchAll();
  }, [fetchAll]);

  // ── handlers ──────────────────────────────────────────────────────────────

  async function handleReatribuir(payload: ReatribuirAnalistaPayload) {
    setReatribuirLoading(true);
    try {
      const updated = await reatribuir(opportunityId, payload);
      setAnalise(updated);
      setReatribuirOpen(false);
      addToast('Analista reatribuído com sucesso.', 'success');
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : 'Falha ao reatribuir o analista.',
        'error',
      );
    } finally {
      setReatribuirLoading(false);
    }
  }

  async function handleDevolver(proposalId: string, motivo: string) {
    setDevolverLoading(true);
    try {
      await devolverProposal(proposalId, motivo);
      setDevolverOpen(false);
      addToast('Proposta devolvida ao LT (pendência criada).', 'success');
      // Devolução changes the analysis fase and opens a pendência — refresh.
      await Promise.all([
        refreshAnalise(),
        refreshPendencias(),
        refreshReadiness(),
        refreshProposals(),
      ]);
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : 'Falha ao devolver ao LT.',
        'error',
      );
    } finally {
      setDevolverLoading(false);
    }
  }

  /**
   * Devolve a OPORTUNIDADE INTEIRA (`DEVOLVER_AO_LT`).
   *
   * Fecha o modal e NAVEGA, como o `handleLiberar`: a transição tira a
   * oportunidade de `EM_ANALISE`, e este workspace é a tela da fase que acabou
   * de terminar. Como ele é também o que `/oportunidades/[id]` renderiza
   * naquela fase, o `push` costuma cair na URL em que já estamos — é o
   * `router.refresh()` que de fato revalida e troca a tela pela visão de
   * preenchimento.
   */
  async function handleDevolverOportunidade(motivo: string) {
    // Enter submete mesmo sem o botão — a guarda mora aqui também.
    if (!(canEdit || canDevolverSemEditar) || !motivo.trim()) return;
    setDevolverLoading(true);
    try {
      await devolverOportunidade(opportunityId, motivo);
      setDevolverOppOpen(false);
      addToast('Oportunidade devolvida ao LT — voltou para preenchimento.', 'success');
      /*
       * Avisa o pai ANTES de navegar.
       *
       * Quando este shell é montado por `/oportunidades/[id]`, o `push` abaixo
       * é no-op (já estamos nessa URL) e o `refresh()` não alcança o
       * `useEffect` do Client Component que escolhe a tela da fase — a tela
       * ficava no workspace da SNEG até o reload manual. É o pai que relê, e a
       * releitura é o que traz o motivo/autor da devolução para a nota do LT.
       *
       * O `push`/`refresh` continuam: são o caminho da rota dedicada
       * `/oportunidades/[id]/analise/sneg`, onde não há pai para avisar.
       */
      onNeedsRefresh?.();
      router.push(rotaDoApp('oportunidades', opportunityId));
      router.refresh();
    } catch (err: unknown) {
      // Modal aberto com o motivo digitado: fechar numa falha parece sucesso.
      addToast(
        err instanceof Error ? err.message : 'Falha ao devolver a oportunidade ao LT.',
        'error',
      );
    } finally {
      setDevolverLoading(false);
    }
  }

  async function handleDocValidation(doc: ChecklistDoc, validado: boolean) {
    setDocAction(doc.id);
    try {
      const atualizado = await validarDocumento(opportunityId, doc.id, validado);
      setDocOverrides((prev) => ({ ...prev, [doc.id]: atualizado }));
      addToast(
        validado
          ? `Documento validado: ${doc.name}.`
          : `Validação desfeita: ${doc.name}.`,
        'success',
      );
      /*
       * A conferência é critério do GATE 2 (PRD SNEG v1.0 §7 F7): validar o
       * último documento pendente é o que destrava "Enviar para aprovação", e
       * desfazer uma validação volta a travá-lo. Sem esta releitura a barra
       * ficaria contando a versão anterior até alguém recarregar a página — o
       * analista faria a ação certa e a tela continuaria dizendo que falta.
       */
      await refreshReadiness();
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : 'Falha ao atualizar o documento.',
        'error',
      );
    } finally {
      setDocAction(null);
    }
  }

  async function handleSolicitarReenvio(doc: ChecklistDoc) {
    setDocAction(doc.id);
    try {
      await solicitarReenvioDoc(opportunityId, doc.name);
      addToast(`Reenvio solicitado ao LT: ${doc.name}.`, 'success');
    } catch (err: unknown) {
      addToast(
        err instanceof Error ? err.message : 'Falha ao solicitar o reenvio.',
        'error',
      );
    } finally {
      setDocAction(null);
    }
  }

  async function handleLiberar() {
    setLiberarLoading(true);
    try {
      await liberarParaAprovacao(opportunityId);
      /*
       * Close FIRST, then revalidate.
       *
       * GATE 2 moved the opportunity out of `EM_ANALISE`, so this workspace is
       * the screen of the phase that just ended — staying on it showed a stale
       * "Em análise" header with an enabled button whose second click could only
       * 409 (E2E finding, 10/08/2026). The fix then was to navigate away.
       *
       * But this workspace is ALSO what `/oportunidades/[id]` renders while the
       * phase is `EM_ANALISE`, so that push very often targets the URL we are
       * already on: a no-op navigation. Nothing unmounted, the modal stayed open
       * with its button live, and the screen ended up stating three different
       * truths at once — header "Análise · Concluída", stepper and sendbar still
       * "Em análise" (VBR-634 §3).
       *
       * ⚠️ **`router.refresh()` NÃO fecha esse furo, e a versão anterior deste
       * comentário afirmava que fechava.** Ele revalida Server Components; a
       * tela da fase é escolhida por `backendState` no estado de um Client
       * Component (`OpportunityDetail`) que não remontou — então a sendbar
       * "Concluída · Devolver ao LT · Enviar para aprovação" continuava ali
       * depois de um envio bem-sucedido. Medido em `PCR-RODSUL-000094/2026`
       * (08/09/2026): o analista clicava, o envio ia, e a barra ficava — sem
       * nada na tela dizendo se foi encaminhado, nem quantas vezes.
       *
       * É o MESMO furo que `handleDevolverOportunidade` já tinha corrigido, e
       * pela mesma razão (o docblock de `onNeedsRefresh` chegou a registrar que
       * "o `router.refresh()` de lá já cobria o caminho que importava" — não
       * cobria). Quem relê é o PAI; o `push`/`refresh` continuam porque são o
       * caminho da rota dedicada `/oportunidades/[id]/analise/sneg`, onde não há
       * pai para avisar.
       *
       * Releitura, e não flip otimista como no GATE 1: a tela de destino é a
       * `AprovacaoView`, que carrega o próprio read model da alçada — não há o
       * que fabricar aqui.
       */
      setEnviarOpen(false);
      addToast('Proposta enviada para aprovação.', 'success');
      setAlcadaRefresh((n) => n + 1);
      onNeedsRefresh?.();
      router.push(rotaDoApp('oportunidades', opportunityId));
      router.refresh();
      return;
    } catch (err: unknown) {
      setEnviarOpen(false);
      addToast(
        err instanceof Error
          ? err.message
          : 'Falha ao enviar para aprovação.',
        'error',
      );
      // A recusa do GATE 2 costuma nomear o estado da saga (`ALCADA_NAO_ACIONADA`,
      // envio em andamento). Reler é o que põe o painel de acordo com o motivo.
      setAlcadaRefresh((n) => n + 1);
    } finally {
      setLiberarLoading(false);
    }
  }

  // ── derived: is the send button blocked? ──────────────────────────────────

  const liberarBlocked =
    !readiness?.ready || !analise?.parecerEmitido || liberarLoading;

  // "Salvo", not "emitido": the parecer block's terminal CTA reads "Salvar"
  // (prototype wording), so a reason naming "emitir" would send the analyst
  // looking for a button that does not exist on the screen.
  const liberarBlockReason = readiness?.bloqueios?.[0] ?? (
    !analise?.parecerEmitido ? 'Parecer técnico ainda não salvo.' : undefined
  );

  /*
   * ── quem EDITA, não quem ENTRA ──────────────────────────────────────────
   *
   * Este shell é a única tela da oportunidade em análise, para todos os perfis
   * (`AnaliseView`). Até 25/08/2026 ele devolvia `NotFoundScreen` a quem não
   * tivesse `Permission.SnegAnalysis`, e o LT era desviado para uma composição
   * paralela — que ficou estritamente mais pobre: sem o painel da alçada (que
   * o backend AUTORIZA ao LT), sem o conteúdo do parecer e sem as linhas
   * "Alçada sugerida" e "Recomendação".
   *
   * A permissão não sumiu: ela deixou de decidir SE a tela abre e passou a
   * decidir O QUE ela deixa editar. Isso é seguro por construção — a leitura é
   * o default e cada afordância de escrita precisa pedir `canEdit` — e é o
   * inverso de um prop `readOnly`, que protegeria só quem lembrasse de passá-lo.
   *
   * A rota dedicada `/oportunidades/[id]/analise/sneg` continua embrulhada em
   * `RequirePermission(SnegAnalysis)`: ela é o endereço do workspace do
   * analista, não a tela da oportunidade.
   *
   * ⚠️ Toda ação de escrita daqui para baixo é `canEdit &&`. Navegação
   * (links), releitura (`↻`) e alternância puramente visual NÃO são escrita e
   * continuam para todos — sem elas a tela vira um beco sem saída.
   */
  const canEdit = can(Permission.SnegAnalysis);
  /*
   * "Devolver ao LT" fora da SNEG (Matriz RBAC v2.1 · "Rejeitar / devolver",
   * 28/09/2026): SPCOM, Gestor de Franquias e TI Sustentação abrem esta tela em
   * LEITURA e mesmo assim devolvem a oportunidade — é a única escrita que o modo
   * leitura oferece, e só ela. Quem tem `canEdit` (BP, SNEG, Admin) já tem o
   * botão na barra de ações dele; `OpportunityReturn` os contém.
   */
  const canDevolverSemEditar = !canEdit && can(Permission.OpportunityReturn);

  /*
   * A conferência do documento voltou a ser da SNEG em 31/08/2026, sem sair da
   * CCOB — `DocumentValidate` é `[SNEG, CCOB, ADMIN]`, a união das duas decisões
   * (RN-F9-03 dá à SNEG; o ADO 67906 moveu para a CCOB em 26/08; o negócio pediu
   * a SNEG de volta em 31/08).
   *
   * ⚠️ Entre 26 e 31/08 este era o defeito que a analista reportou: com
   * `DocumentValidate` = `[CCOB, ADMIN]`, a conjunção abaixo deixava só o ADMIN
   * — a CCOB não chega a esta tela (o `AnaliseView` só encaminha `SnegAnalysis`)
   * e a SNEG não tinha a permissão. O fluxo continuava inteiro no código e
   * invisível para todo mundo que abre esta tela, o que lê como "foi removido".
   *
   * ⚠️ **A conjunção com `canEdit` é deliberada e FICA.** Esta tela é o
   * workspace do analista; oferecer os controles a um perfil que nunca chega
   * aqui seria controle inalcançável, e quebraria a invariante que a suíte
   * `sneg-analise-shell.readonly` fixa: *"qualquer perfil diferente de SNEG ou
   * ADMIN abre esta tela sem nenhuma ação de escrita"*. Com a SNEG de volta em
   * `DocumentValidate`, a conjunção deixou de estreitar o conjunto útil: quem
   * abre esta tela e pode conferir é a SNEG (e o ADMIN). A CCOB confere pelo
   * checklist (`/oportunidades/[id]/documentos`), que não tem gate de tela.
   */
  const canValidateDocs = canEdit && can(Permission.DocumentValidate);

  // ── loading state ─────────────────────────────────────────────────────────

  if (analiseStatus === 'loading') {
    return (
      <>
        <div
          data-testid="sneg-shell-loading"
          className="mb-2 h-4 w-48 animate-pulse rounded bg-(--neutral-100)"
        />
        <div className="mt-2 h-24 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        <div className="mt-4 h-16 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        <div className="mt-4 grid grid-cols-1 gap-[22px] min-[961px]:grid-cols-[1fr_340px] min-[961px]:items-start">
          <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
          <div className="h-96 animate-pulse rounded-[var(--radius-md)] bg-(--neutral-100)" />
        </div>
      </>
    );
  }

  // ── error state ───────────────────────────────────────────────────────────

  if (analiseStatus === 'error') {
    return (
      <div
        data-testid={
          analiseNaoAberta ? 'sneg-shell-nao-aberta' : 'sneg-shell-error'
        }
        role={analiseNaoAberta ? 'status' : 'alert'}
        className="mt-4 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-5 py-6"
      >
        {/*
          * ADO 68256 — `--color-info` quando a análise só não existe ainda.
          *
          * Vermelho ali afirmava falha do sistema sobre um estado em que nada
          * quebrou, e a frase ("Falha ao carregar a análise SNEG (404)") mandava
          * o usuário procurar um defeito. `role="status"` pela mesma razão:
          * `alert` interrompe o leitor de tela para anunciar uma emergência que
          * não existe.
          */}
        <p
          className={
            analiseNaoAberta
              ? 'text-(length:--t-caption) text-(--color-info)'
              : 'text-(length:--t-caption) text-(--color-danger)'
          }
        >
          {analiseError || 'Não foi possível carregar a análise SNEG.'}
        </p>
        <button
          type="button"
          onClick={fetchAll}
          className="mt-3 rounded-[var(--radius-xxs)] border border-(--color-border-strong) bg-(--color-surface) px-3 py-1.5 text-(length:--t-caption) font-bold hover:bg-(--neutral-40)"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // ── loaded ────────────────────────────────────────────────────────────────

  const a = analise!;
  const d = detail.status === 'loaded' ? detail.value : null;
  /*
   * A análise ACONTECENDO, e não o status da proposta (10/09/2026).
   *
   * Este workspace é alcançável por URL direta em QUALQUER fase — a rota
   * `/oportunidades/[id]/analise/sneg` só checa `Permission.SnegAnalysis` —,
   * e `p.status` fica congelado em `EM_ANALISE` quando a oportunidade avança.
   * O "Devolver" por proposta seguia oferecido em aprovação/minuta, e a
   * devolução lá não voltava atrás: a proposta ficava `DEVOLVIDA` e presa
   * (`reenviar` exige a oportunidade em análise; o GATE 1 só sai de
   * `EM_PREENCHIMENTO`). O backend agora recusa com 400 — aqui o botão some,
   * porque CTA cuja única resposta é 400 é controle morto.
   *
   * `detail` ainda carregando ⇒ `false`: não oferecer a ação enquanto a fase é
   * desconhecida (ela reaparece no render seguinte).
   */
  const analiseEmCurso = d?.backendState === 'EM_ANALISE';
  const codigo = d?.code ?? a.oportunidadeCodigo ?? '—';
  const clienteNome = d?.clientName ?? a.clienteNome;
  const propostasLabel =
    a.totalPropostas === 0
      ? 'Nenhuma proposta'
      : a.totalPropostas === 1
        ? '1 proposta'
        : `${a.totalPropostas} propostas`;

  /*
   * ADO 68242 — a pill do cabeçalho é a CLASSE DE ATIVO, derivada das propostas.
   *
   * Era `d.type` + `+ FRANQUIAS`, e `d.type` É o tipo de NEGOCIAÇÃO (o mapper o
   * monta como `TIPO_LABEL[b.tipoNegociacao]`): a pill lia `CONTRATAÇÃO +
   * FRANQUIAS` onde o protótipo diz `POSTO + FRANQUIAS`. Mesmo defeito da linha
   * "Tipo" do card, no lugar mais proeminente da tela — e o mesmo que o
   * `opportunity-detail` já havia corrigido, onde a pill era o literal `POSTO`.
   *
   * `opportunityAssetClassPills` é o MESMO predicado daquela tela: `[]` quando
   * não há proposta com tipo reconhecível, e aí nenhuma pill renderiza em vez
   * de afirmar uma classe. `d.franchises` sai da conta — a franquia já é uma
   * das classes que ele lista.
   *
   * ⚠️ Uma pill POR classe, como no `opportunity-detail` — e não uma string
   * juntada. É o que faz `POSTO` e `BR MANIA` serem dois selos, como o resto do
   * app os renderiza.
   *
   * ⚠️ Divergência DELIBERADA do protótipo, que escreve o genérico
   * `POSTO + FRANQUIAS`: os selos carregam a BANDEIRA (`BR MANIA`, `LUBRAX+`),
   * porque a posição da pill já diz "franquia" — decisão já tomada em
   * `ASSET_CLASS_PILL` e aplicada na tela de preenchimento. Duas telas dizendo
   * a mesma coisa de dois jeitos é o que isto evita.
   */
  const tipoPills = opportunityAssetClassPills(proposals);

  const docs =
    checklist.status === 'loaded'
      ? checklist.value.docs.map((doc) => docOverrides[doc.id] ?? doc)
      : [];
  /*
   * A ordem que o CARD renderiza — os que aguardam conferência primeiro, porque
   * fechado ele mostra 6 de N. `docs` segue sendo a lista completa na ordem do
   * catálogo, e é dela que saem os contadores abaixo: reordenar não pode mudar
   * nenhuma contagem.
   *
   * A prioridade é lida da lista **CARREGADA** (`checklist.value.docs`), sem os
   * overrides — é o snapshot que mantém a linha no lugar quando ela é validada,
   * em vez de fazê-la fugir do corte de 6 (ver `ordenarPorConferencia`).
   */
  const aguardavamNoCarregamento = new Set(
    checklist.status === 'loaded'
      ? checklist.value.docs.filter(aguardaConferencia).map((doc) => doc.id)
      : [],
  );
  const docsOrdenados = ordenarPorConferencia(docs, aguardavamNoCarregamento);
  /*
   * Quantas linhas o card mostra FECHADO.
   *
   * Piso de {@link VISIVEIS_FECHADO} (o desenho do protótipo) e **nunca menos
   * que o número de linhas que aguardavam conferência no carregamento** — são
   * exatamente essas que o GATE 2 nomeia na barra (`documentos_nao_validados`),
   * e é aqui que o `Validar` delas mora.
   *
   * ⚠️ **Relato de 17/09/2026:** a barra pedia para validar a `FAP Lubrax+` e a
   * linha não estava no card; ela só apareceu depois de ir a "Gerenciar
   * documentos" e voltar. A prioridade de 01/09/2026 resolve enquanto as
   * bloqueantes CABEM no corte — passando de 6, a 7ª volta a ficar escondida, e
   * o caso ficou alcançável quando as duas FAP passaram a ser exigidas em toda
   * oportunidade (16/09/2026). Nomear o documento na barra não basta se a tela
   * que tem a ação não o mostra.
   *
   * ⚠️ Isto NÃO revisa o snapshot: o corte continua congelado no carregamento, e
   * validar uma linha segue mudando o pill no lugar em vez de fazê-la fugir.
   */
  const visiveisFechado = Math.max(
    VISIVEIS_FECHADO,
    aguardavamNoCarregamento.size,
  );
  const docsVisiveis = docsExpandido
    ? docsOrdenados
    : docsOrdenados.slice(0, visiveisFechado);
  /*
   * A slice do checklist que o card "Análises" recebe carrega os MESMOS
   * `docOverrides` que a lista desta tela: validar um documento atualiza o
   * contador "Documentação validada (Hub)" na hora. Sem isso a ação certa
   * deixaria o contador parado até alguém recarregar a página.
   */
  const checklistParaCard: AsideSlice<ChecklistResult> =
    checklist.status === 'loaded'
      ? { status: 'loaded', value: { ...checklist.value, docs } }
      : checklist;

  return (
    <>
      {/*
       * ── `.head` — 01c prototype ─────────────────────────────────────────
       * pill + title + sub + `.meta` row separated by a top border.
       */}
      <div
        data-testid="sneg-head"
        className="mt-2 rounded-[var(--radius-md)] border border-(--color-border) bg-(--color-surface) px-[22px] py-5"
      >
        <div className="flex flex-wrap items-center gap-2.5 text-(length:--t-caption)">
          {/*
            * A pill é da ANÁLISE, não da oportunidade — e precisa dizer isso.
            *
            * Sem o prefixo, a sub-fase `concluida` renderizava "Concluída" no
            * lugar mais proeminente da tela enquanto o stepper ao lado mostrava
            * o passo 2 (medido em 20/08/2026): duas verdades na mesma tela, e a
            * errada era a maior. A fase da oportunidade tem lugar próprio — o
            * stepper — e não se repete aqui.
            */}
          <StatusPill variant={faseToPillVariant(a.fase)}>
            Análise · {ANALISE_FASE_LABEL[a.fase]}
          </StatusPill>
          {hideBackToOpportunity ? null : (
            <Link
              href={`/oportunidades/${opportunityId}`}
              className="ml-auto text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
            >
              ← Oportunidade
            </Link>
          )}
        </div>
        <h1 className="mb-0.5 mt-1.5 text-(length:--t-h2) font-bold">
          {d?.title ?? 'Análise da proposta — SNEG'}
        </h1>
        <p
          data-testid="sneg-head-subtitle"
          className="text-(length:--t-caption) text-(--color-text-muted)"
        >
          {tipoPills.map((label) => (
            <span key={label}>
              <StatusPill variant="neutral">{label}</StatusPill>{' '}
            </span>
          ))}
          {[
            codigo,
            propostasLabel,
            clienteNome,
            d?.clientDocument,
            /*
             * A ZONA do LT (`PE02`), nunca a lista de áreas de venda que este
             * slot carregava. Pedido de 18/09/2026, na sequência do relato que
             * originou `zona-venda-oportunidade.ts`: a lista chegava aqui por
             * extenso — cinco pares "Divisão / Canal" empurrando o subtítulo
             * para duas linhas —, e era o mesmo "várias informações" do
             * ticket, só que num lugar sem rótulo, onde ninguém a reconhecia.
             * As áreas seguem na tela, no campo "Áreas de venda" do card.
             */
            textoZonaVenda(d?.profitCenters),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div
          data-testid="sneg-meta"
          className="mt-4 flex flex-wrap gap-4 border-t border-(--color-border) pt-4 min-[961px]:gap-9"
        >
          <DItem
            l="Responsável (LT)"
            v={d ? `${d.owner}${d.ownerRole ? ` · ${d.ownerRole}` : ''}` : '—'}
          />
          <DItem
            l="Analista SNEG"
            v={
              <>
                {a.atribuicaoPendente ? (
                  <StatusPill variant="neutral">Aguardando distribuição</StatusPill>
                ) : (
                  <span data-testid="meta-analista">{a.analista?.nome ?? '—'}</span>
                )}
                {/* RN-F1-02 — redistribuir a análise é ato da própria SNEG. */}
                {/*
                  O link passava despercebido na barra de metadados. O que dá
                  peso aqui é o TAMANHO, não o `font-weight`: `--font-family` é
                  `Arial, Helvetica, sans-serif`, sem `@font-face` — só há
                  Regular e Bold, e este já está em `font-bold` (700). Pedir 800
                  casaria de volta em 700 pelo algoritmo de font matching do CSS,
                  ou seja, seria um no-op invisível. Por isso 14px → 16px
                  (`--t-caption` → `--t-body`), um degrau da escala.
                */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setReatribuirOpen(true)}
                    className="ml-2 text-(length:--t-body) font-bold text-(--secondary-600) hover:underline"
                  >
                    reatribuir
                  </button>
                )}
              </>
            }
          />
          <DItem l="Região / Gerência" v={a.gerencia || '—'} />
          <DItem
            l="Franquias"
            v={d && d.franchises.length > 0 ? d.franchises.join(' · ') : '—'}
          />
        </div>
      </div>

      {/* ── multi-track stepper (`.oj2-wrap`) — same component as 01b ────── */}
      {renderMainBlocks && d && (
        <OpportunityFlowTabs
          opportunityId={opportunityId}
          backendState={d.backendState}
          status={d.status}
        />
      )}

      {/* ── `.layout` — 1fr 340px, gap 22px, collapses at ≤960px ─────────── */}
      <div
        data-testid="sneg-grid"
        className="mt-[18px] grid grid-cols-1 items-start gap-[22px] min-[961px]:grid-cols-[1fr_340px]"
      >
        {/* Main column */}
        <div data-testid="sneg-main-col" className="min-w-0">
          {/* ── Sec 1 · Dados da oportunidade ──────────────────────────── */}
          <Sec title="Dados da oportunidade">
            {/*
              ⚠️ **961px, não 761px** (17/09/2026). O `.dgrid` do protótipo
              colapsa em `max-width:960px` — conferido nos 7 arquivos da
              oportunidade (01b, 01b-nova, 01c, 01c-lt, 01d, 01f, 01h), sem
              exceção. O 761 desta tela vinha do breakpoint dos KPIs de
              `12-pendencias.html`, que é de outro layout: entre 761 e 960 o card
              mantinha duas colunas e a razão social quebrava palavra por linha,
              encostando no rótulo da coluna vizinha (relato do stage).
            */}
            <div className="grid grid-cols-1 gap-x-7 gap-y-3 min-[961px]:grid-cols-2">
              <DItem l="Código" v={codigo} />
              {/*
                * Rótulo explícito: este valor é a sub-fase da ANÁLISE. Rotulado
                * só "Status", dentro de um card chamado "Dados da oportunidade",
                * ele era lido como o status da oportunidade.
                */}
              <DItem l="Status da análise" v={ANALISE_FASE_LABEL[a.fase]} />
              <DItem
                l="Cliente (SAP + Razão Social)"
                v={d ? sapAndName(d) : clienteNome ?? '—'}
              />
              <DItem
                l="Tipo"
                v={
                  /*
                   * ADO 68242 — a CLASSE DE ATIVO, derivada das propostas.
                   *
                   * Era `d.type`, que É o tipo de NEGOCIAÇÃO (o mapper o monta
                   * como `TIPO_LABEL[b.tipoNegociacao]`): o card exibia
                   * "Contratação" em "Tipo" e `—` em "Tipo de negociação" logo
                   * abaixo — o mesmo fato numa linha e o travessão na outra. O
                   * protótipo é explícito: "Tipo" é `Posto + Franquias` e "Tipo
                   * de negociação" é `Contratação · Vinculação`.
                   *
                   * `opportunityAssetClassText` é o MESMO predicado que a tela
                   * de preenchimento e a de aprovação já usam (VBR-635 §10) —
                   * uma segunda derivação divergiria na oportunidade com
                   * franquia eleita. E o `+ Franquias` sai: a franquia já é uma
                   * das classes que ele lista, então concatenar repetia a
                   * palavra ("Posto (PCR) · Franquia BR Mania + Franquias").
                   *
                   * Sem proposta ainda ⇒ o tipo da análise; sem ele, travessão.
                   * Nunca um `POSTO` chumbado: valor inventado é
                   * indistinguível de um real na tela.
                   */
                  opportunityAssetClassText(proposals) ??
                  a.tipoProposta ??
                  '—'
                }
              />
              <DItem
                l="Proprietário"
                v={d ? `${d.owner}${d.ownerRole ? ` · ${d.ownerRole}` : ''}` : '—'}
              />
              {/*
                * Prazo do contrato (08/09/2026) — MAX da janela das propostas
                * ELEITAS, derivado no backend.
                *
                * Fica na grade PRINCIPAL, e não no "Mais informações": é o
                * número que o parecer compara com o padrão DCVIM
                * (`PRAZO-CONTRATO-MAX`), então esconder atrás de um toggle
                * justamente na tela de quem analisa seria o oposto do pedido.
                * "Datas de início/fim de consumo", que fica lá embaixo, é outra
                * coisa — e hoje sempre `—`, porque o mapper da BFF fixa
                * `startDate`/`endDate` em `null`.
                */}
              <DItem l="Prazo do contrato" v={prazoContratoLabel(d?.prazoContratoMeses)} />
            </div>

            {dadosMore && (
              <div data-testid="dados-more" className="mt-3">
                <div className="grid grid-cols-1 gap-x-7 gap-y-3 min-[961px]:grid-cols-2">
                  {/*
                    * ADO 68242 — `d.type` É o tipo de negociação.
                    *
                    * `tipoNegociacao` é um slot que o mapper do front NUNCA
                    * preenche, então esta linha era um travessão permanente
                    * para um valor que a tela de preenchimento mostrava um
                    * passo antes. Exatamente o defeito que a tela de aprovação
                    * já havia corrigido (VBR-635 §10) e que sobreviveu aqui.
                    *
                    * `a.tipoNegociacao` é a reserva: o `GET .../analise` já
                    * devolve o rótulo do picklist, e é ele que responde quando
                    * o detalhe da oportunidade não carregou.
                    */}
                  {/* ADO 68242 — ver `finalidade-oportunidade.ts`. */}
                  <DItem
                    l={FINALIDADE_FIELD_LABEL}
                    v={textoFinalidade(d?.finalidade) ?? '—'}
                  />
                  <DItem l="Grupo Empresa" v={d?.companyGroup ?? '—'} />
                  {/*
                    * ⚠️ NÃO reintroduza aqui um campo "Zona de venda": nesta
                    * tela ela vive no SUBTÍTULO (18/09/2026), e o campo de
                    * volta daria duas respostas para o mesmo fato na mesma
                    * tela — o defeito que o guard de `finalidade-oportunidade`
                    * já registra. As áreas ficam no campo abaixo.
                    */}
                  {/*
                    * ADO 68142 — o identificador do Salesforce ao lado do nosso.
                    * Vive no "Mais informações" e não na linha de cima porque a
                    * pergunta é de cruzamento/suporte, não de análise; mas TEM de
                    * existir nesta fase, que é justamente a em que a alçada roda
                    * e portanto a em que o registro do org passa a existir.
                    */}
                  <DItem
                    l="Oportunidade no Salesforce"
                    v={
                      /* ADO 68142 — o número abre o registro no org. Sem URL,
                         texto; sem código, travessão (ainda não integrada). */
                      d?.salesforceCode ? (
                        <SalesforceRecordLink
                          code={d.salesforceCode}
                          url={d.salesforceUrl}
                          testId="sneg-sf-code"
                        />
                      ) : (
                        '—'
                      )
                    }
                  />
                  {/*
                    * ADO 68242 — a janela de consumo, derivada pelo backend da
                    * proposta ELEITA (`janelaConsumo`). A composição é
                    * compartilhada pelas quatro telas que montam este card —
                    * ver `textoJanelaConsumo` para o porquê (e para a armadilha
                    * de fuso que ela evita).
                    */}
                  <DItem
                    l="Datas de início/fim de consumo"
                    v={textoJanelaConsumo(d?.startDate, d?.endDate) ?? '—'}
                  />
                  <DItem
                    l="Data de abertura"
                    v={fmtDate(d?.dataAbertura ?? d?.createdAt)}
                  />
                  <DItem l="Data de conclusão" v={fmtDate(d?.dataConclusao)} />
                  <DItem l="Criado por" v={d?.createdBy ?? '—'} />
                  {/*
                    * Nova imagem de pista — o campo que o gate da alçada manda
                    * preencher.
                    *
                    * Estava só na tela de preenchimento (ADO 67941, 01/09/2026),
                    * e é AQUI que a recusa aparece: o painel "Processo de alçada"
                    * é montado neste workspace e diz "informe nos dados da
                    * oportunidade". Medido no stage em 02/09/2026 nas
                    * OPP-2026-000051 e OPP-2026-000046 — alçada travada com o
                    * campo em lugar nenhum da tela.
                    */}
                  {camposNovaImagemPista(d ?? {}).map((c) => (
                    <DItem key={c.label} l={c.label} v={c.value} />
                  ))}
                  <DItem
                    full
                    l={AREAS_VENDA_FIELD_LABEL}
                    v={textoAreasVenda(d?.salesZone) ?? '—'}
                  />
                  <DItem full l="Descrição" v={d?.description || '—'} />
                  {/*
                    * ADO 68473 — briefing + "Parecer do LT". Até 18/09/2026 o
                    * briefing só existia na tela de PREENCHIMENTO, então quem
                    * lê a oportunidade daqui em diante não alcançava o texto em
                    * que o LT explica o negócio. A regra é compartilhada pelas
                    * quatro telas que montam este card — ver `textos-do-lt.ts`.
                    */}
                  {camposTextosDoLt(d ?? {}).map((c) => (
                    <DItem key={c.label} full l={c.label} v={c.value} />
                  ))}
                </div>

                {d && d.team.length > 0 && (
                  <div className="mt-4">
                    <div className="text-(length:--t-caption) uppercase tracking-[0.3px] text-(--color-text-muted)">
                      Equipe
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {d.team.map((member) => (
                        <span
                          key={member.id}
                          className="rounded-full bg-(--neutral-60) px-[11px] py-1 text-(length:--t-small) font-bold"
                        >
                          {member.name}{' '}
                          <small className="font-normal text-(--color-text-muted)">
                            ·{' '}
                            {[member.role, member.zone, member.isPrincipal ? 'principal' : null]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              data-testid="dados-more-btn"
              onClick={() => setDadosMore((v) => !v)}
              className="mt-3.5 inline-flex items-center gap-1.5 text-(length:--t-caption) font-bold text-(--secondary-600)"
            >
              {dadosMore ? 'Menos informações' : 'Mais informações'}
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className={`transition-transform ${dadosMore ? 'rotate-180' : ''}`}
              >
                <path
                  d="M4 6L8 10L12 6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </Sec>

          {/* ── Sec 2 · Propostas em análise ───────────────────────────── */}
          <Sec title="Propostas em análise">
            {proposals.length === 0 ? (
              <p className="text-(length:--t-caption) text-(--color-text-muted)">
                Nenhuma proposta nesta oportunidade.
              </p>
            ) : (
              proposals.map((p) => (
                <div
                  key={p.id}
                  data-testid={`prop-${p.code}`}
                  className="mb-2.5 rounded-[var(--radius-xs)] border border-(--color-border) p-3.5 last:mb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <StatusPill variant={PROPOSAL_PILL[p.status] ?? 'neutral'}>
                        {PROPOSAL_STATUS_LABEL[p.status] ?? p.status}
                      </StatusPill>
                      <div className="mt-1.5 text-(length:--t-caption) font-bold">
                        {[p.code, p.title, p.group].filter(Boolean).join(' · ')}
                      </div>
                      {p.authorName && (
                        <div className="mt-0.5 text-(length:--t-caption) text-(--color-text-muted)">
                          Autor: {p.authorName}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={proposalHref(opportunityId, p.id, p.tipoProposta)}
                        className="rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-3 py-1.5 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600)"
                      >
                        Analisar →
                      </Link>
                      {/* RN-F2-03 — devolver a proposta é decisão do analista,
                          e só enquanto a análise acontece (`analiseEmCurso`). */}
                      {canEdit &&
                        analiseEmCurso &&
                        p.status === ProposalStatus.EmAnalise && (
                          <button
                            type="button"
                            data-testid={`prop-devolver-${p.code}`}
                            onClick={() => {
                              setDevolverInitialId(p.id);
                              setDevolverOpen(true);
                            }}
                            className="text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
                          >
                            Devolver
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </Sec>

          {/* ── Sec 3 · Análise financeira (consolidado F7) ───────────────
           *
           * O MESMO card da tela de preenchimento (`opportunity-detail.tsx`),
           * na MESMA posição: Dados → Propostas → Análise financeira → Totais →
           * Garantias → Documentos. Ele só existia na fase de preenchimento, e
           * ao entrar em análise os indicadores consolidados desapareciam da
           * tela — sobrava a linha "TIR / VPL (oportunidade)" do painel lateral,
           * que é um digest de duas medidas, não as seis.
           *
           * Depois das propostas de propósito, e a razão é de leitura: são os
           * números calculados sobre as propostas ELEITAS (RN-F7-02), então o
           * leitor precisa saber quais são antes de lê-los. É o mesmo argumento
           * que já posiciona o card de Totais logo abaixo — e ordens distintas
           * entre as duas telas fariam o card saltar de lugar no GATE 1.
           *
           * ⚠️ Sem `collapsible`: nenhum `Sec` deste workspace colapsa (o
           * protótipo `01c` não põe o chevron em nenhum), enquanto na tela de
           * preenchimento este card colapsa porque o `01b` o marca. Divergência
           * consciente — dar o chevron só a este card o faria parecer o único
           * dobrável por acidente.
           */}
          <Sec
            title="Análise financeira"
            action={
              /*
               * Pill + CTA — paridade com a tela de preenchimento. O card é o
               * MESMO nas duas; ter o controle numa e não na outra é a
               * divergência por cópia que este repo já pagou.
               *
               * Gate `canEdit` (`Permission.SnegAnalysis`), não `canWrite`: o
               * invariante desta tela é que todo perfil fora de SNEG/ADMIN a
               * abre sem NENHUMA ação de escrita.
               */
              indicatorStatus || (canEdit && snapshot !== null) ? (
                <div className="flex items-center gap-2.5">
                  {indicatorStatus && (
                    <StatusPill
                      data-testid="financeiro-status-pill"
                      variant={INDICATOR_STATUS_PILL_VARIANT[indicatorStatus]}
                    >
                      {INDICATOR_STATUS_LABEL[indicatorStatus]}
                    </StatusPill>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      data-testid="financeiro-recalcular"
                      onClick={() => void handleRecalcularIndicadores()}
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
            {indicators.status === 'loading' && (
              <div className="space-y-2" data-testid="financeiro-loading">
                <div className="h-9 animate-pulse rounded bg-(--neutral-100)" />
                <div className="h-9 animate-pulse rounded bg-(--neutral-100)" />
              </div>
            )}

            {/*
              * Falha de leitura NÃO vira grade de traços: `—` em toda linha é a
              * afirmação "não há indicador", e aqui o fato é "não foi possível
              * ler". São consertos diferentes (eleger proposta × tentar de novo).
              */}
            {indicators.status === 'error' && (
              <div data-testid="financeiro-erro">
                <p className="text-(length:--t-caption) text-(--color-danger)">
                  Não foi possível carregar os indicadores consolidados.
                </p>
                <button
                  type="button"
                  onClick={revalidateIndicators}
                  className="mt-1.5 text-(length:--t-caption) font-bold text-(--secondary-600) hover:underline"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {indicators.status === 'loaded' && (
              <>
                {isCalculating && (
                  <CalculatingNotice
                    testId="financeiro-calculating-banner"
                    exhausted={pollExhausted}
                    onRefresh={revalidateIndicators}
                  />
                )}
                {calculationUnavailable && (
                  /*
                   * `manual` desde 04/09/2026: o card ganhou o CTA, então
                   * "recalcule para tentar novamente" aponta para um botão que
                   * EXISTE — no header. Era `automatic` porque não existia.
                   */
                  <CalculationUnavailableNotice
                    testId="financeiro-unavailable-banner"
                    reason={snapshot?.mensagemErro ?? null}
                  />
                )}
                {indicatorStatusUnknown && (
                  <UnknownStatusNotice testId="financeiro-unknown-status-banner" />
                )}

                {/*
                  * Nunca calculado: a eleição de uma proposta de posto é o que
                  * preenche o vazio, e desde 04/09/2026 o CTA do header também.
                  */}
                {snapshot === null && (
                  <p
                    data-testid="financeiro-never-calculated"
                    className="mb-3 text-(length:--t-caption) italic text-(--color-text-muted)"
                  >
                    Os indicadores econômicos consolidados (TIR/VPL) são calculados
                    automaticamente quando uma proposta de posto é eleita para esta
                    oportunidade — ou agora, por &ldquo;Recalcular / Simular (ARP)&rdquo;.
                  </p>
                )}

                {snapshot?.calculadoEm && (
                  <p className="mb-3 text-(length:--t-small) text-(--color-text-muted)">
                    Último cálculo:{' '}
                    <strong>{formatCalculatedAt(snapshot.calculadoEm)}</strong>
                  </p>
                )}

                {indicatorValuesAreStale && (
                  <StaleValuesCaption testId="financeiro-stale-values-caption" />
                )}

                {/*
                 * ADO 68009 — por que a TIR não mudou ao eleger a franquia.
                 *
                 * O snapshot deste card vem de leitura própria (`loadIndicators`),
                 * mas a lista de franquias fora do cálculo vem do DETALHE (`d`) —
                 * a mesma fonte de onde este card já lê o VMM. Duplicá-la no
                 * payload de indicadores criaria duas respostas para a mesma
                 * pergunta, que é o defeito que a nota existe para consertar.
                 */}
                <RoyaltyFranquiaNote franquias={d?.franquiasSemRoyalty} />

                <div
                  data-testid="financeiro-fields"
                  data-stale={indicatorValuesAreStale ? 'true' : 'false'}
                  className={`grid grid-cols-1 gap-x-7 gap-y-3 min-[961px]:grid-cols-2${
                    indicatorValuesAreStale ? ` ${STALE_VALUES_CLASS}` : ''
                  }`}
                >
                  <DItem
                    l="TIR da oportunidade"
                    v={
                      snapshot?.tir != null
                        ? formatPercentFromDecimal(snapshot.tir)
                        : '—'
                    }
                  />
                  <DItem
                    l="VPL da oportunidade"
                    v={snapshot?.vpl != null ? formatCurrency(snapshot.vpl) : '—'}
                  />
                  <DItem
                    l="% bonificação antecipada"
                    v={
                      snapshot?.percentualAntecipacao != null
                        ? formatPercentFromDecimal(snapshot.percentualAntecipacao)
                        : '—'
                    }
                  />
                  {/*
                    * VMM é o único campo que NÃO vem do snapshot: é medida da
                    * oportunidade (`opportunities.vmm`), gravada no recálculo.
                    * Vem do detalhe, como na tela de preenchimento.
                    */}
                  <DItem
                    l="VMM"
                    v={
                      d?.vmm != null
                        ? `${d.vmm.toLocaleString('pt-BR')} m³/mês`
                        : '—'
                    }
                  />
                  {/*
                    * Cálculo concluído e R$/m³ vazio NOMEIA a fonte em vez de
                    * exibir `—` mudo (ADO 67583/67593): sem cálculo nenhum o
                    * traço é a resposta certa — não há o que esperar —, mas com
                    * cálculo concluído a lacuna é do ARP, que devolve
                    * `indiceRealL: null` (pendência do ADR-0039). Nada é
                    * derivado aqui: um número fabricado seria indistinguível de
                    * um real, e a escala é do backend (×1000).
                    */}
                  <DItem
                    l="Resultado R$/m³"
                    v={
                      snapshot?.rsPorM3 != null ? (
                        `R$ ${snapshot.rsPorM3.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /m³`
                      ) : snapshot?.calculadoEm ? (
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
                    * TMA fecha a grade, como na tela de preenchimento. Já é
                    * percentual (11.05 = 11,05%) — ao contrário da `tir`, NÃO é
                    * convertida.
                    */}
                  <DItem
                    l="TMA aplicável"
                    v={
                      snapshot?.tma != null
                        ? `${snapshot.tma.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
                        : '—'
                    }
                  />
                </div>
              </>
            )}
          </Sec>

          {/* ── Sec 3a · Totais - Recursos Financeiros ───────────────────
           *
           * Os seis campos que o Salesforce exibe na `Opportunity`, somados
           * sobre os recursos financeiros das propostas eleitas — pedido do
           * negócio para as fases posteriores ao preenchimento.
           *
           * Montado SEM condição de fase: o backend devolve o slot `null`
           * enquanto a oportunidade está em preenchimento, e este workspace só
           * renderiza a partir de `EM_ANALISE` — então aqui o card aparece
           * sempre que o detalhe já carregou. Vem DEPOIS das propostas porque é
           * sobre as eleitas que ele soma: o leitor precisa saber quais são
           * antes de ler os totais.
           *
           * E logo abaixo de "Análise financeira", como na tela de
           * preenchimento: os dois falam do dinheiro consolidado da
           * oportunidade, e este detalha o que a linha "% bonificação
           * antecipada" do card acima resume.
           */}
          <TotaisRecursosFinanceirosCard
            totais={d?.totaisRecursosFinanceiros}
            className="mb-4"
          />

          {/* ── Sec 3b · Garantias — inline card, ACIMA de Documentos (Task 7) ──
           *
           * Divergência deliberada do protótipo `01c-oportunidade-analise.html`,
           * que não tem este card e resolve a garantia só pelo link do painel
           * lateral ("Andamento da análise" → `garantiaTrack`, abaixo). O card
           * aparece porque um cliente relatou o bug que ele conserta: a
           * `GarantiasIndicadasCard` só era montada na tela de preenchimento
           * (`opportunity-detail.tsx`) — ao entrar em análise, as garantias
           * que o LT tinha acabado de registrar simplesmente SUMIAM da tela.
           *
           * Fica ANTES de "Documentos da oportunidade" por decisão de produto
           * (ADO 67919, 26/08/2026), a MESMA ordem de `opportunity-detail.tsx`:
           * as duas telas são a mesma oportunidade em fases diferentes, e
           * ordens distintas fariam o card saltar de lugar no GATE 1.
           *
           * O link CONTINUA existindo (mais abaixo, no painel "Análises"): o
           * card diz O QUE foi indicado, o link leva PARA a análise (a tela
           * dedicada `/garantia`, com a trilha de 10 passos).
           *
           * Self-fetching (mesma razão de `ParecerPanel` e do painel de
           * alçada) ⇒ gated por `renderMainBlocks`. Gated também por
           * `canSeeGarantia` (`Permission.GarantiaView`), o MESMO predicado
           * que já governa a linha do painel lateral — mesmo raciocínio do
           * card em `opportunity-detail.tsx`.
           */}
          {renderMainBlocks && canSeeGarantia && (
            <Sec title="Garantias">
              <GarantiasIndicadasCard
                opportunityId={opportunityId}
                onMutated={() => setGarantiaFlowRefresh((n) => n + 1)}
              />
            </Sec>
          )}

          {/* ── Sec 4 · Documentos da oportunidade ─────────────────────── */}
          <Sec title="Documentos da oportunidade">
            {checklist.status === 'loading' && (
              <div className="space-y-2" data-testid="docs-loading">
                <div className="h-9 animate-pulse rounded bg-(--neutral-100)" />
                <div className="h-9 animate-pulse rounded bg-(--neutral-100)" />
              </div>
            )}
            {checklist.status === 'error' && (
              <p className="text-(length:--t-caption) text-(--color-danger)">
                Erro ao carregar os documentos.
              </p>
            )}
            {checklist.status === 'loaded' && (
              <>
                {/*
                  Os que aguardam conferência primeiro, e TODOS eles visíveis —
                  são os que a barra do GATE 2 nomeia, e é aqui que o `Validar`
                  mora (ver `ordenarPorConferencia` e `visiveisFechado`).
                */}
                {docsVisiveis.map((doc) => (
                  <div
                    key={doc.id}
                    data-testid={`doc-row-${doc.id}`}
                    className="mb-2 flex items-center justify-between gap-3 rounded-[var(--radius-xs)] border border-(--color-border) px-3 py-2.5 text-(length:--t-caption)"
                  >
                    <span className="flex items-center gap-3">
                      <span>{doc.name}</span>
                      <StatusPill variant={docStatusChip(doc).variant}>
                        {docStatusChip(doc).label}
                      </StatusPill>
                      {/*
                        ⚠️ `satisfiedExternally` chega como `anexado` no fio e está
                        FORA do gate (VBR-642): a exigência foi atendida por
                        evidência de fora do hub — as fotos da proposta —, e não há
                        `repositoryDocumentId` para conferir. Sem esta nota a linha
                        era byte a byte igual a uma que bloqueia, e o analista
                        gastava o clique numa que não conta.
                      */}
                      {doc.status === 'anexado' && doc.satisfiedExternally && (
                        <span
                          className="text-(--color-text-muted)"
                          data-testid={`doc-externo-${doc.id}`}
                        >
                          · enviado no bloco da proposta
                        </span>
                      )}
                    </span>
                    {/*
                      * Conferência do documento (RN-F9-03) — validar, desfazer a
                      * validação e pedir reenvio ao LT. Da SNEG e da CCOB desde
                      * 31/08/2026. Sem `canValidateDocs` a linha fica só nome +
                      * pill de status, que é o que o painel do LT mostra.
                      */}
                    {canValidateDocs && (
                      <DocValidationActions
                        doc={doc}
                        busy={docAction === doc.id}
                        onValidar={() => void handleDocValidation(doc, true)}
                        onDesfazer={() => void handleDocValidation(doc, false)}
                        onSolicitarReenvio={() => void handleSolicitarReenvio(doc)}
                      />
                    )}
                  </div>
                ))}
                {/*
                  ⚠️ Era um `<p>` — texto que anunciava linhas que a tela não
                  tinha como mostrar. Para ver o resto o analista precisava SAIR
                  da tela, que é literalmente o contorno descrito no relato de
                  17/09/2026 ("entrei em Gerenciar documentos e voltei"). Um
                  resumo que nomeia o escondido sem alcançá-lo é o mesmo defeito
                  da barra que não nomeava o documento.
                */}
                {docsOrdenados.length > visiveisFechado && (
                  <button
                    type="button"
                    data-testid="docs-ver-todos"
                    aria-expanded={docsExpandido}
                    onClick={() => setDocsExpandido((aberto) => !aberto)}
                    className="rounded-[var(--radius-xxs)] text-(length:--t-caption) text-(--color-text-muted) underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-(--secondary-500)"
                  >
                    {docsExpandido
                      ? 'Mostrar menos'
                      : `+ ${docsOrdenados.length - visiveisFechado} outros documentos`}
                  </button>
                )}
                <div className="mt-2">
                  <Link
                    href={`/oportunidades/${opportunityId}/documentos`}
                    className="inline-flex items-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-50)"
                  >
                    Gerenciar documentos
                  </Link>
                </div>
              </>
            )}
          </Sec>

          {/* ── Sec 4 · Parecer técnico — SNEG (VBR-273) ───────────────── */}
          {renderMainBlocks && (
            // `mb-4` é o ritmo que todo card desta coluna carrega. Este
            // wrapper era o único sem ele (medido: gap 0 contra 16px entre
            // todos os outros), e o card seguinte encostava — não adianta pôr
            // margem no de baixo, porque `margin-bottom` separa dele para o
            // próximo, não dele para o anterior.
            <div id="parecer" className="mb-4">
              <ParecerPanel
                opportunityId={opportunityId}
                readOnly={!canEdit}
                pendenciasObrigatoriasAbertas={
                  readiness?.pendenciasObrigatoriasAbertas ?? 0
                }
                onEmitted={() => {
                  setParecerRefresh((n) => n + 1);
                  void Promise.all([refreshAnalise(), refreshReadiness()]);
                }}
                onSaved={() => setParecerRefresh((n) => n + 1)}
              />
            </div>
          )}

          {/* ── Sec 5 · Alçada (BPMN "Acionar Processo da Alçada") ─────── */}
          {/*
           * O painel da saga (SF01–SF08) existia completo e NÃO estava montado
           * em tela nenhuma. Consequência medida: o `CRM_INTEGRADO_GUARD` do
           * GATE 2 exige `opportunity_crm_links` e `proposal_crm_links` em
           * `CRIADO`, então "Enviar para aprovação" respondia
           * `422 ALCADA_NAO_ACIONADA` SEMPRE — não havia caminho, pela
           * interface, que integrasse a oportunidade ao Salesforce.
           *
           * Fica na coluna principal da análise porque é aqui que o BPMN a
           * coloca: o Gestor aciona, simula, revisa e só então envia — o ciclo
           * "Simular outra / Ajustar / Enviar" acontece dentro de `EM_ANALISE`.
           */}
          {renderMainBlocks && (
            // `mb-4` is the rhythm every `Sec` in this column carries. The
            // wrapper had none, and the block above it (`ParecerPanel`) does not
            // set a bottom margin either — the two cards rendered glued.
            //
            // ⚠️ `readOnly` NÃO é redundante com o gate próprio do painel: ele
            // se auto-gateia por `Permission.AlcadaSimular`, que é
            // `[LT, Sneg, Admin]`. O LT PODE acionar a alçada, e isso está certo
            // na tela de preenchimento, onde o mesmo painel é montado e onde o
            // BPMN põe o ciclo `simular → ajustar → simular`. Aqui a
            // oportunidade já foi enviada para análise e a tela é de leitura —
            // quem decide é o contexto, não o papel.
            <div id="alcada" className="mb-4">
              <AlcadaSagaPanel
                opportunityId={opportunityId}
                readOnly={!canEdit}
                refreshSignal={alcadaRefresh}
                /*
                 * O par de VOLTA do `refreshSignal`.
                 *
                 * `alcada_nao_simulada` é critério do GATE 2
                 * (`LiberacaoReadinessService`), e quem o resolve é a saga —
                 * que conclui sozinha, fora de qualquer ação desta tela. O
                 * painel relê por polling; a sendbar, não. Sem este aviso o
                 * quadro passava a dizer "Sincronizada · Simulação concluída"
                 * e a barra seguia recusando o envio até alguém recarregar a
                 * página. Mesmo cabeamento de `ParecerPanel.onEmitted` e do
                 * `onMutated` do card de garantias.
                 *
                 * O que exatamente é relido está em
                 * {@link handleAlcadaProntidaoMudou} — não é só a barra.
                 */
                onProntidaoMudou={handleAlcadaProntidaoMudou}
              />
            </div>
          )}

          {/*
           * SEM card de DDI aqui, de propósito.
           *
           * O protótipo `01c-oportunidade-analise.html` traz a DDI UMA vez, e
           * como linha de status do card "Análises" do painel lateral (linha
           * 481) — que é o `AnRow label="DDI · Integridade"` logo abaixo. O
           * painel acionável que morava nesta coluna repetia o mesmo rótulo na
           * mesma tela e criava uma seção que o desenho não tem.
           *
           * A tratativa da DDI não é do analista neste recorte: ela chega a
           * quem deve algo pela pendência ("DDI: emitir parecer" para a
           * Integridade, "DDI: enviar <documento>" para o LT), e o `DdiPanel`
           * mora dentro daquele ticket (`pendencia-ticket.tsx`) — não nesta
           * tela nem na visão do LT, de onde saiu.
           */}
        </div>

        {/* ── `.panel` — sticky side column ───────────────────────────── */}
        <aside
          data-testid="sneg-panel"
          className="flex flex-col gap-[14px] min-[961px]:sticky min-[961px]:top-4"
        >
          {/*
            Card 1 — Análises.

            ⚠️ É o MESMO componente da aprovação e da fase de contrato
            (ADO — 10/09/2026): a oportunidade não perde análise ao mudar de
            fase, e as três cópias que existiam já tinham divergido em pill,
            linha e recorte de permissão. Ver `AnalisesCard`.

            As três slices que esta tela já carrega vão por prop — sem elas o
            card releria os MESMOS números que a grade "Análise financeira", o
            card de documentos e o painel do parecer já mostram, e os dois
            blocos poderiam discordar enquanto um não recarregasse.
          */}
          <AnalisesCard
            opportunityId={opportunityId}
            codigo={codigo}
            refreshSignal={
              parecerRefresh + garantiaFlowRefresh + alcadaProntidaoRefresh
            }
            checklist={checklistParaCard}
            indicadores={indicators}
            parecer={parecerRow}
            loadViability={loadViability}
            loadDdi={loadDdi}
            loadCreditRisk={loadCreditRisk}
            loadGarantiaTrack={loadGarantiaTrack}
            loadAlcadaPreview={loadAlcadaPreview}
          />

          {/*
            Card 2 — Pendências.

            ⚠️ O contador é `totalAtivas`, NUNCA `total` (ADO 68150). `total`
            soma os quatro status, então uma oportunidade com uma única
            pendência já resolvida anunciava "Pendências · 1" e mandava o
            analista — ou o LT, que desde 25/08/2026 abre a MESMA tela via
            `AnaliseView` — procurar um trabalho já feito. Terceiro round do
            mesmo defeito: o card da 01b foi consertado no ADO 67882 e o do
            contrato já vinha filtrado do backend.

            ⚠️ E o veredito é do BACKEND, não um `filter(isPendenciaAtiva)`
            aqui: `getPendenciasResumo` pede `limit: 10`, então um filtro local
            responderia "as ativas desta página" (é o aviso literal do docblock
            de `PENDENCIA_STATUS_ATIVOS`). O round de 67882 pôde filtrar no
            cliente só porque lá a chamada é não paginada.

            A linha resolvida CONTINUA listada, esmaecida e com "resolvida" ao
            lado — é o protótipo desta tela (`01c-oportunidade-analise.html`:
            `.pend-i.done{opacity:.55}`, e `refreshPend()` contando só os sem
            `.done`), e é o rastro do que foi concluído. Com zero ativas o card
            diz isso em texto, para ninguém sair procurando.
          */}
          <Card
            title="Pendências"
            count={pendencias?.totalAtivas ?? undefined}
            hint={
              pendenciasStatus === 'loaded' &&
              pendencias &&
              pendencias.totalAtivas === 0 &&
              (pendencias.items ?? []).length > 0
                ? 'Nenhuma pendência em aberto.'
                : undefined
            }
          >
            {pendenciasStatus === 'loading' && (
              <div data-testid="pendencias-loading" className="space-y-2">
                <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
                <div className="h-8 animate-pulse rounded bg-(--neutral-100)" />
              </div>
            )}
            {pendenciasStatus === 'error' && (
              <p className="text-(length:--t-caption) text-(--color-danger)">
                Erro ao carregar pendências.
              </p>
            )}
            {pendenciasStatus === 'loaded' && pendencias && (
              <>
                {(pendencias.items ?? []).length === 0 ? (
                  <p className="text-(length:--t-caption) text-(--color-text-muted)">
                    Nenhuma pendência registrada.
                  </p>
                ) : (
                  <ul data-testid="pendencias-list">
                    {(pendencias.items ?? []).map((p) => {
                      const resolved =
                        p.status === 'Resolvida' || p.status === 'Cancelada';
                      return (
                        <li
                          key={p.id}
                          className={`flex items-start justify-between gap-2 border-t border-(--color-border) py-[9px] text-(length:--t-caption) first:border-t-0${
                            resolved ? ' opacity-55' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <b className="block truncate">{p.titulo}</b>
                            {routingLabel(p.responsavel, p.canal) && (
                              <span className="text-(--color-text-muted)">
                                {routingLabel(p.responsavel, p.canal)}
                              </span>
                            )}
                            {p.obrigatoria && !resolved && (
                              <span className="ml-1.5 inline-flex items-center rounded-full bg-(--yellow-100) px-1.5 py-0.5 text-[11px] font-bold text-(--yellow-700)">
                                Obrigatória
                              </span>
                            )}
                          </div>
                          {resolved ? (
                            <span className="shrink-0 text-(--color-text-muted)">
                              resolvida
                            </span>
                          ) : (
                            <Link
                              href={`/pendencias/${p.id}`}
                              className="shrink-0 font-bold text-(--secondary-600) hover:underline"
                            >
                              {/*
                                Mesmo predicado da lista `/pendencias`: este card
                                é a tela DA SNEG, e era onde o "Resolver" da
                                pendência do parecer da DDI mais enganava — quem
                                a emite é a Integridade (ADO 67911).
                              */}
                              {rotuloCtaPendencia(
                                podeResolverPendencia(
                                  p.acaoResolucao,
                                  can,
                                  // POSSE — veredito do backend (ADO 68190).
                                  p.resolucaoPermitida,
                                ),
                              )}
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/*
                  `encodeURIComponent` não é zelo: desde o ADO 67984 o código da
                  oportunidade é `PCR-<equipe>-<seq>/<ano>` e carrega uma BARRA,
                  que sem encoding trunca o valor do `?opp=` e o filtro chega ao
                  backend sem casar `o.code`. `opportunity-detail.tsx` já fazia.
                */}
                <Link
                  href={`/pendencias?opp=${encodeURIComponent(codigo)}`}
                  className="mt-2.5 flex w-full items-center justify-center rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2.25 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-50)"
                >
                  Abrir painel de pendências
                </Link>
              </>
            )}
          </Card>


        </aside>
      </div>

      {/*
       * ── `.sendbar` ────────────────────────────────────────────────────
       * Fixed bottom bar. Left: analysis state + hint; right: the two
       * prototype actions. "Enviar para aprovação" opens the prototype's
       * confirmation modal, whose "Continuar" fires GATE 2.
       */}
      <div
        data-testid="sneg-sendbar"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-(--color-border) bg-(--color-surface) shadow-[0_-2px_8px_rgba(0,0,0,.08)]"
        style={{
          paddingLeft: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
          paddingRight: 'max(24px, calc((100% - var(--grid-max)) / 2 + 24px))',
        }}
      >
        <div className="flex items-center justify-between gap-6 py-3">
          <div className="min-w-0 text-(length:--t-caption)">
            <b>{readiness ? readiness.statusAnalise : ANALISE_FASE_LABEL[a.fase]}</b>
            {liberarBlockReason && !readiness?.ready && (
              <span
                data-testid="liberar-block-reason"
                className="text-(--color-text-muted)"
              >
                {' · '}
                {liberarBlockReason}
              </span>
            )}
            {/*
              ADO 68233 — o de acordo do Diretor NOMEADO.

              ⚠️ Sem esta linha o override é silencioso: um bloqueio de
              integridade ou de perfil que estava de pé some da barra e nem a
              analista nem uma auditoria conseguem dizer pela tela por que a
              oportunidade passou. Um controle de compliance que se levanta sem
              deixar rastro é pior que um que não existe.

              `--yellow-700` é o "atenção" das telas SNEG (ADR-0018); nunca
              `--color-danger`, que leria como recusa.
            */}
            {readiness?.liberadoPorDeAcordoDiretor && (
              <span
                data-testid="liberado-por-de-acordo"
                className="text-(--yellow-700)"
              >
                {' · '}
                Pendência de análise liberada pelo de acordo do Diretor
                (Parecer - DE) anexado à oportunidade.
              </span>
            )}
          </div>

          {/*
           * As duas ações são da SNEG. Sem `canEdit` a barra fica INFORMATIVA
           * — nenhum botão —, seguindo o contrato de sendbar do repo: CTA que
           * nunca pode ser pressionado é controle morto, e um `disabled`
           * permanente aqui ainda sugeriria que falta algo na oportunidade
           * (ela pode estar pronta; quem não envia é o perfil).
           */}
          {canEdit && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                data-testid="btn-devolver"
                onClick={() => setDevolverOppOpen(true)}
                disabled={devolverLoading}
                className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-50) disabled:cursor-not-allowed disabled:opacity-60"
              >
                {devolverLoading ? 'Devolvendo…' : 'Devolver ao LT'}
              </button>

              <button
                type="button"
                data-testid="btn-liberar"
                onClick={() => setEnviarOpen(true)}
                disabled={liberarBlocked}
                title={liberarBlocked ? liberarBlockReason : undefined}
                className="rounded-[var(--radius-xxs)] border border-transparent bg-(--secondary-500) px-4 py-2 text-(length:--t-caption) font-bold text-white hover:bg-(--secondary-600) disabled:cursor-not-allowed disabled:opacity-50"
              >
                {liberarLoading ? 'Enviando…' : 'Enviar para aprovação'}
              </button>
            </div>
          )}
          {/*
           * Modo leitura com "Rejeitar / devolver" — ver `canDevolverSemEditar`.
           * Só a devolução; o envio para aprovação continua da SNEG.
           */}
          {canDevolverSemEditar && (
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                data-testid="btn-devolver"
                onClick={() => setDevolverOppOpen(true)}
                disabled={devolverLoading}
                className="rounded-[var(--radius-xxs)] border border-(--secondary-500) bg-(--neutral-25) px-4 py-2 text-(length:--t-caption) font-bold text-(--secondary-500) hover:bg-(--neutral-50) disabled:cursor-not-allowed disabled:opacity-60"
              >
                {devolverLoading ? 'Devolvendo…' : 'Devolver ao LT'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Enviar modal (prototype `#modalEnviar`) ──────────────────────── */}
      {enviarOpen && (
        <EnviarModal
          onContinuar={() => void handleLiberar()}
          onClose={() => setEnviarOpen(false)}
          loading={liberarLoading}
        />
      )}

      {/* ── Reatribuir modal ─────────────────────────────────────────────── */}
      {reatribuirOpen && (
        <ReatribuirModal
          onConfirm={handleReatribuir}
          onCancel={() => setReatribuirOpen(false)}
          loading={reatribuirLoading}
          searchAnalistas={searchAnalistas}
        />
      )}

      {/* ── Devolver a oportunidade INTEIRA (DEVOLVER_AO_LT) ────────────── */}
      {devolverOppOpen && (
        <DevolverOportunidadeModal
          onConfirm={(motivo) => void handleDevolverOportunidade(motivo)}
          onCancel={() => setDevolverOppOpen(false)}
          loading={devolverLoading}
          // A devolução por proposta ("Devolver" na linha) é só de quem edita.
          dicaPorProposta={canEdit}
        />
      )}

      {/* ── Devolver modal (per-proposal, RN-F2-03) ─────────────────────── */}
      {devolverOpen && (
        <DevolverModal
          proposals={proposals}
          initialProposalId={devolverInitialId}
          onConfirm={(proposalId, motivo) => void handleDevolver(proposalId, motivo)}
          onCancel={() => setDevolverOpen(false)}
          loading={devolverLoading}
        />
      )}

      {/* ── Toast container ──────────────────────────────────────────────── */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
}
