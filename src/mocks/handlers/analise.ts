import type { AlcadaSagaStatus, AcionarAlcadaFase } from '@/lib/alcada/alcada.types';
import { mapAlcadaSagaStatus, type BackendAlcadaSagaStatus } from '@/lib/alcada/alcada-mapping';
import {
  mapApprovalReadiness,
  mapPadraoBP,
  type BackendApprovalReadiness,
  type BackendPadraoAnalise,
} from '@/lib/analise/analise-mapping';
import type {
  AlcadaMotivo,
  AlcadaPreview,
  AnaliseFase,
  AnaliseSneg,
  ApprovalReadiness,
  AvisoPolitica,
  ConferenciaCampo,
  ConferenciaProposta,
  ConferenciaResult,
  CriterioAvaliado,
  PadraoBPResult,
  SnegViability,
  ViabilidadeResultado,
} from '@/lib/analise/analise.types';
import { mapAprovacao, type BackendAprovacao } from '@/lib/aprovacao/aprovacao-mapping';
import type { Aprovacao } from '@/lib/aprovacao/aprovacao.types';
import { mapDdiResult, type BackendDdi } from '@/lib/opportunities/ddi-mapping';
import type { DdiResult } from '@/lib/opportunities/ddi.types';
import type {
  EditarParecerPayload,
  Parecer,
  ParecerAlcada,
  ParecerVersaoEntry,
  ParecerVersaoList,
} from '@/lib/opportunities/parecer.types';
import type { PerfilCredito } from '@/lib/perfil-credito/types';

import { agoraIso, fatia, novoId } from '../core/store';
import { campo, erro, json, pdf, semConteudo, semPermissao } from '../core/respostas';
import { rotas, type MockContext } from '../core/router';
import { colaboradoresComPapel, temPapel, type MockUser } from '../core/session';
import {
  APROVADOR_DO_NIVEL,
  EDITAVEIS_VAZIOS,
  META_BP,
  PAYBACK_MAXIMO,
  PERFIS_CREDITO,
  SF_BASE,
  TIR_MINIMA,
  VOLUME_MINIMO,
  custoVinculacao,
  ddiNova,
  ddiSementes,
  montarParecer,
  niveisSimulados,
  numerosDe,
  parecerSementes,
  regionalDe,
  sfCodigo,
  sfOpportunityId,
  sfQuoteId,
  type EditaveisParecer,
  type NivelSimulado,
  type RegistroParecer,
} from '../dados/analise/sementes';
import type { ClienteElenco, EstadoBackend, OportunidadeElenco } from '../elenco';
import { ORDEM_ESTADOS, clientes, moverPara, oportunidade } from '../estado-compartilhado';

/**
 * Domínio `analise`: workspace SNEG (análise, conferência, viabilidade, padrão de
 * BP, prontidão do GATE 2, preview de alçada), parecer técnico, DDI, perfil de
 * crédito, saga da alçada e aprovação no Salesforce.
 *
 * Os vereditos (prontidão, gate de simulação, nível sugerido) são DERIVADOS do
 * estado vivo a cada leitura — como o backend faz — para que emitir o parecer ou
 * a Integridade liberar a DDI destrave a barra sem mais nada.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Utilidades
// ═══════════════════════════════════════════════════════════════════════════

const PAPEIS_SNEG = ['SNEG', 'ADMIN'];
const PAPEIS_INTEGRIDADE = ['INTEGRIDADE', 'COMPLIANCE', 'ADMIN'];
/** Quem enxerga o detalhe confidencial da DDI (Matriz RBAC v2.1). */
const PAPEIS_DETALHE_DDI = ['INTEGRIDADE', 'COMPLIANCE', 'ADMIN', 'LT'];

function indice(estado: EstadoBackend): number {
  return estado === 'NOVOS' ? 0 : ORDEM_ESTADOS.indexOf(estado);
}
const IDX_ANALISE = ORDEM_ESTADOS.indexOf('EM_ANALISE');
const IDX_APROVACAO = ORDEM_ESTADOS.indexOf('EM_APROVACAO');

function clienteDe(o: OportunidadeElenco): ClienteElenco | undefined {
  return clientes().find((c) => c.sapCode === o.clienteSap);
}

/** Erro no envelope do backend (`AllExceptionsFilter`), que a BFF repassa verbatim. */
function erroBackend(status: number, code: string, mensagem: string): Response {
  return erro(status, mensagem, { statusCode: status, code, message: mensagem });
}

function texto(body: unknown, nome: string): string {
  const v = campo<unknown>(body, nome);
  return typeof v === 'string' ? v.trim() : '';
}

const opp404 = () => erro(404, 'Oportunidade não encontrada.');

