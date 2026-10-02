import {
  mapChecklist,
  mapChecklistItem,
  type BackendChecklistItem,
  type BackendChecklistResponse,
} from '@/lib/documents/documents-mapping';
import {
  mapOpportunityDetail,
  mapProposalListItem,
  type BackendOpportunityDetail,
  type BackendProposalListItem,
} from '@/lib/opportunities/opportunity-detail-mapping';
import type { ScenarioComparisonResponse, ScenarioDto } from '@/lib/opportunities/scenario-comparison.types';
import { mapTeam, mapTeamMember, type BackendTeamMember } from '@/lib/opportunities/team-mapping';
import type {
  CreateOpportunityPayload,
  CreateOpportunityResult,
  FaseAtual,
  Gate1MissingItem,
  Gate1Readiness,
  OpportunityCounts,
  OpportunityDetail,
  OpportunityListResult,
  OpportunityPatchPayload,
  OpportunityPrefill,
  OpportunityProposal,
  OpportunitySummary,
  TriggerTransitionResult,
} from '@/lib/opportunities/types';
import type { IndicatorStatus } from '@/lib/opportunities-indicators/indicator-status';
import type { OpportunityIndicatorsSnapshot } from '@/lib/opportunities-indicators/types';
import type { BloqueioAvanco } from '@/lib/pendencias/bloqueio-avanco.api';
import type { PostoEligibility } from '@/lib/proposals/proposal-creation.api';

import { erro, imagem, json, naoAutenticado, pdf, semConteudo, semPermissao } from '../core/respostas';
import { rotas, type MockContext, type MockHandler } from '../core/router';
import { PERFIS, temPapel, usuarioPorId, type MockUser } from '../core/session';
import { agoraIso, fatia, novoId } from '../core/store';
import {
  ETAPAS_GATE1,
  SEMENTES,
  checklistDaSemente,
  crmDaConta,
  linhaFapDaFranquia,
  snapshotIndicadores,
  totaisRecursos,
  type DadosOpp,
  type DetalheOpp,
  type IndicadoresOpp,
  type ItemChecklist,
} from '../dados/oportunidades/semente';
import { OPORTUNIDADES, type EstadoBackend, type OportunidadeElenco, type PropostaElenco } from '../elenco';
import { gruposDeOutrasOrigensDoContrato } from './contrato';
import { clientes, moverPara, oportunidade, oportunidades, ROTULO_FASE } from '../estado-compartilhado';

/**
 * Domínio `oportunidades` — listagem, criação, detalhe, checklist, equipe,
 * indicadores consolidados, comparação de cenários e as TRANSIÇÕES de fase.
 *
 * Onde a BFF de produção passa por um mapper (`mapOpportunityDetail`,
 * `mapChecklist`, `mapTeam`, `mapProposalListItem`), o mock monta o payload do
 * BACKEND e chama o MESMO mapper: o contrato com a tela é o do código de
 * produção, não uma cópia dele.
 */

// ───────────────────────────── Estado do domínio ─────────────────────────────

const LT_PADRAO = 'usr-lt-ana';
const SNEG_PADRAO = 'usr-sneg-carla';

function membro(oppId: string, n: number, userId: string, teamRole: string, funcao: string, regiao: string | null): BackendTeamMember {
  const u = usuarioPorId(userId);
  const perfil = PERFIS.find((p) => p.userId === userId);
  return {
    id: `mbr-${oppId}-${n}`,
    userId,
    name: u?.name ?? userId,
    email: u?.email,
    teamRole,
    funcao,
    jobTitle: perfil?.label ?? null,
    region: regiao,
    roles: u?.roles ?? [],
  };
}

function dadosNovos(o: OportunidadeElenco): DadosOpp {
  const crm = crmDaConta(o.clienteSap);
  const s = SEMENTES[o.id];
  const detalhe: DetalheOpp = {
    descricao: null,
    briefing: null,
    parecerLt: null,
    clienteRecebedorId: o.clienteSap,
    pimAdesao: null,
    possuiNovaImagemPista: crm.possuiNovaImagemPista,
    seraColocadaNovaImagemPista: null,
    alteracaoMinutaPadrao: null,
    descricaoAlteracaoMinutaPadrao: null,
    areaVendaCode: crm.areasVenda.find((a) => a.isPrimary)?.code ?? null,
    areaUsuario: 'DCVIM',
    salesforceCode: null,
    situacaoPosto: null,
    janelaConsumo: null,
    prazoContratoMeses: null,
    dataConclusao: null,
    devolucaoAoLt: null,
    ...(s?.detalhe ?? {}),
  };

  const checklist = checklistDaSemente(o.id);
  const zbrm = o.propostas.find((p) => p.tipo === 'ZBRM');
  if (o.id === 'opp-005' && zbrm) checklist.push(linhaFapDaFranquia(zbrm.id, zbrm.codigo));

  const apoio = s?.apoio ?? [];
  return {
    detalhe,
    checklist,
    outrasOrigens: [],
    equipe: {
      principal: membro(o.id, 1, o.ltId, 'lt_principal', 'outros', crm.regiao),
      membros: apoio.map(([userId, funcao], i) => membro(o.id, i + 2, userId, 'apoio', funcao, null)),
    },
    indicadores: s?.indicadores ? snapshotIndicadores(o, s.indicadores.status, s.indicadores.calculadoEm) : null,
    faseIniciadaEm: s?.faseIniciadaEm ?? o.criadaEm,
    estadoVisto: o.estado,
    contratoAtivo: s?.contratoAtivo ?? false,
    dataAtivacao: s?.dataAtivacao ?? null,
    bloqueio: s?.bloqueio ?? null,
  };
}

const dadosPorOpp = fatia<Record<string, DadosOpp>>('oportunidades-dados', () =>
  Object.fromEntries(OPORTUNIDADES.map((o) => [o.id, dadosNovos(o)])),
);

/**
 * Ajuste único sobre o estado compartilhado: o cenário da opp-002 é "pronta
 * para o GATE 1", e o GATE 1 exige proposta ELEITA — o elenco a declara com as
 * duas não eleitas. Elege a de maior valor (a que casa com o valor estimado).
 */
const ajustes = fatia('oportunidades-ajustes', () => ({ feito: false }));
function garantirAjustes(): void {
  const a = ajustes();
  if (a.feito) return;
  a.feito = true;
  const p = oportunidade('opp-002')?.propostas.find((x) => x.id === 'prp-002a');
  if (p) p.eleita = true;
}

/** Dados do domínio da oportunidade (cria na hora para quem nasceu fora da semente). */
function dadosDe(o: OportunidadeElenco): DadosOpp {
  const todos = dadosPorOpp();
  let d = todos[o.id];
  if (!d) {
    d = dadosNovos(o);
    todos[o.id] = d;
  }
  // Outro domínio moveu a fase (aprovar, assinar…) ⇒ a fase nova começa agora.
  if (d.estadoVisto !== o.estado) {
    d.estadoVisto = o.estado;
    d.faseIniciadaEm = agoraIso();
  }
  return d;
}

