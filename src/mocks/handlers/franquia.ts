import type {
  CatalogoRoyalty,
  CatalogoRoyaltyList,
  CofTemplate,
  CofTemplateList,
  FormatoLoja as FormatoLojaAdmin,
  LimiteRoyaltyParametrizacao,
  LimiteRoyaltyParametrizacaoList,
  ModeloRoyalty as ModeloRoyaltyCatalogo,
  TaxaParametrizacao,
  TaxaParametrizacaoList,
} from '@/lib/franquia-admin/franquia-admin.types';
import type { UpdateDadosFranquiaResult } from '@/lib/franquia/dados.api';
import type {
  AcceptRoyaltyPremiadoResult,
  ExcecaoCreated,
  OrigemLimiteParcelas,
  RoyaltyPolicyValidacoes,
  SetMaturacaoResult,
  SetModeloLojaResult,
  SetRoyaltyEstruturaResult,
} from '@/lib/franquia/parametros.api';
import type { ParecerAntecipadoResult } from '@/lib/franquia/parecer.api';
import type { FapDocumentoUploaded, SetPotencialResult } from '@/lib/franquia/proposta-franquia.api';
import type {
  ExcecaoRoyaltyItem,
  FrqSectionResult,
  ModeloParametrosData,
  PropostaFranquiaReadModel,
  PropostaFranquiaSendbar,
  RoyaltiesCalculadosData,
  RoyaltyFaixa,
} from '@/lib/franquia/proposta-franquia-mapping';
import type {
  BandeiraFranquia,
  FormatoLoja,
  FrqPillCode,
  ModeloNegocio,
  ModeloRoyalty,
  ResultadoParecerFranquia,
  SituacaoLoja,
  StatusCof,
} from '@/lib/franquia/types';
import type { ProposalStatus } from '@/lib/opportunities/types';
import type { CreateFranquiaProposalResult } from '@/lib/proposals/franquia-proposal.types';

import { arquivoEnviado, campo, erro, json, naoEncontrado, pdf, semConteudo, semPermissao } from '../core/respostas';
import { rotas, type MockContext, type MockHandler } from '../core/router';
import { temPapel, type MockUser } from '../core/session';
import { agoraIso, fatia, novoId } from '../core/store';
import {
  BANDEIRAS_COF,
  LIMITE_POTENCIAL_PARECER_BRL,
  POLITICA_PERCENTUAL_FIXO_LUBRAX,
  SEMENTE_CATALOGO,
  SEMENTE_COF,
  SEMENTE_LIMITES,
  SEMENTE_TAXA,
  SHARE_TABACO_PARAMETRIZADO,
} from '../dados/franquia/parametrizacao';
import {
  franquiaVazia,
  SEMENTE_FRANQUIAS,
  type ExcecaoRegistro,
  type FranquiaRegistro,
} from '../dados/franquia/propostas';
import type { EstadoBackend, OportunidadeElenco, PropostaElenco } from '../elenco';
import { oportunidade, oportunidades } from '../estado-compartilhado';

// ───────────────────────────── Estado ─────────────────────────────

const franquias = fatia<FranquiaRegistro[]>('franquia-propostas', () => SEMENTE_FRANQUIAS);
const catalogo = fatia<CatalogoRoyalty[]>('franquia-catalogo', () => SEMENTE_CATALOGO);
const taxas = fatia<TaxaParametrizacao[]>('franquia-taxas', () => SEMENTE_TAXA);
const limites = fatia<LimiteRoyaltyParametrizacao[]>('franquia-limites', () => SEMENTE_LIMITES);
const cofTemplates = fatia<CofTemplate[]>('franquia-cof', () => SEMENTE_COF);

// ───────────────────────────── Papéis ─────────────────────────────
// Espelho de `franquia-write-roles.ts` e `rbac-matrix.ts` do backend.

const LT_AUTORIDADE = ['LT', 'EXPANSAO', 'SPCOM', 'TI_SUSTENTACAO'];
const PROPOSTA_WRITE = [...LT_AUTORIDADE, 'SNEG', 'BP_FINANCEIRO', 'CONSULTOR_EXPANSAO', 'ADMIN'];
const PARAMETROS_WRITE = [...PROPOSTA_WRITE, 'GESTOR_FRANQUIAS'];
const TIME_FRANQUIA = ['GESTOR_FRANQUIAS', 'CONSULTOR_EXPANSAO', 'ADMIN'];
const PARECER_DECIDE = ['GESTOR_FRANQUIAS', 'CONSULTOR_EXPANSAO', 'ADMIN'];
const PARECER_REJEITA = ['GESTOR_FRANQUIAS', 'ADMIN'];
const GOV_FRANQUIA_EXECUTAR = ['BP_FINANCEIRO', 'ADMIN', 'TI_SUSTENTACAO', 'GESTOR_FRANQUIAS'];
const GOV_FRANQUIA_VISUALIZAR = [...GOV_FRANQUIA_EXECUTAR, 'SPCOM'];

// ───────────────────────────── Vocabulário ─────────────────────────────

const BANDEIRA_LABEL: Record<BandeiraFranquia, string> = { ZBRM: 'BR Mania', ZLUB: 'Lubrax+' };
const SITUACAO_LABEL: Record<SituacaoLoja, string> = { NOVA: 'Nova', EM_OPERACAO: 'Em operação' };
const MODELO_NEGOCIO_LABEL: Record<ModeloNegocio, string> = { RODOVIA: 'Rodovia', URBANO: 'Urbano' };
const FORMATO_LABEL: Record<FormatoLoja, string> = {
  PADRAO: 'Padrão',
  PONTO: 'Ponto',
  SUPER_COMPACTA: 'Super compacta',
};
const MODELO_ROYALTY_LABEL: Record<ModeloRoyalty, string> = {
  VALOR_FIXO: 'Valor fixo',
  PERCENTUAL_UNICO: 'Percentual único',
  PERCENTUAL_ESCALONADO: 'Percentual escalonado',
  POR_CATEGORIA: 'Por categoria',
  PERCENTUAL_FIXO: 'Percentual fixo',
};
const MODELOS_CATALOGO: ModeloRoyaltyCatalogo[] = [
  'VALOR_FIXO',
  'PERCENTUAL_UNICO',
  'PERCENTUAL_ESCALONADO',
  'POR_CATEGORIA',
];
const STATUS_COF_LABEL: Record<StatusCof, string> = {
  PENDENTE: 'Pendente de disparo',
  ENVIADA: 'Enviada',
  EM_ELABORACAO: 'Em elaboração',
  AGUARDANDO_ASSINATURA: 'Aguardando assinatura',
  ASSINADO: 'Assinado',
  CANCELADO: 'Cancelado',
};
const STATUS_COF_PILL: Record<StatusCof, FrqPillCode> = {
  PENDENTE: 'w',
  ENVIADA: 's',
  EM_ELABORACAO: 'i',
  AGUARDANDO_ASSINATURA: 'w',
  ASSINADO: 's',
  CANCELADO: 'n',
};
const RESULTADO_LABEL: Record<ResultadoParecerFranquia, string> = {
  APROVADO: 'Aprovado',
  APROVADO_COM_RESSALVAS: 'Aprovado com ressalvas',
  REJEITADO: 'Rejeitado',
};
const RESULTADO_PILL: Record<ResultadoParecerFranquia, FrqPillCode> = {
  APROVADO: 's',
  APROVADO_COM_RESSALVAS: 'w',
  REJEITADO: 'n',
};
const STATUS_PROPOSTA_LABEL: Record<ProposalStatus, string> = {
  EM_PREENCHIMENTO: 'Em preenchimento',
  EM_ANALISE: 'Em análise',
  DEVOLVIDA: 'Devolvida',
};
const STATUS_PROPOSTA_PILL: Record<ProposalStatus, FrqPillCode> = {
  EM_PREENCHIMENTO: 'w',
  EM_ANALISE: 'i',
  DEVOLVIDA: 'w',
};
const TIPO_EXCECAO_LABEL: Record<string, string> = {
  ISENCAO: 'Isenção de cobrança',
  BASE_REAL: 'Fixação de base real de cálculo',
  TETO: 'Teto máximo',
  CESSAO: 'Cessão programada',
};
const MOTIVO_SEM_FAIXA = {
  semModeloLoja: 'Informe o modelo de royalty e o formato de loja para o catálogo aplicar os percentuais.',
  semFaturamento: 'Informe o faturamento proposto para o catálogo selecionar a faixa.',
  formatoSemFaixa: 'O catálogo (Anexo A) ainda não tem faixa cadastrada para este formato de loja.',
  foraDasFaixas: 'O faturamento proposto está fora das faixas cadastradas no catálogo (Anexo A).',
  semModeloNegocio:
    'Informe o modelo de negócio (Urbano ou Rodovia) — é ele que define o percentual e o mínimo mensal do royalty.',
} as const;

