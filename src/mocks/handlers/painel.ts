import {
  mapAuditoriaListResponse,
  type BackendAuditoriaEntry,
} from '@/lib/auditoria/auditoria-mapping';
import type { AuditoriaEventTipo, ListAuditoriaResult } from '@/lib/auditoria/types';
import {
  mapDashboardAnalisePrevia,
  type AnalisePreviaData,
  type BackendDashboardAnalisePrevia,
} from '@/lib/dashboard/analise-previa-mapping';
import {
  mapDashboardAtivacaoPagamento,
  type AtivacaoPagamentoData,
  type BackendDashboardAtivacaoPagamento,
} from '@/lib/dashboard/ativacao-pagamento-mapping';
import { mapDashboardDevolutivas, type DevolutivasData } from '@/lib/dashboard/devolutivas-mapping';
import {
  mapDashboardOportunidadesAtribuidas,
  type BackendDashboardOportunidadesAtribuidas,
  type BackendOportunidadeAtribuidaItem,
  type OportunidadesAtribuidasData,
} from '@/lib/dashboard/oportunidades-atribuidas-mapping';
import type { PipelineData, PipelinePhase, TopOportunidade } from '@/lib/dashboard/pipeline-types';
import {
  isSelo,
  mapDashboardRequerAcao,
  type BackendDashboardRequerAcao,
  type BackendRequerAcaoItem,
  type RequerAcaoData,
} from '@/lib/dashboard/requer-acao-mapping';
import {
  mapDashboardResumo,
  type BackendAnalistaItem,
  type BackendDashboardResumo,
  type BackendSecao,
  type BackendAtributoItem,
  type DashboardResumo,
} from '@/lib/dashboard/resumo-mapping';
import {
  mapDistribuicaoPorAnalista,
  mapDistribuicaoPorFase,
  mapIndicadoresSneg,
  type BackendIndicadoresSneg,
  type DistribuicaoPorAnalistaData,
  type DistribuicaoPorFaseData,
  type IndicadoresSnegData,
  type OpcaoAnalista,
} from '@/lib/dashboard/sneg-quadros-mapping';
import { mapBackendInbox } from '@/lib/notifications/notifications-mapping';
import type {
  BackendNotification,
  InboxResult,
  NotificationPreferencesResponse,
  UpdateNotificationPreferencesPayload,
} from '@/lib/notifications/notifications.types';
import {
  mapPendenciaAreaOptions,
  mapPendenciaDetalhe,
  mapPendenciaListResponse,
  mapPendenciaPatchToBackend,
  statusFilterToBackend,
  prioridadeFilterToBackend,
  type BackendPendenciaDetail,
} from '@/lib/pendencias/pendencia-mapping';
import type {
  ListPendenciasResult,
  PendenciaAnexo,
  PendenciaAreaOption,
  PendenciaDetalhe,
} from '@/lib/pendencias/types';
import type { OpportunityStatus } from '@/lib/opportunities/types';

import {
  arquivoEnviado,
  campo,
  csv,
  erro,
  imagem,
  json,
  pdf,
  semConteudo,
} from '../core/respostas';
import { rotas, type MockContext } from '../core/router';
import { perfilPorChave, temPapel, usuarioPorId, type MockUser } from '../core/session';
import { fatia } from '../core/store';
import type { EstadoBackend, FaseListagem, OportunidadeElenco } from '../elenco';
import { ORDEM_ESTADOS, ROTULO_FASE, oportunidade, oportunidades } from '../estado-compartilhado';
import { sementeAuditoria } from '../dados/painel/auditoria';
import {
  CANAIS,
  EVENTOS_PREFERENCIA,
  sementeInbox,
  sementePreferencias,
} from '../dados/painel/notificacoes';
import {
  novoEvento,
  sementePendencias,
  type PendenciaMock,
  type PrioridadePendencia,
  type StatusPendencia,
  type TipoPendencia,
} from '../dados/painel/pendencias';
import {
  PRIORIDADE_LABEL,
  RECUSA_POR_FLUXO,
  RESOLUCAO_MANUAL,
  STATUS_LABEL,
  TRANSICOES,
  ativa,
  areaLabel,
  clienteDaOpp,
  faixa,
  mensagemEncerramentoNegado,
  noRecorte,
  normalizar,
  paraDetalhe,
  paraItemDaLista,
  personaDe,
  podeEncerrar,
  responsavelDisplay,
  selo,
  slaDias,
  slaLabel,
  temWidget,
  visivel,
} from '../dados/painel/regras';
import { prazoEmDias } from '../dados/painel/tempo';

/**
 * Domínio `painel`: home (dashboard por persona), sino de notificações,
 * trilha de auditoria e o painel/ticket de pendências.
 *
 * Toda resposta passa pelo MESMO mapper que a BFF de produção usa — o mock
 * monta o payload do backend e o mapper o converte no tipo do front.
 */

// ── Estado ──────────────────────────────────────────────────────────────────

const pendencias = fatia<PendenciaMock[]>('painel-pendencias', sementePendencias);
const inbox = fatia<Record<string, BackendNotification[]>>('painel-inbox', sementeInbox);
const preferencias = fatia<Record<string, NotificationPreferencesResponse>>('painel-preferencias', () => ({}));
const auditoria = fatia<BackendAuditoriaEntry[]>('painel-auditoria', sementeAuditoria);
const sequencias = fatia('painel-contadores', () => ({ id: 5000 }));

/**
 * Contador próprio do domínio, em vez do `novoId` do core: num `next dev` que
 * já estava de pé antes de o registro do store ganhar o campo `contador`, o
 * `novoId` devolvia `NaN` e todo id novo colidia.
 */
function novoId(prefixo: string): string {
  const s = sequencias();
  s.id += 1;
  return `${prefixo}-${s.id}`;
}

const SEM_ANALISTA = 'SEM_ANALISTA';

function u(ctx: MockContext): MockUser {
  // O dispatcher já recusou a requisição sem sessão (rotas não públicas).
  return ctx.user as MockUser;
}

function nomeDe(id: string | null | undefined): string | null {
  return id ? (usuarioPorId(id)?.name ?? null) : null;
}

/**
 * Pendência cujo fluxo fecha NOUTRA tela (DDI, garantia, reenvio, hub...) é
 * encerrada quando a oportunidade avança além da fase em que ela nasceu — é o
 * que o consumidor de eventos do backend faz quando o outro domínio decide.
 * Assim, se outra tela do protótipo mover a fase, o painel acompanha.
 */
function sincronizar(): PendenciaMock[] {
  const lista = pendencias();
  for (const p of lista) {
    if (!ativa(p) || RESOLUCAO_MANUAL.includes(p.acaoResolucao)) continue;
    const o = oportunidade(p.opportunityId);
    if (!o || ORDEM_ESTADOS.indexOf(o.estado) <= ORDEM_ESTADOS.indexOf(p.faseOrigem)) continue;
    p.status = 'RESOLVIDA';
    p.resolvidaEm = new Date().toISOString();
    p.historico.push(
      novoEvento(novoId('pev'), 'RESOLUCAO', 'sistema', `Resolvida automaticamente: a oportunidade avançou para "${ROTULO_FASE[o.fase]}".`),
    );
  }
  return lista;
}

function pendenciaPorId(id: string): PendenciaMock | undefined {
  return sincronizar().find((p) => p.id === id);
}

function notificar(userId: string | null | undefined, n: Omit<BackendNotification, 'id' | 'createdAt' | 'lidaEm'>) {
  if (!userId) return;
  const caixa = (inbox()[userId] ??= []);
  caixa.unshift({ ...n, id: novoId('ntf'), createdAt: new Date().toISOString(), lidaEm: null });
}