/** Envolve o handler: aplica o ajuste da semente e resolve `:id` (404 como a BFF). */
function comOpp(fn: (o: OportunidadeElenco, d: DadosOpp, ctx: MockContext) => Response | Promise<Response>): MockHandler {
  return (ctx) => {
    garantirAjustes();
    const o = oportunidade(ctx.params.id);
    if (!o) return erro(404, 'Oportunidade não encontrada.');
    return fn(o, dadosDe(o), ctx);
  };
}

const EM_PREENCHIMENTO = (e: EstadoBackend) => e === 'NOVOS' || e === 'EM_PREENCHIMENTO';

function clienteDe(o: OportunidadeElenco) {
  return clientes().find((c) => c.sapCode === o.clienteSap);
}

const digitos = (s: string) => s.replace(/\D/g, '');

/** A referência do cliente chega como Código SAP; aceita também CNPJ. */
function acharCliente(ref: string) {
  const r = ref.trim();
  return clientes().find(
    (c) => c.sapCode === r || (digitos(r).length >= 6 && (digitos(c.cnpj) === digitos(r) || digitos(r).endsWith(c.sapCode))),
  );
}

function ehFranquia(p: PropostaElenco) {
  return p.tipo === 'ZBRM' || p.tipo === 'ZLUB';
}

// ───────────────────────────── Indicadores (ARP assíncrono) ─────────────────────────────

/** Atraso do "callback do ARP" depois de um recálculo. */
const ATRASO_ARP_MS = 4000;

function indicadoresAtuais(o: OportunidadeElenco, d: DadosOpp): IndicadoresOpp | null {
  const ind = d.indicadores;
  if (ind && ind.status === 'em_calculo' && ind.pedidoEm !== null && Date.now() - ind.pedidoEm > ATRASO_ARP_MS) {
    d.indicadores = snapshotIndicadores(o, 'atualizado', agoraIso());
  }
  return d.indicadores;
}

function vazioIndicadores(o: OportunidadeElenco): IndicadoresOpp {
  const agora = agoraIso();
  return {
    id: `ind-${o.id}`,
    opportunityId: o.id,
    status: 'em_calculo',
    tir: null,
    vpl: null,
    tma: null,
    rsPorM3: null,
    margemEbitda: null,
    margemMedia: null,
    indicadorRentabilidade: null,
    percentualAntecipacao: null,
    comprometimento: null,
    consolidatedProposalIds: null,
    calculadoEm: null,
    mensagemErro: null,
    createdAt: agora,
    updatedAt: agora,
    pedidoEm: null,
  };
}

/** Pede um recálculo: os números anteriores ficam, o status vira `em_calculo`. */
function pedirRecalculo(o: OportunidadeElenco, d: DadosOpp): IndicadoresOpp {
  const base = d.indicadores ?? vazioIndicadores(o);
  d.indicadores = { ...base, status: 'em_calculo', pedidoEm: Date.now(), updatedAt: agoraIso() };
  return d.indicadores;
}

function semPedidoEm(ind: IndicadoresOpp): OpportunityIndicatorsSnapshot {
  // `pedidoEm` é controle interno do mock (quando o "callback do ARP" chega) — não vai à tela.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pedidoEm, ...snapshot } = ind;
  return snapshot;
}

/** Status do indicador da PROPOSTA (pill do card e linha da comparação). */
function statusIndicadorProposta(o: OportunidadeElenco, d: DadosOpp, p: PropostaElenco): IndicatorStatus | null {
  const ind = indicadoresAtuais(o, d);
  if (!ind) return null;
  if (ind.consolidatedProposalIds?.includes(p.id)) return ind.status;
  // Proposta da semente calculada antes (cenário alternativo da opp-002).
  const daSemente = OPORTUNIDADES.some((x) => x.propostas.some((y) => y.id === p.id));
  if (daSemente && ind.calculadoEm) return 'atualizado';
  return p.eleita ? ind.status : null;
}

// ───────────────────────────── Projeções ─────────────────────────────

const ROTULO_ESTADO: Record<EstadoBackend, string> = {
  NOVOS: 'Novos',
  EM_PREENCHIMENTO: 'Em preenchimento',
  EM_ANALISE: 'Em análise',
  EM_APROVACAO: 'Em aprovação',
  EM_MINUTA: 'Em minuta',
  EM_ASSINATURA: 'Em assinatura',
  EM_PAGAMENTO: 'Em pagamento',
  CONCLUIDA: 'Concluída',
};

function resumo(o: OportunidadeElenco): OpportunitySummary {
  const d = dadosDe(o);
  const crm = crmDaConta(o.clienteSap);
  const inicio = Date.parse(d.faseIniciadaEm);
  return {
    id: o.id,
    code: o.code,
    title: o.titulo,
    clientName: clienteDe(o)?.razaoSocial ?? '',
    clientId: o.clienteSap,
    clientSapCode: o.clienteSap,
    ltNome: usuarioPorId(o.ltId)?.name ?? null,
    finalidade: o.finalidade || null,
    phase: ROTULO_ESTADO[o.estado],
    value: o.valorEstimado > 0 ? o.valorEstimado : null,
    status: o.status,
    faseAtual: o.fase,
    faseAtualLabel: ROTULO_FASE[o.fase],
    contratoAtivo: d.contratoAtivo,
    diretoria: crm.escritorioVendas,
    gerencia: crm.equipeVendas,
    createdAt: o.criadaEm,
    dataAtivacao: d.dataAtivacao,
    faseIniciadaEm: d.faseIniciadaEm,
    permanenciaFaseAtualDias: Number.isFinite(inicio)
      ? Math.max(0, Math.round(((Date.now() - inicio) / 86_400_000) * 10) / 10)
      : null,
  };
}

