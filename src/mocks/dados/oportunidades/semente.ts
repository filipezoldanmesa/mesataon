import type { BackendChecklistItem, BackendGrupoOutraOrigem } from '@/lib/documents/documents-mapping';
import type { BackendTeamMember } from '@/lib/opportunities/team-mapping';
import type { OpportunityDetail, TotaisRecursosFinanceiros } from '@/lib/opportunities/types';
import type { IndicatorStatus } from '@/lib/opportunities-indicators/indicator-status';
import type { OpportunityIndicatorsSnapshot } from '@/lib/opportunities-indicators/types';

import type { EstadoBackend, OportunidadeElenco } from '../../elenco';

/**
 * Semente do domínio `oportunidades` — o que a BFF de produção lê do backend e
 * o elenco (`elenco.ts`) não carrega: dados CRM da conta, campos editáveis do
 * detalhe, checklist de documentos, equipe e indicadores consolidados.
 *
 * Os itens de checklist e os membros da equipe ficam na forma de FIO do backend
 * (`BackendChecklistItem`, `BackendTeamMember`) de propósito: o handler passa
 * pelos MESMOS mappers da BFF (`mapChecklist`, `mapTeam`), então o contrato com
 * a tela é provado pelo código de produção, não por uma cópia.
 *
 * Tudo fictício — códigos de área, escritórios e nomes de equipe inclusive.
 */

// ───────────────────────────── CRM da conta ─────────────────────────────

export interface AreaVendaConta {
  code: string;
  name: string;
  isPrimary: boolean;
  aprovada: boolean;
}

export interface CrmConta {
  areasVenda: AreaVendaConta[];
  /** Zona de vendas da conta (o "centro de lucro" da tela). */
  centroLucro: string;
  /** Escritório de Venda (`VREG3`…) — a "Diretoria" da listagem. */
  escritorioVendas: string;
  /** Equipe de Vendas da conta — a "Gerência" da listagem. */
  equipeVendas: string;
  /** Sugestão de `Account.Nova_Imagem__c` (null = a conta não informa). */
  possuiNovaImagemPista: boolean | null;
  /** Região do LT na equipe (snapshot do diretório). */
  regiao: string;
}

const AREAS_PADRAO = (prefixo: string): AreaVendaConta[] => [
  { code: `${prefixo}-CC-VI`, name: 'Combustíveis Claros / Vendas Indiretas', isPrimary: true, aprovada: true },
  { code: `${prefixo}-LB-VI`, name: 'Lubrificantes / Vendas Indiretas', isPrimary: false, aprovada: true },
];

export const CRM_POR_SAP: Record<string, CrmConta> = {
  '900101': { areasVenda: AREAS_PADRAO('SP01'), centroLucro: 'SP03', escritorioVendas: 'VREG3', equipeVendas: 'GV Campinas', possuiNovaImagemPista: true, regiao: 'SP Interior' },
  '900102': { areasVenda: AREAS_PADRAO('MG01'), centroLucro: 'MG02', escritorioVendas: 'VREG4', equipeVendas: 'GV Belo Horizonte', possuiNovaImagemPista: null, regiao: 'Minas Gerais' },
  '900103': {
    areasVenda: [{ code: 'SC01-CC-VI', name: 'Combustíveis Claros / Vendas Indiretas', isPrimary: true, aprovada: true }],
    centroLucro: 'SC01', escritorioVendas: 'VREG6', equipeVendas: 'GV Florianópolis', possuiNovaImagemPista: false, regiao: 'Sul',
  },
  '900104': { areasVenda: AREAS_PADRAO('GO01'), centroLucro: 'GO01', escritorioVendas: 'VREG5', equipeVendas: 'GV Goiânia', possuiNovaImagemPista: null, regiao: 'Centro-Oeste' },
  '900105': { areasVenda: AREAS_PADRAO('BA01'), centroLucro: 'BA02', escritorioVendas: 'VREG2', equipeVendas: 'GV Salvador', possuiNovaImagemPista: true, regiao: 'Nordeste' },
  '900106': { areasVenda: AREAS_PADRAO('ES01'), centroLucro: 'ES01', escritorioVendas: 'VREG4', equipeVendas: 'GV Vitória', possuiNovaImagemPista: null, regiao: 'Sudeste' },
  '900107': { areasVenda: AREAS_PADRAO('DF01'), centroLucro: 'DF01', escritorioVendas: 'VREG5', equipeVendas: 'GV Brasília', possuiNovaImagemPista: false, regiao: 'Centro-Oeste' },
  '900108': { areasVenda: AREAS_PADRAO('RS01'), centroLucro: 'RS04', escritorioVendas: 'VREG6', equipeVendas: 'GV Porto Alegre', possuiNovaImagemPista: true, regiao: 'Sul' },
};