const isIn = <T extends string>(lista: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (lista as readonly string[]).includes(v);
const BANDEIRAS: readonly BandeiraFranquia[] = ['ZBRM', 'ZLUB'];
const FORMATOS: readonly FormatoLoja[] = ['PADRAO', 'PONTO', 'SUPER_COMPACTA'];
const MODELOS_NEGOCIO: readonly ModeloNegocio[] = ['RODOVIA', 'URBANO'];
const MODELOS_ROYALTY: readonly ModeloRoyalty[] = [...MODELOS_CATALOGO, 'PERCENTUAL_FIXO'];
const SITUACOES: readonly SituacaoLoja[] = ['NOVA', 'EM_OPERACAO'];

// ───────────────────────────── Utilidades ─────────────────────────────

const ISO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hoje = () => new Date().toISOString().slice(0, 10);
const brl = (n: number) => n.toFixed(2);
const num = (s: string | null | undefined): number | null => {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const numeroValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const corpo = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' && !(body instanceof FormData) ? (body as Record<string, unknown>) : {};
const somaDias = (iso: string, dias: number) => new Date(new Date(iso).getTime() + dias * 86_400_000).toISOString();

const ESTADOS_ENCERRADOS: EstadoBackend[] = ['EM_MINUTA', 'EM_ASSINATURA', 'EM_PAGAMENTO', 'CONCLUIDA'];
const ESTADOS_PREENCHIMENTO: EstadoBackend[] = ['NOVOS', 'EM_PREENCHIMENTO'];

interface Contexto {
  reg: FranquiaRegistro;
  opp: OportunidadeElenco;
  prop: PropostaElenco;
}

/** Proposta de franquia da oportunidade, com a fase viva — ou `null` (404 na BFF). */
function contexto(oppId: string, proposalId: string): Contexto | null {
  const opp = oportunidade(oppId);
  const prop = opp?.propostas.find((p) => p.id === proposalId);
  const reg = franquias().find((f) => f.proposalId === proposalId && f.opportunityId === oppId);
  if (!opp || !prop || !reg) return null;
  sincronizarCof(reg, opp);
  return { reg, opp, prop };
}

const naoEncontrada = () => erro(404, 'Proposta de franquia não encontrada.');

/**
 * A COF dispara no GATE 1 (`opportunity.entered_analysis`) para loja NOVA. Quem
 * move a fase é outro domínio, então o disparo é recuperado na leitura: COF
 * pendente numa oportunidade que já saiu do preenchimento é entregue agora, com
 * a versão VIGENTE congelada no registro.
 */
function sincronizarCof(reg: FranquiaRegistro, opp: OportunidadeElenco): void {
  if (reg.situacaoLoja !== 'NOVA') return;
  if (!reg.cof) {
    reg.cof = {
      statusCof: 'PENDENTE',
      numeroCof: null,
      cofEnviadaEm: null,
      dataMinAssinatura: null,
      enviadoAssinaturaEm: null,
      assinadoEm: null,
      templateId: null,
    };
  }
  if (reg.cof.statusCof === 'PENDENTE' && !ESTADOS_PREENCHIMENTO.includes(opp.estado)) {
    const vigente = cofTemplates().find((t) => t.bandeira === reg.bandeira && t.vigente) ?? null;
    const agora = agoraIso();
    reg.cof.statusCof = 'ENVIADA';
    reg.cof.numeroCof = `COF-${reg.bandeira}-2026-${String(franquias().indexOf(reg) + 43).padStart(4, '0')}`;
    reg.cof.cofEnviadaEm = agora;
    reg.cof.dataMinAssinatura = somaDias(agora, 14);
    reg.cof.templateId = vigente?.id ?? null;
  }
}

interface Autoridade {
  faseEncerrada: boolean;
  propEditavel: boolean;
  preenchedor: boolean;
  time: boolean;
}

function autoridade(ctx: Contexto, user: MockUser | null): Autoridade {
  const faseEncerrada = ESTADOS_ENCERRADOS.includes(ctx.opp.estado);
  return {
    faseEncerrada,
    propEditavel:
      !faseEncerrada && (ctx.prop.status === 'EM_PREENCHIMENTO' || ctx.prop.status === 'DEVOLVIDA'),
    preenchedor: temPapel(user, ...PROPOSTA_WRITE),
    time: temPapel(user, ...TIME_FRANQUIA),
  };
}

const podeDados = (a: Autoridade) => a.preenchedor && a.propEditavel;
const podeModelo = (a: Autoridade) => !a.faseEncerrada && ((a.preenchedor && a.propEditavel) || a.time);
const podeLimites = (a: Autoridade) => !a.faseEncerrada && a.time;
const podeExcecoes = (a: Autoridade) => !a.faseEncerrada && (a.time || (a.preenchedor && a.propEditavel));

/** Recusa de escrita: perfil sem o papel ⇒ 403; fase que não aceita ⇒ 409 com a frase. */
function recusa(temPapelDeEscrita: boolean, fraseFase: string): Response {
  return temPapelDeEscrita ? erro(409, fraseFase) : semPermissao();
}

// ───────────────────────────── Royalties (F3) ─────────────────────────────

function paraFaixa(c: CatalogoRoyalty): RoyaltyFaixa {
  return {
    inicioFaixaBrl: c.inicioFaixaFaturamento,
    fimFaixaBrl: c.fimFaixaFaturamento,
    registroSequencial: c.registroSequencial,
    percRoyalty: c.percRoyalty,
    percRoyaltyTabaco: c.percRoyaltyTabaco,
    percFundoDeMkt: c.percFundoDeMkt,
    percFundoDeMktTabaco: c.percFundoDeMktTabaco,
    valorFixoRoyaltyBrl: c.valorFixoRoyalty,
    valorFixoFundoMktBrl: c.valorFixoFundoMkt,
  };
}

function faixasDaChave(modelo: ModeloRoyalty | null, formato: FormatoLoja | null): CatalogoRoyalty[] {
  if (!modelo || !formato || modelo === 'PERCENTUAL_FIXO') return [];
  return catalogo()
    .filter((c) => c.politica === modelo && c.formatoLoja === formato)
    .sort((a, b) => a.registroSequencial - b.registroSequencial);
}

/** A faixa que o faturamento seleciona — uma faixa única vale para qualquer faturamento. */
function faixaDoFaturamento(faixas: CatalogoRoyalty[], faturamento: number | null): CatalogoRoyalty | null {
  if (faixas.length === 1 && faixas[0].inicioFaixaFaturamento === null) return faixas[0];
  if (faturamento === null) return null;
  return (
    faixas.find((f) => {
      const ini = num(f.inicioFaixaFaturamento) ?? 0;
      const fim = num(f.fimFaixaFaturamento);
      return faturamento >= ini && (fim === null || faturamento <= fim);
    }) ?? null
  );
}

const excecaoAtiva = (e: ExcecaoRegistro, dia: string) =>
  (e.vigenciaInicio === null || e.vigenciaInicio <= dia) && (e.vigenciaFim === null || dia <= e.vigenciaFim);

function calcularRoyalties(reg: FranquiaRegistro): RoyaltiesCalculadosData | null {
  const faturamento = num(reg.faturamentoPropostoBrl);
  const modelo = reg.modeloRoyalty;
  if (faturamento === null || !modelo || !reg.formatoLoja) return null;
  if (modelo === 'PERCENTUAL_FIXO' && reg.percentualBps === null) return null;
  if (modelo === 'VALOR_FIXO' && reg.valorFixoBrl === null) return null;
  if (modelo !== 'PERCENTUAL_FIXO' && modelo !== 'VALOR_FIXO' && reg.percentualBps === null) return null;

  const faixa = faixaDoFaturamento(faixasDaChave(modelo, reg.formatoLoja), faturamento);
  const ativas = reg.excecoes.filter((e) => excecaoAtiva(e, hoje()));
  const isencaoAtiva = ativas.some((e) => e.tipoExcecao === 'ISENCAO');
  const cessaoAtiva = ativas.some((e) => e.tipoExcecao === 'CESSAO');
  const baseReal = ativas.find((e) => e.tipoExcecao === 'BASE_REAL' && e.valorOverrideBrl !== null);
  const teto = ativas.find((e) => e.tipoExcecao === 'TETO' && e.valorOverrideBrl !== null);
  const share = num(reg.shareTabacoPerc) ?? SHARE_TABACO_PARAMETRIZADO;
  const base = baseReal ? (num(baseReal.valorOverrideBrl) ?? faturamento) : faturamento;

  let royalty = 0;
  let fundo = 0;
  if (!isencaoAtiva) {
    if (modelo === 'VALOR_FIXO') {
      royalty = num(reg.valorFixoBrl) ?? 0;
      fundo = num(reg.fundoMktValorFixoBrl) ?? (reg.fundoMktPercBps !== null ? (base * reg.fundoMktPercBps) / 10_000 : 0);
    } else if (modelo === 'PERCENTUAL_FIXO') {
      royalty = Math.max((base * (reg.percentualBps ?? 0)) / 10_000, num(reg.valorMinimoMensalBrl) ?? 0);
      fundo = num(reg.fundoMktValorFixoBrl) ?? 0;
    } else {
      // Coluna de tabaco ausente cai na taxa geral, nunca em zero (ver `splitRates`).
      const pr = (reg.percentualBps ?? 0) / 10_000;
      const pf = (reg.fundoMktPercBps ?? 0) / 10_000;
      const prT = num(faixa?.percRoyaltyTabaco) ?? pr;
      const pfT = num(faixa?.percFundoDeMktTabaco) ?? pf;
      royalty = base * (1 - share) * pr + base * share * prT;
      fundo = base * (1 - share) * pf + base * share * pfT;
    }
    if (teto) royalty = Math.min(royalty, num(teto.valorOverrideBrl) ?? royalty);
  }

  return {
    modeloRoyalty: modelo,
    faturamentoBrl: brl(faturamento),
    baseEfetivaBrl: brl(base),
    shareTabacoPerc: share.toFixed(4),
    royaltyMensalBrl: brl(royalty),
    fundoMktMensalBrl: brl(fundo),
    royaltyAnualBrl: brl(royalty * 12),
    fundoMktAnualBrl: brl(fundo * 12),
    totalAnualBrl: brl((royalty + fundo) * 12),
    faixa: faixa ? paraFaixa(faixa) : null,
    isencaoAtiva,
    baseRealAtiva: !isencaoAtiva && !!baseReal,
    tetoAtivo: !isencaoAtiva && !!teto,
    tetoBrl: !isencaoAtiva && teto ? teto.valorOverrideBrl : null,
    cessaoAtiva,
    contratoClausulaEspecificaRequerida: reg.excecoes.length > 0 || reg.royaltyPremiadoAtivo,
    calculadoEm: agoraIso(),
  };
}

function motivoSemFaixa(reg: FranquiaRegistro): string | null {
  if (reg.modeloRoyalty === 'PERCENTUAL_FIXO') {
    return reg.modeloNegocio === null ? MOTIVO_SEM_FAIXA.semModeloNegocio : null;
  }
  if (reg.percentualBps !== null || reg.valorFixoBrl !== null || reg.fundoMktValorFixoBrl !== null) return null;
  if (!reg.modeloRoyalty || !reg.formatoLoja) return MOTIVO_SEM_FAIXA.semModeloLoja;
  const faixas = faixasDaChave(reg.modeloRoyalty, reg.formatoLoja);
  if (faixas.length === 0) return MOTIVO_SEM_FAIXA.formatoSemFaixa;
  if (reg.faturamentoPropostoBrl === null) return MOTIVO_SEM_FAIXA.semFaturamento;
  return MOTIVO_SEM_FAIXA.foraDasFaixas;
}

const temRoyalty = (r: FranquiaRegistro) => r.modeloRoyalty !== null;

/** `obrigatoriedadesFranquiaPendentes(…, "envio")` — fotos do ponto são do domínio de propostas. */
function pendenciasEnvio(reg: FranquiaRegistro): string[] {
  const p: string[] = [];
  if (!reg.situacaoLoja) p.push('Situação da loja não informada.');
  if (!reg.modeloNegocio) p.push('Modelo de negócio não informado.');
  if (!reg.formatoLoja) p.push('Formato da loja não informado.');
  if (!reg.potencialBrl) p.push('Potencial de faturamento (BRL) não informado.');
  if (!reg.fap) p.push('FAP (Ficha de Avaliação de Ponto) não anexada.');
  if (!temRoyalty(reg)) p.push('Estrutura de royalty não configurada.');
  if (reg.situacaoLoja === 'NOVA' && (reg.cofDestinatarioEmail ?? '').trim() === '') {
    p.push('Destinatário da COF não informado — Informe em "+ Cadastrar envio da COF".');
  }
  if (reg.isencaoTaxaFranquia === null) {
    p.push(
      'Isenção da taxa de franquia não informada — responda Sim ou Não em "Modelo de loja e royalties". ' +
        'É a marcação que o SAP/SD usa para cobrar a taxa do franqueado.',
    );
  }
  return p;
}

const parecerExigido = (reg: FranquiaRegistro): boolean | null => {
  const potencial = num(reg.potencialBrl);
  return potencial === null ? null : potencial > LIMITE_POTENCIAL_PARECER_BRL;
};

function sendbar(status: ProposalStatus, pendencias: string[]): PropostaFranquiaSendbar {
  const cta = {
    acaoLabel: 'Concluir',
    acaoEvento: 'franquia.proposta:enviar-analise',
    acaoHabilitada: true,
    motivoBloqueio: null,
  };
  if (status === 'EM_ANALISE') {
    return {
      mensagem: 'Proposta em análise pelo time de franquias.',
      mensagemDetalhe: null,
      acaoLabel: null,
      acaoEvento: null,
      acaoHabilitada: false,
      motivoBloqueio: null,
    };
  }
  if (status === 'DEVOLVIDA') {
    return {
      mensagem: 'Proposta devolvida para correções.',
      mensagemDetalhe: pendencias.length > 0 ? 'Resolva as pendências antes de reenviar.' : null,
      ...cta,
    };
  }
  return {
    mensagem:
      pendencias.length > 0
        ? 'Proposta em preenchimento — pendências a resolver.'
        : 'Proposta pronta para envio à análise.',
    mensagemDetalhe: null,
    ...cta,
  };
}

const ok = <T>(data: T | null): FrqSectionResult<T> => ({ status: 'ok', data });

function modeloParametros(reg: FranquiaRegistro): ModeloParametrosData {
  const faixas =
    reg.modeloRoyalty === 'PERCENTUAL_FIXO' ? [] : faixasDaChave(reg.modeloRoyalty, reg.formatoLoja).map(paraFaixa);
  return {
    faixasCatalogo: faixas,
    motivoSemFaixaLabel: motivoSemFaixa(reg),
    modeloNegocio: reg.modeloNegocio,
    modeloNegocioLabel: reg.modeloNegocio ? MODELO_NEGOCIO_LABEL[reg.modeloNegocio] : null,
    formatoLoja: reg.formatoLoja,
    formatoLojaLabel: reg.formatoLoja ? FORMATO_LABEL[reg.formatoLoja] : null,
    modeloRoyalty: reg.modeloRoyalty,
    modeloRoyaltyLabel: reg.modeloRoyalty ? MODELO_ROYALTY_LABEL[reg.modeloRoyalty] : null,
    valorFixoBrl: reg.valorFixoBrl,
    percentualBps: reg.percentualBps,
    pisoBrl: reg.pisoBrl,
    tetoBrl: reg.tetoBrl,
    valorMinimoMensalBrl: reg.valorMinimoMensalBrl,
    fundoMktPercBps: reg.fundoMktPercBps,
    fundoMktValorFixoBrl: reg.fundoMktValorFixoBrl,
    taxaFranquiaBrl: reg.taxaFranquiaBrl,
    taxaFranquiaParcelas: reg.taxaFranquiaParcelas,
    isencaoTaxaFranquia: reg.isencaoTaxaFranquia,
  };
}

function readModel(ctx: Contexto, user: MockUser | null): PropostaFranquiaReadModel {
  const { reg, opp, prop } = ctx;
  const a = autoridade(ctx, user);
  const status = prop.status;
  const pendencias = pendenciasEnvio(reg);
  const exigido = parecerExigido(reg);
  const posto = opp.propostas.find((p) => p.id === reg.postoProposalId) ?? null;
  const cof = reg.cof;
  const prazoLegalCumprido = cof?.dataMinAssinatura ? new Date() >= new Date(cof.dataMinAssinatura) : null;
  const dia = hoje();
  const excecoes: ExcecaoRoyaltyItem[] = reg.excecoes.map((e) => ({
    id: e.id,
    tipoExcecao: e.tipoExcecao,
    tipoExcecaoLabel: TIPO_EXCECAO_LABEL[e.tipoExcecao] ?? e.tipoExcecao,
    politicaExcecao: e.politicaExcecao,
    vigenciaInicio: e.vigenciaInicio,
    vigenciaFim: e.vigenciaFim,
    valorOverrideBrl: e.valorOverrideBrl,
    motivo: e.motivo,
    ativo: excecaoAtiva(e, dia),
  }));

  return {
    proposalId: reg.proposalId,
    opportunityId: reg.opportunityId,
    dadosFranquia: ok({
      franquiaId: reg.franquiaId,
      proposalId: reg.proposalId,
      opportunityId: reg.opportunityId,
      bandeira: reg.bandeira,
      bandeiraLabel: BANDEIRA_LABEL[reg.bandeira],
      statusProposta: status,
      statusPropostaLabel: STATUS_PROPOSTA_LABEL[status],
      statusPropostaPill: STATUS_PROPOSTA_PILL[status],
      situacaoLoja: reg.situacaoLoja,
      situacaoLojaLabel: reg.situacaoLoja ? SITUACAO_LABEL[reg.situacaoLoja] : null,
      tipoImplantacao: reg.tipoImplantacao,
      codigoMaterialSap: reg.codigoMaterialSap,
      observacoes: reg.observacoes,
      inicioOperacaoPrevista: reg.inicioOperacaoPrevista,
      postoProposalId: reg.postoProposalId,
      postoVinculoLabel: posto ? `${posto.codigo} · Posto (PCR)` : null,
      finalidade: reg.finalidade,
      evNome: reg.evNome,
    }),
    fapPotencialFotos: ok({
      faturamentoPropostoBrl: reg.faturamentoPropostoBrl,
      faturamentoDeAcordoComFap: reg.faturamentoDeAcordoComFap,
      fapBrl: reg.fapBrl,
      potencialBrl: reg.potencialBrl,
      possuiExcecaoRoyalties: reg.possuiExcecaoRoyalties,
      shareTabacoPerc: (num(reg.shareTabacoPerc) ?? SHARE_TABACO_PARAMETRIZADO).toFixed(4),
      fapDocumento: reg.fap
        ? { id: reg.fap.id, fileName: reg.fap.fileName, sizeBytes: reg.fap.sizeBytes, createdAt: reg.fap.createdAt }
        : null,
    }),
    modeloParametros: ok(modeloParametros(reg)),
    royaltiesCalculados: ok(calcularRoyalties(reg)),
    estruturaExcecoes: ok({
      maturacao: reg.maturacao ? { ...reg.maturacao } : null,
      royaltyPremiado: reg.maturacao
        ? { ativo: reg.royaltyPremiadoAtivo, percentualBps: reg.royaltyPremiadoPercentualBps }
        : null,
      excecoes,
    }),
    cof: ok(
      cof
        ? {
            destinatarioEmail: reg.cofDestinatarioEmail,
            statusCof: cof.statusCof,
            statusCofLabel: STATUS_COF_LABEL[cof.statusCof],
            statusCofPill: STATUS_COF_PILL[cof.statusCof],
            numeroCof: cof.numeroCof,
            cofEnviadaEm: cof.cofEnviadaEm,
            dataMinAssinatura: cof.dataMinAssinatura,
            prazoLegalCumprido,
            enviadoAssinaturaEm: cof.enviadoAssinaturaEm,
            assinadoEm: cof.assinadoEm,
          }
        : null,
    ),
    parecerFranquia: ok(
      reg.parecer
        ? {
            texto: reg.parecer.texto,
            resultado: reg.parecer.resultado,
            resultadoLabel: reg.parecer.resultado ? RESULTADO_LABEL[reg.parecer.resultado] : null,
            resultadoPill: reg.parecer.resultado ? RESULTADO_PILL[reg.parecer.resultado] : null,
            analistaId: reg.parecer.analistaId,
            submetidoEm: reg.parecer.submetidoEm,
            numRecalls: reg.parecer.numRecalls,
          }
        : null,
    ),
    vereditos: {
      analiseEmCurso: status === 'EM_ANALISE' && opp.estado === 'EM_ANALISE',
      envioLiberado: pendencias.length === 0,
      pendenciasEnvio: pendencias,
      parecerExigido: exigido,
      parecerExigidoAlerta: exigido
        ? 'Potencial acima do limite parametrizável (RN-F4-02): ao enviar à análise, ' +
          'o parecer antecipado será solicitado ao time de franquias.'
        : null,
      editavelPorFranquia: {
        dadosFranquia: podeDados(a),
        fapPotencialFotos: podeDados(a),
        modeloParametros: podeModelo(a),
        estruturaExcecoes: podeLimites(a),
        excecoesProgramadas: podeExcecoes(a),
        parecerFranquia: !a.faseEncerrada && temPapel(user, ...PARECER_DECIDE),
      },
      royaltyPremiadoIrreversivel: reg.royaltyPremiadoAtivo,
      cofStatus: cof?.statusCof ?? null,
      cofStatusLabel: cof ? STATUS_COF_LABEL[cof.statusCof] : null,
      cofStatusPill: cof ? STATUS_COF_PILL[cof.statusCof] : null,
      dataMinimaAssinatura: cof?.dataMinAssinatura ?? null,
      prazoLegalCumprido,
      contratoClausulaEspecificaRequerida: reg.excecoes.length > 0 || reg.royaltyPremiadoAtivo,
    },
    sendbar: sendbar(status, pendencias),
  };
}

// ───────────────────────────── Parametrização: consultas ─────────────────────────────

function validacoes(bandeira: string | null, formato: string | null): RoyaltyPolicyValidacoes {
  const linhas = taxas();
  if (linhas.length === 0) return { maxParcelasTaxa: null, origemLimite: null, taxaFranquiaDefaultBrl: null };
  const exata = linhas.find((l) => l.bandeira === bandeira && l.formatoLoja === formato);
  if (exata) {
    return {
      maxParcelasTaxa: exata.maxParcelasTaxa,
      origemLimite: 'PARAMETRO' satisfies OrigemLimiteParcelas,
      taxaFranquiaDefaultBrl: exata.taxaFranquiaDefaultBrl,
    };
  }
  // Sem linha própria: o teto MAIS FROUXO da bandeira (ou geral), e taxa vazia.
  const daBandeira = linhas.filter((l) => l.bandeira === bandeira);
  const universo = daBandeira.length > 0 ? daBandeira : linhas;
  return {
    maxParcelasTaxa: Math.max(...universo.map((l) => l.maxParcelasTaxa)),
    origemLimite: 'TETO_GLOBAL',
    taxaFranquiaDefaultBrl: null,
  };
}

function listaCof(): CofTemplateList {
  return {
    bandeiras: BANDEIRAS_COF.map(({ bandeira, bandeiraLabel }) => ({
      bandeira,
      bandeiraLabel,
      versoes: cofTemplates()
        .filter((t) => t.bandeira === bandeira)
        .sort((x, y) => y.versao - x.versao),
    })),
  };
}

// ───────────────────────────── Handlers: proposta ─────────────────────────────

/** Handler que exige a proposta de franquia — 404 com a frase da BFF quando não existe. */
function comProposta(fn: (ctx: Contexto, m: MockContext) => Response | Promise<Response>): MockHandler {
  return (m) => {
    const ctx = contexto(m.params.id, m.params.proposalId);
    return ctx ? fn(ctx, m) : naoEncontrada();
  };
}

const criarProposta: MockHandler = ({ params, body, user }) => {
  if (!temPapel(user, ...PROPOSTA_WRITE)) return semPermissao();
  const opp = oportunidade(params.id);
  const b = corpo(body);
  if (b.tipoProposta !== 'ZBRM' && b.tipoProposta !== 'ZLUB') {
    return erro(400, 'Tipo de proposta inválido — informe ZBRM (BR Mania) ou ZLUB (Lubrax+).');
  }
  const posto = opp?.propostas.find((p) => p.id === b.postoProposalId && p.tipo === 'PCR');
  if (!opp || !posto) return erro(404, 'Oportunidade ou proposta de posto não encontrada.');
  if (typeof b.finalidade !== 'string' || b.finalidade.trim() === '') {
    return erro(400, 'Selecione a finalidade da proposta de franquia.');
  }
  const { dataInicioAnalise: ini, dataFimAnalise: fim } = b;
  if (typeof ini !== 'string' || typeof fim !== 'string' || !ISO_DATA.test(ini) || !ISO_DATA.test(fim)) {
    return erro(400, 'Informe a janela de análise (datas no formato AAAA-MM-DD).');
  }
  if (fim < ini) return erro(400, 'A data fim da análise deve ser igual ou posterior à data de início.');
  if (!ESTADOS_PREENCHIMENTO.includes(opp.estado)) {
    return erro(409, 'A oportunidade não está em preenchimento — não é possível criar proposta de franquia.');
  }

  const tipo = b.tipoProposta;
  const seq =
    11 +
    oportunidades()
      .flatMap((o) => o.propostas)
      .filter((p) => p.tipo !== 'PCR').length;
  const proposalId = novoId('prp');
  opp.propostas.push({
    id: proposalId,
    codigo: `${tipo}-GOP-${String(seq).padStart(8, '0')}/2026`,
    tipo,
    status: 'EM_PREENCHIMENTO',
    eleita: false,
    valorEstimado: 0,
  });
  const reg = franquiaVazia({
    franquiaId: novoId('frq'),
    proposalId,
    opportunityId: opp.id,
    bandeira: tipo,
    finalidade: b.finalidade.trim(),
    postoProposalId: posto.id,
    dataInicioAnalise: ini,
    dataFimAnalise: fim,
  });
  franquias().push(reg);
  return json<CreateFranquiaProposalResult>(
    { proposalId, franquiaId: reg.franquiaId, tipoProposta: tipo, opportunityId: opp.id },
    201,
  );
};

const atualizarDados = comProposta((ctx, { body, user }) => {
  const a = autoridade(ctx, user);
  if (!podeDados(a)) {
    return a.preenchedor
      ? erro(400, 'A proposta não está em preenchimento — os dados da franquia não podem ser alterados.')
      : semPermissao();
  }
  const b = corpo(body);
  const { reg } = ctx;

  if ('situacaoLoja' in b && b.situacaoLoja !== null && !isIn(SITUACOES, b.situacaoLoja)) {
    return erro(400, 'Situação da loja inválida.');
  }
  if ('inicioOperacaoPrevista' in b && b.inicioOperacaoPrevista !== null) {
    if (typeof b.inicioOperacaoPrevista !== 'string' || !ISO_DATA.test(b.inicioOperacaoPrevista)) {
      return erro(400, 'Data prevista de início de operação inválida.');
    }
  }
  if ('faturamentoPropostoBrl' in b && b.faturamentoPropostoBrl !== null && !numeroValido(b.faturamentoPropostoBrl)) {
    return erro(400, 'O faturamento proposto deve ser um valor numérico não negativo.');
  }
  for (const k of ['faturamentoDeAcordoComFap', 'possuiExcecaoRoyalties'] as const) {
    if (k in b && b[k] !== null && typeof b[k] !== 'boolean') return erro(400, `O campo "${k}" deve ser Sim ou Não.`);
  }
  if ('cofDestinatarioEmail' in b && b.cofDestinatarioEmail !== null) {
    if (typeof b.cofDestinatarioEmail !== 'string' || !EMAIL.test(b.cofDestinatarioEmail.trim())) {
      return erro(400, 'Informe um e-mail válido para o destinatário da COF.');
    }
  }

  if ('situacaoLoja' in b) {
    reg.situacaoLoja = (b.situacaoLoja as SituacaoLoja | null) ?? null;
    // Loja em operação não recebe COF (RN-F5-01); uma pendente de disparo some.
    if (reg.situacaoLoja !== 'NOVA' && reg.cof?.statusCof === 'PENDENTE') reg.cof = null;
    sincronizarCof(reg, ctx.opp);
  }
  if ('tipoImplantacao' in b) {
    reg.tipoImplantacao = typeof b.tipoImplantacao === 'string' && b.tipoImplantacao.trim() !== '' ? b.tipoImplantacao.trim() : null;
  }
  if ('inicioOperacaoPrevista' in b) reg.inicioOperacaoPrevista = (b.inicioOperacaoPrevista as string | null) ?? null;
  if ('faturamentoPropostoBrl' in b) {
    reg.faturamentoPropostoBrl = b.faturamentoPropostoBrl === null ? null : brl(b.faturamentoPropostoBrl as number);
  }
  if ('faturamentoDeAcordoComFap' in b) reg.faturamentoDeAcordoComFap = (b.faturamentoDeAcordoComFap as boolean | null) ?? null;
  if ('possuiExcecaoRoyalties' in b) reg.possuiExcecaoRoyalties = (b.possuiExcecaoRoyalties as boolean | null) ?? null;
  if ('cofDestinatarioEmail' in b) {
    reg.cofDestinatarioEmail = typeof b.cofDestinatarioEmail === 'string' ? b.cofDestinatarioEmail.trim() : null;
  }

  return json<UpdateDadosFranquiaResult>({
    proposalId: reg.proposalId,
    situacaoLoja: reg.situacaoLoja,
    situacaoLojaLabel: reg.situacaoLoja ? SITUACAO_LABEL[reg.situacaoLoja] : null,
    tipoImplantacao: reg.tipoImplantacao,
    inicioOperacaoPrevista: reg.inicioOperacaoPrevista,
    faturamentoPropostoBrl: reg.faturamentoPropostoBrl,
    faturamentoDeAcordoComFap: reg.faturamentoDeAcordoComFap,
    possuiExcecaoRoyalties: reg.possuiExcecaoRoyalties,
    cofDestinatarioEmail: reg.cofDestinatarioEmail,
  });
});

const definirPotencial = comProposta((ctx, { body, user }) => {
  const potencial = campo(body, 'potencialBrl');
  if (!numeroValido(potencial)) {
    return erro(400, 'Informe o potencial como um valor numérico não negativo.');
  }
  const a = autoridade(ctx, user);
  if (!podeDados(a)) {
    return a.preenchedor
      ? erro(400, 'A proposta não está em preenchimento — o potencial não pode ser alterado.')
      : semPermissao();
  }
  ctx.reg.potencialBrl = brl(potencial);
  return json<SetPotencialResult>({
    proposalId: ctx.reg.proposalId,
    potencialBrl: ctx.reg.potencialBrl,
    coordenadorParecerRequerido: parecerExigido(ctx.reg) === true,
  });
});

const anexarFap = comProposta((ctx, { body, user }) => {
  if (!(body instanceof FormData)) return erro(400, 'Envio inválido — arquivo não recebido.');
  const arquivo = arquivoEnviado(body);
  if (!arquivo) return erro(400, 'Arquivo ausente.');
  const a = autoridade(ctx, user);
  if (!podeDados(a)) {
    return a.preenchedor ? erro(400, 'A proposta não está em preenchimento — a FAP não pode ser alterada.') : semPermissao();
  }
  if (arquivo.tipo !== 'application/pdf' && !arquivo.nome.toLowerCase().endsWith('.pdf')) {
    return erro(400, 'A FAP deve ser um arquivo PDF.');
  }
  if (arquivo.tamanho > 10 * 1024 * 1024) return erro(400, 'A FAP excede o limite de 10 MB.');
  // A FAP é substituível (ADO 68184): o novo arquivo toma o lugar do anterior.
  ctx.reg.fap = {
    id: novoId('fap'),
    fileName: arquivo.nome,
    mimeType: 'application/pdf',
    sizeBytes: arquivo.tamanho,
    createdAt: agoraIso(),
  };
  return json<FapDocumentoUploaded>({ ...ctx.reg.fap }, 201);
});

const removerFap = comProposta((ctx, { params, user }) => {
  if (!ctx.reg.fap || ctx.reg.fap.id !== params.docId) return erro(404, 'FAP não encontrada.');
  const a = autoridade(ctx, user);
  if (!podeDados(a)) {
    return a.preenchedor ? erro(400, 'A proposta não está em preenchimento — a FAP não pode ser removida.') : semPermissao();
  }
  ctx.reg.fap = null;
  return semConteudo();
});

const streamFap = comProposta((ctx, { params }) => {
  if (!ctx.reg.fap || ctx.reg.fap.id !== params.docId) return erro(404, 'FAP não encontrada nesta proposta.');
  return pdf(`FAP - ${ctx.reg.fap.fileName}`, ctx.reg.fap.fileName);
});

const streamCof = comProposta((ctx, { params }) => {
  if (!ctx.reg.cof?.templateId || ctx.reg.cof.templateId !== params.templateId) {
    return erro(404, 'COF não encontrada nesta proposta.');
  }
  const t = cofTemplates().find((x) => x.id === params.templateId);
  if (!t) return erro(404, 'Arquivo da COF não encontrado no armazenamento.');
  return pdf(`COF ${BANDEIRA_LABEL[ctx.reg.bandeira]} versão ${t.versao}`, t.fileName);
});

const definirModeloLoja = comProposta((ctx, { body, user }) => {
  const b = corpo(body);
  if (!isIn(FORMATOS, b.formatoLoja) || !isIn(MODELOS_ROYALTY, b.modeloRoyalty)) {
    return erro(400, 'Selecione o formato de loja e o modelo de royalty.');
  }
  if (b.modeloNegocio !== undefined && !isIn(MODELOS_NEGOCIO, b.modeloNegocio)) {
    return erro(400, 'Modelo de negócio inválido.');
  }
  const a = autoridade(ctx, user);
  if (!podeModelo(a)) {
    return recusa(temPapel(user, ...PARAMETROS_WRITE), 'A proposta não aceita mais alteração do modelo de loja nesta fase.');
  }
  const { reg } = ctx;
  const formato = b.formatoLoja;
  const modelo = b.modeloRoyalty;
  if (reg.bandeira === 'ZLUB' && formato !== 'PADRAO') {
    return erro(400, 'Lubrax+ aceita apenas o formato de loja Padrão.');
  }
  if (reg.bandeira === 'ZLUB' && modelo !== 'PERCENTUAL_FIXO') {
    return erro(400, 'Lubrax+ aceita apenas o modelo de royalty Percentual fixo.');
  }
  if (reg.bandeira === 'ZBRM' && modelo === 'PERCENTUAL_FIXO') {
    return erro(400, 'O modelo Percentual fixo é exclusivo da Lubrax+.');
  }
  // O teto de parcelas é do formato: trocar o formato revalida o que já foi gravado.
  const teto = validacoes(reg.bandeira, formato);
  if (reg.taxaFranquiaParcelas !== null && teto.maxParcelasTaxa !== null && reg.taxaFranquiaParcelas > teto.maxParcelasTaxa) {
    return erro(
      400,
      `A taxa está em ${reg.taxaFranquiaParcelas} parcelas, e o formato ${FORMATO_LABEL[formato]} admite no máximo ` +
        `${teto.maxParcelasTaxa}. Ajuste as parcelas antes de trocar o formato.`,
    );
  }

  if (b.modeloNegocio !== undefined) reg.modeloNegocio = b.modeloNegocio;
  reg.formatoLoja = formato;
  reg.modeloRoyalty = modelo;

  let catalogoAplicado = false;
  if (modelo === 'PERCENTUAL_FIXO') {
    // Política, não resposta: reescrita a cada gravação, pelo modelo de negócio.
    const politica = reg.modeloNegocio ? POLITICA_PERCENTUAL_FIXO_LUBRAX[reg.modeloNegocio] : null;
    reg.percentualBps = politica?.bps ?? null;
    reg.valorMinimoMensalBrl = politica?.minimoBrl ?? null;
    reg.valorFixoBrl = null;
    reg.fundoMktPercBps = null;
    reg.fundoMktValorFixoBrl =
      limites().find((l) => l.bandeira === 'ZLUB')?.fundoMktValorFixoBrl ??
      catalogo().find((c) => c.politica === 'VALOR_FIXO')?.valorFixoFundoMkt ??
      null;
    catalogoAplicado = politica !== null;
  } else {
    const faixa = faixaDoFaturamento(faixasDaChave(modelo, formato), num(reg.faturamentoPropostoBrl));
    const ratioParaBps = (s: string | null) => (num(s) === null ? null : Math.round((num(s) ?? 0) * 10_000));
    if (modelo === 'VALOR_FIXO') {
      reg.valorFixoBrl = faixa?.valorFixoRoyalty ?? null;
      reg.fundoMktValorFixoBrl = faixa?.valorFixoFundoMkt ?? null;
      reg.percentualBps = null;
      reg.fundoMktPercBps = ratioParaBps(faixa?.percFundoDeMkt ?? null);
    } else {
      reg.percentualBps = ratioParaBps(faixa?.percRoyalty ?? null);
      reg.fundoMktPercBps = ratioParaBps(faixa?.percFundoDeMkt ?? null);
      reg.valorFixoBrl = null;
      reg.fundoMktValorFixoBrl = null;
    }
    catalogoAplicado = faixa !== null;
  }

  // A taxa só é semeada sobre campo vazio ou sobre valor do próprio parâmetro.
  let taxaFranquiaDefaultBrl: string | null = null;
  if ((reg.taxaFranquiaBrl === null || reg.taxaFonte === 'PARAMETRO') && teto.origemLimite === 'PARAMETRO') {
    taxaFranquiaDefaultBrl = teto.taxaFranquiaDefaultBrl;
    if (taxaFranquiaDefaultBrl !== null) {
      reg.taxaFranquiaBrl = taxaFranquiaDefaultBrl;
      reg.taxaFonte = 'PARAMETRO';
    }
  }

  return json<SetModeloLojaResult>({
    franquiaId: reg.franquiaId,
    modeloNegocio: reg.modeloNegocio,
    formatoLoja: formato,
    modeloRoyalty: modelo,
    catalogoAplicado,
    catalogoIndisponivel: catalogo().length === 0,
    taxaFranquiaDefaultBrl,
  });
});

const CAMPOS_NUMERICOS_ROYALTY = [
  'percentualBps',
  'pisoBrl',
  'tetoBrl',
  'valorFixoBrl',
  'valorMinimoMensalBrl',
  'fundoMktPercBps',
  'fundoMktValorFixoBrl',
  'taxaFranquiaBrl',
  'taxaFranquiaParcelas',
] as const;
/** Os LIMITES do royalty — recorte do time de franquias (RN-F2-06). */
const CAMPOS_LIMITE = new Set<string>([
  'percentualBps',
  'pisoBrl',
  'tetoBrl',
  'valorFixoBrl',
  'valorMinimoMensalBrl',
  'fundoMktPercBps',
  'fundoMktValorFixoBrl',
]);

const definirRoyalty = comProposta((ctx, { body, user }) => {
  const b = corpo(body);
  if (b.isencaoTaxaFranquia !== undefined && b.isencaoTaxaFranquia !== null && typeof b.isencaoTaxaFranquia !== 'boolean') {
    return erro(400, 'O campo "isencaoTaxaFranquia" deve ser booleano ou nulo.');
  }
  for (const k of CAMPOS_NUMERICOS_ROYALTY) {
    const v = b[k];
    if (v !== undefined && v !== null && !numeroValido(v)) {
      return erro(400, `O campo "${k}" deve ser um valor numérico não negativo.`);
    }
  }
  const a = autoridade(ctx, user);
  if (!podeModelo(a)) {
    return recusa(temPapel(user, ...PARAMETROS_WRITE), 'A proposta não aceita mais alteração da estrutura de royalties nesta fase.');
  }
  const enviados = CAMPOS_NUMERICOS_ROYALTY.filter((k) => b[k] !== undefined);
  if (enviados.some((k) => CAMPOS_LIMITE.has(k)) && !podeLimites(a)) {
    return erro(403, 'Somente o time de franquias altera os limites do royalty (RN-F2-06).');
  }
  const { reg } = ctx;
  if (
    reg.modeloRoyalty === 'PERCENTUAL_FIXO' &&
    (['percentualBps', 'valorMinimoMensalBrl', 'valorFixoBrl'] as const).some((k) => b[k] !== undefined)
  ) {
    return erro(400, 'No modelo Percentual fixo o percentual e o mínimo mensal vêm da política da Lubrax+ e não podem ser alterados.');
  }
  const parcelas = b.taxaFranquiaParcelas;
  if (typeof parcelas === 'number') {
    if (!Number.isInteger(parcelas) || parcelas < 1) return erro(400, 'Informe um número inteiro de parcelas (mínimo 1).');
    const v = validacoes(reg.bandeira, reg.formatoLoja);
    if (v.maxParcelasTaxa === null) {
      return erro(503, 'A parametrização da taxa de franquia está vazia — cadastre-a na Governança antes de informar as parcelas.');
    }
    if (parcelas > v.maxParcelasTaxa) {
      const onde = reg.formatoLoja ? `${BANDEIRA_LABEL[reg.bandeira]} · ${FORMATO_LABEL[reg.formatoLoja]}` : BANDEIRA_LABEL[reg.bandeira];
      return erro(400, `A taxa de franquia pode ser parcelada em no máximo ${v.maxParcelasTaxa} vezes (${onde}).`);
    }
  }

  const dinheiro = (v: unknown) => (v === null ? null : brl(v as number));
  if (b.percentualBps !== undefined) reg.percentualBps = (b.percentualBps as number | null) ?? null;
  if (b.fundoMktPercBps !== undefined) reg.fundoMktPercBps = (b.fundoMktPercBps as number | null) ?? null;
  if (b.pisoBrl !== undefined) reg.pisoBrl = dinheiro(b.pisoBrl);
  if (b.tetoBrl !== undefined) reg.tetoBrl = dinheiro(b.tetoBrl);
  if (b.valorFixoBrl !== undefined) reg.valorFixoBrl = dinheiro(b.valorFixoBrl);
  if (b.valorMinimoMensalBrl !== undefined) reg.valorMinimoMensalBrl = dinheiro(b.valorMinimoMensalBrl);
  if (b.fundoMktValorFixoBrl !== undefined) reg.fundoMktValorFixoBrl = dinheiro(b.fundoMktValorFixoBrl);
  if (b.taxaFranquiaBrl !== undefined) {
    reg.taxaFranquiaBrl = dinheiro(b.taxaFranquiaBrl);
    reg.taxaFonte = 'MANUAL';
  }
  if (b.taxaFranquiaParcelas !== undefined) reg.taxaFranquiaParcelas = (b.taxaFranquiaParcelas as number | null) ?? null;
  if (b.isencaoTaxaFranquia !== undefined) reg.isencaoTaxaFranquia = (b.isencaoTaxaFranquia as boolean | null) ?? null;

  return json<SetRoyaltyEstruturaResult>({
    franquiaId: reg.franquiaId,
    percentualBps: reg.percentualBps,
    pisoBrl: reg.pisoBrl,
    tetoBrl: reg.tetoBrl,
    valorFixoBrl: reg.valorFixoBrl,
    valorMinimoMensalBrl: reg.valorMinimoMensalBrl,
    fundoMktPercBps: reg.fundoMktPercBps,
    fundoMktValorFixoBrl: reg.fundoMktValorFixoBrl,
    taxaFranquiaBrl: reg.taxaFranquiaBrl,
    taxaFranquiaParcelas: reg.taxaFranquiaParcelas,
    isencaoTaxaFranquia: reg.isencaoTaxaFranquia,
  });
});

const definirMaturacao = comProposta((ctx, { body, user }) => {
  const b = corpo(body);
  if (typeof b.isMaturada !== 'boolean') return erro(400, 'Informe se a loja é maturada.');
  if (b.maturacaoInicioEm !== undefined && b.maturacaoInicioEm !== null) {
    if (typeof b.maturacaoInicioEm !== 'string' || !ISO_DATA.test(b.maturacaoInicioEm)) {
      return erro(400, 'Data de início da maturação inválida.');
    }
  }
  for (const k of ['maturacaoMesesTotal', 'maturacaoPercentualBps', 'maturacaoValorFixoBrl'] as const) {
    const v = b[k];
    if (v !== undefined && v !== null && !numeroValido(v)) {
      return erro(400, `O campo "${k}" deve ser um valor numérico não negativo.`);
    }
  }
  const a = autoridade(ctx, user);
  if (!podeModelo(a)) {
    return recusa(temPapel(user, ...PARAMETROS_WRITE), 'A proposta não aceita mais alteração da maturação nesta fase.');
  }
  const { reg } = ctx;
  reg.maturacao = {
    isMaturada: b.isMaturada,
    maturacaoInicioEm: (b.maturacaoInicioEm as string | null | undefined) ?? null,
    maturacaoMesesTotal: (b.maturacaoMesesTotal as number | null | undefined) ?? null,
    maturacaoPercentualBps: (b.maturacaoPercentualBps as number | null | undefined) ?? null,
    maturacaoValorFixoBrl:
      typeof b.maturacaoValorFixoBrl === 'number' ? brl(b.maturacaoValorFixoBrl) : null,
  };
  return json<SetMaturacaoResult>({ franquiaId: reg.franquiaId, ...reg.maturacao });
});

const aceitarPremiado = comProposta((ctx, { body, user }) => {
  const bps = campo(body, 'royaltyPremiadoPercentualBps');
  if (typeof bps !== 'number' || !Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    return erro(400, 'Informe o percentual do Royalty Premiado em basis points (0 a 10000).');
  }
  const a = autoridade(ctx, user);
  if (!a.time) return semPermissao();
  if (a.faseEncerrada) return erro(409, 'A oportunidade já passou da fase em que o Royalty Premiado pode ser aceito.');
  const { reg } = ctx;
  if (reg.royaltyPremiadoAtivo) {
    return erro(400, 'O Royalty Premiado já foi aceito — o aceite é irreversível (RN-F2-07).');
  }
  reg.royaltyPremiadoAtivo = true;
  reg.royaltyPremiadoPercentualBps = bps;
  reg.maturacao ??= {
    isMaturada: null,
    maturacaoInicioEm: null,
    maturacaoMesesTotal: null,
    maturacaoPercentualBps: null,
    maturacaoValorFixoBrl: null,
  };
  return json<AcceptRoyaltyPremiadoResult>({
    franquiaId: reg.franquiaId,
    royaltyPremiadoAtivo: true,
    royaltyPremiadoPercentualBps: bps,
  });
});

// ── Exceções programadas (RN-F2-06 · ADO 67802) ──

/** Espelho de `parseExcecaoPayload`: o corpo do POST e do PATCH é o mesmo. */
function lerExcecao(body: unknown): { ok: true; e: Omit<ExcecaoRegistro, 'id'> } | { ok: false; r: Response } {
  const b = corpo(body);
  if (typeof b.tipoExcecao !== 'string' || b.tipoExcecao.trim() === '') {
    return { ok: false, r: erro(400, 'Informe o tipo da exceção.') };
  }
  if (!(b.tipoExcecao.trim() in TIPO_EXCECAO_LABEL)) {
    return { ok: false, r: erro(400, 'Tipo de exceção desconhecido.') };
  }
  if (typeof b.motivo !== 'string' || b.motivo.trim() === '') {
    return { ok: false, r: erro(400, 'O motivo da exceção é obrigatório.') };
  }
  for (const k of ['vigenciaInicio', 'vigenciaFim'] as const) {
    const v = b[k];
    if (v !== undefined && v !== null && (typeof v !== 'string' || !ISO_DATA.test(v))) {
      return { ok: false, r: erro(400, `Data inválida em "${k}".`) };
    }
  }
  const valor = b.valorOverrideBrl;
  if (valor !== undefined && valor !== null && !numeroValido(valor)) {
    return { ok: false, r: erro(400, 'Valor de override deve ser um número não negativo.') };
  }
  const inicio = (b.vigenciaInicio as string | null | undefined) ?? null;
  const fim = (b.vigenciaFim as string | null | undefined) ?? null;
  if (inicio && fim && fim < inicio) {
    return { ok: false, r: erro(400, 'A vigência final da exceção deve ser posterior à inicial.') };
  }
  return {
    ok: true,
    e: {
      tipoExcecao: b.tipoExcecao.trim(),
      politicaExcecao: typeof b.politicaExcecao === 'string' ? b.politicaExcecao : null,
      vigenciaInicio: inicio,
      vigenciaFim: fim,
      valorOverrideBrl: typeof valor === 'number' ? brl(valor) : null,
      motivo: b.motivo.trim(),
    },
  };
}

function guardaExcecao(ctx: Contexto, user: MockUser | null): Response | null {
  const a = autoridade(ctx, user);
  if (podeExcecoes(a)) return null;
  return recusa(
    temPapel(user, ...PARAMETROS_WRITE),
    'A proposta saiu do preenchimento — as exceções programadas agora são do time de franquias.',
  );
}

const duplica = (reg: FranquiaRegistro, e: Omit<ExcecaoRegistro, 'id'>, ignorar?: string) =>
  reg.excecoes.some(
    (x) =>
      x.id !== ignorar &&
      x.tipoExcecao === e.tipoExcecao &&
      x.vigenciaInicio === e.vigenciaInicio &&
      x.vigenciaFim === e.vigenciaFim,
  );

const criarExcecao = comProposta((ctx, { body, user }) => {
  const lido = lerExcecao(body);
  if (!lido.ok) return lido.r;
  const recusada = guardaExcecao(ctx, user);
  if (recusada) return recusada;
  if (duplica(ctx.reg, lido.e)) return erro(409, 'Estes dados duplicam outra exceção programada desta proposta.');
  const nova: ExcecaoRegistro = { id: novoId('exc'), ...lido.e };
  ctx.reg.excecoes.push(nova);
  return json<ExcecaoCreated>({ id: nova.id, tipoExcecao: nova.tipoExcecao, motivo: nova.motivo }, 201);
});

const alterarExcecao = comProposta((ctx, { params, body, user }) => {
  const lido = lerExcecao(body);
  if (!lido.ok) return lido.r;
  const atual = ctx.reg.excecoes.find((x) => x.id === params.excecaoId);
  if (!atual) return naoEncontrada();
  const recusada = guardaExcecao(ctx, user);
  if (recusada) return recusada;
  if (duplica(ctx.reg, lido.e, atual.id)) return erro(409, 'Estes dados duplicam outra exceção programada desta proposta.');
  Object.assign(atual, lido.e);
  return json<ExcecaoCreated>({ id: atual.id, tipoExcecao: atual.tipoExcecao, motivo: atual.motivo });
});

const removerExcecao = comProposta((ctx, { params, user }) => {
  const i = ctx.reg.excecoes.findIndex((x) => x.id === params.excecaoId);
  if (i < 0) return naoEncontrada();
  const recusada = guardaExcecao(ctx, user);
  if (recusada) return recusada;
  ctx.reg.excecoes.splice(i, 1);
  return semConteudo();
});

// ── Parecer antecipado (FRQ-8 · RN-F6-02/03/04) ──

const ACOES_PARECER: Record<string, ResultadoParecerFranquia | 'RECALL'> = {
  aprovar: 'APROVADO',
  'aprovar-com-ressalvas': 'APROVADO_COM_RESSALVAS',
  rejeitar: 'REJEITADO',
  recall: 'RECALL',
};

const decidirParecer: MockHandler = ({ params, body, user }) => {
  const acao = ACOES_PARECER[params.acao];
  if (acao === undefined) return erro(404, 'Ação desconhecida.');
  const texto = campo(body, 'texto');
  if (texto !== undefined && texto !== null && typeof texto !== 'string') {
    return erro(400, 'A justificativa deve ser um texto.');
  }
  const reg = franquias().find((f) => f.franquiaId === params.franquiaId && f.opportunityId === params.id);
  const ctx = reg ? contexto(reg.opportunityId, reg.proposalId) : null;
  if (!ctx) return naoEncontrada();

  if (acao === 'RECALL') {
    if (!temPapel(user, ...PROPOSTA_WRITE)) return semPermissao();
    const p = ctx.reg.parecer;
    if (!p) return erro(404, 'Parecer antecipado não encontrado para esta franquia.');
    if (p.resultado !== 'REJEITADO') {
      return erro(
        400,
        `Recall não permitido: o parecer está com resultado "${p.resultado ?? 'nulo'}". ` +
          'Apenas franquias REJEITADAS podem ser reapresentadas (RN-F6-04).',
      );
    }
    Object.assign(p, {
      resultado: null,
      texto: null,
      analistaId: null,
      submetidoEm: null,
      recalledAt: agoraIso(),
      numRecalls: p.numRecalls + 1,
    });
  } else {
    if (!temPapel(user, ...PARECER_DECIDE)) return semPermissao();
    if (acao === 'REJEITADO' && !temPapel(user, ...PARECER_REJEITA)) {
      return erro(403, 'O Consultor de Expansão aprova o parecer, mas não o rejeita.');
    }
    if (ESTADOS_ENCERRADOS.includes(ctx.opp.estado)) {
      return erro(409, 'A oportunidade já passou da fase do parecer antecipado.');
    }
    const justificativa = typeof texto === 'string' ? texto.trim() : '';
    if (acao !== 'APROVADO' && justificativa === '') {
      return erro(
        400,
        acao === 'REJEITADO'
          ? 'justificativa é obrigatória para rejeição.'
          : 'justificativa é obrigatória para aprovação com ressalvas.',
      );
    }
    if (ctx.reg.parecer?.resultado) {
      return erro(409, 'O parecer antecipado desta franquia já foi emitido.');
    }
    ctx.reg.parecer = {
      numRecalls: ctx.reg.parecer?.numRecalls ?? 0,
      recalledAt: ctx.reg.parecer?.recalledAt ?? null,
      texto: justificativa === '' ? null : justificativa,
      resultado: acao,
      analistaId: user?.id ?? null,
      submetidoEm: agoraIso(),
    };
  }

  const p = ctx.reg.parecer;
  return json<ParecerAntecipadoResult>({
    franquiaId: ctx.reg.franquiaId,
    texto: p?.texto ?? null,
    resultado: p?.resultado ?? null,
    resultadoLabel: p?.resultado ? RESULTADO_LABEL[p.resultado] : null,
    numRecalls: p?.numRecalls ?? 0,
  });
};

// ───────────────────────────── Handlers: parametrização ─────────────────────────────

const semPermissaoParametrizacao = () => erro(403, 'Sem permissão para esta parametrização.');

const ratio = (v: unknown) => (typeof v === 'number' ? v.toFixed(6) : null);
const money = (v: unknown) => (typeof v === 'number' ? brl(v) : null);
const CAMPOS_FAIXA = [
  'inicioFaixaFaturamento',
  'fimFaixaFaturamento',
  'percRoyalty',
  'percRoyaltyTabaco',
  'percFundoDeMkt',
  'percFundoDeMktTabaco',
  'valorFixoRoyalty',
  'valorFixoFundoMkt',
] as const;
const PERCENTUAIS = new Set<string>(['percRoyalty', 'percRoyaltyTabaco', 'percFundoDeMkt', 'percFundoDeMktTabaco']);

function validarFaixa(b: Record<string, unknown>): Response | null {
  for (const k of CAMPOS_FAIXA) {
    const v = b[k];
    if (v === undefined || v === null) continue;
    if (!numeroValido(v)) return erro(400, `O campo "${k}" deve ser um valor numérico não negativo.`);
    if (PERCENTUAIS.has(k) && v > 1) return erro(400, `O campo "${k}" é uma fração entre 0 e 1 (ex.: 0,05 = 5%).`);
  }
  const ini = b.inicioFaixaFaturamento;
  const fim = b.fimFaixaFaturamento;
  if (typeof ini === 'number' && typeof fim === 'number' && fim < ini) {
    return erro(400, 'O fim da faixa de faturamento deve ser maior que o início.');
  }
  return null;
}

function aplicarFaixa(alvo: CatalogoRoyalty, b: Record<string, unknown>): void {
  for (const k of CAMPOS_FAIXA) {
    if (b[k] === undefined) continue;
    alvo[k] = PERCENTUAIS.has(k) ? ratio(b[k]) : money(b[k]);
  }
}

const CONFLITO_CATALOGO = 'Já existe uma entrada para esta combinação (política × formato de loja × seq).';

const criarFaixa: MockHandler = ({ body, user }) => {
  if (!temPapel(user, ...GOV_FRANQUIA_EXECUTAR)) return semPermissaoParametrizacao();
  const b = corpo(body);
  if (!isIn(MODELOS_CATALOGO, b.politica)) return erro(400, 'Política de royalty inválida.');
  if (!isIn(FORMATOS, b.formatoLoja)) return erro(400, 'Formato de loja inválido.');
  const seq = b.registroSequencial;
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 1) {
    return erro(400, 'O registro sequencial deve ser um inteiro maior ou igual a 1.');
  }
  const invalida = validarFaixa(b);
  if (invalida) return invalida;
  const politica = b.politica;
  const formato: FormatoLojaAdmin = b.formatoLoja;
  if (catalogo().some((c) => c.politica === politica && c.formatoLoja === formato && c.registroSequencial === seq)) {
    return erro(409, CONFLITO_CATALOGO);
  }
  const agora = agoraIso();
  const nova: CatalogoRoyalty = {
    id: novoId('cat'),
    politica,
    formatoLoja: formato,
    registroSequencial: seq,
    inicioFaixaFaturamento: null,
    fimFaixaFaturamento: null,
    percRoyalty: null,
    percRoyaltyTabaco: null,
    percFundoDeMkt: null,
    percFundoDeMktTabaco: null,
    valorFixoRoyalty: null,
    valorFixoFundoMkt: null,
    updatedById: user?.id ?? null,
    createdAt: agora,
    updatedAt: agora,
  };
  aplicarFaixa(nova, b);
  catalogo().push(nova);
  return json<CatalogoRoyalty>(nova, 201);
};

const alterarFaixa: MockHandler = ({ params, body, user }) => {
  if (!temPapel(user, ...GOV_FRANQUIA_EXECUTAR)) return semPermissaoParametrizacao();
  const alvo = catalogo().find((c) => c.id === params.id);
  if (!alvo) return naoEncontrado('Entrada do catálogo');
  const b = corpo(body);
  const invalida = validarFaixa(b);
  if (invalida) return invalida;
  aplicarFaixa(alvo, b);
  alvo.updatedById = user?.id ?? null;
  alvo.updatedAt = agoraIso();
  return json<CatalogoRoyalty>(alvo);
};

const removerFaixa: MockHandler = ({ params, user }) => {
  if (!temPapel(user, ...GOV_FRANQUIA_EXECUTAR)) return semPermissaoParametrizacao();
  const i = catalogo().findIndex((c) => c.id === params.id);
  if (i < 0) return naoEncontrado('Entrada do catálogo');
  catalogo().splice(i, 1);
  return semConteudo();
};

const salvarTaxa: MockHandler = ({ body, user }) => {
  if (!temPapel(user, ...GOV_FRANQUIA_EXECUTAR)) return semPermissaoParametrizacao();
  const b = corpo(body);
  if (!isIn(BANDEIRAS, b.bandeira)) return erro(400, 'Bandeira inválida.');
  if (!isIn(FORMATOS, b.formatoLoja)) return erro(400, 'Formato de loja inválido.');
  const max = b.maxParcelasTaxa;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > 60) {
    return erro(400, 'O máximo de parcelas deve ser um inteiro entre 1 e 60.');
  }
  if (b.taxaFranquiaDefaultBrl !== null && !numeroValido(b.taxaFranquiaDefaultBrl)) {
    return erro(400, 'A taxa de franquia deve ser um valor numérico não negativo, ou vazia.');
  }
  const bandeira = b.bandeira;
  const formato = b.formatoLoja;
  let linha = taxas().find((l) => l.bandeira === bandeira && l.formatoLoja === formato);
  if (!linha) {
    linha = {
      bandeira,
      formatoLoja: formato,
      taxaFranquiaDefaultBrl: null,
      maxParcelasTaxa: max,
      descricao: null,
      atualizadoPorId: null,
      updatedAt: agoraIso(),
    };
    taxas().push(linha);
  }
  linha.taxaFranquiaDefaultBrl = money(b.taxaFranquiaDefaultBrl);
  linha.maxParcelasTaxa = max;
  if (b.descricao !== undefined) linha.descricao = typeof b.descricao === 'string' && b.descricao.trim() !== '' ? b.descricao.trim() : null;
  linha.atualizadoPorId = user?.id ?? null;
  linha.updatedAt = agoraIso();
  return json<TaxaParametrizacao>(linha);
};