function detalhe(o: OportunidadeElenco, d: DadosOpp): OpportunityDetail {
  const c = clienteDe(o);
  const crm = crmDaConta(o.clienteSap);
  const area = crm.areasVenda.find((a) => a.code === d.detalhe.areaVendaCode);
  const ind = indicadoresAtuais(o, d);
  const n = o.id.replace(/\D/g, '').padStart(4, '0');
  const sf = d.detalhe.salesforceCode;
  const backend: BackendOpportunityDetail = {
    id: o.id,
    code: o.code,
    customerId: o.clienteSap,
    clienteCodigoSap: o.clienteSap,
    customerName: c?.razaoSocial ?? null,
    titulo: o.titulo,
    tipoNegociacao: 'Contrato de Volume',
    finalidade: o.finalidade || null,
    areaVenda: area?.name ?? null,
    centroLucro: crm.centroLucro,
    janelaConsumo: d.detalhe.janelaConsumo,
    escritorioVendas: crm.escritorioVendas,
    salesforce: sf
      ? {
          salesforceId: `006EX00000${n}AAA`,
          salesforceCode: sf,
          salesforceUrl: `https://salesforce.exemplo.invalid/lightning/r/Opportunity/006EX00000${n}AAA/view`,
        }
      : null,
    areaUsuario: d.detalhe.areaUsuario,
    clienteRecebedorId: d.detalhe.clienteRecebedorId,
    pimAdesao: d.detalhe.pimAdesao,
    possuiNovaImagemPista: d.detalhe.possuiNovaImagemPista,
    seraColocadaNovaImagemPista: d.detalhe.seraColocadaNovaImagemPista,
    alteracaoMinutaPadrao: d.detalhe.alteracaoMinutaPadrao,
    descricaoAlteracaoMinutaPadrao: d.detalhe.descricaoAlteracaoMinutaPadrao,
    descricao: d.detalhe.descricao,
    briefing: d.detalhe.briefing,
    parecerLt: d.detalhe.parecerLt,
    fase: o.estado,
    criadoPorId: o.ltId,
    criadoPorNome: usuarioPorId(o.ltId)?.name ?? null,
    // O backend só expõe a devolução enquanto a fase é de preenchimento.
    devolucaoAoLt: EM_PREENCHIMENTO(o.estado) ? d.detalhe.devolucaoAoLt : null,
    dataAbertura: o.criadaEm,
    dataConclusao: d.detalhe.dataConclusao,
    vmm: o.vmm > 0 ? o.vmm.toFixed(4) : null,
    prazoContratoMeses: d.detalhe.prazoContratoMeses,
    indicadores: ind
      ? {
          tir: ind.tir,
          vpl: ind.vpl,
          percentualAntecipacao: ind.percentualAntecipacao,
          tma: ind.tma,
          rsPorM3: ind.rsPorM3,
          calculadoEm: ind.calculadoEm,
          status: ind.status,
          mensagemErro: ind.mensagemErro,
        }
      : null,
    situacaoPosto: d.detalhe.situacaoPosto,
    mapaDaRede: c
      ? c.naRede
        ? { status: 'ATIVO', situacao: 'NA_REDE' }
        : { status: null, situacao: 'FORA_DA_REDE' }
      : null,
    totaisRecursosFinanceiros: EM_PREENCHIMENTO(o.estado) ? null : totaisRecursos(o.valorEstimado),
    franquiasSemRoyalty: [],
    proposalIds: o.propostas.filter((p) => p.eleita).map((p) => p.id),
    createdAt: o.criadaEm,
  };
  return mapOpportunityDetail(backend);
}

const TIPO_CONTRATO: Record<PropostaElenco['tipo'], string> = {
  PCR: 'CPCVM Volume',
  ZBRM: 'BR Mania',
  ZLUB: 'Lubrax +',
};

function finalidadeDaProposta(o: OportunidadeElenco, p: PropostaElenco): string {
  if (p.tipo === 'ZBRM') return 'BR Mania - Implantação';
  if (p.tipo === 'ZLUB') return 'Lubrax+ - Implantação';
  if (/renova/i.test(o.finalidade)) return 'Renovação';
  return 'VINCULACAO';
}

const MOTIVO_DEVOLUCAO_PADRAO =
  'Revisar o volume mensal projetado: o histórico ANP dos últimos 12 meses não sustenta o volume proposto.';

function itemDeProposta(o: OportunidadeElenco, d: DadosOpp, p: PropostaElenco): BackendProposalListItem {
  return {
    id: p.id,
    codigo: p.codigo,
    tipoContrato: TIPO_CONTRATO[p.tipo],
    finalidade: finalidadeDaProposta(o, p),
    tipoProposta: p.tipo,
    status: p.status,
    preenchimentoPercent: p.status === 'EM_PREENCHIMENTO' ? (o.id === 'opp-001' ? 65 : o.id === 'opp-002' ? 100 : 40) : 100,
    motivoDevolucao: p.status === 'DEVOLVIDA' ? MOTIVO_DEVOLUCAO_PADRAO : null,
    indicatorStatus: statusIndicadorProposta(o, d, p),
    eleita: p.eleita,
  };
}

// ───────────────────────────── Checklist ─────────────────────────────

function statusItem(it: ItemChecklist): string {
  if (it.proposalId) return it.vinculado ? (it.validado ? 'ok' : 'anexado') : 'pendente';
  if (!it.repositoryDocumentId) return 'pendente';
  if (!it.vinculado) return 'repo';
  if (it.expiresAt && Date.parse(it.expiresAt) < Date.now()) return 'vencido';
  return it.validado ? 'ok' : 'anexado';
}

function paraBackend(it: ItemChecklist): BackendChecklistItem {
  // `vinculado`/`validado` são estado interno do mock; o backend expressa os dois em `status`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { vinculado, validado, ...resto } = it;
  return { ...resto, status: statusItem(it) };
}

/** Documento obrigatório satisfeito (anexado ou validado — vencido não conta). */
function satisfeito(it: ItemChecklist): boolean {
  const s = statusItem(it);
  return s === 'anexado' || s === 'ok';
}

function respostaChecklist(o: OportunidadeElenco, d: DadosOpp): BackendChecklistResponse {
  const obrigatorios = d.checklist.filter((i) => i.required);
  return {
    items: d.checklist.map(paraBackend),
    completeness: { completed: obrigatorios.filter(satisfeito).length, total: obrigatorios.length },
    // Contrato assinado, certificado e Anexo J vêm do domínio `contrato`, com os
    // ids que as rotas de stream dele aceitam — e acompanham a assinatura ao vivo.
    outrasOrigens: [...d.outrasOrigens, ...gruposDeOutrasOrigensDoContrato(o.id)],
    obrigatoriedadeDispensada: null,
  };
}

function extensao(nome: string): string {
  const e = nome.split('.').pop()?.toLowerCase() ?? '';
  return e === 'jpg' ? 'jpeg' : e;
}

// ───────────────────────────── GATE 1 ─────────────────────────────

function participa(o: OportunidadeElenco, d: DadosOpp, user: MockUser): boolean {
  return (
    o.ltId === user.id ||
    d.equipe.principal?.userId === user.id ||
    d.equipe.membros.some((m) => m.userId === user.id)
  );
}

function faltasGate1(o: OportunidadeElenco, d: DadosOpp): Gate1MissingItem[] {
  const missing: Gate1MissingItem[] = [];
  if (!o.propostas.some((p) => p.eleita)) missing.push('propostas_selecionadas');
  const ind = indicadoresAtuais(o, d);
  if (!ind || ind.tir === null || ind.vpl === null) missing.push('indicadores_calculados');
  const docsFaltando = d.checklist.some(
    (i) => i.required && i.stageLimit !== null && ETAPAS_GATE1.has(i.stageLimit) && !satisfeito(i),
  );
  if (docsFaltando) missing.push('documentos_obrigatorios');
  return missing;
}

// ───────────────────────────── Transições ─────────────────────────────

interface DefTransicao {
  de: EstadoBackend[];
  para: EstadoBackend;
  /** Papéis que podem disparar (`TRANSITION_AUTHORITY`). */
  papeis: string[];
}

const CRIAR_EDITAR = ['LT', 'BP_FINANCEIRO', 'SNEG', 'ADMIN', 'SPCOM', 'GERENTE_VAREJO', 'EXPANSAO', 'GESTOR_FRANQUIAS', 'TI_SUSTENTACAO', 'CONSULTOR_EXPANSAO'];
const REJEITAR_DEVOLVER = ['BP_FINANCEIRO', 'SNEG', 'ADMIN', 'SPCOM', 'GESTOR_FRANQUIAS', 'TI_SUSTENTACAO'];
const MINUTA_ASSINATURA = ['SNEG', 'ADMIN', 'CONSULTOR_EXPANSAO', 'BP_FINANCEIRO'];
const ANALISE = ['SNEG', 'BP_FINANCEIRO', 'ADMIN'];