/** Conta sem semente (cliente acrescentado depois ao elenco) — dados genéricos. */
export function crmDaConta(sap: string): CrmConta {
  return (
    CRM_POR_SAP[sap] ?? {
      areasVenda: AREAS_PADRAO('BR01'),
      centroLucro: 'BR01',
      escritorioVendas: 'VREG1',
      equipeVendas: 'GV Nacional',
      possuiNovaImagemPista: null,
      regiao: 'Nacional',
    }
  );
}

// ───────────────────────────── Estado por oportunidade ─────────────────────────────

/** Campos do detalhe que o elenco não tem — editáveis pelo PATCH. */
export interface DetalheOpp {
  descricao: string | null;
  briefing: string | null;
  parecerLt: string | null;
  clienteRecebedorId: string | null;
  pimAdesao: boolean | null;
  possuiNovaImagemPista: boolean | null;
  seraColocadaNovaImagemPista: boolean | null;
  alteracaoMinutaPadrao: boolean | null;
  descricaoAlteracaoMinutaPadrao: string | null;
  areaVendaCode: string | null;
  areaUsuario: string | null;
  /** `Opportunity.Name` lido de volta do org — só depois de integrada (alçada acionada). */
  salesforceCode: string | null;
  situacaoPosto: OpportunityDetail['situacaoPosto'];
  janelaConsumo: { inicio: string; fim: string } | null;
  prazoContratoMeses: number | null;
  dataConclusao: string | null;
  devolucaoAoLt: { motivo: string; em: string; porNome: string | null } | null;
}

/** Item do checklist na forma do backend + o que decide o status. */
export interface ItemChecklist extends Omit<BackendChecklistItem, 'status'> {
  /** O documento está VINCULADO a esta oportunidade (e não só no repositório). */
  vinculado: boolean;
  /** Conferido pela SNEG/CCOB (RN-F9-03). */
  validado: boolean;
}

export interface IndicadoresOpp extends OpportunityIndicatorsSnapshot {
  /** Quando o recálculo foi pedido — o "callback do ARP" chega alguns segundos depois. */
  pedidoEm: number | null;
}

export interface EquipeOpp {
  principal: BackendTeamMember | null;
  membros: BackendTeamMember[];
}

export interface DadosOpp {
  detalhe: DetalheOpp;
  checklist: ItemChecklist[];
  outrasOrigens: BackendGrupoOutraOrigem[];
  equipe: EquipeOpp;
  indicadores: IndicadoresOpp | null;
  /** Início da fase atual (ISO) e o estado a que ele se refere. */
  faseIniciadaEm: string;
  estadoVisto: EstadoBackend;
  contratoAtivo: boolean;
  dataAtivacao: string | null;
  /** Veredito da interrogação da trilha — vale enquanto a fase for a da semente. */
  bloqueio: { estado: EstadoBackend; areas: string[] } | null;
}

// ───────────────────────────── Checklist ─────────────────────────────

interface TipoDocumento {
  category: string;
  type: string;
  stageLimit: string | null;
  required: boolean;
  single: boolean;
  acceptedTypes: string[];
  arquivo: string;
}