function auditar(user: MockUser, p: PendenciaMock, acao: string, acaoCodigo: string, detalhe: string, extra: Partial<BackendAuditoriaEntry> = {}) {
  const o = oportunidade(p.opportunityId);
  auditoria().unshift({
    id: novoId('aud'),
    dataHora: new Date().toISOString(),
    usuario: user.name,
    perfil: perfilPorChave(user.profileKey)?.label ?? null,
    tipo: 'critica',
    acao,
    acaoCodigo,
    objeto: p.code,
    oportunidade: o?.code ?? null,
    cliente: clienteDaOpp(o)?.razaoSocial ?? null,
    detalhe,
    estadoAnterior: null,
    estadoPosterior: null,
    motivo: null,
    ...extra,
  });
}

function detalhe(p: PendenciaMock, user: MockUser): Response {
  return json<PendenciaDetalhe>(mapPendenciaDetalhe(paraDetalhe(p, user)));
}

/** Ordem do painel: ativas por SLA (atrasadas primeiro), depois as encerradas. */
function ordenar(a: PendenciaMock, b: PendenciaMock): number {
  const aa = ativa(a) ? 0 : 1;
  const bb = ativa(b) ? 0 : 1;
  if (aa !== bb) return aa - bb;
  if (aa === 1) return (b.resolvidaEm ?? '').localeCompare(a.resolvidaEm ?? '');
  const sa = slaDias(a) ?? 999;
  const sb = slaDias(b) ?? 999;
  if (sa !== sb) return sa - sb;
  const peso = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
  return peso[a.prioridade] - peso[b.prioridade];
}

function visiveisAtivas(user: MockUser): PendenciaMock[] {
  return sincronizar().filter((p) => ativa(p) && visivel(p, user)).sort(ordenar);
}

function paginar<T>(itens: T[], q: URLSearchParams): { pagina: T[]; page: number | null; limit: number | null; hasMore: boolean } {
  const page = q.get('page') ? Math.max(1, Number(q.get('page')) || 1) : null;
  const limit = q.get('limit') ? Math.max(1, Number(q.get('limit')) || 10) : null;
  if (page === null && limit === null) return { pagina: itens, page: null, limit: null, hasMore: false };
  const p = page ?? 1;
  const l = limit ?? 10;
  const inicio = (p - 1) * l;
  return { pagina: itens.slice(inicio, inicio + l), page: p, limit: l, hasMore: inicio + l < itens.length };
}

const proibido = (msg: string) => erro(403, msg);

// ── Dashboard: dados fixos do cenário ───────────────────────────────────────

/** Valores de concessão que cada garantia em análise prévia lastreia (CCOB). */
const PREVIA: Record<string, { analistaId: string | null; bonificacao: number; novoMutuo: number; mutuo: number }> = {
  'opp-003': { analistaId: 'usr-ccob-gabriela', bonificacao: 650_000, novoMutuo: 1_200_000, mutuo: 0 },
  'opp-004': { analistaId: null, bonificacao: 0, novoMutuo: 0, mutuo: 900_000 },
  'opp-005': { analistaId: 'usr-ccob-gabriela', bonificacao: 180_000, novoMutuo: 0, mutuo: 0 },
};

/** Garantias com atribuição a analista SNEG (opp → analista). */
const GARANTIA_ATRIBUIDA: Record<string, string | null> = {
  'opp-003': 'usr-sneg-carla',
  'opp-004': null,
};

const GERENCIA_POR_UF: Record<string, string> = {
  SC: 'Gerência · Regional Sul',
  RS: 'Gerência · Regional Sul',
  GO: 'Gerência · Centro-Oeste',
  DF: 'Gerência · Centro-Oeste',
  BA: 'Gerência · Nordeste',
};

/** Dias médios na fase (`stage_periods`) — medida, nunca veredito. */
const PERMANENCIA: Partial<Record<EstadoBackend, number>> = {
  EM_PREENCHIMENTO: 6.5,
  EM_ANALISE: 4.2,
  EM_APROVACAO: 2.8,
  EM_MINUTA: 5.1,
  EM_ASSINATURA: 3.4,
  EM_PAGAMENTO: 6.0,
};

const STATUS_DO_ESTADO: Record<EstadoBackend, OpportunityStatus> = {
  NOVOS: 'preenchimento',
  EM_PREENCHIMENTO: 'preenchimento',
  EM_ANALISE: 'análise',
  EM_APROVACAO: 'aprovação',
  EM_MINUTA: 'contrato',
  EM_ASSINATURA: 'contrato',
  EM_PAGAMENTO: 'contrato',
  CONCLUIDA: 'concluída',
};

const FASES_LISTAGEM: FaseListagem[] = ['PREENCHIMENTO', 'ANALISE', 'APROVACAO', 'MINUTA', 'ASSINATURA', 'ATIVACAO', 'PAGAMENTO', 'CONCLUIDA'];

/** VPL só existe depois que a proposta sai do preenchimento (o ARP calcula). */
function temVpl(o: OportunidadeElenco): boolean {
  return o.estado !== 'EM_PREENCHIMENTO' && o.estado !== 'NOVOS';
}

function atributos(lista: OportunidadeElenco[]): BackendAtributoItem[] {
  const com = (tipo: string) => lista.filter((o) => o.propostas.some((p) => p.tipo === tipo)).length;
  return [
    { atributo: 'BR_MANIA', label: 'BR Mania', total: com('ZBRM') },
    { atributo: 'LUBRAX', label: 'Lubrax+', total: com('ZLUB') },
    { atributo: 'POSTO', label: 'Posto', total: com('PCR') },
  ];
}

