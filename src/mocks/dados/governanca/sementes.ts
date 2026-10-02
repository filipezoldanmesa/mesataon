import type { EtapaDistribuicao } from '@/lib/governanca/distribuicao.types';
import type { BandeiraFranquia } from '@/lib/governanca/roteamento-franquia.types';
import type { BpPadrao, CampoCatalogoItem, TipoPropostaSneg } from '@/lib/sneg-admin/sneg-admin.types';

/**
 * Sementes da Governança. Tudo FICTÍCIO — gerências, documentos de política,
 * grupos de alçada e valores.
 */

/**
 * A gerência de cada cliente do elenco (em produção é o snapshot de
 * `opportunities.sales_team`). Uma por cliente: RN01..RN08.
 */
export const GERENCIA_DO_CLIENTE: Record<string, string> = {
  '900101': 'RN01',
  '900102': 'RN02',
  '900103': 'RN03',
  '900104': 'RN04',
  '900105': 'RN05',
  '900106': 'RN06',
  '900107': 'RN07',
  '900108': 'RN08',
};

// ── Distribuição SNEG (sneg_assignments) ───────────────────────────────────

export interface LinhaDistribuicaoSneg {
  etapa: EtapaDistribuicao;
  gerencia: string;
  analistaId: string;
  updatedAt: string;
}

const CARLA = 'usr-sneg-carla';

/*
 * RN01 fica SEM analista na Análise de propósito: a opp-001 dela ainda está em
 * preenchimento, que é a janela em que a Governança parametriza antes do GATE 1.
 */
export const SEMENTE_DISTRIBUICAO_SNEG: LinhaDistribuicaoSneg[] = [
  ...['RN02', 'RN03', 'RN04', 'RN05', 'RN06', 'RN07', 'RN08'].map((gerencia, i) => ({
    etapa: 'ANALISE' as const,
    gerencia,
    analistaId: CARLA,
    updatedAt: `2026-08-${String(4 + i).padStart(2, '0')}T13:00:00Z`,
  })),
  ...['RN02', 'RN07', 'RN08'].map((gerencia) => ({
    etapa: 'MINUTAS' as const,
    gerencia,
    analistaId: CARLA,
    updatedAt: '2026-09-02T10:30:00Z',
  })),
  ...['RN03', 'RN08'].map((gerencia) => ({
    etapa: 'GARANTIA' as const,
    gerencia,
    analistaId: CARLA,
    updatedAt: '2026-09-20T16:45:00Z',
  })),
];

export const ETAPAS_SNEG: readonly { etapa: EtapaDistribuicao; label: string; legenda: string }[] = [
  {
    etapa: 'ANALISE',
    label: 'Análise',
    legenda: 'As análises desta gerência são distribuídas automaticamente para o analista da tabela.',
  },
  {
    etapa: 'MINUTAS',
    label: 'Minutas',
    legenda: 'Registro do responsável por esta etapa. Não há distribuição automática.',
  },
  {
    etapa: 'GARANTIA',
    label: 'Garantia',
    legenda:
      'O fluxo de garantia desta gerência é atribuído a este analista quando a CCOB aprova a ' +
      'análise prévia. Para trocar o responsável de um processo já em curso, use a tela da ' +
      'garantia daquela oportunidade.',
  },
];

// ── Distribuição CCOB (ccob_assignments) ───────────────────────────────────

export interface LinhaDistribuicaoCcob {
  gerencia: string;
  analistaId: string;
  createdAt: string;
  updatedAt: string;
}

export const SEMENTE_DISTRIBUICAO_CCOB: LinhaDistribuicaoCcob[] = ['RN03', 'RN04', 'RN05', 'RN06'].map(
  (gerencia) => ({
    gerencia,
    analistaId: 'usr-ccob-gabriela',
    createdAt: '2026-08-11T09:00:00Z',
    updatedAt: '2026-09-04T14:20:00Z',
  }),
);

/** Garantias em análise prévia agora (só a opp-003 está nesse estado). */
export interface GarantiaEmPrevia {
  opportunityId: string;
  analistaId: string | null;
}

export const SEMENTE_GARANTIAS_EM_PREVIA: GarantiaEmPrevia[] = [
  { opportunityId: 'opp-003', analistaId: 'usr-ccob-gabriela' },
];

// ── Roteamento de franquia ─────────────────────────────────────────────────

export const BANDEIRAS: readonly { bandeira: BandeiraFranquia; label: string }[] = [
  { bandeira: 'ZBRM', label: 'BR Mania' },
  { bandeira: 'ZLUB', label: 'Lubrax+' },
];

export interface LinhaRoteamento {
  bandeira: BandeiraFranquia;
  gerencia: string;
  executivoId: string;
  createdAt: string;
  updatedAt: string;
}

