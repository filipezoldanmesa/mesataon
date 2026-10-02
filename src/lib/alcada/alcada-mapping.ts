import type {
  AlcadaNivel,
  AlcadaRetentativa,
  SimulacaoAlcadaBloqueio,
  SimulacaoAlcadaGate,
  AlcadaQuoteStatus,
  AlcadaSagaStatus,
  CrmLinkStatus,
  QuoteSyncStatus,
} from './alcada.types';

/**
 * Backend payload of `GET /v1/opportunities/:id/alcada` — declared explicitly
 * so a backend rename breaks HERE (typed, tested) instead of rendering an
 * empty field at runtime. The BFF never does a raw passthrough (repo rule).
 */
export interface BackendAlcadaSagaStatus {
  opportunityIntegrada: boolean;
  salesforceOpportunityId: string | null;
  quotes: Array<{
    proposalId: string;
    status: string;
    salesforceQuoteId: string | null;
    crmUrl?: string | null;
    syncStatus: string;
    synchronizedAt: string | null;
    lastError: string | null;
    retentativa?: {
      automatica: boolean;
      tentativas: number;
      maximo: number;
    } | null;
  }>;
  simulacao: {
    status: string;
    sentAt: string | null;
    retentativaAutomatica?: boolean;
    resultado: {
      isValid: boolean;
      message: string | null;
      levels: unknown;
    } | null;
  } | null;
  envio: {
    status: string;
    sentAt: string | null;
    sendVerdict: string | null;
  } | null;
  acionamentoAutomatico?: boolean;
  acionamentoPendente?: boolean;
  simulacaoGate?: {
    liberado: boolean;
    motivoBloqueio: string | null;
    codigo: string | null;
  };
}

export function mapAlcadaSagaStatus(raw: BackendAlcadaSagaStatus): AlcadaSagaStatus {
  return {
    opportunityIntegrada: raw.opportunityIntegrada,
    salesforceOpportunityId: raw.salesforceOpportunityId ?? null,
    quotes: (raw.quotes ?? []).map(
      (quote): AlcadaQuoteStatus => ({
        proposalId: quote.proposalId,
        // Unknown enum value stays raw so the gap is VISIBLE on screen
        // (repo rule: never collapse to a plausible default).
        status: quote.status as CrmLinkStatus,
        salesforceQuoteId: quote.salesforceQuoteId ?? null,
        // Opcional no tipo do backend porque um build anterior a esta entrega
        // não publica o campo — ausente degrada para "sem link", nunca para um
        // `href` montado aqui a partir do id.
        crmUrl: quote.crmUrl ?? null,
        syncStatus: quote.syncStatus as QuoteSyncStatus,
        synchronizedAt: quote.synchronizedAt ?? null,
        lastError: quote.lastError ?? null,
        retentativa: mapRetentativa(quote.retentativa),
      }),
    ),
    simulacao: raw.simulacao
      ? {
          status: raw.simulacao.status,
          sentAt: raw.simulacao.sentAt ?? null,
          // Campo ausente (backend anterior a esta entrega) degrada para "não há
          // retentativa automática" — nunca prometer um retry que o backend não
          // vai fazer, pela mesma razão do `mapGate` abaixo.
          retentativaAutomatica: raw.simulacao.retentativaAutomatica === true,
          resultado: raw.simulacao.resultado
            ? {
                isValid: raw.simulacao.resultado.isValid,
                message: raw.simulacao.resultado.message ?? null,
                levels: mapNiveis(raw.simulacao.resultado.levels),
              }
            : null,
        }
      : null,
    envio: raw.envio
      ? {
          status: raw.envio.status,
          sentAt: raw.envio.sentAt ?? null,
          sendVerdict: raw.envio.sendVerdict ?? null,
        }
      : null,
    simulacaoGate: mapGate(raw.simulacaoGate),
    // Ausente (backend anterior ao ADO 67941) degrada para "não aciona sozinho"
    // — mesma razão do `retentativaAutomatica` acima: a tela nunca promete um
    // automatismo que o backend não vai executar.
    acionamentoAutomatico: raw.acionamentoAutomatico === true,
    // Idem: ausente ⇒ `false`. Além de não prometer o automatismo, isso impede
    // o painel de ficar repolindo contra um backend que não publica o campo.
    acionamentoPendente: raw.acionamentoPendente === true,
  };
}

/**
 * Ausência do bloco degrada para `null` — a tela não escreve nada sobre
 * retentativa —, e um bloco presente com `automatica: false` é uma afirmação:
 * "não será repetida sozinha". Os dois são estados distintos e a caixa de erro
 * os renderiza diferente.
 */
function mapRetentativa(
  raw: BackendAlcadaSagaStatus['quotes'][number]['retentativa'],
): AlcadaRetentativa | null {
  if (!raw) return null;
  return {
    automatica: raw.automatica === true,
    tentativas: typeof raw.tentativas === 'number' ? raw.tentativas : 0,
    maximo: typeof raw.maximo === 'number' ? raw.maximo : 0,
  };
}

/**
 * Ausência do campo (backend anterior a esta entrega) degrada para BLOQUEADO
 * sem motivo, e não para liberado.
 *
 * Abrir o CTA por falta de informação faria a tela oferecer uma ação que a API
 * recusaria — e é justamente a divergência tela × gate que o predicado único
 * existe para impedir. O campo é opcional no tipo do backend só para essa
 * degradação ser explícita.
 */
function mapGate(
  raw: BackendAlcadaSagaStatus['simulacaoGate'],
): SimulacaoAlcadaGate {
  if (!raw) {
    return { liberado: false, motivoBloqueio: null, codigo: null };
  }
  return {
    liberado: raw.liberado === true,
    motivoBloqueio: raw.motivoBloqueio ?? null,
    // Código desconhecido fica CRU, para a lacuna ser visível — mesma regra
    // dos enums de status acima.
    codigo: (raw.codigo ?? null) as SimulacaoAlcadaBloqueio | null,
  };
}


/**
 * Normaliza a cadeia vinda do backend.
 *
 * Defensivo de propósito: o slot é `jsonb` no banco e o conteúdo veio do org,
 * então uma linha antiga ou um payload inesperado não pode derrubar a tela —
 * o que não tem forma de nível é descartado, e ausência total vira `null`
 * ("ainda não há resultado"), nunca `[]` ("o org não indicou nível nenhum").
 */
function mapNiveis(raw: unknown): AlcadaNivel[] | null {
  if (!Array.isArray(raw)) return null;
  const niveis = raw.flatMap((item): AlcadaNivel[] => {
    if (typeof item !== 'object' || item === null) return [];
    const o = item as Record<string, unknown>;
    if (typeof o.competenceLevelName !== 'string') return [];
    return [
      {
        competenceLevelName: o.competenceLevelName,
        step: typeof o.step === 'number' ? o.step : 0,
        hierarchyLevel:
          typeof o.hierarchyLevel === 'number' ? o.hierarchyLevel : 0,
        reasons: Array.isArray(o.reasons)
          ? o.reasons.filter((r): r is string => typeof r === 'string')
          : [],
      },
    ];
  });
  return niveis.sort((a, b) => a.step - b.step);
}
