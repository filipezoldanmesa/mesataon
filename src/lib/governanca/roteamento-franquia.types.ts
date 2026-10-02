/**
 * Espelho dos DTOs de `GET/PUT /v1/roteamento-franquia/distribuicao`
 * (Governança → Distribuição Franquias, pedido de 19/09/2026).
 */

/** As duas bandeiras — os MESMOS valores que `proposals.type` grava. */
export const BandeiraFranquia = {
  BrMania: 'ZBRM',
  Lubrax: 'ZLUB',
} as const;

export type BandeiraFranquia =
  (typeof BandeiraFranquia)[keyof typeof BandeiraFranquia];

/**
 * Uma célula da tabela: o par `(bandeira, gerência)`.
 *
 * ⚠️ `executivoId: null` é **resposta de negócio** — é a linha a preencher, não
 * lacuna de leitura. É por isso que o par aparece na tela mesmo sem executivo.
 */
export interface RoteamentoFranquiaGerencia {
  bandeira: BandeiraFranquia;
  /** Rótulo pt-BR composto no backend — a tela não mantém uma segunda lista. */
  bandeiraLabel: string;
  gerencia: string;
  executivoId: string | null;
  executivoNome: string | null;
  executivoEmail: string | null;
  /** Volume que a linha roteia. Informativo, nunca gate. */
  propostasDaBandeira: number;
  atualizadaEm: string | null;
}

export interface RoteamentoFranquiaList {
  items: RoteamentoFranquiaGerencia[];
  total: number;
}

/** A linha devolvida pelo `PUT`. */
export interface RoteamentoFranquia {
  bandeira: BandeiraFranquia;
  bandeiraLabel: string;
  gerencia: string;
  executivoId: string;
  executivoNome: string | null;
  executivoEmail: string | null;
  createdAt: string;
  updatedAt: string;
}