function comOportunidade(
  handler: (o: OportunidadeElenco, ctx: MockContext) => Response | Promise<Response>,
): (ctx: MockContext) => Response | Promise<Response> {
  return (ctx) => {
    const o = oportunidade(ctx.params.id);
    return o ? handler(o, ctx) : opp404();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Estado do domínio
// ═══════════════════════════════════════════════════════════════════════════

interface RegistroAnalise {
  analise: AnaliseSneg;
  /** A oportunidade inteira voltou ao LT (DEVOLVER_AO_LT / alçada reprovada). */
  devolvidaPelaOportunidade: boolean;
}

/** Analistas SNEG elegíveis na reatribuição — o diretório único (`core/session.ts`). */
function analistasSneg(): Array<{ id: string; nome: string; email: string }> {
  return colaboradoresComPapel('SNEG').map((u) => ({ id: u.id, nome: u.name, email: u.email }));
}

function novaAnalise(o: OportunidadeElenco, quando: string): AnaliseSneg {
  const c = clienteDe(o);
  const analista = analistasSneg().find((a) => a.id === (o.analistaSnegId ?? 'usr-sneg-carla')) ?? null;
  const temFranquia = o.propostas.some((p) => p.tipo !== 'PCR');
  return {
    id: `analise-${o.id}`,
    opportunityId: o.id,
    oportunidadeCodigo: o.code,
    clienteNome: c?.nomeFantasia ?? null,
    tipoNegociacao: 'Contratação',
    totalPropostas: o.propostas.length,
    propostasTitulos: o.propostas.map((p) => p.codigo),
    parecerEmitido: false,
    analista,
    gerencia: regionalDe(c),
    tipoProposta: temFranquia ? 'Posto + Franquias' : 'Posto',
    fase: 'em_analise',
    atribuicaoPendente: analista === null,
    distribuidaEm: quando,
    distribuidaPorId: 'system:analise-sneg',
    distribuidaPorNome: 'Sistema (distribuição automática)',
    createdAt: quando,
    updatedAt: quando,
  };
}

const analises = fatia<Record<string, RegistroAnalise>>('analise-sneg', () => {
  const out: Record<string, RegistroAnalise> = {};
  for (const id of ['opp-003', 'opp-004', 'opp-005', 'opp-006', 'opp-007', 'opp-008', 'opp-009', 'opp-010']) {
    const o = oportunidade(id);
    if (!o) continue;
    const quando = new Date(new Date(o.criadaEm).getTime() + 26 * 3600_000).toISOString();
    out[id] = { analise: novaAnalise(o, quando), devolvidaPelaOportunidade: false };
  }
  return out;
});

const pareceres = fatia<Record<string, RegistroParecer>>('analise-parecer', () =>
  parecerSementes((id) => {
    const o = oportunidade(id);
    return o ? { o, c: clienteDe(o) } : undefined;
  }),
);

const ddis = fatia<Record<string, BackendDdi>>('analise-ddi', ddiSementes);

// ─── Alçada ────────────────────────────────────────────────────────────────

interface QuoteInterna {
  proposalId: string;
  status: string;
  salesforceQuoteId: string | null;
  crmUrl: string | null;
  syncStatus: string;
  synchronizedAt: string | null;
  lastError: string | null;
  retentativa: { automatica: boolean; tentativas: number; maximo: number } | null;
}

interface RegistroAlcada {
  opportunityIntegrada: boolean;
  salesforceOpportunityId: string | null;
  quotes: QuoteInterna[];
  simulacao: { status: string; sentAt: string | null; niveis: NivelSimulado[] | null } | null;
  envio: { status: string; sentAt: string | null; sendVerdict: string | null } | null;
}

/** Tempo (ms) que a simulação "leva" no org antes de responder. */
const DURACAO_SIMULACAO_MS = 8_000;

function quoteSincronizada(proposalId: string, quando: string): QuoteInterna {
  const qid = sfQuoteId(proposalId);
  return {
    proposalId,
    status: 'CRIADO',
    salesforceQuoteId: qid,
    crmUrl: `${SF_BASE}/Quote/${qid}/view`,
    syncStatus: 'SINCRONIZADA',
    synchronizedAt: quando,
    lastError: null,
    retentativa: null,
  };
}

const alcadas = fatia<Record<string, RegistroAlcada>>('analise-alcada', () => {
  const out: Record<string, RegistroAlcada> = {};
  const agora = Date.now();
  for (const id of ['opp-003', 'opp-004', 'opp-005', 'opp-006', 'opp-007', 'opp-008', 'opp-009', 'opp-010']) {
    const o = oportunidade(id);
    if (!o) continue;
    const pcrEleitas = o.propostas.filter((p) => p.eleita && p.tipo === 'PCR');
    const sync = new Date(new Date(o.criadaEm).getTime() + 20 * 3600_000).toISOString();
    const reg: RegistroAlcada = {
      opportunityIntegrada: true,
      salesforceOpportunityId: sfOpportunityId(id),
      quotes: pcrEleitas.map((p) => quoteSincronizada(p.id, sync)),
      simulacao: { status: 'RESPONDIDA', sentAt: sync, niveis: niveisSimulados(o) },
      envio: null,
    };
    if (id === 'opp-004') {
      // Ajuste pedido pela SNEG: a cotação não sincronizou e espera correção.
      reg.quotes = pcrEleitas.map((p) => ({
        ...quoteSincronizada(p.id, sync),
        syncStatus: 'FALHA_SINCRONIZACAO',
        synchronizedAt: null,
        lastError:
          'O Salesforce recusou a sincronização da cotação. As causas mais comuns são: garantia de Concessão Financeira ausente, arquivo obrigatório faltando ou TIR desatualizada.',
        retentativa: { automatica: false, tentativas: 1, maximo: 3 },
      }));
      reg.simulacao = null;
    }
    if (id === 'opp-005') {
      // Simulação em voo: responde alguns segundos depois da primeira leitura.
      reg.simulacao = { status: 'ENVIADA', sentAt: new Date(agora).toISOString(), niveis: niveisSimulados(o) };
    }
    if (indice(o.estado) >= IDX_APROVACAO) {
      reg.envio = { status: 'RESPONDIDA', sentAt: sync, sendVerdict: 'ACEITO' };
    }
    out[id] = reg;
  }
  return out;
});

function alcadaDe(o: OportunidadeElenco): RegistroAlcada {
  const todas = alcadas();
  let reg = todas[o.id];
  if (!reg) {
    reg = { opportunityIntegrada: false, salesforceOpportunityId: null, quotes: [], simulacao: null, envio: null };
    todas[o.id] = reg;
  }
  // A simulação assíncrona do org "responde" depois de alguns segundos.
  if (
    reg.simulacao?.status === 'ENVIADA' &&
    reg.simulacao.sentAt &&
    Date.now() - new Date(reg.simulacao.sentAt).getTime() > DURACAO_SIMULACAO_MS
  ) {
    reg.simulacao.status = 'RESPONDIDA';
  }
  // Entrou em aprovação por outra via (GATE 2 pela barra): o envio já saiu.
  if (indice(o.estado) >= IDX_APROVACAO && !reg.envio) {
    reg.envio = { status: 'RESPONDIDA', sentAt: agoraIso(), sendVerdict: 'ACEITO' };
  }
  return reg;
}

const FASES_SIMULACAO: EstadoBackend[] = ['NOVOS', 'EM_PREENCHIMENTO', 'EM_ANALISE'];

function gateSimulacao(o: OportunidadeElenco): { liberado: boolean; motivoBloqueio: string | null; codigo: string | null } {
  if (!FASES_SIMULACAO.includes(o.estado)) {
    return {
      liberado: false,
      codigo: 'FASE_INVALIDA',
      motivoBloqueio:
        'A alçada já foi enviada para aprovação — simular de novo criaria um cenário concorrente com a aprovação em curso.',
    };
  }
  const eleitas = o.propostas.filter((p) => p.eleita);
  if (eleitas.length === 0) {
    return {
      liberado: false,
      codigo: 'SEM_PROPOSTA_ELEITA',
      motivoBloqueio: 'Eleja ao menos uma proposta de posto para simular a alçada.',
    };
  }
  if (!eleitas.some((p) => p.tipo === 'PCR')) {
    return {
      liberado: false,
      codigo: 'SO_FRANQUIA_ELEITA',
      motivoBloqueio:
        'Só há proposta de franquia eleita — a alçada é calculada sobre a cotação do posto; eleja também a proposta PCR.',
    };
  }
  return { liberado: true, motivoBloqueio: null, codigo: null };
}

function alcadaStatus(o: OportunidadeElenco): AlcadaSagaStatus {
  const reg = alcadaDe(o);
  const gate = gateSimulacao(o);
  const emFase = FASES_SIMULACAO.includes(o.estado);
  const backend: BackendAlcadaSagaStatus = {
    opportunityIntegrada: reg.opportunityIntegrada,
    salesforceOpportunityId: reg.salesforceOpportunityId,
    quotes: reg.quotes.map((q) => ({ ...q })),
    simulacao: reg.simulacao
      ? {
          status: reg.simulacao.status,
          sentAt: reg.simulacao.sentAt,
          retentativaAutomatica: false,
          resultado:
            reg.simulacao.status === 'RESPONDIDA' || reg.simulacao.status === 'APLICADA'
              ? { isValid: true, message: null, levels: reg.simulacao.niveis ?? [] }
              : null,
        }
      : null,
    envio: reg.envio ? { ...reg.envio } : null,
    acionamentoAutomatico: emFase,
    acionamentoPendente: false,
    simulacaoGate: gate,
  };
  return mapAlcadaSagaStatus(backend);
}

/** O topo da cadeia simulada: a parte INTEIRA de `hierarchyLevel`, com os peers. */
function nivelSugerido(o: OportunidadeElenco): ParecerAlcada | null {
  const reg = alcadaDe(o);
  const niveis = reg.simulacao?.status === 'RESPONDIDA' ? reg.simulacao.niveis : null;
  if (!niveis || niveis.length === 0) return null;
  const degrau = Math.max(...niveis.map((n) => Math.floor(n.hierarchyLevel)));
  const topo = niveis.filter((n) => Math.floor(n.hierarchyLevel) === degrau);
  return {
    nivel: topo.map((n) => n.competenceLevelName).join(' + '),
    descricao: [...new Set(topo.flatMap((n) => n.reasons))].join(', ') || null,
  };
}

function ausenciaDeNivel(o: OportunidadeElenco): { rotulo: string; motivo: string } | null {
  const reg = alcadaDe(o);
  if (reg.simulacao?.status === 'RESPONDIDA') {
    return (reg.simulacao.niveis ?? []).length === 0
      ? { rotulo: 'Sem nível', motivo: 'O Salesforce respondeu a simulação sem indicar nível de alçada.' }
      : null;
  }
  if (reg.simulacao?.status === 'ENVIADA') {
    return {
      rotulo: 'Em simulação',
      motivo: 'O Salesforce está calculando a alçada — o nível aparece aqui assim que a simulação concluir.',
    };
  }
  if (reg.quotes.some((q) => q.syncStatus === 'FALHA_SINCRONIZACAO')) {
    return {
      rotulo: 'Não concluída',
      motivo: 'O último acionamento da alçada não chegou a resultado — veja o motivo no painel Processo de alçada.',
    };
  }
  return {
    rotulo: 'Não acionada',
    motivo: 'A alçada ainda não foi acionada — acione-a no painel Processo de alçada para o Salesforce indicar o nível.',
  };
}

// ─── Aprovação ─────────────────────────────────────────────────────────────

interface NivelAprovacao {
  nome: string;
  aprovador: string;
  /** `Approved` | `Pending` | `Rejected`. */
  status: string;
  comentario: string | null;
  criadaEm: string;
  concluidaEm: string | null;
}

interface RegistroAprovacao {
  niveis: NivelAprovacao[];
  lidoEm: string | null;
}

const COMENTARIO_APROVACAO: Record<string, string> = {
  SNEG: 'Análise técnica conferida. De acordo.',
  Gerência: 'De acordo com a negociação.',
  Diretoria: 'Aprovado conforme política.',
  VFCRI: 'Exposição financeira dentro do limite.',
  'Gerentes BR Mania': 'Franquia aprovada.',
};

function cadeiaInicial(o: OportunidadeElenco, aprovadosAte: number, inicio: Date): NivelAprovacao[] {
  const niveis = alcadaDe(o).simulacao?.niveis ?? niveisSimulados(o);
  return niveis.map((n, i) => {
    const criada = new Date(inicio.getTime() + i * 26 * 3600_000).toISOString();
    const aprovado = i < aprovadosAte;
    return {
      nome: n.competenceLevelName,
      aprovador: APROVADOR_DO_NIVEL[n.competenceLevelName] ?? 'Aprovador da alçada',
      status: aprovado ? 'Approved' : 'Pending',
      comentario: aprovado ? (COMENTARIO_APROVACAO[n.competenceLevelName] ?? 'De acordo.') : null,
      criadaEm: criada,
      concluidaEm: aprovado ? new Date(new Date(criada).getTime() + 5 * 3600_000).toISOString() : null,
    };
  });
}

const aprovacoes = fatia<Record<string, RegistroAprovacao>>('analise-aprovacao', () => {
  const out: Record<string, RegistroAprovacao> = {};
  const o6 = oportunidade('opp-006');
  // opp-006: SNEG e Gerente Varejo aprovaram; o BP Financeiro (VFCRI) decide agora.
  if (o6) out['opp-006'] = { niveis: cadeiaInicial(o6, 2, new Date('2026-09-24T12:00:00.000Z')), lidoEm: '2026-09-30T18:05:00.000Z' };
  return out;
});

function aprovacaoDe(o: OportunidadeElenco): Aprovacao {
  const idx = indice(o.estado);
  const alcada = alcadaDe(o);
  const todas = aprovacoes();
  let reg = todas[o.id];

  if (idx === IDX_APROVACAO && !reg) {
    reg = { niveis: cadeiaInicial(o, 0, new Date()), lidoEm: agoraIso() };
    todas[o.id] = reg;
  }
  if (idx > IDX_APROVACAO) {
    const inicio = new Date(new Date(o.criadaEm).getTime() + 15 * 24 * 3600_000);
    const cadeia = (reg?.niveis ?? cadeiaInicial(o, 99, inicio)).map((n) =>
      n.status === 'Approved'
        ? n
        : { ...n, status: 'Approved', comentario: COMENTARIO_APROVACAO[n.nome] ?? 'De acordo.', concluidaEm: n.concluidaEm ?? agoraIso() },
    );
    reg = { niveis: cadeia, lidoEm: reg?.lidoEm ?? new Date(inicio.getTime() + 6 * 24 * 3600_000).toISOString() };
    todas[o.id] = reg;
  }

  const niveis = idx >= IDX_APROVACAO ? (reg?.niveis ?? []) : [];
  const aprovados = niveis.filter((n) => n.status === 'Approved').length;
  const reprovado = niveis.some((n) => n.status === 'Rejected');
  const outcome =
    idx < IDX_APROVACAO
      ? 'SEM_APROVACAO'
      : reprovado
        ? 'REPROVADA'
        : aprovados === niveis.length
          ? 'APROVADA'
          : aprovados > 0
            ? 'PROXIMO_NIVEL'
            : 'EM_APROVACAO';

  const LABEL: Record<string, string> = {
    SEM_APROVACAO: 'Alçada não acionada',
    EM_APROVACAO: 'Em aprovação',
    PROXIMO_NIVEL: 'Em aprovação · próximo nível',
    APROVADA: 'Aprovada',
    REPROVADA: 'Reprovada',
  };
  const PILL: Record<string, string> = { SEM_APROVACAO: 'n', EM_APROVACAO: 'i', PROXIMO_NIVEL: 'i', APROVADA: 's', REPROVADA: 'd' };
  const MOTIVO: Record<string, string> = {
    SEM_APROVACAO:
      'o Salesforce ainda não registrou o processo de aprovação desta oportunidade — se a alçada acabou de ser enviada, use “↻ Atualizar” para reler',
    EM_APROVACAO: 'a alçada está em aprovação no Salesforce',
    PROXIMO_NIVEL: 'a alçada aprovou um nível e aguarda o próximo',
    REPROVADA: 'a alçada foi reprovada no Salesforce',
  };

  const stageName =
    idx > IDX_APROVACAO
      ? 'Emissão do Contrato'
      : idx === IDX_APROVACAO
        ? 'Em Aprovação'
        : alcada.simulacao
          ? 'Envie para Aprovação'
          : alcada.opportunityIntegrada
            ? 'Simulação'
            : null;

  const sfId = alcada.salesforceOpportunityId;
  const STATUS_LABEL: Record<string, string> = { Approved: 'Aprovado', Pending: 'Aguardando decisão', Rejected: 'Reprovado', Started: 'Iniciado' };
  const STATUS_PILL: Record<string, string> = { Approved: 's', Pending: 'i', Rejected: 'd', Started: 'i' };

  const backend: BackendAprovacao = {
    salesforceId: sfId,
    salesforceCode: sfId ? sfCodigo(o.id) : null,
    salesforceUrl: sfId ? `${SF_BASE}/Opportunity/${sfId}/view` : null,
    stageName,
    outcome,
    outcomeLabel: LABEL[outcome],
    outcomePill: PILL[outcome],
    cadeiaAprovacao: niveis.map((n, i) => ({
      processInstanceId: `04gEX0000${o.id.replace(/\D/g, '')}${i + 1}AAA`,
      definicao: `Alçada — ${n.nome}`,
      status: n.status,
      statusLabel: STATUS_LABEL[n.status] ?? n.status,
      pill: STATUS_PILL[n.status] ?? 'n',
      ator: n.aprovador,
      comentario: n.comentario,
      concluidaEm: n.concluidaEm,
      criadaEm: n.criadaEm,
      passos: [
        { status: 'Started', statusLabel: 'Iniciado', ator: 'Integração Gestor de Oportunidades', comentario: null, data: n.criadaEm },
        ...(n.concluidaEm
          ? [{ status: n.status, statusLabel: STATUS_LABEL[n.status] ?? n.status, ator: n.aprovador, comentario: n.comentario, data: n.concluidaEm }]
          : []),
      ],
      pendentes: n.status === 'Pending' ? [n.aprovador] : [],
    })),
    lidoEm: idx >= IDX_APROVACAO ? (reg?.lidoEm ?? null) : null,
    erroLeitura: null,
    iniciarMinuta: { liberado: outcome === 'APROVADA', motivos: outcome === 'APROVADA' ? [] : [MOTIVO[outcome]] },
    orientacaoReprovacao: null,
    avancoAutomatico: {
      tentadoEm: idx > IDX_APROVACAO ? (reg?.niveis.at(-1)?.concluidaEm ?? null) : null,
      motivo: null,
    },
    estadoAtual: o.estado,
  };
  return mapAprovacao(backend);
}

// ─── Análise SNEG (fase derivada) ──────────────────────────────────────────

function parecerDe(o: OportunidadeElenco): RegistroParecer | undefined {
  return pareceres()[o.id];
}

function analiseDe(o: OportunidadeElenco): AnaliseSneg | null {
  const todas = analises();
  let reg = todas[o.id];
  const idx = indice(o.estado);
  if (!reg) {
    if (idx < IDX_ANALISE) return null;
    // A distribuição automática abre a análise no GATE 1.
    reg = { analise: novaAnalise(o, agoraIso()), devolvidaPelaOportunidade: false };
    todas[o.id] = reg;
  }

  let fase: AnaliseFase;
  if (idx < IDX_ANALISE) {
    reg.devolvidaPelaOportunidade = true;
    fase = 'devolvida';
  } else if (idx === IDX_ANALISE) {
    if (reg.devolvidaPelaOportunidade) {
      // Reenvio pelo GATE 1 reabre a análise (`reabrirAposDevolucao`).
      reg.devolvidaPelaOportunidade = false;
      reg.analise.fase = 'em_analise';
    }
    fase = o.propostas.some((p) => p.status === 'DEVOLVIDA') ? 'devolvida' : reg.analise.fase;
  } else {
    fase = 'liberada';
  }

  return {
    ...reg.analise,
    oportunidadeCodigo: o.code,
    totalPropostas: o.propostas.length,
    propostasTitulos: o.propostas.map((p) => p.codigo),
    parecerEmitido: parecerDe(o)?.parecer.status === 'concluido',
    fase,
  };
}

// ─── Viabilidade, padrão de BP, conferência ────────────────────────────────

const AVISOS: Record<string, AvisoPolitica[]> = {
  'opp-003': [
    { codigo: 'POL_MIX_ANTECIPADA', severidade: 'AVISO', mensagem: 'Mix de antecipada acima do orçado no ano (42% × 35%).', elevaAlcada: true },
    { codigo: 'POL_BANDEIRA_BRANCA', severidade: 'INFO', mensagem: 'Posto bandeira branca: embandeiramento exige padronização visual em até 90 dias.', elevaAlcada: false },
  ],
  'opp-004': [
    { codigo: 'TRAVA_SALDO_DEVEDOR', severidade: 'AVISO', mensagem: 'Saldo devedor volumétrico de contrato anterior (2.350 m³) abatido do volume.', elevaAlcada: false },
  ],
  'opp-006': [
    { codigo: 'POL_EXPOSICAO_FINANCEIRA', severidade: 'AVISO', mensagem: 'Exposição financeira do grupo acima de R$ 5 MM.', elevaAlcada: true },
    { codigo: 'POL_PRAZO_LONGO', severidade: 'INFO', mensagem: 'Prazo de 72 meses acima do padrão de 60 meses.', elevaAlcada: false },
  ],
  'opp-008': [
    { codigo: 'POL_PRAZO_LONGO', severidade: 'CRITICO', mensagem: 'Prazo de 84 meses exige alçada de diretoria financeira.', elevaAlcada: true },
  ],
};

function viabilidadeDe(o: OportunidadeElenco): SnegViability {
  const n = numerosDe(o.id);
  const tirRes: ViabilidadeResultado = n.tir >= TIR_MINIMA ? 'OK' : n.tir >= 0.08 ? 'ATENCAO' : 'INVIAVEL';
  const criterios: CriterioAvaliado[] = [
    { codigo: 'TIR-MIN', titulo: 'TIR mínima', resultado: tirRes, valorAvaliado: n.tir, referencia: TIR_MINIMA },
    { codigo: 'VPL-POSITIVO', titulo: 'VPL positivo', resultado: n.vpl > 0 ? 'OK' : 'INVIAVEL', valorAvaliado: n.vpl, referencia: 0 },
    { codigo: 'VOLUME-MIN', titulo: 'Volume mínimo (m³/mês)', resultado: o.vmm >= VOLUME_MINIMO ? 'OK' : 'ATENCAO', valorAvaliado: o.vmm, referencia: VOLUME_MINIMO },
    { codigo: 'PAYBACK-MAX', titulo: 'Payback máximo (meses)', resultado: n.paybackMeses <= PAYBACK_MAXIMO ? 'OK' : 'ATENCAO', valorAvaliado: n.paybackMeses, referencia: PAYBACK_MAXIMO },
  ];
  const ordem: ViabilidadeResultado[] = ['OK', 'ATENCAO', 'INVIAVEL'];
  const resultado = criterios.reduce<ViabilidadeResultado>(
    (pior, c) => (ordem.indexOf(c.resultado) > ordem.indexOf(pior) ? c.resultado : pior),
    'OK',
  );
  return { resultado, criterios, avisos: AVISOS[o.id] ?? [] };
}

function padraoBackend(o: OportunidadeElenco): BackendPadraoAnalise {
  const n = numerosDe(o.id);
  const custo = custoVinculacao(o, n);
  const desvios: BackendPadraoAnalise['desvios'] = [];
  if (custo > META_BP.metaCustoVinculacaoUnitario) {
    desvios.push({ indicador: 'custoVinculacaoUnitario', valorObservado: custo, valorReferencia: META_BP.metaCustoVinculacaoUnitario, diferenca: custo - META_BP.metaCustoVinculacaoUnitario });
  }
  if (n.antecipacao > META_BP.metaPercentualAntecipacao) {
    desvios.push({ indicador: 'percentualAntecipacao', valorObservado: n.antecipacao, valorReferencia: META_BP.metaPercentualAntecipacao, diferenca: n.antecipacao - META_BP.metaPercentualAntecipacao });
  }
  // opp-001 ainda sem proposta eleita: a aderência é indeterminada, nunca "padrão".
  const indeterminada = !o.propostas.some((p) => p.eleita);
  return {
    negocio: META_BP.negocio,
    custoVinculacaoUnitario: custo,
    percentualAntecipacao: n.antecipacao,
    referencia: indeterminada ? null : { id: 'bp-pcr-2026', ...META_BP },
    aderencia: indeterminada ? null : desvios.length > 0 ? 'com_desvio' : 'padrao',
    aderenciaIndeterminadaMotivo: indeterminada ? 'Nenhuma proposta eleita — o padrão de BP é aferido sobre a proposta eleita.' : null,
    desvios: indeterminada ? [] : desvios,
    camposEconomicos: {},
  };
}

const CAMPOS_POSTO: Array<Omit<ConferenciaCampo, 'preenchido' | 'valorResumo'>> = [
  { campo: 'dados.cnpjPosto', label: 'CNPJ do posto', bloco: 'dados' },
  { campo: 'dados.finalidade', label: 'Finalidade da negociação', bloco: 'dados' },
  { campo: 'situacao.situacaoAtual', label: 'Situação atual do posto e do imóvel', bloco: 'situacao' },
  { campo: 'fotos.posto', label: 'Fotos do posto', bloco: 'fotos' },
  { campo: 'produtos.mix', label: 'Produtos e volumes (m³/mês)', bloco: 'produtos' },
  { campo: 'recursos.financeiros', label: 'Recursos financeiros', bloco: 'recursos' },
  { campo: 'financeiro.janelaAnalise', label: 'Janela de análise (início e fim)', bloco: 'financeiro' },
];

const CAMPOS_FRANQUIA: Array<Omit<ConferenciaCampo, 'preenchido' | 'valorResumo'>> = [
  { campo: 'dados.bandeira', label: 'Bandeira da franquia', bloco: 'dados' },
  { campo: 'situacao.situacaoLoja', label: 'Situação atual da loja', bloco: 'situacao' },
  { campo: 'fotos.ponto', label: 'Fotos do ponto', bloco: 'fotos' },
  { campo: 'financeiro.potencial', label: 'Potencial de faturamento', bloco: 'financeiro' },
  { campo: 'recursos.taxaFranquia', label: 'Taxa de franquia', bloco: 'recursos' },
];

/** Campos ainda em branco por oportunidade (o resto está preenchido). */
const FALTANTES: Record<string, string[]> = {
  'opp-001': ['fotos.posto', 'recursos.financeiros', 'financeiro.janelaAnalise'],
  'opp-004': ['fotos.posto'],
};

function conferenciaDe(o: OportunidadeElenco): ConferenciaResult {
  const c = clienteDe(o);
  const n = numerosDe(o.id);
  const faltam = FALTANTES[o.id] ?? [];
  const resumo: Record<string, string> = {
    'dados.cnpjPosto': c?.cnpj ?? '—',
    'dados.finalidade': o.finalidade,
    'situacao.situacaoAtual': c?.naRede ? 'Em operação · rede Vibra' : 'Em operação · bandeira branca',
    'fotos.posto': '6 fotos',
    'produtos.mix': `Gasolina, Etanol, Diesel S10 · ${o.vmm} m³/mês`,
    'recursos.financeiros': o.valorEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }),
    'financeiro.janelaAnalise': `${n.prazoMeses} meses`,
    'dados.bandeira': 'BR Mania',
    'situacao.situacaoLoja': 'Nova',
    'fotos.ponto': '4 fotos',
    'financeiro.potencial': 'R$ 180.000/mês',
    'recursos.taxaFranquia': 'R$ 45.000',
  };
  const propostas: ConferenciaProposta[] = o.propostas.map((p) => {
    const franquia = p.tipo !== 'PCR';
    const campos: ConferenciaCampo[] = (franquia ? CAMPOS_FRANQUIA : CAMPOS_POSTO).map((def) => {
      const preenchido = !faltam.includes(def.campo);
      return { ...def, preenchido, valorResumo: preenchido ? (resumo[def.campo] ?? null) : null };
    });
    const faltantes = campos.filter((x) => !x.preenchido).length;
    return { proposalId: p.id, codigo: p.codigo, tipoProposta: franquia ? 'FRANQUIA' : 'POSTO', completo: faltantes === 0, faltantes, campos };
  });
  return { opportunityId: o.id, propostas };
}

