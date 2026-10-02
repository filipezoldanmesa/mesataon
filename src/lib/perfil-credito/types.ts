/**
 * Perfil/Risco/Crédito (F0 — GAR-6 · VBR-324)
 *
 * Frontend types mirroring the backend read model from GAR-4 (VBR-329).
 * All enums are `as const` mirrors of the backend values so exhaustiveness
 * checks work in TypeScript without duplicating string literals.
 */

// ---------------------------------------------------------------------------
// ClassificacaoRisco
// ---------------------------------------------------------------------------

/**
 * Risk classification assigned by the credit engine (SERASA/Vibra rate).
 *
 * ⚠️ FOUR members, not three — espelho de
 * `apps/api/src/perfil-credito/domain/classificacao-risco.enum.ts`. `ALTISSIMO`
 * entrou no backend em 24/08/2026 (VBR-646) e ficou faltando aqui até 28/08,
 * com consequência mensurável (ADO 67880): `isClassificacaoRisco` recusava o
 * valor, `mapPerfilCredito` gravava `classificacao: null`, e TODA superfície
 * caía no fallback e mostrava o *status* ("Concluído") no lugar do *resultado*.
 *
 * ⚠️ **A ORIGEM do `ALTISSIMO` mudou em 16/09/2026 (ADR-0052), e o membro
 * fica.** Ele era o fail-closed do motor OutSystems — o que voltava quando o
 * rating Serasa vinha ausente ou irreconhecível, e em UAT sem
 * `CREDIT_POLICY_SIMULATION_RATING` era o desfecho de TODA análise. Aquele
 * motor saiu; hoje `ALTISSIMO` chega porque o robô do Brax escreveu
 * `Risco: ALTISSIMO` no `textoEstruturado`, e o de/para do backend o traduziu.
 *
 * ⚠️ **`BAIXISSIMO` entrou em 19/09/2026** pelo mesmo caminho: o PRIMEIRO
 * callback real do Brax trouxe `Risco: BAIXISSIMO` sobre um vocabulário de
 * quatro membros. Ele **segue o BAIXO em tudo** (decisão de produto) — a cor
 * continua vindo do backend em `classificacaoPill`, então a herança é aferida
 * lá, não aqui.
 *
 * ⚠️ Este espelho é o ponto exato onde o `ALTISSIMO` ficou três meses
 * faltando, com consequência medida (ADO 67880). Membro novo no backend **sem
 * entrada aqui** volta a apagar o resultado da tela: `isClassificacaoRisco`
 * recusa, `mapPerfilCredito` grava `null`, e toda superfície mostra o STATUS no
 * lugar do RESULTADO.
 *
 * ⚠️ **Nunca colapsar `ALTISSIMO` em `ALTO`**: são faixas diferentes no
 * vocabulário do emissor, e o PRD (RN-F0-02) descrever três níveis não autoriza
 * a tela a dobrar o quarto sobre o terceiro — a decisão de produto de
 * 24/08/2026 (a fonte prevalece sobre o PRD) continua valendo.
 *
 * ⚠️ E vocabulário DESCONHECIDO segue virando `null`: sem pill, nunca o vizinho
 * plausível. É `isClassificacaoRisco` que garante isso.
 */
export const ClassificacaoRisco = {
  Baixissimo: 'BAIXISSIMO',
  Baixo: 'BAIXO',
  Medio: 'MEDIO',
  Alto: 'ALTO',
  Altissimo: 'ALTISSIMO',
} as const;

export type ClassificacaoRisco =
  (typeof ClassificacaoRisco)[keyof typeof ClassificacaoRisco];

/**
 * Rótulos pt-BR, verbatim do `CLASSIFICACAO_RISCO_LABEL` do backend.
 *
 * `Record<ClassificacaoRisco, string>` é o que impede a divergência voltar:
 * membro novo no enum sem entrada aqui é erro de compilação. A cobertura é
 * aferida em runtime por `perfil-credito-mapping.test.ts` — o mapa é lido com
 * índice de valor de API, e um `as` em qualquer call site derrotaria o tipo.
 */
export const CLASSIFICACAO_RISCO_LABEL: Record<ClassificacaoRisco, string> = {
  BAIXISSIMO: 'Baixíssimo',
  BAIXO: 'Baixo',
  MEDIO: 'Médio',
  ALTO: 'Alto',
  ALTISSIMO: 'Altíssimo',
};

