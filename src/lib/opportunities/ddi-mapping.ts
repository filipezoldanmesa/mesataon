import type {
  DdiDecisionPayload,
  DdiReclassifyPayload,
  DdiResult,
  DdiRevisaoPayload,
  DdiRiskLevel,
  DdiSituacao,
  DdiStatus,
} from './ddi.types';

/**
 * Maps the backend DDI contract (Portuguese enums/fields, `apps/api/src/ddi`)
 * to the frontend {@link DdiResult}. The backend omits the `findings` array
 * under the Portuguese name `achados` and uses PT enum values — the panel does
 * `ddi.findings.length/.map`, so without this mapping the analysis screen
 * crashes and the status/risk badges never resolve.
 */

interface BackendAchado {
  descricao?: string;
  gravidade?: string;
}

export interface BackendDdi {
  opportunityId: string;
  status: string;
  /** Veredito do backend — ver o fallback em {@link mapDdiResult}. */
  emTratativa?: boolean;
  risco: string | null;
  riscoMotor?: string | null;
  score: number | null;
  racional: string | null;
  criterios: string[] | null;
  achados: BackendAchado[] | null;
  parecerIntegridade: string | null;
  ltDecisao: string | null;
  ltJustificativa: string | null;
  /**
   * Opcional porque um backend anterior a 14/09/2026 simplesmente não publica o
   * campo — e ausência tem de virar `null` (nunca `''`, que a tela leria como
   * "pediu revisão sem escrever nada").
   */
  ltMotivoRevisao?: string | null;
  /**
   * `true` quando o backend omitiu o detalhe confidencial (parecer, achados,
   * critérios, score) porque o ator está fora de Integridade, TI Administrador
   * e LT (24/09/2026). Opcional: backend anterior não publica o campo.
   */
  detalheRestrito?: boolean;
  updatedAt: string;
}

const STATUS_MAP: Record<string, DdiStatus> = {
  PENDENTE: 'in_progress',
  EM_ANDAMENTO: 'in_progress',
  CONCLUIDA: 'completed',
  PENDENTE_PARECER: 'completed',
  AGUARDANDO_LT: 'completed',
  LIBERADA: 'completed',
  REPROVADA: 'completed',
  CANCELADA: 'completed',
  ERRO: 'error',
  /*
   * Faltava, e o buraco era invisível (ADO 67943 · 31/08/2026).
   *
   * O backend respondia 204 para `NAO_ELEGIVEL`, então este valor nunca chegava
   * ao mapa e o ramo `not_eligible` — que existe no card "Análises" E no
   * `DdiPanel` — era inalcançável. Sem a entrada, o fallback abaixo o
   * traduziria para `in_progress`: a tela diria "Em análise" sobre uma DDI que
   * ninguém vai executar.
   */
  NAO_ELEGIVEL: 'not_eligible',
};

/**
 * Backend statuses, kept whole. `STATUS_MAP` above collapses most of them into
 * `completed`; the parecer flow needs the difference between LIBERADA and
 * REPROVADA, so it reads this instead.
 */
const SITUACOES: readonly DdiSituacao[] = [
  'PENDENTE',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'PENDENTE_PARECER',
  'AGUARDANDO_LT',
  'LIBERADA',
  'REPROVADA',
  'CANCELADA',
  'ERRO',
  'NAO_ELEGIVEL',
];

/**
 * Unknown value degrades to `EM_ANDAMENTO` — the state that offers no verdict
 * and gates nothing, so a drifted backend enum never reads as "released".
 */
function mapSituacao(value: string): DdiSituacao {
  return SITUACOES.find((s) => s === value) ?? 'EM_ANDAMENTO';
}

const RISK_MAP: Record<string, DdiRiskLevel> = {
  BAIXO: 'low',
  MEDIO: 'medium',
  ALTO: 'high',
};

/**
 * Estreita o valor de máquina do backend (`BAIXO｜MEDIO｜ALTO`) para o enum da
 * tela. Valor desconhecido vira `null` — nunca um nível vizinho, que pintaria a
 * pílula com a cor de um risco que ninguém apurou.
 *
 * Exportada porque a Visão 360º do cliente lê o MESMO campo por outra rota
 * (`ddiRisk.data.nivel`, TC 68060): uma segunda tabela de tradução divergiria
 * desta no dia em que o backend acrescentasse um nível.
 */
