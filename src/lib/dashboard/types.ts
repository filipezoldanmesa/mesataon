/**
 * Dashboard / Resumo Executivo (F1 — DASH-F1)
 *
 * Enumerations that mirror the backend values for the dashboard domain.
 * All are `as const` objects so call sites compare against a named member
 * (`Persona.SNEG`) instead of a bare string, and the mapper can narrow
 * unknown backend values via the corresponding type guard.
 *
 * Unknown values always fall to the **safest** rendered state — a widget
 * that is discarded, a recorte that shows nothing, a persona that hides
 * persona-specific UI — never to the first member chosen at random.
 */

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

/**
 * Dashboard personas.  Mirrors the backend `DashboardPersona` enum
 * (`GET /v1/dashboard/resumo` → `persona`).
 */
export const Persona = {
  /** Líder de Território / Efetuador de Vendas */
  LT_EV: 'LT_EV',
  /** Superintendente de Negócios */
  SNEG: 'SNEG',
  /** Gestor comercial */
  Gestor: 'GESTOR',
  /** Célula de Crédito e Originação de Bônus */
  CCOB: 'CCOB',
  /** Superintendência Comercial */
  SPCOM: 'SPCOM',
} as const;

export type Persona = (typeof Persona)[keyof typeof Persona];

/** pt-BR display labels for each {@link Persona}. */
export const PERSONA_LABEL: Record<Persona, string> = {
  [Persona.LT_EV]: 'LT/EV',
  [Persona.SNEG]: 'SNEG',
  [Persona.Gestor]: 'Gestor',
  [Persona.CCOB]: 'CCOB',
  [Persona.SPCOM]: 'SPCOM',
};

/** Narrows an unvalidated backend value to {@link Persona}. */
export function isPersona(value: unknown): value is Persona {
  return typeof value === 'string' && (Object.values(Persona) as string[]).includes(value);
}

// ---------------------------------------------------------------------------
// DashboardWidget
// ---------------------------------------------------------------------------

/**
 * Widget identifiers that may appear in the `widgets` array of the backend
 * response.  Unknown identifiers are **discarded** (CA-3): the mapper filters
 * them out so a new widget deployed on the backend does not crash the frontend
 * before it implements the corresponding component.
 */
export const DashboardWidget = {
  /** "Requer ação" — items requiring the user's immediate attention. */
  RequerAcao: 'REQUER_ACAO',
  /** "Principais oportunidades" — top opportunities in the user's scope. */
  PrincipaisOportunidades: 'PRINCIPAIS_OPORTUNIDADES',
  /** Pipeline by phase. */
  Pipeline: 'PIPELINE',
  /** "Pendências" — outstanding tasks assigned to the user. */
  Pendencias: 'PENDENCIAS',
  /** KPI summary cards. */
  Kpis: 'KPIS',
  /** "Oportunidades por atributo" — BR Mania / Lubrax+ / Posto counts (F1 · VBR-423). */
  OportunidadesPorAtributo: 'OPORTUNIDADES_POR_ATRIBUTO',
  /**
   * "Distribuição por analista" — opportunities per analyst, "Sem analista" in
   * red (F1 · VBR-423).
   *
   * The wire value is `POR_ANALISTA`: widget ids are a backend verdict
   * (ADR-0030), so this mirror must carry the id the backend actually emits.
   * While it read `DISTRIBUICAO_POR_ANALISTA` the mapper discarded the widget
   * as unknown and the card never rendered for anyone.
   */
  DistribuicaoPorAnalista: 'POR_ANALISTA',
  /** Devolutivas quality KPIs — tempo médio, taxa de reaberturas, % 1º retorno (F2 · VBR-428). */
  Devolutivas: 'DEVOLUTIVAS',
  /**
   * Tabela "Análise Prévia" — a fila da CCOB, com os valores de concessão
   * financeira que cada garantia em análise lastreia.
   *
   * ⚠️ O id na rede é `GARANTIAS` (o slot que o catálogo de personas sempre
   * declarou para a CCOB); o TÍTULO da tela é "Análise Prévia", que é como o
   * negócio nomeia a tarefa. Renomear o id quebraria o contrato com o backend —
   * ids de widget são veredito dele (ADR-0030) — e é exatamente a classe de
   * defeito que `DistribuicaoPorAnalista` já custou: o mapper descarta o
   * desconhecido em silêncio (CA-3) e o card simplesmente nunca renderiza.
   */
  Garantias: 'GARANTIAS',
  /**
   * Quadro "Oportunidades atribuídas" — a união das três atribuições que a
   * plataforma faz a um analista (Análise, Garantia, Minuta), ADO 68531.
   *
   * ⚠️ Quem recebe o widget vê o quadro; **de quem** são as linhas é decisão do
   * backend (a SNEG vê as próprias, o BP Financeiro vê todas). A tela nunca
   * pergunta a persona para decidir isso — ela renderiza o que vier, e o seletor
   * de analista só aparece quando o backend manda vocabulário.
   */
  OportunidadesAtribuidas: 'OPORTUNIDADES_ATRIBUIDAS',
  /**
   * Quadro "Oportunidades em ativação e em pagamento" — a fila da SPCOM.
   *
   * ⚠️ As duas fases não são estado da oportunidade: são os dois últimos passos
   * da trilha do contrato, derivados no backend do espelho do org. A tela só
   * exibe `faseLabel`.
   */
  OportunidadesAtivacaoPagamento: 'OPORTUNIDADES_ATIVACAO_PAGAMENTO',
  /**
   * Evolução do Dashboard SNEG (23/09/2026) — os três quadros novos do BP
   * Financeiro. Cada um se busca sozinho (endpoint próprio, com filtro).
   *
   * ⚠️ `PorAnalistaPorStatus` NÃO é `DistribuicaoPorAnalista` com filtro: aquele
   * id segue servindo o Gerente Varejo (só `EM_ANALISE`, dado do resumo).
   */
  DistribuicaoPorFase: 'DISTRIBUICAO_POR_FASE',
  PorAnalistaPorStatus: 'POR_ANALISTA_POR_STATUS',
  IndicadoresSneg: 'INDICADORES_SNEG',
} as const;

