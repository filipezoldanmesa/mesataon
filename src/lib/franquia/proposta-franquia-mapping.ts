/**
 * BFF anti-corruption mapping for
 * `GET /v1/opportunities/:opportunityId/franquia/:proposalId/contrato` (FRQ-9).
 *
 * The whole screen renders from this one payload (GAR-16 pattern), so the whole
 * payload is mapped here — one endpoint, one mapper. Rules applied:
 *
 *  - Never a passthrough: every field is named explicitly, so a backend rename
 *    breaks the build instead of rendering an empty cell at runtime
 *    (CLAUDE.md §"BFF nunca faz passthrough cru").
 *  - Every enum goes through its type guard; an unknown value becomes `null`,
 *    and the UI omits the element. It never becomes the first enum member.
 *  - `FrqSectionResult` discriminant (`status: 'ok' | 'unavailable'`) is kept
 *    intact so a single failing source degrades only its own card.
 *  - No defaults invented here: what the backend does not produce travels as
 *    `null` (CLAUDE.md §"Mock no front nunca — nem disfarçado de default").
 *
 * @see apps/api/src/franquia/read-model/proposta-franquia-read-model.domain.ts
 */

import {
  BandeiraFranquia,
  isBandeiraFranquia,
  isFormatoLoja,
  isFrqPillCode,
  isModeloNegocio,
  isModeloRoyalty,
  isResultadoParecerFranquia,
  isSituacaoLoja,
  isStatusCof,
  type FormatoLoja,
  type FrqPillCode,
  type ModeloNegocio,
  type ModeloRoyalty,
  type ResultadoParecerFranquia,
  type SituacaoLoja,
  type StatusCof,
} from './types';
import { isProposalStatus, type ProposalStatus } from '@/lib/opportunities/types';

// ---------------------------------------------------------------------------
// Backend contract (wire shape — `Date` fields arrive as ISO strings)
// ---------------------------------------------------------------------------

export interface BackendFrqSectionResult<T> {
  status: 'ok' | 'unavailable';
  data: T | null;
  error?: string;
}

export interface BackendDadosFranquia {
  franquiaId: string;
  proposalId: string;
  opportunityId: string;
  bandeira: string;
  bandeiraLabel: string;
  statusProposta: string;
  statusPropostaLabel: string;
  statusPropostaPill: string;
  situacaoLoja: string | null;
  situacaoLojaLabel: string | null;
  tipoImplantacao: string | null;
  codigoMaterialSap: string | null;
  observacoes: string | null;
  inicioOperacaoPrevista: string | null;
  postoProposalId: string | null;
  postoVinculoLabel: string | null;
  finalidade: string | null;
  evNome: string | null;
}