export const SEMENTE_ROTEAMENTO: LinhaRoteamento[] = [
  { bandeira: 'ZBRM', gerencia: 'RN05', executivoId: 'usr-cex-lucas', createdAt: '2026-09-19T10:00:00Z', updatedAt: '2026-09-19T10:00:00Z' },
  { bandeira: 'ZBRM', gerencia: 'RN01', executivoId: 'usr-cex-lucas', createdAt: '2026-09-19T10:05:00Z', updatedAt: '2026-09-23T15:40:00Z' },
  { bandeira: 'ZLUB', gerencia: 'RN05', executivoId: 'usr-exp-isabela', createdAt: '2026-09-21T11:30:00Z', updatedAt: '2026-09-21T11:30:00Z' },
  { bandeira: 'ZLUB', gerencia: 'RN08', executivoId: 'usr-gf-joao', createdAt: '2026-09-22T08:15:00Z', updatedAt: '2026-09-22T08:15:00Z' },
];

// ── Catálogo de documentos (document_parametrizations) ─────────────────────

export interface LinhaDocumento {
  category: string;
  type: string;
  stageLimit: string | null;
  required: boolean;
  single: boolean;
  selectable: boolean;
  acceptedTypes: string[];
  attachmentCount: number;
  updatedAt: string;
}

const d = (
  category: string,
  type: string,
  stageLimit: string | null,
  required: boolean,
  single: boolean,
  acceptedTypes: string[],
  attachmentCount: number,
  selectable = true,
): LinhaDocumento => ({
  category,
  type,
  stageLimit,
  required,
  single,
  selectable,
  acceptedTypes,
  attachmentCount,
  updatedAt: '2026-09-22T12:00:00Z',
});

export const SEMENTE_DOCUMENTOS: LinhaDocumento[] = [
  d('Cliente (PJ)', 'Contrato social', 'CALCULO_DA_ALCADA', true, false, ['pdf'], 14),
  d('Cliente (PF)', 'CPF / RG do cliente', 'CALCULO_DA_ALCADA', true, false, ['pdf', 'png', 'jpeg'], 3),
  d('Cliente (PF)', 'Comprovante de residência', 'EMISSAO_DE_CONTRATO', true, false, ['pdf', 'png', 'jpeg'], 2),
  d('Sócio', 'CPF / RG dos sócios', 'ENVIO_PARA_ANALISE_SNEG', true, false, ['pdf', 'png', 'jpeg'], 11),
  d('Sócio', 'Contrato social do sócio (PJ)', 'ENVIO_PARA_ANALISE_SNEG', true, false, ['pdf', 'png', 'jpeg'], 4),
  d('Representante do sócio', 'CPF / RG do representante', 'EMISSAO_DE_CONTRATO', true, false, ['pdf', 'png', 'jpeg'], 5),
  d('Posto', 'Fotos do posto', 'ANALISE_SNEG', true, false, ['png', 'jpeg'], 27),
  d('Posto', 'Certificado / Registro ANP', null, false, false, ['pdf'], 6),
  d('Posto', 'Licença ambiental', null, false, false, ['pdf'], 0),
  d('Posto', 'Alvará de funcionamento (modelo antigo)', null, false, false, ['pdf'], 2, false),
  d('Garantia', 'Certidão de Inteiro Teor atualizada', 'ANALISE_PREVIA_GARANTIA', true, true, ['pdf'], 3),
  d('Garantia', 'Laudo de Avaliação', 'ANALISE_PREVIA_GARANTIA', true, false, ['pdf'], 3),
  d('Garantia', 'Perícia Dominial (imóvel rural > R$ 2 mi)', 'ANALISE_PREVIA_GARANTIA', false, true, ['pdf'], 0),
  d('Garantia', 'Minuta do Contrato de Fiança Bancária', 'ANALISE_PREVIA_GARANTIA', false, true, ['pdf', 'word'], 1),
  d('Garantidor / Fiador / Cônjuge', 'RG/CPF e certidões do garantidor', 'CONFECCAO_DA_MINUTA_DE_GARANTIA', false, true, ['pdf'], 1),
  d('Garantidor / Fiador / Cônjuge', 'Certidão de Casamento do fiador', 'EMISSAO_DE_CONTRATO', false, false, ['pdf', 'png', 'jpeg'], 0),
  d('Outros (garantia)', 'Documento complementar', 'ANALISE_PREVIA_GARANTIA', false, false, ['pdf', 'excel', 'word', 'png', 'jpeg'], 2),
  d('BR Mania / Lubrax+', 'Contrato social BR Mania', null, false, false, ['pdf'], 1),
  d('BR Mania / Lubrax+', 'Contrato social Lubrax+', null, false, false, ['pdf'], 0),
];

export const ETAPAS_LIMITE = [
  'CALCULO_DA_ALCADA',
  'ENVIO_PARA_ANALISE_SNEG',
  'ANALISE_SNEG',
  'EMISSAO_DE_CONTRATO',
  'ANALISE_PREVIA_GARANTIA',
  'CONFECCAO_DA_MINUTA_DE_GARANTIA',
] as const;

export const FORMATOS_ACEITOS = ['pdf', 'png', 'jpeg', 'excel', 'word'] as const;

// ── Campos obrigatórios (catálogo do backend: `campo-catalog.ts`) ──────────

