// ---------------------------------------------------------------------------
// Types for the SNEG "Análise da proposta" shell (F1/F4/F7)
// API contracts: BE-1, BE-4, BE-6
// ---------------------------------------------------------------------------

import type { AcaoResolucao } from '@/lib/pendencias/types';

// ---------------------------------------------------------------------------
// GET /v1/opportunities/:opportunityId/analise
// Mirrors AnaliseSnegDto in apps/api/openapi.yaml — do NOT hand-invent fields
// here; any change starts in the backend DTO and is mirrored in openapi.yaml
// first (VBR-271).
// ---------------------------------------------------------------------------

/** Mirrors `AnalistaDto` (openapi.yaml). */
export interface AnalistaSneg {
  id: string;
  nome: string;
  email: string;
}

/**
 * Analysis sub-phase — mirrors the backend `AnaliseFase` enum
 * (`apps/api/src/analise/domain/analise-fase.enum.ts`), 5 values (RN-F1-04).
 */
export type AnaliseFase =
  | 'em_analise'
  | 'com_pendencia'
  | 'devolvida'
  | 'concluida'
  | 'liberada';

/**
 * pt-BR labels — mirror of the backend's ANALISE_FASE_LABEL
 * (`apps/api/src/analise/domain/analise-fase-label.ts`). Keep in sync.
 */
export const ANALISE_FASE_LABEL: Record<AnaliseFase, string> = {
  em_analise: 'Em análise',
  com_pendencia: 'Com pendência',
  devolvida: 'Devolvida ao LT',
  concluida: 'Concluída',
  liberada: 'Liberada para aprovação',
};

/**
 * SNEG analysis context for a given opportunity.
 * Mirrors `AnaliseSnegDto` (openapi.yaml — GET /v1/opportunities/{opportunityId}/analise).
 */
