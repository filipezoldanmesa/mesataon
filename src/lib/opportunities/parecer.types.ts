/**
 * Frontend types for the Parecer Técnico SNEG (F5 — VBR-168/VBR-169 backend,
 * VBR-170 this frontend block). Mirrors `apps/api/src/parecer/dto/*.ts`.
 */

export type ParecerStatus = 'rascunho' | 'concluido';

export type ParecerRecomendacaoNota = 'aprovar' | 'ajustar' | 'devolver';

export type IndicadorSituacao = 'padrao' | 'excecao';

export interface ParecerCabecalho {
  oportunidadeNumero: string | null;
  tipoNegociacao: string | null;
  posto: string | null;
  localizacao: string | null;
  regional: string | null;
  gerenteVendas: string | null;
  dataGeracao: string;
}

export interface ParecerResumoNegociacao {
  volume: number | null;
  prazo: number | null;
  recursoFinanceiro: number | null;
  antecipacao: number | null;
  postecipacao: number | null;
  /** Free-text narrative — the only analyst-editable field of this section. */
  briefing: string | null;
}

export interface ParecerVolumeEqualizacao {
  volumeNegociado: number | null;
  volumeReferencia: number | null;
  equalizacao: number | null;
  observacoes: string | null;
}

export interface ParecerIndicador {
  nome: string;
  valorNegociado: number | null;
  valorReferencia: number | null;
  situacao: IndicadorSituacao | null;
}

export interface ParecerFranquiasGarantias {
  franquia: string | null;
  garantia: string | null;
  observacoes: string | null;
}

export interface ParecerAderenciaPolitica {
  excecoes: string[];
  aderente: boolean;
  observacoes: string | null;
}

export interface ParecerAlcada {
  nivel: string;
  descricao: string | null;
}

/**
 * Uma marcação de aderência.
 *
 * `null` é "não respondido", e NÃO é o mesmo que "Não" — a marcação corrige a
 * alçada antes do envio ao Salesforce, então tratar ausência como negativa
 * afirmaria uma checagem que ninguém fez. Espelha `MarcacaoAderencia` do
 * backend (`parecer.dto.ts`).
 */
export type MarcacaoAderencia = 'sim' | 'nao' | null;

/**
 * As três marcações do card "Aderência à política e alçada", preenchidas pelo
 * analista. Lidas e escritas em conjunto — o backend grava a coluna `jsonb`
 * inteira, então um PATCH parcial apagaria as outras duas.
 */
export interface ParecerMarcacoesAderencia {
  padraoComercial: MarcacaoAderencia;
  politicaComercial: MarcacaoAderencia;
  orcamentoVpFin: MarcacaoAderencia;
}

export interface ParecerRecomendacao {
  nota: ParecerRecomendacaoNota;
  parecerExecutivo: string | null;
}

export interface Parecer {
  id: string;
  opportunityId: string;
  versao: number;
  status: ParecerStatus;
  cabecalho: ParecerCabecalho | null;
  resumoNegociacao: ParecerResumoNegociacao | null;
  volumeEqualizacao: ParecerVolumeEqualizacao | null;
  indicadores: ParecerIndicador[] | null;
  franquiasGarantias: ParecerFranquiasGarantias | null;
  aderenciaPolitica: ParecerAderenciaPolitica | null;
  alcadaSugerida: ParecerAlcada | null;
  /**
   * Respostas do analista. `null` enquanto o parecer nasce — o backend não
   * inventa default, porque "não respondido" é um estado de negócio.
   *
   * ⚠️ O backend valida a coluna apenas como `@IsObject()`, sem checar chave nem
   * valor, então trate o conteúdo como não confiável na leitura.
   */
  marcacoesAderencia: ParecerMarcacoesAderencia | null;
  /** Texto livre "Análise de aderência à política comercial" — editável. */
  analiseAderencia: string | null;
  justificativaAlcada: string | null;
  recomendacao: ParecerRecomendacao | null;
  pontosAtencao: string | null;
  /**
   * Observações complementares do analista — bloco de fechamento do parecer.
   *
   * Distinto de `pontosAtencao`: aquele sinaliza RISCO ao aprovador, este é
   * contexto. Por isso são dois campos, e o PDF os imprime separados.
   */
  outrasInformacoes: string | null;
  fontes: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParecerVersaoEntry {
  id: string;
  opportunityId: string;
  versao: number;
  motivo: 'gerado' | 'editado';
  autorId: string;
  autorNome: string | null;
  snapshot: Parecer;
  createdAt: string;
}

export interface ParecerVersaoList {
  items: ParecerVersaoEntry[];
  total: number;
}

/** PATCH payload — only the fields accepted by `EditarParecerDto` (backend). */
export interface EditarParecerPayload {
  resumoNegociacao?: { briefing?: string };
  /**
   * Sempre as TRÊS marcações. O backend faz
   * `parecer.marcacoesAderencia = dto.marcacoesAderencia` (substituição da
   * coluna inteira), então enviar uma só apagaria as outras duas.
   */
  marcacoesAderencia?: ParecerMarcacoesAderencia;
  analiseAderencia?: string;
  justificativaAlcada?: string;
  recomendacao?: { nota: ParecerRecomendacaoNota; parecerExecutivo?: string };
  pontosAtencao?: string;
  outrasInformacoes?: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class OpportunityNotFoundForParecerError extends Error {
  constructor(opportunityId: string) {
    super(`Oportunidade não encontrada para parecer (${opportunityId}).`);
    this.name = 'OpportunityNotFoundForParecerError';
  }
}

export class ParecerAlreadyEmittedError extends Error {
  constructor() {
    super('Parecer já emitido — não é possível editar ou regenerar.');
    this.name = 'ParecerAlreadyEmittedError';
  }
}