function opcoesAnalista(lista: OportunidadeElenco[], analistaDe: (o: OportunidadeElenco) => string | null): OpcaoAnalista[] {
  const mapa = new Map<string, number>();
  for (const o of lista) {
    const id = analistaDe(o) ?? SEM_ANALISTA;
    mapa.set(id, (mapa.get(id) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([id, total]) => ({ id, nome: id === SEM_ANALISTA ? 'Sem analista' : (nomeDe(id) ?? id), total }))
    .sort((a, b) => (a.id === SEM_ANALISTA ? 1 : b.id === SEM_ANALISTA ? -1 : a.nome.localeCompare(b.nome)));
}

function filtrarPorAnalista<T>(lista: T[], analistaId: string | null, analistaDe: (x: T) => string | null): T[] {
  if (!analistaId) return lista;
  return lista.filter((x) => (analistaDe(x) ?? SEM_ANALISTA) === analistaId);
}

interface Atribuicao {
  o: OportunidadeElenco;
  tipo: 'ANALISE' | 'GARANTIA' | 'MINUTA';
  analistaId: string | null;
}

const ATRIBUICAO_LABEL = { ANALISE: 'Análise', GARANTIA: 'Garantia', MINUTA: 'Minuta' } as const;

function atribuicoes(): Atribuicao[] {
  const out: Atribuicao[] = [];
  for (const o of oportunidades()) {
    if (o.estado === 'EM_ANALISE') {
      out.push({ o, tipo: 'ANALISE', analistaId: o.analistaSnegId });
      if (o.id in GARANTIA_ATRIBUIDA) out.push({ o, tipo: 'GARANTIA', analistaId: GARANTIA_ATRIBUIDA[o.id] });
    }
    if (o.estado === 'EM_MINUTA') out.push({ o, tipo: 'MINUTA', analistaId: o.analistaSnegId });
  }
  return out;
}

function hrefAtribuicao(a: Atribuicao, user: MockUser): string {
  if (a.tipo === 'ANALISE') return `/oportunidades/${a.o.id}/analise`;
  if (a.tipo === 'GARANTIA' && temPapel(user, 'LT', 'SNEG', 'CCOB', 'ADMIN')) return `/oportunidades/${a.o.id}/garantia`;
  return `/oportunidades/${a.o.id}`;
}

// ── Rotas: dashboard ────────────────────────────────────────────────────────

function resumo(ctx: MockContext): Response {
  const user = u(ctx);
  const persona = personaDe(user);
  const vis = visiveisAtivas(user);
  const escopo = noRecorte(user, oportunidades());
  const souSneg = persona?.id === 'SNEG';
  // A SNEG conta só as oportunidades atribuídas a ela (pedido de 20/09/2026).
  const baseAtributo = souSneg ? oportunidades().filter((o) => o.analistaSnegId === user.id) : persona ? escopo : [];

  const porAtributo: BackendSecao<BackendAtributoItem> = {
    status: 'ok',
    itens: atributos(baseAtributo),
    gaps: [],
    ...(souSneg ? { escopoLabel: 'Oportunidades atribuídas a você' } : {}),
  };

  let porAnalista: BackendSecao<BackendAnalistaItem> | null = null;
  if (persona?.widgets.includes('POR_ANALISTA')) {
    const emAnalise = oportunidades().filter((o) => o.estado === 'EM_ANALISE');
    porAnalista = {
      status: 'ok',
      itens: opcoesAnalista(emAnalise, (o) => o.analistaSnegId).map((a) => ({
        analistaId: a.id === SEM_ANALISTA ? null : a.id,
        analistaNome: a.id === SEM_ANALISTA ? null : a.nome,
        total: a.total,
      })),
      gaps: [],
    };
  }

  const raw: BackendDashboardResumo = {
    persona: persona?.id ?? '',
    // O backend põe o nome em `saudacao.nome`; o front lê `nomeUsuario`, que
    // chega nulo em produção — o cabeçalho usa a sessão.
    nomeUsuario: null,
    widgets: persona?.widgets ?? [],
    saudacao: {
      itensCriticos: vis.filter((p) => p.obrigatoria).length,
      tarefasAbertas: vis.length,
      recorte: persona?.recorte ?? 'AREA',
    },
    kpis: [],
    requerAcao: [],
    principaisOportunidades: [],
    pipeline: [],
    pendencias: [],
    porAtributo,
    porAnalista,
  };
  return json<DashboardResumo>(mapDashboardResumo(raw));
}

function pipeline(ctx: MockContext): Response {
  const user = u(ctx);
  const persona = personaDe(user);
  const escopo = persona ? noRecorte(user, oportunidades()) : [];

  // Mesma agregação da rota de produção: estado do backend → coluna do Kanban,
  // permanência média ponderada pelo total de cada estado.
  const baldes = new Map<OpportunityStatus, { soma: number; comDado: number; total: number }>();
  for (const o of escopo) {
    const status = STATUS_DO_ESTADO[o.estado];
    const b = baldes.get(status) ?? { soma: 0, comDado: 0, total: 0 };
    b.total += 1;
    const dias = PERMANENCIA[o.estado];
    if (dias !== undefined) {
      b.soma += dias;
      b.comDado += 1;
    }
    baldes.set(status, b);
  }
  const ordem: OpportunityStatus[] = ['preenchimento', 'análise', 'aprovação', 'contrato', 'concluída'];
  const phases: PipelinePhase[] = ordem.map((status) => {
    const b = baldes.get(status);
    return { status, total: b?.total ?? 0, avgPermanenciaDias: b && b.comDado > 0 ? Math.round((b.soma / b.comDado) * 10) / 10 : null };
  });

  if (!persona) return json<PipelineData>({ phases, kpis: null, principaisPorValor: [] });

  const comValor = escopo.filter(temVpl);
  const valor = comValor.reduce((s, o) => s + o.valorEstimado, 0);
  const principais: TopOportunidade[] = [...comValor]
    .sort((a, b) => b.valorEstimado - a.valorEstimado)
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      code: o.code,
      customerName: clienteDaOpp(o)?.razaoSocial ?? null,
      titulo: o.titulo,
      fase: o.estado,
      faseLabel: ROTULO_FASE[o.fase],
      responsavelNome: nomeDe(o.ltId),
      valor: o.valorEstimado.toFixed(2),
    }));

  return json<PipelineData>({
    phases,
    kpis: {
      pendenciasAbertas: visiveisAtivas(user).length,
      emAprovacao: escopo.filter((o) => o.estado === 'EM_APROVACAO').length,
      aguardandoAssinatura: escopo.filter((o) => o.estado === 'EM_ASSINATURA').length,
      valorPipeline: valor.toFixed(2),
      ticketMedio: comValor.length ? (valor / comValor.length).toFixed(2) : null,
      totalOportunidades: escopo.length,
      oportunidadesComValor: comValor.length,
    },
    principaisPorValor: principais,
  });
}

function requerAcao(ctx: MockContext): Response {
  const user = u(ctx);
  const persona = personaDe(user);
  const seloParam = ctx.query.get('selo');
  if (seloParam && !isSelo(seloParam)) return erro(400, 'O filtro "selo" é inválido.');

  const vis = visiveisAtivas(user);
  const contexto = (p: PendenciaMock) => {
    const o = oportunidade(p.opportunityId);
    return o ? `${clienteDaOpp(o)?.nomeFantasia ?? '—'} · ${o.code}` : null;
  };
  const item = (p: PendenciaMock, extra: Partial<BackendRequerAcaoItem> = {}): BackendRequerAcaoItem => ({
    id: p.id,
    titulo: p.titulo,
    contexto: contexto(p),
    sla: p.prazo,
    slaLabel: slaLabel(p),
    selo: selo(p),
    responsavel: responsavelDisplay(p),
    href: `/v1/pendencias/${p.id}`,
    acaoLabel: RESOLUCAO_MANUAL.includes(p.acaoResolucao) && podeEncerrar(p, user) ? 'Resolver' : 'Abrir',
    ...extra,
  });

  let raw: BackendDashboardRequerAcao;
  if (persona?.id === 'DDI') {
    const ddi = vis.filter((p) => p.origem.startsWith('ddi:') && p.area === 'COMPLIANCE');
    raw = {
      total: ddi.length,
      porSelo: [],
      agrupadoPor: 'DDI',
      grupos: [{ pgrp: null, itens: ddi.slice(0, 5).map((p) => item(p, { href: `/v1/opportunities/${p.opportunityId}/ddi`, acaoLabel: 'Emitir parecer' })) }],
      gaps: [],
    };
  } else if (persona?.agrupamento === 'GERENCIA') {
    // CCOB: análises prévias agrupadas pela gerência da oportunidade, sem selo.
    const previas = vis.filter((p) => p.acaoResolucao === 'previa_garantia');
    const grupos = new Map<string, BackendRequerAcaoItem[]>();
    for (const p of previas) {
      const uf = clienteDaOpp(oportunidade(p.opportunityId))?.uf ?? '';
      const g = GERENCIA_POR_UF[uf] ?? 'Gerência · Sudeste';
      grupos.set(g, [
        ...(grupos.get(g) ?? []),
        item(p, { selo: null, href: `/v1/opportunities/${p.opportunityId}/garantia`, acaoLabel: 'Analisar' }),
      ]);
    }
    raw = { total: previas.length, porSelo: [], agrupadoPor: 'GERENCIA', grupos: [...grupos].map(([pgrp, itens]) => ({ pgrp, itens })), gaps: [] };
  } else {
    const filtradas = seloParam ? vis.filter((p) => selo(p) === seloParam) : vis;
    raw = {
      total: filtradas.length,
      porSelo: (['CRITICA', 'ATENCAO', 'ANDAMENTO'] as const).map((s) => ({ selo: s, total: vis.filter((p) => selo(p) === s).length })),
      agrupadoPor: 'NENHUM',
      grupos: [{ pgrp: null, itens: filtradas.slice(0, 5).map((p) => item(p)) }],
      gaps: [],
    };
  }
  return json<RequerAcaoData>(mapDashboardRequerAcao(raw));
}