export interface BackendFapDocumentoInfo {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackendFapPotencial {
  faturamentoPropostoBrl: string | null;
  faturamentoDeAcordoComFap: boolean | null;
  fapBrl: string | null;
  potencialBrl: string | null;
  possuiExcecaoRoyalties: boolean | null;
  shareTabacoPerc: string | null;
  fapDocumento: BackendFapDocumentoInfo | null;
}

export interface BackendModeloParametros {
  /** Tabela completa do Anexo A da chave; `null` = catálogo ilegível (ADO 67572). */
  faixasCatalogo?: BackendRoyaltyFaixa[] | null;
  /** Why the Anexo A catalogue did not fill the percentuais (RN-F2-01). */
  motivoSemFaixa?: string | null;
  motivoSemFaixaLabel?: string | null;
  modeloNegocio: string | null;
  modeloNegocioLabel: string | null;
  formatoLoja: string | null;
  formatoLojaLabel: string | null;
  modeloRoyalty: string | null;
  modeloRoyaltyLabel: string | null;
  valorFixoBrl: string | null;
  percentualBps: number | null;
  pisoBrl: string | null;
  tetoBrl: string | null;
  valorMinimoMensalBrl: string | null;
  fundoMktPercBps: number | null;
  fundoMktValorFixoBrl?: string | null;
  taxaFranquiaBrl: string | null;
  taxaFranquiaParcelas: number | null;
  /**
   * Isenção da taxa de franquia (ADO 68495).
   *
   * **Opcional no tipo do backend** de propósito: skew de deploy não pode fazer
   * a tela afirmar uma resposta que ninguém deu — ausente cai em `null`, que
   * renderiza travessão.
   */
  isencaoTaxaFranquia?: boolean | null;
}

export interface BackendRoyaltyFaixa {
  inicioFaixaBrl: string | null;
  fimFaixaBrl: string | null;
  registroSequencial: number;
  percRoyalty: string | null;
  percRoyaltyTabaco: string | null;
  percFundoDeMkt: string | null;
  percFundoDeMktTabaco: string | null;
  valorFixoRoyaltyBrl: string | null;
  valorFixoFundoMktBrl: string | null;
}

export interface BackendRoyaltiesCalculados {
  modeloRoyalty: string;
  faturamentoBrl: string;
  baseEfetivaBrl: string;
  shareTabacoPerc: string | null;
  royaltyMensalBrl: string;
  fundoMktMensalBrl: string;
  royaltyAnualBrl: string;
  fundoMktAnualBrl: string;
  totalAnualBrl: string;
  faixa: BackendRoyaltyFaixa | null;
  isencaoAtiva: boolean;
  baseRealAtiva: boolean;
  tetoAtivo: boolean;
  tetoBrl: string | null;
  cessaoAtiva: boolean;
  contratoClausulaEspecificaRequerida: boolean;
  calculadoEm: string;
}

export interface BackendExcecaoRoyaltyItem {
  id: string;
  tipoExcecao: string;
  tipoExcecaoLabel: string;
  politicaExcecao: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  valorOverrideBrl: string | null;
  motivo: string;
  ativo: boolean;
}

export interface BackendMaturacao {
  isMaturada: boolean | null;
  maturacaoInicioEm: string | null;
  maturacaoMesesTotal: number | null;
  maturacaoPercentualBps: number | null;
  maturacaoValorFixoBrl: string | null;
}

export interface BackendRoyaltyPremiado {
  ativo: boolean;
  percentualBps: number | null;
}

export interface BackendEstruturaExcecoes {
  maturacao: BackendMaturacao | null;
  royaltyPremiado: BackendRoyaltyPremiado | null;
  excecoes: BackendExcecaoRoyaltyItem[];
}

export interface BackendCof {
  /** `null` ⇒ ninguém respondeu ainda; a tela renderiza travessão. */
  destinatarioEmail: string | null;
  statusCof: string;
  statusCofLabel: string;
  statusCofPill: string;
  numeroCof: string | null;
  cofEnviadaEm: string | null;
  dataMinAssinatura: string | null;
  prazoLegalCumprido: boolean | null;
  enviadoAssinaturaEm: string | null;
  assinadoEm: string | null;
}

export interface BackendParecerFranquia {
  texto: string | null;
  resultado: string | null;
  resultadoLabel: string | null;
  resultadoPill: string | null;
  analistaId: string | null;
  submetidoEm: string | null;
  /**
   * Rodadas de reapresentação do LT (ADO 68191). **Opcional** para o skew de
   * deploy: backend anterior a esta entrega não manda o campo, e aí o card não
   * afirma rodada nenhuma.
   */
  numRecalls?: number | null;
  recalledAt?: string | null;
}

export interface BackendEditavelPorFranquia {
  dadosFranquia: boolean;
  fapPotencialFotos: boolean;
  modeloParametros: boolean;
  estruturaExcecoes: boolean;
  excecoesProgramadas: boolean;
  parecerFranquia: boolean;
}

export interface BackendPropostaFranquiaSendbar {
  mensagem: string;
  mensagemDetalhe: string | null;
  acaoLabel: string | null;
  acaoEvento: string | null;
  acaoHabilitada: boolean;
  motivoBloqueio: string | null;
}

export interface BackendPropostaFranquiaVereditos {
  analiseEmCurso?: boolean;
  envioLiberado: boolean;
  pendenciasEnvio: string[];
  parecerExigido: boolean | null;
  parecerExigidoAlerta: string | null;
  editavelPorFranquia: BackendEditavelPorFranquia;
  royaltyPremiadoIrreversivel: boolean;
  cofStatus: string | null;
  cofStatusLabel: string | null;
  cofStatusPill: string | null;
  dataMinimaAssinatura: string | null;
  prazoLegalCumprido: boolean | null;
  contratoClausulaEspecificaRequerida: boolean;
}

export interface BackendPropostaFranquiaReadModel {
  proposalId: string;
  opportunityId: string;
  dadosFranquia: BackendFrqSectionResult<BackendDadosFranquia>;
  fapPotencialFotos: BackendFrqSectionResult<BackendFapPotencial>;
  modeloParametros: BackendFrqSectionResult<BackendModeloParametros>;
  royaltiesCalculados: BackendFrqSectionResult<BackendRoyaltiesCalculados>;
  estruturaExcecoes: BackendFrqSectionResult<BackendEstruturaExcecoes>;
  cof: BackendFrqSectionResult<BackendCof>;
  parecerFranquia: BackendFrqSectionResult<BackendParecerFranquia>;
  vereditos: BackendPropostaFranquiaVereditos;
  sendbar: BackendPropostaFranquiaSendbar;
}

// ---------------------------------------------------------------------------
// Frontend types
// ---------------------------------------------------------------------------

export interface FrqSectionResult<T> {
  status: 'ok' | 'unavailable';
  data: T | null;
  error?: string;
}

export interface DadosFranquiaData {
  franquiaId: string;
  proposalId: string;
  opportunityId: string;
  /** `null` when the wire carried a band outside the catalogue. */
  bandeira: BandeiraFranquia | null;
  bandeiraLabel: string;
  /**
   * Raw proposal status — needed to resolve the analysis (read-only) view
   * (FRQ-14). `null` when the wire carried a status outside the enum, which
   * resolves to the SAFEST reading: not in analysis, so no analyst-only control
   * is offered on a proposal whose phase is unknown.
   */
  statusProposta: ProposalStatus | null;
  statusPropostaLabel: string;
  statusPropostaPill: FrqPillCode | null;
  situacaoLoja: SituacaoLoja | null;
  situacaoLojaLabel: string | null;
  tipoImplantacao: string | null;
  codigoMaterialSap: string | null;
  observacoes: string | null;
  /** ISO date (yyyy-mm-dd) — formatted at render time, never here. */
  inicioOperacaoPrevista: string | null;
  postoProposalId: string | null;
  /**
   * Display label for "Vínculo ao posto" (e.g. "PRP-0001 · Vinculação").
   * Null when the posto proposal lookup could not resolve.
   */
  postoVinculoLabel: string | null;
  /**
   * The franchise proposal's own `finalidade` (e.g. "VINCULACAO" / "IMPLANTACAO").
   * Null when absent on the wire.
   */
  finalidade: string | null;
  evNome: string | null;
}

export interface FapDocumentoInfo {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

export interface FapPotencialData {
  faturamentoPropostoBrl: string | null;
  faturamentoDeAcordoComFap: boolean | null;
  fapBrl: string | null;
  potencialBrl: string | null;
  possuiExcecaoRoyalties: boolean | null;
  shareTabacoPerc: string | null;
  fapDocumento: FapDocumentoInfo | null;
}

export interface ModeloParametrosData {
  /**
   * A tabela COMPLETA do Anexo A da chave `política × formato` desta proposta,
   * em ordem de `registroSequencial` (ADO 67572).
   *
   * ⚠️ `[]` e `null` são respostas DIFERENTES: `[]` é o catálogo dizendo que a
   * chave não tem faixa (o motivo vem em {@link motivoSemFaixaLabel}); `null` é
   * "não deu para ler o catálogo". Colapsá-las renderizaria tabela vazia numa
   * falha de leitura — e tabela de royalty vazia lê como "sem cobrança".
   */
  faixasCatalogo: RoyaltyFaixa[] | null;
  /**
   * pt-BR sentence explaining why the Anexo A catalogue did not fill
   * `percentualBps`/`valorFixoBrl`, or `null` when it did. Composed in the
   * backend (RN-F2-01) — the screen only renders it.
   */
  motivoSemFaixaLabel: string | null;
  modeloNegocio: ModeloNegocio | null;
  modeloNegocioLabel: string | null;
  formatoLoja: FormatoLoja | null;
  formatoLojaLabel: string | null;
  modeloRoyalty: ModeloRoyalty | null;
  modeloRoyaltyLabel: string | null;
  valorFixoBrl: string | null;
  percentualBps: number | null;
  pisoBrl: string | null;
  tetoBrl: string | null;
  valorMinimoMensalBrl: string | null;
  fundoMktPercBps: number | null;
  /**
   * Flat monthly marketing fund (BRL). A `VALOR_FIXO` Anexo A band publishes an
   * amount and no percentage, so this — not `fundoMktPercBps` — is the field it
   * fills. Lubrax+ used only this model until 22/09/2026; its PERCENTUAL_FIXO
   * keeps the same flat fund.
   */
  fundoMktValorFixoBrl: string | null;
  taxaFranquiaBrl: string | null;
  taxaFranquiaParcelas: number | null;
  /** `null` = não respondido — a tela mostra travessão, nunca "Não". */
  isencaoTaxaFranquia: boolean | null;
}

export interface RoyaltyFaixa {
  inicioFaixaBrl: string | null;
  fimFaixaBrl: string | null;
  registroSequencial: number;
  percRoyalty: string | null;
  percRoyaltyTabaco: string | null;
  percFundoDeMkt: string | null;
  percFundoDeMktTabaco: string | null;
  valorFixoRoyaltyBrl: string | null;
  valorFixoFundoMktBrl: string | null;
}

export interface RoyaltiesCalculadosData {
  /**
   * `null` when the wire carried a model outside the catalogue. The screen
   * resolves the pt-BR label from `MODELO_ROYALTY_LABEL` — this section carries
   * no `*Label` because the backend authors none for it.
   */
  modeloRoyalty: ModeloRoyalty | null;
  faturamentoBrl: string;
  baseEfetivaBrl: string;
  shareTabacoPerc: string | null;
  royaltyMensalBrl: string;
  fundoMktMensalBrl: string;
  royaltyAnualBrl: string;
  fundoMktAnualBrl: string;
  totalAnualBrl: string;
  faixa: RoyaltyFaixa | null;
  isencaoAtiva: boolean;
  baseRealAtiva: boolean;
  tetoAtivo: boolean;
  tetoBrl: string | null;
  cessaoAtiva: boolean;
  contratoClausulaEspecificaRequerida: boolean;
  calculadoEm: string;
}

export interface ExcecaoRoyaltyItem {
  id: string;
  tipoExcecao: string;
  tipoExcecaoLabel: string;
  politicaExcecao: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  valorOverrideBrl: string | null;
  motivo: string;
  ativo: boolean;
}

export interface MaturacaoData {
  isMaturada: boolean | null;
  maturacaoInicioEm: string | null;
  maturacaoMesesTotal: number | null;
  maturacaoPercentualBps: number | null;
  maturacaoValorFixoBrl: string | null;
}

export interface RoyaltyPremiadoData {
  ativo: boolean;
  percentualBps: number | null;
}

export interface EstruturaExcecoesData {
  maturacao: MaturacaoData | null;
  royaltyPremiado: RoyaltyPremiadoData | null;
  excecoes: ExcecaoRoyaltyItem[];
}

export interface CofData {
  /**
   * Destinatário respondido na proposta. `null` ⇒ ninguém respondeu — a tela
   * renderiza travessão, e o GATE 1 recusa o envio à análise enquanto a loja é
   * NOVA (RN-F5-01). Até 04/09/2026 o nulo tinha destino (o contato do CRM) e a
   * tela o anunciava; hoje o fallback existe só no backend, para linha anterior
   * a esta regra e para o catch-up.
   */
  destinatarioEmail: string | null;
  statusCof: StatusCof | null;
  statusCofLabel: string;
  statusCofPill: FrqPillCode | null;
  numeroCof: string | null;
  cofEnviadaEm: string | null;
  dataMinAssinatura: string | null;
  prazoLegalCumprido: boolean | null;
  enviadoAssinaturaEm: string | null;
  assinadoEm: string | null;
}

export interface ParecerFranquiaData {
  texto: string | null;
  resultado: ResultadoParecerFranquia | null;
  resultadoLabel: string | null;
  resultadoPill: FrqPillCode | null;
  analistaId: string | null;
  submetidoEm: string | null;
  /**
   * Quantas vezes o LT reapresentou a franquia (RN-F6-04) — ADO 68191.
   *
   * O recall ZERA o parecer, então sem este número o card volta a "Aguardando
   * parecer" byte a byte igual ao de uma franquia que nunca o teve: o time de
   * franquias não sabe que já rejeitou antes, e a cobrança nova parece a mesma
   * de sempre. `0` = primeira rodada.
   */
  numRecalls: number;
}

export interface EditavelPorFranquia {
  dadosFranquia: boolean;
  fapPotencialFotos: boolean;
  modeloParametros: boolean;
  /** Os LIMITES do royalty (piso, teto, valor fixo, valor mínimo mensal). */
  estruturaExcecoes: boolean;
  /**
   * As exceções programadas (ADO 67802) — chave própria desde que o LT passou a
   * fazer CRUD nelas enquanto a proposta não está em análise. Antes vinham
   * penduradas em `estruturaExcecoes`, que continua sendo só dos limites.
   */
  excecoesProgramadas: boolean;
  parecerFranquia: boolean;
}

export interface PropostaFranquiaSendbar {
  mensagem: string;
  mensagemDetalhe: string | null;
  /** Null ⇒ the bar is informative and the front renders NO button. */
  acaoLabel: string | null;
  acaoEvento: string | null;
  acaoHabilitada: boolean;
  motivoBloqueio: string | null;
}

export interface PropostaFranquiaVereditos {
  /**
   * A análise está ACONTECENDO (proposta em análise **e** oportunidade em
   * análise)? Governa a "visão da análise" da tela — a faixa da SNEG e o
   * "Solicitar ajuste" de cada bloco.
   *
   * Não é `statusProposta === EM_ANALISE`: o status fica congelado quando a
   * oportunidade avança, e a tela seguia oferecendo ação de analista sobre uma
   * análise encerrada. Ausente ⇒ `false`.
   */
  analiseEmCurso: boolean;
  envioLiberado: boolean;
  pendenciasEnvio: string[];
  parecerExigido: boolean | null;
  parecerExigidoAlerta: string | null;
  editavelPorFranquia: EditavelPorFranquia;
  royaltyPremiadoIrreversivel: boolean;
  cofStatus: StatusCof | null;
  cofStatusLabel: string | null;
  cofStatusPill: FrqPillCode | null;
  dataMinimaAssinatura: string | null;
  prazoLegalCumprido: boolean | null;
  contratoClausulaEspecificaRequerida: boolean;
}

export interface PropostaFranquiaReadModel {
  proposalId: string;
  opportunityId: string;
  dadosFranquia: FrqSectionResult<DadosFranquiaData>;
  fapPotencialFotos: FrqSectionResult<FapPotencialData>;
  modeloParametros: FrqSectionResult<ModeloParametrosData>;
  royaltiesCalculados: FrqSectionResult<RoyaltiesCalculadosData>;
  estruturaExcecoes: FrqSectionResult<EstruturaExcecoesData>;
  cof: FrqSectionResult<CofData>;
  parecerFranquia: FrqSectionResult<ParecerFranquiaData>;
  vereditos: PropostaFranquiaVereditos;
  sendbar: PropostaFranquiaSendbar;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pill(raw: string | null | undefined): FrqPillCode | null {
  return isFrqPillCode(raw) ? raw : null;
}

/**
 * Maps one section, preserving the discriminant.
 *
 * `data: null` under `status: 'ok'` is a legitimate business state ("no COF
 * yet") and stays `ok` — collapsing it into `unavailable` would make the UI
 * claim a source failed when nothing did.
 */
function mapSection<TBackend, TFront>(
  section: BackendFrqSectionResult<TBackend> | undefined,
  mapData: (data: TBackend) => TFront,
): FrqSectionResult<TFront> {
  if (!section) {
    return { status: 'unavailable', data: null };
  }
  if (section.status === 'unavailable' || section.data === null) {
    return {
      status: section.status === 'ok' ? 'ok' : 'unavailable',
      data: null,
      error: section.error,
    };
  }
  return { status: 'ok', data: mapData(section.data) };
}

// ---------------------------------------------------------------------------
// Section mappers
// ---------------------------------------------------------------------------

function mapDadosFranquia(b: BackendDadosFranquia): DadosFranquiaData {
  return {
    franquiaId: b.franquiaId,
    proposalId: b.proposalId,
    opportunityId: b.opportunityId,
    bandeira: isBandeiraFranquia(b.bandeira) ? b.bandeira : null,
    bandeiraLabel: b.bandeiraLabel,
    statusProposta: isProposalStatus(b.statusProposta) ? b.statusProposta : null,
    statusPropostaLabel: b.statusPropostaLabel,
    statusPropostaPill: pill(b.statusPropostaPill),
    situacaoLoja: isSituacaoLoja(b.situacaoLoja) ? b.situacaoLoja : null,
    situacaoLojaLabel: b.situacaoLojaLabel,
    tipoImplantacao: b.tipoImplantacao,
    codigoMaterialSap: b.codigoMaterialSap,
    observacoes: b.observacoes,
    inicioOperacaoPrevista: b.inicioOperacaoPrevista,
    postoProposalId: b.postoProposalId,
    postoVinculoLabel: b.postoVinculoLabel ?? null,
    finalidade: b.finalidade ?? null,
    evNome: b.evNome,
  };
}

function mapFapPotencial(b: BackendFapPotencial): FapPotencialData {
  return {
    faturamentoPropostoBrl: b.faturamentoPropostoBrl,
    faturamentoDeAcordoComFap: b.faturamentoDeAcordoComFap,
    fapBrl: b.fapBrl,
    potencialBrl: b.potencialBrl,
    possuiExcecaoRoyalties: b.possuiExcecaoRoyalties,
    shareTabacoPerc: b.shareTabacoPerc,
    fapDocumento:
      b.fapDocumento === null
        ? null
        : {
            id: b.fapDocumento.id,
            fileName: b.fapDocumento.fileName,
            sizeBytes: b.fapDocumento.sizeBytes,
            createdAt: b.fapDocumento.createdAt,
          },
  };
}

function mapModeloParametros(b: BackendModeloParametros): ModeloParametrosData {
  return {
    /*
     * `undefined` (payload anterior ao ADO 67572) degrada para `null`, não para
     * `[]`: um cliente novo contra um backend velho não deve afirmar que a chave
     * não tem faixa — ele simplesmente não recebeu a tabela.
     */
    faixasCatalogo:
      b.faixasCatalogo === null || b.faixasCatalogo === undefined
        ? null
        : b.faixasCatalogo.map(mapFaixaObrigatoria),
    /*
     * The sentence is composed in the backend — the screen renders it, it does
     * not decide it. A frontend copy of "why is this blank" would be a second
     * verdict over the same facts, and the two would drift.
     */
    motivoSemFaixaLabel: b.motivoSemFaixaLabel ?? null,
    modeloNegocio: isModeloNegocio(b.modeloNegocio) ? b.modeloNegocio : null,
    modeloNegocioLabel: b.modeloNegocioLabel,
    formatoLoja: isFormatoLoja(b.formatoLoja) ? b.formatoLoja : null,
    formatoLojaLabel: b.formatoLojaLabel,
    modeloRoyalty: isModeloRoyalty(b.modeloRoyalty) ? b.modeloRoyalty : null,
    modeloRoyaltyLabel: b.modeloRoyaltyLabel,
    valorFixoBrl: b.valorFixoBrl,
    percentualBps: b.percentualBps,
    pisoBrl: b.pisoBrl,
    tetoBrl: b.tetoBrl,
    valorMinimoMensalBrl: b.valorMinimoMensalBrl,
    fundoMktPercBps: b.fundoMktPercBps,
    fundoMktValorFixoBrl: b.fundoMktValorFixoBrl ?? null,
    taxaFranquiaBrl: b.taxaFranquiaBrl,
    taxaFranquiaParcelas: b.taxaFranquiaParcelas,
    isencaoTaxaFranquia: b.isencaoTaxaFranquia ?? null,
  };
}

function mapFaixa(b: BackendRoyaltyFaixa | null): RoyaltyFaixa | null {
  if (b === null) return null;
  return mapFaixaObrigatoria(b);
}

function mapFaixaObrigatoria(b: BackendRoyaltyFaixa): RoyaltyFaixa {
  return {
    inicioFaixaBrl: b.inicioFaixaBrl,
    fimFaixaBrl: b.fimFaixaBrl,
    registroSequencial: b.registroSequencial,
    percRoyalty: b.percRoyalty,
    percRoyaltyTabaco: b.percRoyaltyTabaco,
    percFundoDeMkt: b.percFundoDeMkt,
    percFundoDeMktTabaco: b.percFundoDeMktTabaco,
    valorFixoRoyaltyBrl: b.valorFixoRoyaltyBrl,
    valorFixoFundoMktBrl: b.valorFixoFundoMktBrl,
  };
}

function mapRoyaltiesCalculados(
  b: BackendRoyaltiesCalculados,
): RoyaltiesCalculadosData {
  return {
    modeloRoyalty: isModeloRoyalty(b.modeloRoyalty) ? b.modeloRoyalty : null,
    faturamentoBrl: b.faturamentoBrl,
    baseEfetivaBrl: b.baseEfetivaBrl,
    shareTabacoPerc: b.shareTabacoPerc,
    royaltyMensalBrl: b.royaltyMensalBrl,
    fundoMktMensalBrl: b.fundoMktMensalBrl,
    royaltyAnualBrl: b.royaltyAnualBrl,
    fundoMktAnualBrl: b.fundoMktAnualBrl,
    totalAnualBrl: b.totalAnualBrl,
    faixa: mapFaixa(b.faixa),
    isencaoAtiva: b.isencaoAtiva,
    baseRealAtiva: b.baseRealAtiva,
    tetoAtivo: b.tetoAtivo,
    tetoBrl: b.tetoBrl,
    cessaoAtiva: b.cessaoAtiva,
    contratoClausulaEspecificaRequerida: b.contratoClausulaEspecificaRequerida,
    calculadoEm: b.calculadoEm,
  };
}

function mapExcecaoItem(b: BackendExcecaoRoyaltyItem): ExcecaoRoyaltyItem {
  return {
    id: b.id,
    tipoExcecao: b.tipoExcecao,
    tipoExcecaoLabel: b.tipoExcecaoLabel,
    politicaExcecao: b.politicaExcecao,
    vigenciaInicio: b.vigenciaInicio,
    vigenciaFim: b.vigenciaFim,
    valorOverrideBrl: b.valorOverrideBrl,
    motivo: b.motivo,
    ativo: b.ativo,
  };
}

function mapEstruturaExcecoes(
  b: BackendEstruturaExcecoes,
): EstruturaExcecoesData {
  return {
    maturacao:
      b.maturacao === null
        ? null
        : {
            isMaturada: b.maturacao.isMaturada,
            maturacaoInicioEm: b.maturacao.maturacaoInicioEm,
            maturacaoMesesTotal: b.maturacao.maturacaoMesesTotal,
            maturacaoPercentualBps: b.maturacao.maturacaoPercentualBps,
            maturacaoValorFixoBrl: b.maturacao.maturacaoValorFixoBrl,
          },
    royaltyPremiado:
      b.royaltyPremiado === null
        ? null
        : {
            ativo: b.royaltyPremiado.ativo,
            percentualBps: b.royaltyPremiado.percentualBps,
          },
    excecoes: (b.excecoes ?? []).map(mapExcecaoItem),
  };
}

function mapCof(b: BackendCof): CofData {
  return {
    destinatarioEmail: b.destinatarioEmail ?? null,
    statusCof: isStatusCof(b.statusCof) ? b.statusCof : null,
    statusCofLabel: b.statusCofLabel,
    statusCofPill: pill(b.statusCofPill),
    numeroCof: b.numeroCof,
    cofEnviadaEm: b.cofEnviadaEm,
    dataMinAssinatura: b.dataMinAssinatura,
    prazoLegalCumprido: b.prazoLegalCumprido,
    enviadoAssinaturaEm: b.enviadoAssinaturaEm,
    assinadoEm: b.assinadoEm,
  };
}

function mapParecer(b: BackendParecerFranquia): ParecerFranquiaData {
  return {
    texto: b.texto,
    resultado: isResultadoParecerFranquia(b.resultado) ? b.resultado : null,
    resultadoLabel: b.resultadoLabel,
    resultadoPill: pill(b.resultadoPill),
    analistaId: b.analistaId,
    submetidoEm: b.submetidoEm,
    /*
     * Campo ausente ou não-positivo ⇒ `0`: o card não afirma uma rodada de
     * reapresentação que o backend não confirmou (skew de deploy).
     */
    numRecalls:
      typeof b.numRecalls === 'number' && b.numRecalls > 0 ? b.numRecalls : 0,
  };
}

/**
 * Editability defaults to **false** for every block when the backend omits the
 * map: the UI must never open a control the API would 403. `false` also matches
 * what a read-only profile receives, so the failure mode is a disabled form,
 * not a rejected save.
 */
function mapEditavel(
  b: BackendEditavelPorFranquia | undefined,
): EditavelPorFranquia {
  return {
    dadosFranquia: b?.dadosFranquia === true,
    fapPotencialFotos: b?.fapPotencialFotos === true,
    modeloParametros: b?.modeloParametros === true,
    estruturaExcecoes: b?.estruturaExcecoes === true,
    excecoesProgramadas: b?.excecoesProgramadas === true,
    parecerFranquia: b?.parecerFranquia === true,
  };
}

function mapVereditos(
  b: BackendPropostaFranquiaVereditos,
): PropostaFranquiaVereditos {
  return {
    analiseEmCurso: b.analiseEmCurso === true,
    envioLiberado: b.envioLiberado === true,
    pendenciasEnvio: b.pendenciasEnvio ?? [],
    parecerExigido: b.parecerExigido,
    parecerExigidoAlerta: b.parecerExigidoAlerta,
    editavelPorFranquia: mapEditavel(b.editavelPorFranquia),
    royaltyPremiadoIrreversivel: b.royaltyPremiadoIrreversivel === true,
    cofStatus: isStatusCof(b.cofStatus) ? b.cofStatus : null,
    cofStatusLabel: b.cofStatusLabel,
    cofStatusPill: pill(b.cofStatusPill),
    dataMinimaAssinatura: b.dataMinimaAssinatura,
    prazoLegalCumprido: b.prazoLegalCumprido,
    contratoClausulaEspecificaRequerida:
      b.contratoClausulaEspecificaRequerida === true,
  };
}

/**
 * Sendbar mapping.
 *
 * `acaoLabel: null` is the "informative bar" form — the front renders no
 * button at all. A CTA that can never be pressed is dead control (CLAUDE.md
 * §Sendbar), so an action without a label also drops its event.
 */
function mapSendbar(
  b: BackendPropostaFranquiaSendbar,
): PropostaFranquiaSendbar {
  const acaoLabel = b.acaoLabel ?? null;
  return {
    mensagem: b.mensagem,
    mensagemDetalhe: b.mensagemDetalhe,
    acaoLabel,
    acaoEvento: acaoLabel === null ? null : b.acaoEvento,
    acaoHabilitada: acaoLabel !== null && b.acaoHabilitada === true,
    motivoBloqueio: b.motivoBloqueio,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function mapPropostaFranquia(
  b: BackendPropostaFranquiaReadModel,
): PropostaFranquiaReadModel {
  return {
    proposalId: b.proposalId,
    opportunityId: b.opportunityId,
    dadosFranquia: mapSection(b.dadosFranquia, mapDadosFranquia),
    fapPotencialFotos: mapSection(b.fapPotencialFotos, mapFapPotencial),
    modeloParametros: mapSection(b.modeloParametros, mapModeloParametros),
    royaltiesCalculados: mapSection(
      b.royaltiesCalculados,
      mapRoyaltiesCalculados,
    ),
    estruturaExcecoes: mapSection(b.estruturaExcecoes, mapEstruturaExcecoes),
    cof: mapSection(b.cof, mapCof),
    parecerFranquia: mapSection(b.parecerFranquia, mapParecer),
    vereditos: mapVereditos(b.vereditos),
    sendbar: mapSendbar(b.sendbar),
  };
}