/** Espelho de `TRANSITIONS` (`workflow-orchestration/domain/transition.ts`). */
const TRANSICOES: Record<string, DefTransicao> = {
  INICIAR_PREENCHIMENTO: { de: ['NOVOS'], para: 'EM_PREENCHIMENTO', papeis: CRIAR_EDITAR },
  ENVIAR_PARA_ANALISE: { de: ['EM_PREENCHIMENTO', 'NOVOS'], para: 'EM_ANALISE', papeis: CRIAR_EDITAR },
  DEVOLVER_AO_LT: { de: ['EM_ANALISE'], para: 'EM_PREENCHIMENTO', papeis: REJEITAR_DEVOLVER },
  ENVIAR_PARA_APROVACAO: { de: ['EM_ANALISE'], para: 'EM_APROVACAO', papeis: ANALISE },
  ALCADA_REPROVADA: { de: ['EM_APROVACAO'], para: 'EM_PREENCHIMENTO', papeis: REJEITAR_DEVOLVER },
  INICIAR_MINUTA: { de: ['EM_APROVACAO'], para: 'EM_MINUTA', papeis: MINUTA_ASSINATURA },
  ENVIAR_PARA_ASSINATURA: { de: ['EM_MINUTA'], para: 'EM_ASSINATURA', papeis: MINUTA_ASSINATURA },
  ANULAR_ENVIO: { de: ['EM_ASSINATURA'], para: 'EM_MINUTA', papeis: MINUTA_ASSINATURA },
  ENVIAR_PARA_PAGAMENTO: { de: ['EM_ASSINATURA'], para: 'EM_PAGAMENTO', papeis: ANALISE },
  CONCLUIR: { de: ['EM_PAGAMENTO'], para: 'CONCLUIDA', papeis: ANALISE },
};

const ESTADOS: EstadoBackend[] = ['NOVOS', 'EM_PREENCHIMENTO', 'EM_ANALISE', 'EM_APROVACAO', 'EM_MINUTA', 'EM_ASSINATURA', 'EM_PAGAMENTO', 'CONCLUIDA'];

const GATE1_PARTICIPACAO_MENSAGEM =
  'Somente quem participa da oportunidade pode enviá-la para análise. ' +
  'Peça ao responsável (LT) da oportunidade, ou solicite sua inclusão na equipe.';

/** Corpo de erro do `WorkflowExceptionFilter` (a BFF repassa 403/409/422 crus). */
function erroWorkflow(status: number, message: string, extra: Record<string, unknown> = {}): Response {
  const rotulo = status === 409 ? 'Conflict' : status === 403 ? 'Forbidden' : 'Unprocessable Entity';
  return json({ statusCode: status, ...extra, message, error: rotulo }, status);
}

/** Propostas de volta ao preenchimento — o efeito `opportunity.returned_to_lt`. */
function propostasDeVoltaAoLt(o: OportunidadeElenco): void {
  for (const p of o.propostas) {
    if (p.status !== 'EM_PREENCHIMENTO') p.status = 'EM_PREENCHIMENTO';
  }
}

function transicionar(o: OportunidadeElenco, d: DadosOpp, ctx: MockContext): Response {
  const user = ctx.user;
  if (!user) return naoAutenticado();
  const b = (ctx.body ?? {}) as {
    event?: unknown;
    currentState?: unknown;
    motivoDevolucao?: unknown;
    motivoAnulacao?: unknown;
  };

  // DTO (ValidationPipe): evento e estado do catálogo.
  if (typeof b.event !== 'string' || !TRANSICOES[b.event]) {
    return erro(400, 'event deve ser um evento de workflow válido.');
  }
  if (typeof b.currentState !== 'string' || !ESTADOS.includes(b.currentState as EstadoBackend)) {
    return erro(400, 'currentState deve ser uma fase válida da oportunidade.');
  }
  const evento = b.event;
  const estadoInformado = b.currentState as EstadoBackend;
  const def = TRANSICOES[evento];

  const motivoDevolucao = typeof b.motivoDevolucao === 'string' ? b.motivoDevolucao.trim() : '';
  if (evento === 'DEVOLVER_AO_LT' && !motivoDevolucao) {
    return erro(400, 'Informe o motivo da devolução — ele fica visível para o LT.');
  }
  if (evento === 'ANULAR_ENVIO' && !(typeof b.motivoAnulacao === 'string' && b.motivoAnulacao.trim())) {
    return erro(400, 'Informe o motivo da anulação do envio.');
  }

  // Autoridade por transição (`TransitionAuthorityGuard`).
  if (!temPapel(user, ...def.papeis)) {
    return erroWorkflow(403, 'Seu perfil não pode disparar esta transição.');
  }
  // `ConsultorSoFranquiaGuard`: o Consultor de Expansão só move oportunidade com franquia.
  if (user.roles.every((r) => r === 'CONSULTOR_EXPANSAO') && !o.propostas.some(ehFranquia)) {
    return erroWorkflow(403, 'O Consultor de Expansão só move oportunidades com proposta de franquia.');
  }
  // `Gate1ParticipacaoGuard` (ADO 68191).
  if (evento === 'ENVIAR_PARA_ANALISE' && !temPapel(user, 'ADMIN') && !participa(o, d, user)) {
    return erroWorkflow(403, GATE1_PARTICIPACAO_MENSAGEM);
  }

  if (!def.de.includes(estadoInformado)) {
    return erroWorkflow(422, `Não há transição ${evento} a partir da fase ${ROTULO_ESTADO[estadoInformado]}.`);
  }
  // Optimistic lock: a tela leu uma fase que não é mais a atual.
  if (o.estado !== estadoInformado) {
    return erroWorkflow(409, 'A fase da oportunidade mudou desde a última leitura. Recarregue a página.');
  }

  // Guards do GATE 1 (os demais gates dependem de estado de outros domínios).
  if (evento === 'ENVIAR_PARA_ANALISE') {
    const missing = faltasGate1(o, d);
    if (missing.length > 0) {
      return erroWorkflow(422, 'Transition guard rejected: a oportunidade não atende aos requisitos mínimos do GATE 1.', {
        code: 'GATE_NOT_READY',
        missing,
      });
    }
  }

  moverPara(o.id, def.para);
  d.estadoVisto = def.para;
  d.faseIniciadaEm = agoraIso();

  switch (evento) {
    case 'ENVIAR_PARA_ANALISE': {
      for (const p of o.propostas) if (p.eleita) p.status = 'EM_ANALISE';
      o.analistaSnegId = o.analistaSnegId ?? SNEG_PADRAO;
      d.detalhe.devolucaoAoLt = null;
      if (!d.equipe.membros.some((m) => m.userId === o.analistaSnegId) && o.analistaSnegId) {
        d.equipe.membros.push(membro(o.id, d.equipe.membros.length + 2, o.analistaSnegId, 'apoio', 'outros', null));
      }
      break;
    }
    case 'DEVOLVER_AO_LT': {
      propostasDeVoltaAoLt(o);
      d.detalhe.devolucaoAoLt = { motivo: motivoDevolucao, em: agoraIso(), porNome: user.name };
      break;
    }
    case 'ALCADA_REPROVADA':
      propostasDeVoltaAoLt(o);
      break;
    case 'CONCLUIR':
      d.detalhe.dataConclusao = agoraIso();
      break;
    default:
      break;
  }

  return json<TriggerTransitionResult>({ status: 'ok', correlationId: crypto.randomUUID() });
}

