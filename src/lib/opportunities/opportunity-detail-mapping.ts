import { sapCodeFromBackend } from '@/lib/clients/customer-reference';
import { narrowIndicatorStatus } from '@/lib/opportunities-indicators/indicator-status';

import type { OpportunityDetail, OpportunityProposal, OpportunityStatus } from './types';
import { TIPO_NEGOCIACAO_LABEL, tipoContratoLabel } from '@/lib/picklists/salesforce-values';
import { ProposalStatus, isProposalStatus } from './types';
import {
  TIPO_PROPOSTA_LABEL,
  isTipoProposta,
} from '@/lib/proposals/franquia-proposal.types';

/**
 * Backend `GET/PATCH /v1/opportunities/:id` shape (Portuguese, F2 slice). Many
 * of the frontend {@link OpportunityDetail} fields (propostas, team,
 * franchises, indicadores…) are not produced by the backend yet — the BFF maps
 * the names it has and defaults the rest so the detail screen renders instead
 * of crashing on `data.propostas.filter(...)`.
 */
export interface BackendOpportunityDetail {
  id: string;
  code: string | null;
  customerId: string | null;
  /** `null` for a prospect (ADR-0055); absent from a backend older than it. */
  clienteCodigoSap?: string | null;
  customerName: string | null;
  titulo: string | null;
  tipoNegociacao: string;
  finalidade: string | null;
  areaVenda: string | null;
  centroLucro: string | null;
  /**
   * Janela de consumo derivada da proposta ELEITA (ADO 68242).
   *
   * A oportunidade NÃO tem colunas para estas datas — quem as responde é
   * `proposals.data_inicio_analise` / `data_fim_analise` (a janela de análise É
   * a de consumo, RN-F5-04), e o backend as deriva pela ordem de eleição.
   * `null` = nenhuma proposta eleita ainda.
   *
   * Opcional para o skew de deploy: um backend anterior a esta entrega não
   * manda o campo, e aí a tela volta ao travessão — comportamento anterior,
   * nunca uma data inventada.
   */
  janelaConsumo?: { inicio: string; fim: string } | null;
  /** `Escritorio_de_vendas_da_conta__c` — "Escritório de Venda" (`VREG3`…). */
  escritorioVendas?: string | null;
  /**
   * Bloco de cruzamento com o CRM — presente só com o vínculo em `CRIADO`.
   * `salesforceCode` é o `Opportunity.Name` lido de volta (o sequencial do org).
   */
  salesforce?: {
    salesforceId: string;
    salesforceCode: string;
    /** Deep link montado pelo backend (ADO 68142). */
    salesforceUrl?: string | null;
  } | null;
  /** `Gerencia_Do_Usuario__c` — "Área do Usuário" (`DCVIM`…). */
  areaUsuario?: string | null;
  clienteRecebedorId: string | null;
  pimAdesao?: boolean | null;
  possuiNovaImagemPista?: boolean | null;
  seraColocadaNovaImagemPista?: boolean | null;
  /** `Opportunity.Alteracao_Minuta_Padrao__c` — ADO 68438. */
  alteracaoMinutaPadrao?: boolean | null;
  descricaoAlteracaoMinutaPadrao?: string | null;
  descricao: string | null;
  briefing: string | null;
  /** "Parecer do LT" — ADO 68473. */
  parecerLt?: string | null;
  fase: string;
  criadoPorId: string | null;
  criadoPorNome: string | null;
  /**
   * Última devolução da oportunidade ao LT (`DEVOLVER_AO_LT`). O backend só a
   * envia enquanto a fase é de preenchimento — quem decide se é do ciclo
   * corrente é ele, não esta tela (`projetarDevolucaoAoLt`).
   */
  devolucaoAoLt?: {
    motivo: string;
    em: string;
    porNome: string | null;
  } | null;
  dataAbertura: string | null;
  dataConclusao: string | null;
  /**
   * TypeORM returns numeric columns as strings even though the DB type is
   * NUMERIC(10,4). The mapper parses this to a number so the front-end type
   * (`number | null`) stays coherent and `toLocaleString` formats correctly.
   */
  vmm: string | null;
  /**
   * Prazo do contrato em meses — derivado no backend do MAX da janela das
   * propostas eleitas. `number`, não string decimal: é contagem de meses.
   * Opcional para tolerar skew de deploy (backend anterior não o emite).
   */
  prazoContratoMeses?: number | null;
  indicadores: BackendFinancialIndicators | null;
  situacaoPosto: OpportunityDetail['situacaoPosto'];
  /**
   * Mapa da Rede do cliente. **Opcional no tipo** para o skew de deploy
   * degradar: backend anterior a esta entrega não manda a chave, e o card
   * mostra `—` em vez de quebrar.
   */
  mapaDaRede?: OpportunityDetail['mapaDaRede'];
  /**
   * Card "Totais - Recursos Financeiros". `null` = a oportunidade ainda não
   * passou da fase de preenchimento (quem decide é o backend). Opcional aqui só
   * por compatibilidade com fixtures de teste anteriores ao campo.
   */
  totaisRecursosFinanceiros?: BackendTotaisRecursosFinanceiros | null;
  /**
   * ADO 68009 — franquias eleitas fora do cálculo de royalties. Opcional aqui
   * por compatibilidade com fixtures anteriores ao campo; ausente ⇒ `null`, que
   * a nota lê como "não sei" e não renderiza.
   */
  franquiasSemRoyalty?: BackendFranquiaSemRoyalty[] | null;
  proposalIds: string[] | null;
  createdAt: string;
}