const salvarLimites: MockHandler = ({ body, user }) => {
  if (!temPapel(user, ...GOV_FRANQUIA_EXECUTAR)) return semPermissaoParametrizacao();
  const b = corpo(body);
  if (!isIn(BANDEIRAS, b.bandeira)) return erro(400, 'Bandeira inválida.');
  const campos = [
    'royaltyMinimoBps',
    'fundoMktMinimoBps',
    'valorFixoBrl',
    'fundoMktValorFixoBrl',
    'pisoBrl',
    'tetoBrl',
    'valorMinimoMensalBrl',
  ] as const;
  for (const k of campos) {
    const v = b[k];
    if (v !== undefined && v !== null && !numeroValido(v)) {
      return erro(400, `O campo "${k}" deve ser um valor numérico não negativo.`);
    }
  }
  for (const k of ['royaltyMinimoBps', 'fundoMktMinimoBps'] as const) {
    const v = b[k];
    if (typeof v === 'number' && (!Number.isInteger(v) || v > 10_000)) {
      return erro(400, `O campo "${k}" é em basis points inteiros (0 a 10000).`);
    }
  }
  if (b.bandeira === 'ZLUB' && b.tetoBrl !== null && b.tetoBrl !== undefined) {
    return erro(400, 'Lubrax+ não tem teto máximo de royalty — deixe o campo "Teto" vazio.');
  }
  const bandeira = b.bandeira;
  let linha = limites().find((l) => l.bandeira === bandeira);
  if (!linha) {
    linha = {
      bandeira,
      royaltyMinimoBps: null,
      fundoMktMinimoBps: null,
      valorFixoBrl: null,
      fundoMktValorFixoBrl: null,
      pisoBrl: null,
      tetoBrl: null,
      valorMinimoMensalBrl: null,
      descricao: null,
      atualizadoPorId: null,
      updatedAt: agoraIso(),
    };
    limites().push(linha);
  }
  // Substituição completa: ausente ou null limpa o patamar.
  linha.royaltyMinimoBps = typeof b.royaltyMinimoBps === 'number' ? b.royaltyMinimoBps : null;
  linha.fundoMktMinimoBps = typeof b.fundoMktMinimoBps === 'number' ? b.fundoMktMinimoBps : null;
  linha.valorFixoBrl = money(b.valorFixoBrl);
  linha.fundoMktValorFixoBrl = money(b.fundoMktValorFixoBrl);
  linha.pisoBrl = money(b.pisoBrl);
  linha.tetoBrl = money(b.tetoBrl);
  linha.valorMinimoMensalBrl = money(b.valorMinimoMensalBrl);
  if (b.descricao !== undefined) linha.descricao = typeof b.descricao === 'string' && b.descricao.trim() !== '' ? b.descricao.trim() : null;
  linha.atualizadoPorId = user?.id ?? null;
  linha.updatedAt = agoraIso();
  return json<LimiteRoyaltyParametrizacao>(linha);
};