// ───────────────────────────── Listagem ─────────────────────────────

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function casaBusca(o: OportunidadeElenco, q: string): boolean {
  const c = clienteDe(o);
  const alvo = [o.code, o.titulo, o.clienteSap, c?.razaoSocial, c?.nomeFantasia, c?.cnpj, usuarioPorId(o.ltId)?.name, ...o.propostas.map((p) => p.codigo)]
    .filter(Boolean)
    .join(' ');
  return normalizar(alvo).includes(normalizar(q));
}

function casaFranquia(o: OportunidadeElenco, filtro: string): boolean {
  switch (filtro) {
    case 'QUALQUER':
      return o.propostas.some(ehFranquia);
    case 'ZBRM':
    case 'ZLUB':
      return o.propostas.some((p) => p.tipo === filtro);
    case 'NENHUMA':
      return !o.propostas.some(ehFranquia);
    default:
      return true;
  }
}

const FASES: FaseAtual[] = ['PREENCHIMENTO', 'ANALISE', 'APROVACAO', 'MINUTA', 'ASSINATURA', 'ATIVACAO', 'PAGAMENTO', 'CONCLUIDA'];

function listar({ query }: MockContext): Response {
  garantirAjustes();
  const q = query.get('q')?.trim() ?? '';
  const franquia = query.get('franquia')?.trim() ?? '';
  const fases = new Set(query.getAll('fase').filter((f): f is FaseAtual => (FASES as string[]).includes(f)));
  const somenteAtivos = query.get('contratosAtivos') === '1';
  const page = Math.max(1, Number(query.get('page')) || 1);
  const limit = Math.max(1, Number(query.get('limit')) || 10);

  // Ordem padrão do backend: mais recentes primeiro.
  const base = [...oportunidades()]
    .filter((o) => (!q || casaBusca(o, q)) && casaFranquia(o, franquia))
    .sort((a, b) => Date.parse(b.criadaEm) - Date.parse(a.criadaEm))
    .map(resumo);

  // Contagens ANTES dos filtros de fase e de contratos ativos (regra da BFF).
  const porFase = Object.fromEntries(FASES.map((f) => [f, 0])) as Record<FaseAtual, number>;
  for (const r of base) if (r.faseAtual) porFase[r.faseAtual] += 1;
  const counts: OpportunityCounts = { all: base.length, porFase, contratosAtivos: base.filter((r) => r.contratoAtivo).length };

  let filtradas = base.filter(
    (r) => (fases.size === 0 || (r.faseAtual !== null && fases.has(r.faseAtual))) && (!somenteAtivos || r.contratoAtivo),
  );

  const sort = query.get('sort');
  const dir = query.get('dir');
  if (sort === 'createdAt' && (dir === 'asc' || dir === 'desc')) {
    const f = dir === 'asc' ? 1 : -1;
    filtradas = [...filtradas].sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : NaN;
      const tb = b.createdAt ? Date.parse(b.createdAt) : NaN;
      if (Number.isNaN(ta) && Number.isNaN(tb)) return a.code.localeCompare(b.code, 'pt');
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return ta !== tb ? (ta - tb) * f : a.code.localeCompare(b.code, 'pt') * f;
    });
  }

  const total = filtradas.length;
  const start = (page - 1) * limit;
  return json<OpportunityListResult>({
    items: filtradas.slice(start, start + limit),
    counts,
    total,
    page,
    limit,
    hasMore: start + limit < total,
  });
}

// ───────────────────────────── Criação ─────────────────────────────

/** `OPPORTUNITY_CREATE_ROLES` — a linha Criar/Editar, menos o Consultor de Expansão (ADO 68140). */
const CRIAR = CRIAR_EDITAR.filter((r) => r !== 'CONSULTOR_EXPANSAO');

function proximoCodigo(): string {
  const max = oportunidades().reduce((m, o) => Math.max(m, Number(o.code.replace(/\D/g, '')) || 0), 0);
  return `OPP-${String(max + 1).padStart(4, '0')}`;
}

function criar({ body, user }: MockContext): Response {
  garantirAjustes();
  if (!user) return naoAutenticado();
  if (!temPapel(user, ...CRIAR)) {
    return json({ code: 'FORBIDDEN', error: 'Sem permissão para criar oportunidades.' }, 403);
  }
  const p = (body ?? {}) as Partial<CreateOpportunityPayload>;
  if (typeof p.customerId !== 'string' || !p.customerId.trim()) {
    return erro(400, 'O cliente é obrigatório.');
  }
  const cliente = acharCliente(p.customerId);
  if (!cliente) return erro(404, 'Cliente não encontrado.');
  if (p.alteracaoMinutaPadrao === true && !p.descricaoAlteracaoMinutaPadrao?.trim()) {
    return erro(400, 'Descreva a alteração da minuta padrão — ela é obrigatória quando a resposta é "Sim".');
  }
  const crm = crmDaConta(cliente.sapCode);
  if (p.areaVendaCode && !crm.areasVenda.some((a) => a.code === p.areaVendaCode)) {
    return erro(400, 'A área de venda informada não está entre as áreas aprovadas da conta.');
  }

  const finalidade = p.finalidade?.trim() ?? '';
  const nova: OportunidadeElenco = {
    id: novoId('opp'),
    code: proximoCodigo(),
    titulo: p.title?.trim() || `${cliente.nomeFantasia} · ${finalidade || 'Contratação'}`,
    clienteSap: cliente.sapCode,
    estado: 'EM_PREENCHIMENTO',
    fase: 'PREENCHIMENTO',
    status: 'preenchimento',
    finalidade,
    tipo: 'Posto',
    ltId: temPapel(user, 'LT') ? user.id : LT_PADRAO,
    analistaSnegId: null,
    valorEstimado: 0,
    vmm: 0,
    criadaEm: agoraIso(),
    propostas: [],
    cenario: 'Criada no protótipo.',
  };
  oportunidades().push(nova);

  const d = dadosDe(nova);
  Object.assign(d.detalhe, {
    descricao: p.description?.trim() || null,
    briefing: p.briefing?.trim() || null,
    parecerLt: p.parecerLt?.trim() || null,
    clienteRecebedorId: p.clientRecebedorId?.trim() || cliente.sapCode,
    areaVendaCode: p.areaVendaCode ?? d.detalhe.areaVendaCode,
    possuiNovaImagemPista: p.possuiNovaImagemPista ?? crm.possuiNovaImagemPista,
    seraColocadaNovaImagemPista: p.possuiNovaImagemPista === false ? (p.seraColocadaNovaImagemPista ?? null) : null,
    alteracaoMinutaPadrao: p.alteracaoMinutaPadrao ?? null,
    descricaoAlteracaoMinutaPadrao: p.alteracaoMinutaPadrao === true ? (p.descricaoAlteracaoMinutaPadrao?.trim() ?? null) : null,
    situacaoPosto: cliente.naRede ? { label: 'Em operação', details: cliente.bandeira } : { label: cliente.bandeira },
  } satisfies Partial<DetalheOpp>);

  // Documentos do cliente já anexados em outra oportunidade ficam no repositório,
  // prontos para reúso (HU-17.1) — menos os de garantia, que são por operação.
  for (const it of d.checklist) {
    if (it.proposalId || it.category === 'Garantia') continue;
    const fonte = Object.entries(dadosPorOpp())
      .filter(([oid]) => oid !== nova.id && oportunidade(oid)?.clienteSap === cliente.sapCode)
      .map(([, x]) => x.checklist.find((i) => i.category === it.category && i.type === it.type && i.vinculado && i.repositoryDocumentId))
      .find((i) => i && !(i.expiresAt && Date.parse(i.expiresAt) < Date.now()));
    if (fonte) {
      it.repositoryDocumentId = fonte.repositoryDocumentId;
      it.fileName = fonte.fileName;
      it.expiresAt = fonte.expiresAt;
      it.vinculado = false;
    }
  }

  return json<CreateOpportunityResult>({ id: nova.id, code: nova.code }, 201);
}

