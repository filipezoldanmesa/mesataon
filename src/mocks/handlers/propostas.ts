import { mapPostoPhoto, mapPostoPhotos, type BackendPostoPhoto, type PostoPhoto } from '@/lib/analise/posto-photo-mapping';
import type { ProposalIndicatorsSnapshot } from '@/lib/opportunities-indicators/types';
import type { AdicionarObraInvestimentosPayload, AdicionarObraRecursosPayload } from '@/lib/obras/obra-da-proposta.api';
import type { Obra } from '@/lib/obras/obra-mapping';
import type {
  CreateFinancialItemInput,
  FinancialItem,
  FinancialItemMutationResult,
  FinancialItemsSnapshot,
  FinancialItemType,
  SeedRequiredResult,
  UpdateFinancialItemInput,
} from '@/lib/proposals/financial-items.types';
import type {
  BpBudget,
  CreateFinancialResourceInput,
  FinancialResource,
  FinancialResourceMutationResult,
  FinancialResourcesListResult,
  UpdateFinancialResourceInput,
} from '@/lib/proposals/financial-resources.types';
import {
  familiaDoTipo,
  isTipoInvestimento,
  type CreateInvestmentInput,
  type Investment,
  type InvestmentsListResult,
  type UpdateInvestmentInput,
} from '@/lib/proposals/investments.types';
import type { PostoSituation, UpsertPostoSituationInput } from '@/lib/proposals/posto-situation.types';
import type { CommercialTerms, ProductDefaults } from '@/lib/proposals/product-lines.api';
import type {
  CreateProposalPayload,
  CreateProposalResult,
  ProposalDateConstraints,
} from '@/lib/proposals/proposal-creation.types';
import type { BackendUpdateProposalResponse } from '@/lib/proposals/proposal-mapping';
import type { SolicitarAjusteResult } from '@/lib/proposals/solicitar-ajuste.api';
import type { ProposalSupplyCenters } from '@/lib/proposals/supply-centers.types';
import type { ProductBatchDraft, ProductBatchRow, ProductBatchRowError } from '@/lib/proposals/product-batch.types';
import { deriveDaysFromSapCode } from '@/lib/proposals/sap-payment-term-days';
import type { EligibleProductListing, MarketIntelligence, ProductLine, UpsertProductLineInput } from '@/lib/proposals/types';
import {
  Finalidade,
  PropriedadeImovel,
  SituacaoPosto,
  TipoRegistroRecursoFinanceiro,
} from '@/lib/picklists/salesforce-values';

import { arquivoEnviado, erro, imagem, json, okVazio, pdf, semConteudo, semPermissao } from '../core/respostas';
import { rotas, type MockContext } from '../core/router';
import { temPapel, type MockUser } from '../core/session';
import { agoraIso, fatia, novoId } from '../core/store';
import { moverPara, oportunidade, oportunidades } from '../estado-compartilhado';
import type { OportunidadeElenco, PropostaElenco } from '../elenco';
// A obra do Converge e o vínculo dela com a oportunidade são do domínio `contrato`.
import { desvincularObra, obrasDoCliente, vincularObra } from './contrato';
import {
  addDias,
  arred,
  basePorCodigo,
  basePorNome,
  basesDaProposta,
  CLIENTES_COM_ALLOWLIST,
  cpvNaBase,
  hojeIso,
  mesesEntre,
  parseIso,
  primeiroDoMesSeguinte,
  produtoPorCodigo,
  PRODUTOS,
  temCpv,
  tipoItemPorId,
  TIPOS_ITEM_FINANCEIRO,
} from '../dados/propostas/catalogo';
import {
  calcularIndicadores,
  dadosIniciais,
  derivarInvestimento,
  derivarItem,
  derivarLinha,
  derivarRecurso,
  estadoDaProposta,
  estadoPosteriorAAnalise,
  estadoVazio,
  investimentoVazio,
  itemDoTipo,
  itemObra,
  localizarProposta,
  marcarDesatualizado,
  propostaDto,
  recursosDaObra,
  recursoVazio,
  registrarEstado,
  resumoFinanceiro,
  type EstadoProposta,
  type PropostaDto,
} from '../dados/propostas/estado';

/**
 * Domínio `propostas` — a proposta PCR (posto) e os blocos da tela
 * `/oportunidades/[id]/propostas/[proposalId]`.
 *
 * Cada rota devolve o que a BFF de produção devolve ao browser: os passthroughs
 * (`GET /api/proposals/:id`, produtos, recursos, itens…) no formato do backend,
 * que é o tipo do front; as rotas mapeadas (inteligência de mercado, fotos,
 * produtos elegíveis, bases) no tipo do mapper. Erros de regra de negócio
 * atravessam como o envelope do backend (`{ statusCode, code, message }`) — é a
 * frase dele que a tela mostra.
 */

// ───────────────────────────── Papéis ─────────────────────────────

/** `POSTO_PROPOSAL_WRITE_ROLES` do backend (LT_AUTHORITY + GV + SNEG + BP + ADMIN). */
const ESCRITA = ['LT', 'EXPANSAO', 'SPCOM', 'TI_SUSTENTACAO', 'GERENTE_VAREJO', 'SNEG', 'BP_FINANCEIRO', 'ADMIN'];
/** `POSTO_PHOTO_WRITE_ROLES` — a criação de franquia também sobe fotos. */
const ESCRITA_FOTOS = [...ESCRITA, 'CONSULTOR_EXPANSAO'];
/** `BP_BUDGET_VIEW_ROLES` — fora dela a verba é OMITIDA (decisão de visibilidade). */
const VE_VERBA_BP = ['BP_FINANCEIRO', 'SNEG', 'ADMIN', 'GERENTE_VAREJO', 'TI_SUSTENTACAO'];

// ───────────────────────────── Respostas ─────────────────────────────

/** Recusa no envelope do backend, que a BFF repassa verbatim. */
function recusa(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json({ statusCode: status, code, message, error: message, ...extra }, status);
}

function validacao(campos: Array<{ field: string; message: string }>): Response {
  return json(
    {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: campos.map((c) => c.message).join(' '),
      error: campos.map((c) => c.message).join(' '),
      errors: campos.map((c) => ({ ...c, code: 'INVALID' })),
    },
    400,
  );
}

const PROPOSTA_NAO_ENCONTRADA = () => erro(404, 'Proposta não encontrada.');

interface Carregada {
  e: EstadoProposta;
  proposta: PropostaElenco;
  opp: OportunidadeElenco;
}

function carregar(id: string): Carregada | null {
  const achado = localizarProposta(id);
  const e = estadoDaProposta(id);
  if (!achado || !e) return null;
  return { e, proposta: achado.proposta, opp: achado.oportunidade };
}

/** Papel + trava de fase (`assertFaseEditavel`: recusa só a fase POSTERIOR à análise). */
function travaDeEscrita(user: MockUser | null, c: Carregada, papeis = ESCRITA): Response | null {
  if (!temPapel(user, ...papeis)) return semPermissao();
  if (estadoPosteriorAAnalise(c.opp.estado)) {
    return recusa(
      400,
      'BAD_REQUEST',
      `A oportunidade já saiu da fase de análise (estado atual: ${c.opp.estado}) — a proposta é somente leitura a partir daqui.`,
    );
  }
  return null;
}

function corpo<T>(ctx: MockContext): Partial<T> {
  return (ctx.body && typeof ctx.body === 'object' && !(ctx.body instanceof FormData) ? ctx.body : {}) as Partial<T>;
}

const naoVazio = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isoValida = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(parseIso(v).getTime());
const brData = (s: string) => s.slice(0, 10).split('-').reverse().join('/');

// ───────────────────────────── Proposta ─────────────────────────────

