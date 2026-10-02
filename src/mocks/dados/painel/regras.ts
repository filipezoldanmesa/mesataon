import type {
  BackendPendenciaDetail,
  BackendPendenciaListItem,
  BackendPendenciaParticipante,
} from '@/lib/pendencias/pendencia-mapping';

import { perfilPorChave, usuarioPorId, type MockUser } from '../../core/session';
import type { OportunidadeElenco } from '../../elenco';
import { clientes, oportunidade, ROTULO_FASE } from '../../estado-compartilhado';
import { ORIGEM_LABEL, type PendenciaMock, type StatusPendencia } from './pendencias';
import { diasAtePrazo } from './tempo';

/**
 * Regras do domínio `painel` que o backend decide e a tela só exibe — espelho
 * enxuto de `dashboard/domain/persona.ts`, `pendencias/domain/pendencia-visibility.ts`
 * e `pendencias/domain/pendencia-encerramento.ts`.
 */

// ── Persona do dashboard ────────────────────────────────────────────────────

export type PersonaId =
  | 'LT_EV'
  | 'BP_FINANCEIRO'
  | 'SNEG'
  | 'GESTOR'
  | 'CCOB'
  | 'SPCOM'
  | 'FRANQUIAS'
  | 'CONSULTOR_EXPANSAO'
  | 'EXPANSAO'
  | 'TI'
  | 'DDI';

export interface Persona {
  id: PersonaId;
  /** Ids de widget NA REDE — o mapper do front descarta os que não conhece. */
  widgets: string[];
  recorte: 'CARTEIRA' | 'AREA';
  agrupamento: 'NENHUM' | 'GERENCIA';
}

const CATALOGO: Record<PersonaId, Persona> = {
  LT_EV: {
    id: 'LT_EV',
    widgets: ['MINHAS_OPORTUNIDADES', 'REQUER_ACAO', 'PIPELINE', 'OPORTUNIDADES_POR_ATRIBUTO', 'PENDENCIAS'],
    recorte: 'CARTEIRA',
    agrupamento: 'NENHUM',
  },
  BP_FINANCEIRO: {
    id: 'BP_FINANCEIRO',
    widgets: [
      'OPORTUNIDADES_ATRIBUIDAS',
      'DISTRIBUICAO_POR_FASE',
      'POR_ANALISTA_POR_STATUS',
      'INDICADORES_SNEG',
      'OPORTUNIDADES_POR_ATRIBUTO',
    ],
    recorte: 'AREA',
    agrupamento: 'NENHUM',
  },
  SNEG: { id: 'SNEG', widgets: ['OPORTUNIDADES_ATRIBUIDAS', 'OPORTUNIDADES_POR_ATRIBUTO'], recorte: 'AREA', agrupamento: 'NENHUM' },
  GESTOR: {
    id: 'GESTOR',
    widgets: ['REGIONAL', 'POR_ANALISTA', 'PIPELINE', 'DEVOLUTIVAS', 'OPORTUNIDADES_POR_ATRIBUTO', 'REQUER_ACAO'],
    recorte: 'AREA',
    agrupamento: 'NENHUM',
  },
  CCOB: { id: 'CCOB', widgets: ['ANALISE_CREDITO', 'GARANTIAS'], recorte: 'AREA', agrupamento: 'GERENCIA' },
  SPCOM: { id: 'SPCOM', widgets: ['OPORTUNIDADES_ATIVACAO_PAGAMENTO'], recorte: 'AREA', agrupamento: 'NENHUM' },
  FRANQUIAS: { id: 'FRANQUIAS', widgets: ['PIPELINE', 'OPORTUNIDADES_POR_ATRIBUTO', 'REQUER_ACAO'], recorte: 'AREA', agrupamento: 'NENHUM' },
  CONSULTOR_EXPANSAO: {
    id: 'CONSULTOR_EXPANSAO',
    widgets: ['PIPELINE', 'OPORTUNIDADES_POR_ATRIBUTO', 'REQUER_ACAO'],
    recorte: 'AREA',
    agrupamento: 'NENHUM',
  },
  EXPANSAO: { id: 'EXPANSAO', widgets: ['PIPELINE', 'OPORTUNIDADES_POR_ATRIBUTO'], recorte: 'AREA', agrupamento: 'NENHUM' },
  TI: { id: 'TI', widgets: [], recorte: 'AREA', agrupamento: 'NENHUM' },
  DDI: { id: 'DDI', widgets: ['REQUER_ACAO'], recorte: 'AREA', agrupamento: 'NENHUM' },
};