function prefill({ query }: MockContext): Response {
  const customerId = query.get('customerId');
  if (!customerId) return erro(400, 'Parâmetro customerId é obrigatório.');
  const c = acharCliente(customerId);
  if (!c) return erro(404, 'Cliente não encontrado.');
  const crm = crmDaConta(c.sapCode);
  return json<OpportunityPrefill>({
    customerId: c.sapCode,
    clientName: c.razaoSocial,
    clientDocument: null,
    suggestedTitle: `${c.nomeFantasia} · Contratação`,
    salesZone: crm.areasVenda.map((a) => a.name).join(', '),
    salesAreas: crm.areasVenda.map(({ code, name, isPrimary, aprovada }) => ({ code, name, isPrimary, aprovada })),
    profitCenter: crm.centroLucro,
    salesTeam: crm.equipeVendas,
    clientRecebedorId: c.sapCode,
    possuiNovaImagemPista: crm.possuiNovaImagemPista,
    companyGroup: null,
    team: [],
  });
}

// ───────────────────────────── Detalhe ─────────────────────────────

function editar(o: OportunidadeElenco, d: DadosOpp, { body }: MockContext): Response {
  if (typeof body !== 'object' || body === null) return erro(400, 'Corpo inválido.');
  const p = body as OpportunityPatchPayload;
  if (p.title !== undefined && !p.title.trim()) return erro(400, 'O título não pode ficar em branco.');
  if (p.alteracaoMinutaPadrao === true && !(p.descricaoAlteracaoMinutaPadrao ?? d.detalhe.descricaoAlteracaoMinutaPadrao)?.trim()) {
    return erro(400, 'Descreva a alteração da minuta padrão — ela é obrigatória quando a resposta é "Sim".');
  }
  if (p.title !== undefined) o.titulo = p.title.trim();
  if (p.finalidade !== undefined) o.finalidade = p.finalidade;
  const t = d.detalhe;
  if (p.description !== undefined) t.descricao = p.description.trim() || null;
  if (p.briefing !== undefined) t.briefing = p.briefing.trim() || null;
  if (p.parecerLt !== undefined) t.parecerLt = p.parecerLt.trim() || null;
  if (p.clientRecebedorId !== undefined) t.clienteRecebedorId = p.clientRecebedorId.trim() || null;
  if (p.pimAdesao !== undefined) t.pimAdesao = p.pimAdesao;
  if (p.possuiNovaImagemPista !== undefined) {
    t.possuiNovaImagemPista = p.possuiNovaImagemPista;
    if (p.possuiNovaImagemPista) t.seraColocadaNovaImagemPista = null;
  }
  if (p.seraColocadaNovaImagemPista !== undefined && t.possuiNovaImagemPista === false) {
    t.seraColocadaNovaImagemPista = p.seraColocadaNovaImagemPista;
  }
  if (p.alteracaoMinutaPadrao !== undefined) t.alteracaoMinutaPadrao = p.alteracaoMinutaPadrao;
  if (p.descricaoAlteracaoMinutaPadrao !== undefined) t.descricaoAlteracaoMinutaPadrao = p.descricaoAlteracaoMinutaPadrao.trim() || null;
  // O backend descarta a descrição quando a resposta não é "Sim".
  if (t.alteracaoMinutaPadrao !== true) t.descricaoAlteracaoMinutaPadrao = null;
  return json<OpportunityDetail>(detalhe(o, d));
}

function definirAreaVenda(o: OportunidadeElenco, d: DadosOpp, { body }: MockContext): Response {
  const code = (body as { areaVendaCode?: unknown } | undefined)?.areaVendaCode;
  if (typeof code !== 'string' || !code.trim()) return erro(400, 'Informe a área de venda.');
  if (d.detalhe.areaVendaCode) return erro(409, 'Esta oportunidade já tem uma área de venda escolhida.');
  if (!crmDaConta(o.clienteSap).areasVenda.some((a) => a.code === code)) {
    return erro(400, 'A área de venda informada não está entre as áreas aprovadas da conta.');
  }
  d.detalhe.areaVendaCode = code;
  return json({ ok: true });
}

// ───────────────────────────── Propostas da oportunidade ─────────────────────────────

function listarPropostas(o: OportunidadeElenco, d: DadosOpp, { query }: MockContext): Response {
  // RN-F2-04: da análise em diante só as eleitas, salvo o pedido explícito.
  const todas = EM_PREENCHIMENTO(o.estado) || query.get('incluirNaoEleitas') === 'true';
  const lista = o.propostas.filter((p) => todas || p.eleita);
  return json<OpportunityProposal[]>(lista.map((p) => mapProposalListItem(itemDeProposta(o, d, p))));
}

function comporPropostas(o: OportunidadeElenco, d: DadosOpp, { body }: MockContext): Response {
  const ids = (body as { proposalIds?: unknown } | undefined)?.proposalIds;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) {
    return erro(400, 'proposalIds deve ser um array.');
  }
  const estranha = ids.find((x) => !o.propostas.some((p) => p.id === x));
  if (estranha) return erro(400, `A proposta ${estranha} não pertence a esta oportunidade.`);
  if (!EM_PREENCHIMENTO(o.estado)) {
    return erro(409, 'A composição de propostas só pode ser alterada durante o preenchimento.');
  }
  const antes = o.propostas.filter((p) => p.eleita).map((p) => p.id).sort().join();
  for (const p of o.propostas) p.eleita = ids.includes(p.id);
  // Eleger re-simula as propostas eleitas (o consolidado entra em cálculo).
  if (ids.length > 0 && [...ids].sort().join() !== antes) pedirRecalculo(o, d);
  return json<OpportunityDetail>(detalhe(o, d));
}

// ───────────────────────────── Comparação de cenários ─────────────────────────────

