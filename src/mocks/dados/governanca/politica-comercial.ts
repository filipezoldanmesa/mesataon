import type {
  DocumentoPolitica,
  Lacuna,
  LimiarPorTipoProposta,
  ParametroReferencia,
  PremissaDesmarcavel,
  VerbaBp,
} from '@/lib/governanca/politica-comercial.types';

/**
 * Política comercial do protótipo. Em produção os limiares e premissas vêm das
 * regras de alçada do CRM e o resto de `sneg_bp_standards`; aqui as "regras do
 * org" são fictícias, e a parte dos padrões de BP é derivada AO VIVO da fatia
 * de padrões (editar um padrão muda esta aba).
 */

export const DOCUMENTOS_POLITICA: DocumentoPolitica[] = [
  { categoria: 'Política', codigo: 'PL-EX-00010', titulo: 'Política de atuação comercial do varejo' },
  { categoria: 'Procedimento', codigo: 'PG-EX-00027', titulo: 'Padrão comercial do varejo' },
];

export const LIMIARES: LimiarPorTipoProposta[] = [
  {
    tiposProposta: ['PCR'],
    grupo: 'Contratação Varejo · Geral',
    margem: 'ENTRE Margem Realizada E Margem Realizada * 1.10',
    tir: 'MENOR QUE TMA + 2',
    vpl: 'MENOR QUE 0',
    naViolacao: ['SNEG', 'Diretoria Comercial'],
  },
  {
    tiposProposta: ['PCR'],
    grupo: 'Contratação Varejo · Renegociação',
    margem: 'MENOR QUE Margem Realizada',
    tir: 'MENOR QUE TMA',
    vpl: null,
    naViolacao: ['SNEG', 'Gerência Executiva'],
  },
  {
    tiposProposta: ['ZBRM', 'ZLUB'],
    grupo: 'Franquias · Geral',
    margem: null,
    tir: 'MENOR QUE TMA + 1',
    vpl: 'MENOR QUE 0 - 500000',
    naViolacao: ['Gestor de Franquias'],
  },
];

export const PREMISSAS: PremissaDesmarcavel[] = [
  {
    premissa: 'Esta negociação considera todas as premissas da Política?',
    nivelAoDesmarcar: 'Vice-presidência Comercial',
    grupo: 'Contratação Varejo · Geral',
  },
  { premissa: 'Inatividade', nivelAoDesmarcar: 'SNEG', grupo: 'Contratação Varejo · Geral' },
  { premissa: 'Mútuo com garantia real', nivelAoDesmarcar: 'Diretoria Comercial', grupo: 'Contratação Varejo · Renegociação' },
];

/** Parâmetros "do org" que não são os três eixos do pivô. */
export const PARAMETROS_DO_ORG: ParametroReferencia[] = [
  {
    parametro: 'Juros de mútuo — Contratação Varejo · Geral',
    referencia: 'MENOR QUE CDI + 1,5',
    foraDaFaixa: 'Escala a alçada para Diretoria Comercial',
    fonte: 'Regras de alçada do CRM',
  },
  {
    parametro: 'Carência — Contratação Varejo · Geral',
    referencia: 'MAIOR QUE 6',
    foraDaFaixa: 'Escala a alçada para SNEG',
    fonte: 'Regras de alçada do CRM',
  },
  {
    parametro: 'HC\\Meses — Contratação Varejo · Renegociação',
    referencia: 'MENOR OU IGUAL A 24',
    foraDaFaixa: 'Escala a alçada para Diretoria Comercial',
    fonte: 'Regras de alçada do CRM',
  },
  {
    parametro: 'Índice Real/L — Contratação Varejo · Geral',
    referencia: 'MENOR QUE 0.08',
    foraDaFaixa: 'Escala a alçada para Gerência Executiva',
    fonte: 'Regras de alçada do CRM',
  },
];

export const VERBA: VerbaBp = { referencia: '2026', verba: '18500000.00' };

export const LACUNAS_VERBA: Lacuna[] = [
  {
    campo: 'Saldo',
    motivo:
      'O saldo da verba é controlado no ERP, e a consulta de orçamento não está ligada no CRM — ' +
      'por isso não há saldo a exibir aqui.',
  },
  {
    campo: 'Diretoria e período',
    motivo:
      'A verba é amarrada ao plano de negócios do ano corrente, mantido fora desta plataforma. ' +
      'A parametrização local tem uma linha global.',
  },
  {
    campo: 'Alerta de estouro',
    motivo:
      'A plataforma avisa quando o utilizado passa a verba, mas o percentual de alerta e o ' +
      'comportamento (avisar × bloquear) não são parametrizáveis — o aviso é sempre não-bloqueante.',
  },
];

export const LACUNAS_DOCUMENTOS: Lacuna[] = [
  {
    campo: 'Relatório DDI obrigatório (concessões acima de R$ 1 MM)',
    motivo:
      'A análise de integridade (DDI) não é acionada por valor: ela é decidida pelo tipo de ' +
      'negociação da oportunidade. Não há, portanto, um limite em reais para parametrizar aqui.',
  },
  {
    campo: 'Amortização de benfeitorias (12 a 18 meses)',
    motivo:
      'O prazo de amortização de benfeitorias não é registrado nesta plataforma nem no CRM, ' +
      'então não há valor a exibir.',
  },
  {
    campo: 'Participação de postos próprios no investimento (25% a 30%)',
    motivo:
      'A proposta não separa quanto do investimento vem do posto próprio — os valores são ' +
      'lançados sem distinguir a origem do aporte.',
  },
  {
    campo: 'Vigência e reajuste da política',
    motivo:
      'A vigência e o índice de reajuste não são controlados aqui: os dois documentos são ' +
      'revisados periodicamente pela área que os mantém.',
  },
];

export const LACUNA_SEM_PADRAO_BP: Lacuna = {
  campo: 'Custo de vinculação e mix antecipada/postecipada',
  motivo:
    'Nenhum padrão de BP está cadastrado. Os dois valores são parametrizados em Governança → ' +
    'Padrões de BP, e é deles que a análise deriva a aderência.',
};