/** Ordem de prioridade do backend (`ROLE_PERSONA_PAIRS`). Visualizador ⇒ sem persona. */
const PAPEL_PERSONA: [string, PersonaId][] = [
  ['LT', 'LT_EV'],
  ['SNEG', 'SNEG'],
  ['BP_FINANCEIRO', 'BP_FINANCEIRO'],
  ['GERENTE_VAREJO', 'GESTOR'],
  ['CCOB', 'CCOB'],
  ['SPCOM', 'SPCOM'],
  ['GESTOR_FRANQUIAS', 'FRANQUIAS'],
  ['CONSULTOR_EXPANSAO', 'CONSULTOR_EXPANSAO'],
  ['EXPANSAO', 'EXPANSAO'],
  ['ADMIN', 'TI'],
  ['TI_SUSTENTACAO', 'TI'],
  ['INTEGRIDADE', 'DDI'],
  ['COMPLIANCE', 'DDI'],
];

export function personaDe(user: MockUser): Persona | undefined {
  for (const [papel, id] of PAPEL_PERSONA) {
    if (user.roles.includes(papel)) return CATALOGO[id];
  }
  return undefined;
}

export function temWidget(user: MockUser, widget: string): boolean {
  return personaDe(user)?.widgets.includes(widget) ?? false;
}

/** Oportunidades no recorte da persona: CARTEIRA = sou o LT principal. */
export function noRecorte(user: MockUser, lista: OportunidadeElenco[]): OportunidadeElenco[] {
  const p = personaDe(user);
  if (!p) return [];
  return p.recorte === 'CARTEIRA' ? lista.filter((o) => o.ltId === user.id) : lista;
}

// ── Vocabulário ─────────────────────────────────────────────────────────────

const AREA_LABEL: Record<string, string> = {
  COMPLIANCE: 'Integridade',
  INTEGRIDADE: 'Integridade',
  JURIDICO: 'Jurídico',
  ENGENHARIA: 'Engenharia',
  SNEG: 'SNEG',
  CCOB: 'CCOB',
  SPCOM: 'SPCOM',
  LT: 'LT',
  'LT/EV': 'LT/EV',
  FRANQUIA: 'Time de Franquias',
};

export function areaLabel(token: string): string {
  return AREA_LABEL[token.trim().toUpperCase()] ?? token;
}

export const STATUS_LABEL: Record<StatusPendencia, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDA: 'Resolvida',
  CANCELADA: 'Cancelada',
};

export const PRIORIDADE_LABEL: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

export const TRANSICOES: Record<StatusPendencia, StatusPendencia[]> = {
  ABERTA: ['EM_ANDAMENTO', 'RESOLVIDA', 'CANCELADA'],
  EM_ANDAMENTO: ['RESOLVIDA', 'CANCELADA'],
  RESOLVIDA: [],
  CANCELADA: [],
};

export function ativa(p: PendenciaMock): boolean {
  return p.status === 'ABERTA' || p.status === 'EM_ANDAMENTO';
}

/** Fluxos em que `POST .../resolver` é aceito; os demais fecham noutra tela. */
export const RESOLUCAO_MANUAL = ['upload', 'marcar'];

/** A frase do backend quando o `resolver` é recusado pela ORIGEM. */
export const RECUSA_POR_FLUXO: Record<string, string> = {
  automatica: 'Esta pendência é resolvida automaticamente pela plataforma; nenhum usuário pode encerrá-la manualmente.',
  hub: 'Esta pendência fecha sozinha quando o documento for anexado no checklist da oportunidade.',
  reenvio: 'Esta pendência é encerrada no reenvio da proposta para análise.',
  ddi: 'Esta pendência é encerrada pela decisão do parecer da Integridade, na tela de análise.',
  ddi_revisao: 'Esta pendência é encerrada pelo pedido de nova avaliação da DDI.',
  previa_garantia: 'Esta pendência é encerrada pela decisão da CCOB, na tela de Garantia.',
  franquia: 'Esta pendência é encerrada pelo anexo na própria proposta de franquia.',
  franquia_parecer: 'Esta pendência é encerrada na submissão do parecer antecipado da franquia.',
  garantia: 'Esta pendência é encerrada pela indicação da garantia.',
};

// ── SLA e selo ──────────────────────────────────────────────────────────────

