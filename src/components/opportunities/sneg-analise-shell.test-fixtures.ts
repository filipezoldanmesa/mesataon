import type {
  AlcadaPreview,
  AnaliseSneg,
  ApprovalReadiness,
  PendenciasPanelResult,
  SnegViability,
} from '@/lib/analise/analise.types';
import type { ChecklistResult } from '@/lib/documents/types';
import type { GarantiaTrackResult } from '@/lib/garantia/garantia-track.types';
import type { DdiResult } from '@/lib/opportunities/ddi.types';
import type {
  OpportunityDetail,
  OpportunityProposal,
} from '@/lib/opportunities/types';
import type { OpportunityIndicatorsSnapshot } from '@/lib/opportunities-indicators/types';
import { IndicatorStatus } from '@/lib/opportunities-indicators/indicator-status';

/**
 * Fixtures shared by the two suites that mount {@link SnegAnaliseShell}:
 * `sneg-analise-shell.test.tsx` (the analyst, who edits) and
 * `sneg-analise-shell.readonly.test.tsx` (every other profile, who does not).
 *
 * Shared on purpose — the whole point of the read-only suite is that both
 * audiences render THE SAME screen from THE SAME data, so a second copy of
 * these would let the two drift and hide exactly the divergence being guarded
 * against.
 */

export const OPP_ID = '00000000-0000-4000-8000-000000000001';

export const BASE_ANALISE: AnaliseSneg = {
  id: 'analise-1',
  opportunityId: OPP_ID,
  oportunidadeCodigo: 'OPP-0428',
  clienteNome: 'Posto Vibra Centro-SP',
  tipoNegociacao: 'Contratação',
  totalPropostas: 2,
  propostasTitulos: ['P-1115', 'P-1116'],
  parecerEmitido: false,
  analista: { id: 'u1', nome: 'Maria Analista', email: 'maria@vibra.com.br' },
  gerencia: 'SP Capital / DCVIM',
  tipoProposta: 'Posto + Franquias',
  fase: 'em_analise',
  atribuicaoPendente: false,
  distribuidaEm: '2026-07-20T10:00:00.000Z',
  distribuidaPorId: 'system:analise-sneg',
  distribuidaPorNome: 'Sistema (distribuição automática)',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:00:00.000Z',
};

