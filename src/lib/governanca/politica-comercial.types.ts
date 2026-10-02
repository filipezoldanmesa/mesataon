/**
 * Tipos da aba **Governança → Política comercial** (`15-governanca.html`, F3).
 *
 * Espelham os DTOs de `GET /v1/sneg/politica-comercial` — não invente campo
 * aqui.
 *
 * ⚠️ **Nada nesta tela é transcrito de PDF** (reescrita de 08/09/2026, depois de
 * o negócio recusar a primeira versão: *"está hardcoded??"*). Todo número vem
 * de `sneg_bp_standards` (parametrizável pela SNEG) ou do Salesforce
 * (`CompetenceRuleLogicalTest__c`). O que sobrou de constante é identidade de
 * documento e o inventário do que nenhuma fonte publica, em `lacunas*`.
 */

/**
 * Um campo que a política pede e cuja fonte não o entrega — com a FONTE
 * nomeada.
 *
 * Decisão de produto de 08/09/2026: renderizar o card **com a lacuna nomeada**,
 * em vez de esconder o card ou mostrar um traço mudo. A frase vem do backend
 * (ADR-0018) e é exibida verbatim.
 */
export interface Lacuna {
  campo: string;
  motivo: string;
}

/**
 * A IDENTIDADE de um documento — sem o bloco de controle (revisão, revisado
 * em, próxima análise crítica).
 *
 * ⚠️ Aquele bloco saiu em 08/09/2026: apodrecia calado (a tela seguiria
 * afirmando a revisão anterior para sempre) e lia como frescor da TELA em vez
 * de do documento.
 */
export interface DocumentoPolitica {
  categoria: string;
  codigo: string;
  titulo: string;
}

/**
 * Uma linha do card "Parâmetros de referência para aderência", **derivada** dos
 * padrões de BP e das regras do org.
 *
 * ⚠️ Sem coluna de `tolerancia`: `PadraoAnaliseService` acusa desvio a qualquer
 * excesso sobre a referência, **sem folga**. A versão anterior desta tela
 * anunciava `±10%` e contradizia o motor que decide aderência — é `foraDaFaixa`
 * que diz o que o código faz.
 */
export interface ParametroReferencia {
  parametro: string;
  referencia: string;
  foraDaFaixa: string;
  /** De onde o número vem, nomeado para o leitor conferir. */
  fonte: string;
}

/**
 * Uma linha do card "Limiares econômicos por tipo de proposta", na forma do
 * protótipo: tipo de proposta + os três eixos + o que a violação escala.
 *
 * ⚠️ As faixas vêm no **vocabulário do org, sem tradução** (`MENOR QUE TMA + 2`).
 */
export interface LimiarPorTipoProposta {
  tiposProposta: string[];
  grupo: string;
  /** `null` quando o grupo não tem regra daquele eixo — nunca `0`. */
  margem: string | null;
  tir: string | null;
  vpl: string | null;
  /** CONJUNTO: o org escala por eixo, e um grupo pode ir a níveis diferentes. */
  naViolacao: string[];
}

/** Uma linha do card "Premissas da política desmarcáveis". */
export interface PremissaDesmarcavel {
  premissa: string;
  nivelAoDesmarcar: string | null;
  grupo: string;
}

export interface VerbaBp {
  referencia: string;
  /** String decimal — o dinheiro nunca atravessa a API como número. */
  verba: string;
}

export interface PoliticaComercial {
  documentos: DocumentoPolitica[];
  /** O `% de antecipado (padrão)` do protótipo, lido de `sneg_bp_standards`. */
  mixAntecipadoPadrao: string | null;
  parametrosReferencia: ParametroReferencia[];
  /** Vazio quando a leitura do org falhou — aí `lacunasLimiares` explica. */
  limiares: LimiarPorTipoProposta[];
  /** Vazio quando a leitura do org falhou — mesma lacuna dos limiares. */
  premissas: PremissaDesmarcavel[];
  /** `null` quando a verba não foi parametrizada — nunca `0`. */
  verba: VerbaBp | null;
  lacunasVerba: Lacuna[];
  lacunasLimiares: Lacuna[];
  lacunasDocumentos: Lacuna[];
}
