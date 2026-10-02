import type {
  CatalogoRoyalty,
  CofTemplate,
  LimiteRoyaltyParametrizacao,
  TaxaParametrizacao,
} from '@/lib/franquia-admin/franquia-admin.types';

/**
 * Sementes da Parametrização de Franquias (aba "Franquias" da Governança):
 * Anexo A, taxa × parcelas, limites de royalty e COF por bandeira.
 *
 * Os números seguem os exemplos do PRD (provisórios no próprio produto) — são
 * fictícios no protótipo, mas coerentes entre si: a taxa e o teto de parcelas
 * da BR Mania `PADRAO` (R$ 55.000 / 10x) são os que a proposta `prp-005b` usa.
 */

const ATUALIZADO_POR = 'usr-gf-joao';

function faixa(
  id: string,
  politica: CatalogoRoyalty['politica'],
  formatoLoja: CatalogoRoyalty['formatoLoja'],
  registroSequencial: number,
  valores: Partial<
    Pick<
      CatalogoRoyalty,
      | 'inicioFaixaFaturamento'
      | 'fimFaixaFaturamento'
      | 'percRoyalty'
      | 'percRoyaltyTabaco'
      | 'percFundoDeMkt'
      | 'percFundoDeMktTabaco'
      | 'valorFixoRoyalty'
      | 'valorFixoFundoMkt'
    >
  >,
): CatalogoRoyalty {
  return {
    id,
    politica,
    formatoLoja,
    registroSequencial,
    inicioFaixaFaturamento: null,
    fimFaixaFaturamento: null,
    percRoyalty: null,
    percRoyaltyTabaco: null,
    percFundoDeMkt: null,
    percFundoDeMktTabaco: null,
    valorFixoRoyalty: null,
    valorFixoFundoMkt: null,
    ...valores,
    updatedById: ATUALIZADO_POR,
    createdAt: '2026-05-04T13:00:00.000Z',
    updatedAt: '2026-08-21T17:40:00.000Z',
  };
}

export const SEMENTE_CATALOGO: CatalogoRoyalty[] = [
  faixa('cat-001', 'VALOR_FIXO', 'PADRAO', 1, {
    valorFixoRoyalty: '5000.00',
    valorFixoFundoMkt: '2000.00',
  }),
  faixa('cat-002', 'PERCENTUAL_UNICO', 'PADRAO', 1, {
    percRoyalty: '0.050000',
    percRoyaltyTabaco: '0.020000',
    percFundoDeMkt: '0.010000',
    percFundoDeMktTabaco: '0.005000',
  }),
  faixa('cat-003', 'PERCENTUAL_ESCALONADO', 'PADRAO', 1, {
    inicioFaixaFaturamento: '0.00',
    fimFaixaFaturamento: '150000.00',
    percRoyalty: '0.060000',
    percFundoDeMkt: '0.010000',
  }),
  faixa('cat-004', 'PERCENTUAL_ESCALONADO', 'PADRAO', 2, {
    inicioFaixaFaturamento: '150000.01',
    fimFaixaFaturamento: '300000.00',
    percRoyalty: '0.050000',
    percFundoDeMkt: '0.010000',
  }),
  faixa('cat-005', 'PERCENTUAL_ESCALONADO', 'PADRAO', 3, {
    inicioFaixaFaturamento: '300000.01',
    fimFaixaFaturamento: null,
    percRoyalty: '0.040000',
    percFundoDeMkt: '0.010000',
  }),
  faixa('cat-006', 'POR_CATEGORIA', 'PADRAO', 1, {
    percRoyalty: '0.050000',
    percRoyaltyTabaco: '0.020000',
    percFundoDeMkt: '0.010000',
    percFundoDeMktTabaco: '0.005000',
  }),
  faixa('cat-007', 'PERCENTUAL_UNICO', 'PONTO', 1, {
    percRoyalty: '0.045000',
    percRoyaltyTabaco: '0.020000',
    percFundoDeMkt: '0.010000',
    percFundoDeMktTabaco: '0.005000',
  }),
];

function taxa(
  bandeira: TaxaParametrizacao['bandeira'],
  formatoLoja: TaxaParametrizacao['formatoLoja'],
  taxaFranquiaDefaultBrl: string | null,
  maxParcelasTaxa: number,
  descricao: string | null,
): TaxaParametrizacao {
  return {
    bandeira,
    formatoLoja,
    taxaFranquiaDefaultBrl,
    maxParcelasTaxa,
    descricao,
    atualizadoPorId: ATUALIZADO_POR,
    updatedAt: '2026-08-21T18:05:00.000Z',
  };
}

