import type {
  AssinaturaData,
  ContratoCrmItem,
  ContratoItem,
  ContratoReadModel,
  DadosBancarios,
  MinutaItem,
  PacoteItem,
  SectionResult,
  Sendbar,
  SignatarioItem,
  SolicitarRitmResult,
  TermoCessaoData,
  TrilhaItem,
} from '@/lib/contratos/contrato-mapping';
import type { MinutaAtribuicao } from '@/lib/contratos/minuta-atribuicao.types';
import type { MinutaTipoAnexavel } from '@/lib/contratos/minutas.api';
import type { EtapaContrato } from '@/lib/contratos/types';
import type { GrupoDocumentosDeOutraOrigem } from '@/lib/documents/types';
import type { Obra, ObraReadModel } from '@/lib/obras/obra-mapping';
import type { ObraPasso, ObraTrilha } from '@/lib/obras/obra-trilha-mapping';

import { arquivoEnviado, campo, erro, json, pdf } from '../core/respostas';
import { rotas, type MockContext } from '../core/router';
import { temPapel, usuarioPorId, type MockUser } from '../core/session';
import { agoraIso, fatia, novoId } from '../core/store';
import { clientePorSap, type EstadoBackend, type OportunidadeElenco } from '../elenco';
import { moverPara, oportunidade } from '../estado-compartilhado';
import {
  EM_CIRCULACAO,
  ESTADO_EXTERNO_LABEL,
  ESTADO_EXTERNO_PILL,
  PAPEL_CONTRATO_LABEL,
  PAPEL_SIGNATARIO_HINT_INT,
  PAPEL_SIGNATARIO_LABEL_INT,
  STATUS_ENVELOPE_LABEL,
  STATUS_ENVELOPE_PILL,
  STATUS_MINUTA_LABEL_INT,
  STATUS_MINUTA_PILL_INT,
  STATUS_SIGNATARIO_LABEL_INT,
  STATUS_SIGNATARIO_PILL_INT,
  TIPOS_COM_PAGAMENTO,
  TIPOS_DOCUMENTO,
  TIPO_DOCUMENTO_LABEL,
  type ContratoInt,
  type EstadoContrato,
  type EtapaContratoInt,
  type MinutaInt,
  type PacoteInt,
  type PapelSignatarioInt,
  type SignatarioDigitado,
  type SignatarioInt,
  type TipoDocumento,
} from '../dados/contrato/modelo';
import { catalogoInicialDeObras, vinculosIniciaisDeObra, type ModeloContratacaoObra, type VinculoObra } from '../dados/contrato/obras';
import { novoSignatario, pacoteInicial, SEMENTE_CONTRATOS, signatariosPadrao } from '../dados/contrato/semente';

/**
 * Mocks do domínio `contrato`: read model do contrato (minuta → assinatura →
 * cadastro/ativação → pagamento), minutas, DocuSign, RITM, analista da minuta
 * e a obra do Converge.
 *
 * A fase da oportunidade é do estado compartilhado (`moverPara`); o pacote do
 * contrato é DESTE domínio. Como a transição `ENVIAR_PARA_ASSINATURA` /
 * `ANULAR_ENVIO` / `CONCLUIR` vive em outra rota (`/transitions`), toda leitura
 * passa por {@link conciliar}: a fase manda, e o pacote se ajusta a ela
 * (envelope em rascunho criado, anulado ou concluído).
 *
 * Simulação do DocuSign: `POST .../assinatura/sincronizar` é o "relê no
 * fornecedor". Cada chamada avança UM passo — rascunho ⇒ enviado, e depois um
 * signatário assina por vez; o último leva a oportunidade a `EM_PAGAMENTO`.
 * Abrir `/oportunidades/<id>?docusign=retorno` dispara a sincronização.
 */

// ───────────────────────────── Estado ──────────────────────────────────────

const pacotesPorOpp = fatia<Record<string, EstadoContrato>>('contrato-pacotes', () => SEMENTE_CONTRATOS);
const obrasEstado = fatia('contrato-obras', () => ({
  catalogo: catalogoInicialDeObras(),
  vinculos: vinculosIniciaisDeObra(),
}));

const FASES_CONTRATO: readonly EstadoBackend[] = ['EM_MINUTA', 'EM_ASSINATURA', 'EM_PAGAMENTO', 'CONCLUIDA'];
const ORDEM_ETAPAS: readonly EtapaContratoInt[] = ['MINUTA', 'ASSINATURA', 'CADASTRO', 'ATIVACAO', 'PAGAMENTO'];
const ETAPA_LABEL: Record<EtapaContratoInt, string> = {
  MINUTA: 'Minuta',
  ASSINATURA: 'Assinatura',
  CADASTRO: 'Cadastro',
  ATIVACAO: 'Ativação',
  PAGAMENTO: 'Pagamento',
};
const ESTADO_LABEL: Record<EstadoBackend, string> = {
  NOVOS: 'Novos',
  EM_PREENCHIMENTO: 'Em preenchimento',
  EM_ANALISE: 'Em análise',
  EM_APROVACAO: 'Em aprovação',
  EM_MINUTA: 'Em minuta',
  EM_ASSINATURA: 'Em assinatura',
  EM_PAGAMENTO: 'Em pagamento',
  CONCLUIDA: 'Concluída',
};

// Papéis — espelho do `@Roles` das rotas do backend (Matriz RBAC v2.1).
const PAPEIS_MINUTA = ['SNEG', 'ADMIN', 'CONSULTOR_EXPANSAO', 'BP_FINANCEIRO'];
const PAPEIS_LEMBRETE = ['LT', 'EXPANSAO', 'SPCOM', 'TI_SUSTENTACAO', 'SNEG', 'BP_FINANCEIRO', 'ADMIN'];
const PAPEIS_REATRIBUIR = ['SNEG', 'BP_FINANCEIRO', 'ADMIN'];
const PAPEIS_DADOS_BANCARIOS = ['LT', 'SNEG', 'ADMIN'];
/** Quem pode receber a minuta (o grupo de analistas da fase). */
const PAPEIS_ANALISTA_MINUTA = ['SNEG', 'SPCOM', 'BP_FINANCEIRO', 'ADMIN'];

const MOTIVO_SEM_PAGAMENTO =
  'Não há Mútuo, Novo Mútuo ou Concessão Financeira nesta negociação, então ' +
  'não há pagamento a liberar: a fase de pagamento foi pulada.';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function naFaseDeContrato(o: OportunidadeElenco): boolean {
  return FASES_CONTRATO.includes(o.estado);
}

/** Pacote de quem entrou na fase de contrato fora da semente (lazy). */
function estadoDoContrato(o: OportunidadeElenco): EstadoContrato | null {
  if (!naFaseDeContrato(o)) return null;
  const mapa = pacotesPorOpp();
  let e = mapa[o.id];
  if (!e) {
    e = pacoteInicial(o.id, o.tipo, o.analistaSnegId, agoraIso());
    mapa[o.id] = e;
  }
  conciliar(o, e);
  return e;
}

function minutaCorrente(e: EstadoContrato, contractId: string): MinutaInt | undefined {
  return e.minutas
    .filter((m) => m.contractId === contractId && m.status !== 'SUBSTITUIDA')
    .sort((a, b) => b.versao - a.versao)[0];
}

/** A tentativa que É o pacote agora: a em circulação; senão a mais recente. */
function pacoteCorrente(e: EstadoContrato, sequencia: 1 | 2): PacoteInt | undefined {
  const tentativas = e.pacotes.filter((p) => p.sequencia === sequencia);
  const viva = [...tentativas].reverse().find((p) => EM_CIRCULACAO.includes(p.status));
  return viva ?? tentativas[tentativas.length - 1];
}

function vinculoDeObra(oppId: string): VinculoObra | undefined {
  return obrasEstado().vinculos[oppId];
}

function termoAplicavel(oppId: string): boolean {
  return vinculoDeObra(oppId)?.modelo === 'RECURSO_FINANCEIRO';
}

function criarPacote(
  e: EstadoContrato,
  sequencia: 1 | 2,
  montarSignatarios: (pacoteId: string) => SignatarioInt[],
): PacoteInt {
  const id = novoId(`env-${e.oppId.replace(/^opp-/, '')}`);
  const docs = e.contratos.filter((c) => minutaCorrente(e, c.id)?.fileName).length;
  const pacote: PacoteInt = {
    id,
    envelopeExternoId: crypto.randomUUID(),
    sequencia,
    status: 'CREATED',
    documentosCount: sequencia === 1 ? Math.max(docs, 1) : 1,
    signatarios: montarSignatarios(id),
    criadoEm: agoraIso(),
    enviadoEm: null,
    concluidoEm: null,
    motivoAnulacao: null,
  };
  e.pacotes.push(pacote);
  return pacote;
}

