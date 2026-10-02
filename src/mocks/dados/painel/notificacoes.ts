import type {
  BackendNotification,
  NotificationChannel,
  NotificationPreferencesResponse,
} from '@/lib/notifications/notifications.types';

import { PERFIS } from '../../core/session';
import { haDias } from './tempo';

/**
 * Caixa do sino por usuário, na forma do backend (`InboxItemDto`). Os textos
 * citam as oportunidades do elenco no estado do `cenario` de cada uma.
 */

type Item = Omit<BackendNotification, 'id' | 'createdAt' | 'lidaEm'> & { haDias: number; lida?: boolean };

const POR_PERFIL: Record<string, Item[]> = {
  LIDER_TERRITORIO: [
    { evento: 'PROPOSTA_DEVOLVIDA', titulo: 'OPP-0004 · Proposta devolvida pela SNEG para ajuste', mensagem: 'Revise o volume e o investimento e reenvie.', link: '/pendencias/pnd-008', referenciaTipo: 'pendencia', referenciaId: 'pnd-008', haDias: 5 },
    { evento: 'PENDENCIA_ATRASADA', titulo: 'PN-3008 está atrasada há 2 dias', mensagem: 'Ajustar proposta devolvida pela SNEG.', link: '/pendencias/pnd-008', referenciaTipo: 'pendencia', referenciaId: 'pnd-008', haDias: 0.2 },
    { evento: 'PENDENCIA_ABERTA', titulo: 'Nova pendência: Enviar certidão negativa de débitos trabalhistas', mensagem: 'Solicitada pela Integridade na OPP-0003.', link: '/pendencias/pnd-007', referenciaTipo: 'pendencia', referenciaId: 'pnd-007', haDias: 1 },
    { evento: 'ASSINATURA_STATUS_ALTERADO', titulo: 'OPP-0008 · 2 de 4 signatários já assinaram', mensagem: 'Envelope DocuSign em andamento.', link: '/oportunidades/opp-008', referenciaTipo: 'oportunidade', referenciaId: 'opp-008', haDias: 1, lida: true },
    { evento: 'OPORTUNIDADE_FASE_ALTERADA', titulo: 'OPP-0006 entrou em aprovação', mensagem: 'Alçada acionada.', link: '/oportunidades/opp-006', referenciaTipo: 'oportunidade', referenciaId: 'opp-006', haDias: 7, lida: true },
    { evento: 'PENDENCIA_ENCERRADA', titulo: 'PN-3003 resolvida: Anexar alvará de funcionamento', mensagem: 'Pendência encerrada.', link: '/pendencias/pnd-003', referenciaTipo: 'pendencia', referenciaId: 'pnd-003', haDias: 2, lida: true },
  ],
  SNEG: [
    { evento: 'ANALISE_DISTRIBUIDA', titulo: 'OPP-0003 · Análise distribuída para você', mensagem: 'Posto Litoral Sul · Embandeiramento.', link: '/oportunidades/opp-003/analise', referenciaTipo: 'oportunidade', referenciaId: 'opp-003', haDias: 2 },
    { evento: 'ANALISE_DISTRIBUIDA', titulo: 'OPP-0005 · Análise distribuída para você', mensagem: 'Posto Baía Formosa · Franquia BR Mania.', link: '/oportunidades/opp-005/analise', referenciaTipo: 'oportunidade', referenciaId: 'opp-005', haDias: 3 },
    { evento: 'PENDENCIA_ATUALIZADA', titulo: 'Ana Ribeiro comentou em PN-3008', mensagem: 'Vou anexar o projeto da ampliação.', link: '/pendencias/pnd-008', referenciaTipo: 'pendencia', referenciaId: 'pnd-008', haDias: 4 },
    { evento: 'MINUTA_ATRIBUIDA', titulo: 'OPP-0007 · Minuta atribuída a você', mensagem: 'CPCVM e Mútuo gerados.', link: '/oportunidades/opp-007', referenciaTipo: 'oportunidade', referenciaId: 'opp-007', haDias: 6, lida: true },
  ],
  BP_FINANCEIRO: [
    { evento: 'APROVACAO_PENDENTE', titulo: 'OPP-0006 aguarda a sua aprovação na alçada', mensagem: 'Gerente Varejo já aprovou.', link: '/oportunidades/opp-006', referenciaTipo: 'oportunidade', referenciaId: 'opp-006', haDias: 2 },
    { evento: 'PARECER_EMITIDO', titulo: 'Parecer técnico emitido na OPP-0006', mensagem: 'Parecer favorável.', link: '/oportunidades/opp-006', referenciaTipo: 'oportunidade', referenciaId: 'opp-006', haDias: 8, lida: true },
  ],
  GERENTE_VAREJO: [
    { evento: 'PENDENCIA_ALTERADA', titulo: 'PN-3012 foi reatribuída a você', mensagem: 'Validar exceção de política comercial.', link: '/pendencias/pnd-012', referenciaTipo: 'pendencia', referenciaId: 'pnd-012', haDias: 6 },
    { evento: 'APROVACAO_PENDENTE', titulo: 'OPP-0006 aguardava a sua aprovação', mensagem: 'Aprovação registrada.', link: '/oportunidades/opp-006', referenciaTipo: 'oportunidade', referenciaId: 'opp-006', haDias: 3, lida: true },
  ],
  CCOB: [
    { evento: 'PENDENCIA_VENCE_HOJE', titulo: 'Análise prévia da garantia da OPP-0003 vence hoje', mensagem: 'Hipoteca do imóvel do posto.', link: '/oportunidades/opp-003/garantia', referenciaTipo: 'oportunidade', referenciaId: 'opp-003', haDias: 0.1 },
    { evento: 'PENDENCIA_ABERTA', titulo: 'Nova garantia em análise prévia: OPP-0003', mensagem: 'Indicada pelo LT.', link: '/oportunidades/opp-003/garantia', referenciaTipo: 'oportunidade', referenciaId: 'opp-003', haDias: 2, lida: true },
  ],
  SPCOM: [
    { evento: 'PENDENCIA_VENCE_HOJE', titulo: 'PN-3014 vence hoje: Anexar minuta do Mútuo revisada', mensagem: 'OPP-0007 · Posto Planalto.', link: '/pendencias/pnd-014', referenciaTipo: 'pendencia', referenciaId: 'pnd-014', haDias: 0.1 },
    { evento: 'PENDENCIA_ATRASADA', titulo: 'PN-3017 está atrasada: Validar dados bancários', mensagem: 'OPP-0009 · liberação de pagamento.', link: '/pendencias/pnd-017', referenciaTipo: 'pendencia', referenciaId: 'pnd-017', haDias: 0.3 },
    { evento: 'MINUTA_ATRIBUIDA', titulo: 'OPP-0007 · Minutas geradas (CPCVM e Mútuo)', mensagem: 'Uma pendente de anexo.', link: '/oportunidades/opp-007', referenciaTipo: 'oportunidade', referenciaId: 'opp-007', haDias: 1, lida: true },
  ],
  INTEGRIDADE: [
    { evento: 'PENDENCIA_ABERTA', titulo: 'DDI: emitir parecer de integridade — OPP-0003', mensagem: 'Posto Litoral Sul.', link: '/oportunidades/opp-003/analise', referenciaTipo: 'pendencia', referenciaId: 'pnd-005', haDias: 2 },
  ],
  GESTOR_FRANQUIAS: [
    { evento: 'PENDENCIA_ABERTA', titulo: 'Parecer antecipado pendente: franquia BR Mania da OPP-0005', mensagem: 'Proposta ZBRM-GOP-00000011/2026.', link: '/pendencias/pnd-010', referenciaTipo: 'pendencia', referenciaId: 'pnd-010', haDias: 3 },
  ],
  CONSULTOR_EXPANSAO: [
    { evento: 'PENDENCIA_ABERTA', titulo: 'Parecer antecipado pendente: franquia BR Mania da OPP-0005', mensagem: 'Proposta ZBRM-GOP-00000011/2026.', link: '/pendencias/pnd-010', referenciaTipo: 'pendencia', referenciaId: 'pnd-010', haDias: 3, lida: true },
  ],
  TI_ADMINISTRADOR: [
    { evento: 'PENDENCIAS_ATRASADAS_RESUMO', titulo: 'Resumo diário: 2 pendências atrasadas na plataforma', mensagem: 'PN-3008 e PN-3017.', link: '/pendencias?sla=ATRASADA', referenciaTipo: null, referenciaId: null, haDias: 0.3 },
  ],
};