function alcadaPreviewDe(o: OportunidadeElenco): AlcadaPreview {
  const viab = viabilidadeDe(o);
  const bp = padraoBackend(o);
  const motivos: AlcadaMotivo[] = [
    ...viab.avisos.filter((a) => a.elevaAlcada).map((a) => ({ codigo: a.codigo, mensagem: a.mensagem, origem: 'politica' as const })),
    ...(bp.aderencia === 'com_desvio'
      ? [{ codigo: 'BP_COM_DESVIO', mensagem: 'Proposta com desvio em relação ao padrão de BP do negócio.', origem: 'bp' as const }]
      : []),
  ];
  const ausencia = ausenciaDeNivel(o);
  return {
    alcadaElevada: motivos.length > 0,
    nivel: nivelSugerido(o),
    nivelIndisponivelRotulo: ausencia?.rotulo ?? null,
    nivelIndisponivelMotivo: ausencia?.motivo ?? null,
    motivos,
    indisponivelMotivo: bp.aderencia === null ? bp.aderenciaIndeterminadaMotivo : null,
  };
}

// ─── Prontidão do GATE 2 ───────────────────────────────────────────────────

const DDI_LIBERA = ['CONCLUIDA', 'LIBERADA', 'NAO_ELEGIVEL'];

function prontidaoDe(o: OportunidadeElenco): ApprovalReadiness {
  const idx = indice(o.estado);
  const analise = analiseDe(o);
  const nivel = nivelSugerido(o);
  if (idx > IDX_ANALISE) {
    return mapApprovalReadiness({
      ready: true,
      missing: [],
      pendenciasObrigatoriasAbertas: 0,
      documentosAguardandoValidacao: 0,
      analiseConcluida: true,
      analiseFase: 'liberada',
      alcadaSugerida: nivel,
    });
  }

  const missing: string[] = [];
  const devolvida = analise?.fase === 'devolvida';
  if (devolvida) missing.push('pendencias_obrigatorias_abertas');
  if (parecerDe(o)?.parecer.status !== 'concluido') missing.push('parecer_nao_emitido');
  if (devolvida) missing.push('analise_devolvida');
  if (analise?.fase === 'com_pendencia') missing.push('analise_com_pendencia');
  const ddi = ddis()[o.id];
  if (ddi && !DDI_LIBERA.includes(ddi.status)) missing.push('ddi_pendente');
  const perfil = PERFIS_CREDITO[o.id];
  if (perfil && (perfil.status === 'PENDENTE' || perfil.status === 'EM_EXECUCAO')) missing.push('perfil_credito_pendente');
  const alcada = alcadaDe(o);
  if (!alcada.opportunityIntegrada || alcada.quotes.length === 0) missing.push('crm_nao_integrado');
  else if (alcada.simulacao?.status !== 'RESPONDIDA') missing.push('alcada_nao_simulada');

  const backend: BackendApprovalReadiness = {
    ready: missing.length === 0,
    missing,
    pendenciasObrigatoriasAbertas: devolvida ? 1 : 0,
    documentosAguardandoValidacao: 0,
    documentosAguardandoValidacaoTipos: [],
    franquiaParecerPendenteBandeiras: [],
    analiseConcluida: analise?.fase === 'concluida',
    analiseFase: analise?.fase ?? null,
    alcadaSugerida: nivel,
    liberadoPorDeAcordoDiretor: false,
  };
  return mapApprovalReadiness(backend);
}

