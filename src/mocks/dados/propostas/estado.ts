import type { BackendPostoPhoto } from '@/lib/analise/posto-photo-mapping';
import type { IndicatorStatus } from '@/lib/opportunities-indicators/indicator-status';
import type { ProposalIndicatorsSnapshot } from '@/lib/opportunities-indicators/types';
import type { FinancialItem } from '@/lib/proposals/financial-items.types';
import type { FinancialResource, ItemObra } from '@/lib/proposals/financial-resources.types';
import type { Obra, ObraParcela } from '@/lib/obras/obra-mapping';
import type { Investment } from '@/lib/proposals/investments.types';
import type { PostoSituation } from '@/lib/proposals/posto-situation.types';
import type { ProposalStatus, ProposalSummary } from '@/lib/proposals/proposal.types';
import type { MarketIntelligence, ProductLine } from '@/lib/proposals/types';
import {
  BandeiraPosto,
  EtapaLiberacaoRecurso,
  Finalidade,
  FinalidadeRecurso,
  IndiceCorrecao,
  PeriodicidadeRecurso,
  PropriedadeImovel,
  SituacaoPosto,
  TipoContrato,
  TipoPosto,
  TipoRegistroRecursoFinanceiro,
} from '@/lib/picklists/salesforce-values';

import { fatia } from '../../core/store';
import { clientePorSap, type OportunidadeElenco, type PropostaElenco } from '../../elenco';
import { oportunidades } from '../../estado-compartilhado';
import { catalogoInicialDeObras } from '../contrato/obras';
import {
  addDias,
  addMeses,
  arred,
  baseSugeridaDaUf,
  cpvNaBase,
  hojeIso,
  MESES_DA_PERIODICIDADE,
  mesesEntre,
  ocorrencias,
  primeiroDoMesSeguinte,
  PRODUTOS,
  tipoItemPorId,
  ultimoDoMes,
} from './catalogo';

/**
 * Estado vivo do domínio `propostas`.
 *
 * O STATUS de cada proposta mora no estado compartilhado
 * (`oportunidade(id).propostas[].status`) — é ele que a listagem e a análise
 * leem. Aqui fica todo o resto: os campos do `ProposalDto`, os blocos da tela
 * (produtos, recursos, investimentos, receitas/despesas, situação, fotos) e os
 * snapshots de indicadores e inteligência de mercado.
 *
 * Outros domínios podem importar {@link propostaDto} / {@link estadoDaProposta}
 * daqui (sem importar o handler) para mostrar a mesma proposta.
 */

// ───────────────────────────── Tipos ─────────────────────────────

/** Campos do `ProposalDto` do backend que o tipo do front não declara (todos lidos só por tela de franquia/listagem). */
export interface PropostaDto extends ProposalSummary {
  opportunityId: string;
  tipoProposta: 'PCR' | 'ZBRM' | 'ZLUB';
  tipoContrato: TipoContrato;
  possuiInvestimentos: boolean;
  areaUsuario: string | null;
  centroLucro: string | null;
  criadoPorId: string;
  requiresManagerApproval: boolean;
  netlexConsultaStatus: string | null;
  preenchimentoPercent: number;
  eleita: boolean;
  createdAt: string;
  updatedAt: string;
}