export const BASE_DETAIL = {
  id: OPP_ID,
  code: 'OPP-0428',
  backendState: 'EM_ANALISE',
  title: 'Vinculação · Posto Vibra Centro-SP',
  description: null,
  briefing: null,
  /*
   * ADO 68242 — o card "Dados da oportunidade" passou a exibir a FINALIDADE no
   * lugar do "Tipo de negociação" (que era `Contratação` em toda oportunidade).
   * A fixture carrega um valor real do mapper: com `null` aqui o caso do campo
   * afirmaria o travessão e não exercitaria o que a tela mostra.
   */
  finalidade: 'Vinculação',
  clientId: '152201',
  clientName: 'Posto Vibra Centro-SP',
  clientDocument: '12.345.678/0001-90',
  clientRecebedorId: null,
  clientRecebedorName: null,
  /*
   * ⚠️ A FORMA REAL do mapper, e ela é o oposto do que esta fixture afirmava
   * antes do ADO 68242.
   *
   * `mapOpportunityDetail` monta `type` como `TIPO_LABEL[b.tipoNegociacao]` —
   * ou seja `type` É o tipo de NEGOCIAÇÃO — e NUNCA preenche `tipoNegociacao`.
   * A fixture dizia `type: 'Posto'` + `tipoNegociacao: 'Contratação ·
   * Vinculação'`, uma resposta que o front não produz: por isso o card exibia
   * "Contratação" em "Tipo" e `—` em "Tipo de negociação" em staging enquanto
   * esta suíte passava verde. Ao investigar "o campo vem vazio", desconfie da
   * fixture antes do componente.
   */
  type: 'Contratação',
  tipoNegociacao: null,
  status: 'analise',
  /*
   * ⚠️ `salesZone` é a lista de ÁREAS de venda da conta (Divisão / Canal,
   * juntas por vírgula em `buildAreaVenda`) e `profitCenters` é a ZONA do LT
   * (`Account.Zona_de_vendas_da_conta__c`). A fixture declarava `'SP Capital'`
   * na primeira e `null`/escritório na segunda — payload que o backend não
   * produz, e o teste passava a provar que a tela lê bem algo impossível.
   * Ver `lib/opportunities/zona-venda-oportunidade.ts`.
   */
  salesZone: 'Combustíveis Claros / Vendas Indiretas, Lubrificantes / Vendas Indiretas',
  companyGroup: '4981 · Grupo JAL',
  franchises: ['BR Mania', 'Lubrax+'],
  profitCenters: 'SP108',
  /*
   * ADO 68142 — o sequencial que o org atribui (`Opportunity.Name`). Preenchido
   * porque esta é a fase em que a alçada roda, ou seja a fase em que o registro
   * do Salesforce passa a existir: `null` aqui deixaria o caso interessante sem
   * cobertura.
   */
  salesforceCode: '4567384',
  /*
   * ADO 68142 (reabertura) — o deep link montado pelo backend. Fixture com URL
   * REAL de sandbox para o caso do link ser exercitado de verdade: `null` aqui
   * faria o teste passar sem tocar o caminho que a tela renderiza.
   */
  salesforceUrl:
    'https://vibraenergia--uat.sandbox.my.salesforce.com/lightning/r/Opportunity/0068800001Gt0KFAAZ/view',
  /*
   * VMM preenchido: é medida da OPORTUNIDADE (`opportunities.vmm`, gravada no
   * recálculo), e é o único campo do card "Análise financeira" que NÃO vem do
   * snapshot de indicadores. `null` aqui deixaria justamente essa distinção sem
   * cobertura — a linha renderizaria `—` mesmo se alguém a ligasse na fonte
   * errada.
   */
  vmm: 320,
  indexRealLitro: null,
  /*
   * ADO 68242 — datas de CALENDÁRIO, como o backend as deriva de
   * `janelaConsumo` (`YYYY-MM-DD`). Eram instantes com `Z`, forma que o mapper
   * não produz e que esconde o deslocamento de fuso: `new Date('2026-08-01')`
   * em Brasília rende 31/07/2026.
   */
  startDate: '2026-08-01',
  endDate: '2031-07-31',
  estimatedValue: null,
  createdAt: '2026-06-18T00:00:00.000Z',
  dataAbertura: '2026-06-18T00:00:00.000Z',
  dataConclusao: null,
  createdBy: 'Ana Ribeiro',
  owner: 'Ana Ribeiro',
  ownerRole: 'LT',
  team: [
    { id: 't1', name: 'Ana Ribeiro', role: 'LT', zone: 'SP Capital', isPrincipal: true },
    { id: 't2', name: 'Juliana Costa', role: 'Analista SNEG' },
  ],
  propostas: [],
  proposalIds: [],
  indicadores: null,
  situacaoPosto: null,
  mapaDaRede: null,
} as unknown as OpportunityDetail;

export const BASE_PROPOSALS: OpportunityProposal[] = [
  {
    id: 'prop-1',
    code: 'P-1115',
    title: 'Proposta Posto',
    group: 'Bandeira branca',
    // ADO 68242 — a classe de ativo do card "Tipo" sai DAQUI
    // (`opportunityAssetClassText`). Sem `tipoProposta` a fixture caía no
    // fallback e a linha nunca exercitava a derivação.
    tipoProposta: 'PCR',
    status: 'EM_ANALISE' as OpportunityProposal['status'],
    authorName: 'Ana Ribeiro',
    fillPercent: 100,
    isElected: false,
    indicatorStatus: null,
  },
  {
    id: 'prop-2',
    code: 'P-1116',
    title: 'Franquia BR Mania',
    group: 'Franquia',
    tipoProposta: 'ZBRM',
    status: 'EM_ANALISE' as OpportunityProposal['status'],
    fillPercent: 100,
    isElected: false,
    indicatorStatus: null,
  },
];