// ─── Parecer ───────────────────────────────────────────────────────────────

/** O parecer como a API o serve: a alçada sugerida é resolvida na leitura. */
function parecerParaTela(o: OportunidadeElenco, reg: RegistroParecer): Parecer {
  return { ...reg.parecer, alcadaSugerida: reg.parecer.alcadaSugerida ?? nivelSugerido(o) };
}

function editaveisDe(p: Parecer): EditaveisParecer {
  return {
    briefing: p.resumoNegociacao?.briefing ?? null,
    marcacoesAderencia: p.marcacoesAderencia,
    analiseAderencia: p.analiseAderencia,
    justificativaAlcada: p.justificativaAlcada,
    recomendacao: p.recomendacao,
    pontosAtencao: p.pontosAtencao,
    outrasInformacoes: p.outrasInformacoes,
  };
}

function anexarVersao(o: OportunidadeElenco, reg: RegistroParecer, motivo: 'gerado' | 'editado', autor: MockUser | null) {
  reg.versoes.push({
    id: crypto.randomUUID(),
    opportunityId: o.id,
    versao: reg.parecer.versao,
    motivo,
    autorId: autor?.id ?? 'system:parecer',
    autorNome: autor?.name ?? 'Sistema (geração automática)',
    snapshot: structuredClone(reg.parecer),
    createdAt: reg.parecer.updatedAt,
  });
}