export function narrowDdiRiskLevel(value: string | null | undefined): DdiRiskLevel | null {
  return value ? (RISK_MAP[value] ?? null) : null;
}

export function mapDdiResult(b: BackendDdi): DdiResult {
  return {
    opportunityId: b.opportunityId,
    status: STATUS_MAP[b.status] ?? 'in_progress',
    situacao: mapSituacao(b.status),
    /*
     * Ausente ⇒ `true`, o lado RECUPERÁVEL — e aqui ele é o oposto do
     * `mapGate` de propósito.
     *
     * Lá o campo ausente degrada para BLOQUEADO porque abrir um CTA por falta de
     * informação oferece uma ação que a API recusaria. Aqui o custo é invertido:
     * `false` esconderia os três botões da Integridade contra um backend que não
     * publica o campo, deixando a análise SEM nenhuma ação capaz de emitir
     * parecer — beco sem saída. `true` preserva exatamente o comportamento
     * anterior (o clique pode terminar na recusa do backend, que agora diz o
     * motivo em pt-BR). Mesmo raciocínio do `acaoResolucao` da lista de
     * pendências, cuja ausência é lida como "pode".
     */
    emTratativa: b.emTratativa ?? true,
    riskLevel: narrowDdiRiskLevel(b.risco),
    engineRiskLevel: narrowDdiRiskLevel(b.riscoMotor ?? null),
    score: b.score,
    rationale: b.racional,
    findings: (b.achados ?? []).map((a, i) => ({
      id: String(i),
      description: a.descricao ?? '',
      severity: narrowDdiRiskLevel(a.gravidade ?? null) ?? 'medium',
    })),
    opinion: b.parecerIntegridade,
    // The backend stores only the resulting `risco`, not a distinct
    // reclassification record — nothing reliable to reconstruct here.
    reclassification: null,
    ltDecision: b.ltDecisao
      ? {
          action: b.ltDecisao === 'seguir_com_clausulas' ? 'proceed_with_clauses' : 'cancel',
          justification: b.ltJustificativa,
          decidedAt: b.updatedAt,
        }
      : null,
    /*
     * ⚠️ `?? null`, e o `trim()` NÃO entra aqui: o backend já grava o texto
     * trimado (`@IsNonBlankString`), e normalizar de novo na leitura mascararia
     * uma linha que chegasse em branco — que é fato a investigar, não a
     * esconder.
     */
    ltReviewRequestReason: b.ltMotivoRevisao ?? null,
    // Ausente ⇒ `false`: backend anterior mandava o detalhe inteiro a todos.
    detailRestricted: b.detalheRestrito ?? false,
  };
}

const RISK_TO_PT: Record<DdiRiskLevel, string> = {
  low: 'BAIXO',
  medium: 'MEDIO',
  high: 'ALTO',
};

/** Frontend LT decision → backend `DdiDecisionDto`. */
export function toDecisionBody(p: DdiDecisionPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    decisao: p.action === 'proceed_with_clauses' ? 'seguir_com_clausulas' : 'cancelar',
  };
  if (p.justification?.trim()) body.justificativa = p.justification.trim();
  return body;
}

/**
 * Frontend review request → backend `SolicitarRevisaoDdiDto`.
 *
 * Um campo só, e é ele que carrega o ato: não há `decisao` a traduzir, porque o
 * LT pede a revisão e não a concede.
 */
export function toRevisaoBody(p: DdiRevisaoPayload): Record<string, unknown> {
  return { justificativa: p.justification.trim() };
}

/** Frontend Integridade parecer → backend `ReclassifyDdiDto`. */
export function toReclassifyBody(p: DdiReclassifyPayload): Record<string, unknown> {
  return {
    risco: RISK_TO_PT[p.reclassifiedTo],
    // The required "parecer / justificativa" (min 10 chars, RN-F10-04/05) is the
    // backend's `parecerIntegridade`. `recommendations` is an optional UI-only
    // note and is not part of the reclassify contract.
    parecerIntegridade: p.rationale,
    // The verdict, not the risk, decides the resulting status on the backend.
    decisao: p.decision === 'release' ? 'liberar' : 'reprovar',
  };
}
