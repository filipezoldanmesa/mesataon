import type { BackendDdi } from '@/lib/opportunities/ddi-mapping';
import type {
  Parecer,
  ParecerIndicador,
  ParecerMarcacoesAderencia,
  ParecerRecomendacao,
  ParecerVersaoEntry,
} from '@/lib/opportunities/parecer.types';
import type { PerfilCredito } from '@/lib/perfil-credito/types';

import type { ClienteElenco, OportunidadeElenco } from '../../elenco';

/**
 * Sementes do domínio `analise` (análise SNEG, parecer, DDI, perfil de crédito,
 * alçada e aprovação). Tudo FICTÍCIO e coerente com a fase de cada oportunidade
 * do elenco: opp-001/002 sem análise; opp-003 parecer em rascunho e DDI aguardando
 * a Integridade; opp-004 devolvida; opp-005 franquia em análise; opp-006 em
 * aprovação; opp-007+ análise concluída e parecer emitido.
 */

// ---------------------------------------------------------------------------
// Números econômicos por oportunidade (o "retrato" do ARP que o parecer congela)
// ---------------------------------------------------------------------------

export interface NumerosOportunidade {
  /** Fração (0,162 = 16,2%) — o domínio guarda fração. */
  tir: number;
  vpl: number;
  /** TMA já em percentual (contrato do domínio). */
  tma: number;
  paybackMeses: number;
  prazoMeses: number;
  /** R$/m³ — não é percentual. */
  margemMedia: number;
  /** Fração do recurso pago antecipado. */
  antecipacao: number;
  /** Saldo devedor volumétrico de contrato anterior (m³). */
  saldoDevedor: number;
}

export const NUMEROS: Record<string, NumerosOportunidade> = {
  'opp-001': { tir: 0.162, vpl: 640_000, tma: 11.5, paybackMeses: 38, prazoMeses: 60, margemMedia: 286.4, antecipacao: 0.3, saldoDevedor: 0 },
  'opp-002': { tir: 0.141, vpl: 910_000, tma: 11.5, paybackMeses: 44, prazoMeses: 60, margemMedia: 271.9, antecipacao: 0.28, saldoDevedor: 1_200 },
  'opp-003': { tir: 0.118, vpl: 380_000, tma: 11.5, paybackMeses: 52, prazoMeses: 60, margemMedia: 255.3, antecipacao: 0.42, saldoDevedor: 0 },
  'opp-004': { tir: 0.135, vpl: 520_000, tma: 11.5, paybackMeses: 47, prazoMeses: 48, margemMedia: 262.0, antecipacao: 0.33, saldoDevedor: 2_350 },
  'opp-005': { tir: 0.172, vpl: 310_000, tma: 11.5, paybackMeses: 34, prazoMeses: 60, margemMedia: 301.7, antecipacao: 0.25, saldoDevedor: 0 },
  'opp-006': { tir: 0.128, vpl: 1_150_000, tma: 11.5, paybackMeses: 49, prazoMeses: 72, margemMedia: 248.6, antecipacao: 0.38, saldoDevedor: 0 },
  'opp-007': { tir: 0.151, vpl: 990_000, tma: 11.5, paybackMeses: 41, prazoMeses: 60, margemMedia: 279.2, antecipacao: 0.31, saldoDevedor: 3_100 },
  'opp-008': { tir: 0.124, vpl: 1_420_000, tma: 11.5, paybackMeses: 55, prazoMeses: 84, margemMedia: 252.8, antecipacao: 0.36, saldoDevedor: 0 },
  'opp-009': { tir: 0.19, vpl: 760_000, tma: 11.5, paybackMeses: 30, prazoMeses: 48, margemMedia: 312.5, antecipacao: 0.22, saldoDevedor: 900 },
  'opp-010': { tir: 0.147, vpl: 1_040_000, tma: 11.5, paybackMeses: 42, prazoMeses: 60, margemMedia: 283.1, antecipacao: 0.3, saldoDevedor: 0 },
};