/** Catálogo (Anexo A provisório) para cliente PJ — espelho da semente do backend. */
export const CATALOGO_PJ: TipoDocumento[] = [
  { category: 'Cliente (PJ)', type: 'Cartão CNPJ', stageLimit: 'CALCULO_DA_ALCADA', required: true, single: false, acceptedTypes: ['pdf', 'png', 'jpeg'], arquivo: 'cartao-cnpj.pdf' },
  { category: 'Cliente (PJ)', type: 'Contrato social', stageLimit: 'CALCULO_DA_ALCADA', required: true, single: false, acceptedTypes: ['pdf', 'png', 'jpeg'], arquivo: 'contrato-social-consolidado.pdf' },
  { category: 'Sócio', type: 'CPF dos sócios', stageLimit: 'ENVIO_PARA_ANALISE_SNEG', required: true, single: false, acceptedTypes: ['pdf', 'png', 'jpeg'], arquivo: 'cpf-socios.pdf' },
  { category: 'Sócio', type: 'Contrato social do sócio (PJ)', stageLimit: 'ENVIO_PARA_ANALISE_SNEG', required: true, single: false, acceptedTypes: ['pdf', 'png', 'jpeg'], arquivo: 'contrato-social-socio-pj.pdf' },
  { category: 'Representante do sócio', type: 'CPF / RG do representante', stageLimit: 'EMISSAO_DE_CONTRATO', required: true, single: false, acceptedTypes: ['pdf', 'png', 'jpeg'], arquivo: 'rg-cpf-representante.pdf' },
  { category: 'Posto', type: 'Fotos do posto', stageLimit: 'ANALISE_SNEG', required: true, single: false, acceptedTypes: ['png', 'jpeg'], arquivo: 'fachada-posto.jpeg' },
  { category: 'Posto', type: 'Certificado / Registro ANP', stageLimit: null, required: false, single: false, acceptedTypes: ['pdf'], arquivo: 'registro-anp.pdf' },
  { category: 'Posto', type: 'Licença ambiental', stageLimit: null, required: false, single: false, acceptedTypes: ['pdf'], arquivo: 'licenca-ambiental.pdf' },
  { category: 'Garantia', type: 'Certidão de Inteiro Teor atualizada', stageLimit: 'ANALISE_PREVIA_GARANTIA', required: true, single: true, acceptedTypes: ['pdf'], arquivo: 'certidao-inteiro-teor.pdf' },
  { category: 'Garantia', type: 'Laudo de Avaliação', stageLimit: 'ANALISE_PREVIA_GARANTIA', required: true, single: true, acceptedTypes: ['pdf'], arquivo: 'laudo-avaliacao.pdf' },
];

/** Etapas cujos documentos obrigatórios o GATE 1 cobra (`GATE1_DOCUMENT_STAGES`). */
export const ETAPAS_GATE1 = new Set(['CALCULO_DA_ALCADA', 'ENVIO_PARA_ANALISE_SNEG']);

/**
 * Situação de cada documento: `p` pendente · `r` só no repositório (reutilizável)
 * · `a` anexado · `v` validado · `x` vencido. Ordem = {@link CATALOGO_PJ}.
 */
type Sit = 'p' | 'r' | 'a' | 'v' | 'x';

const SITUACAO_DOCS: Record<string, Sit[]> = {
  //          CNPJ CS   CPFs CSPJ Repr Foto ANP  Lic  Cert Laudo
  'opp-001': ['a', 'p', 'r', 'p', 'p', 'p', 'r', 'p', 'p', 'p'],
  'opp-002': ['a', 'a', 'a', 'a', 'p', 'a', 'a', 'p', 'p', 'p'],
  'opp-003': ['v', 'v', 'v', 'v', 'a', 'v', 'a', 'p', 'a', 'a'],
  'opp-004': ['v', 'v', 'v', 'v', 'p', 'a', 'v', 'x', 'p', 'p'],
  'opp-005': ['v', 'v', 'v', 'v', 'a', 'v', 'v', 'p', 'p', 'p'],
  'opp-006': ['v', 'v', 'v', 'v', 'a', 'v', 'v', 'v', 'v', 'v'],
  'opp-007': ['v', 'v', 'v', 'v', 'a', 'v', 'v', 'v', 'v', 'v'],
  'opp-008': ['v', 'v', 'v', 'v', 'v', 'v', 'v', 'v', 'v', 'v'],
  'opp-009': ['v', 'v', 'v', 'v', 'v', 'v', 'v', 'v', 'v', 'v'],
  'opp-010': ['v', 'v', 'v', 'v', 'v', 'v', 'v', 'v', 'v', 'v'],
};

/** Id estável de documento do repositório, no formato UUID que o backend usa. */
export function idDocumento(oppId: string, indice: number): string {
  const n = oppId.replace(/\D/g, '').padStart(4, '0').slice(-4);
  const i = String(indice + 1).padStart(4, '0');
  return `d0c5${n}-0000-4000-8000-00000000${i}`;
}