export type Faixa = 'ATRASADA' | 'VENCE_HOJE' | 'NO_PRAZO' | 'SEM_PRAZO';

export function faixa(p: PendenciaMock): Faixa {
  if (!p.prazo) return 'SEM_PRAZO';
  const d = diasAtePrazo(p.prazo);
  return d < 0 ? 'ATRASADA' : d === 0 ? 'VENCE_HOJE' : 'NO_PRAZO';
}

export function slaDias(p: PendenciaMock): number | null {
  return p.prazo ? diasAtePrazo(p.prazo) : null;
}

/** "Atrasada 2d" / "Vence hoje" / "Vence em 3d" / "Sem prazo" — `buildSlaLabel`. */
export function slaLabel(p: PendenciaMock): string {
  const f = faixa(p);
  if (f === 'SEM_PRAZO') return 'Sem prazo';
  if (f === 'VENCE_HOJE') return 'Vence hoje';
  const d = Math.abs(slaDias(p) ?? 0);
  return f === 'ATRASADA' ? `Atrasada ${d}d` : `Vence em ${d}d`;
}

/** Selo de urgência (`pendencia-selo-sql.ts`): crítica = urgente ou atrasada. */
export function selo(p: PendenciaMock): 'CRITICA' | 'ATENCAO' | 'ANDAMENTO' {
  const f = faixa(p);
  if (p.prioridade === 'URGENTE' || f === 'ATRASADA') return 'CRITICA';
  if (f === 'VENCE_HOJE' || (p.prazo && diasAtePrazo(p.prazo) === 1)) return 'ATENCAO';
  return 'ANDAMENTO';
}

// ── Visibilidade e encerramento ─────────────────────────────────────────────

const VISAO_TOTAL = ['ADMIN', 'BP_FINANCEIRO'];

const AREAS_VISIVEIS: Record<string, string[]> = {
  SNEG: ['SNEG'],
  CCOB: ['CCOB'],
  INTEGRIDADE: ['COMPLIANCE', 'INTEGRIDADE'],
  COMPLIANCE: ['COMPLIANCE', 'INTEGRIDADE'],
  GESTOR_FRANQUIAS: ['FRANQUIA'],
  CONSULTOR_EXPANSAO: ['FRANQUIA'],
};

const AREAS_ENCERRAVEIS: Record<string, string[]> = {
  LT: ['LT/EV', 'LT'],
  ...AREAS_VISIVEIS,
};

function areasDo(user: MockUser, mapa: Record<string, string[]>): string[] {
  return [...new Set(user.roles.flatMap((r) => mapa[r] ?? []))];
}

/**
 * "De quem é esta pendência" (ADO 67987): BP Financeiro e TI Administrador
 * veem tudo; os demais, a atribuída a eles + a caixa da área + (LT) as
 * oportunidades da carteira.
 */
export function visivel(p: PendenciaMock, user: MockUser): boolean {
  if (user.roles.some((r) => VISAO_TOTAL.includes(r))) return true;
  if (p.responsavelId === user.id) return true;
  const area = p.area?.toUpperCase();
  if (area && areasDo(user, AREAS_VISIVEIS).includes(area)) return true;
  if (user.roles.includes('LT') && oportunidade(p.opportunityId)?.ltId === user.id) return true;
  return false;
}

/** `podeEncerrarPendencia` — reatribuição nominal vence a área; "não sei" libera. */
export function podeEncerrar(p: PendenciaMock, user: MockUser): boolean {
  if (user.roles.every((r) => r === 'VISUALIZADOR')) return false;
  if (p.reatribuida && p.responsavelId === user.id) return true;
  const areas = areasDo(user, AREAS_ENCERRAVEIS);
  if (areas.length === 0) return true;
  const dona = p.area?.toUpperCase();
  if (!dona) return true;
  return areas.includes(dona);
}

export function mensagemEncerramentoNegado(p: PendenciaMock): string {
  const rotulo = p.area ? areaLabel(p.area) : null;
  return rotulo
    ? `Esta pendência é da área ${rotulo} — só ela pode encerrá-la. Você pode acompanhar o ticket e comentar nele.`
    : 'Esta pendência é de outra área — só ela pode encerrá-la. Você pode acompanhar o ticket e comentar nele.';
}

// ── Projeção para a forma do backend ────────────────────────────────────────

export function clienteDaOpp(o: OportunidadeElenco | undefined) {
  return o ? clientes().find((c) => c.sapCode === o.clienteSap) : undefined;
}

