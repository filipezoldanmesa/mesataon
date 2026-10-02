import type {
  BandeiraFranquia,
  FormatoLoja,
  ModeloNegocio,
  ModeloRoyalty,
  ResultadoParecerFranquia,
  SituacaoLoja,
  StatusCof,
} from '@/lib/franquia/types';

/**
 * Estado de UMA proposta de franquia (ZBRM/ZLUB) — o que o backend espalha por
 * `franchises`, `franchise_royalties`, `franchise_maturation`, exceções, FAP,
 * COF e parecer. O read model (`GET .../contrato`) é DERIVADO daqui a cada
 * leitura, junto com a fase viva da oportunidade.
 */
export interface ExcecaoRegistro {
  id: string;
  tipoExcecao: string;
  politicaExcecao: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  valorOverrideBrl: string | null;
  motivo: string;
}

export interface FapRegistro {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface CofRegistro {
  statusCof: StatusCof;
  numeroCof: string | null;
  cofEnviadaEm: string | null;
  dataMinAssinatura: string | null;
  enviadoAssinaturaEm: string | null;
  assinadoEm: string | null;
  /** A versão CONGELADA na entrega — nunca a vigente de hoje. */
  templateId: string | null;
}

export interface ParecerRegistro {
  texto: string | null;
  resultado: ResultadoParecerFranquia | null;
  analistaId: string | null;
  submetidoEm: string | null;
  numRecalls: number;
  recalledAt: string | null;
}

export interface FranquiaRegistro {
  franquiaId: string;
  proposalId: string;
  opportunityId: string;
  bandeira: BandeiraFranquia;
  finalidade: string | null;
  postoProposalId: string | null;
  dataInicioAnalise: string | null;
  dataFimAnalise: string | null;
  // Dados da franquia
  situacaoLoja: SituacaoLoja | null;
  tipoImplantacao: string | null;
  codigoMaterialSap: string | null;
  observacoes: string | null;
  inicioOperacaoPrevista: string | null;
  evNome: string | null;
  cofDestinatarioEmail: string | null;
  // FAP e potencial
  faturamentoPropostoBrl: string | null;
  faturamentoDeAcordoComFap: boolean | null;
  fapBrl: string | null;
  potencialBrl: string | null;
  possuiExcecaoRoyalties: boolean | null;
  shareTabacoPerc: string | null;
  fap: FapRegistro | null;
  // Modelo de loja e royalties
  modeloNegocio: ModeloNegocio | null;
  formatoLoja: FormatoLoja | null;
  modeloRoyalty: ModeloRoyalty | null;
  valorFixoBrl: string | null;
  percentualBps: number | null;
  pisoBrl: string | null;
  tetoBrl: string | null;
  valorMinimoMensalBrl: string | null;
  fundoMktPercBps: number | null;
  fundoMktValorFixoBrl: string | null;
  taxaFranquiaBrl: string | null;
  taxaFranquiaParcelas: number | null;
  /** De onde veio a taxa: semeada pelo parâmetro ou digitada. `null` lê como MANUAL. */
  taxaFonte: 'PARAMETRO' | 'MANUAL' | null;
  isencaoTaxaFranquia: boolean | null;
  // Estrutura e exceções
  maturacao: {
    isMaturada: boolean | null;
    maturacaoInicioEm: string | null;
    maturacaoMesesTotal: number | null;
    maturacaoPercentualBps: number | null;
    maturacaoValorFixoBrl: string | null;
  } | null;
  royaltyPremiadoAtivo: boolean;
  royaltyPremiadoPercentualBps: number | null;
  excecoes: ExcecaoRegistro[];
  cof: CofRegistro | null;
  parecer: ParecerRegistro | null;
}

/** Registro vazio de uma franquia recém-criada (POST .../franquia). */
export function franquiaVazia(
  base: Pick<
    FranquiaRegistro,
    | 'franquiaId'
    | 'proposalId'
    | 'opportunityId'
    | 'bandeira'
    | 'finalidade'
    | 'postoProposalId'
    | 'dataInicioAnalise'
    | 'dataFimAnalise'
  >,
): FranquiaRegistro {
  return {
    ...base,
    situacaoLoja: null,
    tipoImplantacao: null,
    codigoMaterialSap: base.bandeira,
    observacoes: null,
    inicioOperacaoPrevista: null,
    evNome: null,
    cofDestinatarioEmail: null,
    faturamentoPropostoBrl: null,
    faturamentoDeAcordoComFap: null,
    fapBrl: null,
    potencialBrl: null,
    possuiExcecaoRoyalties: null,
    shareTabacoPerc: null,
    fap: null,
    modeloNegocio: null,
    formatoLoja: null,
    modeloRoyalty: null,
    valorFixoBrl: null,
    percentualBps: null,
    pisoBrl: null,
    tetoBrl: null,
    valorMinimoMensalBrl: null,
    fundoMktPercBps: null,
    fundoMktValorFixoBrl: null,
    taxaFranquiaBrl: null,
    taxaFranquiaParcelas: null,
    taxaFonte: null,
    isencaoTaxaFranquia: null,
    maturacao: null,
    royaltyPremiadoAtivo: false,
    royaltyPremiadoPercentualBps: null,
    excecoes: [],
    cof: null,
    parecer: null,
  };
}

/**
 * `opp-005` / `prp-005b` — BR Mania, loja NOVA, em análise: COF entregue (prazo
 * legal já cumprido), royalties escalonados com teto programado ativo, e o
 * parecer antecipado do Gestor de Franquias PENDENTE numa 1ª reapresentação
 * (o potencial passa do limite J10, então ele é exigido).
 */
export const SEMENTE_FRANQUIAS: FranquiaRegistro[] = [
  {
    franquiaId: 'frq-005b',
    proposalId: 'prp-005b',
    opportunityId: 'opp-005',
    bandeira: 'ZBRM',
    finalidade: 'BR Mania - Implantação',
    postoProposalId: 'prp-005a',
    dataInicioAnalise: '2026-08-24',
    dataFimAnalise: '2026-10-30',
    situacaoLoja: 'NOVA',
    tipoImplantacao: 'Greenfield loja',
    codigoMaterialSap: 'ZBRM',
    observacoes: 'Loja de conveniência na entrada do posto, com área de café e 6 mesas.',
    inicioOperacaoPrevista: '2027-01-15',
    evNome: 'Lucas Martins',
    cofDestinatarioEmail: 'franqueado@postobaiaformosa.exemplo.com.br',
    faturamentoPropostoBrl: '210000.00',
    faturamentoDeAcordoComFap: true,
    fapBrl: '205000.00',
    potencialBrl: '240000.00',
    possuiExcecaoRoyalties: true,
    shareTabacoPerc: null,
    fap: {
      id: 'fap-005b',
      fileName: 'FAP-Posto-Baia-Formosa.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 482_133,
      createdAt: '2026-08-22T16:42:00.000Z',
    },
    modeloNegocio: 'URBANO',
    formatoLoja: 'PADRAO',
    modeloRoyalty: 'PERCENTUAL_ESCALONADO',
    valorFixoBrl: null,
    percentualBps: 500,
    pisoBrl: '3000.00',
    tetoBrl: '25000.00',
    valorMinimoMensalBrl: '2500.00',
    fundoMktPercBps: 100,
    fundoMktValorFixoBrl: null,
    taxaFranquiaBrl: '55000.00',
    taxaFranquiaParcelas: 10,
    taxaFonte: 'PARAMETRO',
    isencaoTaxaFranquia: false,
    maturacao: {
      isMaturada: false,
      maturacaoInicioEm: '2027-01-15',
      maturacaoMesesTotal: 12,
      maturacaoPercentualBps: 300,
      maturacaoValorFixoBrl: null,
    },
    royaltyPremiadoAtivo: false,
    royaltyPremiadoPercentualBps: null,
    excecoes: [
      {
        id: 'exc-005b-1',
        tipoExcecao: 'ISENCAO',
        politicaExcecao: 'Inauguração',
        vigenciaInicio: '2027-01-15',
        vigenciaFim: '2027-04-14',
        valorOverrideBrl: null,
        motivo: 'Isenção nos três primeiros meses de operação, conforme negociação com o franqueado.',
      },
      {
        id: 'exc-005b-2',
        tipoExcecao: 'TETO',
        politicaExcecao: 'Negociação comercial',
        vigenciaInicio: '2026-09-01',
        vigenciaFim: null,
        valorOverrideBrl: '9500.00',
        motivo: 'Teto mensal de royalty para preservar a margem no primeiro ciclo contratual.',
      },
    ],
    cof: {
      statusCof: 'ENVIADA',
      numeroCof: 'COF-ZBRM-2026-0042',
      cofEnviadaEm: '2026-09-02T11:05:00.000Z',
      dataMinAssinatura: '2026-09-16T11:05:00.000Z',
      enviadoAssinaturaEm: null,
      assinadoEm: null,
      templateId: 'cof-zbrm-v2',
    },
    parecer: {
      texto: null,
      resultado: null,
      analistaId: null,
      submetidoEm: null,
      numRecalls: 1,
      recalledAt: '2026-09-12T14:30:00.000Z',
    },
  },
];