/**
 * The `indicadores` JSONB slot the backend fills after a consolidated
 * recalculation (`OpportunityIndicatorsService`). Declared explicitly because
 * the backend DTO types it as an opaque `Record<string, unknown>`: passing it
 * through raw compiled fine and shipped two defects — `tir` (a decimal ratio)
 * rendered as `0,35%` instead of `35%`, and the screen read a `bonificacao` key
 * the backend never writes, so "% bonificação antecipada" was permanently "—".
 * Names mirror the backend 1:1; the unit conversion belongs to the view.
 */
export interface BackendFinancialIndicators {
  tir?: number | null;
  vpl?: number | null;
  percentualAntecipacao?: number | null;
  /** Already a percentage (`11.05`), unlike `tir` — do NOT convert. */
  tma?: number | null;
  /**
   * R$/m³ — consolidated financial result per contracted m³ (from the ARP
   * snapshot). Surfaced in the "Análise financeira" card under the label
   * "Resultado R$/m³".
   */
  rsPorM3?: number | null;
  /** ISO-8601; written together with the numbers by the ARP callback worker. */
  calculadoEm?: string | null;
  /**
   * Lifecycle of the calculation, written into the same slot by
   * `OpportunityIndicatorsService` (VBR-401). Needed here because these three
   * numbers are also rendered outside the indicators panel ("Análise
   * financeira"), where `em_calculo` must stop them from reading as definitive.
   */
  status?: string | null;
  /**
   * Motivo do `indisponivel` — a mensagem que o ARP devolveu, ou a frase de
   * expiração. Escrito no mesmo slot pelo `OpportunityArpCallbackWorker`.
   */
  mensagemErro?: string | null;
}

/** Backend `GET /v1/opportunities/:id/proposals` list item (subset used here). */
export interface BackendProposalListItem {
  id: string;
  codigo: string | null;
  tipoContrato: string;
  finalidade: string;
  /**
   * SAP material code (PCR / ZBRM / ZLUB). May be absent on legacy records —
   * the mapper defaults to null (safe/unknown state, never to a guessed value).
   */
  tipoProposta?: string | null;
  /** `ProposalStatus` enum value; typed loose because it crosses the wire unvalidated. */
  status: string;
  /** Fill percentage (0–100) over the proposal's core scalar fields (F3). */
  preenchimentoPercent?: number | null;
  /** Reason the SNEG typed when returning the proposal (RN-F2-03). */
  motivoDevolucao?: string | null;
  /**
   * Status do cálculo de indicadores (TIR/VPL). Preenchido via LEFT JOIN em
   * `proposal_indicators` — single batch query, não N+1. `null` quando a
   * proposta nunca foi calculada (sem row); a pill não é renderizada.
   */
  indicatorStatus?: string | null;
  /**
   * Se a proposta está na composição da oportunidade (RN-F2-04) — o veredito da
   * "★ Eleita", decidido pelo backend. Opcional porque atravessa o fio sem
   * validação; ausente ⇒ não eleita (nunca o contrário).
   */
  eleita?: boolean;
}

