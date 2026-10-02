/**
 * Tipos da aba **Governança → SNEG** ("Distribuição SNEG",
 * `15-governanca.html`). Espelham os DTOs do backend
 * (`GET /v1/analise/distribuicao`) — não invente campo aqui.
 */

/**
 * As etapas da distribuição — espelho de `EtapaDistribuicao` no backend
 * (ADO 67909).
 *
 * ⚠️ **A tela NÃO mantém rótulo nem ordem.** Os dois vêm no payload
 * (`etapaLabel`, e a ordem dos `blocos`), como todo rótulo desta plataforma:
 * uma segunda lista aqui divergiria na etapa que alguém acrescentar.
 */
export type EtapaDistribuicao = 'ANALISE' | 'MINUTAS' | 'GARANTIA';

/*
 * ⚠️ `CADASTRO` e `HIPOTECA` NÃO voltam (20/09/2026): *"devemos renomear
 * Hipoteca para Garantia e remover o fluxo de Cadastro (ele não existe mais)"*.
 * O `CHECK` do banco (`chk_sneg_assignments_stage`) recusa os dois, então um
 * membro ressuscitado aqui produziria um select que grava e falha no `INSERT`.
 */

/** Uma gerência e o analista responsável por ela, dentro de um bloco. */
export interface GerenciaDistribuicao {
  gerencia: string;
  /** `null` = gerência sem analista parametrizado (RN-F1-01, atribuição pendente). */
  analistaId: string | null;
  analistaNome: string | null;
  analistaEmail: string | null;
  /**
   * Análises abertas — quantas a reatribuição em lote alteraria.
   *
   * `null` fora do bloco **Análise**: a contagem é de análises e não descreveria
   * nada nas outras etapas.
   */
  oportunidadesEmCurso: number | null;
  /** ISO-8601, ou `null` para gerência sem entrada na tabela. */
  atualizadaEm: string | null;
}

/** Um bloco da tela: uma etapa e as gerências dela. */
export interface BlocoDistribuicao {
  etapa: EtapaDistribuicao;
  /** Rótulo pt-BR, composto no backend. */
  etapaLabel: string;
  /**
   * A frase abaixo do título do bloco, **composta no backend** (ADR-0018).
   *
   * ⚠️ Era um TERNÁRIO sobre `executaDistribuicao` até 20/09/2026, e por isso
   * escrevia *"a distribuição automática vale para a Análise"* em toda etapa que
   * respondesse `false`. Com a etapa **Garantia** passando a distribuir (na
   * aprovação da análise prévia), aquela frase virou falsa no bloco dela. São
   * três respostas diferentes, e quem as conhece é o backend.
   */
  legenda: string;
  /**
   * **Veredito do backend**: se esta etapa admite reatribuição EM LOTE por esta
   * aba. A tela oferece "Reatribuir" só quando `true` e **nunca recalcula** —
   * uma segunda cópia da regra ofereceria um CTA que a API recusa.
   *
   * ⚠️ `false` NÃO quer dizer "não distribui": a etapa `GARANTIA` distribui, e o
   * que ela não tem é fila em lote. Quem diz o que cada etapa faz é
   * {@link legenda}.
   */
  executaDistribuicao: boolean;
  items: GerenciaDistribuicao[];
}

export interface GerenciaDistribuicaoList {
  blocos: BlocoDistribuicao[];
  /** Gerências distintas (a mesma quantidade em cada bloco). */
  total: number;
}

/** Resultado da reatribuição em lote. */
export interface ReatribuicaoGerenciaResult {
  gerencia: string;
  analistaId: string;
  analistaNome: string | null;
  /** Análises abertas que de fato trocaram de analista. */
  reatribuidas: number;
  /** Análises abertas que já estavam com este analista. */
  inalteradas: number;
  /**
   * Se a parametrização da etapa Análise passou a apontar para este analista
   * (ADO 67909) — é o que faz o nome aparecer na coluna, e o efeito que existe
   * mesmo quando `reatribuidas` é 0.
   */
  parametrizacaoAtualizada: boolean;
}
