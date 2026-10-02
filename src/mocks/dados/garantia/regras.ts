import {
  CATEGORIA_BEM_LABEL,
  ESTADO_CIVIL_LABEL,
  TIPO_GARANTIA_LABEL,
  exigeFiador,
  exigeImovel,
  exigePrevia,
} from '@/lib/garantia/constants';
import type { BackendGarantia, BackendGarantiaIndicacao as BackendIndicacaoView } from '@/lib/garantia/garantia-mapping';
import type { BackendGarantiaTrack, BackendGarantiaPassso } from '@/lib/garantia/garantia-track-mapping';
import type { BackendIndicacao } from '@/lib/garantia/indicacao-mapping';
import type { BackendGarantiaIndicacao as BackendItem } from '@/lib/garantia/indicacoes-mapping';
import type { EstadoGarantia } from '@/lib/garantia/types';

import { usuarioPorId, type MockUser } from '../../core/session';
import { ROTULO_FASE } from '../../estado-compartilhado';
import { clientePorSap, type EstadoBackend, type OportunidadeElenco } from '../../elenco';
import { TIPOS_DOC, type GarantiaOppInt, type IndicacaoInt, type PreviaInt } from './semente';

/**
 * Regras do domínio garantia, espelhando o backend (`apps/api/src/garantia`)
 * só no que a tela mostra. Saída sempre no formato do DTO do BACKEND — quem
 * converte para o tipo do front são os mappers de produção, chamados no handler.
 */

// ───────────────────────────── catálogos do backend ─────────────────────────────

export const ESTADO_LABEL: Record<EstadoGarantia, string> = {
  AGUARDANDO_INDICACAO: 'Garantia · aguardando indicação',
  EM_ANALISE_PREVIA: 'Garantia · em análise prévia',
  PREVIA_APROVADA: 'Garantia · análise prévia aprovada',
  PREVIA_REPROVADA: 'Garantia · prévia reprovada',
  MINUTA_EM_ANDAMENTO: 'Garantia · minuta em andamento',
  ENCERRADO: 'Garantia · encerrada',
};

const ESTADO_LABEL_CONJUNTO: Record<EstadoGarantia, string> = {
  AGUARDANDO_INDICACAO: 'Garantias · aguardando indicação',
  EM_ANALISE_PREVIA: 'Garantias · análise prévia',
  PREVIA_APROVADA: 'Garantias · aprovadas',
  PREVIA_REPROVADA: 'Garantias · prévia reprovada',
  MINUTA_EM_ANDAMENTO: 'Garantias · minuta em andamento',
  ENCERRADO: 'Garantias · encerradas',
};

export const ESTADO_PILL: Record<EstadoGarantia, string> = {
  AGUARDANDO_INDICACAO: 'w',
  EM_ANALISE_PREVIA: 'i',
  PREVIA_APROVADA: 's',
  PREVIA_REPROVADA: 'd',
  MINUTA_EM_ANDAMENTO: 'i',
  ENCERRADO: 'n',
};

const TRANSICOES: Record<EstadoGarantia, EstadoGarantia[]> = {
  AGUARDANDO_INDICACAO: ['EM_ANALISE_PREVIA', 'ENCERRADO'],
  EM_ANALISE_PREVIA: ['PREVIA_APROVADA', 'PREVIA_REPROVADA', 'ENCERRADO', 'AGUARDANDO_INDICACAO'],
  PREVIA_APROVADA: ['MINUTA_EM_ANDAMENTO', 'ENCERRADO'],
  PREVIA_REPROVADA: ['AGUARDANDO_INDICACAO', 'ENCERRADO'],
  MINUTA_EM_ANDAMENTO: [],
  ENCERRADO: [],
};

const SUB_LABEL: Partial<Record<EstadoGarantia, string>> = {
  EM_ANALISE_PREVIA: 'Análise prévia',
  PREVIA_REPROVADA: 'Análise prévia',
  PREVIA_APROVADA: 'Minuta',
  MINUTA_EM_ANDAMENTO: 'Contrato',
  ENCERRADO: 'Não se aplica',
};

const ANALISE_ESTADO_LABEL: Partial<Record<EstadoGarantia, string>> = {
  EM_ANALISE_PREVIA: 'Em análise prévia →',
  PREVIA_APROVADA: 'Prévia aprovada →',
  MINUTA_EM_ANDAMENTO: 'Minuta em andamento →',
};