const FINALIDADE_LABEL: Record<string, string> = {
  VINCULACAO: 'Vinculação',
  IMPLANTACAO: 'Implantação',
};

/**
 * Maps a backend proposal (F3 `POST/GET .../proposals`) to the
 * {@link OpportunityProposal} shape the opportunity-detail list renders.
 *
 * The backend status enum is carried through 1:1 — never translated into an
 * {@link OpportunityStatus}, which belongs to a different lifecycle and used to
 * collapse `EM_ANALISE`/`DEVOLVIDA` into "preenchimento" (a devolvida proposal
 * then read as "em análise" after a reload, breaking CA-F2-03).
 *
 * Fields the backend does not produce are mapped to `null`, never to an
 * invented value: `group` (bandeira/negócio). `fillPercent` now comes from the
 * backend (`preenchimentoPercent`, F3 core-fields completeness); absent ⇒ null
 * (the card omits the bar rather than showing a misleading 0%). `isElected`
 * comes from the backend's `eleita` (RN-F2-04) — it used to be resolved by the
 * caller from `proposalIds`, which left every other consumer of this listing
 * with a permanent `false`.
 *
 * `tipoProposta` is mapped from the backend's SAP material code (PCR/ZBRM/ZLUB).
 * An unknown/absent value maps to `null` (safe state) — never to the first
 * enum member. `group` is derived from `tipoProposta` when known, so the
 * bandeira label (e.g. "Franquia BR Mania") is always the enum display label,
 * never an invented string.
 */
export function mapProposalListItem(p: BackendProposalListItem): OpportunityProposal {
  // Unknown tipoProposta → null (safe state; caller reads null as "unknown",
  // never as PCR or any other default).
  const tipoProposta = isTipoProposta(p.tipoProposta) ? p.tipoProposta : null;

  // group = bandeira/negócio display label derived from the canonical enum.
  // null when tipoProposta is unknown (no invented fallback).
  const group = tipoProposta !== null ? TIPO_PROPOSTA_LABEL[tipoProposta] : null;

  return {
    id: p.id,
    code: p.codigo ?? `P-${p.id.slice(0, 8).toUpperCase()}`,
    // `tipoContrato` is the Salesforce API name ("CPCVM Volume"); the screen
    // shows the catalog LABEL ("CPCVM Volume Total"). Unmapped values fall back
    // to the raw value, so a gap stays visible.
    title: [FINALIDADE_LABEL[p.finalidade] ?? p.finalidade, tipoContratoLabel(p.tipoContrato)]
      .filter(Boolean)
      .join(' · '),
    group,
    tipoProposta,
    // Unknown value ⇒ the safest state (no destructive CTA is gated on it).
    status: isProposalStatus(p.status) ? p.status : ProposalStatus.EmPreenchimento,
    // Backend F3 completeness over the proposal's core fields. Absent/unknown ⇒
    // null so the card omits the bar (a 0% bar would read as "nada preenchido").
    fillPercent:
      typeof p.preenchimentoPercent === 'number' ? p.preenchimentoPercent : null,
    // RN-F2-03: what the SNEG asked for, so the LT card says it instead of the
    // generic "a SNEG pediu ajuste nesta proposta".
    returnReason: p.motivoDevolucao ?? null,
    // RN-F2-04: verdict from the backend, which is the only place that knows
    // the opportunity's composition. Absent ⇒ false (safe state).
    isElected: p.eleita === true,
    // F7: unknown member ⇒ null (safe state), same guard as `indicadores.status`.
    // Never defaults to `atualizado` — stale numbers must not read as current.
    indicatorStatus: narrowIndicatorStatus(p.indicatorStatus),
  };
}

const PHASE_TO_STATUS: Record<string, OpportunityStatus> = {
  NOVOS: 'preenchimento',
  EM_PREENCHIMENTO: 'preenchimento',
  EM_ANALISE: 'análise',
  EM_APROVACAO: 'aprovação',
  // Minuta is the first contract sub-phase (CTR-2) — the stepper highlights it.
  EM_MINUTA: 'contrato',
  EM_ASSINATURA: 'contrato',
  EM_PAGAMENTO: 'contrato',
  CONCLUIDA: 'concluída',
};