function analisePrevia(ctx: MockContext): Response {
  const user = u(ctx);
  if (!temWidget(user, 'GARANTIAS')) return proibido('Visão de análise prévia não disponível para este perfil.');

  const todas = oportunidades().filter((o) => o.estado === 'EM_ANALISE' && o.id in PREVIA);
  const analistaDe = (o: OportunidadeElenco) => PREVIA[o.id].analistaId;
  const filtradas = filtrarPorAnalista(todas, ctx.query.get('analistaId'), analistaDe);
  const { pagina, page, limit, hasMore } = paginar(filtradas, ctx.query);

  const raw: BackendDashboardAnalisePrevia = {
    itens: pagina.map((o) => {
      const v = PREVIA[o.id];
      return {
        oportunidadeId: o.id,
        codigo: o.code,
        clienteNome: clienteDaOpp(o)?.razaoSocial ?? null,
        analistaId: v.analistaId,
        analistaNome: nomeDe(v.analistaId),
        bonificacaoAntecipadaBRL: v.bonificacao,
        novoMutuoBRL: v.novoMutuo,
        mutuoBRL: v.mutuo,
        totalBRL: v.bonificacao + v.novoMutuo + v.mutuo,
        href: `/oportunidades/${o.id}/garantia`,
      };
    }),
    total: filtradas.length,
    analistas: opcoesAnalista(todas, analistaDe),
    page,
    limit,
    hasMore,
    gaps: [],
  };
  return json<AnalisePreviaData>(mapDashboardAnalisePrevia(raw));
}

function ativacaoPagamento(ctx: MockContext): Response {
  const user = u(ctx);
  if (!temWidget(user, 'OPORTUNIDADES_ATIVACAO_PAGAMENTO')) {
    return proibido('Quadro de ativação e pagamento não disponível para este perfil.');
  }
  // Todas em EM_PAGAMENTO; a fase sai do espelho do org — no cenário só a
  // opp-009 já tem os contratos ativos ("Em pagamento"), as demais "Ativação".
  const lista = oportunidades()
    .filter((o) => o.estado === 'EM_PAGAMENTO')
    .sort((a, b) => a.code.localeCompare(b.code));
  const { pagina, page, limit, hasMore } = paginar(lista, ctx.query);
  const raw: BackendDashboardAtivacaoPagamento = {
    itens: pagina.map((o) => {
      const pagamento = o.id === 'opp-009';
      return {
        oportunidadeId: o.id,
        codigo: o.code,
        clienteNome: clienteDaOpp(o)?.razaoSocial ?? null,
        fase: pagamento ? 'PAGAMENTO' : 'ATIVACAO',
        faseLabel: pagamento ? 'Em pagamento' : 'Ativação dos Contratos',
        href: `/oportunidades/${o.id}`,
      };
    }),
    total: lista.length,
    page,
    limit,
    hasMore,
    gaps: [],
  };
  return json<AtivacaoPagamentoData>(mapDashboardAtivacaoPagamento(raw));
}

function oportunidadesAtribuidas(ctx: MockContext): Response {
  const user = u(ctx);
  const persona = personaDe(user);
  if (!persona?.widgets.includes('OPORTUNIDADES_ATRIBUIDAS')) {
    return proibido('Quadro de oportunidades atribuídas não disponível para este perfil.');
  }
  const proprio = persona.id === 'SNEG';
  let lista = atribuicoes();
  if (proprio) {
    lista = lista.filter((a) => a.analistaId === user.id);
  } else {
    // BP Financeiro: uma linha por oportunidade (Evolução do Dashboard SNEG).
    lista = lista.filter((a, i) => lista.findIndex((x) => x.o.id === a.o.id) === i);
  }
  // Quem vê só as próprias não tem seletor: vocabulário vazio.
  const vocabulario = proprio ? [] : opcoesAnalista(lista.map((a) => ({ ...a.o, analistaSnegId: a.analistaId })), (o) => o.analistaSnegId);
  const filtradas = proprio ? lista : filtrarPorAnalista(lista, ctx.query.get('analistaId'), (a) => a.analistaId);
  filtradas.sort((a, b) => b.o.criadaEm.localeCompare(a.o.criadaEm));
  const { pagina, page, limit, hasMore } = paginar(filtradas, ctx.query);

  const raw: BackendDashboardOportunidadesAtribuidas = {
    itens: pagina.map(
      (a): BackendOportunidadeAtribuidaItem => ({
        oportunidadeId: a.o.id,
        codigo: a.o.code,
        clienteNome: clienteDaOpp(a.o)?.razaoSocial ?? null,
        atribuicao: a.tipo,
        atribuicaoLabel: ATRIBUICAO_LABEL[a.tipo],
        analistaId: a.analistaId,
        analistaNome: nomeDe(a.analistaId),
        dataCadastro: a.o.criadaEm,
        href: hrefAtribuicao(a, user),
      }),
    ),
    total: filtradas.length,
    contagem: proprio ? 'ATRIBUICOES' : 'OPORTUNIDADES',
    analistas: vocabulario,
    page,
    limit,
    hasMore,
    gaps: [],
  };
  return json<OportunidadesAtribuidasData>(mapDashboardOportunidadesAtribuidas(raw));
}

const apenasBp = (user: MockUser, widget: string) =>
  temWidget(user, widget) ? null : proibido(`Widget ${widget} não disponível para o perfil atual.`);

function distribuicaoPorFase(ctx: MockContext): Response {
  const user = u(ctx);
  const negado = apenasBp(user, 'DISTRIBUICAO_POR_FASE');
  if (negado) return negado;
  const todas = oportunidades();
  const filtradas = filtrarPorAnalista(todas, ctx.query.get('analistaId'), (o) => o.analistaSnegId);
  return json<DistribuicaoPorFaseData>(
    mapDistribuicaoPorFase({
      itens: FASES_LISTAGEM.map((fase) => ({ fase, label: ROTULO_FASE[fase], total: filtradas.filter((o) => o.fase === fase).length })),
      total: filtradas.length,
      analistas: opcoesAnalista(todas, (o) => o.analistaSnegId),
      gaps: [],
    }),
  );
}

function distribuicaoPorAnalista(ctx: MockContext): Response {
  const user = u(ctx);
  const negado = apenasBp(user, 'POR_ANALISTA_POR_STATUS');
  if (negado) return negado;
  const fase = ctx.query.get('fase');
  if (fase && !FASES_LISTAGEM.includes(fase as FaseListagem)) return erro(400, 'O filtro "fase" é inválido.');
  const lista = fase ? oportunidades().filter((o) => o.fase === fase) : oportunidades();
  return json<DistribuicaoPorAnalistaData>(
    mapDistribuicaoPorAnalista({
      itens: opcoesAnalista(lista, (o) => o.analistaSnegId).map((a) => ({
        analistaId: a.id === SEM_ANALISTA ? null : a.id,
        analistaNome: a.id === SEM_ANALISTA ? null : a.nome,
        total: a.total,
      })),
      fases: FASES_LISTAGEM.map((f) => ({ fase: f, label: ROTULO_FASE[f] })),
      gaps: [],
    }),
  );
}