const FORA_DA_ANALISE =
  'A oportunidade não está mais em análise, então o parecer técnico não pode mais ser alterado.';

const CAMPOS_OBRIGATORIOS: Array<{ rotulo: string; ok: (p: Parecer) => boolean }> = [
  { rotulo: 'Resumo da negociação', ok: (p) => !!p.resumoNegociacao?.briefing?.trim() },
  { rotulo: 'Atende padrão comercial', ok: (p) => !!p.marcacoesAderencia?.padraoComercial },
  { rotulo: 'Atende política comercial', ok: (p) => !!p.marcacoesAderencia?.politicaComercial },
  { rotulo: 'Atende orçamento VP FIN', ok: (p) => !!p.marcacoesAderencia?.orcamentoVpFin },
  { rotulo: 'Análise de aderência à política comercial', ok: (p) => !!p.analiseAderencia?.trim() },
  { rotulo: 'Justificativa da alçada / exceções', ok: (p) => !!p.justificativaAlcada?.trim() },
  { rotulo: 'Nota do analista', ok: (p) => !!p.recomendacao?.nota },
  { rotulo: 'Parecer executivo', ok: (p) => !!p.recomendacao?.parecerExecutivo?.trim() },
  { rotulo: 'Pontos de atenção', ok: (p) => !!p.pontosAtencao?.trim() },
  { rotulo: 'Outras informações', ok: (p) => !!p.outrasInformacoes?.trim() },
];