function comparacao(o: OportunidadeElenco, d: DadosOpp): Response {
  const maiorPcr = Math.max(1, ...o.propostas.filter((p) => p.tipo === 'PCR').map((p) => p.valorEstimado));
  const prazo = d.detalhe.prazoContratoMeses ?? 60;
  const scenarios: ScenarioDto[] = o.propostas.map((p) => {
    const semente = Number(p.id.replace(/\D/g, '')) || 1;
    const indStatus = statusIndicadorProposta(o, d, p);
    const calculado = indStatus !== null && indStatus !== 'em_calculo';
    const pcr = p.tipo === 'PCR';
    const volume = pcr && o.vmm > 0 ? Math.round((o.vmm * p.valorEstimado) / maiorPcr) : null;
    const precoMedio = pcr ? 5820 + (semente % 5) * 35 : null;
    const fator = p.valorEstimado / Math.max(1, o.valorEstimado);
    const tir = calculado ? Math.round((0.13 + (semente % 7) * 0.011 + (1 - fator) * 0.04) * 10000) / 10000 : null;
    return {
      proposalId: p.id,
      codigo: p.codigo,
      tipoProposta: p.tipo,
      tipoContrato: TIPO_CONTRATO[p.tipo],
      status: p.status,
      isElected: p.eleita,
      volume,
      precoMedio,
      prazoMeses: prazo,
      receitaPrevista: volume !== null && precoMedio !== null ? Math.round(volume * precoMedio * prazo) : null,
      margem: pcr ? Math.round((268 + (semente % 6) * 7.5) * 100) / 100 : null,
      recursosFinanceiros: p.valorEstimado > 0 ? p.valorEstimado : null,
      pctAntecipacao: p.valorEstimado > 0 ? Math.round((0.3 + (semente % 3) * 0.05) * 100) / 100 : null,
      tir,
      vpl: calculado ? Math.round(p.valorEstimado * (0.2 + (semente % 4) * 0.035)) : null,
      payback: null,
      custoVinculacaoUnitario:
        volume && p.valorEstimado > 0 ? Math.round((p.valorEstimado / (volume * prazo)) * 100) / 100 : null,
      indicadorStatus: indStatus,
      alcada: null,
    };
  });
  return json<ScenarioComparisonResponse>({ opportunityId: o.id, scenarios });
}

// ───────────────────────────── Checklist ─────────────────────────────

function lerChecklist(o: OportunidadeElenco, d: DadosOpp): Response {
  return json(
    mapChecklist(respostaChecklist(o, d), o.id, {
      code: o.code,
      name: clienteDe(o)?.razaoSocial,
      state: o.estado,
    }),
  );
}

function mutarChecklist(o: OportunidadeElenco, d: DadosOpp, { body, user }: MockContext): Response {
  const form = body instanceof FormData ? body : null;
  const ler = (k: string): string => {
    const v = form ? form.get(k) : (body as Record<string, unknown> | undefined)?.[k];
    return typeof v === 'string' ? v : '';
  };
  const action = ler('action');
  const docId = ler('docId');
  if (!docId || !['attach', 'reuse', 'remove', 'validar', 'desfazer-validacao'].includes(action)) {
    return erro(400, 'Ação ou docId inválido.');
  }

  if (action === 'attach') {
    const partes = docId.split('::');
    const category = ler('category') || (partes.length >= 2 ? partes[0] : '');
    const type = ler('type') || (partes.length >= 2 ? partes[1] : '');
    const proposalId = partes.length === 3 ? partes[2] : null;
    const linha = d.checklist.find((i) =>
      proposalId ? i.proposalId === proposalId && i.type === partes[1] : !i.proposalId && i.category === category && i.type === type,
    );
    if (!linha) return erro(400, 'Tipo de documento não parametrizado para esta oportunidade.');
    const file = form?.get('file');
    if (!file || typeof file === 'string') return erro(400, 'Arquivo é obrigatório para um novo upload.');
    if (!linha.acceptedTypes.includes(extensao(file.name))) {
      return erro(400, `Tipo de arquivo não aceito. Tipos permitidos: ${linha.acceptedTypes.join(', ')}.`);
    }
    if (linha.single && linha.vinculado && ler('replace') !== 'true') {
      return erro(409, 'Este tipo de documento aceita um único arquivo. Substitua o atual para enviar outro.');
    }
    // Linha de proposta (FAP) mora no store da proposta, não no hub.
    linha.repositoryDocumentId = linha.proposalId ? null : crypto.randomUUID();
    linha.fileName = file.name;
    linha.expiresAt = null;
    linha.vinculado = true;
    linha.validado = false;
    return json(mapChecklistItem(paraBackend(linha), o.id));
  }

  // As demais ações endereçam um DOCUMENTO — a chave sintética de linha vazia não serve.
  const linha = d.checklist.find((i) => i.repositoryDocumentId === docId);
  if (!linha) {
    if (docId.includes('::')) {
      return erro(400, 'Este documento ainda não tem arquivo anexado — não há o que remover ou conferir.');
    }
    return erro(404, 'Documento não está anexado a esta oportunidade.');
  }

  if (action === 'reuse') {
    if (linha.vinculado) return erro(409, 'Este documento já está anexado a esta oportunidade.');
    linha.vinculado = true;
    linha.validado = false;
    return json(mapChecklistItem(paraBackend(linha), o.id, true));
  }

  if (!linha.vinculado) return erro(404, 'Documento não está anexado a esta oportunidade.');

  if (action === 'remove') {
    // Desvincula; o documento permanece no repositório do cliente para reúso.
    linha.vinculado = false;
    linha.validado = false;
    return semConteudo();
  }

  // Conferência (RN-F9-03): SNEG e CCOB.
  if (!temPapel(user, 'SNEG', 'CCOB', 'ADMIN')) return semPermissao();
  linha.validado = action === 'validar';
  return json(mapChecklistItem(paraBackend(linha), o.id));
}

function baixarDocumento(o: OportunidadeElenco, d: DadosOpp, { params }: MockContext): Response {
  const linha = d.checklist.find((i) => i.repositoryDocumentId === params.docId);
  // Em produção esta rota serve todo documento da oportunidade, inclusive os que
  // a garantia anexa (`gi-*`, `gdoc-*`) e que vivem no estado de outro domínio —
  // fora do checklist, serve um PDF de exemplo em vez de 404.
  if (!linha || !linha.fileName) return pdf(`Documento ${params.docId} - ${o.code}`, `${params.docId}.pdf`);
  if (['png', 'jpeg'].includes(extensao(linha.fileName))) return imagem(`${linha.type} · ${o.code}`);
  return pdf(`${linha.type} - ${o.code}`, linha.fileName);
}

// ───────────────────────────── Equipe ─────────────────────────────

function lerEquipe(_o: OportunidadeElenco, d: DadosOpp): Response {
  return json(mapTeam({ principal: d.equipe.principal, members: d.equipe.membros }));
}

function proximoMembroId(d: DadosOpp): number {
  const ns = [d.equipe.principal, ...d.equipe.membros]
    .filter((m): m is BackendTeamMember => m !== null)
    .map((m) => Number(m.id.split('-').pop()) || 0);
  return Math.max(1, ...ns) + 1;
}