function indicadoresSneg(ctx: MockContext): Response {
  const user = u(ctx);
  const negado = apenasBp(user, 'INDICADORES_SNEG');
  if (negado) return negado;
  const atribuicao = ctx.query.get('atribuicao') ?? 'ANALISE';
  if (!['ANALISE', 'GARANTIA', 'MINUTA'].includes(atribuicao)) return erro(400, 'O filtro "atribuicao" é inválido.');
  // "Sem analista" não tem ciclo medido: sem amostra ⇒ travessão, nunca zero.
  const semAmostra = ctx.query.get('analistaId') === SEM_ANALISTA;
  const v = (n: number) => (semAmostra ? null : n);
  const cartoes: BackendIndicadoresSneg['cartoes'] =
    atribuicao === 'ANALISE'
      ? [
          { indicador: 'TEMPO_MEDIO_ANALISE', label: 'Tempo médio de análise', valor: v(3.2), unidade: 'DIAS_UTEIS', slaDiasUteis: 5 },
          { indicador: 'TEMPO_MEDIO_REANALISE', label: 'Tempo médio de reanálise', valor: v(1.8), unidade: 'DIAS_UTEIS', slaDiasUteis: 3 },
          { indicador: 'TAXA_DEVOLUCOES', label: 'Taxa de devoluções', valor: v(25), unidade: 'PERCENTUAL', slaDiasUteis: null },
        ]
      : atribuicao === 'GARANTIA'
        ? [{ indicador: 'TEMPO_MEDIO_GARANTIA', label: 'Tempo médio de garantia', valor: v(4.5), unidade: 'DIAS_UTEIS', slaDiasUteis: null }]
        : [{ indicador: 'TEMPO_MEDIO_MINUTA', label: 'Tempo médio de minuta', valor: v(2.7), unidade: 'DIAS_UTEIS', slaDiasUteis: null }];
  return json<IndicadoresSnegData>(
    mapIndicadoresSneg({
      atribuicao,
      atribuicoes: (['ANALISE', 'GARANTIA', 'MINUTA'] as const).map((a) => ({ atribuicao: a, label: ATRIBUICAO_LABEL[a] })),
      analistas: opcoesAnalista(oportunidades(), (o) => o.analistaSnegId),
      cartoes,
      gaps: [],
    }),
  );
}

function devolutivas(ctx: MockContext): Response {
  const user = u(ctx);
  if (!temWidget(user, 'DEVOLUTIVAS')) return proibido('Widget de devolutivas não disponível para este perfil.');
  return json<DevolutivasData>(
    mapDashboardDevolutivas({
      recorte: 'AREA',
      kpis: { tempoMedioDevolutivaDias: '2.40', taxaReaberturas: 0.12, resolvidasPrimeiroRetorno: 0.78, amostra: 9 },
      gaps: [],
    }),
  );
}

// ── Rotas: notificações ─────────────────────────────────────────────────────

function caixaDe(user: MockUser): BackendNotification[] {
  return (inbox()[user.id] ??= []);
}

function preferenciasDe(user: MockUser): NotificationPreferencesResponse {
  return (preferencias()[user.id] ??= sementePreferencias());
}

function salvarPreferencias(ctx: MockContext): Response {
  const user = u(ctx);
  const body = (ctx.body ?? null) as UpdateNotificationPreferencesPayload | null;
  if (!body || typeof body !== 'object') return erro(400, 'Corpo inválido.');
  const { preferencias: prefs, canais, cadenciaDias } = body;
  if (prefs === undefined && canais === undefined && cadenciaDias === undefined) {
    return erro(400, 'Informe ao menos um de: preferencias, canais ou cadenciaDias.');
  }
  if (cadenciaDias !== undefined && (!Number.isInteger(cadenciaDias) || cadenciaDias < 1)) {
    return erro(400, 'A cadência deve ser de pelo menos 1 dia.');
  }
  for (const c of canais ?? []) {
    if (!CANAIS.includes(c.canal)) return erro(400, `Canal não suportado: ${c.canal}.`);
  }
  for (const p of prefs ?? []) {
    const def = EVENTOS_PREFERENCIA.find((e) => e.evento === p.evento);
    if (!def) return erro(400, `Evento fora do catálogo: ${p.evento}.`);
    if (!CANAIS.includes(p.canal)) return erro(400, `Canal não suportado: ${p.canal}.`);
    if (def.obrigatorio && !p.habilitado) return erro(400, `O evento ${p.evento} é obrigatório e não pode ser desligado.`);
  }

  const atual = preferenciasDe(user);
  for (const p of prefs ?? []) {
    const alvo = atual.preferencias.find((x) => x.evento === p.evento && x.canal === p.canal);
    if (alvo) alvo.habilitado = p.habilitado;
  }
  for (const c of canais ?? []) {
    const alvo = atual.canais.find((x) => x.canal === c.canal);
    if (alvo) alvo.habilitado = c.habilitado;
  }
  if (cadenciaDias !== undefined) atual.cadenciaDias = cadenciaDias;
  return json<NotificationPreferencesResponse>(atual);
}

// ── Rotas: auditoria ────────────────────────────────────────────────────────

const TIPOS_AUDITORIA: AuditoriaEventTipo[] = ['critica', 'transicao', 'acesso'];

function filtrarAuditoria(q: URLSearchParams): BackendAuditoriaEntry[] | Response {
  const tipo = q.get('tipo');
  if (tipo && !TIPOS_AUDITORIA.includes(tipo as AuditoriaEventTipo)) return erro(400, 'O filtro "tipo" é inválido.');
  const termo = normalizar(q.get('q'));
  const de = q.get('de');
  const ate = q.get('ate');
  return auditoria()
    .filter((e) => !tipo || e.tipo === tipo)
    .filter((e) => !de || e.dataHora.slice(0, 10) >= de.slice(0, 10))
    .filter((e) => !ate || e.dataHora.slice(0, 10) <= ate.slice(0, 10))
    .filter(
      (e) =>
        !termo ||
        [e.usuario, e.acao, e.objeto, e.detalhe, e.oportunidade, e.cliente, e.motivo].some((c) => normalizar(c).includes(termo)),
    )
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora));
}

function listarAuditoria(ctx: MockContext): Response {
  if (!temPapel(u(ctx), 'ADMIN')) return erro(403, 'Falha ao carregar registros de auditoria.');
  const r = filtrarAuditoria(ctx.query);
  if (r instanceof Response) return r;
  const limit = Math.min(500, Math.max(1, Number(ctx.query.get('limit')) || 200));
  const page = Math.max(1, Number(ctx.query.get('page')) || 1);
  return json<ListAuditoriaResult>(
    mapAuditoriaListResponse({ items: r.slice((page - 1) * limit, page * limit), total: r.length, page, limit }),
  );
}

function exportarAuditoria(ctx: MockContext): Response {
  if (!temPapel(u(ctx), 'ADMIN')) return erro(403, 'Falha ao exportar registros de auditoria.');
  const r = filtrarAuditoria(ctx.query);
  if (r instanceof Response) return erro(r.status, 'Falha ao exportar registros de auditoria.');
  const cel = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [
    ['Data/hora', 'Usuário', 'Perfil', 'Tipo', 'Ação', 'Objeto', 'Oportunidade', 'Cliente', 'Detalhe', 'Motivo'].map(cel).join(';'),
    ...r.map((e) =>
      [e.dataHora, e.usuario, e.perfil, e.tipo, e.acao, e.objeto, e.oportunidade, e.cliente, e.detalhe, e.motivo].map(cel).join(';'),
    ),
  ];
  return csv(linhas.join('\r\n'), `auditoria-${new Date().toISOString().slice(0, 10)}.csv`);
}

// ── Rotas: pendências ───────────────────────────────────────────────────────

const AREAS_DECLARADAS = ['LT/EV', 'SNEG', 'CCOB', 'COMPLIANCE', 'JURIDICO', 'ENGENHARIA'];

