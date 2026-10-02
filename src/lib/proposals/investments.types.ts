/**
 * Investimento de uma proposta — o card "Investimentos" das telas
 * `03-proposta-nova` / `03-proposta-ciclo1`.
 *
 * ⚠️ `TIPOS_INVESTIMENTO` é o espelho do enum do backend, que é o vocabulário
 * DESTA plataforma (as sete opções do protótipo aprovado) — **não** a picklist
 * `Tipo__c` do Salesforce, que tem dez valores diferentes. Por isso as opções
 * vêm daqui e não de `usePicklist`: não há picklist de catálogo para este campo,
 * e buscá-la traria o value set errado.
 */
export const TIPOS_INVESTIMENTO = [
  'Benfeitorias',
  'Equipamentos',
  'Imagem / comunicação visual',
  'Obra civil',
  'Terreno',
  'Móveis e utensílios',
  'Outros',
] as const;

export type TipoInvestimento = (typeof TIPOS_INVESTIMENTO)[number];

/** Type guard — valor desconhecido nunca vira rótulo cru na tela. */
export function isTipoInvestimento(value: unknown): value is TipoInvestimento {
  return typeof value === 'string' && (TIPOS_INVESTIMENTO as readonly string[]).includes(value);
}

/**
 * Tipos que o protótipo oferece e que **não têm contrapartida** no
 * `Investimento_Da_Cotacao__c` do Salesforce — nem em `Tipo__c` (que é
 * `restrictedPicklist`) nem como RecordType.
 *
 * Espelha `TIPOS_INVESTIMENTO_SEM_CONTRAPARTIDA` do backend. Salvar é
 * permitido — é dado de negócio legítimo —, mas a escrita da cotação recusa, e
 * sem este aviso o usuário descobriria isso dias depois, no "Acionar alçada".
 *
 * ⚠️ Pendência Q2b do plano: para onde mapear. Quando a Vibra responder, o
 * valor sai desta lista e o aviso desaparece sozinho.
 */
export const TIPOS_INVESTIMENTO_SEM_CONTRAPARTIDA_CRM: readonly TipoInvestimento[] = [
  'Móveis e utensílios',
];

/** `true` quando o tipo bloqueia a escrita da cotação (e portanto a alçada). */
export function tipoSemContrapartidaNoCrm(tipo: TipoInvestimento): boolean {
  return TIPOS_INVESTIMENTO_SEM_CONTRAPARTIDA_CRM.includes(tipo);
}

/**
 * Tipos que EXISTEM no org mas que o RecordType `Investimento_Proposto` não
 * oferece — espelha `TIPOS_INVESTIMENTO_FORA_DO_RECORTE_DO_ORG` do backend.
 *
 * ⚠️ Não é o mesmo que {@link TIPOS_INVESTIMENTO_SEM_CONTRAPARTIDA_CRM}:
 * `Terreno` mapeia perfeitamente e uma linha já gravada com ele continua sendo
 * escrita sem erro. O que se retira é a OFERTA. Medido em 19/09/2026: o recorte
 * do RecordType proposto é `Obra | Benfeitorias | Outros`, e `Terreno` aparece
 * em 0 das 1.697 linhas propostas do org.
 */
export const TIPOS_FORA_DO_RECORTE_DO_ORG: readonly TipoInvestimento[] = ['Terreno'];

/**
 * Os tipos que o modal OFERECE — decisão de 24/08/2026: só o que a escrita da
 * cotação atravessa hoje.
 *
 * ⚠️ **Derivado**, nunca uma segunda lista. Quando a Q2b for respondida, o valor
 * sai de {@link TIPOS_INVESTIMENTO_SEM_CONTRAPARTIDA_CRM} e volta a ser oferecido
 * sozinho — sem ninguém precisar lembrar de mexer aqui.
 *
 * ⚠️ São **seis**, não quatro. `Equipamentos` e `Imagem / comunicação visual`
 * usam RecordType próprio no org e não passam por `Tipo__c`, então a restrição
 * daquela picklist não os alcança.
 *
 * O enum continua com os sete: valor já gravado tem de continuar renderizando.
 */
export const TIPOS_INVESTIMENTO_SELECIONAVEIS: readonly TipoInvestimento[] =
  TIPOS_INVESTIMENTO.filter(
    (tipo) => !tipoSemContrapartidaNoCrm(tipo) && !TIPOS_FORA_DO_RECORTE_DO_ORG.includes(tipo),
  );

/**
 * A FAMÍLIA de RecordType do investimento — o eixo que decide quais campos o
 * formulário mostra (ADO 68506).
 *
 * ⚠️ Espelha `investmentCrmMapping().familia` do backend. O veredito continua
 * sendo dele: quem recusa um campo que a família não admite é o DTO, com 400.
 * Este mapa decide apenas o que DESENHAR — se divergir, a tela mostra um campo
 * que a API recusa, e o usuário descobre ao salvar.
 */
export type FamiliaInvestimento = 'Investimento' | 'Equipamento' | 'ElementoImagem';

const FAMILIA_POR_TIPO: Readonly<Record<TipoInvestimento, FamiliaInvestimento>> = {
  Benfeitorias: 'Investimento',
  'Obra civil': 'Investimento',
  Terreno: 'Investimento',
  Outros: 'Investimento',
  'Móveis e utensílios': 'Investimento',
  Equipamentos: 'Equipamento',
  'Imagem / comunicação visual': 'ElementoImagem',
};

export function familiaDoTipo(tipo: TipoInvestimento): FamiliaInvestimento {
  return FAMILIA_POR_TIPO[tipo];
}