/** Type guard — unknown values fall through as null, never throw. */
export function isClassificacaoRisco(
  value: unknown,
): value is ClassificacaoRisco {
  return (Object.values(ClassificacaoRisco) as unknown[]).includes(value);
}

// ---------------------------------------------------------------------------
// StatusLevantamento
// ---------------------------------------------------------------------------

/** Execution lifecycle of the perfil/risco levantamento. */
export const StatusLevantamento = {
  Pendente: 'PENDENTE',
  EmExecucao: 'EM_EXECUCAO',
  Concluido: 'CONCLUIDO',
  Encerrado: 'ENCERRADO',
} as const;

export type StatusLevantamento =
  (typeof StatusLevantamento)[keyof typeof StatusLevantamento];

export const STATUS_LEVANTAMENTO_LABEL: Record<StatusLevantamento, string> = {
  PENDENTE: 'Aguardando',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDO: 'Concluído',
  ENCERRADO: 'Encerrado',
};

/** Type guard — unknown values are treated as PENDENTE (safest state). */
export function isStatusLevantamento(
  value: unknown,
): value is StatusLevantamento {
  return (Object.values(StatusLevantamento) as unknown[]).includes(value);
}

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

/**
 * Uma seção do detalhamento, derivada do `textoEstruturado` do Brax (ADR-0052).
 *
 * ⚠️ **Os dois campos são texto do FORNECEDOR e são renderizados verbatim.** O
 * Brax entrega prosa (`"Sem débitos vencidos"`, `"0 apontamentos no valor de
 * R$ 0,00"`), não número: qualquer tentativa de extrair valor de máquina daqui
 * produziria um dado indistinguível de medição na tela de quem decide crédito.
 * Não formatar como moeda, não parsear data, não comparar.
 *
 * A ordem é a do emissor, e a lista carrega **todo** rótulo que chegar —
 * inclusive um que ninguém combinou. Filtrar pelos cinco conhecidos (Risco ·
 * POC · Restrições · Histórico com a VIBRA · Média de atraso) faria a sexta
 * seção sumir da tela em silêncio.
 */
export interface SecaoAnalise {
  rotulo: string;
  valor: string;
}

/**
 * Integration gap — a field (or group of fields) whose source is not yet
 * connected. The `message` names the pending integration so the UI can label
 * what is missing instead of silently displaying a dash.
 * Example: `{ fields: ['score'], message: 'Aguardando integração SAP' }`.
 */
export interface PerfilCreditoGap {
  fields: string[];
  message: string;
}

// ---------------------------------------------------------------------------
// PerfilCredito — main read model
// ---------------------------------------------------------------------------

/**
 * Full perfil/risco read model returned by
 * GET /api/opportunities/:id/perfil-credito.
 *
 * `null` from the BFF means the concessão does not require a perfil analysis
 * (no antecipação/mútuo) — the UI must hide the row entirely, not display
 * "Não se aplica".
 */
export interface PerfilCredito {
  status: StatusLevantamento;

  /**
   * Risk classification — null until status is CONCLUIDO.
   * ALTO does NOT imply blocking: `bloqueiaFluxo` carries that semantic and
   * the UI must not branch on `classificacao` for any business logic.
   */
  classificacao: ClassificacaoRisco | null;

  /**
   * StatusPill variant provided by the backend ('success' | 'warning' | 'danger').
   * The UI uses this directly — never derives colour from `classificacao`.
   */
  classificacaoPill: 'success' | 'warning' | 'danger' | null;

  /**
   * As seções do detalhamento (ADR-0052). Vazio enquanto o callback do Brax não
   * chegou — e também num levantamento anterior a 16/09/2026, caso em que
   * `gaps` nomeia a ausência.
   */
  secoes: SecaoAnalise[];

  /**
   * As linhas do texto sem rótulo — no envelope acordado, a ressalva final
   * (*"Levantamento realizado com base nos dados obtidos em …"*). Renderizada
   * ao pé do detalhamento. `null` quando não há nenhuma.
   */
  observacao: string | null;

  /** ISO date do levantamento (backend: `levantadoEm`). */
  dataLevantamento: string | null;

  /** Human-readable reason shown in the detail when status is ENCERRADO. */
  motivoEncerramentoLabel: string | null;

  gaps: PerfilCreditoGap[];

  /**
   * Always false until GAR-5 (contract gate). The frontend never gates or
   * blocks any flow based on this value — it is informational only.
   */
  bloqueiaFluxo: boolean;
}