const cadastrarCof: MockHandler = ({ body, user }) => {
  if (!temPapel(user, ...GOV_FRANQUIA_EXECUTAR)) return erro(403, 'Sem permissão para cadastrar a COF.');
  if (!(body instanceof FormData)) return erro(400, 'Corpo inválido.');
  const bandeira = body.get('bandeira');
  if (!BANDEIRAS_COF.some((x) => x.bandeira === bandeira)) return erro(400, 'Selecione a bandeira da COF.');
  const arquivo = arquivoEnviado(body);
  if (!arquivo) return erro(400, 'Anexe o arquivo da COF.');
  if (arquivo.tipo !== 'application/pdf' && !arquivo.nome.toLowerCase().endsWith('.pdf')) {
    return erro(400, 'A COF deve ser um arquivo PDF.');
  }
  if (arquivo.tamanho > 20 * 1024 * 1024) return erro(400, 'A COF excede o limite de 20 MB.');
  const obs = body.get('observacoes');
  const daBandeira = cofTemplates().filter((t) => t.bandeira === bandeira);
  daBandeira.forEach((t) => {
    t.vigente = false;
  });
  cofTemplates().push({
    id: novoId('cof'),
    bandeira: String(bandeira),
    versao: Math.max(0, ...daBandeira.map((t) => t.versao)) + 1,
    fileName: arquivo.nome,
    sizeBytes: arquivo.tamanho,
    observacoes: typeof obs === 'string' && obs.trim() !== '' ? obs.trim() : null,
    cadastradaPor: user?.name ?? null,
    cadastradaEm: agoraIso(),
    vigente: true,
  });
  return json<CofTemplateList>(listaCof());
};