export type DashboardWidget = (typeof DashboardWidget)[keyof typeof DashboardWidget];

/** pt-BR display labels for each {@link DashboardWidget}. */
export const DASHBOARD_WIDGET_LABEL: Record<DashboardWidget, string> = {
  [DashboardWidget.RequerAcao]: 'Requer ação',
  [DashboardWidget.PrincipaisOportunidades]: 'Principais oportunidades',
  [DashboardWidget.Pipeline]: 'Pipeline',
  [DashboardWidget.Pendencias]: 'Pendências',
  [DashboardWidget.Kpis]: 'KPIs',
  [DashboardWidget.OportunidadesPorAtributo]: 'Oportunidades por atributo',
  [DashboardWidget.DistribuicaoPorAnalista]: 'Distribuição por analista',
  [DashboardWidget.Devolutivas]: 'Qualidade das devolutivas',
  [DashboardWidget.Garantias]: 'Análise Prévia',
  [DashboardWidget.OportunidadesAtribuidas]: 'Oportunidades atribuídas',
  [DashboardWidget.OportunidadesAtivacaoPagamento]:
    'Oportunidades em ativação e em pagamento',
  [DashboardWidget.DistribuicaoPorFase]: 'Distribuição por fase',
  [DashboardWidget.PorAnalistaPorStatus]: 'Distribuição por analista',
  [DashboardWidget.IndicadoresSneg]: 'Indicadores da SNEG',
};

/** Narrows an unvalidated backend value to {@link DashboardWidget}. */
export function isDashboardWidget(value: unknown): value is DashboardWidget {
  return (
    typeof value === 'string' && (Object.values(DashboardWidget) as string[]).includes(value)
  );
}

// ---------------------------------------------------------------------------
// Recorte
// ---------------------------------------------------------------------------

/**
 * Data scope applied to the summary.  Mirrors the backend `Recorte` enum
 * (`dashboard/domain/persona.ts`) — the scope determines which opportunities /
 * KPIs are included.
 *
 * ⚠️ Este espelho tinha QUATRO membros que o backend nunca emitiu — `PROPRIO`,
 * `EQUIPE`, `GERENCIA`, `GERAL` — contra os dois reais, `CARTEIRA` e `AREA`. Os
 * conjuntos não se cruzavam, então `isRecorte` devolvia `null` para TODA
 * resposta, o `KpiGrade` caía no seu default e o card "Pendências abertas"
 * escrevia "na sua carteira" para toda persona, inclusive as de AREA (SNEG,
 * Gerente Varejo) — afirmando um escopo que não era o do número ao lado.
 *
 * É a mesma classe do `DISTRIBUICAO_POR_ANALISTA` × `POR_ANALISTA`, que
 * `widget-contract.test.ts` existe para impedir: aquele teste confere o enum de
 * WIDGETS contra o `openapi.yaml`, e nada conferia o de recorte.
 */
export const Recorte = {
  /** Carteira do usuário — `opportunity_members` com `team_role = 'lt_principal'`. */
  Carteira: 'CARTEIRA',
  /** Área/fila — sem restrição de titularidade. */
  Area: 'AREA',
} as const;

export type Recorte = (typeof Recorte)[keyof typeof Recorte];

/** pt-BR display labels for each {@link Recorte}. */
export const RECORTE_LABEL: Record<Recorte, string> = {
  [Recorte.Carteira]: 'Minha carteira',
  [Recorte.Area]: 'Minha área',
};

/** Narrows an unvalidated backend value to {@link Recorte}. */
export function isRecorte(value: unknown): value is Recorte {
  return typeof value === 'string' && (Object.values(Recorte) as string[]).includes(value);
}