function listarPendencias(ctx: MockContext): Response {
  const user = u(ctx);
  const q = ctx.query;
  const ref = q.get('opportunityRef') ?? q.get('opp');
  const todas = sincronizar();

  // Com `opportunityRef` vale o acesso à oportunidade (o card da OPP lista
  // tudo); sem ele, o recorte de responsabilidade do painel (ADO 67987).
  const base = ref
    ? todas.filter((p) => {
        const o = oportunidade(p.opportunityId);
        return p.opportunityId === ref || o?.code.toLowerCase() === ref.toLowerCase();
      })
    : todas.filter((p) => visivel(p, user));

  const status = q.get('status') ? statusFilterToBackend(q.get('status')!) : null;
  const prioridade = q.get('prioridade') ? prioridadeFilterToBackend(q.get('prioridade')!) : null;
  const area = q.get('area');
  const sla = q.get('sla');
  const seloQ = q.get('selo');
  const responsavelId = q.get('responsavelId');
  const minhas = q.get('minhas') === 'true';
  const termo = normalizar(q.get('q'));

  const filtradas = base
    .filter((p) => !status || p.status === status)
    .filter((p) => !prioridade || p.prioridade === prioridade)
    .filter((p) => !area || p.area === area)
    .filter((p) => !sla || (ativa(p) && faixa(p) === sla))
    .filter((p) => !seloQ || (ativa(p) && selo(p) === seloQ))
    .filter((p) => !responsavelId || p.responsavelId === responsavelId)
    .filter((p) => !minhas || p.responsavelId === user.id)
    .filter((p) => {
      if (!termo) return true;
      const o = oportunidade(p.opportunityId);
      return [p.titulo, p.code, o?.code, clienteDaOpp(o)?.nomeFantasia, clienteDaOpp(o)?.razaoSocial, responsavelDisplay(p)].some((c) =>
        normalizar(c).includes(termo),
      );
    })
    .sort(ordenar);

  const page = Math.max(1, Number(q.get('page')) || 1);
  const limit = Math.max(1, Number(q.get('limit')) || 20);
  const ativas = base.filter(ativa);
  const semana = Date.now() - 7 * 86_400_000;

  return json<ListPendenciasResult>(
    mapPendenciaListResponse({
      items: filtradas.slice((page - 1) * limit, page * limit).map((p) => paraItemDaLista(p, user)),
      total: filtradas.length,
      totalAtivas: filtradas.filter(ativa).length,
      kpis: {
        atrasadas: ativas.filter((p) => faixa(p) === 'ATRASADA').length,
        vencemHoje: ativas.filter((p) => faixa(p) === 'VENCE_HOJE').length,
        abertas: ativas.length,
        concluidasSemana: base.filter((p) => p.status === 'RESOLVIDA' && p.resolvidaEm && new Date(p.resolvidaEm).getTime() >= semana).length,
      },
      porSelo: {
        critica: ativas.filter((p) => selo(p) === 'CRITICA').length,
        atencao: ativas.filter((p) => selo(p) === 'ATENCAO').length,
        andamento: ativas.filter((p) => selo(p) === 'ANDAMENTO').length,
      },
    }),
  );
}

function criarPendencia(dados: {
  user: MockUser;
  opp: OportunidadeElenco;
  titulo: string;
  descricao: string | null;
  tipo: TipoPendencia;
  origem: string;
  area: string | null;
  responsavelId: string | null;
  prioridade: PrioridadePendencia;
  prazo: string | null;
  canais?: string[];
  acaoResolucao: string;
  acaoResolucaoDetalhe?: string | null;
  automatica: boolean;
}): PendenciaMock {
  const ultimo = Math.max(3000, ...pendencias().map((x) => Number(x.code.replace(/\D/g, '')) || 0));
  const p: PendenciaMock = {
    id: novoId('pnd'),
    code: `PN-${ultimo + 1}`,
    opportunityId: dados.opp.id,
    titulo: dados.titulo,
    descricao: dados.descricao,
    tipo: dados.tipo,
    origem: dados.origem,
    area: dados.area,
    responsavelId: dados.responsavelId,
    status: 'ABERTA',
    prioridade: dados.prioridade,
    prazo: dados.prazo,
    canais: dados.canais ?? ['CHAT', 'EMAIL'],
    abertaEm: new Date().toISOString(),
    resolvidaEm: null,
    anexoId: null,
    automatica: dados.automatica,
    obrigatoria: false,
    acaoResolucao: dados.acaoResolucao,
    acaoResolucaoDetalhe: dados.acaoResolucaoDetalhe ?? null,
    reatribuida: false,
    faseOrigem: dados.opp.estado,
    historico: [],
    anexos: [],
  };
  p.historico.push(
    novoEvento(novoId('pev'), 'ABERTURA', dados.user.id, dados.automatica ? 'Pendência aberta.' : 'Pendência criada manualmente.'),
  );
  pendencias().unshift(p);
  auditar(dados.user, p, 'Pendência aberta', 'pendencia.criada', `${p.code} · ${p.titulo}`);
  if (dados.responsavelId && dados.responsavelId !== dados.user.id) {
    notificar(dados.responsavelId, {
      evento: 'PENDENCIA_ABERTA',
      titulo: `Nova pendência: ${p.titulo}`,
      mensagem: `${dados.opp.code} · ${clienteDaOpp(dados.opp)?.nomeFantasia ?? ''}`,
      link: `/pendencias/${p.id}`,
      referenciaTipo: 'pendencia',
      referenciaId: p.id,
    });
  }
  return p;
}

const TIPOS: TipoPendencia[] = ['DOCUMENTACAO', 'ANALISE', 'APROVACAO', 'OUTRO'];
const PRIORIDADES: PrioridadePendencia[] = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];

function postPendencia(ctx: MockContext): Response {
  const user = u(ctx);
  const b = (ctx.body ?? {}) as Record<string, unknown>;
  const titulo = typeof b.titulo === 'string' ? b.titulo.trim() : '';
  if (titulo.length < 3) return erro(400, 'O título deve ter ao menos 3 caracteres.');
  const tipo = (b.tipo ?? 'OUTRO') as TipoPendencia;
  if (!TIPOS.includes(tipo)) return erro(400, 'O campo tipo é inválido.');
  const prioridade = (b.prioridade ?? 'MEDIA') as PrioridadePendencia;
  if (!PRIORIDADES.includes(prioridade)) return erro(400, 'O campo prioridade é inválido.');
  const opp = typeof b.opportunityId === 'string' ? oportunidade(b.opportunityId) : undefined;
  // O backend aceita pendência sem oportunidade; o protótipo exige, porque
  // toda tela do painel a exibe ancorada numa oportunidade do elenco.
  if (!opp) return erro(400, 'Informe uma oportunidade válida (opportunityId).');
  const responsavelId = typeof b.responsavelId === 'string' ? b.responsavelId : user.id;
  if (!usuarioPorId(responsavelId)) return erro(400, `Colaborador "${responsavelId}" não encontrado no diretório.`);

  const p = criarPendencia({
    user,
    opp,
    titulo,
    descricao: typeof b.descricao === 'string' ? b.descricao : null,
    tipo,
    origem: typeof b.origem === 'string' ? b.origem : 'manual',
    area: typeof b.area === 'string' ? b.area : null,
    responsavelId,
    prioridade,
    prazo: typeof b.prazo === 'string' ? b.prazo : null,
    canais: Array.isArray(b.canais) ? (b.canais as string[]) : undefined,
    acaoResolucao: tipo === 'DOCUMENTACAO' ? 'upload' : 'marcar',
    automatica: false,
  });
  // Passthrough na BFF de produção: o corpo é o `PendenciaDetailDto` do backend.
  return json<BackendPendenciaDetail>(paraDetalhe(p, user), 201);
}

function postReenvio(ctx: MockContext): Response {
  const user = u(ctx);
  const opportunityId = campo<string>(ctx.body, 'opportunityId');
  const tipoDocumento = campo<string>(ctx.body, 'tipoDocumento')?.trim();
  if (!opportunityId || !tipoDocumento) return erro(400, 'Informe a oportunidade e o documento a reenviar.');
  const opp = oportunidade(opportunityId);
  if (!opp) return erro(404, 'Oportunidade não encontrada.');

  const titulo = `Reenviar documento: ${tipoDocumento}`;
  // Idempotente por documento: o mesmo pedido reusa a pendência ativa.
  const existente = sincronizar().find(
    (p) => p.opportunityId === opp.id && p.origem === 'engine:DOCUMENTO_REJEITADO' && p.titulo === titulo && ativa(p),
  );
  const p =
    existente ??
    criarPendencia({
      user,
      opp,
      titulo,
      descricao: `O documento "${tipoDocumento}" foi recusado na conferência do checklist. Envie uma nova versão pelo checklist de documentos da oportunidade.`,
      tipo: 'DOCUMENTACAO',
      origem: 'engine:DOCUMENTO_REJEITADO',
      area: 'LT/EV',
      responsavelId: null,
      prioridade: 'ALTA',
      prazo: prazoEmDias(2),
      acaoResolucao: 'hub',
      acaoResolucaoDetalhe: 'Anexe a nova versão no checklist da oportunidade — a pendência fecha sozinha.',
      automatica: true,
    });
  if (!existente) {
    notificar(opp.ltId, {
      evento: 'PENDENCIA_ABERTA',
      titulo: `${opp.code} · ${titulo}`,
      mensagem: 'Documento recusado na conferência do checklist.',
      link: `/pendencias/${p.id}`,
      referenciaTipo: 'pendencia',
      referenciaId: p.id,
    });
  }
  return json<BackendPendenciaDetail>(paraDetalhe(p, user), 201);
}

