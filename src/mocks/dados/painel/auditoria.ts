import type { BackendAuditoriaEntry } from '@/lib/auditoria/auditoria-mapping';

import { perfilPorChave, usuarioPorId } from '../../core/session';
import { CLIENTES, OPORTUNIDADES, type EstadoBackend, type OportunidadeElenco } from '../../elenco';

/**
 * Trilha de auditoria (SOX) do protótipo, na forma do backend
 * (`GET /v1/auditoria`). Gerada a partir do elenco: cada oportunidade ganha as
 * transições que a levaram até a fase em que o `cenario` dela está, com os
 * atores que de fato fazem cada passo — a opp-010 concluída tem a trilha
 * inteira, a opp-001 recém-criada tem só a criação.
 */

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

const SEQUENCIA: EstadoBackend[] = [
  'EM_PREENCHIMENTO',
  'EM_ANALISE',
  'EM_APROVACAO',
  'EM_MINUTA',
  'EM_ASSINATURA',
  'EM_PAGAMENTO',
  'CONCLUIDA',
];

/** Quem dispara a transição PARA cada estado, e com que ação. */
const PASSO: Partial<Record<EstadoBackend, { ator: string | null; acao: string; detalhe: string }>> = {
  EM_ANALISE: { ator: 'usr-lt-ana', acao: 'Envio para análise (GATE 1)', detalhe: 'Proposta enviada para análise da SNEG' },
  EM_APROVACAO: { ator: 'usr-sneg-carla', acao: 'Parecer técnico emitido', detalhe: 'Parecer favorável — oportunidade enviada para a alçada' },
  EM_MINUTA: { ator: 'usr-bp-bruno', acao: 'Aprovação de alçada', detalhe: 'Alçada aprovada pelo último aprovador da sequência' },
  EM_ASSINATURA: { ator: 'usr-spcom-fabio', acao: 'Envio para assinatura', detalhe: 'Envelope DocuSign enviado aos signatários' },
  EM_PAGAMENTO: { ator: null, acao: 'Assinatura concluída (GATE 4)', detalhe: 'Envelope concluído no DocuSign' },
  CONCLUIDA: { ator: 'usr-spcom-fabio', acao: 'Liberação de pagamento', detalhe: 'Pagamento liberado e oportunidade concluída' },
};

function rotuloPerfil(userId: string | null): string | null {
  if (!userId) return null;
  const u = usuarioPorId(userId);
  return u ? (perfilPorChave(u.profileKey)?.label ?? null) : null;
}

function nome(userId: string | null): string {
  return userId ? (usuarioPorId(userId)?.name ?? userId) : 'Sistema';
}

function cliente(o: OportunidadeElenco): string | null {
  return CLIENTES.find((c) => c.sapCode === o.clienteSap)?.razaoSocial ?? null;
}

function entrada(
  id: string,
  o: OportunidadeElenco,
  dataHora: string,
  ator: string | null,
  tipo: 'critica' | 'transicao' | 'acesso',
  acao: string,
  acaoCodigo: string,
  detalhe: string,
  extra: Partial<Pick<BackendAuditoriaEntry, 'objeto' | 'estadoAnterior' | 'estadoPosterior' | 'motivo'>> = {},
): BackendAuditoriaEntry {
  return {
    id,
    dataHora,
    usuario: nome(ator),
    perfil: rotuloPerfil(ator),
    tipo,
    acao,
    acaoCodigo,
    objeto: extra.objeto ?? o.code,
    oportunidade: o.code,
    cliente: cliente(o),
    detalhe,
    estadoAnterior: extra.estadoAnterior ?? null,
    estadoPosterior: extra.estadoPosterior ?? null,
    motivo: extra.motivo ?? null,
  };
}