export const BASE_READINESS_BLOCKED: ApprovalReadiness = {
  ready: false,
  // Nenhum override: o caso base é o gate decidindo sozinho (ADO 68233).
  liberadoPorDeAcordoDiretor: false,
  statusAnalise: 'Análise em andamento',
  dependenciasObrigatorias: [
    { descricao: 'Parecer SNEG emitido', ok: false },
    { descricao: 'Pendências obrigatórias resolvidas', ok: true },
  ],
  nivelAlcada: 'Alçada N2 — Gerência',
  bloqueios: ['Parecer técnico ainda não emitido.'],
  documentosAguardandoValidacao: 0,
  documentosAguardandoValidacaoTipos: [],
  franquiaParecerPendenteBandeiras: [],
  pendenciasObrigatoriasAbertas: 1,
};

export const BASE_READINESS_READY: ApprovalReadiness = {
  ready: true,
  liberadoPorDeAcordoDiretor: false,
  statusAnalise: 'Análise concluída',
  dependenciasObrigatorias: [
    { descricao: 'Parecer SNEG emitido', ok: true },
    { descricao: 'Pendências obrigatórias resolvidas', ok: true },
  ],
  nivelAlcada: 'Alçada N2 — Gerência',
  bloqueios: [],
  documentosAguardandoValidacao: 0,
  documentosAguardandoValidacaoTipos: [],
  franquiaParecerPendenteBandeiras: [],
  pendenciasObrigatoriasAbertas: 0,
};

export const BASE_PENDENCIAS: PendenciasPanelResult = {
  total: 2,
  // Uma aberta + uma resolvida: o contador do card é 1, não 2 (ADO 68150).
  totalAtivas: 1,
  items: [
    {
      id: 'p1',
      titulo: 'Documentos do cliente pendentes',
      responsavel: 'LT João',
      canal: 'E-mail',
      status: 'Aberta',
      obrigatoria: true,
    },
    {
      id: 'p2',
      titulo: 'Análise de crédito',
      responsavel: 'CCOB',
      canal: 'Sistema',
      status: 'Resolvida',
      obrigatoria: false,
    },
  ],
};

export const EMPTY_PENDENCIAS: PendenciasPanelResult = {
  total: 0,
  totalAtivas: 0,
  items: [],
};

/**
 * Tudo resolvido — o print do ADO 68150: linhas existem, nada pede ação.
 * O card tem de dizer `· 0` e nomear isso em texto.
 */
export const ALL_RESOLVED_PENDENCIAS: PendenciasPanelResult = {
  total: 2,
  totalAtivas: 0,
  items: [
    {
      id: 'p1',
      titulo: 'DDI: emitir parecer (risco MÉDIO/ALTO)',
      responsavel: 'Juliana Costa',
      canal: null,
      status: 'Resolvida',
      obrigatoria: false,
    },
    {
      id: 'p2',
      titulo: 'Indicar garantia',
      responsavel: 'LT João',
      canal: 'E-mail',
      status: 'Cancelada',
      obrigatoria: false,
    },
  ],
};

export const BASE_CHECKLIST = {
  opportunityId: OPP_ID,
  opportunityCode: 'OPP-0428',
  opportunityName: 'Vinculação · Posto Vibra Centro-SP',
  opportunityState: 'EM_ANALISE',
  stages: [],
  docs: [
    {
      id: 'd1',
      // `repositoryDocumentId` é o que responde "existe documento?" — `id` pode
      // ser a chave sintética `<category>::<type>` (VBR-583). As linhas com
      // arquivo carregam os dois; a `pendente` carrega `null`.
      repositoryDocumentId: 'd1',
      name: 'Contrato social',
      category: 'Cliente (PJ)',
      stage: 'Cálculo da alçada',
      stageLimit: null,
      downloadUrl: null,
      acceptedTypes: 'pdf',
      status: 'validado',
      required: true,
      single: true,
    },
    {
      id: 'd2',
      repositoryDocumentId: null,
      name: 'CPF dos sócios',
      category: 'Sócio',
      stage: 'Cálculo da alçada',
      stageLimit: null,
      downloadUrl: null,
      acceptedTypes: 'pdf',
      status: 'pendente',
      required: true,
      single: true,
    },
    {
      // Anexado = arquivo enviado, aguardando conferência (RN-F9-03). É o ÚNICO
      // estado que trava o GATE 2 (`documentos_nao_validados`).
      id: 'd3',
      repositoryDocumentId: 'd3',
      name: 'Cartão CNPJ',
      category: 'Cliente (PJ)',
      stage: 'Cálculo da alçada',
      stageLimit: null,
      downloadUrl: null,
      acceptedTypes: 'pdf',
      status: 'anexado',
      required: true,
      single: true,
    },
    {
      /*
       * `anexado` **sem** documento no hub (VBR-642): a exigência foi atendida
       * pelas fotos enviadas no bloco da proposta. Está FORA do gate, e não há
       * `repositoryDocumentId` para conferir — a BFF recusa `validar` com a chave
       * sintética antes da rede.
       */
      id: 'Proposta::Fotos do posto',
      repositoryDocumentId: null,
      name: 'Fotos do posto',
      category: 'Proposta',
      stage: 'Análise SNEG',
      stageLimit: null,
      downloadUrl: null,
      acceptedTypes: 'jpeg',
      status: 'anexado',
      satisfiedExternally: true,
      required: true,
      single: false,
    },
  ],
} as unknown as ChecklistResult;