// ───────────────────────────── Registro ─────────────────────────────

const P = '/opportunities/:id/franquia/:proposalId';

rotas('franquia', [
  // Proposta de franquia (FRQ-F1..F6)
  { method: 'POST', pattern: '/opportunities/:id/franquia', handler: criarProposta },
  {
    method: 'GET',
    pattern: `${P}/contrato`,
    handler: comProposta((ctx, { user }) => json<PropostaFranquiaReadModel>(readModel(ctx, user))),
  },
  { method: 'PATCH', pattern: `${P}/dados`, handler: atualizarDados },
  { method: 'PATCH', pattern: `${P}/potencial`, handler: definirPotencial },
  { method: 'POST', pattern: `${P}/fap`, handler: anexarFap },
  { method: 'POST', pattern: `${P}/fap/:docId`, handler: removerFap },
  { method: 'DELETE', pattern: `${P}/fap/:docId`, handler: removerFap },
  { method: 'GET', pattern: `${P}/fap/:docId/stream`, handler: streamFap },
  { method: 'GET', pattern: `${P}/cof/:templateId/stream`, handler: streamCof },
  { method: 'PUT', pattern: `${P}/modelo-loja`, handler: definirModeloLoja },
  { method: 'PUT', pattern: `${P}/royalty`, handler: definirRoyalty },
  { method: 'PUT', pattern: `${P}/maturacao`, handler: definirMaturacao },
  { method: 'POST', pattern: `${P}/royalty-premiado/aceitar`, handler: aceitarPremiado },
  { method: 'POST', pattern: `${P}/excecoes`, handler: criarExcecao },
  { method: 'PATCH', pattern: `${P}/excecoes/:excecaoId`, handler: alterarExcecao },
  { method: 'POST', pattern: `${P}/excecoes/:excecaoId`, handler: removerExcecao },
  { method: 'DELETE', pattern: `${P}/excecoes/:excecaoId`, handler: removerExcecao },
  { method: 'POST', pattern: '/opportunities/:id/franquia-parecer/:franquiaId/:acao', handler: decidirParecer },

  // Parametrização de franquias (aba "Franquias" da Governança · FRQ-16)
  {
    method: 'GET',
    pattern: '/franquia-parametrizacao/catalogo-royalties',
    handler: () => {
      const items = [...catalogo()].sort(
        (a, b) =>
          a.formatoLoja.localeCompare(b.formatoLoja) ||
          MODELOS_CATALOGO.indexOf(a.politica) - MODELOS_CATALOGO.indexOf(b.politica) ||
          a.registroSequencial - b.registroSequencial,
      );
      return json<CatalogoRoyaltyList>({ items, total: items.length });
    },
  },
  { method: 'POST', pattern: '/franquia-parametrizacao/catalogo-royalties', handler: criarFaixa },
  {
    method: 'GET',
    pattern: '/franquia-parametrizacao/catalogo-royalties/validacoes',
    handler: ({ query }) =>
      json<RoyaltyPolicyValidacoes>(validacoes(query.get('bandeira') || null, query.get('formatoLoja') || null)),
  },
  { method: 'PUT', pattern: '/franquia-parametrizacao/catalogo-royalties/:id', handler: alterarFaixa },
  { method: 'POST', pattern: '/franquia-parametrizacao/catalogo-royalties/:id', handler: removerFaixa },
  { method: 'DELETE', pattern: '/franquia-parametrizacao/catalogo-royalties/:id', handler: removerFaixa },
  {
    method: 'GET',
    pattern: '/franquia-parametrizacao/taxa-franquia',
    handler: () => json<TaxaParametrizacaoList>({ items: taxas(), total: taxas().length }),
  },
  { method: 'PUT', pattern: '/franquia-parametrizacao/taxa-franquia', handler: salvarTaxa },
  {
    method: 'GET',
    pattern: '/franquia-parametrizacao/limites-royalty',
    handler: () => json<LimiteRoyaltyParametrizacaoList>({ items: limites(), total: limites().length }),
  },
  { method: 'PUT', pattern: '/franquia-parametrizacao/limites-royalty', handler: salvarLimites },
  {
    method: 'GET',
    pattern: '/franquia-parametrizacao/cof',
    handler: ({ user }) =>
      temPapel(user, ...GOV_FRANQUIA_VISUALIZAR) ? json<CofTemplateList>(listaCof()) : semPermissaoParametrizacao(),
  },
  { method: 'POST', pattern: '/franquia-parametrizacao/cof', handler: cadastrarCof },
  {
    method: 'GET',
    pattern: '/franquia-parametrizacao/cof/:templateId/download',
    handler: ({ params, user }) => {
      if (!temPapel(user, ...GOV_FRANQUIA_VISUALIZAR)) return erro(403, 'Sem permissão para acessar a COF.');
      const t = cofTemplates().find((x) => x.id === params.templateId);
      if (!t) return erro(404, 'Versão da COF não encontrada.');
      return pdf(`COF ${t.bandeira} versão ${t.versao}`, t.fileName);
    },
  },
]);