function canalTexto(canais: string[]): string | null {
  const nomes = canais.map((c) => (c === 'CHAT' ? 'Teams' : c === 'EMAIL' ? 'E-mail' : c));
  return nomes.length ? nomes.join(' · ') : null;
}

export function responsavelDisplay(p: PendenciaMock): string | null {
  if (p.responsavelId) return usuarioPorId(p.responsavelId)?.name ?? p.responsavelId;
  return p.area ? areaLabel(p.area) : null;
}

export function paraItemDaLista(p: PendenciaMock, user: MockUser): BackendPendenciaListItem {
  const o = oportunidade(p.opportunityId);
  return {
    id: p.id,
    code: p.code,
    opportunityId: p.opportunityId,
    titulo: p.titulo,
    tipo: p.tipo,
    origem: p.origem,
    area: p.area,
    areaDisplay: p.area ? areaLabel(p.area) : null,
    responsavelId: p.responsavelId,
    responsavelNome: p.responsavelId ? (usuarioPorId(p.responsavelId)?.name ?? null) : null,
    status: p.status,
    prioridade: p.prioridade,
    prazo: p.prazo,
    slaDias: slaDias(p),
    slaFaixa: faixa(p),
    abertaEm: p.abertaEm,
    clienteNome: clienteDaOpp(o)?.nomeFantasia ?? null,
    opportunityCode: o?.code ?? null,
    fase: o ? ROTULO_FASE[o.fase] : null,
    canal: canalTexto(p.canais),
    automatica: p.automatica,
    obrigatoria: p.obrigatoria,
    responsavelDisplay: responsavelDisplay(p),
    acaoResolucao: p.acaoResolucao,
    resolucaoPermitida: podeEncerrar(p, user),
  };
}

function papelDe(userId: string): string {
  const u = usuarioPorId(userId);
  return u ? (perfilPorChave(u.profileKey)?.label ?? 'Participante') : 'Participante';
}

function participantes(p: PendenciaMock, o: OportunidadeElenco | undefined): BackendPendenciaParticipante[] {
  const out: BackendPendenciaParticipante[] = [];
  const add = (id: string | null | undefined, papel: string) => {
    if (!id || id === 'sistema' || out.some((x) => x.id === id)) return;
    const u = usuarioPorId(id);
    if (u) out.push({ id, nome: u.name, papel, area: papelDe(id) });
  };
  add(p.responsavelId, 'Responsável');
  add(o?.ltId, 'LT principal');
  add(o?.analistaSnegId, 'Analista SNEG');
  for (const e of p.historico) add(e.autorId, 'Participante');
  return out;
}

export function paraDetalhe(p: PendenciaMock, user: MockUser): BackendPendenciaDetail {
  const item = paraItemDaLista(p, user);
  const o = oportunidade(p.opportunityId);
  const permitidos = TRANSICOES[p.status].filter(
    (s) => s !== 'RESOLVIDA' || RESOLUCAO_MANUAL.includes(p.acaoResolucao),
  );
  return {
    id: p.id,
    code: p.code,
    opportunityId: p.opportunityId,
    titulo: p.titulo,
    descricao: p.descricao,
    tipo: p.tipo,
    origem: p.origem,
    area: p.area,
    areaDisplay: item.areaDisplay,
    responsavelId: p.responsavelId,
    responsavelNome: item.responsavelNome,
    status: p.status,
    prioridade: p.prioridade,
    prazo: p.prazo,
    slaDias: item.slaDias,
    slaFaixa: item.slaFaixa,
    canais: p.canais,
    abertaEm: p.abertaEm,
    anexoId: p.anexoId,
    clienteNome: item.clienteNome,
    opportunityCode: item.opportunityCode,
    fase: item.fase,
    canal: item.canal,
    responsavelDisplay: item.responsavelDisplay,
    automatica: p.automatica,
    acaoResolucao: p.acaoResolucao,
    acaoResolucaoDetalhe: p.acaoResolucaoDetalhe,
    resolucaoPermitida: item.resolucaoPermitida,
    resolvidaEm: p.resolvidaEm,
    statusPermitidos: permitidos,
    origemDisplay: ORIGEM_LABEL[p.origem] ?? p.origem,
    participantes: participantes(p, o),
    historico: p.historico,
  };
}

/** Normaliza para busca: minúsculas e sem acento. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