function adicionarMembro(o: OportunidadeElenco, d: DadosOpp, { body }: MockContext): Response {
  const b = (body ?? {}) as { userId?: unknown; role?: unknown };
  if (typeof b.userId !== 'string' || !b.userId) return erro(400, 'Informe o colaborador.');
  const u = usuarioPorId(b.userId);
  if (!u) return erro(404, 'Colaborador não encontrado no diretório.');
  const todos = [d.equipe.principal, ...d.equipe.membros];
  if (todos.some((m) => m?.userId === u.id)) {
    return erro(409, 'Usuário já é membro da equipe desta oportunidade.');
  }
  const funcao = typeof b.role === 'string' && b.role ? b.role : 'outros';
  const novo = membro(o.id, proximoMembroId(d), u.id, 'apoio', funcao, null);
  d.equipe.membros.push(novo);
  return json(mapTeamMember(novo), 201);
}

function removerMembro(_o: OportunidadeElenco, d: DadosOpp, { params }: MockContext): Response {
  if (d.equipe.principal?.id === params.memberId) {
    return erro(422, 'Não é possível remover o LT principal. Troque o LT principal antes de removê-lo.');
  }
  const i = d.equipe.membros.findIndex((m) => m.id === params.memberId);
  if (i < 0) return erro(404, 'Membro não encontrado.');
  d.equipe.membros.splice(i, 1);
  return semConteudo();
}

function trocarPrincipal(o: OportunidadeElenco, d: DadosOpp, { body }: MockContext): Response {
  const userId = (body as { userId?: unknown } | undefined)?.userId;
  if (typeof userId !== 'string' || !userId) return erro(400, 'Informe o novo LT principal.');
  const u = usuarioPorId(userId);
  if (!u) return erro(404, 'Membro não encontrado.');
  const atual = d.equipe.principal;
  // Idempotente: o criador já é o principal (o "persistStagedTeam" da criação repete o PUT).
  if (atual?.userId === u.id) return json(mapTeamMember(atual));
  if (!u.roles.includes('LT')) {
    return erro(422, 'O colaborador escolhido não pertence ao grupo de Líderes de Território no Entra ID.');
  }
  const existente = d.equipe.membros.find((m) => m.userId === u.id);
  d.equipe.membros = d.equipe.membros.filter((m) => m.userId !== u.id);
  if (atual) d.equipe.membros.unshift({ ...atual, teamRole: 'apoio' });
  const novo: BackendTeamMember = existente
    ? { ...existente, teamRole: 'lt_principal' }
    : membro(o.id, proximoMembroId(d), u.id, 'lt_principal', 'outros', crmDaConta(o.clienteSap).regiao);
  d.equipe.principal = novo;
  o.ltId = u.id;
  return json(mapTeamMember(novo));
}

// ───────────────────────────── Rotas ─────────────────────────────

rotas('oportunidades', [
  { method: 'GET', pattern: '/opportunities/list', handler: listar },
  { method: 'POST', pattern: '/opportunities', handler: criar },
  { method: 'GET', pattern: '/opportunities/prefill', handler: prefill },

  { method: 'GET', pattern: '/opportunities/:id', handler: comOpp((o, d) => json<OpportunityDetail>(detalhe(o, d))) },
  { method: 'PATCH', pattern: '/opportunities/:id', handler: comOpp(editar) },
  { method: 'POST', pattern: '/opportunities/:id/area-venda', handler: comOpp(definirAreaVenda) },

  {
    method: 'GET',
    pattern: '/opportunities/:id/bloqueio-avanco',
    handler: comOpp((o, d) => {
      const b = d.bloqueio && d.bloqueio.estado === o.estado ? d.bloqueio : null;
      return json<BloqueioAvanco>({ bloqueado: b !== null, areas: b?.areas ?? [] });
    }),
  },

  { method: 'GET', pattern: '/opportunities/:id/checklist', handler: comOpp(lerChecklist) },
  { method: 'POST', pattern: '/opportunities/:id/checklist', handler: comOpp(mutarChecklist) },
  { method: 'GET', pattern: '/opportunities/:id/documents/:docId/download', handler: comOpp(baixarDocumento) },

  {
    method: 'GET',
    pattern: '/opportunities/:id/gate1-readiness',
    handler: comOpp((o, d, { user }) => {
      const missing = faltasGate1(o, d);
      return json<Gate1Readiness>({
        ready: missing.length === 0,
        missing,
        liberadoPorDeAcordoDiretor: false,
        podeEnviar: !!user && (temPapel(user, 'ADMIN') || participa(o, d, user)),
      });
    }),
  },

  {
    method: 'GET',
    pattern: '/opportunities/:id/indicators',
    handler: comOpp((o, d) => {
      const ind = indicadoresAtuais(o, d);
      return ind ? json<OpportunityIndicatorsSnapshot>(semPedidoEm(ind)) : semConteudo();
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/indicators/recalculate',
    handler: comOpp((o, d) => {
      if (!o.propostas.some((p) => p.eleita)) {
        return erro(400, 'Eleja ao menos uma proposta com volume para calcular os indicadores consolidados.');
      }
      if (indicadoresAtuais(o, d)?.status === 'em_calculo') {
        return json({ code: 'CALCULATION_IN_PROGRESS' }, 409);
      }
      return json<OpportunityIndicatorsSnapshot>(semPedidoEm(pedirRecalculo(o, d)));
    }),
  },

  {
    method: 'GET',
    pattern: '/opportunities/:id/posto-eligibility',
    handler: comOpp((o) => {
      const c = clienteDe(o);
      // Fail-open como a BFF: sem cliente resolvido, inconclusivo.
      if (!c) return json<PostoEligibility>({ postoRef: null, noMapaDaRede: false, checked: false });
      // Em produção, posto já no Mapa da Rede bloqueia a Nova Proposta (HU-04.2).
      // Quase todo cliente do elenco está na rede, então a regra literal travaria a
      // criação de proposta justamente nos cenários de preenchimento. As 10
      // oportunidades da semente ficam liberadas; uma oportunidade CRIADA no
      // protótipo para cliente da rede mostra o bloqueio (é o jeito de vê-lo).
      const daSemente = OPORTUNIDADES.some((s) => s.id === o.id);
      return json<PostoEligibility>({ postoRef: c.sapCode, noMapaDaRede: c.naRede && !daSemente, checked: true });
    }),
  },

  { method: 'GET', pattern: '/opportunities/:id/scenarios/comparison', handler: comOpp(comparacao) },

  { method: 'GET', pattern: '/opportunities/:id/team', handler: comOpp(lerEquipe) },
  { method: 'POST', pattern: '/opportunities/:id/team', handler: comOpp(adicionarMembro) },
  // Remoção: POST e DELETE compartilham a implementação (o edge recusa DELETE).
  { method: 'POST', pattern: '/opportunities/:id/team/:memberId', handler: comOpp(removerMembro) },
  { method: 'DELETE', pattern: '/opportunities/:id/team/:memberId', handler: comOpp(removerMembro) },
  { method: 'PUT', pattern: '/opportunities/:id/team/principal', handler: comOpp(trocarPrincipal) },

  { method: 'POST', pattern: '/opportunities/:id/transitions', handler: comOpp(transicionar) },

  { method: 'GET', pattern: '/opportunities/:id/proposals', handler: comOpp(listarPropostas) },
  { method: 'PUT', pattern: '/opportunities/:id/proposals', handler: comOpp(comporPropostas) },
]);