/** O que a proposta guarda além do status (que é do estado compartilhado). */
export interface DadosProposta {
  opportunityId: string;
  tipoProposta: 'PCR' | 'ZBRM' | 'ZLUB';
  tipoContrato: TipoContrato;
  finalidade: Finalidade;
  dataInicioAnalise: string;
  dataFimAnalise: string;
  possuiInvestimentos: boolean;
  aceleraMais: boolean;
  postoRef: string | null;
  areaUsuario: string | null;
  centroLucro: string | null;
  supplyCenterCode: string | null;
  incotermPadrao: string | null;
  motivoDevolucao: string | null;
  devolvidaEm: string | null;
  minutaPadrao: boolean;
  netlexConsultaCodigo: string | null;
  criadoPorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AjusteAberto {
  pendenciaId: string;
  pendenciaCode: string;
  comentarios: string[];
}

export interface EstadoProposta {
  dados: DadosProposta;
  produtos: ProductLine[];
  recursos: FinancialResource[];
  investimentos: Investment[];
  itens: FinancialItem[];
  situacao: PostoSituation | null;
  fotos: BackendPostoPhoto[];
  inteligencia: MarketIntelligence | null;
  indicadores: ProposalIndicatorsSnapshot | null;
  /** Epoch-ms do disparo ao ARP em curso (o cálculo é assíncrono). */
  calculoIniciadoEm: number | null;
  /** Pendência de ajuste aberta por bloco — o "Solicitar ajuste" é idempotente por bloco. */
  ajustes: Record<string, AjusteAberto>;
  /** Data verba BP (R$) da política comercial. */
  verbaBp: number;
  registradoZfpj: boolean;
}

// ───────────────────────────── Derivações ─────────────────────────────

/** Recalcula os campos derivados de um recurso financeiro (o backend é quem deriva). */
export function derivarRecurso(r: FinancialResource): FinancialResource {
  const passo = MESES_DA_PERIODICIDADE[r.periodicidade] ?? 0;
  const hoje = hojeIso();
  let pagas = 0;
  for (let k = 0; k < r.qtdParcelas; k += 1) {
    if (addMeses(r.dataLiberacao, k * passo) <= hoje) pagas += 1;
  }
  const mutuo =
    r.tipoRegistro === TipoRegistroRecursoFinanceiro.Mutuo ||
    r.tipoRegistro === TipoRegistroRecursoFinanceiro.ParcelamentoDeDebito;
  const bonusTotal =
    r.bonusQtdParcelas !== null && r.bonusValorParcela !== null
      ? arred(r.bonusQtdParcelas * r.bonusValorParcela)
      : null;
  return {
    ...r,
    valorTotal: arred(r.qtdParcelas * r.valorParcela),
    parcelasPagas: pagas,
    parcelasRestantes: r.qtdParcelas - pagas,
    saldoAPagar: arred((r.qtdParcelas - pagas) * r.valorParcela),
    dataFinal: r.dataLiberacao ? addMeses(r.dataLiberacao, (r.qtdParcelas - 1) * passo) : null,
    dataInicioRessarcimento:
      mutuo && r.carenciaMeses !== null
        ? addMeses(addDias(r.dataLiberacao, 30 * r.carenciaMeses), 1)
        : null,
    bonusValorTotal: bonusTotal,
  };
}

export function derivarItem(i: FinancialItem): FinancialItem {
  const numMeses = mesesEntre(i.dataInicial, i.dataFinal);
  return {
    ...i,
    numMeses,
    valorFinal: i.valor === null ? null : arred(i.valor * ocorrencias(i.periodicidade, numMeses)),
  };
}

export function derivarLinha(l: ProductLine): ProductLine {
  return {
    ...l,
    hvMeses: mesesEntre(l.inicioConsumo, l.fimConsumo),
    precoFinal: arred(l.cpv + l.margemProposta),
  };
}

export function derivarInvestimento(x: Investment): Investment {
  const base = x.valorAquisicao ?? x.valorUnitario;
  return { ...x, valorFinal: arred(base * (x.quantidade ?? 1) + (x.custoInstalacao ?? 0)) };
}

/** Soma de receitas e despesas (`valorFinal`). */
export function resumoFinanceiro(itens: FinancialItem[]): {
  totalReceitas: number;
  totalDespesas: number;
  saldo: number;
} {
  const soma = (cat: 'RECEITA' | 'DESPESA') =>
    arred(itens.filter((i) => i.categoria === cat).reduce((s, i) => s + (i.valorFinal ?? 0), 0));
  const totalReceitas = soma('RECEITA');
  const totalDespesas = soma('DESPESA');
  return { totalReceitas, totalDespesas, saldo: arred(totalReceitas - totalDespesas) };
}

/**
 * O "ARP" do protótipo: números plausíveis derivados do que a proposta tem.
 * TIR e % de antecipação em FRAÇÃO (0,18 = 18%); TMA em percentual; margens em
 * R$/m³ — as mesmas unidades do contrato real.
 */
export function calcularIndicadores(
  e: EstadoProposta,
  proposalId: string,
  status: IndicatorStatus,
  calculadoEm: string,
  ajusteTir = 0,
): ProposalIndicatorsSnapshot {
  const volumeTotal = e.produtos.reduce((s, l) => s + l.volume * l.hvMeses, 0);
  const margemTotal = e.produtos.reduce((s, l) => s + l.volume * l.hvMeses * l.margemProposta, 0);
  const antecipados = e.recursos
    .filter((r) => r.tipoRegistro === TipoRegistroRecursoFinanceiro.Antecipada || r.tipoRegistro === TipoRegistroRecursoFinanceiro.Mutuo)
    .reduce((s, r) => s + r.valorTotal, 0);
  const recursos =
    e.recursos.reduce((s, r) => s + r.valorTotal, 0) + e.investimentos.reduce((s, x) => s + x.valorFinal, 0);
  // Sem recurso nenhum (renovação) o custo do contrato ainda pesa — piso de 45% da margem.
  const base = Math.max(recursos, margemTotal * 0.45, 1);
  const razao = margemTotal / base;
  const margemMedia = volumeTotal > 0 ? margemTotal / volumeTotal : 0;
  const vpl = margemTotal * 0.95 - base;
  const tir = Math.min(0.34, Math.max(0.05, 0.035 + 0.075 * razao + ajusteTir));
  const agora = new Date().toISOString();
  return {
    id: `ind-${proposalId}`,
    proposalId,
    status,
    tir: arred(tir, 4),
    vpl: arred(vpl, 0),
    tma: 11.05,
    rsPorM3: volumeTotal > 0 ? arred(recursos / volumeTotal) : null,
    margemEbitda: arred(margemMedia * 0.82),
    margemMedia: arred(margemMedia),
    indicadorRentabilidade: arred((vpl + base) / base, 2),
    percentualAntecipacao: recursos > 0 ? arred(antecipados / recursos, 4) : 0,
    comprometimento: margemMedia > 0 && volumeTotal > 0 ? arred(recursos / volumeTotal / margemMedia, 4) : null,
    payback: arred(Math.min(9.5, Math.max(1.2, (base / Math.max(margemTotal, 1)) * (volumeTotal > 0 ? 5 : 0) + 1.1)), 1),
    calculadoEm,
    mensagemErro: null,
    createdAt: calculadoEm,
    updatedAt: agora,
  };
}

// ───────────────────────────── Sementes ─────────────────────────────

type PerfilRecursos = 'nenhum' | 'vinculacao' | 'vinculacao-mutuo' | 'obra';
type PerfilInvestimentos = 'nenhum' | 'benfeitorias' | 'imagem';

interface Perfil {
  finalidade: Finalidade;
  tipoContrato: TipoContrato;
  aceleraMais: boolean;
  possuiInvestimentos: boolean;
  /** `parcial` = proposta recém-criada (opp-001). */
  nivel: 'parcial' | 'completo' | 'franquia';
  recursos: PerfilRecursos;
  investimentos: PerfilInvestimentos;
  situacao: SituacaoPosto;
  indicadores: IndicatorStatus | null;
  ajusteTir?: number;
  /** Fator sobre o VMM da oportunidade (cenários alternativos). */
  fatorVolume?: number;
  /** Desconto de margem (R$/m³) sobre a sugerida. */
  descontoMargem?: number;
  minutaPadrao?: boolean;
  netlex?: string;
  motivoDevolucao?: string;
  verbaFator?: number;
  /** Estimativa do Converge vinculada (catálogo do domínio `contrato`). */
  obra?: string;
}

const PERFIS: Record<string, Perfil> = {
  'prp-001a': {
    finalidade: Finalidade.Vinculacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: false,
    nivel: 'parcial',
    recursos: 'nenhum',
    investimentos: 'nenhum',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: null,
  },
  'prp-002a': {
    finalidade: Finalidade.Renovacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: false,
    nivel: 'completo',
    recursos: 'nenhum',
    investimentos: 'nenhum',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: 'atualizado',
    ajusteTir: 0.01,
  },
  'prp-002b': {
    finalidade: Finalidade.Renovacao,
    tipoContrato: TipoContrato.CpcvmProduto,
    aceleraMais: false,
    possuiInvestimentos: false,
    nivel: 'completo',
    recursos: 'nenhum',
    investimentos: 'nenhum',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: 'atualizado',
    fatorVolume: 0.88,
    descontoMargem: 22,
    ajusteTir: -0.02,
  },
  'prp-003a': {
    finalidade: Finalidade.Vinculacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: false,
    nivel: 'completo',
    recursos: 'vinculacao',
    investimentos: 'nenhum',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: 'atualizado',
  },
  'prp-004a': {
    finalidade: Finalidade.Renovacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: true,
    nivel: 'completo',
    recursos: 'nenhum',
    investimentos: 'benfeitorias',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: 'desatualizado',
    motivoDevolucao:
      'O contrato de uso do imóvel anexado venceu em maio/2026. Atualize a situação do imóvel com o contrato renovado e revise o volume de Diesel S10, que está acima do histórico dos últimos 12 meses.',
  },
  'prp-005a': {
    finalidade: Finalidade.Vinculacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: false,
    nivel: 'completo',
    recursos: 'vinculacao',
    investimentos: 'nenhum',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: 'atualizado',
  },
  'prp-005b': {
    finalidade: Finalidade.BrManiaImplantacao,
    tipoContrato: TipoContrato.BrMania,
    aceleraMais: true,
    possuiInvestimentos: false,
    nivel: 'franquia',
    recursos: 'nenhum',
    investimentos: 'nenhum',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: null,
  },
  'prp-006a': {
    finalidade: Finalidade.Vinculacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: true,
    nivel: 'completo',
    recursos: 'vinculacao',
    investimentos: 'imagem',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: 'atualizado',
    verbaFator: 0.9,
  },
  'prp-007a': {
    finalidade: Finalidade.Vinculacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: false,
    nivel: 'completo',
    recursos: 'vinculacao-mutuo',
    investimentos: 'nenhum',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: 'atualizado',
    minutaPadrao: false,
    netlex: 'NTX-2026-04417',
  },
  'prp-008a': {
    finalidade: Finalidade.Implantacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: true,
    nivel: 'completo',
    recursos: 'obra',
    investimentos: 'benfeitorias',
    situacao: SituacaoPosto.EmConstrucao,
    indicadores: 'atualizado',
    obra: '5821',
  },
  'prp-009a': {
    finalidade: Finalidade.Vinculacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: false,
    nivel: 'completo',
    recursos: 'obra',
    investimentos: 'nenhum',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: 'atualizado',
    obra: '5307',
  },
  'prp-010a': {
    finalidade: Finalidade.Vinculacao,
    tipoContrato: TipoContrato.CpcvmVolume,
    aceleraMais: true,
    possuiInvestimentos: false,
    nivel: 'completo',
    recursos: 'vinculacao',
    investimentos: 'nenhum',
    situacao: SituacaoPosto.EmOperacao,
    indicadores: 'atualizado',
  },
};

/**
 * A obra do Converge vem do catálogo do domínio `contrato` (é ele que serve
 * `GET /opportunities/:id/obra`), para a proposta e a aba da obra falarem da
 * MESMA estimativa.
 */
export function obraDoCatalogo(clienteSap: string, estimateId: string): Obra | undefined {
  return catalogoInicialDeObras()[clienteSap]?.find((o) => o.estimateId === estimateId);
}

export const ETAPA_DA_PARCELA: Record<number, EtapaLiberacaoRecurso> = {
  0: EtapaLiberacaoRecurso.AposAssinaturaDoContratoEEfetivacaoDasGarantias,
  1: EtapaLiberacaoRecurso.AposObraCivilFundacaoExecucaoDeColunasCoberturaDaPista,
  2: EtapaLiberacaoRecurso.AposObraCivilPavimentacaoDaPista,
  3: EtapaLiberacaoRecurso.AposObraCivilConclusaoDasObras,
};

export function itemObra(obra: Pick<Obra, 'estimateId' | 'tipo'>, p: ObraParcela): ItemObra {
  return {
    estimateId: obra.estimateId,
    tipo: obra.tipo,
    parcelaNumero: p.numero,
    parcelaDescricao: p.descricao,
    imposto: p.imposto,
  };
}

/** Os recursos que a obra gera — um por parcela, liberado no prazo da parcela. */
export function recursosDaObra(
  proposalId: string,
  obra: Obra,
  campos: Pick<FinancialResource, 'tipoRegistro' | 'tipoBonificacao' | 'finalidadeRecurso'> & Partial<FinancialResource>,
  inicioLiberacao: string,
  deslocamentoDias: number,
  quando: string,
  novoIdFn: (i: number) => string,
): FinancialResource[] {
  return obra.parcelas.map((parcela, i) =>
    recursoVazio(
      novoIdFn(i),
      proposalId,
      {
        etapaLiberacao: ETAPA_DA_PARCELA[Math.min(parcela.numero, 3)],
        dataLiberacao: addDias(inicioLiberacao, (parcela.prazoPagamentoDias ?? 30) + deslocamentoDias),
        qtdParcelas: 1,
        valorParcela: parcela.valor,
        periodicidade: PeriodicidadeRecurso.Unica,
        obra: itemObra(obra, parcela),
        ...campos,
      },
      quando,
    ),
  );
}

/** Um recurso com todos os campos opcionais em `null`. */
export function recursoVazio(
  id: string,
  proposalId: string,
  campos: Pick<
    FinancialResource,
    'tipoRegistro' | 'finalidadeRecurso' | 'etapaLiberacao' | 'dataLiberacao' | 'qtdParcelas' | 'valorParcela' | 'periodicidade'
  > &
    Partial<FinancialResource>,
  quando: string,
): FinancialResource {
  return derivarRecurso({
    id,
    proposalId,
    tipoBonificacao: null,
    indiceCorrecao: IndiceCorrecao.Igpm,
    indiceCorrecaoParcela: null,
    custeadoPelaObra: false,
    obra: null,
    carenciaMeses: null,
    jurosPercentual: null,
    justificativa: null,
    qtdPrestacoes: null,
    dataInicioRessarcimento: null,
    bonusPeriodicidade: null,
    bonusQtdParcelas: null,
    bonusValorParcela: null,
    bonusIndiceCorrecaoPrestacao: null,
    bonusTipoAtualizacaoMonetaria: null,
    bonusTipoAtualizacaoMonetariaLabel: null,
    bonusValorTotal: null,
    valorTotal: 0,
    parcelasPagas: 0,
    parcelasRestantes: 0,
    saldoAPagar: 0,
    dataFinal: null,
    createdAt: quando,
    updatedAt: quando,
    ...campos,
  });
}

/** Um investimento com os campos de categoria em `null`. */
export function investimentoVazio(
  id: string,
  proposalId: string,
  campos: Pick<Investment, 'dataInvestimento' | 'tipo' | 'vidaUtilFiscalMeses' | 'detalhamentoItem' | 'valorUnitario'> &
    Partial<Investment>,
  quando: string,
): Investment {
  return derivarInvestimento({
    id,
    proposalId,
    descricao: null,
    valorAquisicao: null,
    negociacaoOriginal: false,
    custeadoPelaObra: false,
    obra: null,
    quantidade: null,
    custoInstalacao: null,
    valorResidualContabil: null,
    vidaUtilContabilMeses: null,
    equipamento: null,
    elementoImagem: null,
    codigo: null,
    equipamentoUsado: null,
    valorVenda: null,
    venderParaCliente: null,
    dataVendaEquipamento: null,
    valorFinal: 0,
    createdAt: quando,
    updatedAt: quando,
    ...campos,
  });
}

/** Item financeiro a partir do tipo do catálogo. */
export function itemDoTipo(
  id: string,
  proposalId: string,
  tipoId: string,
  dataInicial: string,
  dataFinal: string,
  quando: string,
  valor?: number,
): FinancialItem {
  const t = tipoItemPorId(tipoId);
  if (!t) throw new Error(`[mock propostas] tipo de item desconhecido: ${tipoId}`);
  return derivarItem({
    id,
    proposalId,
    financialItemTypeId: t.id,
    tipoNome: t.nome,
    recordType: t.recordType,
    categoria: t.categoria,
    descricao: t.defaultDescricao,
    valor: valor ?? t.defaultValor ?? 0,
    valorFinal: null,
    indiceCorrecao: t.defaultIndiceCorrecao,
    periodicidade: t.defaultPeriodicidade ?? 'MENSAL',
    dataInicial,
    dataFinal,
    numMeses: 0,
    volumeGnvCtf: null,
    obrigatoria: t.obrigatoria,
    bypass: false,
    createdAt: quando,
    updatedAt: quando,
  });
}

function linha(
  id: string,
  proposalId: string,
  codigo: string,
  volume: number,
  baseCodigo: string | null,
  baseNome: string,
  inicio: string,
  fim: string,
  quando: string,
  desconto: number,
  maturacao: boolean,
): ProductLine {
  const p = PRODUTOS.find((x) => x.codigo === codigo);
  if (!p) throw new Error(`[mock propostas] produto desconhecido: ${codigo}`);
  return derivarLinha({
    id,
    proposalId,
    produtoCodigo: p.codigo,
    produtoNome: p.nome,
    base: baseNome,
    baseCodigo,
    volume,
    incoterm: 'Z10',
    prazoPagamentoDias: 15,
    prazoPagamento: 'Z015',
    inicioConsumo: inicio,
    fimConsumo: fim,
    hvMeses: 0,
    maturacaoAplicada: maturacao,
    cpv: cpvNaBase(p, baseCodigo),
    margemBp: p.margemBp,
    margemSugerida: p.margemSugerida,
    margemProposta: p.margemSugerida - desconto,
    precoFinal: 0,
    createdAt: quando,
    updatedAt: quando,
  });
}

/** Dados do `ProposalDto` de uma proposta do elenco (ou recém-criada). */
export function dadosIniciais(
  o: OportunidadeElenco,
  p: PropostaElenco,
  perfil: Pick<Perfil, 'finalidade' | 'tipoContrato' | 'aceleraMais' | 'possuiInvestimentos' | 'minutaPadrao' | 'netlex' | 'motivoDevolucao'>,
  createdAt: string,
  dataInicioAnalise: string,
  dataFimAnalise: string,
): DadosProposta {
  const cliente = clientePorSap(o.clienteSap);
  // A conta do Litoral Sul (bandeira branca) não tem centro nas áreas de venda.
  const semCentro = !cliente || !cliente.naRede;
  const base = cliente ? baseSugeridaDaUf(cliente.uf) : undefined;
  return {
    opportunityId: o.id,
    tipoProposta: p.tipo,
    tipoContrato: perfil.tipoContrato,
    finalidade: perfil.finalidade,
    dataInicioAnalise,
    dataFimAnalise,
    possuiInvestimentos: perfil.possuiInvestimentos,
    aceleraMais: perfil.aceleraMais,
    postoRef: o.clienteSap,
    areaUsuario: 'DCVIM',
    centroLucro: cliente ? `ZV-${cliente.uf}01` : null,
    supplyCenterCode: semCentro ? null : (base?.code ?? null),
    incotermPadrao: semCentro ? null : 'Z10',
    motivoDevolucao: perfil.motivoDevolucao ?? null,
    devolvidaEm: perfil.motivoDevolucao ? '2026-09-24T17:40:00.000Z' : null,
    minutaPadrao: perfil.minutaPadrao ?? true,
    netlexConsultaCodigo: perfil.netlex ?? null,
    criadoPorId: o.ltId,
    createdAt,
    updatedAt: createdAt,
  };
}

function bandeiraAnpDe(sap: string): string | null {
  const c = clientePorSap(sap);
  if (!c) return null;
  return c.bandeira === 'Bandeira branca' ? 'BANDEIRA BRANCA' : 'VIBRA';
}

function situacaoSemente(o: OportunidadeElenco, proposalId: string, perfil: Perfil, quando: string): PostoSituation {
  const c = clientePorSap(o.clienteSap);
  const terceiro = ['prp-003a', 'prp-004a', 'prp-006a', 'prp-009a'].includes(proposalId);
  const vencido = proposalId === 'prp-004a';
  const inicioUso = vencido ? '2016-06-01' : '2021-03-01';
  const fimUso = vencido ? '2026-05-31' : '2036-02-28';
  return {
    id: `sit-${proposalId}`,
    proposalId,
    postoRef: o.clienteSap,
    tipoPosto: o.clienteSap === '900104' ? TipoPosto.Rodoviario : TipoPosto.Urbano,
    situacaoPosto: perfil.situacao,
    bandeiraAnp: bandeiraAnpDe(o.clienteSap),
    bandeiraAnpStatus: 'RESOLVIDA',
    bandeiraAnpSource: 'CADASTRO_ANP',
    bandeiraAnpAsOf: '2026-09-15',
    bandeiraFisica: c?.bandeira === 'Bandeira branca' ? BandeiraPosto.BandeiraBranca : BandeiraPosto.BR,
    propriedadeImovel: terceiro ? PropriedadeImovel.DeTerceiros : PropriedadeImovel.DaRazaoSocialQueExploraOPosto,
    tipoContratoUso: terceiro ? 'LOCACAO' : null,
    contratoRenovavel: terceiro ? true : null,
    prorrogacaoMeses: terceiro ? 60 : null,
    dataInicioUso: terceiro ? inicioUso : null,
    dataFimUso: terceiro ? fimUso : null,
    criticas: vencido ? ['O contrato de uso do imóvel venceu em 31/05/2026.'] : [],
    createdAt: quando,
    updatedAt: quando,
  };
}

function inteligenciaSemente(o: OportunidadeElenco, quando: string): MarketIntelligence {
  const branca = o.clienteSap === '900103';
  return {
    consultadoEm: quando,
    fonte: 'Tableau · Simulador de Volume de Postos',
    vmmMedioBairro: Math.round(o.vmm * 0.86),
    vmmMedioCidade: Math.round(o.vmm * 0.71),
    vmmPosto: o.vmm,
    postosUrbanos: 14 + (o.vmm % 9),
    postosRodoviarios: o.clienteSap === '900104' ? 11 : 3,
    marketshareBairro: [
      { bandeira: 'Vibra', percentual: branca ? 28.4 : 41.2 },
      { bandeira: 'Ipiranga', percentual: 22.7 },
      { bandeira: 'Raízen', percentual: 18.9 },
      { bandeira: 'Bandeira branca', percentual: branca ? 25.6 : 12.1 },
      { bandeira: 'Outras', percentual: branca ? 4.4 : 5.1 },
    ],
    marketshareCidade: [
      { bandeira: 'Vibra', percentual: 33.8 },
      { bandeira: 'Raízen', percentual: 24.5 },
      { bandeira: 'Ipiranga', percentual: 21.3 },
      { bandeira: 'Bandeira branca', percentual: 15.2 },
      { bandeira: 'Outras', percentual: 5.2 },
    ],
  };
}

function fotosSemente(proposalId: string, quantas: number, quando: string): BackendPostoPhoto[] {
  const nomes: Array<[string, string, number]> = [
    ['fachada-do-posto.jpg', 'image/jpeg', 2_481_204],
    ['pista-de-abastecimento.jpg', 'image/jpeg', 3_102_877],
    ['testeira-e-totem.png', 'image/png', 1_288_431],
    ['loja-de-conveniencia.jpg', 'image/jpeg', 2_004_119],
    ['levantamento-fotografico.pdf', 'application/pdf', 4_812_330],
  ];
  return nomes.slice(0, quantas).map(([fileName, mimeType, sizeBytes], i) => ({
    id: `foto-${proposalId}-${i + 1}`,
    fileName,
    mimeType,
    sizeBytes,
    createdAt: quando,
  }));
}

/** Estado vazio (proposta nova, ou de franquia criada por outro domínio). */
export function estadoVazio(dados: DadosProposta, verbaBp = 0): EstadoProposta {
  return {
    dados,
    produtos: [],
    recursos: [],
    investimentos: [],
    itens: [],
    situacao: null,
    fotos: [],
    inteligencia: null,
    indicadores: null,
    calculoIniciadoEm: null,
    ajustes: {},
    verbaBp,
    registradoZfpj: true,
  };
}

function sementeDe(o: OportunidadeElenco, p: PropostaElenco): EstadoProposta {
  const perfil = PERFIS[p.id];
  const criada = addDias(o.criadaEm.slice(0, 10), 1);
  const quando = `${criada}T14:20:00.000Z`;
  const inicio = primeiroDoMesSeguinte(o.criadaEm);
  const fim = ultimoDoMes(addMeses(inicio, 59));
  if (!perfil) {
    return estadoVazio(
      dadosIniciais(o, p, { finalidade: Finalidade.Vinculacao, tipoContrato: TipoContrato.CpcvmVolume, aceleraMais: true, possuiInvestimentos: false }, quando, inicio, fim),
    );
  }
  const dados = dadosIniciais(o, p, perfil, quando, inicio, fim);
  const e = estadoVazio(dados);
  if (perfil.nivel === 'franquia') {
    e.fotos = fotosSemente(p.id, 2, quando);
    return e;
  }

  const cliente = clientePorSap(o.clienteSap);
  const base = cliente ? baseSugeridaDaUf(cliente.uf) : undefined;
  // Sem centro sugerido (Litoral Sul) o LT escolheu a base vizinha à mão.
  const baseCodigo = base?.code ?? '5082';
  const baseNome = base?.name ?? 'Base Itajaí';
  const maturacao = perfil.situacao !== SituacaoPosto.EmOperacao;
  const vmm = o.vmm * (perfil.fatorVolume ?? 1);
  const desconto = perfil.descontoMargem ?? 0;

  // ── Situação, fotos, inteligência ──
  e.situacao = situacaoSemente(o, p.id, perfil, quando);
  if (perfil.nivel === 'parcial') {
    e.produtos = [linha(`pl-${p.id}-1`, p.id, '7401', Math.round(vmm * 0.45), baseCodigo, baseNome, inicio, fim, quando, 0, maturacao)];
    e.itens = [
      itemDoTipo(`fi-${p.id}-doc`, p.id, 'fit-doc', inicio, fim, quando),
      itemDoTipo(`fi-${p.id}-amb`, p.id, 'fit-ambiental', inicio, fim, quando),
    ];
    return e;
  }
  e.fotos = fotosSemente(p.id, p.id === 'prp-008a' ? 5 : p.id.startsWith('prp-002') ? 2 : 4, quando);
  e.inteligencia = inteligenciaSemente(o, `${addDias(criada, 1)}T10:05:00.000Z`);

  // ── Produtos (mix do posto sobre o VMM) ──
  e.produtos = PRODUTOS.filter((x) => x.mix > 0).map((x, i) =>
    linha(`pl-${p.id}-${i + 1}`, p.id, x.codigo, Math.round(vmm * x.mix), baseCodigo, baseNome, inicio, fim, quando, desconto, maturacao),
  );
  if (p.id === 'prp-004a') {
    // O volume de Diesel S10 que a SNEG apontou como acima do histórico.
    e.produtos = e.produtos.map((l) => (l.produtoCodigo === '7420' ? derivarLinha({ ...l, volume: Math.round(l.volume * 1.6) }) : l));
  }

  // ── Recursos financeiros ──
  const valor = p.valorEstimado;
  if (perfil.recursos === 'vinculacao' || perfil.recursos === 'vinculacao-mutuo') {
    const parteMutuo = perfil.recursos === 'vinculacao-mutuo' ? 0.2 : 0;
    e.recursos.push(
      recursoVazio(
        `fr-${p.id}-1`,
        p.id,
        {
          tipoRegistro: TipoRegistroRecursoFinanceiro.Antecipada,
          tipoBonificacao: 'ANTECIPADA',
          finalidadeRecurso: FinalidadeRecurso.Vinculacao,
          etapaLiberacao: EtapaLiberacaoRecurso.AposAssinaturaDoContratoEEfetivacaoDasGarantias,
          dataLiberacao: addMeses(inicio, 1),
          qtdParcelas: 1,
          valorParcela: Math.round(valor * (0.55 - parteMutuo)),
          periodicidade: PeriodicidadeRecurso.Unica,
        },
        quando,
      ),
      recursoVazio(
        `fr-${p.id}-2`,
        p.id,
        {
          tipoRegistro: TipoRegistroRecursoFinanceiro.Desempenho,
          tipoBonificacao: 'POR_DESEMPENHO',
          finalidadeRecurso: FinalidadeRecurso.CumprimentoDoVolumeContratado,
          etapaLiberacao: EtapaLiberacaoRecurso.AposCumprimentoDoVolumeContratado,
          dataLiberacao: addMeses(inicio, 6),
          qtdParcelas: 10,
          valorParcela: Math.round((valor * 0.45) / 10),
          periodicidade: PeriodicidadeRecurso.Semestral,
        },
        quando,
      ),
    );
    if (parteMutuo > 0) {
      e.recursos.push(
        recursoVazio(
          `fr-${p.id}-3`,
          p.id,
          {
            tipoRegistro: TipoRegistroRecursoFinanceiro.Mutuo,
            finalidadeRecurso: FinalidadeRecurso.ReformaDoPosto,
            etapaLiberacao: EtapaLiberacaoRecurso.AposAssinaturaDoContratoEEfetivacaoDasGarantias,
            dataLiberacao: addMeses(inicio, 1),
            qtdParcelas: 1,
            valorParcela: Math.round(valor * parteMutuo),
            periodicidade: PeriodicidadeRecurso.Unica,
            indiceCorrecaoParcela: IndiceCorrecao.Igpm,
            carenciaMeses: 6,
            jurosPercentual: 1,
            qtdPrestacoes: 48,
          },
          quando,
        ),
      );
    }
  }
  const obra = perfil.obra ? obraDoCatalogo(o.clienteSap, perfil.obra) : undefined;
  if (perfil.recursos === 'obra' && obra) {
    e.recursos = recursosDaObra(
      p.id,
      obra,
      {
        tipoRegistro: TipoRegistroRecursoFinanceiro.Antecipada,
        tipoBonificacao: 'ANTECIPADA',
        finalidadeRecurso:
          perfil.finalidade === Finalidade.Implantacao ? FinalidadeRecurso.ConstrucaoDoPosto : FinalidadeRecurso.ReformaDoPosto,
      },
      addMeses(inicio, 1),
      0,
      quando,
      (i) => `fr-${p.id}-obra-${i + 1}`,
    );
    e.recursos.push(
      recursoVazio(
        `fr-${p.id}-desempenho`,
        p.id,
        {
          tipoRegistro: TipoRegistroRecursoFinanceiro.Desempenho,
          tipoBonificacao: 'POR_DESEMPENHO',
          finalidadeRecurso: FinalidadeRecurso.CumprimentoDoVolumeContratado,
          etapaLiberacao: EtapaLiberacaoRecurso.AposCumprimentoDoVolumeContratado,
          dataLiberacao: addMeses(inicio, 12),
          qtdParcelas: 8,
          valorParcela: Math.round((valor * 0.4) / 8),
          periodicidade: PeriodicidadeRecurso.Semestral,
        },
        quando,
      ),
    );
  }

  // ── Investimentos ──
  if (perfil.investimentos === 'benfeitorias') {
    e.investimentos = [
      investimentoVazio(`inv-${p.id}-1`, p.id, {
        descricao: 'Reforma da cobertura da pista',
        dataInvestimento: addMeses(inicio, 2),
        tipo: 'Benfeitorias',
        vidaUtilFiscalMeses: 120,
        detalhamentoItem: 'Cobertura metálica, calhas e iluminação LED',
        valorUnitario: 186_000,
        negociacaoOriginal: true,
      }, quando),
      investimentoVazio(`inv-${p.id}-2`, p.id, {
        descricao: 'Troca das bombas medidoras',
        dataInvestimento: addMeses(inicio, 3),
        tipo: 'Equipamentos',
        vidaUtilFiscalMeses: 120,
        detalhamentoItem: 'Bombas eletrônicas de 4 bicos',
        valorUnitario: 62_000,
        quantidade: 4,
        custoInstalacao: 8_500,
        valorResidualContabil: 0,
        vidaUtilContabilMeses: 120,
        equipamentoUsado: false,
        venderParaCliente: false,
      }, quando),
    ];
  }
  if (perfil.investimentos === 'imagem') {
    e.investimentos = [
      investimentoVazio(`inv-${p.id}-1`, p.id, {
        descricao: 'Nova testeira e totem de preços',
        dataInvestimento: addMeses(inicio, 1),
        tipo: 'Imagem / comunicação visual',
        vidaUtilFiscalMeses: 60,
        detalhamentoItem: 'Testeira em ACM com LED e totem de 9 m',
        valorUnitario: 148_500,
      }, quando),
    ];
  }

  // ── Receitas e despesas ──
  e.itens = [
    itemDoTipo(`fi-${p.id}-doc`, p.id, 'fit-doc', inicio, fim, quando),
    itemDoTipo(`fi-${p.id}-amb`, p.id, 'fit-ambiental', inicio, fim, quando),
    itemDoTipo(`fi-${p.id}-clum`, p.id, 'fit-clum', inicio, fim, quando, 1_850),
    itemDoTipo(`fi-${p.id}-manut`, p.id, 'fit-manut-equip', inicio, fim, quando),
  ];
  if (perfil.situacao !== SituacaoPosto.EmOperacao) {
    e.itens.push(itemDoTipo(`fi-${p.id}-fisc`, p.id, 'fit-fiscalizacao', inicio, addMeses(inicio, 11), quando, 18_400));
  }

  // ── Verba BP, ZFPJ, indicadores ──
  const totalRecursos = e.recursos.reduce((s, r) => s + r.valorTotal, 0);
  e.verbaBp = Math.round((totalRecursos * (perfil.verbaFator ?? 1.15)) / 1000) * 1000;
  e.registradoZfpj = cliente?.naRede ?? false;
  if (perfil.indicadores) {
    e.indicadores = calcularIndicadores(e, p.id, perfil.indicadores, `${addDias(criada, 3)}T16:12:00.000Z`, perfil.ajusteTir ?? 0);
  }
  return e;
}

function semente(): Record<string, EstadoProposta> {
  const todas: Record<string, EstadoProposta> = {};
  for (const o of oportunidades()) {
    for (const p of o.propostas) todas[p.id] = sementeDe(o, p);
  }
  return todas;
}

const estado = fatia<Record<string, EstadoProposta>>('propostas-dados', semente);

// ───────────────────────────── Acesso ─────────────────────────────

/** A proposta no estado compartilhado (status, código, tipo) e a oportunidade dona. */
export function localizarProposta(
  id: string,
): { proposta: PropostaElenco; oportunidade: OportunidadeElenco } | undefined {
  for (const o of oportunidades()) {
    const p = o.propostas.find((x) => x.id === id);
    if (p) return { proposta: p, oportunidade: o };
  }
  return undefined;
}

/**
 * Estado completo da proposta, ou `undefined` quando ela não existe. Proposta
 * criada por outro domínio (ex.: franquia) ganha um estado vazio na 1ª leitura.
 */
export function estadoDaProposta(id: string): EstadoProposta | undefined {
  const achado = localizarProposta(id);
  if (!achado) return undefined;
  const todas = estado();
  if (!todas[id]) todas[id] = sementeDe(achado.oportunidade, achado.proposta);
  return todas[id];
}

export function registrarEstado(id: string, e: EstadoProposta): void {
  estado()[id] = e;
}

const ESTADOS_POSTERIORES = ['EM_APROVACAO', 'EM_MINUTA', 'EM_ASSINATURA', 'EM_PAGAMENTO', 'CONCLUIDA'];

export function estadoPosteriorAAnalise(estadoOpp: string): boolean {
  return ESTADOS_POSTERIORES.includes(estadoOpp);
}

function preenchimento(e: EstadoProposta): number {
  const partes = [
    true,
    e.situacao !== null,
    e.fotos.length > 0,
    e.produtos.length > 0,
    e.itens.length > 0,
    e.dados.finalidade === Finalidade.Vinculacao || e.dados.finalidade === Finalidade.Implantacao ? e.recursos.length > 0 : true,
  ];
  return Math.round((partes.filter(Boolean).length / partes.length) * 100);
}

/** O `ProposalDto` que a BFF repassa ao browser (`GET /api/proposals/:id`). */
export function propostaDto(id: string): PropostaDto | undefined {
  const achado = localizarProposta(id);
  const e = estadoDaProposta(id);
  if (!achado || !e) return undefined;
  const { proposta, oportunidade: o } = achado;
  const status: ProposalStatus = proposta.status;
  const d = e.dados;
  const posterior = estadoPosteriorAAnalise(o.estado);
  const statusEditavel = status === 'EM_PREENCHIMENTO' || status === 'DEVOLVIDA';
  const editavel = !posterior && statusEditavel;
  return {
    id,
    opportunityId: o.id,
    codigo: proposta.codigo,
    tipoProposta: d.tipoProposta,
    tipoContrato: d.tipoContrato,
    finalidade: d.finalidade,
    dataInicioAnalise: d.dataInicioAnalise,
    dataFimAnalise: d.dataFimAnalise,
    prazoContratoMeses: mesesEntre(d.dataInicioAnalise, d.dataFimAnalise),
    possuiInvestimentos: d.possuiInvestimentos,
    aceleraMais: d.aceleraMais,
    postoRef: d.postoRef,
    areaUsuario: d.areaUsuario,
    centroLucro: d.centroLucro,
    supplyCenterCode: d.supplyCenterCode,
    incotermPadrao: d.incotermPadrao,
    // Medido: o Salesforce não tem o prazo padrão do cliente — sempre `null`.
    prazoPagamentoPadrao: null,
    status,
    motivoDevolucao: status === 'DEVOLVIDA' ? d.motivoDevolucao : null,
    devolvidaEm: status === 'DEVOLVIDA' ? d.devolvidaEm : null,
    reenvioHabilitado: status === 'DEVOLVIDA' && o.estado === 'EM_ANALISE',
    editavel,
    motivoEdicaoBloqueada: editavel
      ? null
      : posterior
        ? `a oportunidade já saiu da fase de análise (estado atual: ${o.estado}) — a proposta é somente leitura a partir daqui`
        : `a proposta está em análise (status atual: ${status})`,
    analiseEmCurso: status === 'EM_ANALISE' && o.estado === 'EM_ANALISE',
    criadoPorId: d.criadoPorId,
    requiresManagerApproval: !d.aceleraMais,
    minutaPadrao: d.minutaPadrao,
    netlexConsultaCodigo: d.netlexConsultaCodigo,
    netlexConsultaStatus: d.netlexConsultaCodigo ? 'CONCLUIDA' : null,
    preenchimentoPercent: preenchimento(e),
    eleita: proposta.eleita,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

/** Marca os indicadores como desatualizados após uma edição financeira (HU-12.1). */
export function marcarDesatualizado(e: EstadoProposta): void {
  if (e.indicadores && e.indicadores.status === 'atualizado') {
    e.indicadores = { ...e.indicadores, status: 'desatualizado', updatedAt: new Date().toISOString() };
  }
  e.dados.updatedAt = new Date().toISOString();
}