// Shared with the list route: `CONTRATACAO` alone left every new opportunity
// (now created as `NEG`) rendering its raw machine value on screen.
const TIPO_LABEL: Record<string, string> = TIPO_NEGOCIACAO_LABEL;

export function mapOpportunityDetail(b: BackendOpportunityDetail): OpportunityDetail {
  return {
    id: b.id,
    code: b.code ?? '',
    title: b.titulo ?? '',
    description: b.descricao,
    briefing: b.briefing,
    parecerLt: b.parecerLt ?? null,
    finalidade: b.finalidade,

    clientId: b.customerId ?? '',
    clientSapCode: sapCodeFromBackend(b),
    clientName: b.customerName ?? '',
    // Not carried by the F2 detail projection yet.
    clientDocument: null,
    clientRecebedorId: b.clienteRecebedorId,
    clientRecebedorName: null,
    // `?? null` e não `?? false`: "não respondido" e "respondeu Não" são fatos
    // diferentes, e o Salesforce só aceita o campo quando alguém respondeu.
    pimAdesao: b.pimAdesao ?? null,
    // `null` é "não respondido" e NÃO é `false` — o Salesforce só aceita o
    // campo quando há resposta, e a alçada recusa enquanto estiver em branco.
    possuiNovaImagemPista: b.possuiNovaImagemPista ?? null,
    seraColocadaNovaImagemPista: b.seraColocadaNovaImagemPista ?? null,
    /*
     * ADO 68438. `?? null` é "não respondido" — a tela renderiza `—`, nunca
     * "Não": afirmar "Não" sobre o campo vazio é o defeito que o ticket
     * corrigiu do lado do Salesforce, e repeti-lo aqui o traria de volta.
     */
    alteracaoMinutaPadrao: b.alteracaoMinutaPadrao ?? null,
    descricaoAlteracaoMinutaPadrao:
      b.descricaoAlteracaoMinutaPadrao ?? null,

    type: TIPO_LABEL[b.tipoNegociacao] ?? b.tipoNegociacao,
    status: PHASE_TO_STATUS[b.fase] ?? 'preenchimento',
    // Exact backend state, for the transition optimistic-lock token.
    backendState: b.fase,
    salesZone: b.areaVenda,
    companyGroup: null,
    franchises: [],
    profitCenters: b.centroLucro,
    // Bug 67589 — abre a barra "Equipe da oportunidade"; o backend snapshota o
    // campo na criação (`Opportunity.escritorioVendas`).
    salesOffice: b.escritorioVendas ?? null,
    /*
     * ADO 68142 — o identificador do Salesforce replicado do nosso lado.
     *
     * O campo já vinha no payload do backend (`OpportunityDto.salesforce`,
     * "para cruzamento de suporte") e era DESCARTADO aqui, então o sequencial
     * que o org atribui (`4567384`) não aparecia em tela nenhuma: quem estava
     * no Salesforce não tinha como chegar à oportunidade, e quem estava aqui não
     * tinha como chegar ao registro do org. Mesmo defeito — e mesma correção —
     * do `areaUsuario` logo abaixo.
     *
     * Só o CÓDIGO viaja como TEXTO. `salesforceId` (`0068800001Gt0KFAAZ`) é
     * valor de máquina: colocá-lo na tela poria um id de 18 chars onde se
     * espera um número de negócio — e continua fora do modelo de tela.
     *
     * ⚠️ O que passou a viajar é o `salesforceUrl`, e ele NÃO contradiz a regra
     * acima: o id vive dentro do `href` (é o endereço do registro, não dá para
     * endereçá-lo sem ele) e nunca é renderizado como valor.
     */
    salesforceCode: b.salesforce?.salesforceCode ?? null,
    salesforceUrl: b.salesforce?.salesforceUrl ?? null,
    /*
     * "Área do usuário" (`Gerencia_Do_Usuario__c`). O campo já vinha no payload
     * do backend e era DESCARTADO aqui — por isso o modal "Dados da proposta"
     * mostrava `—` enquanto a integração enviava `DCVIM` ao Salesforce.
     *
     * A tela de criação da proposta lê daqui porque a proposta ainda não
     * existe, e as duas gravam a MESMA gerência na criação (a oportunidade
     * nasce primeiro). ⚠️ No dia em que a gerência virar resolução por usuário
     * essa igualdade deixa de valer, e a tela de criação precisa passar a ler um
     * prefill/eco do POST.
     */
    areaUsuario: b.areaUsuario ?? null,

    // TypeORM returns numeric columns as strings; parse to keep the front-end
    // type (`number | null`) coherent and `toLocaleString` formatting correct.
    vmm: b.vmm != null ? parseFloat(b.vmm) : null,
    /*
     * Prazo do contrato (08/09/2026) — número JSON, não string decimal como o
     * `vmm`: é uma contagem de meses, então o backend o serializa como `number`
     * e não há precisão a preservar. `?? null` porque o campo pode faltar num
     * skew de deploy, e aí o card mostra travessão.
     */
    prazoContratoMeses: b.prazoContratoMeses ?? null,
    indexRealLitro: null,
    /*
     * ADO 68242 — a janela de consumo, derivada pelo backend da proposta
     * ELEITA.
     *
     * Eram `null` **chumbado**, e a linha "Datas de início/fim de consumo" do
     * card exibia `—` para toda oportunidade — inclusive as que tinham a janela
     * preenchida na proposta ao lado e mandada ao Salesforce a cada
     * sincronização de cotação. Medido em staging na `PCR-CEARA-000077/2026`.
     *
     * ⚠️ Datas de CALENDÁRIO (`YYYY-MM-DD`), nunca instantes: quem as formata
     * usa o formatador de calendário, senão em Brasília a janela aparece um dia
     * antes (o defeito que a validade do documento do repositório já custou —
     * ADO 67993).
     */
    startDate: b.janelaConsumo?.inicio ?? null,
    endDate: b.janelaConsumo?.fim ?? null,
    estimatedValue: null,

    createdAt: b.createdAt,
    dataAbertura: b.dataAbertura,
    dataConclusao: b.dataConclusao,
    // "Criado por" / "Responsável" show the creator's name (snapshotted at
    // creation), not the raw id. Empty on legacy rows without a snapshot — the
    // UI renders "—". No separate owner concept yet, so owner mirrors creator.
    /*
     * Passa VERBATIM: o recorte por fase é do backend, e refazê-lo aqui criaria
     * um segundo dono para a pergunta "esta devolução ainda é do ciclo atual?".
     * `undefined` (payload antigo) vira `null` — a tela testa `!= null`.
     */
    devolucaoAoLt: b.devolucaoAoLt ?? null,
    createdBy: b.criadoPorNome ?? '',
    owner: b.criadoPorNome ?? '',
    ownerRole: '',

    // Backend does not return proposal/team objects in this slice — default to
    // empty so the UI's `.filter`/`.reduce`/`.length`/`.map` never crash. The
    // proposal objects are fetched separately (GET .../proposals); the composed
    // ids come through here to resolve which are elected.
    team: [],
    propostas: [],
    proposalIds: b.proposalIds ?? [],

    indicadores: mapIndicadores(b.indicadores),
    situacaoPosto: b.situacaoPosto ?? null,
    mapaDaRede: b.mapaDaRede ?? null,
    /*
     * `?? null` (nunca `?? {…zeros}`): o backend responde `null` justamente
     * quando o card NÃO se aplica — antes da fase de análise —, e um objeto de
     * zeros ali faria o card renderizar seis `R$ 0,00` na tela de preenchimento,
     * afirmando que a oportunidade não tem recurso financeiro nenhum. Os campos
     * são mapeados um a um, e não por passthrough: o passthrough compila e
     * quebra só em runtime.
     */
    totaisRecursosFinanceiros: mapTotaisRecursosFinanceiros(b.totaisRecursosFinanceiros),
    franquiasSemRoyalty: mapFranquiasSemRoyalty(b.franquiasSemRoyalty),
  };
}