/**
 * A obra que gerou este item (documento de 09/09/2026, SH-05).
 *
 * ⚠️ **Não-nulo é a definição de "item gerado por obra"** — é ele que acende o
 * selo, esconde a remoção individual e trava os campos automáticos (§6). O
 * `custeadoPelaObra` ao lado é LEGADO: nenhum caminho de escrita o preenche
 * desde esta entrega.
 */
export interface ItemObra {
  estimateId: string;
  tipo: string;
  /** ⚠️ `0` é a parcela de IMPOSTOS, não a primeira. */
  parcelaNumero: number;
  parcelaDescricao: string | null;
  /**
   * Veredito do BACKEND. Não reimplemente `flagsDeImposto` aqui: uma cópia
   * divergiria no retrato anterior a 03/09/2026, que não tem `parcelaDescricao`
   * e só se distingue por `parcelaNumero: 0`.
   */
  imposto: boolean;
}

export interface Investment {
  id: string;
  proposalId: string;
  /** `null` = não informada. */
  descricao: string | null;
  dataInvestimento: string;
  tipo: TipoInvestimento;
  vidaUtilFiscalMeses: number;
  detalhamentoItem: string;
  valorUnitario: number;
  /** `null` = não informado, distinto de `0`. A tela renderiza a diferença. */
  valorAquisicao: number | null;
  negociacaoOriginal: boolean;
  /**
   * Custeado pela **obra** (estimativa do Converge) da oportunidade — ADR-0048.
   *
   * ⚠️ Só a CONJUNÇÃO com o vínculo da oportunidade afirma alguma coisa: o flag
   * sozinho não nomeia obra nenhuma. O cartão renderiza `Obra (Converge)` quando
   * este campo é `true` **e** a oportunidade tem obra, igual ao
   * `(x.obra ? … : '')` do protótipo.
   */
  custeadoPelaObra: boolean;
  /**
   * A obra que gerou este item, ou `null` quando foi criado diretamente.
   * Ver {@link ItemObra}.
   */
  obra: ItemObra | null;


  // ── Campos por CATEGORIA (ADO 68506) ──────────────────────────────────────
  // `null` = a família deste investimento não usa o campo. A tela ESCONDE —
  // não renderiza "0" nem "não", que afirmariam algo que ninguém respondeu.

  /** Só a família Equipamento. `null` nas demais. */
  quantidade: number | null;
  custoInstalacao: number | null;
  valorResidualContabil: number | null;
  vidaUtilContabilMeses: number | null;
  /** Picklist restrita do Salesforce (40 valores). */
  equipamento: string | null;
  /** Picklist restrita do Salesforce (38 valores). */
  elementoImagem: string | null;
  codigo: string | null;
  equipamentoUsado: boolean | null;
  valorVenda: number | null;
  /**
   * ⚠️ NÃO é o campo que o ARP lê — ele lê `Venda_Equipamento__c`, que o org
   * mantém vazio. Este é o checkbox do layout, e é o que a tela coleta.
   */
  venderParaCliente: boolean | null;
  dataVendaEquipamento: string | null;

  /** Derivado no backend (`Valor_Final__c`). */
  valorFinal: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentsListResult {
  items: Investment[];
  /** Agregado derivado no backend — o card renderiza, não soma. */
  totalInvestimentos: number;
}

export interface CreateInvestmentInput {
  descricao?: string;
  dataInvestimento: string;
  tipo: TipoInvestimento;
  vidaUtilFiscalMeses: number;
  detalhamentoItem: string;
  valorUnitario: number;
  valorAquisicao?: number;
  negociacaoOriginal?: boolean;
  /** Custeado pela obra do Converge (ADR-0048). Ausente ⇒ `false`. */
  custeadoPelaObra?: boolean;
  // ── Campos por CATEGORIA (ADO 68506) — o DTO recusa (400) o que a família
  // não admite; a tela só não os desenha.
  quantidade?: number;
  custoInstalacao?: number;
  valorResidualContabil?: number;
  vidaUtilContabilMeses?: number;
  equipamento?: string;
  elementoImagem?: string;
  codigo?: string;
  equipamentoUsado?: boolean;
  valorVenda?: number;
  venderParaCliente?: boolean;
  dataVendaEquipamento?: string;
}

/**
 * Ausente mantém o valor; `null` limpa. Os dois significados são distintos, e
 * é por isso que os campos anuláveis aceitam `null` explicitamente.
 */
export interface UpdateInvestmentInput {
  descricao?: string | null;
  dataInvestimento?: string;
  tipo?: TipoInvestimento;
  vidaUtilFiscalMeses?: number;
  detalhamentoItem?: string;
  valorUnitario?: number;
  valorAquisicao?: number | null;
  negociacaoOriginal?: boolean;
  /**
   * Custeado pela obra do Converge. Precisa ser patchável, senão associar ou
   * desassociar a obra numa EDIÇÃO nunca chegaria ao banco.
   */
  custeadoPelaObra?: boolean;
  // ── Campos por CATEGORIA (ADO 68506) — `null` limpa, ausente mantém.
  quantidade?: number | null;
  custoInstalacao?: number | null;
  valorResidualContabil?: number | null;
  vidaUtilContabilMeses?: number | null;
  equipamento?: string | null;
  elementoImagem?: string | null;
  codigo?: string | null;
  equipamentoUsado?: boolean | null;
  valorVenda?: number | null;
  venderParaCliente?: boolean | null;
  dataVendaEquipamento?: string | null;
}

/** Falha de escrita com a mensagem que o backend mandou. */
export class InvestmentSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvestmentSaveError';
  }
}