function definirEtapa(e: EstadoContrato, etapa: EtapaContratoInt): void {
  for (const c of e.contratos) c.etapa = etapa;
}

/** O envelope principal concluiu: minutas assinadas, contratos para o cadastro. */
function concluirPacotePrincipal(e: EstadoContrato, pacote: PacoteInt): void {
  const agora = agoraIso();
  for (const s of pacote.signatarios) {
    if (s.status !== 'ASSINADO') {
      s.status = 'ASSINADO';
      s.assinadoEm = agora;
    }
  }
  pacote.status = 'COMPLETED';
  pacote.concluidoEm = agora;
  for (const c of e.contratos) {
    const m = minutaCorrente(e, c.id);
    if (m && m.status === 'GERADA') m.status = 'ASSINADA';
  }
  definirEtapa(e, 'CADASTRO');
  for (const crm of e.contratosCrm) {
    if (crm.status === 'Em Elaboração') crm.situacao = 'Contrato assinado — aguardando ativação';
  }
}

/**
 * A fase da oportunidade manda; o pacote se ajusta. Cobre as transições feitas
 * por OUTRA rota (`/transitions`) e o reset da página `/prototipo`.
 */
function conciliar(o: OportunidadeElenco, e: EstadoContrato): void {
  const principal = pacoteCorrente(e, 1);
  const vivo = principal && ['CREATED', 'SENT', 'DELIVERED'].includes(principal.status);

  if (o.estado === 'EM_MINUTA') {
    // `ANULAR_ENVIO` devolveu a oportunidade à minuta: o envelope morre.
    if (principal && vivo) {
      principal.status = 'VOIDED';
      principal.motivoAnulacao = principal.motivoAnulacao ?? 'Envio anulado — pacote devolvido à minuta.';
    }
    if (!principal || principal.status !== 'COMPLETED') definirEtapa(e, 'MINUTA');
    return;
  }

  if (o.estado === 'EM_ASSINATURA') {
    // `ENVIAR_PARA_ASSINATURA` pela transição: o envelope nasce rascunho.
    if (!principal) {
      registrarEnvelopePrincipal(e, o, null);
    }
    if (!principal || principal.status !== 'COMPLETED') definirEtapa(e, 'ASSINATURA');
    return;
  }

  // EM_PAGAMENTO / CONCLUIDA: a assinatura já aconteceu (ex.: avanço manual).
  if (principal && principal.status !== 'COMPLETED' && principal.status !== 'VOIDED') {
    concluirPacotePrincipal(e, principal);
  }
  if (!principal) {
    for (const c of e.contratos) {
      const m = minutaCorrente(e, c.id);
      if (m && m.status === 'GERADA') m.status = 'ASSINADA';
    }
    definirEtapa(e, 'CADASTRO');
  }
}

function registrarEnvelopePrincipal(
  e: EstadoContrato,
  o: OportunidadeElenco,
  payload: { clientes: SignatarioDigitadoOk[]; representantes: SignatarioDigitadoOk[]; testemunhas: SignatarioDigitadoOk[]; ltEmail?: string } | null,
): PacoteInt {
  const lt = usuarioPorId(o.ltId);
  const ltNome = lt?.name ?? 'Líder de Território';
  const ltEmail = payload?.ltEmail ?? lt?.email ?? 'lt@exemplo.com.br';
  return criarPacote(e, 1, (pacoteId) => {
    if (!payload) return signatariosPadrao(pacoteId, ltNome, ltEmail);
    const lista: SignatarioInt[] = [novoSignatario(pacoteId, 1, 'LT', ltNome, ltEmail, 'AGUARDANDO')];
    const add = (papel: PapelSignatarioInt, s: SignatarioDigitadoOk) =>
      lista.push(novoSignatario(pacoteId, lista.length + 1, papel, s.nome, s.email, 'AGUARDANDO'));
    payload.clientes.forEach((s) => add('CLIENTE', s));
    payload.representantes.forEach((s) => add('REPRESENTANTE_VIBRA', s));
    payload.testemunhas.forEach((s) => add('TESTEMUNHA', s));
    return lista;
  });
}

// ───────────────────────── Composição do read model ────────────────────────

function ok<T>(data: T): SectionResult<T> {
  return { status: 'ok', data };
}

function etapaAtualDe(o: OportunidadeElenco, e: EstadoContrato | null): EtapaContratoInt {
  const primeira = e?.contratos[0]?.etapa;
  if (primeira) return primeira;
  if (o.estado === 'EM_ASSINATURA') return 'ASSINATURA';
  if (o.estado === 'EM_PAGAMENTO' || o.estado === 'CONCLUIDA') return 'PAGAMENTO';
  return 'MINUTA';
}

/** O pacote inteiro ativo no org promove CADASTRO/ATIVACAO a PAGAMENTO. */
function etapaTrilhaDe(etapa: EtapaContratoInt, e: EstadoContrato | null): EtapaContratoInt {
  if (!e || (etapa !== 'CADASTRO' && etapa !== 'ATIVACAO')) return etapa;
  const ativos = e.contratos.filter((c) => c.estadoExterno === 'ATIVO').length;
  return e.contratos.length > 0 && ativos === e.contratos.length ? 'PAGAMENTO' : etapa;
}

function exigePagamento(e: EstadoContrato | null): boolean {
  return !!e && e.contratos.some((c) => TIPOS_COM_PAGAMENTO.includes(c.tipo));
}

/** A máquina é linear: a única etapa permitida é a seguinte. */
function proximaEtapa(etapa: EtapaContratoInt): EtapaContrato[] {
  const i = ORDEM_ETAPAS.indexOf(etapa);
  return ORDEM_ETAPAS.slice(i + 1, i + 2);
}

function montarTrilha(etapa: EtapaContratoInt): TrilhaItem[] {
  const atual = ORDEM_ETAPAS.indexOf(etapa);
  return ORDEM_ETAPAS.map((et, i) => ({
    etapa: et,
    etapaLabel: ETAPA_LABEL[et],
    status: i < atual ? 'CONCLUIDA' : i === atual ? 'ATUAL' : 'PENDENTE',
    ocorridoEm: null,
    detalhe: null,
  }));
}

function minutaItem(e: EstadoContrato, c: ContratoInt, m: MinutaInt): MinutaItem {
  const tipoLabel = TIPO_DOCUMENTO_LABEL[c.tipo];
  const papelLabel = PAPEL_CONTRATO_LABEL[c.papel];
  const descricao =
    m.origem === 'CONVERGE'
      ? `${tipoLabel} · Converge · gerado na estimativa · segue no pacote`
      : m.origem === 'UPLOAD_MANUAL'
        ? `${papelLabel} · ${tipoLabel} · substituído manualmente`
        : `${papelLabel} · ${tipoLabel} · minuta padrão (Netlex)`;
  const temDoc = m.fileName !== null;
  return {
    id: m.id,
    contractId: c.id,
    tipo: c.tipo,
    tipoLabel,
    papel: c.papel,
    papelLabel,
    descricao,
    status: m.status,
    statusLabel: STATUS_MINUTA_LABEL_INT[m.status],
    statusPill: STATUS_MINUTA_PILL_INT[m.status],
    origem: m.origem,
    versao: m.versao,
    podeBaixar: temDoc && ['GERADA', 'SUBSTITUIDA', 'ASSINADA'].includes(m.status),
    podeSubstituir: temDoc && m.status === 'GERADA',
    netlexConsultaCodigo: m.netlexConsultaCodigo,
    fileName: m.status === 'FALHA' ? null : m.fileName,
    atualizadoEm: m.atualizadoEm,
    minutaPadrao: c.minutaPadrao,
  };
}

function papelLabelDoSignatario(s: SignatarioInt): string {
  const rotulo = PAPEL_SIGNATARIO_LABEL_INT[s.papel];
  return s.papel === 'LT' || s.papel === 'CLIENTE' || s.papel === 'HOMOLOGADA' ? `${rotulo} — ${s.nome}` : rotulo;
}