// ─── DDI ───────────────────────────────────────────────────────────────────

function ddiDe(o: OportunidadeElenco): BackendDdi {
  const todas = ddis();
  // A DDI roda na criação da oportunidade: nova oportunidade ⇒ análise em curso.
  todas[o.id] ??= ddiNova(o.id);
  const d = todas[o.id];
  d.emTratativa = ['PENDENTE_PARECER', 'AGUARDANDO_LT', 'REPROVADA'].includes(d.status);
  return d;
}

function ddiParaTela(d: BackendDdi, user: MockUser | null): DdiResult {
  if (temPapel(user, ...PAPEIS_DETALHE_DDI)) return mapDdiResult({ ...d, detalheRestrito: false });
  return mapDdiResult({
    ...d,
    score: null,
    racional: null,
    criterios: null,
    achados: [],
    parecerIntegridade: null,
    detalheRestrito: true,
  });
}

const ddiProibido = () => Response.json({ code: 'FORBIDDEN' }, { status: 403 });
const ddiInvalido = (code: string, mensagem: string) =>
  Response.json({ statusCode: 422, code, message: mensagem, error: mensagem }, { status: 422 });

const RISCO_PT: Record<string, string> = { low: 'BAIXO', medium: 'MEDIO', high: 'ALTO' };

// ═══════════════════════════════════════════════════════════════════════════
// Rotas
// ═══════════════════════════════════════════════════════════════════════════