export const SEMENTE_TAXA: TaxaParametrizacao[] = [
  taxa('ZBRM', 'PADRAO', '55000.00', 10, 'Loja padrão BR Mania — política comercial 2026.'),
  taxa('ZBRM', 'PONTO', '20000.00', 5, null),
  taxa('ZBRM', 'SUPER_COMPACTA', '20000.00', 5, null),
  taxa('ZLUB', 'PADRAO', '24000.00', 6, 'Lubrax+ só opera no formato padrão.'),
];

export const SEMENTE_LIMITES: LimiteRoyaltyParametrizacao[] = [
  {
    bandeira: 'ZBRM',
    royaltyMinimoBps: 400,
    fundoMktMinimoBps: 100,
    valorFixoBrl: null,
    fundoMktValorFixoBrl: null,
    pisoBrl: '3000.00',
    tetoBrl: '25000.00',
    valorMinimoMensalBrl: '2500.00',
    descricao: 'Limites vigentes desde a revisão de agosto/2026.',
    atualizadoPorId: ATUALIZADO_POR,
    updatedAt: '2026-08-26T12:30:00.000Z',
  },
  {
    bandeira: 'ZLUB',
    royaltyMinimoBps: 350,
    fundoMktMinimoBps: null,
    valorFixoBrl: null,
    fundoMktValorFixoBrl: '2000.00',
    pisoBrl: '1050.00',
    tetoBrl: null,
    valorMinimoMensalBrl: '1050.00',
    descricao: null,
    atualizadoPorId: ATUALIZADO_POR,
    updatedAt: '2026-09-22T15:10:00.000Z',
  },
];

export const BANDEIRAS_COF: Array<{ bandeira: string; bandeiraLabel: string }> = [
  { bandeira: 'ZBRM', bandeiraLabel: 'BR Mania' },
  { bandeira: 'ZLUB', bandeiraLabel: 'Lubrax+' },
];

export const SEMENTE_COF: CofTemplate[] = [
  {
    id: 'cof-zbrm-v2',
    bandeira: 'ZBRM',
    versao: 2,
    fileName: 'COF-BR-Mania-2026-v2.pdf',
    sizeBytes: 1_284_311,
    observacoes: 'Revisão da Governança com a cláusula de prazo de 14 dias atualizada.',
    cadastradaPor: 'João Vieira',
    cadastradaEm: '2026-08-18T14:20:00.000Z',
    vigente: true,
  },
  {
    id: 'cof-zbrm-v1',
    bandeira: 'ZBRM',
    versao: 1,
    fileName: 'COF-BR-Mania-2026-v1.pdf',
    sizeBytes: 1_190_874,
    observacoes: null,
    cadastradaPor: 'João Vieira',
    cadastradaEm: '2026-05-10T10:00:00.000Z',
    vigente: false,
  },
  {
    id: 'cof-zlub-v1',
    bandeira: 'ZLUB',
    versao: 1,
    fileName: 'COF-Lubrax-Mais-2026-v1.pdf',
    sizeBytes: 978_402,
    observacoes: 'Primeira versão publicada para Lubrax+.',
    cadastradaPor: 'Elisa Prado',
    cadastradaEm: '2026-06-02T09:15:00.000Z',
    vigente: true,
  },
];

/** Limite J10 do potencial acima do qual o parecer antecipado é exigido (RN-F4-02). */
export const LIMITE_POTENCIAL_PARECER_BRL = 150_000;

/** Share de tabaco parametrizado (fração) — o efetivo quando a franquia não grava o seu. */
export const SHARE_TABACO_PARAMETRIZADO = 0.3;

/** Política do PERCENTUAL_FIXO da Lubrax+ (22/09/2026), pelo modelo de negócio. */
export const POLITICA_PERCENTUAL_FIXO_LUBRAX: Record<'URBANO' | 'RODOVIA', { bps: number; minimoBrl: string }> = {
  URBANO: { bps: 500, minimoBrl: '1050.00' },
  RODOVIA: { bps: 350, minimoBrl: '2100.00' },
};