function pacoteItem(p: PacoteInt): PacoteItem {
  const concluidas = p.signatarios.filter((s) => s.status === 'ASSINADO').length;
  const total = p.signatarios.length;
  const completo = total > 0 && concluidas >= total;
  const rascunho = p.status === 'CREATED';
  const signatarios: SignatarioItem[] = [...p.signatarios]
    .sort((a, b) => a.ordem - b.ordem)
    .map((s) => ({
      id: s.id,
      sequencia: s.ordem,
      papel: s.papel,
      papelLabel: papelLabelDoSignatario(s),
      hint: PAPEL_SIGNATARIO_HINT_INT[s.papel],
      statusLabel: STATUS_SIGNATARIO_LABEL_INT[s.status],
      statusPill: STATUS_SIGNATARIO_PILL_INT[s.status],
      podeReenviar: s.status === 'PENDENTE',
    }));
  return {
    id: p.id,
    envelopeExternoId: p.envelopeExternoId,
    descricao:
      p.sequencia === 1
        ? `pacote único (${p.documentosCount} ${p.documentosCount === 1 ? 'documento' : 'documentos'})`
        : 'Termo de Cessão assinado — empresa homologada',
    situacaoLabel: STATUS_ENVELOPE_LABEL[p.status],
    situacaoPill: STATUS_ENVELOPE_PILL[p.status],
    assinaturasConcluidas: concluidas,
    assinaturasTotal: total,
    faixaTexto: rascunho
      ? 'Envelope em rascunho no DocuSign — posicione os campos de assinatura e envie. Nenhum signatário foi notificado ainda.'
      : p.status === 'VOIDED'
        ? `Envelope anulado${p.motivoAnulacao ? ` — ${p.motivoAnulacao}` : ''}.`
        : completo
          ? 'Todas as assinaturas concluídas — a minuta assinada é arquivada automaticamente no repositório (RN-F2-04).'
          : `Aguardando ${total - concluidas} assinatura(s). O DocuSign envia o lembrete por e-mail a cada 2 dias (HU-04.1).`,
    faixaTipo: !rascunho && completo ? 'ok' : 'info',
    signatarios,
    rascunho,
    natureza: p.sequencia === 1 ? 'PRINCIPAL' : 'TERMO_CESSAO_HOMOLOGADA',
  };
}

const TERMO_NAO_APLICAVEL: TermoCessaoData = {
  aplicavel: false,
  minutaDisponivel: false,
  minutaNome: null,
  pacotePrincipalConcluido: false,
  situacao: 'NAO_APLICAVEL',
  situacaoLabel: 'Não se aplica a esta oportunidade.',
  situacaoPill: 'n',
  podeEnviar: false,
  podeAnular: false,
};

function termoCessao(o: OportunidadeElenco, e: EstadoContrato | null): TermoCessaoData {
  if (!e || !termoAplicavel(o.id)) return TERMO_NAO_APLICAVEL;
  const contratoTermo = e.contratos.find((c) => c.tipo === 'TERMO_CESSAO_CREDITO');
  const minutaTermo = contratoTermo ? minutaCorrente(e, contratoTermo.id) : undefined;
  const principal = pacoteCorrente(e, 1);
  const homologada = pacoteCorrente(e, 2);
  const base = {
    aplicavel: true,
    minutaDisponivel: !!minutaTermo?.fileName,
    minutaNome: minutaTermo?.fileName ?? null,
    pacotePrincipalConcluido: principal?.status === 'COMPLETED',
  };
  if (homologada?.status === 'COMPLETED') {
    return { ...base, situacao: 'CONCLUIDO', situacaoLabel: 'A empresa homologada assinou o Termo de Cessão.', situacaoPill: 's', podeEnviar: false, podeAnular: false };
  }
  if (homologada && EM_CIRCULACAO.includes(homologada.status)) {
    return {
      ...base,
      situacao: 'EM_ASSINATURA',
      situacaoLabel:
        homologada.status === 'CREATED'
          ? 'Envelope da homologada em rascunho — posicione os campos e envie.'
          : 'Aguardando a assinatura da empresa homologada.',
      situacaoPill: 'w',
      podeEnviar: false,
      podeAnular: true,
    };
  }
  if (!base.pacotePrincipalConcluido) {
    if (!base.minutaDisponivel) {
      return {
        ...base,
        situacao: 'AGUARDANDO_MINUTA',
        situacaoLabel:
          'Há obra vinculada por recursos financeiros: anexe a minuta do Termo de Cessão na seção Minuta antes de enviar o pacote para assinatura.',
        situacaoPill: 'w',
        podeEnviar: false,
        podeAnular: false,
      };
    }
    return {
      ...base,
      situacao: 'AGUARDANDO_PACOTE_PRINCIPAL',
      situacaoLabel:
        'O Termo de Cessão segue no pacote principal. A empresa homologada assina depois, sobre o documento já assinado pelas demais partes.',
      situacaoPill: 'i',
      podeEnviar: false,
      podeAnular: false,
    };
  }
  return {
    ...base,
    situacao: homologada ? 'ANULADO' : 'PRONTO_PARA_ENVIO',
    situacaoLabel: homologada
      ? 'Envio à empresa homologada anulado — é possível enviar novamente.'
      : 'Pronto para enviar o Termo de Cessão assinado à empresa homologada.',
    situacaoPill: homologada ? 'n' : 's',
    podeEnviar: true,
    podeAnular: false,
  };
}

const BLOQUEIO_ASSINATURA_LABEL: Record<string, string> = {
  minutas_nao_geradas: 'minutas não geradas',
  termo_cessao_ausente: 'a minuta do Termo de Cessão não foi anexada (há obra vinculada por recursos financeiros)',
  sem_contrato: 'nenhum contrato derivado das propostas',
};

function faltasDaAssinatura(o: OportunidadeElenco, e: EstadoContrato | null): string[] {
  if (!e || e.contratos.length === 0) return ['sem_contrato'];
  const faltas: string[] = [];
  const naoGeradas = e.contratos.some((c) => {
    const m = minutaCorrente(e, c.id);
    return !m || !m.fileName || !['GERADA', 'ASSINADA'].includes(m.status);
  });
  if (naoGeradas) faltas.push('minutas_nao_geradas');
  if (termoAplicavel(o.id)) {
    const termo = e.contratos.find((c) => c.tipo === 'TERMO_CESSAO_CREDITO');
    if (!termo || !minutaCorrente(e, termo.id)?.fileName) faltas.push('termo_cessao_ausente');
  }
  return faltas;
}

function textoBloqueios(codigos: string[]): string {
  return codigos.map((c) => BLOQUEIO_ASSINATURA_LABEL[c] ?? c).join('; ');
}