rotas('analise', [
  // ─────────────── Análise SNEG ───────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/analise',
    handler: comOportunidade((o) => {
      const a = analiseDe(o);
      if (!a) {
        return erroBackend(404, 'NOT_FOUND', 'A oportunidade ainda não entrou em análise, então não há análise SNEG para exibir.');
      }
      return json<AnaliseSneg>(a);
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/analise/reatribuir',
    handler: comOportunidade((o, { body, user }) => {
      if (!body || typeof body !== 'object') return erro(400, 'Corpo inválido.');
      if (!temPapel(user, ...PAPEIS_SNEG)) return erro(403, 'Sem permissão para reatribuir o analista.');
      const analistaId = texto(body, 'analistaId');
      if (!analistaId) return erroBackend(400, 'VALIDATION_ERROR', 'Informe o analista responsável.');
      const reg = analises()[o.id];
      if (!reg || !analiseDe(o)) return erroBackend(404, 'NOT_FOUND', 'A oportunidade nunca entrou em análise.');
      const analista = analistasSneg().find((x) => x.id === analistaId);
      if (!analista) {
        return erroBackend(
          422,
          'UNPROCESSABLE_ENTITY',
          'O colaborador escolhido não pertence ao grupo da SNEG (VBR_GOP_SNEG_DEV) — escolha um analista da SNEG.',
        );
      }
      const agora = agoraIso();
      reg.analise.analista = analista;
      reg.analise.atribuicaoPendente = false;
      reg.analise.distribuidaEm = agora;
      reg.analise.distribuidaPorId = user?.id ?? null;
      reg.analise.distribuidaPorNome = user?.name ?? null;
      reg.analise.updatedAt = agora;
      // A listagem e o dashboard leem o analista da oportunidade.
      o.analistaSnegId = analista.id;
      return json<AnaliseSneg>(analiseDe(o) as AnaliseSneg);
    }),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/analise/approval-readiness',
    handler: comOportunidade((o) => json<ApprovalReadiness>(prontidaoDe(o))),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/analise/alcada-preview',
    handler: comOportunidade((o) => json<AlcadaPreview>(alcadaPreviewDe(o))),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/analise/conferencia',
    handler: comOportunidade((o) => json<ConferenciaResult>(conferenciaDe(o))),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/analise/padrao-bp',
    handler: comOportunidade((o) => json<PadraoBPResult>(mapPadraoBP(padraoBackend(o)))),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/analise/viabilidade',
    handler: comOportunidade((o) => json<SnegViability>(viabilidadeDe(o))),
  },

  // ─────────────── Saga da alçada ───────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/alcada',
    handler: comOportunidade((o) => json<AlcadaSagaStatus>(alcadaStatus(o))),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/alcada/acionar',
    handler: comOportunidade((o, { user }) => {
      if (!temPapel(user, 'LT', 'SNEG', 'ADMIN')) return semPermissao();
      const reg = alcadaDe(o);
      const gate = gateSimulacao(o);
      if (!gate.liberado) {
        const status = gate.codigo === 'FASE_INVALIDA' ? 409 : 400;
        return erroBackend(status, gate.codigo ?? 'CONFLICT', gate.motivoBloqueio ?? 'A alçada não pode ser simulada agora.');
      }
      if (reg.simulacao?.status === 'ENVIADA') {
        return erroBackend(
          409,
          'ALCADA_ACIONAMENTO_EM_ANDAMENTO',
          'Outro acionamento da alçada desta oportunidade está em curso — o resultado aparece aqui em instantes.',
        );
      }
      // Sincroniza oportunidade e cotações no org e dispara a simulação.
      const agora = agoraIso();
      reg.opportunityIntegrada = true;
      reg.salesforceOpportunityId ??= sfOpportunityId(o.id);
      reg.quotes = o.propostas.filter((p) => p.eleita && p.tipo === 'PCR').map((p) => quoteSincronizada(p.id, agora));
      reg.simulacao = { status: 'ENVIADA', sentAt: agora, niveis: niveisSimulados(o) };
      reg.envio = null;
      return json<{ fase: AcionarAlcadaFase }>({ fase: 'SIMULACAO_SOLICITADA' });
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/alcada/enviar',
    handler: comOportunidade((o, { user }) => {
      if (!temPapel(user, ...PAPEIS_SNEG)) return semPermissao();
      if (o.estado !== 'EM_ANALISE') {
        return erroBackend(409, 'CONFLICT', 'A oportunidade não está em análise — a alçada só é enviada a partir da análise SNEG.');
      }
      const reg = alcadaDe(o);
      if (reg.simulacao?.status !== 'RESPONDIDA') {
        return erroBackend(409, 'CONFLICT', 'A simulação da alçada ainda não foi concluída — acione a alçada e aguarde o resultado.');
      }
      if (reg.envio?.status === 'ENVIADA') {
        return erroBackend(409, 'CONFLICT', 'O envio da alçada já está em andamento.');
      }
      reg.envio = { status: 'RESPONDIDA', sentAt: agoraIso(), sendVerdict: 'ACEITO' };
      // O org aceitou: a oportunidade segue para a aprovação.
      moverPara(o.id, 'EM_APROVACAO');
      return json<{ verdict: string }>({ verdict: 'ACEITO' });
    }),
  },

  // ─────────────── Aprovação no Salesforce ───────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/aprovacao',
    handler: comOportunidade((o) => json<Aprovacao>(aprovacaoDe(o))),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/aprovacao/refresh',
    handler: comOportunidade((o) => {
      const reg = aprovacoes()[o.id];
      if (reg) reg.lidoEm = agoraIso();
      return json<Aprovacao>(aprovacaoDe(o));
    }),
  },

  // ─────────────── Parecer técnico ───────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/parecer',
    handler: comOportunidade((o) => {
      const reg = parecerDe(o);
      return reg ? json<Parecer>(parecerParaTela(o, reg)) : erro(404, 'Parecer técnico não encontrado.');
    }),
  },
  {
    method: 'PATCH',
    pattern: '/opportunities/:id/parecer',
    handler: comOportunidade((o, { body, user }) => {
      if (!temPapel(user, ...PAPEIS_SNEG)) return semPermissao();
      const reg = parecerDe(o);
      if (!reg) return erro(404, 'Parecer técnico não encontrado.');
      if (o.estado !== 'EM_ANALISE') return erroBackend(400, 'BAD_REQUEST', FORA_DA_ANALISE);
      const dto = (body ?? {}) as EditarParecerPayload;
      const p = reg.parecer;
      if (dto.resumoNegociacao?.briefing !== undefined && p.resumoNegociacao) {
        p.resumoNegociacao = { ...p.resumoNegociacao, briefing: dto.resumoNegociacao.briefing };
      }
      if (dto.marcacoesAderencia !== undefined) p.marcacoesAderencia = dto.marcacoesAderencia;
      if (dto.analiseAderencia !== undefined) p.analiseAderencia = dto.analiseAderencia;
      if (dto.justificativaAlcada !== undefined) p.justificativaAlcada = dto.justificativaAlcada;
      if (dto.recomendacao !== undefined) {
        p.recomendacao = { nota: dto.recomendacao.nota, parecerExecutivo: dto.recomendacao.parecerExecutivo ?? null };
      }
      if (dto.pontosAtencao !== undefined) p.pontosAtencao = dto.pontosAtencao;
      if (dto.outrasInformacoes !== undefined) p.outrasInformacoes = dto.outrasInformacoes;
      p.versao += 1;
      p.updatedAt = agoraIso();
      anexarVersao(o, reg, 'editado', user);
      return json<Parecer>(parecerParaTela(o, reg));
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/parecer/gerar',
    handler: comOportunidade((o, { user }) => {
      if (!temPapel(user, ...PAPEIS_SNEG)) return semPermissao();
      if (o.estado !== 'EM_ANALISE') return erroBackend(400, 'BAD_REQUEST', FORA_DA_ANALISE);
      const todos = pareceres();
      const existente = todos[o.id];
      const agora = agoraIso();
      // Regerar preserva o que o analista escreveu e refaz o resto pelo template.
      const parecer = montarParecer(
        o,
        clienteDe(o),
        {
          id: existente?.parecer.id ?? crypto.randomUUID(),
          versao: (existente?.parecer.versao ?? 0) + 1,
          status: 'rascunho',
          createdAt: existente?.parecer.createdAt ?? agora,
          updatedAt: agora,
        },
        existente ? editaveisDe(existente.parecer) : EDITAVEIS_VAZIOS,
      );
      const reg: RegistroParecer = { parecer, versoes: existente?.versoes ?? [] };
      todos[o.id] = reg;
      anexarVersao(o, reg, 'gerado', user);
      return json<Parecer>(parecerParaTela(o, reg));
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/parecer/emitir',
    handler: comOportunidade((o, { user }) => {
      if (!temPapel(user, ...PAPEIS_SNEG)) return semPermissao();
      const reg = parecerDe(o);
      if (!reg) return erro(404, 'Parecer técnico não encontrado.');
      if (o.estado !== 'EM_ANALISE') return erroBackend(400, 'BAD_REQUEST', FORA_DA_ANALISE);
      const faltantes = CAMPOS_OBRIGATORIOS.filter((c) => !c.ok(reg.parecer)).map((c) => c.rotulo);
      if (faltantes.length > 0) {
        return erroBackend(
          400,
          'BAD_REQUEST',
          'O parecer técnico só pode ser salvo com todos os campos preenchidos. ' +
            `${faltantes.length === 1 ? 'Falta' : 'Faltam'} preencher: ${faltantes.join(', ')}.`,
        );
      }
      reg.parecer.status = 'concluido';
      reg.parecer.updatedAt = agoraIso();
      const a = analises()[o.id];
      if (a && a.analise.fase !== 'devolvida') a.analise.fase = 'concluida';
      return json<Parecer>(parecerParaTela(o, reg));
    }),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/parecer/pdf',
    handler: comOportunidade((o) => {
      if (!parecerDe(o)) return erro(404, 'Parecer técnico não encontrado.');
      return pdf(`Parecer tecnico SNEG - ${o.code}`, `parecer-tecnico-${o.id}.pdf`);
    }),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/parecer/versoes',
    handler: comOportunidade((o) => {
      const reg = parecerDe(o);
      if (!reg) return erro(404, 'Parecer técnico não encontrado.');
      const items = [...reg.versoes].sort((a, b) => b.versao - a.versao);
      return json<ParecerVersaoList>({ items, total: items.length });
    }),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/parecer/versoes/:v',
    handler: comOportunidade((o, { params }) => {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.v)) {
        return erro(400, 'ID de versão inválido.');
      }
      const versao = parecerDe(o)?.versoes.find((x) => x.id === params.v);
      return versao ? json<ParecerVersaoEntry>(versao) : erro(404, 'Versão do parecer não encontrada.');
    }),
  },

  // ─────────────── DDI ───────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/ddi',
    handler: comOportunidade((o, { user }) => {
      const d = ddiDe(o);
      if (d.status === 'NAO_ELEGIVEL') return semConteudo();
      return json<DdiResult>(ddiParaTela(d, user));
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/ddi/run',
    handler: comOportunidade((o, { user }) => {
      const d = ddiDe(o);
      if (d.status === 'NAO_ELEGIVEL') return semConteudo();
      if (['PENDENTE', 'EM_ANDAMENTO', 'ERRO'].includes(d.status)) {
        // A ferramenta de integridade conclui sem apontamentos.
        Object.assign(d, {
          status: 'CONCLUIDA',
          risco: 'BAIXO',
          riscoMotor: 'BAIXO',
          score: 84,
          racional: 'Nenhum apontamento relevante nas bases consultadas (sanções, PEP, mídia negativa, processos).',
          criterios: ['Listas de sanções', 'Pessoas expostas politicamente', 'Mídia negativa', 'Processos judiciais'],
          achados: [],
          updatedAt: agoraIso(),
        } satisfies Partial<BackendDdi>);
      }
      return json<DdiResult>(ddiParaTela(ddiDe(o), user));
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/ddi/reclassify',
    handler: comOportunidade((o, { body, user }) => {
      if (!body || typeof body !== 'object') return erro(400, 'Corpo inválido.');
      if (!temPapel(user, ...PAPEIS_INTEGRIDADE)) return ddiProibido();
      const risco = RISCO_PT[texto(body, 'reclassifiedTo')];
      const parecer = texto(body, 'rationale');
      const decisao = texto(body, 'decision');
      if (!risco) return ddiInvalido('DDI_RECLASSIFY_INVALID', 'Informe a classificação de risco (baixo, médio ou alto).');
      if (parecer.length < 10) return ddiInvalido('DDI_RECLASSIFY_INVALID', 'O parecer da Integridade deve ter ao menos 10 caracteres.');
      if (decisao !== 'release' && decisao !== 'reject') {
        return ddiInvalido('DDI_RECLASSIFY_INVALID', 'Informe a decisão da Integridade: liberar ou reprovar.');
      }
      const d = ddiDe(o);
      if (!d.emTratativa) {
        return ddiInvalido(
          'DDI_RECLASSIFY_INVALID',
          d.status === 'LIBERADA'
            ? 'A DDI já foi liberada pela Integridade e não está mais em tratativa.'
            : 'A DDI não está aguardando parecer da Integridade.',
        );
      }
      Object.assign(d, {
        risco,
        parecerIntegridade: parecer,
        status: decisao === 'release' ? 'LIBERADA' : 'REPROVADA',
        ltDecisao: null,
        ltJustificativa: null,
        updatedAt: agoraIso(),
      } satisfies Partial<BackendDdi>);
      return json<DdiResult>(ddiParaTela(ddiDe(o), user));
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/ddi/decision',
    handler: comOportunidade((o, { body, user }) => {
      if (!body || typeof body !== 'object') return erro(400, 'Corpo inválido.');
      if (!temPapel(user, 'LT', 'ADMIN')) return ddiProibido();
      const acao = texto(body, 'action');
      const justificativa = texto(body, 'justification');
      if (acao !== 'proceed_with_clauses' && acao !== 'cancel') {
        return ddiInvalido('DDI_DECISION_INVALID', 'Escolha seguir com cláusulas ou cancelar a oportunidade.');
      }
      if (acao === 'cancel' && !justificativa) {
        return ddiInvalido('DDI_DECISION_INVALID', 'A justificativa é obrigatória para cancelar a oportunidade.');
      }
      const d = ddiDe(o);
      if (d.status !== 'AGUARDANDO_LT') {
        return ddiInvalido('DDI_DECISION_INVALID', 'A decisão do LT só cabe quando a Integridade classificou o risco como ALTO e aguarda o LT.');
      }
      Object.assign(d, {
        status: acao === 'cancel' ? 'CANCELADA' : 'LIBERADA',
        ltDecisao: acao === 'cancel' ? 'cancelar' : 'seguir_com_clausulas',
        ltJustificativa: justificativa || null,
        updatedAt: agoraIso(),
      } satisfies Partial<BackendDdi>);
      return json<DdiResult>(ddiParaTela(ddiDe(o), user));
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/ddi/solicitar-revisao',
    handler: comOportunidade((o, { body, user }) => {
      if (!body || typeof body !== 'object') return erro(400, 'Corpo inválido.');
      if (!temPapel(user, 'LT', 'ADMIN')) return ddiProibido();
      const justificativa = texto(body, 'justification');
      const d = ddiDe(o);
      if (d.status !== 'REPROVADA') {
        return ddiInvalido('DDI_REVISAO_INVALID', 'A análise de integridade não está reprovada — não há revisão a pedir.');
      }
      if (justificativa.length < 20) {
        return ddiInvalido('DDI_REVISAO_INVALID', 'Descreva o que foi tratado dos apontamentos (mínimo de 20 caracteres).');
      }
      Object.assign(d, { status: 'PENDENTE_PARECER', ltMotivoRevisao: justificativa, updatedAt: agoraIso() } satisfies Partial<BackendDdi>);
      return json<DdiResult>(ddiParaTela(ddiDe(o), user));
    }),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/ddi/solicitar-documento',
    handler: comOportunidade((o, { body, user }) => {
      if (!body || typeof body !== 'object') return erro(400, 'Corpo inválido.');
      if (!temPapel(user, ...PAPEIS_INTEGRIDADE)) {
        return erroBackend(403, 'FORBIDDEN', 'Somente a Integridade pode solicitar documentos da DDI.');
      }
      const documento = texto(body, 'documento');
      const motivo = texto(body, 'motivo');
      if (!documento || !motivo) {
        return erroBackend(400, 'VALIDATION_ERROR', 'Informe o documento e o motivo da solicitação.');
      }
      const d = ddiDe(o);
      if (!d.emTratativa) {
        return erroBackend(400, 'BAD_REQUEST', `A DDI está com status ${d.status} e não aceita mais solicitação de documento.`);
      }
      // A pendência ao LT é do domínio de pendências; aqui devolvemos só o id dela.
      return json<{ pendenciaId: string }>({ pendenciaId: novoId('pen') }, 201);
    }),
  },

  // ─────────────── Perfil de crédito ───────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/perfil-credito',
    handler: comOportunidade((o) => {
      // Oportunidade fora do elenco: o levantamento ainda não começou.
      const perfil = o.id in PERFIS_CREDITO ? PERFIS_CREDITO[o.id] : PERFIS_CREDITO['opp-001'];
      return perfil === null ? semConteudo() : json<PerfilCredito>(perfil);
    }),
  },
]);