export function sementeInbox(): Record<string, BackendNotification[]> {
  const out: Record<string, BackendNotification[]> = {};
  for (const p of PERFIS) {
    out[p.userId] = (POR_PERFIL[p.key] ?? []).map(({ haDias: d, lida, ...n }, i) => {
      const createdAt = haDias(d);
      return { ...n, id: `ntf-${p.key.toLowerCase()}-${i + 1}`, createdAt, lidaEm: lida ? haDias(Math.max(0, d - 0.05)) : null };
    });
  }
  return out;
}

/** Eventos do catálogo (`event-catalog.ts`) que aparecem nas preferências. */
export const EVENTOS_PREFERENCIA: { evento: string; obrigatorio: boolean }[] = [
  { evento: 'PENDENCIA_ABERTA', obrigatorio: false },
  { evento: 'PENDENCIA_ENCERRADA', obrigatorio: false },
  { evento: 'PENDENCIA_ALTERADA', obrigatorio: false },
  { evento: 'PENDENCIA_VENCE_HOJE', obrigatorio: true },
  { evento: 'PENDENCIA_ATRASADA', obrigatorio: true },
  { evento: 'PENDENCIAS_ATRASADAS_RESUMO', obrigatorio: false },
  { evento: 'OPORTUNIDADE_FASE_ALTERADA', obrigatorio: false },
  { evento: 'ANALISE_DISTRIBUIDA', obrigatorio: false },
  { evento: 'MINUTA_ATRIBUIDA', obrigatorio: false },
  { evento: 'PROPOSTA_DEVOLVIDA', obrigatorio: true },
  { evento: 'PARECER_EMITIDO', obrigatorio: false },
  { evento: 'APROVACAO_PENDENTE', obrigatorio: true },
  { evento: 'ASSINATURA_STATUS_ALTERADO', obrigatorio: false },
];

export const CANAIS: NotificationChannel[] = ['EMAIL', 'CHAT'];

export function sementePreferencias(): NotificationPreferencesResponse {
  return {
    preferencias: EVENTOS_PREFERENCIA.flatMap(({ evento, obrigatorio }) =>
      CANAIS.map((canal) => ({
        evento,
        canal,
        // Default do catálogo: tudo ligado, menos o resumo diário pelo Teams.
        habilitado: !(evento === 'PENDENCIAS_ATRASADAS_RESUMO' && canal === 'CHAT'),
        obrigatorio,
      })),
    ),
    canais: CANAIS.map((canal) => ({ canal, habilitado: true })),
    cadenciaDias: 1,
  };
}