export function checklistDaSemente(oppId: string): ItemChecklist[] {
  const situacoes = SITUACAO_DOCS[oppId] ?? CATALOGO_PJ.map((): Sit => 'p');
  return CATALOGO_PJ.map((t, i) => {
    const sit = situacoes[i] ?? 'p';
    const temArquivo = sit !== 'p';
    return {
      category: t.category,
      type: t.type,
      stageLimit: t.stageLimit,
      required: t.required,
      single: t.single,
      selectable: true,
      satisfiedExternally: false,
      acceptedTypes: t.acceptedTypes,
      repositoryDocumentId: temArquivo ? idDocumento(oppId, i) : null,
      fileName: temArquivo ? t.arquivo : null,
      // Vencido: validade passada; os demais anexos, validade longa ou sem prazo.
      expiresAt:
        sit === 'x' ? '2026-08-31' : temArquivo && t.category === 'Cliente (PJ)' ? '2027-03-31' : null,
      proposalId: null,
      proposalCode: null,
      vinculado: sit === 'a' || sit === 'v' || sit === 'x',
      validado: sit === 'v',
    };
  });
}

/** Linha da FAP por proposta de franquia (opp-005, proposta ZBRM). */
export function linhaFapDaFranquia(proposalId: string, proposalCode: string): ItemChecklist {
  return {
    category: 'BR Mania / Lubrax+',
    type: 'FAP BR Mania',
    stageLimit: 'ENVIO_PARA_ANALISE_SNEG',
    required: true,
    single: true,
    selectable: true,
    satisfiedExternally: false,
    acceptedTypes: ['pdf'],
    repositoryDocumentId: null,
    fileName: 'fap-br-mania.pdf',
    expiresAt: null,
    proposalId,
    proposalCode,
    vinculado: true,
    validado: true,
  };
}

// ───────────────────────────── Indicadores consolidados ─────────────────────────────

/** Números plausíveis e determinísticos a partir do valor e do volume da oportunidade. */
export function numerosIndicadores(o: Pick<OportunidadeElenco, 'id' | 'valorEstimado' | 'vmm'>) {
  const semente = Number(o.id.replace(/\D/g, '')) || 7;
  const valor = o.valorEstimado > 0 ? o.valorEstimado : 1_500_000;
  const vmm = o.vmm > 0 ? o.vmm : 300;
  const tir = Math.round((0.14 + (semente % 9) * 0.012) * 10000) / 10000;
  return {
    tir,
    vpl: Math.round(valor * (0.22 + (semente % 5) * 0.03)),
    tma: 11.05,
    rsPorM3: Math.round((38 + (semente % 7) * 3.4) * 100) / 100,
    margemEbitda: Math.round((280 + (semente % 6) * 9.5) * 100) / 100,
    margemMedia: Math.round((265 + (semente % 6) * 8.25) * 100) / 100,
    indicadorRentabilidade: Math.round((1.15 + (semente % 4) * 0.12) * 100) / 100,
    percentualAntecipacao: Math.round((0.3 + (semente % 3) * 0.05) * 100) / 100,
    comprometimento: Math.round((0.55 + (semente % 4) * 0.08) * 100) / 100,
    // Usado por quem precisa do volume consolidado (comparação de cenários).
    volume: vmm,
  };
}

export function snapshotIndicadores(
  o: Pick<OportunidadeElenco, 'id' | 'valorEstimado' | 'vmm' | 'propostas'>,
  status: IndicatorStatus,
  calculadoEm: string,
): IndicadoresOpp {
  const n = numerosIndicadores(o);
  return {
    id: `ind-${o.id}`,
    opportunityId: o.id,
    status,
    tir: n.tir,
    vpl: n.vpl,
    tma: n.tma,
    rsPorM3: n.rsPorM3,
    margemEbitda: n.margemEbitda,
    margemMedia: n.margemMedia,
    indicadorRentabilidade: n.indicadorRentabilidade,
    percentualAntecipacao: n.percentualAntecipacao,
    comprometimento: n.comprometimento,
    consolidatedProposalIds: o.propostas.filter((p) => p.eleita).map((p) => p.id),
    calculadoEm,
    mensagemErro: null,
    createdAt: calculadoEm,
    updatedAt: calculadoEm,
    pedidoEm: null,
  };
}