function proximoCodigo(): string {
  let max = 100;
  for (const o of oportunidades()) {
    for (const p of o.propostas) {
      const m = /^PCR-GOP-(\d+)\//.exec(p.codigo);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return `PCR-GOP-${String(max + 1).padStart(8, '0')}/2026`;
}

function limitesDeData(): ProposalDateConstraints {
  const proximo = primeiroDoMesSeguinte(hojeIso());
  return { minDataInicioAnalise: proximo, minDataFimAnalise: proximo, inicioConsumo: proximo };
}

function criarProposta(ctx: MockContext): Response {
  const b = corpo<CreateProposalPayload>(ctx);
  if (!naoVazio(b.opportunityId)) return erro(400, 'Campo opportunityId é obrigatório.');
  const opp = oportunidade(b.opportunityId);
  if (!opp) return recusa(404, 'NOT_FOUND', 'Oportunidade não encontrada.');
  if (!temPapel(ctx.user, ...ESCRITA)) return semPermissao();

  const faltas: Array<{ field: string; message: string }> = [];
  if (!naoVazio(b.tipoContrato)) faltas.push({ field: 'tipoContrato', message: 'Informe o tipo de contrato.' });
  if (!naoVazio(b.finalidade)) faltas.push({ field: 'finalidade', message: 'Informe a finalidade da proposta.' });
  if (!isoValida(b.dataInicioAnalise)) faltas.push({ field: 'dataInicioAnalise', message: 'Informe a data de início da análise.' });
  if (!isoValida(b.dataFimAnalise)) faltas.push({ field: 'dataFimAnalise', message: 'Informe a data fim da análise.' });
  if (faltas.length) return validacao(faltas);

  const inicio = (b.dataInicioAnalise as string).slice(0, 10);
  const fim = (b.dataFimAnalise as string).slice(0, 10);
  const lim = limitesDeData();
  if (inicio < lim.minDataInicioAnalise) {
    return recusa(400, 'BAD_REQUEST', `A data de início da análise precisa ser igual ou posterior a ${brData(lim.minDataInicioAnalise)} — o CRM recusa cotação que começa no mês corrente.`);
  }
  if (fim < inicio || fim < lim.minDataFimAnalise) {
    return recusa(400, 'BAD_REQUEST', `A data fim da análise precisa ser igual ou posterior a ${brData(fim < inicio ? inicio : lim.minDataFimAnalise)}.`);
  }

  const id = novoId('prp');
  const codigo = proximoCodigo();
  const proposta: PropostaElenco = { id, codigo, tipo: 'PCR', status: 'EM_PREENCHIMENTO', eleita: false, valorEstimado: 0 };
  opp.propostas.push(proposta);
  const agora = agoraIso();
  const dados = dadosIniciais(
    opp,
    proposta,
    {
      finalidade: b.finalidade as Finalidade,
      tipoContrato: b.tipoContrato as PropostaDto['tipoContrato'],
      aceleraMais: b.aceleraMais === true,
      possuiInvestimentos: b.possuiInvestimentos === true,
    },
    agora,
    inicio,
    fim,
  );
  dados.criadoPorId = ctx.user?.id ?? opp.ltId;
  registrarEstado(id, estadoVazio(dados));

  return json<CreateProposalResult>({ id, code: codigo, requiresManagerApproval: b.aceleraMais !== true }, 201);
}

function obterProposta({ params }: MockContext): Response {
  const dto = propostaDto(params.id);
  return dto ? json<PropostaDto>(dto) : PROPOSTA_NAO_ENCONTRADA();
}

function atualizarProposta(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  if (!temPapel(ctx.user, ...ESCRITA)) return erro(403, 'Acesso negado.');
  const b = corpo<{ minutaPadrao: boolean; netlexConsultaCodigo: string }>(ctx);
  if (typeof b.minutaPadrao !== 'boolean') {
    return validacao([{ field: 'minutaPadrao', message: 'Informe se a proposta segue a minuta padrão.' }]);
  }
  const codigo = naoVazio(b.netlexConsultaCodigo) ? b.netlexConsultaCodigo.trim() : null;
  if (b.minutaPadrao && codigo) {
    return recusa(400, 'BAD_REQUEST', 'Proposta com minuta padrão não leva código de consulta jurídica (Netlex).');
  }
  if (c.opp.estado === 'CONCLUIDA') {
    return recusa(400, 'BAD_REQUEST', 'A oportunidade está concluída — a minuta não pode mais ser alterada.');
  }
  c.e.dados.minutaPadrao = b.minutaPadrao;
  c.e.dados.netlexConsultaCodigo = b.minutaPadrao ? null : codigo;
  c.e.dados.updatedAt = agoraIso();
  return json<BackendUpdateProposalResponse>({
    id: ctx.params.id,
    minutaPadrao: c.e.dados.minutaPadrao,
    netlexConsultaCodigo: c.e.dados.netlexConsultaCodigo,
    netlexConsultaStatus: c.e.dados.netlexConsultaCodigo ? 'CONCLUIDA' : null,
    consultaJuridicaPendente: !c.e.dados.minutaPadrao && !c.e.dados.netlexConsultaCodigo,
    requiresReapproval: false,
  });
}

function alterarPeriodo(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  if (!temPapel(ctx.user, ...ESCRITA)) return semPermissao();
  const b = corpo<{ dataInicioAnalise: string; dataFimAnalise: string }>(ctx);
  if (!isoValida(b.dataInicioAnalise) || !isoValida(b.dataFimAnalise)) {
    return validacao([{ field: 'dataInicioAnalise', message: 'Informe as duas datas do período da análise.' }]);
  }
  if (estadoPosteriorAAnalise(c.opp.estado)) {
    return recusa(400, 'BAD_REQUEST', 'O período da análise não pode ser alterado após o envio para aprovação.');
  }
  const inicio = b.dataInicioAnalise.slice(0, 10);
  const fim = b.dataFimAnalise.slice(0, 10);
  if (fim < inicio) {
    return recusa(400, 'BAD_REQUEST', `A data fim precisa ser igual ou posterior a ${brData(inicio)}.`);
  }
  c.e.dados.dataInicioAnalise = inicio;
  c.e.dados.dataFimAnalise = fim;
  marcarDesatualizado(c.e);
  return json<PropostaDto>(propostaDto(ctx.params.id) as PropostaDto);
}

function devolver(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  if (!temPapel(ctx.user, 'SNEG', 'ADMIN')) return semPermissao();
  const b = corpo<{ motivo: string }>(ctx);
  if (!naoVazio(b.motivo)) return validacao([{ field: 'motivo', message: 'Informe o motivo da devolução.' }]);
  if (c.proposta.status !== 'EM_ANALISE') {
    return recusa(400, 'BAD_REQUEST', `Proposta não está em análise (status atual: ${c.proposta.status}).`);
  }
  if (c.opp.estado !== 'EM_ANALISE') {
    return recusa(400, 'BAD_REQUEST', `Não é possível devolver a proposta ao LT: a oportunidade já saiu da fase de análise (estado atual: ${c.opp.estado}).`);
  }
  c.proposta.status = 'DEVOLVIDA';
  c.e.dados.motivoDevolucao = b.motivo.trim();
  c.e.dados.devolvidaEm = agoraIso();
  c.e.dados.updatedAt = agoraIso();
  // Desde 28/08/2026 a devolução leva a OPORTUNIDADE de volta ao preenchimento.
  moverPara(c.opp.id, 'EM_PREENCHIMENTO');
  return okVazio();
}

function reenviar(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  if (!temPapel(ctx.user, 'LT', 'ADMIN')) return semPermissao();
  if (c.proposta.status !== 'DEVOLVIDA') {
    return recusa(400, 'BAD_REQUEST', `Proposta não está devolvida (status atual: ${c.proposta.status}).`);
  }
  if (c.opp.estado !== 'EM_ANALISE') {
    return recusa(
      400,
      'BAD_REQUEST',
      `A oportunidade não está em análise (estado atual: ${c.opp.estado}). Corrija os pontos apontados e envie a oportunidade para análise — as propostas devolvidas voltam junto.`,
    );
  }
  c.proposta.status = 'EM_ANALISE';
  c.e.dados.motivoDevolucao = null;
  c.e.dados.devolvidaEm = null;
  c.e.dados.updatedAt = agoraIso();
  return json<PropostaDto>(propostaDto(ctx.params.id) as PropostaDto);
}

const BLOCOS_AJUSTE = [
  'dados',
  'situacao',
  'fotos',
  'produtos',
  'recursos',
  'financeiro',
  'dados_franquia',
  'fap_potencial',
  'modelo_parametros',
  'estrutura_excecoes',
  'cof',
  'parecer_franquia',
];
let contadorPendencia = 3100;

function solicitarAjuste(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  if (!temPapel(ctx.user, 'SNEG', 'ADMIN', 'GESTOR_FRANQUIAS')) return semPermissao();
  const b = corpo<{ bloco: string; comentario: string; fotoRef: string }>(ctx);
  if (!naoVazio(b.bloco) || !BLOCOS_AJUSTE.includes(b.bloco)) {
    return validacao([{ field: 'bloco', message: 'Bloco da proposta inválido.' }]);
  }
  if (!naoVazio(b.comentario)) return validacao([{ field: 'comentario', message: 'Descreva o ajuste que o LT precisa fazer.' }]);
  if (b.fotoRef && b.bloco !== 'fotos') {
    return validacao([{ field: 'fotoRef', message: 'A referência de foto só vale para o bloco de fotos.' }]);
  }
  if (!(c.proposta.status === 'EM_ANALISE' && c.opp.estado === 'EM_ANALISE')) {
    return recusa(400, 'BAD_REQUEST', 'A proposta não está em análise — não é possível solicitar ajuste agora.');
  }
  // Idempotente por bloco: a segunda solicitação acrescenta o comentário à mesma pendência.
  let aberto = c.e.ajustes[b.bloco];
  if (!aberto) {
    contadorPendencia += 1;
    aberto = { pendenciaId: novoId('pend'), pendenciaCode: `PN-${contadorPendencia}`, comentarios: [] };
    c.e.ajustes[b.bloco] = aberto;
  }
  aberto.comentarios.push(b.comentario.trim());
  return json<SolicitarAjusteResult>(
    { proposalId: ctx.params.id, bloco: b.bloco, pendenciaId: aberto.pendenciaId, pendenciaCode: aberto.pendenciaCode },
    201,
  );
}

// ───────────────────────────── Produtos ─────────────────────────────

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function allowlistDe(c: Carregada): string[] | null {
  return CLIENTES_COM_ALLOWLIST[c.opp.clienteSap] ?? null;
}

function elegivel(c: Carregada, codigo: string): boolean {
  const lista = allowlistDe(c);
  return !!produtoPorCodigo(codigo) && (!lista || lista.includes(codigo));
}

function produtoNaoElegivel(c: Carregada, codigo: string): Response {
  const lista = allowlistDe(c);
  return recusa(
    400,
    'PRODUCT_NOT_ELIGIBLE',
    lista
      ? `O produto ${codigo} não está cadastrado em "Produtos Elegíveis" para este cliente no Salesforce — cadastre-o lá ou escolha outro produto.`
      : `O produto ${codigo} não é elegível para a área de venda desta oportunidade.`,
  );
}

function produtosElegiveis(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const lista = allowlistDe(c);
  const q = semAcento(ctx.query.get('q')?.trim() ?? '');
  const base = ctx.query.get('base')?.trim() || null;
  const produtos = PRODUTOS.filter((p) => !lista || lista.includes(p.codigo))
    .filter((p) => !q || semAcento(p.nome).includes(q) || p.codigo.includes(q))
    .map((p) => ({
      codigo: p.codigo,
      nome: p.nome,
      cpvDisponivel: base ? temCpv(p.codigo, base) : null,
      elegivelParaCliente: lista ? true : null,
    }));
  return json<EligibleProductListing>({ produtos, restritaAoCliente: !!lista, restritaPorFamilia: false });
}

function listarLinhas({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  return json<ProductLine[]>(c.e.produtos.map(derivarLinha));
}

function emMaturacao(c: Carregada): boolean {
  const s = c.e.situacao?.situacaoPosto;
  return s === SituacaoPosto.AConstruir || s === SituacaoPosto.EmConstrucao || s === SituacaoPosto.Paralisado;
}

/** Valida e monta a linha (create e replace compartilham a regra). */
function montarLinha(c: Carregada, b: Partial<UpsertProductLineInput>, anterior: ProductLine | null): ProductLine | Response {
  if (!naoVazio(b.produtoCodigo) || !elegivel(c, b.produtoCodigo)) return produtoNaoElegivel(c, String(b.produtoCodigo ?? ''));
  const faltas: Array<{ field: string; message: string }> = [];
  if (typeof b.volume !== 'number' || !(b.volume > 0)) faltas.push({ field: 'volume', message: 'O volume precisa ser maior que zero.' });
  if (!naoVazio(b.incoterm)) faltas.push({ field: 'incoterm', message: 'Informe o incoterm.' });
  if (typeof b.prazoPagamentoDias !== 'number' || b.prazoPagamentoDias < 0) {
    faltas.push({ field: 'prazoPagamentoDias', message: 'Informe o prazo de pagamento.' });
  }
  if (!isoValida(b.fimConsumo)) faltas.push({ field: 'fimConsumo', message: 'Informe o fim do consumo.' });
  if (faltas.length) return validacao(faltas);

  const d = c.e.dados;
  const padraoInicio = [primeiroDoMesSeguinte(hojeIso()), d.dataInicioAnalise].sort().reverse()[0];
  const inicio = isoValida(b.inicioConsumo) ? b.inicioConsumo.slice(0, 10) : padraoInicio;
  const fim = (b.fimConsumo as string).slice(0, 10);
  if (fim > d.dataFimAnalise) {
    return recusa(422, 'UNPROCESSABLE_ENTITY', `Fim do consumo (${brData(fim)}) não pode ser posterior ao fim da análise da proposta (${brData(d.dataFimAnalise)}).`);
  }
  if (inicio > fim) {
    return recusa(422, 'UNPROCESSABLE_ENTITY', `O início do consumo (${brData(inicio)}) não pode ser posterior ao fim (${brData(fim)}).`);
  }
  const base = basePorCodigo(b.baseCodigo) ?? basePorNome(b.base);
  const produto = produtoPorCodigo(b.produtoCodigo);
  if (!produto) return produtoNaoElegivel(c, b.produtoCodigo);
  if (base && !temCpv(produto.codigo, base.code)) {
    return recusa(400, 'BAD_REQUEST', `Não há CPV cadastrado para ${produto.nome} na ${base.name}. Escolha outra base ou outro produto.`);
  }
  const agora = agoraIso();
  const margem = typeof b.margemProposta === 'number' ? b.margemProposta : produto.margemSugerida;
  return derivarLinha({
    id: anterior?.id ?? novoId('pl'),
    proposalId: c.proposta.id,
    produtoCodigo: produto.codigo,
    produtoNome: produto.nome,
    base: base?.name ?? b.base ?? '',
    baseCodigo: base?.code ?? null,
    volume: b.volume as number,
    incoterm: b.incoterm as string,
    prazoPagamentoDias: b.prazoPagamentoDias as number,
    prazoPagamento: naoVazio(b.prazoPagamento) ? b.prazoPagamento : null,
    inicioConsumo: inicio,
    fimConsumo: fim,
    hvMeses: 0,
    maturacaoAplicada: emMaturacao(c),
    cpv: cpvNaBase(produto, base?.code ?? null),
    margemBp: produto.margemBp,
    margemSugerida: produto.margemSugerida,
    margemProposta: margem,
    precoFinal: 0,
    createdAt: anterior?.createdAt ?? agora,
    updatedAt: agora,
  });
}

function criarLinha(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const r = montarLinha(c, corpo<UpsertProductLineInput>(ctx), null);
  if (r instanceof Response) return r;
  c.e.produtos.push(r);
  marcarDesatualizado(c.e);
  return json<ProductLine>(r, 201);
}

function substituirLinha(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  const i = c ? c.e.produtos.findIndex((l) => l.id === ctx.params.lineId) : -1;
  if (!c || i < 0) return erro(404, 'Proposta ou produto não encontrado.');
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const r = montarLinha(c, corpo<UpsertProductLineInput>(ctx), c.e.produtos[i]);
  if (r instanceof Response) return r;
  c.e.produtos[i] = r;
  marcarDesatualizado(c.e);
  return json<ProductLine>(r);
}

function removerLinha(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  const i = c ? c.e.produtos.findIndex((l) => l.id === ctx.params.lineId) : -1;
  if (!c || i < 0) return erro(404, 'Proposta ou produto não encontrado.');
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava.status === 403 ? erro(403, 'Sem permissão.') : trava;
  c.e.produtos.splice(i, 1);
  marcarDesatualizado(c.e);
  return semConteudo();
}

// ───────────────────── Inclusão de produtos em lote (US 69180) ─────────────────────

/** Rascunho da tabela de inclusão, por proposta (o autosave grava aqui). */
const rascunhos = fatia<Record<string, ProductBatchDraft>>('propostas-rascunho-produtos', () => ({}));

/**
 * Prazo de pagamento da negociação (NEG) vigente do cliente para o produto. Mock:
 * o Arla 32 não tem NEG, então vem vazio — a regra é "sem NEG, o campo fica vazio".
 */
function prazoDaNeg(codigo: string): string {
  if (codigo === '7450') return '';
  return codigo.startsWith('742') || codigo.startsWith('743') ? 'Z030' : 'Z015';
}

/** A linha com TODAS as sugestões do backend — o que a tela mostra ao abrir. */
function linhaSugerida(c: Carregada, codigo: string): ProductBatchRow | null {
  const p = produtoPorCodigo(codigo);
  if (!p) return null;
  const d = c.e.dados;
  const base = basePorCodigo(d.supplyCenterCode);
  const inicio = [primeiroDoMesSeguinte(hojeIso()), d.dataInicioAnalise].sort().reverse()[0];
  const mesa = Math.max(20, Math.round(p.mix * 400));
  return {
    produtoCodigo: p.codigo,
    produtoNome: p.nome,
    base: base?.name ?? '',
    baseCodigo: base?.code ?? null,
    selecionado: true,
    inicioConsumo: inicio,
    fimConsumo: d.dataFimAnalise,
    hvMeses: mesesEntre(inicio, d.dataFimAnalise),
    quantidadeMesa: mesa,
    volume: mesa,
    margemRealizada: p.margemSugerida,
    margemProposta: null,
    incoterm: d.incotermPadrao ?? '',
    prazoPagamento: prazoDaNeg(p.codigo),
  };
}

/** Rascunho novo: os produtos elegíveis que ainda não estão na proposta (só com cadastro do cliente). */
function rascunhoNovo(c: Carregada): ProductBatchDraft {
  const lista = allowlistDe(c);
  const jaNaProposta = new Set(c.e.produtos.map((l) => l.produtoCodigo));
  const linhas = (lista ?? [])
    .filter((codigo) => !jaNaProposta.has(codigo))
    .map((codigo) => linhaSugerida(c, codigo))
    .filter((l): l is ProductBatchRow => l !== null);
  return { linhas, restritaAoCliente: !!lista, atualizadoEm: null };
}

/** Recalcula o que é derivado (o horizonte de vendas) — a tela nunca o calcula. */
function recalcularLote(d: ProductBatchDraft): ProductBatchDraft {
  return {
    ...d,
    linhas: d.linhas.map((l) => ({
      ...l,
      hvMeses: isoValida(l.inicioConsumo) && isoValida(l.fimConsumo) ? mesesEntre(l.inicioConsumo, l.fimConsumo) : null,
    })),
  };
}

function lerRascunho({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const salvo = rascunhos()[params.id];
  if (!salvo) return json<ProductBatchDraft>(rascunhoNovo(c));
  // Produto que entrou na proposta por outro caminho sai da tabela.
  const jaNaProposta = new Set(c.e.produtos.map((l) => l.produtoCodigo));
  return json<ProductBatchDraft>({ ...salvo, linhas: salvo.linhas.filter((l) => !jaNaProposta.has(l.produtoCodigo)) });
}

function gravarRascunho(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const linhas = corpo<{ linhas: ProductBatchRow[] }>(ctx).linhas;
  if (!Array.isArray(linhas)) return validacao([{ field: 'linhas', message: 'Informe as linhas do rascunho.' }]);
  const novo = recalcularLote({ linhas, restritaAoCliente: !!allowlistDe(c), atualizadoEm: agoraIso() });
  rascunhos()[ctx.params.id] = novo;
  return json<ProductBatchDraft>(novo);
}

function limparRascunho(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  delete rascunhos()[ctx.params.id];
  return json<ProductBatchDraft>(rascunhoNovo(c));
}

function adicionarAoRascunho(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const codigo = corpo<{ produtoCodigo: string }>(ctx).produtoCodigo;
  if (!naoVazio(codigo) || !elegivel(c, codigo)) return produtoNaoElegivel(c, String(codigo ?? ''));
  if (c.e.produtos.some((l) => l.produtoCodigo === codigo)) {
    return recusa(400, 'BAD_REQUEST', 'Este produto já está na proposta.');
  }
  const linha = linhaSugerida(c, codigo);
  if (!linha) return produtoNaoElegivel(c, codigo);
  return json<ProductBatchRow>(
    recalcularLote({ linhas: [linha], restritaAoCliente: !!allowlistDe(c), atualizadoEm: null }).linhas[0],
    201,
  );
}

/** O veredito das linhas marcadas — uma entrada por campo faltando. */
function errosDoLote(c: Carregada, linhas: ProductBatchRow[]): ProductBatchRowError[] {
  const d = c.e.dados;
  const erros: ProductBatchRowError[] = [];
  const falta = (l: ProductBatchRow, field: string, message: string) =>
    erros.push({ produtoCodigo: l.produtoCodigo, field, message: `${l.produtoNome}: ${message}` });
  for (const l of linhas) {
    if (!elegivel(c, l.produtoCodigo)) falta(l, 'produtoCodigo', 'produto não elegível para esta proposta.');
    if (c.e.produtos.some((x) => x.produtoCodigo === l.produtoCodigo)) falta(l, 'produtoCodigo', 'já está na proposta.');
    if (typeof l.volume !== 'number' || !(l.volume > 0)) falta(l, 'volume', 'informe o volume (maior que zero).');
    if (!naoVazio(l.incoterm)) falta(l, 'incoterm', 'informe o incoterm.');
    if (!naoVazio(l.prazoPagamento) || deriveDaysFromSapCode(l.prazoPagamento) === null) {
      falta(l, 'prazoPagamento', 'informe o prazo de pagamento.');
    }
    if (!isoValida(l.inicioConsumo)) falta(l, 'inicioConsumo', 'informe o início do consumo.');
    if (!isoValida(l.fimConsumo)) falta(l, 'fimConsumo', 'informe o fim do consumo.');
    if (isoValida(l.fimConsumo) && l.fimConsumo.slice(0, 10) > d.dataFimAnalise) {
      falta(l, 'fimConsumo', `o fim do consumo não pode passar de ${brData(d.dataFimAnalise)} (fim da análise).`);
    }
    if (isoValida(l.inicioConsumo) && isoValida(l.fimConsumo) && l.inicioConsumo.slice(0, 10) > l.fimConsumo.slice(0, 10)) {
      falta(l, 'inicioConsumo', 'o início do consumo não pode ser posterior ao fim.');
    }
    if (l.baseCodigo && !temCpv(l.produtoCodigo, l.baseCodigo)) falta(l, 'base', 'sem CPV cadastrado na base.');
  }
  return erros;
}

function salvarLote(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const enviadas = corpo<{ linhas: ProductBatchRow[] }>(ctx).linhas;
  const marcadas = Array.isArray(enviadas) ? enviadas.filter((l) => l.selecionado) : [];
  if (marcadas.length === 0) {
    return recusa(400, 'BAD_REQUEST', 'Marque ao menos um produto para salvar.', { errors: [] });
  }
  const erros = errosDoLote(c, marcadas);
  if (erros.length > 0) {
    return recusa(400, 'VALIDATION_ERROR', 'Corrija os campos indicados antes de salvar.', { errors: erros });
  }
  const criadas: ProductLine[] = [];
  for (const l of marcadas) {
    const r = montarLinha(
      c,
      {
        produtoCodigo: l.produtoCodigo,
        base: l.base || undefined,
        baseCodigo: l.baseCodigo ?? undefined,
        volume: l.volume as number,
        margemProposta: typeof l.margemProposta === 'number' ? l.margemProposta : undefined,
        inicioConsumo: l.inicioConsumo,
        fimConsumo: l.fimConsumo,
        incoterm: l.incoterm,
        prazoPagamentoDias: deriveDaysFromSapCode(l.prazoPagamento) as number,
        prazoPagamento: l.prazoPagamento,
      },
      null,
    );
    if (r instanceof Response) return r;
    criadas.push(r);
  }
  // Tudo ou nada: só agora a proposta ganha as linhas e o rascunho perde as marcadas.
  c.e.produtos.push(...criadas);
  marcarDesatualizado(c.e);
  const salvo = rascunhos()[ctx.params.id];
  const codigos = new Set(criadas.map((l) => l.produtoCodigo));
  if (salvo) rascunhos()[ctx.params.id] = { ...salvo, linhas: salvo.linhas.filter((l) => !codigos.has(l.produtoCodigo)) };
  return json<ProductLine[]>(criadas, 200);
}

function termosComerciais(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const b = corpo<{ produtoCodigo: string; incoterm: string }>(ctx);
  if (!naoVazio(b.produtoCodigo) || !elegivel(c, b.produtoCodigo)) return produtoNaoElegivel(c, String(b.produtoCodigo ?? ''));
  const diesel = b.produtoCodigo.startsWith('742') || b.produtoCodigo.startsWith('743');
  return json<CommercialTerms>({
    incoterm: naoVazio(b.incoterm) ? b.incoterm : c.e.dados.incotermPadrao,
    prazoPagamento: diesel ? 'Z030' : 'Z015',
    outcome: 'OK',
  });
}

function padroesDoProduto(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const produtoCodigo = ctx.query.get('produtoCodigo') ?? '';
  if (!produtoCodigo.trim()) return erro(400, 'Informe o código do produto.');
  if (!elegivel(c, produtoCodigo)) return produtoNaoElegivel(c, produtoCodigo);
  const base = basePorCodigo(c.e.dados.supplyCenterCode);
  return json<ProductDefaults>({
    incoterm: c.e.dados.incotermPadrao,
    baseCodigo: base?.code ?? null,
    base: base?.name ?? null,
  });
}

function basesDaPropostaRota({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const sugerida = c.e.dados.supplyCenterCode;
  return json<ProposalSupplyCenters>({
    reason: sugerida ? null : 'CONTA_SEM_CENTRO',
    detail: sugerida
      ? null
      : 'A conta do cliente não tem centro fornecedor nas áreas de venda do Salesforce — escolha a base manualmente.',
    items: basesDaProposta(sugerida),
  });
}

// ───────────────────────────── Receitas e despesas ─────────────────────────────

function snapshotItens(e: EstadoProposta): FinancialItemsSnapshot {
  const items = e.itens.map(derivarItem);
  return { items, summary: resumoFinanceiro(items), dataInicioAnalise: e.dados.dataInicioAnalise, dataFimAnalise: e.dados.dataFimAnalise };
}

function tiposDeItem({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  return json<{ items: FinancialItemType[] }>({ items: TIPOS_ITEM_FINANCEIRO });
}

function listarItens({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  return json<FinancialItemsSnapshot>(snapshotItens(c.e));
}

function criticaDeDatas(e: EstadoProposta, inicial: string, final: string): Response | null {
  const d = e.dados;
  if (final < inicial) return recusa(422, 'UNPROCESSABLE_ENTITY', 'A data final do item não pode ser anterior à data inicial.');
  if (inicial < d.dataInicioAnalise || final > d.dataFimAnalise) {
    return recusa(
      422,
      'UNPROCESSABLE_ENTITY',
      `As datas do item devem estar dentro do horizonte de análise da proposta (${brData(d.dataInicioAnalise)} a ${brData(d.dataFimAnalise)}).`,
    );
  }
  return null;
}

function criarItem(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const b = corpo<CreateFinancialItemInput>(ctx);
  const t = naoVazio(b.financialItemTypeId) ? tipoItemPorId(b.financialItemTypeId) : undefined;
  if (!t) return recusa(404, 'NOT_FOUND', 'Tipo de item financeiro não encontrado.');
  const faltas: Array<{ field: string; message: string }> = [];
  if (typeof b.valor !== 'number' || b.valor < 0) faltas.push({ field: 'valor', message: 'O valor precisa ser um número positivo.' });
  if (!naoVazio(b.periodicidade)) faltas.push({ field: 'periodicidade', message: 'Informe a periodicidade.' });
  if (!isoValida(b.dataInicial)) faltas.push({ field: 'dataInicial', message: 'Informe a data inicial.' });
  if (!isoValida(b.dataFinal)) faltas.push({ field: 'dataFinal', message: 'Informe a data final.' });
  if (faltas.length) return validacao(faltas);
  if (t.isGnvCtf && !(typeof b.volumeGnvCtf === 'number' && b.volumeGnvCtf > 0)) {
    return recusa(400, 'BAD_REQUEST', `O tipo "${t.nome}" exige o volume GNV/CTF.`);
  }
  if (!t.isGnvCtf && b.volumeGnvCtf !== undefined && b.volumeGnvCtf !== null) {
    return recusa(400, 'BAD_REQUEST', `O tipo "${t.nome}" não usa volume GNV/CTF.`);
  }
  if (t.cataloguePriced && t.defaultValor !== null && b.valor !== t.defaultValor) {
    return recusa(422, 'UNPROCESSABLE_ENTITY', `O valor de "${t.nome}" é parametrizado pela Vibra (R$ ${t.defaultValor.toLocaleString('pt-BR')}) e não pode ser alterado.`);
  }
  const aberta = t.recordType === 'OUTRA_RECEITA' || t.recordType === 'OUTRA_DESPESA';
  if (!aberta && c.e.itens.some((i) => i.financialItemTypeId === t.id)) {
    return recusa(422, 'UNPROCESSABLE_ENTITY', `O tipo "${t.nome}" já existe nesta proposta.`);
  }
  const inicial = (b.dataInicial as string).slice(0, 10);
  const final = (b.dataFinal as string).slice(0, 10);
  const critica = criticaDeDatas(c.e, inicial, final);
  if (critica) return critica;

  const agora = agoraIso();
  const item = derivarItem({
    ...itemDoTipo(novoId('fi'), c.proposta.id, t.id, inicial, final, agora, b.valor as number),
    descricao: naoVazio(b.descricao) ? b.descricao.trim() : t.defaultDescricao,
    indiceCorrecao: b.indiceCorrecao ?? t.defaultIndiceCorrecao,
    periodicidade: b.periodicidade as FinancialItem['periodicidade'],
    volumeGnvCtf: t.isGnvCtf ? (b.volumeGnvCtf as number) : null,
    bypass: b.bypass === true,
  });
  c.e.itens.push(item);
  marcarDesatualizado(c.e);
  return json<FinancialItemMutationResult>({ item, summary: resumoFinanceiro(c.e.itens) }, 201);
}

function atualizarItem(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  const i = c ? c.e.itens.findIndex((x) => x.id === ctx.params.itemId) : -1;
  if (!c || i < 0) return recusa(404, 'NOT_FOUND', 'Item financeiro não encontrado nesta proposta.');
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const b = corpo<UpdateFinancialItemInput>(ctx);
  const atual = c.e.itens[i];
  const estruturais = (['financialItemTypeId', 'descricao', 'indiceCorrecao', 'periodicidade', 'dataInicial', 'dataFinal'] as const).filter(
    (k) => b[k] !== undefined && b[k] !== atual[k],
  );
  if (atual.obrigatoria && (estruturais.length > 0 || (b.valor !== undefined && b.valor !== atual.valor))) {
    return recusa(422, 'UNPROCESSABLE_ENTITY', `"${atual.tipoNome}" é item obrigatório do catálogo: só o volume GNV/CTF e o bypass podem ser alterados.`);
  }
  if (estruturais.length > 0 && c.proposta.status === 'EM_ANALISE') {
    return recusa(422, 'UNPROCESSABLE_ENTITY', 'A proposta está em análise (EM_ANALISE): apenas valor, volume GNV/CTF e bypass podem ser alterados.');
  }
  const t = tipoItemPorId(b.financialItemTypeId ?? atual.financialItemTypeId);
  if (!t) return recusa(404, 'NOT_FOUND', 'Tipo de item financeiro não encontrado.');
  if (typeof b.valor === 'number' && b.valor < 0) return validacao([{ field: 'valor', message: 'O valor precisa ser um número positivo.' }]);
  const inicial = (b.dataInicial ?? atual.dataInicial).slice(0, 10);
  const final = (b.dataFinal ?? atual.dataFinal).slice(0, 10);
  const critica = criticaDeDatas(c.e, inicial, final);
  if (critica) return critica;
  const item = derivarItem({
    ...atual,
    financialItemTypeId: t.id,
    tipoNome: t.nome,
    recordType: t.recordType,
    categoria: t.categoria,
    descricao: b.descricao !== undefined ? b.descricao : atual.descricao,
    valor: b.valor ?? atual.valor,
    indiceCorrecao: b.indiceCorrecao ?? atual.indiceCorrecao,
    periodicidade: b.periodicidade ?? atual.periodicidade,
    dataInicial: inicial,
    dataFinal: final,
    volumeGnvCtf: b.volumeGnvCtf ?? atual.volumeGnvCtf,
    bypass: b.bypass ?? atual.bypass,
    updatedAt: agoraIso(),
  });
  c.e.itens[i] = item;
  marcarDesatualizado(c.e);
  return json<FinancialItemMutationResult>({ item, summary: resumoFinanceiro(c.e.itens) });
}

function removerItem(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  const i = c ? c.e.itens.findIndex((x) => x.id === ctx.params.itemId) : -1;
  if (!c || i < 0) return recusa(404, 'NOT_FOUND', 'Item financeiro não encontrado nesta proposta.');
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const item = c.e.itens[i];
  if (item.obrigatoria && !item.bypass) {
    return recusa(409, 'CONFLICT', `"${item.tipoNome}" é item obrigatório e não pode ser removido sem autorização (bypass).`);
  }
  c.e.itens.splice(i, 1);
  marcarDesatualizado(c.e);
  return semConteudo();
}

function semearObrigatorios(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const d = c.e.dados;
  let created = 0;
  let skipped = 0;
  const agora = agoraIso();
  for (const t of TIPOS_ITEM_FINANCEIRO.filter((x) => x.obrigatoria)) {
    // GNV/CTF obrigatório exige volume — fica pendente de criação manual.
    if (t.isGnvCtf || c.e.itens.some((i) => i.financialItemTypeId === t.id)) {
      skipped += 1;
      continue;
    }
    // Leitura idempotente: fora da janela de escrita, só não cria.
    if (estadoPosteriorAAnalise(c.opp.estado)) {
      skipped += 1;
      continue;
    }
    c.e.itens.push(itemDoTipo(novoId('fi'), c.proposta.id, t.id, d.dataInicioAnalise, d.dataFimAnalise, agora));
    created += 1;
  }
  if (created > 0) marcarDesatualizado(c.e);
  return json<SeedRequiredResult>({ created, skipped, ...snapshotItens(c.e) });
}

// ───────────────────────────── Recursos financeiros ─────────────────────────────

const FINALIDADES_COM_RECURSO: string[] = [Finalidade.Vinculacao, Finalidade.Implantacao];

function envelopeRecursos(user: MockUser | null, c: Carregada): Omit<FinancialResourcesListResult, 'items'> {
  const utilizado = arred(c.e.recursos.reduce((s, r) => s + derivarRecurso(r).valorTotal, 0));
  const verba = c.e.verbaBp;
  const bpBudget: BpBudget = {
    verba,
    utilizado,
    percentualUtilizado: verba > 0 ? arred((utilizado / verba) * 100, 1) : 0,
    excedido: utilizado > verba,
  };
  const veVerba = temPapel(user, ...VE_VERBA_BP);
  const warnings: string[] = [];
  if (veVerba && bpBudget.excedido) warnings.push('BP excedido: os recursos desta proposta ultrapassam a verba da política comercial.');
  if (c.e.recursos.length > 0 && !c.e.registradoZfpj) {
    warnings.push('Conta ZFPJ não registrada: o cliente ainda não tem cadastro de fornecedor no SAP para receber os recursos.');
  }
  return {
    ...(veVerba ? { bpBudget } : {}),
    ...(c.e.recursos.length > 0 ? { supplierStatus: { customerRef: c.opp.clienteSap, registradoZFPJ: c.e.registradoZfpj } } : {}),
    warnings,
  };
}

function listarRecursos(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  return json<FinancialResourcesListResult>({ items: c.e.recursos.map(derivarRecurso), ...envelopeRecursos(ctx.user, c) });
}

/** `null` limpa, ausente mantém — os campos anuláveis do bloco Ressarcimento/bônus. */
function aplicarRecurso(r: FinancialResource, b: Partial<CreateFinancialResourceInput>): FinancialResource {
  const v = <K extends keyof FinancialResource>(k: K, x: FinancialResource[K] | undefined): FinancialResource[K] =>
    x === undefined ? r[k] : x;
  return derivarRecurso({
    ...r,
    tipoRegistro: v('tipoRegistro', b.tipoRegistro),
    tipoBonificacao: v('tipoBonificacao', b.tipoBonificacao),
    finalidadeRecurso: v('finalidadeRecurso', b.finalidadeRecurso),
    etapaLiberacao: v('etapaLiberacao', b.etapaLiberacao),
    dataLiberacao: v('dataLiberacao', b.dataLiberacao?.slice(0, 10)),
    qtdParcelas: v('qtdParcelas', b.qtdParcelas),
    valorParcela: v('valorParcela', b.valorParcela),
    indiceCorrecao: v('indiceCorrecao', b.indiceCorrecao),
    indiceCorrecaoParcela: v('indiceCorrecaoParcela', b.indiceCorrecaoParcela),
    periodicidade: v('periodicidade', b.periodicidade),
    custeadoPelaObra: v('custeadoPelaObra', b.custeadoPelaObra),
    carenciaMeses: v('carenciaMeses', b.carenciaMeses),
    jurosPercentual: v('jurosPercentual', b.jurosPercentual),
    justificativa: v('justificativa', b.justificativa),
    qtdPrestacoes: v('qtdPrestacoes', b.qtdPrestacoes),
    bonusPeriodicidade: v('bonusPeriodicidade', b.bonusPeriodicidade),
    bonusQtdParcelas: v('bonusQtdParcelas', b.bonusQtdParcelas),
    bonusValorParcela: v('bonusValorParcela', b.bonusValorParcela),
    bonusIndiceCorrecaoPrestacao: v('bonusIndiceCorrecaoPrestacao', b.bonusIndiceCorrecaoPrestacao),
    bonusTipoAtualizacaoMonetaria: v('bonusTipoAtualizacaoMonetaria', b.bonusTipoAtualizacaoMonetaria),
    bonusTipoAtualizacaoMonetariaLabel:
      b.bonusTipoAtualizacaoMonetaria === undefined
        ? r.bonusTipoAtualizacaoMonetariaLabel
        : b.bonusTipoAtualizacaoMonetaria === '04'
          ? 'Atualização monetária pelo índice da prestação'
          : b.bonusTipoAtualizacaoMonetaria === '05'
            ? 'Sem atualização monetária'
            : null,
    updatedAt: agoraIso(),
  });
}

function validarRecurso(c: Carregada, r: FinancialResource): Response | null {
  const faltas: Array<{ field: string; message: string }> = [];
  if (!naoVazio(r.tipoRegistro)) faltas.push({ field: 'tipoRegistro', message: 'Informe o tipo do recurso.' });
  if (!naoVazio(r.finalidadeRecurso)) faltas.push({ field: 'finalidadeRecurso', message: 'Informe a finalidade do recurso.' });
  if (!naoVazio(r.etapaLiberacao)) faltas.push({ field: 'etapaLiberacao', message: 'Informe a etapa de liberação.' });
  if (!isoValida(r.dataLiberacao)) faltas.push({ field: 'dataLiberacao', message: 'Informe a data de liberação.' });
  if (!(r.qtdParcelas >= 1)) faltas.push({ field: 'qtdParcelas', message: 'A quantidade de parcelas precisa ser ao menos 1.' });
  if (!(r.valorParcela > 0)) faltas.push({ field: 'valorParcela', message: 'O valor da parcela precisa ser maior que zero.' });
  if (!naoVazio(r.periodicidade)) faltas.push({ field: 'periodicidade', message: 'Informe a periodicidade.' });
  const mutuo = r.tipoRegistro === TipoRegistroRecursoFinanceiro.Mutuo || r.tipoRegistro === TipoRegistroRecursoFinanceiro.ParcelamentoDeDebito;
  if (mutuo && !r.indiceCorrecaoParcela) faltas.push({ field: 'indiceCorrecaoParcela', message: 'Informe o índice de correção das prestações.' });
  if (mutuo && typeof r.jurosPercentual === 'number' && r.jurosPercentual > 1 && !naoVazio(r.justificativa)) {
    faltas.push({ field: 'justificativa', message: 'O campo justificativa é de preenchimento obrigatório caso os juros seja maior que 1.' });
  }
  if (faltas.length) return validacao(faltas);
  if (r.dataLiberacao > c.e.dados.dataFimAnalise) {
    return validacao([{ field: 'dataLiberacao', message: `A data de liberação precisa cair dentro do período da análise (até ${brData(c.e.dados.dataFimAnalise)}).` }]);
  }
  return null;
}

function criarRecurso(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  if (!FINALIDADES_COM_RECURSO.includes(c.e.dados.finalidade)) {
    return recusa(409, 'CONFLICT', `A finalidade "${c.e.dados.finalidade}" não aceita recursos financeiros.`);
  }
  const b = corpo<CreateFinancialResourceInput>(ctx);
  const agora = agoraIso();
  const novo = aplicarRecurso(
    recursoVazio(novoId('fr'), c.proposta.id, {
      tipoRegistro: '' as FinancialResource['tipoRegistro'],
      finalidadeRecurso: '' as FinancialResource['finalidadeRecurso'],
      etapaLiberacao: '' as FinancialResource['etapaLiberacao'],
      dataLiberacao: hojeIso(),
      qtdParcelas: 0,
      valorParcela: 0,
      periodicidade: '' as FinancialResource['periodicidade'],
      indiceCorrecao: null,
    }, agora),
    { ...b, dataLiberacao: b.dataLiberacao ?? '' },
  );
  const invalido = validarRecurso(c, novo);
  if (invalido) return invalido;
  c.e.recursos.push(novo);
  marcarDesatualizado(c.e);
  return json<FinancialResourceMutationResult>({ resource: novo, ...envelopeRecursos(ctx.user, c) }, 201);
}

function editarRecurso(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  const i = c ? c.e.recursos.findIndex((r) => r.id === ctx.params.resourceId) : -1;
  if (!c || i < 0) return erro(404, 'Proposta ou recurso financeiro não encontrado.');
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const b = corpo<UpdateFinancialResourceInput>(ctx);
  const atual = c.e.recursos[i];
  if (atual.obra && !temPapel(ctx.user, 'SNEG', 'BP_FINANCEIRO', 'ADMIN')) {
    const travados = (['valorParcela', 'qtdParcelas', 'dataLiberacao', 'etapaLiberacao', 'periodicidade'] as const).filter(
      (k) => b[k] !== undefined && b[k] !== atual[k],
    );
    if (travados.length > 0) {
      return recusa(400, 'BAD_REQUEST', `Este recurso foi gerado pela obra ${atual.obra.estimateId}: ${travados.join(', ')} vêm da obra e não podem ser alterados.`);
    }
  }
  const novo = aplicarRecurso(atual, b);
  const invalido = validarRecurso(c, novo);
  if (invalido) return invalido;
  c.e.recursos[i] = novo;
  marcarDesatualizado(c.e);
  return json<FinancialResourceMutationResult>({ resource: novo, ...envelopeRecursos(ctx.user, c) });
}

function removerRecurso(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  const i = c ? c.e.recursos.findIndex((r) => r.id === ctx.params.resourceId) : -1;
  if (!c || i < 0) return erro(404, 'Proposta ou recurso financeiro não encontrado.');
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const r = c.e.recursos[i];
  if (r.obra) {
    return recusa(400, 'BAD_REQUEST', `Este recurso foi gerado pela obra ${r.obra.estimateId} — remova a obra para apagar os recursos dela.`);
  }
  c.e.recursos.splice(i, 1);
  marcarDesatualizado(c.e);
  return semConteudo();
}

function adicionarObraRecursos(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const b = corpo<AdicionarObraRecursosPayload>(ctx);
  if (!naoVazio(b.estimateId)) return validacao([{ field: 'estimateId', message: 'Escolha a obra do Converge.' }]);
  if (!naoVazio(b.tipoRegistro)) return validacao([{ field: 'tipoRegistro', message: 'Informe o tipo do recurso.' }]);
  if (typeof b.termoCessao !== 'boolean') return validacao([{ field: 'termoCessao', message: 'Informe se há Termo de Cessão.' }]);
  if (c.e.recursos.some((r) => r.obra) || c.e.investimentos.some((x) => x.obra)) {
    return recusa(400, 'BAD_REQUEST', 'Esta proposta já tem uma obra vinculada — remova-a antes de adicionar outra.');
  }
  const obra = obraDoCliente(c, b.estimateId);
  if (!obra) return recusa(422, 'UNPROCESSABLE_ENTITY', `A obra ${b.estimateId} não está entre as estimativas deste cliente no Converge.`);
  const finalidade = c.e.dados.finalidade === Finalidade.Implantacao ? 'Construção do posto' : 'Reforma do Posto';
  const criados = recursosDaObra(
    c.proposta.id,
    obra,
    {
      tipoRegistro: b.tipoRegistro as FinancialResource['tipoRegistro'],
      tipoBonificacao: (b.tipoBonificacao as FinancialResource['tipoBonificacao']) ?? null,
      finalidadeRecurso: finalidade as FinancialResource['finalidadeRecurso'],
      indiceCorrecaoParcela: (b.indiceCorrecaoParcela as FinancialResource['indiceCorrecaoParcela']) ?? null,
      carenciaMeses: b.carenciaMeses ?? null,
      jurosPercentual: b.jurosPercentual ?? null,
      qtdPrestacoes: b.qtdPrestacoes ?? null,
      justificativa: b.justificativa ?? null,
    },
    hojeIso(),
    // Sem Termo de Cessão a liberação desloca 30 dias (vira apontamento no parecer).
    b.termoCessao ? 0 : 30,
    agoraIso(),
    () => novoId('fr'),
  );
  const fora = criados.find((r) => r.dataLiberacao > c.e.dados.dataFimAnalise);
  if (fora?.obra) {
    return recusa(
      422,
      'UNPROCESSABLE_ENTITY',
      `A parcela ${fora.obra.parcelaNumero} da obra ${obra.estimateId} cai em ${brData(fora.dataLiberacao)} e essa data não serve: está depois do fim da análise da proposta (${brData(c.e.dados.dataFimAnalise)}).`,
    );
  }
  c.e.recursos.push(...criados);
  vincularObra(c.opp.id, obra.estimateId, 'RECURSO_FINANCEIRO');
  marcarDesatualizado(c.e);
  return json<FinancialResource[]>(criados);
}

function obraDoCliente(c: Carregada, estimateId: string): Obra | undefined {
  return obrasDoCliente(c.opp.clienteSap).find((o) => o.estimateId === estimateId);
}

/** O vínculo é da oportunidade: só cai quando nenhuma seção da proposta usa mais a obra. */
function talvezDesvincular(c: Carregada): void {
  if (!c.e.recursos.some((r) => r.obra) && !c.e.investimentos.some((x) => x.obra)) desvincularObra(c.opp.id);
}

function removerObraRecursos(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  if (!c.e.recursos.some((r) => r.obra)) return erro(404, 'Esta proposta não tem obra vinculada.');
  c.e.recursos = c.e.recursos.filter((r) => !r.obra);
  talvezDesvincular(c);
  marcarDesatualizado(c.e);
  return okVazio();
}

// ───────────────────────────── Investimentos ─────────────────────────────

function envelopeInvestimentos(e: EstadoProposta): InvestmentsListResult {
  const items = e.investimentos.map(derivarInvestimento);
  return { items, totalInvestimentos: arred(items.reduce((s, x) => s + x.valorFinal, 0)) };
}

function listarInvestimentos({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  return json<InvestmentsListResult>(envelopeInvestimentos(c.e));
}

const CAMPOS_EQUIPAMENTO = [
  'quantidade',
  'custoInstalacao',
  'valorResidualContabil',
  'vidaUtilContabilMeses',
  'equipamento',
  'equipamentoUsado',
  'valorVenda',
  'venderParaCliente',
  'dataVendaEquipamento',
] as const;
const CAMPOS_IMAGEM = ['elementoImagem', 'codigo'] as const;

function validarInvestimento(x: Investment, b: Partial<UpdateInvestmentInput>): Response | null {
  const faltas: Array<{ field: string; message: string }> = [];
  if (!isoValida(x.dataInvestimento)) faltas.push({ field: 'dataInvestimento', message: 'Informe a data do investimento.' });
  if (!isTipoInvestimento(x.tipo)) faltas.push({ field: 'tipo', message: 'Tipo de investimento inválido.' });
  if (!(x.vidaUtilFiscalMeses > 0)) faltas.push({ field: 'vidaUtilFiscalMeses', message: 'Informe a vida útil fiscal em meses.' });
  if (!naoVazio(x.detalhamentoItem)) faltas.push({ field: 'detalhamentoItem', message: 'Informe o detalhamento do item.' });
  if (!(x.valorUnitario > 0)) faltas.push({ field: 'valorUnitario', message: 'O valor unitário precisa ser maior que zero.' });
  if (faltas.length) return validacao(faltas);
  const familia = familiaDoTipo(x.tipo);
  const proibidos = [
    ...(familia !== 'Equipamento' ? CAMPOS_EQUIPAMENTO : []),
    ...(familia !== 'ElementoImagem' ? CAMPOS_IMAGEM : []),
  ].filter((k) => b[k] !== undefined && b[k] !== null);
  if (proibidos.length) {
    return validacao(proibidos.map((k) => ({ field: k, message: `O campo ${k} não se aplica a investimentos do tipo "${x.tipo}".` })));
  }
  return null;
}

function aplicarInvestimento(x: Investment, b: Partial<UpdateInvestmentInput>): Investment {
  const v = <K extends keyof Investment>(k: K, y: Investment[K] | undefined): Investment[K] => (y === undefined ? x[k] : y);
  return derivarInvestimento({
    ...x,
    descricao: v('descricao', b.descricao),
    dataInvestimento: v('dataInvestimento', b.dataInvestimento?.slice(0, 10)),
    tipo: v('tipo', b.tipo),
    vidaUtilFiscalMeses: v('vidaUtilFiscalMeses', b.vidaUtilFiscalMeses),
    detalhamentoItem: v('detalhamentoItem', b.detalhamentoItem),
    valorUnitario: v('valorUnitario', b.valorUnitario),
    valorAquisicao: v('valorAquisicao', b.valorAquisicao),
    negociacaoOriginal: v('negociacaoOriginal', b.negociacaoOriginal),
    custeadoPelaObra: v('custeadoPelaObra', b.custeadoPelaObra),
    quantidade: v('quantidade', b.quantidade),
    custoInstalacao: v('custoInstalacao', b.custoInstalacao),
    valorResidualContabil: v('valorResidualContabil', b.valorResidualContabil),
    vidaUtilContabilMeses: v('vidaUtilContabilMeses', b.vidaUtilContabilMeses),
    equipamento: v('equipamento', b.equipamento),
    elementoImagem: v('elementoImagem', b.elementoImagem),
    codigo: v('codigo', b.codigo),
    equipamentoUsado: v('equipamentoUsado', b.equipamentoUsado),
    valorVenda: v('valorVenda', b.valorVenda),
    venderParaCliente: v('venderParaCliente', b.venderParaCliente),
    dataVendaEquipamento: v('dataVendaEquipamento', b.dataVendaEquipamento),
    updatedAt: agoraIso(),
  });
}

function criarInvestimento(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const b = corpo<CreateInvestmentInput>(ctx);
  const novo = aplicarInvestimento(
    investimentoVazio(novoId('inv'), c.proposta.id, {
      dataInvestimento: '',
      tipo: 'Outros',
      vidaUtilFiscalMeses: 0,
      detalhamentoItem: '',
      valorUnitario: 0,
    }, agoraIso()),
    b,
  );
  const invalido = validarInvestimento(novo, b);
  if (invalido) return invalido;
  c.e.investimentos.push(novo);
  marcarDesatualizado(c.e);
  return json<Investment>(novo, 201);
}

function editarInvestimento(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  const i = c ? c.e.investimentos.findIndex((x) => x.id === ctx.params.investmentId) : -1;
  if (!c || i < 0) return erro(404, 'Investimento não encontrado.');
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const b = corpo<UpdateInvestmentInput>(ctx);
  const novo = aplicarInvestimento(c.e.investimentos[i], b);
  const invalido = validarInvestimento(novo, b);
  if (invalido) return invalido;
  c.e.investimentos[i] = novo;
  marcarDesatualizado(c.e);
  return json<Investment>(novo);
}

function removerInvestimento(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  const i = c ? c.e.investimentos.findIndex((x) => x.id === ctx.params.investmentId) : -1;
  if (!c || i < 0) return erro(404, 'Investimento não encontrado.');
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const x = c.e.investimentos[i];
  if (x.obra) {
    return recusa(400, 'BAD_REQUEST', `Este investimento foi gerado pela obra ${x.obra.estimateId} — remova a obra para apagar os investimentos dela.`);
  }
  c.e.investimentos.splice(i, 1);
  marcarDesatualizado(c.e);
  return semConteudo();
}

function adicionarObraInvestimentos(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const b = corpo<AdicionarObraInvestimentosPayload>(ctx);
  const faltas: Array<{ field: string; message: string }> = [];
  if (!naoVazio(b.estimateId)) faltas.push({ field: 'estimateId', message: 'Escolha a obra do Converge.' });
  if (!isoValida(b.dataInvestimentoInicial)) faltas.push({ field: 'dataInvestimentoInicial', message: 'Informe a data do primeiro investimento.' });
  if (!isTipoInvestimento(b.tipo)) faltas.push({ field: 'tipo', message: 'Tipo de investimento inválido.' });
  if (!(typeof b.vidaUtilFiscalMeses === 'number' && b.vidaUtilFiscalMeses > 0)) {
    faltas.push({ field: 'vidaUtilFiscalMeses', message: 'Informe a vida útil fiscal em meses.' });
  }
  if (faltas.length) return validacao(faltas);
  if (c.e.recursos.some((r) => r.obra) || c.e.investimentos.some((x) => x.obra)) {
    return recusa(400, 'BAD_REQUEST', 'Esta proposta já tem uma obra vinculada — remova-a antes de adicionar outra.');
  }
  const obra = obraDoCliente(c, b.estimateId as string);
  if (!obra) return recusa(422, 'UNPROCESSABLE_ENTITY', `A obra ${b.estimateId} não está entre as estimativas deste cliente no Converge.`);
  const inicial = (b.dataInvestimentoInicial as string).slice(0, 10);
  const agora = agoraIso();
  const criados: Investment[] = [];
  for (const parcela of obra.parcelas) {
    const data = addDias(inicial, parcela.imposto ? 0 : Math.max(0, (parcela.prazoPagamentoDias ?? 30) - 30));
    if (data > c.e.dados.dataFimAnalise) {
      return recusa(
        422,
        'UNPROCESSABLE_ENTITY',
        `A parcela ${parcela.numero} da obra ${obra.estimateId} cai em ${brData(data)} e essa data não serve: está depois do fim da análise da proposta (${brData(c.e.dados.dataFimAnalise)}).`,
      );
    }
    criados.push(
      investimentoVazio(novoId('inv'), c.proposta.id, {
        descricao: naoVazio(b.descricao) ? `${b.descricao.trim()} — ${parcela.descricao}` : `Obra ${obra.estimateId} — ${parcela.descricao}`,
        dataInvestimento: data,
        tipo: b.tipo as Investment['tipo'],
        vidaUtilFiscalMeses: b.vidaUtilFiscalMeses as number,
        detalhamentoItem: parcela.descricao ?? `Parcela ${parcela.numero}`,
        valorUnitario: parcela.valor,
        negociacaoOriginal: b.negociacaoOriginal === true,
        obra: itemObra(obra, parcela),
      }, agora),
    );
  }
  c.e.investimentos.push(...criados);
  vincularObra(c.opp.id, obra.estimateId, 'INVESTIMENTO');
  marcarDesatualizado(c.e);
  return json<Investment[]>(criados);
}

function removerObraInvestimentos(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  if (!c.e.investimentos.some((x) => x.obra)) return erro(404, 'Esta proposta não tem obra vinculada.');
  c.e.investimentos = c.e.investimentos.filter((x) => !x.obra);
  talvezDesvincular(c);
  marcarDesatualizado(c.e);
  return okVazio();
}

// ───────────────────────────── Indicadores (ARP) ─────────────────────────────

/** O "callback" do ARP chega alguns segundos depois do disparo. */
const DURACAO_CALCULO_MS = 4000;

function indicadoresAtuais(c: Carregada): ProposalIndicatorsSnapshot | null {
  const e = c.e;
  if (e.indicadores?.status === 'em_calculo' && e.calculoIniciadoEm !== null && Date.now() - e.calculoIniciadoEm >= DURACAO_CALCULO_MS) {
    e.indicadores = calcularIndicadores(e, c.proposta.id, 'atualizado', agoraIso());
    e.calculoIniciadoEm = null;
  }
  return e.indicadores;
}

function obterIndicadores({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const snap = indicadoresAtuais(c);
  return snap ? json<ProposalIndicatorsSnapshot>(snap) : semConteudo();
}

function recalcularIndicadores({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  if (c.e.dados.tipoProposta !== 'PCR') {
    return recusa(400, 'BAD_REQUEST', 'O cálculo ARP não se aplica a proposta de franquia.');
  }
  const atual = indicadoresAtuais(c);
  if (atual?.status === 'em_calculo') return json({ code: 'CALCULATION_IN_PROGRESS' }, 409);
  if (c.e.produtos.length === 0) {
    return recusa(400, 'BAD_REQUEST', 'Defina os produtos da proposta antes de calcular os indicadores.');
  }
  const semDescricao = c.e.investimentos.find((x) => !naoVazio(x.descricao));
  if (semDescricao) {
    return recusa(400, 'BAD_REQUEST', `O investimento "${semDescricao.detalhamentoItem}" está sem Descrição — o ARP recusa a simulação inteira sem ela. Preencha no card de Investimentos.`);
  }
  const agora = agoraIso();
  // 200 com `em_calculo` e os números ANTERIORES — o resultado chega depois.
  c.e.indicadores = atual
    ? { ...atual, status: 'em_calculo', mensagemErro: null, updatedAt: agora }
    : {
        id: `ind-${c.proposta.id}`,
        proposalId: c.proposta.id,
        status: 'em_calculo',
        tir: null,
        vpl: null,
        tma: null,
        rsPorM3: null,
        margemEbitda: null,
        margemMedia: null,
        indicadorRentabilidade: null,
        percentualAntecipacao: null,
        comprometimento: null,
        payback: null,
        calculadoEm: null,
        mensagemErro: null,
        createdAt: agora,
        updatedAt: agora,
      };
  c.e.calculoIniciadoEm = Date.now();
  return json<ProposalIndicatorsSnapshot>(c.e.indicadores);
}

// ───────────────────────────── Inteligência de mercado ─────────────────────────────

function obterInteligencia({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  return c.e.inteligencia ? json<MarketIntelligence>(c.e.inteligencia) : semConteudo();
}

function atualizarInteligencia({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  if (c.proposta.status === 'EM_ANALISE' || estadoPosteriorAAnalise(c.opp.estado)) {
    return json({ code: 'PROPOSAL_IN_ANALYSIS' }, 409);
  }
  const vmm = c.opp.vmm;
  const anterior = c.e.inteligencia;
  c.e.inteligencia = {
    consultadoEm: agoraIso(),
    fonte: 'Tableau · Simulador de Volume de Postos',
    vmmMedioBairro: Math.round(vmm * 0.87),
    vmmMedioCidade: Math.round(vmm * 0.72),
    vmmPosto: vmm,
    postosUrbanos: anterior?.postosUrbanos ?? 16,
    postosRodoviarios: anterior?.postosRodoviarios ?? 3,
    marketshareBairro: anterior?.marketshareBairro ?? [
      { bandeira: 'Vibra', percentual: 39.6 },
      { bandeira: 'Ipiranga', percentual: 23.1 },
      { bandeira: 'Raízen', percentual: 19.4 },
      { bandeira: 'Bandeira branca', percentual: 12.8 },
      { bandeira: 'Outras', percentual: 5.1 },
    ],
    marketshareCidade: anterior?.marketshareCidade ?? [
      { bandeira: 'Vibra', percentual: 33.2 },
      { bandeira: 'Raízen', percentual: 24.9 },
      { bandeira: 'Ipiranga', percentual: 21.6 },
      { bandeira: 'Bandeira branca', percentual: 15.1 },
      { bandeira: 'Outras', percentual: 5.2 },
    ],
  };
  return json<MarketIntelligence>(c.e.inteligencia);
}

// ───────────────────────────── Fotos do posto ─────────────────────────────

const MIMES_FOTO = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];
const MAX_FOTO = 10 * 1024 * 1024;

function listarFotos({ params }: MockContext): Response {
  const c = carregar(params.id);
  // Proposta inexistente ⇒ lista vazia (a BFF traduz o 404 assim).
  if (!c) return json<PostoPhoto[]>([]);
  return json<PostoPhoto[]>(mapPostoPhotos(params.id, c.e.fotos));
}

function enviarFoto(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c, ESCRITA_FOTOS);
  if (trava) return trava;
  const arquivo = arquivoEnviado(ctx.body);
  if (!arquivo) return recusa(400, 'BAD_REQUEST', 'Envie o arquivo da foto no campo "file".');
  const nome = arquivo.nome.toLowerCase();
  const mime = arquivo.tipo === 'application/octet-stream' && nome.endsWith('.pdf') ? 'application/pdf' : arquivo.tipo;
  if (!MIMES_FOTO.includes(mime)) {
    return recusa(400, 'BAD_REQUEST', `Tipo de arquivo não aceito (${mime}). Envie PNG, JPEG ou PDF.`);
  }
  if (arquivo.tamanho > MAX_FOTO) return recusa(400, 'BAD_REQUEST', 'A foto excede o tamanho máximo de 10 MB.');
  const foto: BackendPostoPhoto = {
    id: novoId('foto'),
    fileName: arquivo.nome,
    mimeType: mime,
    sizeBytes: arquivo.tamanho,
    createdAt: agoraIso(),
  };
  c.e.fotos.push(foto);
  return json<PostoPhoto>(mapPostoPhoto(ctx.params.id, foto), 201);
}

function removerFoto(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  const i = c ? c.e.fotos.findIndex((f) => f.id === ctx.params.photoId) : -1;
  if (!c || i < 0) return erro(404, 'Foto não encontrada.');
  const trava = travaDeEscrita(ctx.user, c, ESCRITA_FOTOS);
  if (trava) return trava;
  c.e.fotos.splice(i, 1);
  return semConteudo();
}

function verFoto({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return erro(404, 'Proposta não encontrada.');
  const foto = c.e.fotos.find((f) => f.id === params.photoId);
  if (!foto) return erro(404, 'Foto não encontrada nesta proposta.');
  return foto.mimeType === 'application/pdf'
    ? pdf(`Fotos do posto - ${foto.fileName}`, foto.fileName)
    : imagem(foto.fileName.replace(/\.[a-z]+$/i, '').replace(/-/g, ' '));
}

// ───────────────────────────── Situação do posto ─────────────────────────────

function obterSituacao({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c || !c.e.situacao) return erro(404, 'Situação do posto ainda não cadastrada.');
  return json<PostoSituation>(c.e.situacao);
}

function salvarSituacao(ctx: MockContext): Response {
  const c = carregar(ctx.params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  const trava = travaDeEscrita(ctx.user, c);
  if (trava) return trava;
  const b = corpo<UpsertPostoSituationInput>(ctx);
  const faltas: Array<{ field: string; message: string }> = [];
  if (!naoVazio(b.tipoPosto)) faltas.push({ field: 'tipoPosto', message: 'Informe o tipo do posto.' });
  if (!naoVazio(b.situacaoPosto)) faltas.push({ field: 'situacaoPosto', message: 'Informe a situação do posto.' });
  if (!naoVazio(b.bandeiraFisica)) faltas.push({ field: 'bandeiraFisica', message: 'Informe a bandeira física do posto.' });
  if (!naoVazio(b.propriedadeImovel)) faltas.push({ field: 'propriedadeImovel', message: 'Informe a propriedade do imóvel.' });
  if (faltas.length) return validacao(faltas);
  const terceiro = b.propriedadeImovel === PropriedadeImovel.DeTerceiros;
  if (terceiro && !b.tipoContratoUso) {
    return recusa(400, 'BAD_REQUEST', 'Imóvel de terceiros exige o tipo de contrato de uso (locação, arrendamento ou convênio).');
  }
  if (!terceiro && b.tipoContratoUso) {
    return recusa(400, 'BAD_REQUEST', 'O contrato de uso só se aplica a imóvel de terceiros.');
  }
  if (b.prorrogacaoMeses !== undefined && b.contratoRenovavel !== true) {
    return recusa(400, 'BAD_REQUEST', 'A prorrogação só é aceita quando o contrato de uso é renovável.');
  }
  if (b.dataInicioUso && b.dataFimUso && b.dataFimUso < b.dataInicioUso) {
    return recusa(400, 'BAD_REQUEST', 'O fim do contrato de uso não pode ser anterior ao início.');
  }
  if (c.e.dados.finalidade === Finalidade.Implantacao && b.situacaoPosto === SituacaoPosto.EmOperacao) {
    return recusa(409, 'CONFLICT', 'A finalidade Implantação exige posto a construir, em construção ou paralisado — este posto está em operação.');
  }
  const agora = agoraIso();
  const criticas: string[] = [];
  if (terceiro && b.dataFimUso && b.dataFimUso.slice(0, 10) < hojeIso()) {
    criticas.push(`O contrato de uso do imóvel venceu em ${brData(b.dataFimUso)}.`);
  }
  const ant = c.e.situacao;
  c.e.situacao = {
    id: ant?.id ?? novoId('sit'),
    proposalId: c.proposta.id,
    postoRef: c.opp.clienteSap,
    tipoPosto: b.tipoPosto as PostoSituation['tipoPosto'],
    situacaoPosto: b.situacaoPosto as PostoSituation['situacaoPosto'],
    bandeiraAnp: ant?.bandeiraAnp ?? bandeiraAnp(c),
    bandeiraAnpStatus: 'RESOLVIDA',
    bandeiraAnpSource: 'CADASTRO_ANP',
    bandeiraAnpAsOf: '2026-09-15',
    bandeiraFisica: b.bandeiraFisica as string,
    propriedadeImovel: b.propriedadeImovel as PostoSituation['propriedadeImovel'],
    tipoContratoUso: terceiro ? (b.tipoContratoUso ?? null) : null,
    contratoRenovavel: terceiro ? (b.contratoRenovavel ?? null) : null,
    prorrogacaoMeses: terceiro && b.contratoRenovavel ? (b.prorrogacaoMeses ?? null) : null,
    dataInicioUso: terceiro ? (b.dataInicioUso?.slice(0, 10) ?? null) : null,
    dataFimUso: terceiro ? (b.dataFimUso?.slice(0, 10) ?? null) : null,
    criticas,
    createdAt: ant?.createdAt ?? agora,
    updatedAt: agora,
  };
  c.e.dados.updatedAt = agora;
  return json<PostoSituation>(c.e.situacao);
}

function bandeiraAnp(c: Carregada): string | null {
  return c.opp.clienteSap === '900103' ? 'BANDEIRA BRANCA' : 'VIBRA';
}

function obterBandeiraAnp({ params }: MockContext): Response {
  const c = carregar(params.id);
  if (!c) return PROPOSTA_NAO_ENCONTRADA();
  return json<{ bandeiraAnp: string | null }>({ bandeiraAnp: bandeiraAnp(c) });
}

// ───────────────────────────── Registro ─────────────────────────────

rotas('propostas', [
  // Proposta
  { method: 'POST', pattern: '/proposals', handler: criarProposta },
  { method: 'GET', pattern: '/proposals/date-constraints', handler: () => json<ProposalDateConstraints>(limitesDeData()) },
  { method: 'GET', pattern: '/proposals/:id', handler: obterProposta },
  { method: 'PATCH', pattern: '/proposals/:id', handler: atualizarProposta },
  { method: 'PATCH', pattern: '/proposals/:id/periodo-analise', handler: alterarPeriodo },
  { method: 'POST', pattern: '/proposals/:id/devolver', handler: devolver },
  { method: 'POST', pattern: '/proposals/:id/reenviar', handler: reenviar },
  { method: 'POST', pattern: '/proposals/:id/solicitar-ajuste', handler: solicitarAjuste },

  // Produtos e simulação comercial (F5)
  { method: 'GET', pattern: '/proposals/:id/eligible-products', handler: produtosElegiveis },
  { method: 'GET', pattern: '/proposals/:id/supply-centers', handler: basesDaPropostaRota },
  { method: 'GET', pattern: '/proposals/:id/product-lines', handler: listarLinhas },
  { method: 'POST', pattern: '/proposals/:id/product-lines', handler: criarLinha },
  { method: 'POST', pattern: '/proposals/:id/product-lines/commercial-terms', handler: termosComerciais },
  { method: 'GET', pattern: '/proposals/:id/product-lines/defaults', handler: padroesDoProduto },

  // Inclusão de produtos em lote (US 69180)
  { method: 'GET', pattern: '/proposals/:id/product-batch', handler: lerRascunho },
  { method: 'PUT', pattern: '/proposals/:id/product-batch', handler: gravarRascunho },
  { method: 'DELETE', pattern: '/proposals/:id/product-batch', handler: limparRascunho },
  { method: 'POST', pattern: '/proposals/:id/product-batch/rows', handler: adicionarAoRascunho },
  { method: 'POST', pattern: '/proposals/:id/product-batch/submit', handler: salvarLote },

  { method: 'PUT', pattern: '/proposals/:id/product-lines/:lineId', handler: substituirLinha },
  { method: 'POST', pattern: '/proposals/:id/product-lines/:lineId', handler: removerLinha },
  { method: 'DELETE', pattern: '/proposals/:id/product-lines/:lineId', handler: removerLinha },

  // Receitas e despesas (F9)
  { method: 'GET', pattern: '/proposals/:id/financial-item-types', handler: tiposDeItem },
  { method: 'GET', pattern: '/proposals/:id/financial-items', handler: listarItens },
  { method: 'POST', pattern: '/proposals/:id/financial-items', handler: criarItem },
  { method: 'POST', pattern: '/proposals/:id/financial-items/seed-required', handler: semearObrigatorios },
  { method: 'PUT', pattern: '/proposals/:id/financial-items/:itemId', handler: atualizarItem },
  { method: 'POST', pattern: '/proposals/:id/financial-items/:itemId', handler: removerItem },
  { method: 'DELETE', pattern: '/proposals/:id/financial-items/:itemId', handler: removerItem },

  // Recursos financeiros (F6)
  { method: 'GET', pattern: '/proposals/:id/financial-resources', handler: listarRecursos },
  { method: 'POST', pattern: '/proposals/:id/financial-resources', handler: criarRecurso },
  { method: 'POST', pattern: '/proposals/:id/financial-resources/adicionar-obra', handler: adicionarObraRecursos },
  { method: 'POST', pattern: '/proposals/:id/financial-resources/remover-obra', handler: removerObraRecursos },
  { method: 'PUT', pattern: '/proposals/:id/financial-resources/:resourceId', handler: editarRecurso },
  { method: 'POST', pattern: '/proposals/:id/financial-resources/:resourceId', handler: removerRecurso },
  { method: 'DELETE', pattern: '/proposals/:id/financial-resources/:resourceId', handler: removerRecurso },

  // Investimentos
  { method: 'GET', pattern: '/proposals/:id/investments', handler: listarInvestimentos },
  { method: 'POST', pattern: '/proposals/:id/investments', handler: criarInvestimento },
  { method: 'POST', pattern: '/proposals/:id/investments/adicionar-obra', handler: adicionarObraInvestimentos },
  { method: 'POST', pattern: '/proposals/:id/investments/remover-obra', handler: removerObraInvestimentos },
  { method: 'PUT', pattern: '/proposals/:id/investments/:investmentId', handler: editarInvestimento },
  { method: 'POST', pattern: '/proposals/:id/investments/:investmentId', handler: removerInvestimento },
  { method: 'DELETE', pattern: '/proposals/:id/investments/:investmentId', handler: removerInvestimento },

  // Indicadores (F7) e inteligência de mercado (F4)
  { method: 'GET', pattern: '/proposals/:id/indicators', handler: obterIndicadores },
  { method: 'POST', pattern: '/proposals/:id/indicators/recalculate', handler: recalcularIndicadores },
  { method: 'GET', pattern: '/proposals/:id/market-intelligence', handler: obterInteligencia },
  { method: 'POST', pattern: '/proposals/:id/market-intelligence/refresh', handler: atualizarInteligencia },

  // Fotos e situação do posto (F4)
  { method: 'GET', pattern: '/proposals/:id/posto-photos', handler: listarFotos },
  { method: 'POST', pattern: '/proposals/:id/posto-photos', handler: enviarFoto },
  { method: 'POST', pattern: '/proposals/:id/posto-photos/:photoId', handler: removerFoto },
  { method: 'DELETE', pattern: '/proposals/:id/posto-photos/:photoId', handler: removerFoto },
  { method: 'GET', pattern: '/proposals/:id/posto-photos/:photoId/view', handler: verFoto },
  { method: 'GET', pattern: '/proposals/:id/posto-situation', handler: obterSituacao },
  { method: 'PUT', pattern: '/proposals/:id/posto-situation', handler: salvarSituacao },
  { method: 'GET', pattern: '/proposals/:id/posto-situation/bandeira-anp', handler: obterBandeiraAnp },
]);