export interface AnaliseSneg {
  id: string;
  opportunityId: string;
  /** Business code, e.g. "OPP-0428". Null until assigned. */
  oportunidadeCodigo: string | null;
  clienteNome: string | null;
  tipoNegociacao: string | null;
  totalPropostas: number;
  /** Display titles of the proposals, e.g. ["P-1115", "Proposta 2"]. */
  propostasTitulos: string[];
  /** True once the SNEG technical opinion has been emitted (A06/F7). */
  parecerEmitido: boolean;
  analista: AnalistaSneg | null;
  gerencia: string | null;
  tipoProposta: string | null;
  fase: AnaliseFase;
  /** True when the gerência has no analyst configured (RN-F1-01). */
  atribuicaoPendente: boolean;
  distribuidaEm: string | null;
  distribuidaPorId: string | null;
  distribuidaPorNome: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// BE-4 — GET /v1/opportunities/:id/analise/padrao-bp
// ---------------------------------------------------------------------------

export type TravaBPStatus = 'ok' | 'alerta' | 'pendente';

/**
 * How the row renders in the "Padrão de BP & filtro econômico" card, decided by
 * the mapper (never by the view):
 *
 * - `medida` — a measured number, shown as plain bold text (`<b>R$ 16,7/m³</b>`
 *   in the prototype): a measurement is not a verdict, so it carries no color;
 * - `veredito` — a verdict, shown as a {@link StatusPill} colored by `status`
 *   (the prototype's `pill w` on "Com desvio").
 */
export type TravaBPDisplay = 'medida' | 'veredito';

export interface TravaBP {
  /** Display label, e.g. "Padrão de negócio (BP)". */
  descricao: string;
  status: TravaBPStatus;
  display: TravaBPDisplay;
  /** Optional complementary value, e.g. "Padrão" or "Exceção". */
  valor?: string;
}

/**
 * BP standardisation and economic filter data.
 *
 * API Contract — BE-4 (épico VBR-255):
 *
 *   GET /v1/opportunities/:id/analise/padrao-bp
 *   Response 200: PadraoBPResult
 */
export interface PadraoBPResult {
  travas: TravaBP[];
}

// ---------------------------------------------------------------------------
// BE-6 — GET /v1/opportunities/:id/analise/approval-readiness
// ---------------------------------------------------------------------------

export interface DependenciaObrigatoria {
  descricao: string;
  ok: boolean;
}

/**
 * Pre-flight readiness check for the SNEG "Liberar para aprovação" action.
 *
 * API Contract — BE-6 (épico VBR-255):
 *
 *   GET /v1/opportunities/:id/analise/approval-readiness
 *   Response 200: ApprovalReadiness
 */
export interface ApprovalReadiness {
  ready: boolean;
  statusAnalise: string;
  /**
   * Um bloqueio de ANÁLISE (integridade ou perfil) foi levantado pelo
   * *de acordo do Diretor* (ADO 68233).
   *
   * ⚠️ **Rótulo, nunca veredito** — quem libera é `ready`/`bloqueios`. Existe
   * para a barra NOMEAR o override: um controle de compliance que se levanta
   * sem deixar rastro na tela é pior que um que não existe.
   */
  liberadoPorDeAcordoDiretor: boolean;
  dependenciasObrigatorias: DependenciaObrigatoria[];
  /** e.g. "Alçada N3 — Diretoria" */
  nivelAlcada: string | null;
  /** Human-readable reasons that block release; empty when ready. */
  bloqueios: string[];
  /**
   * How many mandatory pendências are still open, as counted by the backend.
   * Feeds the informative note on the parecer card — the trava itself is on
   * F7 (RN-F7-02), never on generating the parecer.
   */
  pendenciasObrigatoriasAbertas: number;
  /**
   * Quantos documentos anexados a SNEG ainda não validou, como o backend conta
   * (itens de checklist em `anexado`). Alimenta a linha de dependência do
   * painel; a trava em si é do GATE 2 (PRD SNEG v1.0 §7 F7).
   */
  documentosAguardandoValidacao: number;
  /**
   * Os TIPOS que aguardam conferência, nomeados pelo backend — as mesmas strings
   * que rotulam a linha do checklist (ADO 01/09/2026).
   *
   * É o que permite a recusa NOMEAR o documento em vez de mandar o analista
   * procurar: o card do workspace mostra 6 de N linhas e o resto vira um
   * `+ N outros documentos` que não expande.
   *
   * `[]` é "nenhum aguardando" **ou** backend anterior à entrega — nos dois casos
   * a frase degrada para a forma genérica, que é honesta.
   */
  documentosAguardandoValidacaoTipos: string[];
  /**
   * As BANDEIRAS das franquias eleitas que ainda devem o parecer antecipado ao
   * time de franquias (ADO 68478).
   *
   * É o mesmo conjunto que a pendência `franquia:parecer` cobra no card ao lado
   * — o ticket foi aberto justamente porque o card cobrava e o gate liberava.
   *
   * `[]` é "nenhuma pendente" **ou** backend anterior à entrega; nos dois casos
   * a frase degrada para a forma genérica, sem afirmar bandeira nenhuma.
   */
  franquiaParecerPendenteBandeiras: string[];
}

// ---------------------------------------------------------------------------
// Reatribuir analista — POST /v1/opportunities/:opportunityId/analise/reatribuir
// Mirrors ReatribuirAnalistaDto (openapi.yaml). The assignment references the
// analyst's id (Entra OID) — never a typed name (SOX non-repudiation, RN-F1-02).
// ---------------------------------------------------------------------------

export interface ReatribuirAnalistaPayload {
  /** Entra OID of the new responsible SNEG analyst. */
  analistaId: string;
  /** Optional reason, recorded in the SOX audit trail. */
  motivo?: string;
}

// ---------------------------------------------------------------------------
// Panel pendency item (subset of PendenciaSummary used in the side panel)
// ---------------------------------------------------------------------------

export interface PendenciaPanelItem {
  id: string;
  titulo: string;
  responsavel: string | null;
  canal: string | null;
  /** "Aberta" | "Em tratativa" | "Resolvida" | "Cancelada" */
  status: string;
  /** Whether this pendency is mandatory (blocks release when open). */
  obrigatoria: boolean;
  /**
   * Resolution flow derived by the backend — carried here so the card's CTA can
   * tell "Resolver" from "Abrir" (ADO 67911). Absent against an older backend.
   */
  acaoResolucao?: AcaoResolucao;
  /**
   * POSSE — este perfil pode ENCERRAR a pendência? Veredito do backend
   * (ADO 68190), carregado até aqui pela mesma razão de `acaoResolucao`: o card
   * do workspace e a lista `/pendencias` decidem o CTA pelo MESMO predicado, e
   * um deles sem o campo voltaria a prometer "Resolver" no que a API recusa.
   */
  resolucaoPermitida?: boolean;
}

export interface PendenciasPanelResult {
  /**
   * As pendências da oportunidade — **incluindo as resolvidas**, que o card
   * lista esmaecidas com "resolvida" ao lado (protótipo `01c`:
   * `.pend-i.done{opacity:.55}`). É o rastro do que já foi feito.
   */
  items: PendenciaPanelItem[];
  /** Todas as linhas do filtro, nos quatro status. Governa paginação, não tela. */
  total: number;
  /**
   * Quantas ainda PEDEM AÇÃO — o número que o card exibe (ADO 68150).
   *
   * Veredito do backend: a chamada é paginada (`limit: 10` em
   * `getPendenciasResumo`), então contar `items` aqui daria "as ativas desta
   * página". Era `total` que o card exibia, e por isso uma oportunidade com uma
   * única pendência já resolvida anunciava "Pendências · 1".
   */
  totalAtivas: number;
}

// ---------------------------------------------------------------------------
// Viability / Triagem — GET /v1/opportunities/:opportunityId/analise/viabilidade
// Mirrors ViabilidadeResponseDto (openapi.yaml). Consolidated here from
// lib/sneg/sneg-analysis.types.ts (VBR-273 — single domain data module).
// ---------------------------------------------------------------------------

/**
 * Resultado de viabilidade retornado pela análise automática de triagem (F2).
 * - OK      → pill success (verde)
 * - ATENCAO → pill warning (amarelo)
 * - INVIAVEL → pill danger (vermelho)
 */
export type ViabilidadeResultado = 'OK' | 'ATENCAO' | 'INVIAVEL';

/** Severity of a policy/trava warning (RN-F2-02). */
export type AvisoSeveridade = 'INFO' | 'AVISO' | 'CRITICO';

/** A single evaluated viability criterion (RN-F2-01). */
export interface CriterioAvaliado {
  /** Stable code of the criterion in the DCVIM catalog (e.g. 'TIR-MIN'). */
  codigo: string;
  titulo: string;
  resultado: ViabilidadeResultado;
  /** Evaluated value for this proposal — null when not available. */
  valorAvaliado: number | null;
  /** Reference threshold from the DCVIM catalog — null when not fixed. */
  referencia: number | null;
}

/** A policy/trava warning applicable to the proposal (RN-F2-02). */
export interface AvisoPolitica {
  codigo: string;
  severidade: AvisoSeveridade;
  mensagem: string;
  /** When true, this warning raises the suggested approval level (F5/F7). */
  elevaAlcada: boolean;
}

/** Viability data — mirrors the backend ViabilidadeResponseDto. */
export interface SnegViability {
  /** Aggregated result — worst criterion wins: inviavel > atencao > ok. */
  resultado: ViabilidadeResultado;
  criterios: CriterioAvaliado[];
  /** Empty array when no policy is triggered. */
  avisos: AvisoPolitica[];
}

// ---------------------------------------------------------------------------
// Proposal analysis state (block "Propostas em análise")
//
// There is no analysis-specific proposal status type here on purpose: the block
// renders the backend `ProposalStatus` enum (`lib/opportunities/types.ts`)
// directly. A parallel frontend status type invited a local derivation and a
// second source of truth for RN-F2-03.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Solicitar Ajuste — POST /v1/proposals/:id/solicitar-ajuste
// ---------------------------------------------------------------------------

/**
 * Result returned by POST /v1/proposals/:id/solicitar-ajuste.
 * The new pendência ID is used to update the lateral card (pendências panel).
 */
export interface SolicitarAjusteResult {
  pendenciaId: string;
}

// ---------------------------------------------------------------------------
// Consumed Analyses (block "Análises consumidas")
// ---------------------------------------------------------------------------

/** Variant for pills inside the "Análises consumidas" block. */
export type ConsumedAnalysisPillVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

/** Load status for a single consumed analysis item. */
export type ConsumedAnalysisStatus = 'loading' | 'loaded' | 'unavailable';

// ---------------------------------------------------------------------------
// Conferência do preenchimento — GET /v1/opportunities/:id/analise/conferencia
// (VBR-278 — RN-F1-03 / CA-F1-02). The backend evaluates the proposal against
// the sneg_campos_obrigatorios parametrization; the FE only renders the verdict.
// ---------------------------------------------------------------------------

/** Proposal-form block a required campo belongs to (BlocoAjuste vocabulary). */
export type ConferenciaBloco =
  | 'dados'
  | 'situacao'
  | 'fotos'
  | 'produtos'
  | 'recursos'
  | 'financeiro';

export interface ConferenciaCampo {
  campo: string;
  label: string;
  bloco: ConferenciaBloco;
  preenchido: boolean;
  valorResumo: string | null;
}

export interface ConferenciaProposta {
  proposalId: string;
  codigo: string | null;
  tipoProposta: 'POSTO' | 'FRANQUIA';
  completo: boolean;
  faltantes: number;
  campos: ConferenciaCampo[];
}

export interface ConferenciaResult {
  opportunityId: string;
  propostas: ConferenciaProposta[];
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/** Thrown when devolver returns 400 (validation). */
export class DevolverValidationError extends Error {
  constructor(message = 'Motivo de devolução inválido.') {
    super(message);
    this.name = 'DevolverValidationError';
  }
}

/** Thrown when solicitar-ajuste comment is empty (client-side validation). */
export class SolicitarAjusteValidationError extends Error {
  constructor() {
    super('O comentário é obrigatório para solicitar ajuste.');
    this.name = 'SolicitarAjusteValidationError';
  }
}

/** Thrown when solicitar-ajuste returns 400 from the backend. */
export class SolicitarAjusteError extends Error {
  constructor(message = 'Falha ao solicitar ajuste.') {
    super(message);
    this.name = 'SolicitarAjusteError';
  }
}

// ---------------------------------------------------------------------------
// Alçada preview — GET /v1/opportunities/:opportunityId/analise/alcada-preview
// Mirrors AlcadaPreview (openapi.yaml) — RN-F7-03 / A31 (VBR-290).
// ---------------------------------------------------------------------------

/** A single reason contributing to the suggested approval-level elevation. */
export interface AlcadaMotivo {
  codigo: string;
  mensagem: string;
  origem: 'politica' | 'bp';
}

/**
 * Approval-level preview shown during proposal filling.
 *
 * `nivel` é o TOPO da cadeia que o Salesforce simulou — a mesma fonte que o
 * parecer e o approval-readiness leem, então as três nunca divergem (ADO 68241).
 *
 * ⚠️ Quando `nivel` é `null`, a ausência vem NOMEADA pelo backend em
 * `nivelIndisponivelRotulo` (curto, para a linha do card) e
 * `nivelIndisponivelMotivo` (a frase que diz o que destrava). A tela renderiza
 * esse veredito — **nunca** o deriva: "—" sozinho não diz se falta acionar a
 * alçada, se ela está simulando ou se o org não indicou nível nenhum, e era
 * exatamente essa mudez que o ticket reportou.
 */
export interface AlcadaPreview {
  alcadaElevada: boolean;
  nivel: { nivel: string; descricao: string | null } | null;
  nivelIndisponivelRotulo: string | null;
  nivelIndisponivelMotivo: string | null;
  motivos: AlcadaMotivo[];
  /** Sobre a análise de padrão de BP — NÃO confundir com `nivelIndisponivelMotivo`. */
  indisponivelMotivo: string | null;
}

/**
 * 404 de `GET .../analise` — a análise SNEG ainda NÃO EXISTE (ADO 68256).
 *
 * Tipo próprio porque este 404 **não é falha**, e o shell precisa distinguir:
 *
 * - antes do GATE 1 a análise não tem por que existir;
 * - depois dele é uma inconsistência que a plataforma repara sozinha (o
 *   `SnegDistribuicaoCatchUpWorker` abre a linha que falta em até 60 s).
 *
 * Nos dois casos nada quebrou, e a tela inteira virava uma caixa VERMELHA
 * dizendo *"Falha ao carregar a análise SNEG (404)"* — para todo perfil, porque
 * o workspace é a tela da oportunidade nessa fase. Medido em staging na
 * `OPP-2026-000004`, pelo perfil Integridade.
 *
 * A `message` é a frase do BACKEND, verbatim: é ele que sabe em que fase a
 * oportunidade está, e é ela que nomeia o conserto (aguardar e recarregar, ou
 * voltar). Ver `AnaliseSnegService.analiseAusente`.
 */
export class AnaliseNaoAbertaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnaliseNaoAbertaError';
  }
}