export const CATALOGO_CAMPOS: CampoCatalogoItem[] = [
  { campo: 'tipoContrato', label: 'Tipo de contrato', bloco: 'dados', travado: true, motivoTrava: 'O tipo de contrato governa o prazo do contrato no CRM e o pacote de minutas — não pode faltar.', cobranca: ['PROPOSTA_CRIACAO', 'PROPOSTA_DADOS'] },
  { campo: 'finalidade', label: 'Finalidade', bloco: 'dados', travado: true, motivoTrava: 'A finalidade condiciona os blocos de situação, produtos e recursos da proposta.', cobranca: ['PROPOSTA_CRIACAO', 'PROPOSTA_DADOS'] },
  { campo: 'dataInicioAnalise', label: 'Data início da análise', bloco: 'dados', travado: true, motivoTrava: 'A janela de análise deriva a data de fechamento da oportunidade e o prazo do contrato.', cobranca: ['PROPOSTA_CRIACAO', 'PROPOSTA_DADOS'] },
  { campo: 'dataFimAnalise', label: 'Data fim da análise', bloco: 'dados', travado: true, motivoTrava: 'A janela de análise deriva a data de fechamento da oportunidade e o prazo do contrato.', cobranca: ['PROPOSTA_CRIACAO', 'PROPOSTA_DADOS'] },
  { campo: 'possuiInvestimentos', label: 'Possui investimentos', bloco: 'dados', travado: true, motivoTrava: 'Sem resposta não haveria como exigir nem dispensar o bloco de investimentos.', cobranca: ['PROPOSTA_CRIACAO', 'PROPOSTA_DADOS'] },
  { campo: 'aceleraMais', label: 'Programa Acelera+', bloco: 'dados', travado: true, motivoTrava: 'A adesão ao programa enviada ao CRM é derivada desta resposta.', cobranca: ['PROPOSTA_CRIACAO', 'PROPOSTA_DADOS'] },
  { campo: 'postoRef', label: 'Posto (Código SAP)', bloco: 'dados', travado: true, motivoTrava: 'A verificação do Mapa da Rede consulta o posto antes de criar a proposta.', cobranca: ['PROPOSTA_CRIACAO', 'PROPOSTA_DADOS'] },
  { campo: 'areaUsuario', label: 'Área do usuário', bloco: 'dados', travado: false, motivoTrava: null, cobranca: [] },
  { campo: 'centroLucro', label: 'Centro de lucro', bloco: 'dados', travado: false, motivoTrava: null, cobranca: [] },
  { campo: 'postoSituacao', label: 'Situação do posto e do imóvel', bloco: 'situacao', travado: false, motivoTrava: null, cobranca: [] },
  { campo: 'volumeNegociado', label: 'Volume negociado', bloco: 'produtos', travado: false, motivoTrava: null, cobranca: [] },
  { campo: 'prazoContrato', label: 'Prazo do contrato', bloco: 'dados', travado: false, motivoTrava: null, cobranca: [] },
  { campo: 'recursoFinanceiro', label: 'Recursos financeiros', bloco: 'recursos', travado: false, motivoTrava: null, cobranca: [] },
  { campo: 'indicadoresFinanceiros', label: 'Indicadores financeiros (TIR/VPL)', bloco: 'financeiro', travado: false, motivoTrava: null, cobranca: [] },
  { campo: 'documentosAnexados', label: 'Documentos anexados', bloco: 'dados', travado: false, motivoTrava: null, cobranca: [] },
  { campo: 'responsavelManutencao', label: 'Responsável pela manutenção', bloco: 'dados', travado: false, motivoTrava: null, cobranca: ['PROPOSTA_DADOS'] },
  { campo: 'responsavelManutencaoImagem', label: 'Responsável pela manutenção da imagem', bloco: 'dados', travado: false, motivoTrava: null, cobranca: ['PROPOSTA_DADOS'] },
  { campo: 'licencaOnerosa', label: 'Licença onerosa', bloco: 'dados', travado: false, motivoTrava: null, cobranca: ['PROPOSTA_DADOS'] },
];

/** Só os PARAMETRIZÁVEIS são persistidos; os travados são implícitos. */
export const SEMENTE_CAMPOS: Record<TipoPropostaSneg, string[]> = {
  POSTO: [
    'postoSituacao',
    'volumeNegociado',
    'recursoFinanceiro',
    'indicadoresFinanceiros',
    'documentosAnexados',
    'responsavelManutencao',
  ],
  FRANQUIA: ['volumeNegociado', 'documentosAnexados'],
};

// ── Padrões de BP (sneg_bp_standards) ──────────────────────────────────────

export const SEMENTE_PADROES_BP: BpPadrao[] = [
  { id: 'bp-001', negocio: 'Embandeiramento', metaPercentualAntecipacao: 0.35, metaPercentualPostecipacao: 0.65, metaCustoVinculacaoUnitario: 95 },
  { id: 'bp-002', negocio: 'Renovação contratual', metaPercentualAntecipacao: 0.25, metaPercentualPostecipacao: 0.75, metaCustoVinculacaoUnitario: 70 },
  { id: 'bp-003', negocio: 'Vinculação de bandeira', metaPercentualAntecipacao: 0.4, metaPercentualPostecipacao: 0.6, metaCustoVinculacaoUnitario: 110.5 },
];
