/**
 * O estado do FORMULÁRIO de garantia do ticket de pendência, e a hidratação de
 * uma garantia JÁ PERSISTIDA nele.
 *
 * Vive fora do componente por uma razão só: a hidratação é uma função pura com
 * regra de negócio (rótulo → código, valor mascarado, blocos de matrícula e
 * laudo) e merece teste próprio — dentro de um componente de 4.600 linhas ela só
 * seria exercitável abrindo um modal.
 *
 * ⚠️ Este formulário guarda CÓDIGOS (`GARANTIA_REAL`, `NOVA`), enquanto o do
 * card da 01b guarda RÓTULOS. Os dois montam a mesma tela e não são o mesmo
 * estado — ver o docblock da rota BFF de edição para o que isso implica no
 * corpo que cada um envia.
 */
import {
  blocosDeLaudos,
  blocosDeMatriculas,
  LAUDO_BLOCO_VAZIO,
  MATRICULA_BLOCO_VAZIO,
  type LaudoBloco,
  type MatriculaBloco,
} from '@/components/garantia/matriculas-laudos-blocos';
import {
  CATEGORIA_GARANTIA_OPTIONS,
  ORIGEM_GARANTIA_OPTIONS,
  TIPO_GARANTIA_OPTIONS,
  ORIGEM_GARANTIA,
  TIPO_GARANTIA_PADRAO,
  TIPO_DOCUMENTO_LAUDO,
} from '@/lib/garantia/constants';
import type {
  CategoriaBem,
  OrigemGarantia,
  TipoGarantia,
} from '@/lib/garantia/constants';
import type { GarantiaIndicacaoItem } from '@/lib/garantia/indicacoes.types';

export type GarantiaFormFields = {
  tipo: TipoGarantia | '';
  origem: OrigemGarantia | '';
  /** `Utilizacao__c` — o que a garantia lastreia. Vazio = "Nenhum". */
  utilizacao: string;
  // Property fields (relevant when exigeImovel && origem === NOVA)
  imovelEndereco: string;
  /**
   * HIP-01 — os NÚMEROS das matrículas, na ordem da tela.
   *
   * Substituiu `imovelMatricula` (texto único): desde 31/08/2026 o número
   * multiplica com a quantidade, e cada matrícula tem a SUA certidão. Sempre ao
   * menos uma posição enquanto o tipo tem bem — é o repetidor, e a linha em branco
   * é onde o usuário digita.
   */
  matriculas: MatriculaBloco[];
  /**
   * HIP-02 — os laudos, um bloco por laudo (01/09/2026).
   *
   * Era um campo NUMÉRICO ("quantidade de laudos") mais um slot fixo de anexo:
   * declarar 3 e ter onde anexar 1. A QUANTIDADE agora é `laudos.length`.
   */
  laudos: LaudoBloco[];
  imovelCidade: string;
  imovelUf: string;
  // Category and value (relevant when exigeImovel)
  categoria: CategoriaBem | '';
  valorAvaliadoBRL: string; // raw text input; parsed to number before submit
  // Existing guarantee (relevant when origem === EXISTENTE)
  sapGarantiaExternaId: string;
  /**
   * GER-03 — "Essa garantia será compartilhada com outras oportunidades?"
   *
   * Pré-marcada em "Não". O padrão vive AQUI, no formulário, onde a pessoa o vê e
   * pode contradizê-lo — nunca no DTO, que exige a resposta.
   */
  compartilhada: boolean;
  detalhesCompartilhamento: string;
  /**
   * GER-01 — a área de "Documentos complementares", escolhidos e pendentes de
   * upload (sobem junto dos demais anexos, depois da indicação existir).
   *
   * ⚠️ **Faltava neste formulário** (retest 03/09/2026). GER-01 diz que a área
   * vale para TODOS os tipos de garantia, e o ticket é a **única** superfície de
   * escrita durante a análise — o card da 01b fica somente leitura fora da fase
   * de preenchimento (`indicacaoMutavel`). Sem ela, em análise não havia como
   * anexar documento complementar a garantia nenhuma.
   *
   * Array porque é uma ÁREA, não um slot: o tipo é `single: false` no catálogo,
   * então cada arquivo é um documento a mais, nunca uma substituição.
   */
  complementares: File[];
  // Observations
  observacoes: string;
};