/** Porte de `buildSendbar` do backend — modo Sender View ligado. */
function montarSendbar(
  o: OportunidadeElenco,
  etapa: EtapaContratoInt,
  etapaTrilha: EtapaContratoInt,
  pacotes: PacoteInt[],
  termo: TermoCessaoData,
  faltas: string[],
  pagamentoNaoSeAplica: boolean,
  podeAnexarMinuta: boolean,
): Sendbar {
  const vazio = { acaoLabel: null, acaoEvento: null, acaoHabilitada: false, motivoBloqueio: null };
  if (!naFaseDeContrato(o)) {
    return { mensagem: 'Contrato', mensagemDetalhe: 'Oportunidade não está em fase de contrato.', ...vazio };
  }

  const rascunho =
    pacotes.find((p) => p.status === 'CREATED' && p.sequencia === 1) ?? pacotes.find((p) => p.status === 'CREATED');
  if (rascunho) {
    const doTermo = rascunho.sequencia === 2;
    return {
      mensagem: doTermo ? 'Termo de Cessão — posicionamento pendente' : 'Posicionamento dos campos de assinatura',
      mensagemDetalhe:
        `O envelope ${doTermo ? 'da empresa homologada ' : ''}está em rascunho no DocuSign. Abra a tela do ` +
        'DocuSign, arraste os campos de assinatura para cada signatário e clique em Enviar — é ali que o envelope sai.',
      acaoLabel: 'Posicionar campos e enviar',
      acaoEvento: doTermo ? 'contrato:posicionar-homologada' : 'contrato:posicionar',
      acaoHabilitada: true,
      motivoBloqueio: null,
    };
  }

  if (termo.podeEnviar) {
    return {
      mensagem: 'Termo de Cessão',
      mensagemDetalhe:
        'O pacote principal está assinado. Envie o Termo de Cessão assinado para a empresa homologada — ela recebe apenas esse documento.',
      acaoLabel: 'Enviar para assinatura da homologada',
      acaoEvento: 'contrato:enviar-homologada',
      acaoHabilitada: true,
      motivoBloqueio: null,
    };
  }

  if (o.estado === 'CONCLUIDA') {
    return {
      mensagem: 'Contrato concluído',
      mensagemDetalhe: pagamentoNaoSeAplica
        ? `O contrato foi concluído com sucesso. ${MOTIVO_SEM_PAGAMENTO}`
        : 'O contrato foi concluído com sucesso.',
      ...vazio,
    };
  }

  if (o.estado === 'EM_PAGAMENTO') {
    if (pagamentoNaoSeAplica) {
      return {
        mensagem: 'Contratos ativados — sem pagamento',
        mensagemDetalhe: `${MOTIVO_SEM_PAGAMENTO} A oportunidade será concluída automaticamente.`,
        acaoLabel: 'Concluir oportunidade',
        acaoEvento: 'contrato:concluir',
        acaoHabilitada: true,
        motivoBloqueio: null,
      };
    }
    const ativado = etapaTrilha === 'PAGAMENTO';
    return {
      mensagem: ativado ? 'Em pagamento' : 'Ativação dos Contratos',
      mensagemDetalhe: ativado
        ? 'Contrato ativo no Salesforce. A liberação de pagamento corre lá — conclua a oportunidade quando terminar.'
        : 'Assinatura concluída. Cadastro, ativação e liberação de pagamento correm no Salesforce — conclua a oportunidade quando terminarem.',
      acaoLabel: 'Concluir oportunidade',
      acaoEvento: 'contrato:concluir',
      acaoHabilitada: true,
      motivoBloqueio: null,
    };
  }

  const emCirculacao = pacotes.filter((p) => EM_CIRCULACAO.includes(p.status));
  if (emCirculacao.length > 0) {
    const concluidas = emCirculacao.reduce((t, p) => t + p.signatarios.filter((s) => s.status === 'ASSINADO').length, 0);
    const total = emCirculacao.reduce((t, p) => t + p.signatarios.length, 0);
    if (total > 0 && concluidas >= total) {
      return {
        mensagem: 'Assinatura concluída',
        mensagemDetalhe: `${concluidas} de ${total} assinaturas concluídas — avanço para a fase de cadastro/pagamento em andamento.`,
        ...vazio,
      };
    }
    return {
      mensagem: 'Assinatura em andamento',
      mensagemDetalhe: `${concluidas} de ${total} assinaturas concluídas.`,
      acaoLabel: 'Ver signatários',
      acaoEvento: 'contrato:ver-assinatura',
      acaoHabilitada: true,
      motivoBloqueio: null,
    };
  }

  if (etapa === 'MINUTA' || etapa === 'ASSINATURA') {
    if (faltas.length === 0) {
      return {
        mensagem: 'Envio para assinatura',
        mensagemDetalhe: 'Minutas anexadas. Você vai posicionar os campos de assinatura no DocuSign e enviar por lá.',
        acaoLabel: 'Posicionar campos e enviar',
        acaoEvento: 'contrato:enviar',
        acaoHabilitada: true,
        motivoBloqueio: null,
      };
    }
    if (etapa === 'ASSINATURA') {
      return {
        mensagem: 'Envio para assinatura',
        mensagemDetalhe: 'Minuta disponível. Envie para os signatários.',
        acaoLabel: 'Posicionar campos e enviar',
        acaoEvento: 'contrato:enviar',
        acaoHabilitada: false,
        motivoBloqueio: `Bloqueios pendentes: ${textoBloqueios(faltas)}`,
      };
    }
    const outros = faltas.filter((f) => f !== 'minutas_nao_geradas');
    return {
      mensagem: 'Minuta',
      mensagemDetalhe:
        'A geração automática está desativada — a integração com o Netlex ainda está em desenvolvimento. ' +
        (podeAnexarMinuta
          ? 'Anexe a minuta na seção Minuta, em “+ Adicionar documento”.'
          : 'A minuta é anexada na seção Minuta por quem elabora o contrato.') +
        (outros.length > 0 ? ` Bloqueios pendentes: ${textoBloqueios(outros)}.` : ''),
      ...vazio,
    };
  }

  return {
    mensagem: 'Liberação de pagamento',
    mensagemDetalhe: 'Contrato ativo. Cadastro, ativação e liberação de pagamento correm no Salesforce.',
    ...vazio,
  };
}

function dadosBancarios(o: OportunidadeElenco, e: EstadoContrato | null, etapaTrilha: EtapaContratoInt): DadosBancarios | null {
  if (!e || (o.estado !== 'EM_PAGAMENTO' && o.estado !== 'CONCLUIDA')) return null;
  const ativo = etapaTrilha === 'PAGAMENTO';
  const ritmAberto = !!e.ritm && e.ritm.statusLabel !== 'Encerrado';
  return {
    banco: 'Banco Exemplo S.A. (999)',
    agencia: '0472',
    conta: '*****-3',
    contratoAtivo: ativo,
    aptoParaPagamento: ativo,
    codigoFornecedorSap: ativo ? `ZF${o.clienteSap}` : null,
    gate: [
      {
        key: 'codigoFornecedorSap',
        label: 'Código de fornecedor (SAP)',
        statusLabel: ativo ? 'Verificado' : 'Pendente',
        statusPill: ativo ? 's' : 'w',
        mensagem: ativo ? null : 'O fornecedor ainda não foi cadastrado no SAP (grupo ZFPJ).',
      },
      {
        key: 'dadosBancarios',
        label: 'Dados bancários',
        statusLabel: 'Conferidos',
        statusPill: 's',
        mensagem: null,
      },
    ],
    podeSolicitarRitm: !ritmAberto,
    ritmTicketId: e.ritm?.ticketId ?? null,
    ritmStatusLabel: e.ritm?.statusLabel ?? null,
    contaVinculada: '*****-3',
  };
}

function montarReadModel(o: OportunidadeElenco, user: MockUser | null): ContratoReadModel {
  const e = estadoDoContrato(o);
  const etapa = etapaAtualDe(o, e);
  const pagamentoNaoSeAplica =
    !!e && !exigePagamento(e) && (o.estado === 'CONCLUIDA' || (o.estado === 'EM_PAGAMENTO' && etapaTrilhaDe(etapa, e) === 'PAGAMENTO'));
  const trilhaBruta = etapaTrilhaDe(etapa, e);
  const etapaTrilha = pagamentoNaoSeAplica && trilhaBruta === 'PAGAMENTO' ? 'ATIVACAO' : trilhaBruta;

  const pacotesVisiveis = e
    ? ([pacoteCorrente(e, 1), pacoteCorrente(e, 2)].filter(Boolean) as PacoteInt[])
    : [];
  const termo = termoCessao(o, e);
  const faltas = naFaseDeContrato(o) ? faltasDaAssinatura(o, e) : ['sem_contrato'];
  const lt = usuarioPorId(o.ltId);
  const gerente = usuarioPorId('usr-gv-henrique');

  const minutas: MinutaItem[] = e
    ? e.contratos.flatMap((c) => {
        const m = minutaCorrente(e, c.id);
        return m ? [minutaItem(e, c, m)] : [];
      })
    : [];
  const pacoteCompleto = minutas.length > 0 && minutas.every((m) => m.status === 'GERADA');

  const contratos: ContratoItem[] = e
    ? e.contratos.map((c) => ({
        id: c.id,
        tipo: c.tipo,
        tipoLabel: TIPO_DOCUMENTO_LABEL[c.tipo],
        papel: c.papel,
        papelLabel: PAPEL_CONTRATO_LABEL[c.papel],
        etapa: c.etapa,
        etapaLabel: ETAPA_LABEL[c.etapa],
        etapasPermitidas: proximaEtapa(c.etapa),
        codigoExterno: c.codigoExterno,
        estadoExterno: c.estadoExterno,
        estadoExternoLabel: c.estadoExterno ? ESTADO_EXTERNO_LABEL[c.estadoExterno] : null,
        estadoExternoPill: c.estadoExterno ? ESTADO_EXTERNO_PILL[c.estadoExterno] : null,
        minutaPadrao: c.minutaPadrao,
        origemGestao: 'Cadastro/ativação: Salesforce · Liberação de pagamento: Salesforce',
      }))
    : [];
  const contratosCrm: ContratoCrmItem[] = e ? e.contratosCrm : [];

  const assinatura: AssinaturaData = { pacotes: pacotesVisiveis.map(pacoteItem) };
  const headPill: ContratoReadModel['headPill'] =
    o.estado === 'EM_PAGAMENTO' || o.estado === 'CONCLUIDA' || etapa === 'CADASTRO' || etapa === 'ATIVACAO' || etapa === 'PAGAMENTO'
      ? { texto: 'Contrato ativo', variant: 's' }
      : etapa === 'ASSINATURA'
        ? { texto: 'Em assinatura', variant: 'i' }
        : { texto: 'Em minuta', variant: 'i' };

  const pagamentoPronto = etapaTrilha === 'PAGAMENTO';
  const modelo: ContratoReadModel = {
    fase: o.estado,
    faseLabel:
      o.estado === 'EM_PAGAMENTO'
        ? etapaTrilha === 'PAGAMENTO'
          ? 'Em pagamento'
          : 'Ativação dos Contratos'
        : ESTADO_LABEL[o.estado],
    etapaAtual: etapa,
    etapaAtualLabel: ETAPA_LABEL[etapa],
    etapasPermitidas: proximaEtapa(etapa),
    etapaTrilha,
    pagamentoNaoSeAplica,
    headPill,
    trilha: montarTrilha(etapa),
    minutas: ok(minutas),
    assinatura: ok(assinatura),
    termoCessao: ok(termo),
    contratos: ok(contratos),
    contratosCrm: ok(contratosCrm),
    pendencias: ok({ total: 0, itens: [] }),
    readiness: {
      minuta: {
        ready: !!e && e.contratos.length > 0,
        missing: e && e.contratos.length > 0 ? [] : ['sem_contrato'],
        motivoBloqueio: e && e.contratos.length > 0 ? null : 'Bloqueios pendentes: nenhum contrato derivado das propostas',
        mensagemSucesso:
          o.estado === 'EM_MINUTA' && pacoteCompleto
            ? 'Minutas disponíveis e nenhuma pendência obrigatória em aberto — pronto para enviar para assinatura.'
            : null,
        podeAnexar: true,
        motivoBloqueioAnexo: null,
      },
      assinatura: {
        ready: faltas.length === 0,
        missing: faltas,
        signatarioLt: lt ? { nome: lt.name, email: lt.email, editavel: false } : null,
        representanteSugerido: gerente ? { nome: gerente.name, email: gerente.email } : null,
      },
      pagamento: { pronto: pagamentoPronto, missing: pagamentoPronto ? [] : ['contrato_nao_ativo'] },
    },
    sendbar: montarSendbar(
      o,
      etapa,
      etapaTrilha,
      pacotesVisiveis,
      termo,
      faltas,
      pagamentoNaoSeAplica,
      temPapel(user, ...PAPEIS_MINUTA),
    ),
    alteracaoMinutaPadrao: e?.alteracaoMinutaPadrao ?? null,
    lacunasDeMinuta: e?.lacunas ?? [],
    cadeiaAprovacao: e?.cadeia ?? null,
    obra: null,
  };
  // AUSENTE (e não `null`) para quem não lê o dado bancário — mesma regra do backend.
  if (temPapel(user, ...PAPEIS_DADOS_BANCARIOS)) {
    modelo.dadosBancarios = ok(dadosBancarios(o, e, etapaTrilha));
  }
  return modelo;
}