export const BASE_VIABILITY: SnegViability = {
  resultado: 'ATENCAO',
  criterios: [],
  avisos: [
    {
      codigo: 'POL_MIX_ANTECIPADA',
      severidade: 'AVISO',
      mensagem: 'Mix de antecipada acima do orçado no ano.',
      elevaAlcada: true,
    },
  ],
};

export const BASE_DDI = {
  opportunityId: OPP_ID,
  status: 'completed',
  /*
   * ⚠️ `situacao` é o status NÃO-colapsado, e a fixture o carrega porque o
   * payload real sempre o traz — sem ele a linha do DDI seria exercitada contra
   * uma resposta que a API não produz (a lição do ADO 68242). `CONCLUIDA` é o
   * par coerente de `riskLevel: 'low'`: risco BAIXO conclui sozinho e nunca
   * abre pendência de parecer (RN-F10-07).
   */
  situacao: 'CONCLUIDA',
  riskLevel: 'low',
  score: 85,
  rationale: null,
  findings: [],
  opinion: null,
  reclassification: null,
  ltDecision: null,
  ltReviewRequestReason: null,
} as unknown as DdiResult;

/**
 * Snapshot consolidado — COMPLETO e tipado, não mais um `as unknown as` com
 * `tir`/`vpl`.
 *
 * O recorte antigo bastava enquanto o único consumidor era a linha
 * "TIR / VPL (oportunidade)" do painel. Com o card "Análise financeira" na
 * coluna principal ele passaria a mentir: sem `status`,
 * `narrowIndicatorStatus(undefined)` devolve `null` — o estado SEGURO de "status
 * que o front não reconhece" —, e todo teste da tela renderizaria a faixa de
 * status ilegível com os números esmaecidos. Um caminho de exceção ligado por
 * omissão da fixture esconde regressão em vez de revelá-la.
 */
export const BASE_INDICATORS: OpportunityIndicatorsSnapshot = {
  id: 'ind-1',
  opportunityId: OPP_ID,
  status: IndicatorStatus.Atualizado,
  tir: 0.96,
  vpl: 3_100_000,
  tma: 11.05,
  rsPorM3: 297.12,
  margemEbitda: 305.66,
  margemMedia: 300,
  indicadorRentabilidade: 1.4,
  percentualAntecipacao: 0.32,
  comprometimento: 0.99,
  consolidatedProposalIds: ['prop-1'],
  calculadoEm: '2026-08-27T18:30:00.000Z',
  mensagemErro: null,
  createdAt: '2026-08-27T18:30:00.000Z',
  updatedAt: '2026-08-27T18:30:00.000Z',
};

export const BASE_ALCADA_PREVIEW: AlcadaPreview = {
  alcadaElevada: true,
  nivel: { nivel: 'VP VAR + VPFIN', descricao: null },
  nivelIndisponivelRotulo: null,
  nivelIndisponivelMotivo: null,
  motivos: [],
  indisponivelMotivo: null,
};

export const BASE_GARANTIA_TRACK = {
  naoSeAplica: false,
  subLabel: 'Análise prévia',
  passos: [],
  analiseEstadoLabel: 'Em análise prévia →',
} as unknown as GarantiaTrackResult;