/**
 * Backend `TotaisRecursosFinanceirosDto` — os seis totais, mesmos nomes.
 *
 * Declarada explicitamente (e não como passthrough) pela razão que o
 * `BackendFinancialIndicators` registra: um passthrough compila e falha só em
 * runtime, renderizando campo vazio. Cada campo é nullable **na borda** porque
 * o que chega é JSON: o backend sempre manda os seis quando o card se aplica,
 * mas um payload de versão antiga não pode derrubar a tela.
 */
export interface BackendTotaisRecursosFinanceiros {
  bonificacaoAntecipadaComNovoMutuoBRL?: number | null;
  totalRecursoFinanceiroMutuoBRL?: number | null;
  totalBonificacaoDesempenhoBRL?: number | null;
  mutuoComAntecipacaoENovoMutuoBRL?: number | null;
  valorTotalBonificacaoComNovoMutuoBRL?: number | null;
  valorTotalRecursosFinanceirosBRL?: number | null;
}

/**
 * Slot ausente ⇒ `null`, e o card não renderiza.
 *
 * ⚠️ Campo ausente DENTRO de um slot presente vira `null`, **não `0`**: o card
 * mostra `—` para ele. `0` é resposta ("somou zero"), e fabricá-lo aqui
 * afirmaria uma soma que o backend não mandou — a distinção que este repo
 * persegue desde o `% Antecipação` (CA-4).
 */