const PASSOS: ReadonlyArray<{ ordem: number; label: string; responsavel: string | null; semFonte?: boolean }> = [
  { ordem: 1, label: 'Em preenchimento', responsavel: 'LT' },
  { ordem: 2, label: 'Análise de Perfil', responsavel: 'CCOB' },
  { ordem: 3, label: 'Aguardando envio da documentação de garantia', responsavel: 'LT' },
  { ordem: 4, label: 'Análise Prévia da Garantia em andamento', responsavel: 'CCOB' },
  { ordem: 5, label: 'Em Elaboração', responsavel: 'SNEG' },
  { ordem: 6, label: 'Minuta da Garantia', responsavel: 'Amaral Maia' },
  { ordem: 7, label: 'Validação da Área de Crédito', responsavel: 'CCOB', semFonte: true },
  { ordem: 8, label: 'Lavratura e Registro da Hipoteca', responsavel: 'Amaral Maia / LT', semFonte: true },
  { ordem: 9, label: 'Checklist da Área de Crédito', responsavel: 'CCOB', semFonte: true },
  { ordem: 10, label: 'Concluído', responsavel: null },
];

const MOTIVO_PERFIL_NAO_INICIADO =
  'A análise de perfil de crédito ainda não foi iniciada — ela começa quando a oportunidade é enviada para análise (SNEG), e a análise prévia da garantia é acionada depois dela.';
const MOTIVO_PERFIL_EM_EXECUCAO =
  'A análise de perfil de crédito ainda está em execução — a análise prévia da garantia só pode ser acionada depois dela.';
const MOTIVO_PERFIL_NAO_APROVADO =
  'A análise de perfil de crédito não foi concluída — a análise prévia da garantia só pode ser acionada depois dela.';
const MOTIVO_SEM_GARANTIA =
  'Nenhuma garantia cadastrada — cadastre a garantia antes de enviar para a análise prévia.';
const MOTIVO_DOCUMENTOS_PENDENTES =
  'Não é possível enviar para a análise prévia: a garantia cadastrada ainda não está completa.';
const MOTIVO_DUAS_CONDICOES = 'Não é possível enviar para a análise prévia: veja o que falta abaixo.';

// ───────────────────────────── analistas (diretório) ─────────────────────────────

// Analistas vêm do diretório único (`core/session.ts`), o mesmo que o mock de
// `/api/directory/*` lista — o seletor e a validação nunca divergem.
export function analistaDaArea(id: string, papel: 'CCOB' | 'SNEG'): MockUser | null {
  const u = usuarioPorId(id);
  return u && u.roles.includes(papel) ? u : null;
}

function nomeDe(id: string | null): MockUser | null {
  return id ? usuarioPorId(id) : null;
}

// ───────────────────────────── formatação ─────────────────────────────

const milhar = (n: number) => Math.trunc(n).toLocaleString('pt-BR');

/** `formatBrlFull` do backend: "R$ 1.440.000" (centavos só quando há). */
function brlFull(valor: number): string {
  const centavos = Math.round(valor * 100) % 100;
  return `R$ ${milhar(valor)}${centavos > 0 ? `,${String(centavos).padStart(2, '0')}` : ''}`;
}

/** `formatBrlAbreviado` do backend: "R$ 240 mil", "R$ 2 mi". */
export function brlAbreviado(valor: number): string {
  const inteiro = Math.trunc(valor);
  if (inteiro >= 1_000_000 && inteiro % 1_000_000 === 0 && inteiro / 1_000_000 < 1000) {
    return `R$ ${inteiro / 1_000_000} mi`;
  }
  if (inteiro >= 1_000 && inteiro % 1_000 === 0 && inteiro / 1_000 < 1000) return `R$ ${inteiro / 1_000} mil`;
  return brlFull(valor);
}