function patchPendencia(ctx: MockContext): Response {
  const user = u(ctx);
  const p = pendenciaPorId(ctx.params.id);
  if (!p) return erro(404, 'Pendência não encontrada.');
  const body = mapPendenciaPatchToBackend((ctx.body ?? {}) as Parameters<typeof mapPendenciaPatchToBackend>[0]) as {
    status?: StatusPendencia;
    prioridade?: PrioridadePendencia;
    prazo?: string;
    motivo?: string;
  };
  if (!body.status && !body.prioridade && !body.prazo) return erro(400, 'Nada a alterar: informe status, prioridade ou prazo.');
  if (!ativa(p)) return erro(400, 'Pendência encerrada não pode ser alterada.');

  if (body.status && body.status !== p.status) {
    if (!TRANSICOES[p.status].includes(body.status)) {
      return erro(400, `Transição inválida: ${STATUS_LABEL[p.status]} → ${STATUS_LABEL[body.status]}.`);
    }
    if (body.status === 'RESOLVIDA' && !RESOLUCAO_MANUAL.includes(p.acaoResolucao)) {
      return erro(400, RECUSA_POR_FLUXO[p.acaoResolucao] ?? 'Esta pendência não pode ser encerrada manualmente.');
    }
    if ((body.status === 'RESOLVIDA' || body.status === 'CANCELADA') && !podeEncerrar(p, user)) {
      return erro(403, mensagemEncerramentoNegado(p));
    }
    const de = p.status;
    p.status = body.status;
    if (body.status === 'RESOLVIDA' || body.status === 'CANCELADA') p.resolvidaEm = new Date().toISOString();
    p.historico.push(
      novoEvento(
        novoId('pev'),
        'MUDANCA_STATUS',
        user.id,
        `Status alterado: ${STATUS_LABEL[de]} → ${STATUS_LABEL[body.status]}.${body.motivo ? ` Motivo: ${body.motivo}` : ''}`,
        { metadados: { de, para: body.status } },
      ),
    );
    auditar(user, p, 'Status de pendência alterado', 'pendencia.status', `${STATUS_LABEL[de]} → ${STATUS_LABEL[body.status]}`, {
      tipo: 'transicao',
      estadoAnterior: { status: STATUS_LABEL[de] },
      estadoPosterior: { status: STATUS_LABEL[body.status] },
      motivo: body.motivo ?? null,
    });
  }
  if (body.prioridade && body.prioridade !== p.prioridade) {
    const de = p.prioridade;
    p.prioridade = body.prioridade;
    p.historico.push(
      novoEvento(novoId('pev'), 'SISTEMA', user.id, `Prioridade alterada: ${PRIORIDADE_LABEL[de]} → ${PRIORIDADE_LABEL[body.prioridade]}.`),
    );
  }
  if (body.prazo && body.prazo !== p.prazo) {
    if (Number.isNaN(new Date(body.prazo).getTime())) return erro(400, 'O prazo informado é inválido.');
    p.prazo = new Date(body.prazo).toISOString();
    p.historico.push(
      novoEvento(novoId('pev'), 'SISTEMA', user.id, `Prazo alterado para ${new Date(p.prazo).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`),
    );
  }
  return detalhe(p, user);
}

function comentar(ctx: MockContext): Response {
  const user = u(ctx);
  const p = pendenciaPorId(ctx.params.id);
  if (!p) return erro(404, 'Pendência não encontrada.');
  const texto = campo<string>(ctx.body, 'texto')?.trim() ?? '';
  if (!texto) return erro(400, 'O comentário não pode ficar em branco.');
  const anexoId = campo<string>(ctx.body, 'anexoId');
  const anexo = anexoId ? p.anexos.find((a) => a.id === anexoId) : undefined;
  if (anexoId && !anexo) return erro(400, 'Anexo não encontrado nesta pendência.');
  p.historico.push(
    novoEvento(novoId('pev'), 'COMENTARIO', user.id, texto, anexo ? { anexoId: anexo.id, anexoNome: campo<string>(ctx.body, 'anexoNome') ?? anexo.fileName } : {}),
  );
  const destino = p.responsavelId ?? oportunidade(p.opportunityId)?.ltId;
  if (destino && destino !== user.id) {
    notificar(destino, {
      evento: 'PENDENCIA_ATUALIZADA',
      titulo: `${user.name} comentou em ${p.code}`,
      mensagem: texto.slice(0, 120),
      link: `/pendencias/${p.id}`,
      referenciaTipo: 'pendencia',
      referenciaId: p.id,
    });
  }
  return detalhe(p, user);
}

function reatribuir(ctx: MockContext): Response {
  const user = u(ctx);
  const p = pendenciaPorId(ctx.params.id);
  if (!p) return erro(404, 'Pendência não encontrada.');
  // O DTO do backend é `responsavelId`; a tela tipou `responsavel` — aceita os dois.
  const alvo = campo<string>(ctx.body, 'responsavelId') ?? campo<string>(ctx.body, 'responsavel');
  if (!alvo?.trim()) return erro(400, 'Informe o novo responsável.');
  if (!ativa(p)) return erro(400, 'Pendência encerrada não pode ser reatribuída.');
  const novo = usuarioPorId(alvo.trim());
  if (!novo) return erro(400, `Colaborador "${alvo}" não encontrado no diretório.`);
  const anterior = responsavelDisplay(p);
  p.responsavelId = novo.id;
  p.reatribuida = true;
  const motivo = campo<string>(ctx.body, 'motivo');
  p.historico.push(
    novoEvento(novoId('pev'), 'REATRIBUICAO', user.id, `Reatribuída de ${anterior ?? '—'} para ${novo.name}.${motivo ? ` Motivo: ${motivo}` : ''}`, {
      metadados: { para: novo.id },
    }),
  );
  auditar(user, p, 'Pendência reatribuída', 'pendencia.reatribuida', `${anterior ?? '—'} → ${novo.name}`, { motivo: motivo ?? null });
  notificar(novo.id, {
    evento: 'PENDENCIA_ALTERADA',
    titulo: `${p.code} foi reatribuída a você`,
    mensagem: p.titulo,
    link: `/pendencias/${p.id}`,
    referenciaTipo: 'pendencia',
    referenciaId: p.id,
  });
  return detalhe(p, user);
}