/** Oportunidade criada em tempo de execução (fora do elenco) cai num retrato neutro. */
export function numerosDe(id: string): NumerosOportunidade {
  return NUMEROS[id] ?? { tir: 0.14, vpl: 500_000, tma: 11.5, paybackMeses: 45, prazoMeses: 60, margemMedia: 275, antecipacao: 0.3, saldoDevedor: 0 };
}

/** Referências do padrão de BP (metas da parametrização). */
export const META_BP = {
  negocio: 'Contratação PCR',
  metaPercentualAntecipacao: 0.35,
  metaPercentualPostecipacao: 0.65,
  metaCustoVinculacaoUnitario: 130,
};

export const TIR_MINIMA = 0.12;
export const VOLUME_MINIMO = 250;
export const PAYBACK_MAXIMO = 60;
export const MARGEM_REFERENCIA = 270;

export function custoVinculacao(o: OportunidadeElenco, n: NumerosOportunidade): number {
  return Math.round((o.valorEstimado / (o.vmm * n.prazoMeses)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Regional / gerência por UF
// ---------------------------------------------------------------------------

const REGIONAL_UF: Record<string, string> = {
  SP: 'SP Interior / DCVIM',
  MG: 'MG Metropolitana / DCVIM',
  SC: 'Sul Litoral / DCVIM',
  GO: 'Centro-Oeste / DCVIM',
  BA: 'Nordeste / DCVIM',
  ES: 'Leste / DCVIM',
  DF: 'Centro-Oeste / DCVIM',
  RS: 'Sul / DCVIM',
};

export function regionalDe(c: ClienteElenco | undefined): string | null {
  return c ? (REGIONAL_UF[c.uf] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Ids estáveis (a BFF valida o id de versão do parecer como UUID)
// ---------------------------------------------------------------------------

export function uuidSemente(grupo: number, n: number): string {
  return `5eed${String(grupo).padStart(4, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function numeroDaOpp(id: string): number {
  return Number(id.replace(/\D/g, '')) || 0;
}

/** Id da Opportunity no org (fictício; prefixo `006`). */
export function sfOpportunityId(oppId: string): string {
  return `006EX00000${String(numeroDaOpp(oppId)).padStart(5, '0')}AAA`;
}

/** Sequencial que o org grava em `Opportunity.Name` (fictício). */
export function sfCodigo(oppId: string): string {
  return `45${String(numeroDaOpp(oppId)).padStart(5, '0')}`;
}

export function sfQuoteId(proposalId: string): string {
  const n = numeroDaOpp(proposalId);
  const sufixo = proposalId.slice(-1).charCodeAt(0) - 96;
  return `0Q0EX0000${String(n).padStart(4, '0')}${Math.max(0, sufixo)}AAA`;
}

export const SF_BASE = 'https://exemplo-vibra--uat.sandbox.my.salesforce.com/lightning/r';

// ---------------------------------------------------------------------------
// DDI — contrato do BACKEND (pt-BR); a rota mapeia com `mapDdiResult`
// ---------------------------------------------------------------------------

const DDI_RACIONAL_MEDIO =
  'Sócio minoritário com participação em empresa com processo administrativo ambiental encerrado em 2023; demais critérios sem apontamentos.';

export function ddiSementes(): Record<string, BackendDdi> {
  const base = (id: string, parcial: Partial<BackendDdi>): BackendDdi => ({
    opportunityId: id,
    status: 'CONCLUIDA',
    emTratativa: false,
    risco: 'BAIXO',
    riscoMotor: 'BAIXO',
    score: 86,
    racional: 'Nenhum apontamento relevante nas bases consultadas (sanções, PEP, mídia negativa, processos).',
    criterios: ['Listas de sanções', 'Pessoas expostas politicamente', 'Mídia negativa', 'Processos judiciais'],
    achados: [],
    parecerIntegridade: null,
    ltDecisao: null,
    ltJustificativa: null,
    ltMotivoRevisao: null,
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...parcial,
  });

  return {
    'opp-001': base('opp-001', {
      status: 'EM_ANDAMENTO',
      risco: null,
      riscoMotor: null,
      score: null,
      racional: null,
      criterios: null,
      updatedAt: '2026-09-22T13:12:00.000Z',
    }),
    'opp-002': base('opp-002', { score: 88, updatedAt: '2026-09-10T11:20:00.000Z' }),
    'opp-003': base('opp-003', {
      status: 'PENDENTE_PARECER',
      emTratativa: true,
      risco: 'MEDIO',
      riscoMotor: 'MEDIO',
      score: 62,
      racional: DDI_RACIONAL_MEDIO,
      achados: [
        { descricao: 'Sócio com participação em empresa citada em processo administrativo ambiental (encerrado em 2023).', gravidade: 'MEDIO' },
        { descricao: 'Menção em mídia regional sobre atraso de obra em 2022, sem desdobramento judicial.', gravidade: 'BAIXO' },
      ],
      updatedAt: '2026-08-29T09:40:00.000Z',
    }),
    'opp-004': base('opp-004', {
      status: 'LIBERADA',
      risco: 'MEDIO',
      riscoMotor: 'MEDIO',
      score: 66,
      racional: DDI_RACIONAL_MEDIO,
      achados: [{ descricao: 'Protesto de título quitado em 2024 em nome de empresa do grupo.', gravidade: 'MEDIO' }],
      parecerIntegridade:
        'Apontamento já regularizado, com certidão de quitação apresentada. Liberada sem cláusulas adicionais.',
      updatedAt: '2026-08-18T15:05:00.000Z',
    }),
    'opp-005': base('opp-005', { score: 91, updatedAt: '2026-08-21T10:00:00.000Z' }),
    'opp-006': base('opp-006', {
      status: 'LIBERADA',
      risco: 'MEDIO',
      riscoMotor: 'ALTO',
      score: 58,
      racional: 'Grupo econômico com dois processos trabalhistas em andamento e um sócio com restrição cadastral regularizada.',
      achados: [
        { descricao: 'Dois processos trabalhistas em andamento contra empresa do grupo.', gravidade: 'MEDIO' },
        { descricao: 'Restrição cadastral de sócio, regularizada em 2025.', gravidade: 'BAIXO' },
      ],
      parecerIntegridade:
        'Risco reclassificado para MÉDIO após análise documental: processos trabalhistas sem relação com a atividade de revenda. Liberada.',
      updatedAt: '2026-08-02T14:30:00.000Z',
    }),
    'opp-007': base('opp-007', { score: 84, updatedAt: '2026-07-14T10:00:00.000Z' }),
    'opp-008': base('opp-008', {
      status: 'LIBERADA',
      risco: 'ALTO',
      riscoMotor: 'ALTO',
      score: 41,
      racional: 'Sócio administrador citado em investigação por sonegação fiscal (sem denúncia formal).',
      achados: [{ descricao: 'Sócio administrador citado em investigação fiscal estadual, sem denúncia formal.', gravidade: 'ALTO' }],
      parecerIntegridade:
        'Risco ALTO mantido. Seguir somente com cláusula anticorrupção reforçada e declaração de conformidade fiscal do sócio.',
      ltDecisao: 'seguir_com_clausulas',
      ltJustificativa: 'Cliente aceitou a cláusula reforçada e apresentou a declaração de conformidade fiscal.',
      updatedAt: '2026-06-30T16:45:00.000Z',
    }),
    'opp-009': base('opp-009', { score: 90, updatedAt: '2026-05-20T10:00:00.000Z' }),
    'opp-010': base('opp-010', { score: 87, updatedAt: '2026-03-04T10:00:00.000Z' }),
  };
}

/** DDI nova (oportunidade criada em tempo de execução): roda na criação. */
export function ddiNova(id: string): BackendDdi {
  return {
    opportunityId: id,
    status: 'EM_ANDAMENTO',
    emTratativa: false,
    risco: null,
    riscoMotor: null,
    score: null,
    racional: null,
    criterios: null,
    achados: [],
    parecerIntegridade: null,
    ltDecisao: null,
    ltJustificativa: null,
    ltMotivoRevisao: null,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Perfil de crédito (análise do Brax) — `null` = concessão não exige (204)
// ---------------------------------------------------------------------------

function perfilConcluido(
  classificacao: 'BAIXO' | 'MEDIO' | 'ALTO',
  data: string,
  restricoes: string,
  historico: string,
  atraso: string,
): PerfilCredito {
  const pill = classificacao === 'BAIXO' ? 'success' : classificacao === 'MEDIO' ? 'warning' : 'danger';
  return {
    status: 'CONCLUIDO',
    classificacao,
    classificacaoPill: pill,
    secoes: [
      { rotulo: 'Risco', valor: classificacao },
      { rotulo: 'POC', valor: classificacao === 'ALTO' ? 'Exige garantia real' : 'Dentro da política de crédito' },
      { rotulo: 'Restrições', valor: restricoes },
      { rotulo: 'Histórico com a VIBRA', valor: historico },
      { rotulo: 'Média de atraso', valor: atraso },
    ],
    observacao: `Levantamento realizado com base nos dados obtidos em ${new Date(data).toLocaleDateString('pt-BR')}.`,
    dataLevantamento: data,
    motivoEncerramentoLabel: null,
    gaps: [],
    bloqueiaFluxo: false,
  };
}

export const PERFIS_CREDITO: Record<string, PerfilCredito | null> = {
  'opp-001': {
    status: 'PENDENTE',
    classificacao: null,
    classificacaoPill: null,
    secoes: [],
    observacao: null,
    dataLevantamento: null,
    motivoEncerramentoLabel: null,
    gaps: [],
    bloqueiaFluxo: false,
  },
  'opp-002': null,
  'opp-003': perfilConcluido('MEDIO', '2026-08-30T10:00:00.000Z', '1 apontamento no valor de R$ 4.380,00', 'Cliente da rede desde 2019, 2 atrasos pontuais em 2025', '6 dias'),
  'opp-004': perfilConcluido('BAIXO', '2026-08-17T10:00:00.000Z', 'Sem débitos vencidos', 'Cliente da rede desde 2012, sem atrasos', '0 dias'),
  'opp-005': perfilConcluido('ALTO', '2026-08-22T10:00:00.000Z', '3 apontamentos no valor de R$ 27.910,00', 'Sem histórico com a VIBRA', 'Não se aplica'),
  'opp-006': perfilConcluido('BAIXO', '2026-08-01T10:00:00.000Z', 'Sem débitos vencidos', 'Cliente da rede desde 2015, sem atrasos', '1 dia'),
  'opp-007': perfilConcluido('MEDIO', '2026-07-15T10:00:00.000Z', '1 apontamento no valor de R$ 1.250,00', 'Cliente da rede desde 2017', '4 dias'),
  'opp-008': perfilConcluido('BAIXO', '2026-06-27T10:00:00.000Z', 'Sem débitos vencidos', 'Cliente da rede desde 2010, sem atrasos', '0 dias'),
  'opp-009': perfilConcluido('BAIXO', '2026-05-20T10:00:00.000Z', 'Sem débitos vencidos', 'Cliente da rede desde 2012, sem atrasos', '0 dias'),
  'opp-010': perfilConcluido('BAIXO', '2026-03-04T10:00:00.000Z', 'Sem débitos vencidos', 'Cliente da rede desde 2008, sem atrasos', '0 dias'),
};

// ---------------------------------------------------------------------------
// Cadeia de alçada simulada (nomes de nível como o ORG os chama)
// ---------------------------------------------------------------------------

export interface NivelSimulado {
  competenceLevelName: string;
  step: number;
  hierarchyLevel: number;
  reasons: string[];
}

/** Quem aprova cada nível (nomes fictícios). */
export const APROVADOR_DO_NIVEL: Record<string, string> = {
  SNEG: 'Carla Mendes',
  Gerência: 'Henrique Barros',
  Diretoria: 'Patrícia Moura',
  VPCVIM: 'Rogério Tavares',
  VFCRI: 'Bruno Carvalho',
  'Gerentes BR Mania': 'João Vieira',
};

export function niveisSimulados(o: OportunidadeElenco): NivelSimulado[] {
  if (o.id === 'opp-006') {
    // O cenário do elenco: Gerente Varejo aprovou, BP Financeiro pendente.
    return [
      { competenceLevelName: 'SNEG', step: 1, hierarchyLevel: 0, reasons: ['Regra Geral'] },
      { competenceLevelName: 'Gerência', step: 2, hierarchyLevel: 1, reasons: ['Retroatividade', 'Regra Geral'] },
      { competenceLevelName: 'VFCRI', step: 3, hierarchyLevel: 3.2, reasons: ['Valor da TIR', 'Exposição financeira'] },
    ];
  }
  const niveis: NivelSimulado[] = [
    { competenceLevelName: 'SNEG', step: 1, hierarchyLevel: 0, reasons: ['Regra Geral'] },
  ];
  if (o.propostas.some((p) => p.tipo === 'ZBRM')) {
    niveis.push({ competenceLevelName: 'Gerentes BR Mania', step: niveis.length + 1, hierarchyLevel: 0.2, reasons: ['Franquia BR Mania eleita'] });
  }
  niveis.push({ competenceLevelName: 'Gerência', step: niveis.length + 1, hierarchyLevel: 1, reasons: ['Regra Geral'] });
  if (o.valorEstimado > 3_000_000) {
    niveis.push({ competenceLevelName: 'Diretoria', step: niveis.length + 1, hierarchyLevel: 2, reasons: ['Alçada intermediária'] });
  }
  if (o.valorEstimado > 6_000_000) {
    niveis.push({ competenceLevelName: 'VFCRI', step: niveis.length + 1, hierarchyLevel: 3.2, reasons: ['Valor da TIR'] });
  }
  return niveis;
}

// ---------------------------------------------------------------------------
// Parecer técnico
// ---------------------------------------------------------------------------

/** Os campos editáveis pelo analista (os que o `emitir` exige preenchidos). */
export interface EditaveisParecer {
  briefing: string | null;
  marcacoesAderencia: ParecerMarcacoesAderencia | null;
  analiseAderencia: string | null;
  justificativaAlcada: string | null;
  recomendacao: ParecerRecomendacao | null;
  pontosAtencao: string | null;
  outrasInformacoes: string | null;
}

export const EDITAVEIS_VAZIOS: EditaveisParecer = {
  briefing: null,
  marcacoesAderencia: null,
  analiseAderencia: null,
  justificativaAlcada: null,
  recomendacao: null,
  pontosAtencao: null,
  outrasInformacoes: null,
};

const fmtBrl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Um parecer inteiro preenchido — o que um analista escreveria. */
export function editaveisCompletos(o: OportunidadeElenco, c: ClienteElenco | undefined): EditaveisParecer {
  const n = numerosDe(o.id);
  const nome = c?.nomeFantasia ?? o.titulo;
  const comExcecao = n.antecipacao > META_BP.metaPercentualAntecipacao || n.tir < TIR_MINIMA;
  return {
    briefing:
      `${o.finalidade} do ${nome} (${c?.cidade ?? '—'}/${c?.uf ?? '—'}) com VMM de ${o.vmm} m³/mês por ${n.prazoMeses} meses ` +
      `e recurso financeiro de ${fmtBrl(o.valorEstimado)}, ${Math.round(n.antecipacao * 100)}% antecipado.`,
    marcacoesAderencia: {
      padraoComercial: 'sim',
      politicaComercial: comExcecao ? 'nao' : 'sim',
      orcamentoVpFin: 'sim',
    },
    analiseAderencia: comExcecao
      ? 'Negociação fora da política em um ponto: mix de antecipação acima do orçado. Demais premissas aderentes.'
      : 'Negociação aderente à política comercial DCVIM 2026, sem exceções.',
    justificativaAlcada: comExcecao
      ? 'Alçada elevada pela exceção de mix antecipado, compensada pelo volume e pelo histórico do cliente.'
      : 'Alçada conforme a regra geral da política para o valor do recurso.',
    recomendacao: {
      nota: 'aprovar',
      parecerExecutivo: `Recomendamos a aprovação. Indicadores dentro da faixa esperada (TIR ${(n.tir * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%) e garantia compatível com a exposição.`,
    },
    pontosAtencao: 'Acompanhar o volume dos 6 primeiros meses frente ao VMM negociado.',
    outrasInformacoes: 'Cliente com bom relacionamento com a regional; visita técnica realizada.',
  };
}

export interface MetaParecer {
  id: string;
  versao: number;
  status: Parecer['status'];
  createdAt: string;
  updatedAt: string;
}

/**
 * Monta o parecer como o backend o gera por regra + template (`POST :gerar`):
 * cabeçalho, resumo, indicadores e aderência vêm do retrato da oportunidade; os
 * editáveis vêm de quem escreveu. `alcadaSugerida` é resolvida na LEITURA.
 */
export function montarParecer(
  o: OportunidadeElenco,
  c: ClienteElenco | undefined,
  meta: MetaParecer,
  ed: EditaveisParecer,
): Parecer {
  const n = numerosDe(o.id);
  const custo = custoVinculacao(o, n);
  const bruto = o.vmm * n.prazoMeses;
  const sit = (excecao: boolean): ParecerIndicador['situacao'] => (excecao ? 'excecao' : 'padrao');

  const indicadores: ParecerIndicador[] = [
    { nome: 'VMM (m³/mês)', valorNegociado: o.vmm, valorReferencia: VOLUME_MINIMO, situacao: sit(o.vmm < VOLUME_MINIMO) },
    { nome: 'Margem média (R$/m³)', valorNegociado: n.margemMedia, valorReferencia: MARGEM_REFERENCIA, situacao: sit(n.margemMedia < MARGEM_REFERENCIA) },
    { nome: 'Tempo de contrato (meses)', valorNegociado: n.prazoMeses, valorReferencia: 60, situacao: sit(n.prazoMeses > 60) },
    { nome: 'Custo de vinculação líquido (R$/m³)', valorNegociado: custo, valorReferencia: META_BP.metaCustoVinculacaoUnitario, situacao: sit(custo > META_BP.metaCustoVinculacaoUnitario) },
    { nome: '% Antecipação', valorNegociado: n.antecipacao, valorReferencia: META_BP.metaPercentualAntecipacao, situacao: sit(n.antecipacao > META_BP.metaPercentualAntecipacao) },
    { nome: 'TIR', valorNegociado: n.tir, valorReferencia: TIR_MINIMA, situacao: sit(n.tir < TIR_MINIMA) },
    { nome: 'VPL', valorNegociado: n.vpl, valorReferencia: 0, situacao: sit(n.vpl < 0) },
    { nome: 'TMA', valorNegociado: n.tma, valorReferencia: null, situacao: null },
    { nome: 'Volume global bruto (m³)', valorNegociado: bruto, valorReferencia: null, situacao: null },
    { nome: '(−) Saldo devedor volumétrico (m³)', valorNegociado: n.saldoDevedor, valorReferencia: null, situacao: null },
    { nome: 'Volume líquido considerado (m³)', valorNegociado: bruto - n.saldoDevedor, valorReferencia: null, situacao: null },
    { nome: 'Investimento total (R$)', valorNegociado: o.valorEstimado, valorReferencia: null, situacao: null },
    { nome: 'Mix postecipada (%)', valorNegociado: Math.round((1 - n.antecipacao) * 100) / 100, valorReferencia: META_BP.metaPercentualPostecipacao, situacao: null },
  ];

  const excecoes = indicadores.filter((i) => i.situacao === 'excecao').map((i) => `${i.nome} fora do padrão`);
  const franquia = o.propostas.find((p) => p.tipo === 'ZBRM' || p.tipo === 'ZLUB');

  return {
    id: meta.id,
    opportunityId: o.id,
    versao: meta.versao,
    status: meta.status,
    cabecalho: {
      oportunidadeNumero: o.code,
      tipoNegociacao: `Contratação · ${o.finalidade}`,
      posto: c ? `${c.nomeFantasia} · ${c.grupoEconomico}` : null,
      localizacao: c ? `${c.cidade}/${c.uf}` : null,
      regional: regionalDe(c) ? `${regionalDe(c)} · Henrique Barros` : null,
      gerenteVendas: 'Henrique Barros',
      dataGeracao: meta.createdAt,
    },
    resumoNegociacao: {
      volume: o.vmm,
      prazo: n.prazoMeses,
      recursoFinanceiro: o.valorEstimado,
      antecipacao: Math.round(o.valorEstimado * n.antecipacao),
      postecipacao: Math.round(o.valorEstimado * (1 - n.antecipacao)),
      briefing: ed.briefing,
    },
    volumeEqualizacao: {
      volumeNegociado: o.vmm,
      volumeReferencia: Math.round(o.vmm * 0.9),
      equalizacao: o.vmm - Math.round(o.vmm * 0.9),
      observacoes: null,
    },
    indicadores,
    franquiasGarantias: {
      franquia: franquia ? (franquia.tipo === 'ZBRM' ? 'BR Mania' : 'Lubrax+') : null,
      garantia: o.valorEstimado > 4_000_000 ? 'Hipoteca do imóvel do posto' : 'Fiança bancária',
      observacoes: null,
    },
    aderenciaPolitica: { excecoes, aderente: excecoes.length === 0, observacoes: null },
    alcadaSugerida: null,
    marcacoesAderencia: ed.marcacoesAderencia,
    analiseAderencia: ed.analiseAderencia,
    justificativaAlcada: ed.justificativaAlcada,
    recomendacao: ed.recomendacao,
    pontosAtencao: ed.pontosAtencao,
    outrasInformacoes: ed.outrasInformacoes,
    fontes: ['ARP · indicadores econômicos da proposta eleita', 'Salesforce · cotação sincronizada', 'Política Comercial DCVIM 2026'],
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };
}

export interface RegistroParecer {
  parecer: Parecer;
  versoes: ParecerVersaoEntry[];
}

const SISTEMA = { id: 'system:parecer', nome: 'Sistema (geração automática)' };
const CARLA = { id: 'usr-sneg-carla', nome: 'Carla Mendes' };

/**
 * Pareceres iniciais. `oportunidadePorId`/`clientePorSap` chegam por parâmetro
 * para a semente não depender da ordem de import do estado vivo.
 */
export function parecerSementes(
  achar: (id: string) => { o: OportunidadeElenco; c: ClienteElenco | undefined } | undefined,
): Record<string, RegistroParecer> {
  const out: Record<string, RegistroParecer> = {};

  const registrar = (
    oppId: string,
    status: Parecer['status'],
    historico: Array<{ quando: string; motivo: 'gerado' | 'editado'; ed: EditaveisParecer }>,
  ) => {
    const achado = achar(oppId);
    if (!achado) return;
    const num = numeroDaOpp(oppId);
    const criado = historico[0].quando;
    const versoes: ParecerVersaoEntry[] = historico.map((h, i) => {
      const autor = h.motivo === 'gerado' ? SISTEMA : CARLA;
      const snapshot = montarParecer(
        achado.o,
        achado.c,
        { id: uuidSemente(num, 0), versao: i + 1, status: 'rascunho', createdAt: criado, updatedAt: h.quando },
        h.ed,
      );
      return {
        id: uuidSemente(num, i + 1),
        opportunityId: oppId,
        versao: i + 1,
        motivo: h.motivo,
        autorId: autor.id,
        autorNome: autor.nome,
        snapshot,
        createdAt: h.quando,
      };
    });
    const ultimo = historico[historico.length - 1];
    out[oppId] = {
      parecer: montarParecer(
        achado.o,
        achado.c,
        { id: uuidSemente(num, 0), versao: historico.length, status, createdAt: criado, updatedAt: ultimo.quando },
        ultimo.ed,
      ),
      versoes,
    };
  };

  const completo = (id: string) => {
    const a = achar(id);
    return a ? editaveisCompletos(a.o, a.c) : EDITAVEIS_VAZIOS;
  };

  // opp-003 — rascunho: o analista escreveu o resumo e começou a aderência.
  const c3 = completo('opp-003');
  registrar('opp-003', 'rascunho', [
    { quando: '2026-08-30T11:00:00.000Z', motivo: 'gerado', ed: EDITAVEIS_VAZIOS },
    { quando: '2026-09-02T14:20:00.000Z', motivo: 'editado', ed: { ...EDITAVEIS_VAZIOS, briefing: c3.briefing } },
    {
      quando: '2026-09-03T09:10:00.000Z',
      motivo: 'editado',
      ed: {
        ...EDITAVEIS_VAZIOS,
        briefing: c3.briefing,
        marcacoesAderencia: { padraoComercial: 'sim', politicaComercial: 'nao', orcamentoVpFin: null },
        analiseAderencia: c3.analiseAderencia,
      },
    },
  ]);

  // opp-004 — gerado e nunca editado (a proposta foi devolvida antes).
  registrar('opp-004', 'rascunho', [{ quando: '2026-08-19T10:00:00.000Z', motivo: 'gerado', ed: EDITAVEIS_VAZIOS }]);

  // opp-005 — quase pronto: faltam pontos de atenção e outras informações.
  const c5 = completo('opp-005');
  registrar('opp-005', 'rascunho', [
    { quando: '2026-08-23T10:00:00.000Z', motivo: 'gerado', ed: EDITAVEIS_VAZIOS },
    { quando: '2026-08-26T16:00:00.000Z', motivo: 'editado', ed: { ...c5, pontosAtencao: null, outrasInformacoes: null } },
  ]);

  // opp-006 em diante — emitidos.
  const emitido: Array<[string, string, string]> = [
    ['opp-006', '2026-08-03T10:00:00.000Z', '2026-08-05T17:30:00.000Z'],
    ['opp-007', '2026-07-16T10:00:00.000Z', '2026-07-18T15:00:00.000Z'],
    ['opp-008', '2026-06-29T10:00:00.000Z', '2026-07-02T11:45:00.000Z'],
    ['opp-009', '2026-05-21T10:00:00.000Z', '2026-05-23T09:30:00.000Z'],
    ['opp-010', '2026-03-05T10:00:00.000Z', '2026-03-07T14:10:00.000Z'],
  ];
  for (const [id, gerado, editado] of emitido) {
    const ed = completo(id);
    registrar(id, 'concluido', [
      { quando: gerado, motivo: 'gerado', ed: EDITAVEIS_VAZIOS },
      { quando: editado, motivo: 'editado', ed },
    ]);
  }

  return out;
}