/** "R$ 1.200.000,00" — o `valorAvaliadoBrl` formatado do read model da indicação. */
function brl2(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PERCENTUAL_POR_CATEGORIA: Record<string, number | null> = {
  POSTO: 90,
  COMERCIAL: null,
  RESIDENCIAL: null,
  RURAL: null,
};

// ───────────────────────────── predicados ─────────────────────────────

/** "O GATE 1 já rodou?" — `analiseJaIniciada` do backend. */
export function analiseIniciada(estadoOpp: EstadoBackend): boolean {
  return estadoOpp !== 'NOVOS' && estadoOpp !== 'EM_PREENCHIMENTO';
}

/** `indicacaoMutavel` — o card só escreve enquanto a oportunidade está em preenchimento. */
export function indicacoesEditaveis(estadoOpp: EstadoBackend): boolean {
  return !analiseIniciada(estadoOpp);
}

function perfilResolvido(g: GarantiaOppInt): boolean {
  const s = g.perfil.status;
  if (s === 'EM_EXECUCAO') return false;
  return s === 'CONCLUIDO' || s === 'ENCERRADO' || g.antecipacaoBRL == null;
}

/** `motivosDeInaptidao` do backend — o que falta em UMA garantia. */
export function motivosDeInaptidao(i: IndicacaoInt): string[] {
  const motivos: string[] = [];
  const tipoLabel = TIPO_GARANTIA_LABEL[i.tipo];
  const tipos = i.documentos.map((d) => d.type);

  if (exigeImovel(i.tipo)) {
    if (i.categoria === null) motivos.push(`${tipoLabel} — categoria não informada`);
    if (i.matriculas.length === 0) motivos.push(`${tipoLabel} — nenhuma matrícula informada`);
    for (const m of i.matriculas) {
      const temCertidao =
        i.documentos.some((d) => d.type === TIPOS_DOC.certidao && d.matriculaId === m.id) ||
        (i.matriculas.length === 1 &&
          (i.legado.certidao !== null || i.documentos.some((d) => d.type === TIPOS_DOC.certidao && d.matriculaId === null)));
      if (!temCertidao) motivos.push(`${tipoLabel} — falta a certidão de inteiro teor da matrícula ${m.numero}`);
    }
    if (i.origem !== 'EXISTENTE') {
      const exigidos = i.quantidadeLaudos ?? 1;
      const anexados = laudosAnexados(i);
      if (anexados < exigidos) {
        motivos.push(
          exigidos === 1
            ? `${tipoLabel} — falta o documento "${TIPOS_DOC.laudo}"`
            : `${tipoLabel} — ${anexados} de ${exigidos} laudos de avaliação anexados`,
        );
      }
    }
  }
  if (i.valorAvaliadoBRL == null) motivos.push(`${tipoLabel} — valor não informado`);
  if (exigeFiador(i.tipo) && i.fiadores.length === 0) motivos.push(`${tipoLabel} — nenhum fiador informado`);
  if (i.tipo === 'FIANCA_BANCARIA' && !tipos.includes(TIPOS_DOC.minutaFianca)) {
    motivos.push(`${tipoLabel} — falta o documento "${TIPOS_DOC.minutaFianca}"`);
  }
  return motivos;
}

function laudosAnexados(i: IndicacaoInt): number {
  return i.documentos.filter((d) => d.type === TIPOS_DOC.laudo).length + (i.legado.laudo ? 1 : 0);
}

function motivoDoPerfil(g: GarantiaOppInt): string {
  if (g.perfil.status === null || g.perfil.status === 'PENDENTE') return MOTIVO_PERFIL_NAO_INICIADO;
  if (g.perfil.status === 'EM_EXECUCAO') return MOTIVO_PERFIL_EM_EXECUCAO;
  return MOTIVO_PERFIL_NAO_APROVADO;
}

export interface EnvioPreviaGate {
  disponivel: boolean;
  habilitado: boolean;
  codigo: string | null;
  motivo: string | null;
  motivos: string[];
}

/** `avaliarEnvioPreviaGate` — o botão "Enviar para análise prévia". */
export function envioPreviaGate(g: GarantiaOppInt): EnvioPreviaGate {
  const tipos = g.indicacoes.map((i) => i.tipo);
  if (g.antecipacaoBRL == null || (tipos.length > 0 && !tipos.some(exigePrevia))) {
    return {
      disponivel: false,
      habilitado: false,
      codigo: 'NAO_SE_APLICA',
      motivo: 'Esta oportunidade não segue o fluxo de análise prévia da garantia.',
      motivos: [],
    };
  }
  if (g.estado !== 'AGUARDANDO_INDICACAO') {
    return {
      disponivel: false,
      habilitado: false,
      codigo: 'JA_ENVIADA',
      motivo: 'A análise prévia da garantia já foi acionada.',
      motivos: [],
    };
  }

  const motivos: string[] = [];
  let codigo: string | null = null;
  if (g.indicacoes.length === 0) {
    codigo = 'SEM_GARANTIA';
    motivos.push(MOTIVO_SEM_GARANTIA);
  } else {
    const porIndicacao = g.indicacoes.map(motivosDeInaptidao);
    if (!porIndicacao.some((m) => m.length === 0)) {
      codigo = 'DOCUMENTOS_PENDENTES';
      motivos.push(...porIndicacao.reduce((a, b) => (b.length < a.length ? b : a)));
    }
  }
  if (g.perfil.status !== 'CONCLUIDO') {
    codigo ??= 'PERFIL_NAO_APROVADO';
    motivos.push(motivoDoPerfil(g));
  }
  if (motivos.length === 0) return { disponivel: true, habilitado: true, codigo: null, motivo: null, motivos: [] };

  const manchete =
    motivos.length > 1
      ? MOTIVO_DUAS_CONDICOES
      : codigo === 'SEM_GARANTIA'
        ? MOTIVO_SEM_GARANTIA
        : codigo === 'PERFIL_NAO_APROVADO'
          ? MOTIVO_PERFIL_NAO_APROVADO
          : MOTIVO_DOCUMENTOS_PENDENTES;
  return { disponivel: true, habilitado: false, codigo, motivo: manchete, motivos };
}

/** Gate da CCOB para confirmar a prévia (`getPreviaHabilitada`). */
function previaGate(g: GarantiaOppInt): { habilitada: boolean; motivoBloqueio: string | null } {
  if (g.estado !== 'EM_ANALISE_PREVIA') {
    return { habilitada: false, motivoBloqueio: 'A garantia não está em análise prévia.' };
  }
  if (g.perfil.status !== 'CONCLUIDO') {
    return { habilitada: false, motivoBloqueio: 'Aguardando a conclusão da análise de perfil de crédito.' };
  }
  if (!g.indicacoes.some((i) => motivosDeInaptidao(i).length === 0)) {
    return { habilitada: false, motivoBloqueio: 'Nenhuma garantia do conjunto está com a documentação completa.' };
  }
  return { habilitada: true, motivoBloqueio: null };
}

export function podeConfirmarPrevia(g: GarantiaOppInt): { habilitada: boolean; motivoBloqueio: string | null } {
  return previaGate(g);
}

// ───────────────────────────── cobertura ─────────────────────────────

function valorAproveitavel(i: IndicacaoInt): { valor: number | null; percentualLabel: string | null; motivo: string | null } {
  if (i.categoria == null) {
    return { valor: null, percentualLabel: null, motivo: 'Categoria do bem não informada — percentual de aproveitamento indisponível.' };
  }
  const categoriaLabel = CATEGORIA_BEM_LABEL[i.categoria];
  const pct = PERCENTUAL_POR_CATEGORIA[i.categoria] ?? null;
  if (pct == null) {
    return {
      valor: null,
      percentualLabel: null,
      motivo: `Percentual de aproveitamento não definido para a categoria ${categoriaLabel} — cobertura indisponível.`,
    };
  }
  const percentualLabel = `${pct}% (${categoriaLabel.toLowerCase()})`;
  if (i.valorAvaliadoBRL == null) {
    return { valor: null, percentualLabel, motivo: 'Valor avaliado do bem não informado — cobertura indisponível.' };
  }
  return { valor: Math.floor((i.valorAvaliadoBRL * pct) / 100), percentualLabel, motivo: null };
}

function coberturaDoConjunto(g: GarantiaOppInt): NonNullable<BackendGarantia['cobertura']> {
  const excluidas: Array<{ tipoLabel: string; motivo: string }> = [];
  let soma: number | null = null;
  for (const i of g.indicacoes) {
    const tipoLabel = TIPO_GARANTIA_LABEL[i.tipo];
    if (!exigeImovel(i.tipo)) {
      excluidas.push({ tipoLabel, motivo: `${tipoLabel} — sem bem avaliado` });
      continue;
    }
    const linha = valorAproveitavel(i);
    if (linha.valor === null) {
      excluidas.push({ tipoLabel, motivo: linha.motivo ?? `${tipoLabel} — cobertura indisponível` });
      continue;
    }
    soma = (soma ?? 0) + linha.valor;
  }
  if (soma === null) {
    return {
      valorAproveitadoLabel: null,
      coberturaSuficiente: null,
      coberturaTexto: null,
      motivoIndisponivel:
        g.indicacoes.length === 0
          ? 'Nenhuma garantia indicada — cobertura indisponível.'
          : 'Nenhuma garantia com valor aproveitável — cobertura indisponível.',
      excluidas,
    };
  }
  if (g.antecipacaoBRL == null || g.antecipacaoBRL <= 0) {
    return {
      valorAproveitadoLabel: brlFull(soma),
      coberturaSuficiente: null,
      coberturaTexto: null,
      motivoIndisponivel: 'Valor da antecipação ausente ou zero — cobertura indisponível.',
      excluidas,
    };
  }
  const cobre = soma >= g.antecipacaoBRL;
  return {
    valorAproveitadoLabel: brlFull(soma),
    coberturaSuficiente: cobre,
    coberturaTexto: `${brlFull(soma)} — ${cobre ? 'cobre' : 'não cobre'} a antecipação (${brlAbreviado(g.antecipacaoBRL)})`,
    motivoIndisponivel: null,
    excluidas,
  };
}

// ───────────────────────────── DTOs do backend ─────────────────────────────

/** Linha `GarantiaIndicacaoItemDto` — entra em `mapBackendToItem`. */
export function itemBackend(i: IndicacaoInt): BackendItem {
  const linha = exigeImovel(i.tipo) ? valorAproveitavel(i) : null;
  const docsRepo = i.documentos.map((d) => ({
    id: d.id,
    type: d.type,
    fileName: d.fileName,
    uploadedAt: d.uploadedAt,
    origem: 'REPOSITORIO' as const,
    garantiaMatriculaId: d.matriculaId,
  }));
  // Legado: o `id` É o slot — é por ele que a rota `/:slot/view` o serve.
  const docsLegado = (['certidao', 'laudo'] as const)
    .filter((slot) => i.legado[slot] !== null)
    .map((slot) => ({
      id: slot,
      type: slot === 'certidao' ? TIPOS_DOC.certidao : TIPOS_DOC.laudo,
      fileName: i.legado[slot] ?? slot,
      uploadedAt: null,
      origem: 'LEGADO' as const,
      garantiaMatriculaId: null,
    }));
  const certidaoSemVinculo =
    i.legado.certidao !== null || i.documentos.some((d) => d.type === TIPOS_DOC.certidao && d.matriculaId === null);
  const casamentos = new Set(
    i.documentos.filter((d) => d.type === TIPOS_DOC.casamento && d.fiadorId).map((d) => d.fiadorId),
  );

  return {
    id: i.id,
    tipo: i.tipo,
    tipoLabel: TIPO_GARANTIA_LABEL[i.tipo],
    origem: i.origem,
    origemLabel: i.origem === 'NOVA' ? 'Nova' : 'Existente',
    utilizacao: i.utilizacao,
    imovel: i.imovel,
    matricula: null,
    matriculas: i.matriculas.map((m) => ({
      id: m.id,
      ordem: m.ordem,
      numero: m.numero,
      certidaoAnexada:
        i.documentos.some((d) => d.type === TIPOS_DOC.certidao && d.matriculaId === m.id) ||
        (i.matriculas.length === 1 && certidaoSemVinculo),
    })),
    quantidadeLaudos: i.quantidadeLaudos,
    laudosAnexados: laudosAnexados(i),
    compartilhadaComOutrasOportunidades: i.compartilhada,
    detalhesCompartilhamento: i.detalhesCompartilhamento,
    categoria: i.categoria,
    categoriaLabel: i.categoria ? CATEGORIA_BEM_LABEL[i.categoria] : null,
    estadoCivil: i.estadoCivil,
    estadoCivilLabel: i.estadoCivil ? ESTADO_CIVIL_LABEL[i.estadoCivil] : null,
    valorAvaliadoBrl: i.valorAvaliadoBRL == null ? null : i.valorAvaliadoBRL.toFixed(2),
    observacoes: i.observacoes,
    criadaEm: i.criadaEm,
    // Qualquer valor não nulo: o mapper troca pela rota same-origin `/view`.
    certidaoUrl: i.legado.certidao ? 'armazenamento://legado/certidao' : null,
    certidaoFileName: i.legado.certidao,
    laudoUrl: i.legado.laudo ? 'armazenamento://legado/laudo' : null,
    laudoFileName: i.legado.laudo,
    documentos: [...docsRepo, ...docsLegado],
    fiadores: i.fiadores.map((f) => ({
      id: f.id,
      nome: f.nome,
      documento: f.documento,
      estadoCivil: f.estadoCivil,
      conjugeNome: f.conjugeNome,
      conjugeDocumento: f.conjugeDocumento,
      email: f.email,
      profissao: f.profissao,
      endereco: f.endereco,
      conjugeEmail: f.conjugeEmail,
      conjugeProfissao: f.conjugeProfissao,
      conjugeEndereco: f.conjugeEndereco,
      certidaoCasamentoAnexada: casamentos.has(f.id),
    })),
    imovelCidade: i.imovelCidade,
    imovelUf: i.imovelUf,
    percentualAproveitamentoLabel: linha?.percentualLabel ?? null,
    valorAproveitadoLabel: linha?.valor != null ? brlFull(linha.valor) : null,
  };
}

function concessaoFinanceira(g: GarantiaOppInt): string | null {
  return g.antecipacaoBRL && g.antecipacaoBRL > 0 ? `Sim · Antecipação ${brlAbreviado(g.antecipacaoBRL)}` : null;
}

function analisePerfilPrecondicao(g: GarantiaOppInt, opp: OportunidadeElenco): string | null {
  const { status, classificacao } = g.perfil;
  if (status === 'CONCLUIDO') return classificacao ? `Concluído · Risco ${classificacao.toLowerCase()}` : 'Concluído';
  if (status === 'EM_EXECUCAO') return 'Em execução';
  if (status === 'ENCERRADO') return 'Encerrado';
  return analiseIniciada(opp.estado)
    ? 'Aguardando o início da análise de perfil de crédito'
    : 'Não iniciada — começa no envio da oportunidade para análise';
}

function previaCorrente(g: GarantiaOppInt): PreviaInt | null {
  return g.previas.length ? g.previas[g.previas.length - 1] : null;
}

function atribuicaoBackend(a: GarantiaOppInt['atribuicaoCcob']) {
  const u = nomeDe(a?.analistaId ?? null);
  return {
    analistaId: a?.analistaId ?? null,
    analistaNome: u?.name ?? null,
    analistaEmail: u?.email ?? null,
    gerencia: a?.gerencia ?? null,
    atribuicaoPendente: !!a && !a.analistaId,
    atribuidaEm: a?.atribuidaEm ?? null,
  };
}

export function atribuicaoCcobBackend(g: GarantiaOppInt) {
  return atribuicaoBackend(g.atribuicaoCcob);
}

export function atribuicaoSnegBackend(g: GarantiaOppInt) {
  return atribuicaoBackend(g.atribuicaoSneg);
}

/** Read model `GET /v1/opportunities/:id/garantia` — entra em `mapGarantia`. */
export function viewBackend(g: GarantiaOppInt, opp: OportunidadeElenco): BackendGarantia {
  const cliente = clientePorSap(opp.clienteSap);
  const previa = previaCorrente(g);
  const estadosComPrevia: EstadoGarantia[] = ['EM_ANALISE_PREVIA', 'PREVIA_APROVADA', 'PREVIA_REPROVADA', 'MINUTA_EM_ANDAMENTO'];
  const mostraPrevia = estadosComPrevia.includes(g.estado) || (g.estado === 'AGUARDANDO_INDICACAO' && previa !== null);
  const gate = previaGate(g);
  const fluxoIniciado = g.estado === 'PREVIA_APROVADA' || g.estado === 'MINUTA_EM_ANDAMENTO';
  const ccob = nomeDe(g.atribuicaoCcob?.analistaId ?? null);
  const sneg = nomeDe(g.atribuicaoSneg?.analistaId ?? null);
  const concessao = concessaoFinanceira(g);

  return {
    estado: g.estado,
    estadoLabel: ESTADO_LABEL[g.estado],
    estadoPill: ESTADO_PILL[g.estado],
    naoSeAplica: g.antecipacaoBRL == null,
    naoSeAplicaMotivo:
      g.antecipacaoBRL == null ? 'Não se aplica — a concessão não tem antecipação nem mútuo, então não exige garantia.' : null,
    concessaoFinanceira: concessao,
    analisePerfilPrecondicao: analisePerfilPrecondicao(g, opp),
    tipoLabel: g.indicacoes.length ? TIPO_GARANTIA_LABEL[g.indicacoes[0].tipo] : null,
    responsavelPrevia: ccob?.name ?? null,
    podeReatribuirPrevia: g.estado === 'EM_ANALISE_PREVIA',
    atribuicao: atribuicaoCcobBackend(g),
    responsavelGarantia: fluxoIniciado ? (sneg ? `${sneg.name} · SNEG` : null) : null,
    fluxoGarantiaIniciado: fluxoIniciado,
    atribuicaoSneg: atribuicaoSnegBackend(g),
    pendenciaIndicacaoId: g.pendenciaIndicacaoId,
    indicacoes: g.indicacoes.map((i) => ({
      id: i.id,
      tipoLabel: TIPO_GARANTIA_LABEL[i.tipo],
      imovel: i.imovel,
      matricula: i.matriculas[0]?.numero ?? null,
      categoriaLabel: i.categoria ? CATEGORIA_BEM_LABEL[i.categoria] : null,
      valorAvaliadoBrl: i.valorAvaliadoBRL == null ? null : i.valorAvaliadoBRL.toFixed(2),
    })),
    cobertura: coberturaDoConjunto(g),
    documentosLegado: g.documentosLegado,
    valoresPorFinalidadeTexto:
      g.estado === 'MINUTA_EM_ANDAMENTO' && g.antecipacaoBRL
        ? `Concessão Financeira — reservado ${brlFull(g.antecipacaoBRL)} · utilizado ${brlFull(
            opp.estado === 'EM_PAGAMENTO' || opp.estado === 'CONCLUIDA' ? g.antecipacaoBRL : 0,
          )}`
        : '',
    previa: mostraPrevia
      ? {
          parecer: previa?.parecer ?? null,
          resultado: previa?.resultado ?? null,
          resultadoLabel: previa?.resultado ? (previa.resultado === 'APROVADA' ? 'Aprovada' : 'Reprovada') : null,
          podeConfirmar: gate.habilitada,
          motivoBloqueio: gate.habilitada ? null : gate.motivoBloqueio,
        }
      : null,
    previaHistorico: g.previas
      .filter((p) => p.resultado !== null)
      .slice()
      .reverse()
      .map((p) => ({
        parecer: p.parecer ?? '',
        resultado: p.resultado ?? '',
        resultadoLabel: p.resultado === 'APROVADA' ? 'Aprovada' : 'Reprovada',
        resultadoPill: p.resultado === 'APROVADA' ? 's' : 'd',
        concluidaEm: p.concluidaEm,
      })),
    minuta: fluxoIniciado
      ? {
          netlexId: g.minuta?.netlexNumero ?? null,
          status: g.minuta?.status ?? null,
          statusLabel: g.minuta?.status ?? 'Aguardando início no Netlex',
        }
      : null,
    oportunidade: {
      id: opp.id,
      code: opp.code,
      codigoDisplay: `${opp.code} · SAP ${opp.clienteSap}`,
      clienteNome: cliente?.razaoSocial ?? '—',
      clienteCnpj: cliente?.cnpj ?? '—',
      localizacao: cliente ? `${cliente.cidade}/${cliente.uf}` : '—',
      valorBrl: concessao ? brlAbreviado(g.antecipacaoBRL ?? 0) : null,
      faseLabel: ROTULO_FASE[opp.fase],
      ltResponsavel: usuarioPorId(opp.ltId)?.name ?? '—',
    },
  };
}

/** Trilha `GET /v1/opportunities/:id/garantia/trilha` — entra em `mapGarantiaTrack`. */
export function trilhaBackend(g: GarantiaOppInt, opp: OportunidadeElenco): BackendGarantiaTrack {
  const iniciada = analiseIniciada(opp.estado);
  const naoSeAplica = g.antecipacaoBRL == null;
  const emDigitacao = !iniciada && g.estado === 'AGUARDANDO_INDICACAO';
  const resolvido = perfilResolvido(g);
  const contratoConcluido = opp.estado === 'CONCLUIDA';
  const contratoAvancado = opp.estado === 'EM_PAGAMENTO' || contratoConcluido;

  const estadoDoPasso = (ordem: number): BackendGarantiaPassso['estado'] => {
    if (emDigitacao) return ordem === 1 ? 'active' : 'pending';
    const perfil = g.perfil.status === 'CONCLUIDO' ? 'done' : g.perfil.status === 'EM_EXECUCAO' ? 'active' : 'pending';
    switch (g.estado) {
      case 'AGUARDANDO_INDICACAO':
      case 'PREVIA_REPROVADA':
        if (ordem === 1) return 'done';
        if (ordem === 2) return perfil;
        if (ordem === 3) return resolvido ? 'active' : 'pending';
        return 'pending';
      case 'EM_ANALISE_PREVIA':
        return ordem <= 3 ? 'done' : ordem === 4 ? 'active' : 'pending';
      case 'PREVIA_APROVADA':
        return ordem <= 4 ? 'done' : ordem === 5 ? 'active' : 'pending';
      case 'MINUTA_EM_ANDAMENTO':
        if (ordem <= 5) return 'done';
        if (ordem === 6) return contratoAvancado ? 'done' : 'active';
        if (ordem === 10) return contratoConcluido ? 'done' : 'pending';
        return 'pending';
      default:
        return 'pending';
    }
  };

  const passos: BackendGarantiaPassso[] = PASSOS.map((p) => {
    const passo: BackendGarantiaPassso = {
      ordem: p.ordem,
      label: p.label,
      responsavel: p.responsavel,
      estado: estadoDoPasso(p.ordem),
    };
    if (p.semFonte) passo.semFonte = true;
    if (p.ordem === 2 && !emDigitacao && g.perfil.status === 'CONCLUIDO' && g.perfil.classificacao) {
      passo.detalhe = `Risco ${g.perfil.classificacao.toLowerCase()}`;
    }
    return passo;
  });

  const subLabel = naoSeAplica
    ? 'Não se aplica'
    : g.estado === 'AGUARDANDO_INDICACAO'
      ? iniciada
        ? resolvido
          ? 'Aguardando documentação'
          : 'Análise de perfil'
        : 'Em preenchimento'
      : (SUB_LABEL[g.estado] ?? 'Aguardando');

  const conjuntoLabel = naoSeAplica
    ? null
    : emDigitacao
      ? 'Garantias · em preenchimento'
      : ESTADO_LABEL_CONJUNTO[g.estado];
  const gate = envioPreviaGate(g);

  return {
    naoSeAplica,
    subLabel,
    abaDesabilitada: naoSeAplica,
    abaSemPrevia: false,
    abaSubLabel: subLabel,
    passos,
    analiseEstadoLabel: naoSeAplica ? null : (ANALISE_ESTADO_LABEL[g.estado] ?? null),
    estadoConjuntoLabel: conjuntoLabel,
    estadoConjuntoPill: conjuntoLabel === null ? null : emDigitacao ? 'n' : ESTADO_PILL[g.estado],
    indicacoesEditaveis: indicacoesEditaveis(opp.estado),
    avisoNaoObrigatoria: naoSeAplica ? 'A garantia não é obrigatória nesta oportunidade — a concessão não tem antecipação nem mútuo.' : null,
    envioPreviaGate: gate.disponivel ? gate : null,
  };
}

/** A indicação "principal" (a mais recente) — o read model 1:1 da GAR-F1. */
function principal(g: GarantiaOppInt): IndicacaoInt | null {
  return g.indicacoes[0] ?? null;
}

function imovelDisplay(i: IndicacaoInt | null): string | null {
  if (!i || !i.imovel || !i.matriculas.length || !i.imovelCidade || !i.imovelUf) return null;
  return `${i.imovel} · matrícula ${i.matriculas.map((m) => m.numero).join(', ')} · ${i.imovelCidade}/${i.imovelUf}`;
}

/** `GET /v1/opportunities/:id/garantia/indicacao` — entra no `mapGarantiaIndicacao` de `garantia-mapping`. */
export function indicacaoViewBackend(g: GarantiaOppInt): BackendIndicacaoView {
  return { ...indicacaoBase(g, principal(g)) };
}

/** Resposta de `garantia:indicar` — entra no `mapGarantiaIndicacao` de `indicacao-mapping`. */
export function indicacaoEscritaBackend(g: GarantiaOppInt, indicacaoId: string): BackendIndicacao {
  const i = g.indicacoes.find((x) => x.id === indicacaoId) ?? null;
  const b = indicacaoBase(g, i);
  return { ...b, indicacaoId };
}

function indicacaoBase(g: GarantiaOppInt, i: IndicacaoInt | null) {
  const linha = i && exigeImovel(i.tipo) ? valorAproveitavel(i) : null;
  return {
    id: g.subprocessoId,
    estado: g.estado,
    estadoLabel: ESTADO_LABEL[g.estado],
    estadoPill: ESTADO_PILL[g.estado],
    estadosPermitidos: TRANSICOES[g.estado],
    tipo: i?.tipo ?? null,
    tipoLabel: i ? TIPO_GARANTIA_LABEL[i.tipo] : null,
    origem: i?.origem ?? null,
    origemLabel: i ? (i.origem === 'NOVA' ? 'Nova' : 'Existente') : null,
    utilizacao: i?.utilizacao ?? null,
    categoria: i?.categoria ?? null,
    categoriaLabel: i?.categoria ? CATEGORIA_BEM_LABEL[i.categoria] : null,
    imovelDisplay: imovelDisplay(i),
    imovelEndereco: i?.imovel ?? null,
    imovelMatricula: i?.matriculas[0]?.numero ?? null,
    imovelCidade: i?.imovelCidade ?? null,
    imovelUf: i?.imovelUf ?? null,
    valorAvaliadoBrl: i?.valorAvaliadoBRL != null ? brl2(i.valorAvaliadoBRL) : null,
    percentualAproveitamento: linha?.percentualLabel ? linha.percentualLabel.split(' ')[0] : null,
    observacoes: i?.observacoes ?? null,
    sapGarantiaExternaId: i?.sapGarantiaExternaId ?? null,
    indicacaoSubmetidaEm: g.indicacaoSubmetidaEm,
  };
}
