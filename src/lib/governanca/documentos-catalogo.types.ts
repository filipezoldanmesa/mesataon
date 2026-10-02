/**
 * Tipos da aba **Governança → Documentos** (`15-governanca.html`, F1).
 *
 * Espelham `GET /v1/documents/parametrization` (o catálogo) e
 * `GET /v1/garantia/documentos-por-modalidade` (a projeção de
 * `documentosObrigatoriosDoTipo`). Não invente campo aqui.
 */

/** Uma linha de `document_parametrizations`. */
export interface DocumentoParametrizacao {
  category: string;
  type: string;
  /** `null` = não obrigatório em etapa nenhuma. */
  stageLimit: string | null;
  required: boolean;
  /** `true` = um documento por tipo; é o mais próximo de "Qtd. máx." que existe. */
  single: boolean;
  /**
   * `false` = fora de circulação (VBR-645): não aparece para anexar e o upload
   * o recusa, mas o que já foi anexado nele continua legível. É o que substitui
   * a remoção — apagar a linha responderia "este tipo nunca existiu" a arquivos
   * que existem.
   */
  selectable: boolean;
  acceptedTypes: string[];
  /**
   * Quantos documentos já foram anexados com este `(category, type)`
   * (22/09/2026). É o que EXPLICA o `removable` na tela.
   */
  attachmentCount: number;
  /**
   * A linha pode ser apagada? — **veredito do backend**, nunca recalculado aqui
   * (22/09/2026). Hoje é `attachmentCount === 0`, e mesmo assim viaja como campo
   * próprio: derivar na tela faria a regra divergir da API no dia em que ela
   * ganhasse outra condição.
   */
  removable: boolean;
  updatedAt: string;
}

/** `POST /api/governanca/documentos` — o par `category`+`type` é a CHAVE. */
export interface NovoDocumentoParametrizacao {
  category: string;
  type: string;
  stageLimit: string | null;
  required: boolean;
  single: boolean;
  selectable: boolean;
  acceptedTypes: string[];
}

/**
 * `PUT /api/governanca/documentos/:category/:type` — só o que vem muda.
 *
 * ⚠️ `category`/`type` ficam de fora de propósito: eles identificam a linha, e
 * renomear um par é outra operação (os documentos anexados apontam para o par
 * antigo).
 */
export type EdicaoDocumentoParametrizacao = Partial<
  Omit<NovoDocumentoParametrizacao, 'category' | 'type'>
>;

/** Os documentos exigidos por uma modalidade de garantia. */
export interface DocumentosPorModalidade {
  tipo: string;
  tipoLabel: string;
  /** ⚠️ Vazio é resposta: fiança sem lastro não exige documento do bem. */
  documentos: string[];
}