// ───────────────────────────── Helpers HTTP ────────────────────────────────

const oppNaoEncontrada = () => erro(404, 'Oportunidade não encontrada.');

/** Consultor de Expansão só opera minuta/assinatura em oportunidade com franquia. */
function podeOperarMinuta(user: MockUser | null, o: OportunidadeElenco): boolean {
  if (!temPapel(user, ...PAPEIS_MINUTA)) return false;
  const soConsultor = !!user && user.roles.every((r) => r === 'CONSULTOR_EXPANSAO');
  return !soConsultor || o.tipo === 'Franquia';
}

interface SignatarioDigitadoOk {
  nome: string;
  email: string;
}

/** Valida uma lista de signatários digitados; `null` quando algum é inválido. */
function lerSignatarios(lista: unknown): SignatarioDigitadoOk[] | null {
  if (!Array.isArray(lista)) return null;
  const saida: SignatarioDigitadoOk[] = [];
  for (const item of lista as SignatarioDigitado[]) {
    const nome = typeof item?.nome === 'string' ? item.nome.trim() : '';
    const email = typeof item?.email === 'string' ? item.email.trim() : '';
    if (!nome || !EMAIL_RE.test(email)) return null;
    saida.push({ nome, email });
  }
  return saida;
}

function comContrato(
  ctx: MockContext,
  fn: (o: OportunidadeElenco, e: EstadoContrato) => Response | Promise<Response>,
  semFase: () => Response = () => erro(409, 'A oportunidade ainda não está na fase de contrato.'),
): Response | Promise<Response> {
  const o = oportunidade(ctx.params.id);
  if (!o) return oppNaoEncontrada();
  const e = estadoDoContrato(o);
  if (!e) return semFase();
  return fn(o, e);
}

function nomePdf(fileName: string | null, fallback: string): string {
  return (fileName ?? fallback).replace(/\.[A-Za-z0-9]+$/, '') + '.pdf';
}

// ─────────────────────────── Minuta: atribuição ────────────────────────────

function atribuicaoView(o: OportunidadeElenco, e: EstadoContrato): MinutaAtribuicao {
  const analista = usuarioPorId(e.atribuicao.analistaId);
  return {
    opportunityId: o.id,
    analista: analista ? { id: analista.id, nome: analista.name, email: analista.email } : null,
    gerencia: e.atribuicao.gerencia,
    atribuicaoPendente: !analista,
    atribuidaEm: e.atribuicao.atribuidaEm,
    atribuidaPorNome: e.atribuicao.atribuidaPorNome,
    podeReatribuir: etapaAtualDe(o, e) === 'MINUTA',
  };
}

// ─────────────────────────────── Obra ──────────────────────────────────────

function obraSelecionada(o: OportunidadeElenco): Obra | null {
  const v = vinculoDeObra(o.id);
  if (!v) return null;
  return obrasEstado().catalogo[o.clienteSap]?.find((x) => x.estimateId === v.estimateId) ?? null;
}

const ESCADA_OBRA: { label: string; status: string; gresp: string; junto?: boolean }[] = [
  { label: 'Em preenchimento', status: 'Em preenchimento', gresp: 'LT' },
  { label: 'Estimativa confirmada', status: 'Orçamento gerado', gresp: 'ENG + LT' },
  { label: 'Orçamento gerado', status: 'Orçamento gerado', gresp: 'ENG', junto: true },
  { label: 'Draft aprovado', status: 'Draft aprovado', gresp: 'ENG' },
  { label: 'Aguardando início', status: 'Aguardando início', gresp: 'ENG' },
  { label: 'Obra em andamento', status: 'Obra em andamento', gresp: 'ENG' },
  { label: 'Obra concluída', status: 'Obra concluída', gresp: 'ENG' },
];

function trilhaDaObra(o: OportunidadeElenco): ObraTrilha {
  const v = vinculoDeObra(o.id);
  const status = v?.statusInterno.status ?? null;
  let atual = -1;
  if (v && status) ESCADA_OBRA.forEach((d, i) => d.status === status && (atual = i));
  const passos: ObraPasso[] = ESCADA_OBRA.map((d, i) => ({
    ordem: i + 1,
    label: d.label,
    gresp: d.gresp,
    estado: atual < 0 ? 'pending' : i < atual ? 'done' : i === atual ? (d.junto ? 'done' : 'active') : 'pending',
  }));
  if (!v) {
    return {
      temObra: false,
      subLabel: 'Não se aplica',
      pill: 'n',
      passos,
      nota:
        'Nenhuma obra do Converge vinculada a esta oportunidade. A obra é escolhida ao cadastrar um recurso financeiro ou um investimento custeado por ela.',
    };
  }
  return { temObra: true, subLabel: status ?? 'Não se aplica', pill: v.statusInterno.pill, passos, nota: null };
}

// ──────────────────────────────── Rotas ────────────────────────────────────