function mapTotaisRecursosFinanceiros(
  b: BackendTotaisRecursosFinanceiros | null | undefined,
): OpportunityDetail['totaisRecursosFinanceiros'] {
  if (!b) return null;
  return {
    bonificacaoAntecipadaComNovoMutuoBRL: b.bonificacaoAntecipadaComNovoMutuoBRL ?? null,
    totalRecursoFinanceiroMutuoBRL: b.totalRecursoFinanceiroMutuoBRL ?? null,
    totalBonificacaoDesempenhoBRL: b.totalBonificacaoDesempenhoBRL ?? null,
    mutuoComAntecipacaoENovoMutuoBRL: b.mutuoComAntecipacaoENovoMutuoBRL ?? null,
    valorTotalBonificacaoComNovoMutuoBRL: b.valorTotalBonificacaoComNovoMutuoBRL ?? null,
    valorTotalRecursosFinanceirosBRL: b.valorTotalRecursosFinanceirosBRL ?? null,
  };
}

/** Forma crua de `OpportunityDto.franquiasSemRoyalty` (ADO 68009). */
export interface BackendFranquiaSemRoyalty {
  proposalId: string;
  codigo: string | null;
  bandeira: string;
  faltando: string[] | null;
}

/**
 * Campo ausente ⇒ `null` ("não sei"), lista presente ⇒ lista mapeada — inclusive
 * `[]`, que é a afirmação "nenhuma franquia ficou de fora".
 *
 * ⚠️ Os dois NÃO se colapsam: `null` esconde a nota porque não se sabe, `[]`
 * esconde a nota porque não há o que dizer. Tratá-los igual funcionaria hoje e
 * mentiria no dia em que a nota precisar distinguir os casos.
 */
function mapFranquiasSemRoyalty(
  b: BackendFranquiaSemRoyalty[] | null | undefined,
): OpportunityDetail['franquiasSemRoyalty'] {
  if (!Array.isArray(b)) return null;
  return b.map((f) => ({
    proposalId: f.proposalId,
    codigo: f.codigo ?? null,
    bandeira: f.bandeira,
    faltando: Array.isArray(f.faltando) ? f.faltando : [],
  }));
}

/**
 * Absent slot ⇒ `null` (the screen renders the "not calculated yet" state); a
 * present slot keeps each field independently nullable, so a partial snapshot
 * degrades field by field instead of hiding the whole block.
 */
function mapIndicadores(
  b: BackendFinancialIndicators | null | undefined,
): OpportunityDetail['indicadores'] {
  if (!b) return null;
  return {
    tir: b.tir ?? null,
    vpl: b.vpl ?? null,
    percentualAntecipacao: b.percentualAntecipacao ?? null,
    tma: b.tma ?? null,
    rsPorM3: b.rsPorM3 ?? null,
    calculadoEm: b.calculadoEm ?? null,
    mensagemErro: b.mensagemErro ?? null,
    // Unknown member ⇒ null (safe state), never a default to the first one.
    status: narrowIndicatorStatus(b.status),
  };
}