function resolver(ctx: MockContext): Response {
  const user = u(ctx);
  const p = pendenciaPorId(ctx.params.id);
  if (!p) return erro(404, 'Pendência não encontrada.');
  if (!ativa(p)) return erro(400, 'Esta pendência já está encerrada.');
  if (!RESOLUCAO_MANUAL.includes(p.acaoResolucao)) {
    return erro(400, RECUSA_POR_FLUXO[p.acaoResolucao] ?? 'Esta pendência não pode ser encerrada manualmente.');
  }
  if (!podeEncerrar(p, user)) return erro(403, mensagemEncerramentoNegado(p));

  const anexoId = campo<string>(ctx.body, 'anexoId');
  const anexoNome = campo<string>(ctx.body, 'anexoNome');
  const observacao = campo<string>(ctx.body, 'observacao')?.trim();
  if (p.acaoResolucao === 'upload' && !anexoId) {
    return erro(422, 'Anexe o documento para resolver esta pendência.', { code: 'ANEXO_REQUIRED' });
  }
  let anexo = anexoId ? p.anexos.find((a) => a.id === anexoId) : undefined;
  if (anexoId && !anexo) {
    // Arquivo anexado por outra superfície (checklist): registra a referência.
    anexo = {
      id: anexoId,
      fileName: anexoNome ?? 'documento.pdf',
      mimeType: 'application/pdf',
      uploadedByName: user.name,
      uploadedById: user.id,
      uploadedAt: new Date().toISOString(),
    };
    p.anexos.push(anexo);
  }

  p.status = 'RESOLVIDA';
  p.resolvidaEm = new Date().toISOString();
  p.anexoId = anexo?.id ?? null;
  p.historico.push(
    novoEvento(
      novoId('pev'),
      'RESOLUCAO',
      user.id,
      observacao || (anexo ? `Resolvida com o anexo ${anexo.fileName}.` : 'Pendência marcada como resolvida.'),
      anexo ? { anexoId: anexo.id, anexoNome: anexo.fileName } : {},
    ),
  );
  auditar(user, p, 'Pendência resolvida', 'pendencia.resolvida', `${p.code} · ${p.titulo}`, {
    estadoAnterior: { status: 'Aberta' },
    estadoPosterior: { status: 'Resolvida' },
  });
  const lt = oportunidade(p.opportunityId)?.ltId;
  if (lt && lt !== user.id) {
    notificar(lt, {
      evento: 'PENDENCIA_ENCERRADA',
      titulo: `${p.code} resolvida: ${p.titulo}`,
      mensagem: `Encerrada por ${user.name}.`,
      link: `/pendencias/${p.id}`,
      referenciaTipo: 'pendencia',
      referenciaId: p.id,
    });
  }
  return detalhe(p, user);
}

function enviarAnexo(ctx: MockContext): Response {
  const user = u(ctx);
  const p = pendenciaPorId(ctx.params.id);
  if (!p) return erro(404, 'Pendência não encontrada.');
  const arq = arquivoEnviado(ctx.body);
  if (!arq) return erro(400, 'Arquivo é obrigatório.');
  const a = {
    id: novoId('anx'),
    fileName: arq.nome,
    mimeType: arq.tipo,
    uploadedByName: user.name,
    uploadedById: user.id,
    uploadedAt: new Date().toISOString(),
  };
  p.anexos.push(a);
  return json<{ anexoId: string; anexoNome: string }>({ anexoId: a.id, anexoNome: a.fileName }, 201);
}

function verAnexo(ctx: MockContext): Response {
  const p = pendenciaPorId(ctx.params.id);
  const a = p?.anexos.find((x) => x.id === ctx.params.anexoId);
  if (!p || !a) return erro(404, 'Anexo não disponível.');
  return a.mimeType.startsWith('image/') ? imagem(a.fileName) : pdf(`${p.code} · ${a.fileName}`, a.fileName);
}

// ── Registro ────────────────────────────────────────────────────────────────

rotas('painel', [
  // Dashboard — cada card busca o seu; 403 = o widget não é desta persona.
  { method: 'GET', pattern: '/dashboard/resumo', handler: resumo },
  { method: 'GET', pattern: '/dashboard/pipeline', handler: pipeline },
  { method: 'GET', pattern: '/dashboard/requer-acao', handler: requerAcao },
  { method: 'GET', pattern: '/dashboard/analise-previa', handler: analisePrevia },
  { method: 'GET', pattern: '/dashboard/ativacao-pagamento', handler: ativacaoPagamento },
  { method: 'GET', pattern: '/dashboard/oportunidades-atribuidas', handler: oportunidadesAtribuidas },
  { method: 'GET', pattern: '/dashboard/distribuicao-por-fase', handler: distribuicaoPorFase },
  { method: 'GET', pattern: '/dashboard/distribuicao-por-analista', handler: distribuicaoPorAnalista },
  { method: 'GET', pattern: '/dashboard/indicadores-sneg', handler: indicadoresSneg },
  { method: 'GET', pattern: '/dashboard/devolutivas', handler: devolutivas },

  // Sino de notificações — escopo do próprio usuário.
  {
    method: 'GET',
    pattern: '/notifications/inbox',
    handler: (ctx) => {
      const caixa = caixaDe(u(ctx)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return json<InboxResult>(
        mapBackendInbox({ items: caixa, total: caixa.length, page: null, limit: null, hasMore: false, naoLidas: caixa.filter((n) => !n.lidaEm).length }),
      );
    },
  },
  {
    method: 'POST',
    pattern: '/notifications/inbox/ler-todas',
    handler: (ctx) => {
      const agora = new Date().toISOString();
      for (const n of caixaDe(u(ctx))) n.lidaEm ??= agora;
      return semConteudo();
    },
  },
  {
    method: 'POST',
    pattern: '/notifications/inbox/:id/ler',
    handler: (ctx) => {
      const n = caixaDe(u(ctx)).find((x) => x.id === ctx.params.id);
      if (!n) return erro(404, 'Notificação não encontrada.');
      n.lidaEm ??= new Date().toISOString();
      return semConteudo();
    },
  },
  { method: 'GET', pattern: '/notifications/preferencias', handler: (ctx) => json<NotificationPreferencesResponse>(preferenciasDe(u(ctx))) },
  { method: 'PUT', pattern: '/notifications/preferencias', handler: salvarPreferencias },

  // Auditoria (governança) — só TI Administrador, como o `@Roles(ADMIN)` do backend.
  { method: 'GET', pattern: '/auditoria', handler: listarAuditoria },
  { method: 'GET', pattern: '/auditoria/export', handler: exportarAuditoria },

  // Pendências
  { method: 'GET', pattern: '/pendencias', handler: listarPendencias },
  { method: 'POST', pattern: '/pendencias', handler: postPendencia },
  {
    method: 'GET',
    pattern: '/pendencias/areas',
    handler: () => {
      const descobertas = [...new Set(pendencias().map((p) => p.area).filter((a): a is string => !!a))]
        .filter((a) => !AREAS_DECLARADAS.includes(a))
        .sort();
      const tokens = [...AREAS_DECLARADAS, ...descobertas];
      return json<PendenciaAreaOption[]>(
        mapPendenciaAreaOptions(tokens.map((value) => ({ value, label: areaLabel(value) }))),
      );
    },
  },
  { method: 'POST', pattern: '/pendencias/reenvio-documento', handler: postReenvio },
  {
    method: 'GET',
    pattern: '/pendencias/:id',
    handler: (ctx) => {
      const p = pendenciaPorId(ctx.params.id);
      return p ? detalhe(p, u(ctx)) : erro(404, 'Pendência não encontrada.');
    },
  },
  { method: 'PATCH', pattern: '/pendencias/:id', handler: patchPendencia },
  {
    method: 'GET',
    pattern: '/pendencias/:id/anexos',
    handler: (ctx) => {
      const p = pendenciaPorId(ctx.params.id);
      if (!p) return erro(404, 'Pendência não encontrada.');
      return json<PendenciaAnexo[]>(
        p.anexos.map(({ id, fileName, mimeType, uploadedByName, uploadedAt }) => ({ id, fileName, mimeType, uploadedByName, uploadedAt })),
      );
    },
  },
  { method: 'POST', pattern: '/pendencias/:id/anexos', handler: enviarAnexo },
  { method: 'GET', pattern: '/pendencias/:id/anexos/:anexoId/view', handler: verAnexo },
  { method: 'POST', pattern: '/pendencias/:id/comentarios', handler: comentar },
  { method: 'POST', pattern: '/pendencias/:id/reatribuir', handler: reatribuir },
  { method: 'POST', pattern: '/pendencias/:id/resolver', handler: resolver },
]);