rotas('contrato', [
  // ── Read model ────────────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/contrato',
    handler: ({ params, user }) => {
      const o = oportunidade(params.id);
      if (!o) return oppNaoEncontrada();
      return json<ContratoReadModel>(montarReadModel(o, user));
    },
  },

  // ── Minutas ──────────────────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/contrato/minutas/tipos-anexaveis',
    handler: (ctx) =>
      comContrato(
        ctx,
        (_o, e) => {
          const noPacote = new Map<TipoDocumento, MinutaTipoAnexavel>();
          for (const c of e.contratos) {
            const jaAnexado = !!minutaCorrente(e, c.id)?.fileName;
            const existente = noPacote.get(c.tipo);
            if (existente) {
              existente.jaAnexado = existente.jaAnexado && jaAnexado;
              continue;
            }
            noPacote.set(c.tipo, { tipo: c.tipo, tipoLabel: TIPO_DOCUMENTO_LABEL[c.tipo], noPacote: true, jaAnexado });
          }
          const extras = TIPOS_DOCUMENTO.filter((t) => !noPacote.has(t)).map<MinutaTipoAnexavel>((t) => ({
            tipo: t,
            tipoLabel: TIPO_DOCUMENTO_LABEL[t],
            noPacote: false,
            jaAnexado: false,
          }));
          return json<MinutaTipoAnexavel[]>([...noPacote.values(), ...extras]);
        },
        // Antes da fase não há pacote: só os instrumentos extras.
        () =>
          json<MinutaTipoAnexavel[]>(
            TIPOS_DOCUMENTO.map((t) => ({ tipo: t, tipoLabel: TIPO_DOCUMENTO_LABEL[t], noPacote: false, jaAnexado: false })),
          ),
      ),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/minutas/anexar',
    handler: (ctx) => {
      const tipo = campo<string>(ctx.body, 'tipo');
      const arquivo = arquivoEnviado(ctx.body);
      if (typeof tipo !== 'string' || !tipo.trim()) return erro(400, 'Selecione o tipo do documento.');
      if (!arquivo) return erro(400, 'Selecione o arquivo do documento.');
      return comContrato(ctx, (o, e) => {
        if (!podeOperarMinuta(ctx.user, o)) return erro(403, 'Acesso não autorizado.');
        if (!TIPOS_DOCUMENTO.includes(tipo as TipoDocumento)) return erro(400, 'Tipo de documento inválido.');
        if (etapaAtualDe(o, e) !== 'MINUTA') {
          return erro(409, 'O pacote já seguiu para assinatura — documentos só podem ser anexados na fase de minuta.');
        }
        const t = tipo as TipoDocumento;
        const agora = agoraIso();
        const slotVazio = e.contratos.find((c) => c.tipo === t && !minutaCorrente(e, c.id)?.fileName);
        const comDoc = e.contratos.find((c) => c.tipo === t && !!minutaCorrente(e, c.id)?.fileName);
        if (!slotVazio && comDoc) {
          return erro(
            409,
            `Já existe um documento anexado para ${TIPO_DOCUMENTO_LABEL[t]}. Para trocá-lo, use “Substituir” na linha do documento.`,
          );
        }
        let contratoAlvo = slotVazio;
        let m: MinutaInt;
        if (contratoAlvo) {
          m = minutaCorrente(e, contratoAlvo.id) ?? {
            id: novoId('min'),
            contractId: contratoAlvo.id,
            versao: 1,
            status: 'GERADA',
            origem: 'UPLOAD_MANUAL',
            netlexConsultaCodigo: null,
            fileName: null,
            atualizadoEm: agora,
          };
          if (!e.minutas.includes(m)) e.minutas.push(m);
        } else {
          contratoAlvo = {
            id: novoId('ctr'),
            tipo: t,
            papel: 'ACESSORIO',
            etapa: 'MINUTA',
            codigoExterno: null,
            estadoExterno: null,
            minutaPadrao: false,
          };
          e.contratos.push(contratoAlvo);
          m = {
            id: novoId('min'),
            contractId: contratoAlvo.id,
            versao: 1,
            status: 'GERADA',
            origem: 'UPLOAD_MANUAL',
            netlexConsultaCodigo: null,
            fileName: null,
            atualizadoEm: agora,
          };
          e.minutas.push(m);
        }
        m.status = 'GERADA';
        m.origem = 'UPLOAD_MANUAL';
        m.fileName = arquivo.nome;
        m.atualizadoEm = agora;
        return json<MinutaItem>(minutaItem(e, contratoAlvo, m));
      });
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/minutas/:minutaId/substituir',
    handler: (ctx) => {
      const justificativa = campo<string>(ctx.body, 'justificativa');
      if (typeof justificativa !== 'string' || !justificativa.trim()) return erro(400, 'Justificativa é obrigatória.');
      return comContrato(ctx, (o, e) => {
        if (!podeOperarMinuta(ctx.user, o)) return erro(403, 'Acesso não autorizado.');
        const atual = e.minutas.find((m) => m.id === ctx.params.minutaId);
        if (!atual) return erro(404, 'Minuta não encontrada.');
        if (atual.status !== 'GERADA') return erro(400, 'Apenas minutas com status GERADA podem ser substituídas.');
        const arquivo = arquivoEnviado(ctx.body);
        if (!arquivo) return erro(400, 'Selecione o arquivo da nova versão.');
        const codigo = campo<string>(ctx.body, 'netlexConsultaCodigo');
        atual.status = 'SUBSTITUIDA';
        e.minutas.push({
          id: novoId('min'),
          contractId: atual.contractId,
          versao: atual.versao + 1,
          status: 'GERADA',
          origem: 'UPLOAD_MANUAL',
          netlexConsultaCodigo: typeof codigo === 'string' && codigo.trim() ? codigo.trim() : null,
          fileName: arquivo.nome,
          atualizadoEm: agoraIso(),
        });
        return json({}, 200);
      }, () => erro(404, 'Minuta não encontrada.'));
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/minutas/gerar',
    handler: (ctx) =>
      comContrato(ctx, (o, e) => {
        if (!podeOperarMinuta(ctx.user, o)) return erro(403, 'Acesso não autorizado.');
        const aguardando = e.contratos
          .map((c) => ({ c, m: minutaCorrente(e, c.id) }))
          .filter((x) => x.m && x.m.status === 'AGUARDANDO');
        if (aguardando.length === 0) return erro(422, 'Não há minutas aguardando geração nesta oportunidade.');
        const cliente = clientePorSap(o.clienteSap);
        for (const { c, m } of aguardando) {
          if (!m) continue;
          m.status = 'GERADA';
          m.origem = 'NETLEX_PADRAO';
          m.fileName = `${c.tipo}_${(cliente?.nomeFantasia ?? o.code).replace(/\s+/g, '_')}.docx`;
          m.atualizadoEm = agoraIso();
        }
        return json({}, 200);
      }),
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/contrato/minutas/:minutaId/download',
    handler: (ctx) =>
      comContrato(
        ctx,
        (_o, e) => {
          const m = e.minutas.find((x) => x.id === ctx.params.minutaId);
          const c = m && e.contratos.find((x) => x.id === m.contractId);
          if (!m || !c || !m.fileName) return erro(404, 'Minuta não encontrada.');
          return pdf(`${TIPO_DOCUMENTO_LABEL[c.tipo]} - versao ${m.versao}`, nomePdf(m.fileName, 'minuta'), false);
        },
        () => erro(404, 'Minuta não encontrada.'),
      ),
  },

  // ── Analista da minuta ─────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/minuta/atribuicao',
    handler: (ctx) =>
      comContrato(
        ctx,
        (o, e) => json<MinutaAtribuicao>(atribuicaoView(o, e)),
        () => erro(404, 'A oportunidade ainda não entrou na fase de minuta.'),
      ),
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/minuta/atribuicao/reatribuir',
    handler: (ctx) => {
      if (!temPapel(ctx.user, ...PAPEIS_REATRIBUIR)) {
        return erro(403, 'Sem permissão para reatribuir o analista da minuta.');
      }
      return comContrato(
        ctx,
        (o, e) => {
          const analistaId = campo<string>(ctx.body, 'analistaId');
          if (typeof analistaId !== 'string' || !analistaId.trim()) return erro(400, 'Informe o analista.');
          if (etapaAtualDe(o, e) !== 'MINUTA') {
            return erro(409, 'A reatribuição só é possível enquanto a oportunidade estiver na fase de minuta.');
          }
          const novo = usuarioPorId(analistaId.trim());
          if (!novo || !temPapel(novo, ...PAPEIS_ANALISTA_MINUTA)) {
            return erro(422, 'O colaborador informado não pertence ao grupo de analistas SNEG (VBR_GOP_SNEG_DEV).');
          }
          e.atribuicao = {
            analistaId: novo.id,
            gerencia: e.atribuicao.gerencia,
            atribuidaEm: agoraIso(),
            atribuidaPorNome: ctx.user?.name ?? null,
          };
          return json<MinutaAtribuicao>(atribuicaoView(o, e));
        },
        () => erro(404, 'A oportunidade ainda não entrou na fase de minuta.'),
      );
    },
  },

  // ── Dados bancários (RITM) ────────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/dados-bancarios/solicitar-ritm',
    handler: (ctx) => {
      if (!temPapel(ctx.user, ...PAPEIS_LEMBRETE)) return erro(403, 'Sem permissão para solicitar RITM.');
      return comContrato(ctx, (_o, e) => {
        if (e.ritm && e.ritm.statusLabel !== 'Encerrado') {
          return erro(409, `Já existe uma solicitação aberta para esta oportunidade (${e.ritm.ticketId}).`);
        }
        const numero = 48000 + Math.floor(Math.random() * 9000);
        e.ritm = { ticketId: `RITM00${numero}`, statusLabel: 'Aberto' };
        return json<SolicitarRitmResult>({ ritmTicketId: e.ritm.ticketId, ritmStatusLabel: e.ritm.statusLabel });
      });
    },
  },

  // ── Assinatura (DocuSign) ─────────────────────────────────────────────
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/assinatura/enviar',
    handler: (ctx) => {
      if (ctx.body === undefined || ctx.body === null || typeof ctx.body !== 'object') {
        return erro(400, 'Informe os signatários do contrato.');
      }
      const o = oportunidade(ctx.params.id);
      if (!o) return oppNaoEncontrada();
      if (!podeOperarMinuta(ctx.user, o)) return erro(403, 'Sem permissão para enviar o contrato para assinatura.');
      const e = estadoDoContrato(o);
      if (!e || o.estado !== 'EM_ASSINATURA') {
        return erro(
          409,
          'A oportunidade ainda não está em assinatura — o envio parte da transição “Enviar para assinatura” da fase de minuta.',
        );
      }
      const principal = pacoteCorrente(e, 1);
      if (principal && EM_CIRCULACAO.includes(principal.status)) {
        return erro(409, 'Já existe um envelope do pacote principal em circulação. Anule o envio antes de reenviar.');
      }
      const faltas = faltasDaAssinatura(o, e);
      if (faltas.length > 0) {
        return erro(422, `Contrato não está pronto para envio. Bloqueios pendentes: ${textoBloqueios(faltas)}.`, {
          missing: faltas,
        });
      }
      const b = ctx.body as Record<string, unknown>;
      const clientes = lerSignatarios(b.clientesSignatarios);
      const representantes = lerSignatarios(b.representantesVibra);
      const testemunhas = lerSignatarios(b.testemunhas);
      const ltEmail = typeof b.ltEmail === 'string' && b.ltEmail.trim() ? b.ltEmail.trim() : undefined;
      if (
        !clientes?.length ||
        !representantes?.length ||
        !testemunhas ||
        (ltEmail !== undefined && !EMAIL_RE.test(ltEmail))
      ) {
        return erro(400, 'Dados dos signatários inválidos. Revise nomes e e-mails.');
      }
      registrarEnvelopePrincipal(e, o, { clientes, representantes, testemunhas, ltEmail });
      definirEtapa(e, 'ASSINATURA');
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/assinatura/posicionar',
    handler: (ctx) => {
      const o = oportunidade(ctx.params.id);
      if (!o) return oppNaoEncontrada();
      if (!podeOperarMinuta(ctx.user, o)) return erro(403, 'Sem permissão para posicionar os campos de assinatura.');
      const e = estadoDoContrato(o);
      const sequencia: 1 | 2 = campo<number>(ctx.body, 'sequencia') === 2 ? 2 : 1;
      const pacote = e ? pacoteCorrente(e, sequencia) : undefined;
      if (!pacote) return erro(404, 'Nenhum envelope em rascunho para esta oportunidade.');
      if (pacote.status !== 'CREATED') {
        return erro(
          409,
          `O pacote ${sequencia} já foi enviado (situação: ${STATUS_ENVELOPE_LABEL[pacote.status]}). ` +
            'A tela de posicionamento de campos só existe enquanto o envelope é rascunho.',
        );
      }
      // A "Sender View" do protótipo é a própria página de retorno: o fluxo
      // volta para a oportunidade como voltaria do DocuSign.
      return json<{ url: string }>({
        url: `/docusign/retorno/${encodeURIComponent(o.id)}?envelopeId=${pacote.envelopeExternoId}&event=Send`,
      });
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/assinatura/sincronizar',
    handler: (ctx) => {
      const o = oportunidade(ctx.params.id);
      if (!o) return oppNaoEncontrada();
      const e = estadoDoContrato(o);
      // Sem envelope não é erro para quem acabou de voltar da tela.
      if (!e) return json({ ok: true });
      const agora = agoraIso();
      const vivos = ([pacoteCorrente(e, 1), pacoteCorrente(e, 2)].filter(Boolean) as PacoteInt[]).filter((p) =>
        ['CREATED', 'SENT', 'DELIVERED'].includes(p.status),
      );
      const pacote = vivos[0];
      if (!pacote) return json({ ok: true });

      if (pacote.status === 'CREATED') {
        // O "Send" da Sender View: o envelope sai e o primeiro signatário é notificado.
        pacote.status = 'SENT';
        pacote.enviadoEm = agora;
        const primeiro = [...pacote.signatarios].sort((a, b) => a.ordem - b.ordem)[0];
        if (primeiro) primeiro.status = 'PENDENTE';
        return json({ ok: true });
      }

      // Envelope em circulação: o próximo signatário assina (simulação do Connect).
      const ordenados = [...pacote.signatarios].sort((a, b) => a.ordem - b.ordem);
      const vez = ordenados.find((s) => s.status === 'PENDENTE') ?? ordenados.find((s) => s.status === 'AGUARDANDO');
      if (vez) {
        vez.status = 'ASSINADO';
        vez.assinadoEm = agora;
        const proximo = ordenados.find((s) => s.status === 'AGUARDANDO');
        if (proximo) proximo.status = 'PENDENTE';
      }
      if (ordenados.every((s) => s.status === 'ASSINADO')) {
        if (pacote.sequencia === 1) {
          concluirPacotePrincipal(e, pacote);
          // GATE 4: assinatura concluída leva a oportunidade ao pagamento.
          if (o.estado === 'EM_ASSINATURA' || o.estado === 'EM_MINUTA') moverPara(o.id, 'EM_PAGAMENTO');
        } else {
          pacote.status = 'COMPLETED';
          pacote.concluidoEm = agora;
        }
      }
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/assinatura/signatarios/:signerId/reenviar',
    handler: (ctx) => {
      if (!temPapel(ctx.user, ...PAPEIS_LEMBRETE)) return erro(403, 'Sem permissão para reenviar o lembrete.');
      const o = oportunidade(ctx.params.id);
      const e = o ? estadoDoContrato(o) : null;
      const pacote = e?.pacotes.find((p) => p.signatarios.some((s) => s.id === ctx.params.signerId));
      const s = pacote?.signatarios.find((x) => x.id === ctx.params.signerId);
      if (!o || !pacote || !s) return erro(404, 'Signatário ou oportunidade não encontrado.');
      if (pacote.status === 'CREATED') return erro(409, 'O envelope ainda é rascunho — ninguém foi notificado.');
      if (s.status === 'ASSINADO') return erro(409, 'Este signatário já assinou — não há lembrete a enviar.');
      if (s.status !== 'PENDENTE') return erro(409, 'Ainda não é a vez deste signatário assinar.');
      s.ultimoLembreteEm = agoraIso();
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/assinatura/homologada/enviar',
    handler: (ctx) => {
      const lista = campo<unknown>(ctx.body, 'signatarios');
      if (!Array.isArray(lista) || lista.length === 0) {
        return erro(400, 'Informe ao menos um signatário da empresa homologada.');
      }
      const o = oportunidade(ctx.params.id);
      if (!o) return oppNaoEncontrada();
      if (!podeOperarMinuta(ctx.user, o)) {
        return erro(403, 'Sem permissão para enviar o Termo de Cessão à empresa homologada.');
      }
      const e = estadoDoContrato(o);
      if (!e || !termoAplicavel(o.id)) {
        return erro(409, 'O Termo de Cessão não se aplica a esta oportunidade — não há obra vinculada por recursos financeiros.');
      }
      if (pacoteCorrente(e, 1)?.status !== 'COMPLETED') {
        return erro(409, 'O pacote principal ainda não foi concluído — a empresa homologada assina sobre o Termo já assinado.');
      }
      const hom = pacoteCorrente(e, 2);
      if (hom && EM_CIRCULACAO.includes(hom.status)) {
        return erro(409, 'O Termo de Cessão já foi enviado à empresa homologada.');
      }
      const signatarios = lerSignatarios(lista);
      if (!signatarios) return erro(400, 'Dados dos signatários inválidos. Revise nomes e e-mails.');
      criarPacote(e, 2, (pacoteId) =>
        signatarios.map((s, i) => novoSignatario(pacoteId, i + 1, 'HOMOLOGADA', s.nome, s.email, 'AGUARDANDO')),
      );
      return json({ ok: true });
    },
  },
  {
    method: 'POST',
    pattern: '/opportunities/:id/contrato/assinatura/homologada/anular',
    handler: (ctx) => {
      const motivo = campo<string>(ctx.body, 'motivo');
      if (typeof motivo !== 'string' || !motivo.trim()) return erro(400, 'Informe o motivo da anulação.');
      const o = oportunidade(ctx.params.id);
      if (!o) return oppNaoEncontrada();
      if (!podeOperarMinuta(ctx.user, o)) return erro(403, 'Sem permissão para anular o envio do Termo de Cessão.');
      const e = estadoDoContrato(o);
      const hom = e ? pacoteCorrente(e, 2) : undefined;
      if (!hom || !['CREATED', 'SENT', 'DELIVERED'].includes(hom.status)) {
        return erro(409, 'Não há envio do Termo de Cessão em circulação para anular.');
      }
      hom.status = 'VOIDED';
      hom.motivoAnulacao = motivo.trim();
      return json({ ok: true });
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/contrato/assinatura/documentos/:signatureId/stream',
    handler: (ctx) => {
      const o = oportunidade(ctx.params.id);
      const e = o ? estadoDoContrato(o) : null;
      const doc = e ? documentosAssinados(e).find((d) => d.id === ctx.params.signatureId) : undefined;
      if (!doc) return erro(404, 'O contrato ainda não tem documento assinado arquivado.');
      return pdf(`${doc.titulo} - assinado`, doc.fileName);
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/contrato/assinatura/envelopes/:envelopeId/certificado/stream',
    handler: (ctx) => {
      const o = oportunidade(ctx.params.id);
      const e = o ? estadoDoContrato(o) : null;
      const p = e?.pacotes.find((x) => x.id === ctx.params.envelopeId);
      if (!p || p.status !== 'COMPLETED') {
        return erro(404, 'O envelope ainda não tem certificado de conclusão arquivado.');
      }
      return pdf(`Certificado de Conclusao - envelope ${p.envelopeExternoId.slice(0, 8)}`, `Certificado_${p.id}.pdf`);
    },
  },

  // ── Obra (Converge) ───────────────────────────────────────────────────
  {
    method: 'GET',
    pattern: '/opportunities/:id/obra',
    handler: ({ params }) => {
      const o = oportunidade(params.id);
      if (!o) return oppNaoEncontrada();
      const v = vinculoDeObra(o.id);
      const selecionada = obraSelecionada(o);
      return json<ObraReadModel>({
        selecionada,
        statusInterno: selecionada && v ? v.statusInterno : null,
        andamento: selecionada && v ? v.andamento : null,
      });
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/obra/disponiveis',
    handler: ({ params }) => {
      const o = oportunidade(params.id);
      if (!o) return oppNaoEncontrada();
      // Leitura AO VIVO: não há retrato guardado para datar. A obra já vinculada
      // a OUTRA oportunidade não volta a ser oferecida.
      const ocupadas = Object.entries(obrasEstado().vinculos)
        .filter(([oppId]) => oppId !== o.id)
        .map(([, v]) => v.estimateId);
      return json<Obra[]>(
        (obrasEstado().catalogo[o.clienteSap] ?? [])
          .filter((x) => !ocupadas.includes(x.estimateId))
          .map((x) => ({ ...x, sincronizadoEm: null })),
      );
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/obra/trilha',
    handler: ({ params }) => {
      const o = oportunidade(params.id);
      if (!o) return oppNaoEncontrada();
      return json<ObraTrilha>(trilhaDaObra(o));
    },
  },
  {
    method: 'GET',
    pattern: '/opportunities/:id/obra/anexo-j/:estimateId/stream',
    handler: ({ params }) => {
      const o = oportunidade(params.id);
      const obra = o ? obraSelecionada(o) : null;
      if (!obra || obra.estimateId !== params.estimateId) {
        return erro(404, 'Esta obra não tem Anexo J nesta oportunidade.');
      }
      return pdf(`Anexo J - Estimativa ${obra.estimateId} - ${obra.tipo}`, `Anexo_J_${obra.estimateId}.pdf`);
    },
  },
]);

// ─────────────── Documentos assinados (para o bloco "outras origens") ───────

interface DocumentoAssinado {
  id: string;
  pacoteId: string;
  titulo: string;
  fileName: string;
  anexadoEm: string | null;
}

/** Um documento por contrato do pacote principal concluído, e o Termo da homologada. */
function documentosAssinados(e: EstadoContrato): DocumentoAssinado[] {
  const saida: DocumentoAssinado[] = [];
  for (const p of e.pacotes.filter((x) => x.status === 'COMPLETED')) {
    const contratos =
      p.sequencia === 1 ? e.contratos : e.contratos.filter((c) => c.tipo === 'TERMO_CESSAO_CREDITO');
    for (const c of contratos) {
      const m = e.minutas.filter((x) => x.contractId === c.id).sort((a, b) => b.versao - a.versao)[0];
      saida.push({
        id: `sig-${p.id}-${c.id}`,
        pacoteId: p.id,
        titulo: TIPO_DOCUMENTO_LABEL[c.tipo],
        fileName: nomePdf(m?.fileName ?? null, c.tipo).replace(
          /\.pdf$/,
          p.sequencia === 2 ? '_homologada_assinado.pdf' : '_assinado.pdf',
        ),
        anexadoEm: p.concluidoEm,
      });
    }
  }
  return saida;
}

// ───────────── Pontos de integração para OUTROS domínios (só leitura) ───────

/**
 * Grupos "Documentos de outras origens" que o checklist da oportunidade
 * (domínio de documentos) pode exibir: contrato assinado, certificado do
 * DocuSign e Anexo J — com os ids que as rotas de stream DESTE domínio aceitam.
 */
export function gruposDeOutrasOrigensDoContrato(oppId: string): GrupoDocumentosDeOutraOrigem[] {
  const o = oportunidade(oppId);
  if (!o) return [];
  const grupos: GrupoDocumentosDeOutraOrigem[] = [];
  const e = estadoDoContrato(o);
  if (e) {
    const assinados = documentosAssinados(e);
    if (assinados.length > 0) {
      grupos.push({
        titulo: 'Contrato assinado (DocuSign)',
        documentos: assinados.map((d) => ({
          origem: 'CONTRATO_ASSINADO',
          documentoId: d.id,
          proposalId: null,
          tipo: d.titulo,
          fileName: d.fileName,
          anexadoEm: d.anexadoEm,
        })),
      });
      const certificados = e.pacotes.filter((p) => p.status === 'COMPLETED');
      grupos.push({
        titulo: 'Certificado de conclusão (DocuSign)',
        documentos: certificados.map((p) => ({
          origem: 'CONTRATO_CERTIFICADO',
          documentoId: p.id,
          proposalId: null,
          tipo: p.sequencia === 1 ? 'Certificado — pacote principal' : 'Certificado — empresa homologada',
          fileName: `Certificado_${p.id}.pdf`,
          anexadoEm: p.concluidoEm,
        })),
      });
    }
  }
  const obra = obraSelecionada(o);
  if (obra) {
    grupos.push({
      titulo: 'Anexo J da obra (Converge)',
      documentos: [
        {
          origem: 'OBRA_ANEXO_J',
          documentoId: obra.estimateId,
          proposalId: o.propostas.find((p) => p.eleita)?.id ?? null,
          tipo: 'Anexo J',
          fileName: `Anexo_J_${obra.estimateId}.pdf`,
          anexadoEm: obra.sincronizadoEm,
        },
      ],
    });
  }
  return grupos;
}

/** Obras do Converge de um cliente (para o seletor "Adicionar obra" da proposta). */
export function obrasDoCliente(clienteSap: string): Obra[] {
  return obrasEstado().catalogo[clienteSap] ?? [];
}

/**
 * Vincula (ou troca) a obra da oportunidade — para o "Adicionar obra" da
 * proposta (domínio de propostas). Recurso financeiro ⇒ Termo de Cessão no pacote.
 */
export function vincularObra(oppId: string, estimateId: string, modelo: ModeloContratacaoObra): void {
  obrasEstado().vinculos[oppId] = {
    estimateId,
    modelo,
    statusInterno: { status: 'Orçamento gerado', pill: 'i', acompanhadaNoConverge: false },
    andamento: null,
  };
}

export function desvincularObra(oppId: string): void {
  delete obrasEstado().vinculos[oppId];
}
