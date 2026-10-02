import { CLIENTES, OPORTUNIDADES, type EstadoBackend, type FaseListagem, type OportunidadeElenco, type StatusGrosso } from './elenco';
import { fatia } from './core/store';

/**
 * Estado MUTÁVEL das oportunidades — a única fonte da fase atual.
 *
 * `elenco.ts` é a semente (constante); aqui está a cópia viva. Todo domínio que
 * precisa saber "em que fase está a opp-003" lê DAQUI, e toda ação que muda a
 * fase (enviar para análise, devolver, aprovar, assinar...) escreve AQUI via
 * {@link moverPara}. Assim a listagem, o dashboard e a tela de detalhe nunca
 * discordam depois de uma ação.
 */
export const oportunidades = fatia<OportunidadeElenco[]>('oportunidades', () => OPORTUNIDADES);
export const clientes = fatia('clientes', () => CLIENTES);

export function oportunidade(id: string): OportunidadeElenco | undefined {
  return oportunidades().find((o) => o.id === id);
}

const FASE_DO_ESTADO: Record<EstadoBackend, { fase: FaseListagem; status: StatusGrosso }> = {
  NOVOS: { fase: 'PREENCHIMENTO', status: 'preenchimento' },
  EM_PREENCHIMENTO: { fase: 'PREENCHIMENTO', status: 'preenchimento' },
  EM_ANALISE: { fase: 'ANALISE', status: 'análise' },
  EM_APROVACAO: { fase: 'APROVACAO', status: 'aprovação' },
  EM_MINUTA: { fase: 'MINUTA', status: 'contrato' },
  EM_ASSINATURA: { fase: 'ASSINATURA', status: 'contrato' },
  EM_PAGAMENTO: { fase: 'PAGAMENTO', status: 'contrato' },
  CONCLUIDA: { fase: 'CONCLUIDA', status: 'concluída' },
};

/** Ordem do fluxo — para "avançar" e para os steppers. */
export const ORDEM_ESTADOS: EstadoBackend[] = [
  'EM_PREENCHIMENTO',
  'EM_ANALISE',
  'EM_APROVACAO',
  'EM_MINUTA',
  'EM_ASSINATURA',
  'EM_PAGAMENTO',
  'CONCLUIDA',
];

/** Muda a fase de uma oportunidade (e os dois vocabulários derivados dela). */
export function moverPara(id: string, estado: EstadoBackend): OportunidadeElenco | undefined {
  const o = oportunidade(id);
  if (!o) return undefined;
  o.estado = estado;
  o.fase = FASE_DO_ESTADO[estado].fase;
  o.status = FASE_DO_ESTADO[estado].status;
  return o;
}

/** Próxima fase do fluxo, ou a mesma se já estiver concluída. */
export function proximoEstado(estado: EstadoBackend): EstadoBackend {
  const i = ORDEM_ESTADOS.indexOf(estado);
  return ORDEM_ESTADOS[Math.min(ORDEM_ESTADOS.length - 1, Math.max(0, i + 1))];
}

export const ROTULO_FASE: Record<FaseListagem, string> = {
  PREENCHIMENTO: 'Em preenchimento',
  ANALISE: 'Em análise',
  APROVACAO: 'Em aprovação',
  MINUTA: 'Em minuta',
  ASSINATURA: 'Em assinatura',
  ATIVACAO: 'Em ativação',
  PAGAMENTO: 'Em pagamento',
  CONCLUIDA: 'Concluída',
};
