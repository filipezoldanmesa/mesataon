/**
 * Tipos da aba **Governança → CCOB** ("Distribuição CCOB").
 *
 * Espelham os DTOs do backend (`GET /v1/ccob/distribuicao`) — não invente campo
 * aqui.
 *
 * ⚠️ **Uma tabela, não quatro blocos.** A Distribuição SNEG tem `etapa`
 * (Análise, Minutas, Cadastro, Hipoteca) porque o negócio nomeou aqueles quatro
 * blocos para a SNEG (ADO 67909); ninguém nomeou etapas para a CCOB, e o pedido
 * recorta o escopo à **análise prévia** ("pode ignorar a análise de perfil,
 * porque ela é automatizada"). Inventar etapas aqui criaria vocabulário de
 * negócio que nenhuma fonte declara.
 */

/** Uma gerência e o analista da CCOB responsável pela análise prévia dela. */
export interface GerenciaCcob {
  gerencia: string;
  /**
   * `null` = gerência sem analista parametrizado. A garantia dela entra em
   * análise prévia do mesmo jeito (nada bloqueia) e fica com "atribuição
   * pendente" até alguém parametrizar — é justamente a linha a corrigir.
   */
  analistaId: string | null;
  analistaNome: string | null;
  analistaEmail: string | null;
  /** Quantas garantias desta gerência estão em análise prévia agora. */
  garantiasEmAnalisePrevia: number;
  /** ISO-8601, ou `null` para gerência que nunca foi parametrizada. */
  atualizadaEm: string | null;
}

export interface GerenciaCcobList {
  items: GerenciaCcob[];
  total: number;
}

/** Uma linha de `ccob_assignments` como o `PUT` a devolve. */
export interface CcobDistribuicao {
  gerencia: string;
  analistaId: string;
  analistaNome: string | null;
  analistaEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Resultado da reatribuição EM LOTE de uma gerência
 * (`POST /api/governanca/ccob/distribuicao/reatribuir`).
 *
 * Os DOIS contadores viajam porque a tela precisa distinguir "nenhuma garantia
 * precisou mudar" de "N passaram" — e `parametrizacaoAtualizada` é o efeito que
 * **sempre** acontece, inclusive com fila vazia, então é por ele que a frase da
 * tela começa (lição do ADO 67909, cuja versão anterior produzia
 * "0 oportunidade(s) … passaram", que lê como "nada aconteceu").
 */
export interface ReatribuicaoGerenciaCcobResult {
  gerencia: string;
  analistaId: string;
  analistaNome: string;
  reatribuidas: number;
  inalteradas: number;
  parametrizacaoAtualizada: boolean;
}