export const GARANTIA_FORM_EMPTY: GarantiaFormFields = {
  /*
   * RN-F1-07: "por padrão, a garantia segue por hipoteca; a nova imagem pode ser
   * por fiança (exceção)". A pre-selection, not a constraint — every other type
   * stays selectable, because the rule itself grants the exception and only the
   * LT knows which case this is.
   */
  tipo: TIPO_GARANTIA_PADRAO,
  origem: ORIGEM_GARANTIA.NOVA,
  utilizacao: '',
  imovelEndereco: '',
  matriculas: [{ ...MATRICULA_BLOCO_VAZIO }],
  laudos: [{ ...LAUDO_BLOCO_VAZIO }],
  imovelCidade: '',
  imovelUf: '',
  categoria: '',
  valorAvaliadoBRL: '',
  sapGarantiaExternaId: '',
  compartilhada: false,
  detalhesCompartilhamento: '',
  complementares: [],
  observacoes: '',
};

/**
 * Acha o CÓDIGO a partir do rótulo que a lista mostra.
 *
 * O item vem da BFF já rotulado (`tipo: "Garantia real (hipoteca / alienação
 * fiduciária)"`) e este formulário trabalha com código. Rótulo que não casa
 * devolve `''` — o campo abre vazio e o formulário exige a escolha, que é
 * visível e recuperável; adivinhar o vizinho gravaria um tipo que ninguém
 * escolheu.
 */
function codigoDoRotulo<T extends string>(
  opcoes: ReadonlyArray<{ value: string; label: string }>,
  rotulo: string | null | undefined,
): T | '' {
  if (!rotulo) return '';
  return (opcoes.find((o) => o.label === rotulo)?.value as T | undefined) ?? '';
}

/**
 * Uma garantia JÁ PERSISTIDA, na forma que o formulário do ticket edita.
 *
 * ⚠️ Reabrir PREENCHIDO não é conforto: o update é **replace-all**, então um
 * bloco que voltasse em branco faria o save APAGAR o que estava lá (é o mesmo
 * motivo pelo qual o card hidrata fiadores e matrículas).
 *
 * ⚠️ Os documentos JÁ ANEXADOS não viram escolha pendente — eles existem no
 * backend. O que a hidratação carrega deles são os IDS dos laudos, de onde sai o
 * `substituirDocumentoId`: sem isso, escolher outro arquivo no "Laudo 1"
 * anexaria um SEGUNDO laudo em vez de trocar o primeiro (defeito medido no card
 * em 03/09/2026).
 */
export function itemParaFormularioDoTicket(
  item: GarantiaIndicacaoItem,
): GarantiaFormFields {
  const matriculas = item.matriculas ?? [];

  return {
    ...GARANTIA_FORM_EMPTY,
    tipo: codigoDoRotulo<TipoGarantia>(TIPO_GARANTIA_OPTIONS, item.tipo),
    origem: codigoDoRotulo<OrigemGarantia>(ORIGEM_GARANTIA_OPTIONS, item.origem),
    // O API name do org JÁ é o rótulo desta picklist — não há par a converter.
    utilizacao: item.utilizacao ?? '',
    imovelEndereco: item.imovel ?? '',
    imovelCidade: item.imovelCidade ?? '',
    imovelUf: item.imovelUf ?? '',
    /*
     * A coluna LEGADA (`item.matricula`) hidrata a primeira linha quando a
     * coleção está vazia: sem isso, editar uma garantia anterior a HIP-01
     * mostraria o campo em branco e o save apagaria a matrícula que estava lá.
     */
    matriculas:
      matriculas.length > 0
        ? blocosDeMatriculas(matriculas)
        : blocosDeMatriculas(
            item.matricula
              ? [{ numero: item.matricula, certidaoAnexada: false }]
              : [],
          ),
    laudos: blocosDeLaudos(
      item.quantidadeLaudos,
      (item.documentos ?? [])
        .filter((d) => d.type === TIPO_DOCUMENTO_LAUDO)
        /*
         * `null` no LEGADO: ali o `id` é o SLOT (`"laudo"`), não um documento do
         * repositório — mandá-lo como `substituirDocumentoId` chegaria ao
         * Postgres como uuid inválido (22P02 ⇒ 400) e derrubaria o upload.
         */
        .map((d) => (d.legado ? null : d.id)),
    ),
    categoria: codigoDoRotulo<CategoriaBem>(
      CATEGORIA_GARANTIA_OPTIONS,
      item.categoria,
    ),
    // O input mantém o texto mascarado pt-BR; o prefixo "R$ " é da exibição.
    valorAvaliadoBRL: (item.valor ?? '').replace(/^R\$\s?/, ''),
    compartilhada: item.compartilhada === true,
    detalhesCompartilhamento: item.detalhesCompartilhamento ?? '',
    // Escolha PENDENTE, nunca hidratada: os anexados já estão no backend.
    complementares: [],
    observacoes: item.observacoes ?? '',
  };
}