/** Os seis totais do card "Totais - Recursos Financeiros" (só depois do preenchimento). */
export function totaisRecursos(valor: number): TotaisRecursosFinanceiros {
  const r = (f: number) => Math.round(valor * f * 100) / 100;
  return {
    bonificacaoAntecipadaComNovoMutuoBRL: r(0.4),
    totalRecursoFinanceiroMutuoBRL: r(0.35),
    totalBonificacaoDesempenhoBRL: r(0.25),
    mutuoComAntecipacaoENovoMutuoBRL: r(0.75),
    valorTotalBonificacaoComNovoMutuoBRL: r(0.65),
    // Roll-up sem filtro de tipo do org — NÃO é a soma dos três primeiros.
    valorTotalRecursosFinanceirosBRL: r(1.04),
  };
}

// ───────────────────────────── Sementes por oportunidade do elenco ─────────────────────────────

interface SementeOpp {
  detalhe: Partial<DetalheOpp>;
  indicadores: { status: IndicatorStatus; calculadoEm: string } | null;
  faseIniciadaEm: string;
  contratoAtivo?: boolean;
  dataAtivacao?: string | null;
  bloqueio?: { estado: EstadoBackend; areas: string[] } | null;
  /** userIds de apoio, com o balde (`funcao`). */
  apoio: Array<[string, string]>;
}

const JANELA = (inicio: string, fim: string) => ({ inicio, fim });