export function sementeAuditoria(): BackendAuditoriaEntry[] {
  const agora = Date.now();
  const out: BackendAuditoriaEntry[] = [];

  for (const o of OPORTUNIDADES) {
    const inicio = new Date(o.criadaEm).getTime();
    const alvo = SEQUENCIA.indexOf(o.estado);
    // Espaça os passos entre a criação e "ontem", para nenhum cair no futuro.
    const passo = (agora - 86_400_000 - inicio) / (alvo + 1);
    const em = (k: number, minutos = 0) => new Date(inicio + k * passo + minutos * 60_000).toISOString();

    out.push(
      entrada(`aud-${o.id}-00`, o, o.criadaEm, o.ltId, 'critica', 'Oportunidade criada', 'opportunity.created', `Oportunidade ${o.code} criada para ${o.titulo}`, {
        estadoPosterior: { fase: 'Em preenchimento', valorEstimado: o.valorEstimado },
      }),
    );

    for (let k = 1; k <= alvo; k += 1) {
      const estado = SEQUENCIA[k];
      const anterior = SEQUENCIA[k - 1];
      const p = PASSO[estado];
      if (!p) continue;
      out.push(
        entrada(`aud-${o.id}-${String(k).padStart(2, '0')}a`, o, em(k), p.ator, 'critica', p.acao, `workflow.${estado.toLowerCase()}`, p.detalhe),
        entrada(
          `aud-${o.id}-${String(k).padStart(2, '0')}b`,
          o,
          em(k, 1),
          p.ator,
          'transicao',
          'Transição de estado',
          'workflow.transition',
          `${ROTULO_ESTADO[anterior]} → ${ROTULO_ESTADO[estado]}`,
          { estadoAnterior: { fase: ROTULO_ESTADO[anterior] }, estadoPosterior: { fase: ROTULO_ESTADO[estado] } },
        ),
      );
    }

    // Distribuição do analista SNEG — logo após o GATE 1.
    if (alvo >= 1 && o.analistaSnegId) {
      out.push(
        entrada(`aud-${o.id}-dist`, o, em(1, 30), null, 'critica', 'Análise distribuída', 'analise.distribuida', `Análise distribuída para ${nome(o.analistaSnegId)} (regra de gerência)`, {
          estadoPosterior: { analista: nome(o.analistaSnegId) },
        }),
      );
    }
  }

  const opp = (id: string) => OPORTUNIDADES.find((o) => o.id === id)!;
  const ha = (dias: number) => new Date(agora - dias * 86_400_000).toISOString();

  out.push(
    entrada('aud-opp-004-dev', opp('opp-004'), ha(5), 'usr-sneg-carla', 'critica', 'Proposta devolvida ao LT', 'proposta.devolvida', 'PCR-GOP-00000105/2026 devolvida para ajuste', {
      objeto: 'PCR-GOP-00000105/2026',
      estadoAnterior: { status: 'Em análise' },
      estadoPosterior: { status: 'Devolvida' },
      motivo: 'Volume mensal informado (450 m³) diverge do histórico ANP dos últimos 12 meses (média de 310 m³).',
    }),
    entrada('aud-opp-003-qs', opp('opp-003'), ha(2), 'usr-int-marina', 'acesso', 'Acesso a dado pessoal', 'lgpd.quadro_societario', 'Consulta ao quadro societário (CPF dos sócios) na DDI'),
    entrada('aud-opp-003-fia', opp('opp-003'), ha(1.5), 'usr-ccob-gabriela', 'acesso', 'Acesso a dado pessoal', 'lgpd.garantia_fiador', 'Visualização dos dados do proprietário do imóvel em garantia'),
    entrada('aud-opp-006-alc', opp('opp-006'), ha(2), 'usr-gv-henrique', 'critica', 'Aprovação de alçada', 'alcada.aprovada', 'Gerente Varejo aprovou — próximo aprovador: BP Financeiro', {
      estadoAnterior: { aprovador: 'Gerente Varejo', decisao: 'Pendente' },
      estadoPosterior: { aprovador: 'Gerente Varejo', decisao: 'Aprovada' },
    }),
    entrada('aud-opp-008-ass', opp('opp-008'), ha(1), null, 'critica', 'Assinatura registrada', 'assinatura.signatario', '2 de 4 signatários assinaram o envelope'),
    entrada('aud-opp-009-ban', opp('opp-009'), ha(3), 'usr-spcom-fabio', 'acesso', 'Acesso a dado pessoal', 'lgpd.dados_bancarios', 'Visualização dos dados bancários do cliente para a liberação do pagamento'),
  );

  return out.sort((a, b) => b.dataHora.localeCompare(a.dataHora));
}