export const SEMENTES: Record<string, SementeOpp> = {
  'opp-001': {
    detalhe: {
      descricao: 'Vinculação do posto à bandeira com troca de identidade visual e novo contrato de volume.',
      briefing: 'Cliente quer modernizar a pista e aumentar o mix de lubrificantes. Concorrência agressiva na região.',
      parecerLt: null,
      pimAdesao: null,
      alteracaoMinutaPadrao: false,
      salesforceCode: null,
      situacaoPosto: { label: 'Em operação', details: 'Bandeira Petrobras' },
      janelaConsumo: null,
      prazoContratoMeses: null,
    },
    indicadores: null,
    faseIniciadaEm: '2026-09-22T13:10:00Z',
    apoio: [['usr-exp-isabela', 'exec_expansao']],
  },
  'opp-002': {
    detalhe: {
      descricao: 'Renovação do contrato de volume por 60 meses com bonificação antecipada.',
      briefing: 'Dois cenários em estudo: com e sem novo mútuo. O cliente prefere o cenário com antecipação.',
      parecerLt: 'Cliente adimplente há 8 anos, volume estável e potencial de crescimento com a nova pista.',
      pimAdesao: true,
      possuiNovaImagemPista: false,
      seraColocadaNovaImagemPista: true,
      alteracaoMinutaPadrao: false,
      salesforceCode: '4567102',
      situacaoPosto: { label: 'Em operação', details: 'Bandeira Petrobras' },
      janelaConsumo: JANELA('2026-11-01', '2031-10-31'),
      prazoContratoMeses: 60,
    },
    indicadores: { status: 'atualizado', calculadoEm: '2026-09-29T17:42:00Z' },
    faseIniciadaEm: '2026-09-10T11:00:00Z',
    apoio: [['usr-exp-isabela', 'exec_expansao'], ['usr-gv-henrique', 'outros']],
  },
  'opp-003': {
    detalhe: {
      descricao: 'Embandeiramento de posto bandeira branca com investimento em imagem e mútuo.',
      briefing: 'Posto hoje bandeira branca, bom fluxo no litoral. Exige garantia hipotecária.',
      parecerLt: 'Operação estratégica para entrada na região; proprietário com outros dois postos.',
      pimAdesao: false,
      possuiNovaImagemPista: false,
      seraColocadaNovaImagemPista: true,
      alteracaoMinutaPadrao: false,
      salesforceCode: '4567215',
      situacaoPosto: { label: 'Bandeira branca', details: 'Em processo de embandeiramento' },
      janelaConsumo: JANELA('2026-12-01', '2031-11-30'),
      prazoContratoMeses: 60,
    },
    indicadores: { status: 'atualizado', calculadoEm: '2026-09-05T15:20:00Z' },
    faseIniciadaEm: '2026-09-08T10:15:00Z',
    bloqueio: { estado: 'EM_ANALISE', areas: ['CCOB', 'Integridade'] },
    apoio: [['usr-sneg-carla', 'outros'], ['usr-gv-henrique', 'outros']],
  },
  'opp-004': {
    detalhe: {
      descricao: 'Renovação com investimento em tanques e bombas.',
      briefing: 'Volume projetado considera a duplicação da rodovia prevista para 2027.',
      parecerLt: 'Cliente pede investimento antes da renovação; volume atual abaixo do contratado anterior.',
      pimAdesao: true,
      possuiNovaImagemPista: true,
      alteracaoMinutaPadrao: false,
      salesforceCode: '4567188',
      situacaoPosto: { label: 'Em operação', details: 'Bandeira Petrobras' },
      janelaConsumo: JANELA('2026-10-15', '2031-10-14'),
      prazoContratoMeses: 60,
    },
    indicadores: { status: 'desatualizado', calculadoEm: '2026-08-27T09:05:00Z' },
    faseIniciadaEm: '2026-08-29T14:00:00Z',
    bloqueio: { estado: 'EM_ANALISE', areas: ['Líder de Território'] },
    apoio: [['usr-sneg-carla', 'outros']],
  },
  'opp-005': {
    detalhe: {
      descricao: 'Implantação de loja BR Mania junto à renovação do contrato de combustíveis.',
      briefing: 'Franqueado experiente; loja de 120 m² com cozinha.',
      parecerLt: 'Ponto com alto fluxo urbano, perfil adequado para conveniência.',
      pimAdesao: true,
      possuiNovaImagemPista: true,
      alteracaoMinutaPadrao: false,
      salesforceCode: '4567230',
      situacaoPosto: { label: 'Em operação', details: 'Bandeira Petrobras' },
      janelaConsumo: JANELA('2026-11-01', '2031-10-31'),
      prazoContratoMeses: 60,
    },
    indicadores: { status: 'atualizado', calculadoEm: '2026-09-02T11:30:00Z' },
    faseIniciadaEm: '2026-09-03T16:45:00Z',
    apoio: [['usr-cex-lucas', 'exec_br_mania'], ['usr-gf-joao', 'outros'], ['usr-sneg-carla', 'outros']],
  },
  'opp-006': {
    detalhe: {
      descricao: 'Vinculação de bandeira com novo mútuo e bonificação por desempenho.',
      briefing: 'Maior operação do trimestre na regional.',
      parecerLt: 'Cliente com histórico excelente; alçada de diretoria.',
      pimAdesao: true,
      possuiNovaImagemPista: true,
      alteracaoMinutaPadrao: false,
      salesforceCode: '4567091',
      situacaoPosto: { label: 'Em operação', details: 'Bandeira Petrobras' },
      janelaConsumo: JANELA('2026-11-01', '2033-10-31'),
      prazoContratoMeses: 84,
    },
    indicadores: { status: 'atualizado', calculadoEm: '2026-08-18T10:00:00Z' },
    faseIniciadaEm: '2026-09-15T09:30:00Z',
    apoio: [['usr-sneg-carla', 'outros'], ['usr-gv-henrique', 'outros'], ['usr-bp-bruno', 'outros']],
  },
  'opp-007': {
    detalhe: {
      descricao: 'Renovação contratual com cláusula especial de exclusividade de lubrificantes.',
      briefing: 'Minuta com alteração pedida pelo jurídico do cliente.',
      parecerLt: 'Renovação sem investimento novo; ajuste de cláusula aprovado pela regional.',
      pimAdesao: false,
      possuiNovaImagemPista: true,
      alteracaoMinutaPadrao: true,
      descricaoAlteracaoMinutaPadrao:
        'Incluir cláusula de exclusividade de lubrificantes por 36 meses e prazo de 45 dias para notificação de rescisão.',
      salesforceCode: '4566980',
      situacaoPosto: { label: 'Em operação', details: 'Bandeira Petrobras' },
      janelaConsumo: JANELA('2026-10-01', '2031-09-30'),
      prazoContratoMeses: 60,
    },
    indicadores: { status: 'atualizado', calculadoEm: '2026-07-28T14:10:00Z' },
    faseIniciadaEm: '2026-09-18T11:20:00Z',
    bloqueio: { estado: 'EM_MINUTA', areas: ['SPCOM'] },
    apoio: [['usr-sneg-carla', 'outros'], ['usr-spcom-fabio', 'outros'], ['usr-bp-bruno', 'outros']],
  },
  'opp-008': {
    detalhe: {
      descricao: 'Embandeiramento com obra de reforma completa da pista (Converge).',
      briefing: 'Obra orçada pela engenharia; início previsto após assinatura.',
      parecerLt: 'Investimento alto, mas com volume garantido por contrato de 7 anos.',
      pimAdesao: true,
      possuiNovaImagemPista: false,
      seraColocadaNovaImagemPista: true,
      alteracaoMinutaPadrao: false,
      salesforceCode: '4566872',
      situacaoPosto: { label: 'Em reforma', details: 'Obra vinculada' },
      janelaConsumo: JANELA('2027-01-01', '2033-12-31'),
      prazoContratoMeses: 84,
    },
    indicadores: { status: 'atualizado', calculadoEm: '2026-07-10T16:00:00Z' },
    faseIniciadaEm: '2026-09-24T15:00:00Z',
    apoio: [['usr-sneg-carla', 'outros'], ['usr-spcom-fabio', 'outros'], ['usr-bp-bruno', 'outros']],
  },
  'opp-009': {
    detalhe: {
      descricao: 'Ampliação de pista com duas novas ilhas de abastecimento.',
      briefing: 'Contrato assinado; pagamento do mútuo em liberação.',
      parecerLt: 'Cliente da carteira, segunda operação no mesmo CNPJ.',
      pimAdesao: true,
      possuiNovaImagemPista: true,
      alteracaoMinutaPadrao: false,
      salesforceCode: '4566731',
      situacaoPosto: { label: 'Em operação', details: 'Bandeira Petrobras' },
      janelaConsumo: JANELA('2026-09-01', '2031-08-31'),
      prazoContratoMeses: 60,
    },
    indicadores: { status: 'atualizado', calculadoEm: '2026-06-02T10:30:00Z' },
    faseIniciadaEm: '2026-09-12T10:00:00Z',
    contratoAtivo: true,
    dataAtivacao: '2026-09-11T18:20:00Z',
    apoio: [['usr-sneg-carla', 'outros'], ['usr-spcom-fabio', 'outros'], ['usr-bp-bruno', 'outros']],
  },
  'opp-010': {
    detalhe: {
      descricao: 'Vinculação de bandeira concluída com mútuo e bonificação antecipada.',
      briefing: null,
      parecerLt: 'Operação concluída dentro do prazo.',
      pimAdesao: true,
      possuiNovaImagemPista: true,
      alteracaoMinutaPadrao: false,
      salesforceCode: '4566420',
      situacaoPosto: { label: 'Em operação', details: 'Bandeira Petrobras' },
      janelaConsumo: JANELA('2026-06-01', '2031-05-31'),
      prazoContratoMeses: 60,
      dataConclusao: '2026-08-20T17:00:00Z',
    },
    indicadores: { status: 'atualizado', calculadoEm: '2026-03-20T10:00:00Z' },
    faseIniciadaEm: '2026-08-20T17:00:00Z',
    contratoAtivo: true,
    dataAtivacao: '2026-07-30T12:00:00Z',
    apoio: [['usr-sneg-carla', 'outros'], ['usr-spcom-fabio', 'outros'], ['usr-bp-bruno', 'outros']],
  },
};

/** Documentos que chegaram por OUTRAS telas (contrato assinado no DocuSign). */
export function outrasOrigensDaSemente(oppId: string): BackendGrupoOutraOrigem[] {
  if (oppId !== 'opp-009' && oppId !== 'opp-010') return [];
  const n = oppId.slice(-3);
  const em = oppId === 'opp-009' ? '2026-09-10T14:30:00Z' : '2026-07-29T16:00:00Z';
  return [
    {
      titulo: 'Contrato assinado (DocuSign)',
      documentos: [
        { origem: 'CONTRATO_ASSINADO', documentoId: `sig-${n}-cpcvm`, proposalId: null, tipo: 'CPCVM Volume Total', fileName: 'cpcvm-assinado.pdf', anexadoEm: em },
        { origem: 'CONTRATO_ASSINADO', documentoId: `sig-${n}-mutuo`, proposalId: null, tipo: 'DCVIM Novo Mútuo', fileName: 'novo-mutuo-assinado.pdf', anexadoEm: em },
      ],
    },
  ];
}
