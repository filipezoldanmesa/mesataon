import type {
  CcobDistribuicao,
  GerenciaCcobList,
  ReatribuicaoGerenciaCcobResult,
} from '@/lib/governanca/distribuicao-ccob.types';
import type {
  BlocoDistribuicao,
  EtapaDistribuicao,
  GerenciaDistribuicaoList,
  ReatribuicaoGerenciaResult,
} from '@/lib/governanca/distribuicao.types';
import type {
  DocumentoParametrizacao,
  DocumentosPorModalidade,
} from '@/lib/governanca/documentos-catalogo.types';
import type { ParametroReferencia, PoliticaComercial } from '@/lib/governanca/politica-comercial.types';
import type {
  BandeiraFranquia,
  RoteamentoFranquia,
  RoteamentoFranquiaList,
} from '@/lib/governanca/roteamento-franquia.types';
import type {
  BpPadrao,
  BpPadraoList,
  CampoObrigatorio,
  CamposObrigatoriosResult,
  Distribuicao,
  TipoPropostaSneg,
} from '@/lib/sneg-admin/sneg-admin.types';

import {
  DOCUMENTOS_POLITICA,
  LACUNA_SEM_PADRAO_BP,
  LACUNAS_DOCUMENTOS,
  LACUNAS_VERBA,
  LIMIARES,
  PARAMETROS_DO_ORG,
  PREMISSAS,
  VERBA,
} from '../dados/governanca/politica-comercial';
import {
  BANDEIRAS,
  CATALOGO_CAMPOS,
  ETAPAS_LIMITE,
  ETAPAS_SNEG,
  FORMATOS_ACEITOS,
  GERENCIA_DO_CLIENTE,
  SEMENTE_CAMPOS,
  SEMENTE_DISTRIBUICAO_CCOB,
  SEMENTE_DISTRIBUICAO_SNEG,
  SEMENTE_DOCUMENTOS,
  SEMENTE_GARANTIAS_EM_PREVIA,
  SEMENTE_PADROES_BP,
  SEMENTE_ROTEAMENTO,
  type LinhaDocumento,
} from '../dados/governanca/sementes';
import { erro, json, semConteudo, semPermissao } from '../core/respostas';
import { rotas, type MockContext } from '../core/router';
import { temPapel, usuarioPorId, type MockUser } from '../core/session';
import { agoraIso, fatia, novoId } from '../core/store';
import { oportunidade, oportunidades } from '../estado-compartilhado';

// ───────────────────────────── Estado ─────────────────────────────

const distribuicaoSneg = fatia('governanca-distribuicao-sneg', () => SEMENTE_DISTRIBUICAO_SNEG);
const distribuicaoCcob = fatia('governanca-distribuicao-ccob', () => SEMENTE_DISTRIBUICAO_CCOB);
const garantiasEmPrevia = fatia('governanca-garantias-em-previa', () => SEMENTE_GARANTIAS_EM_PREVIA);
const roteamento = fatia('governanca-roteamento-franquia', () => SEMENTE_ROTEAMENTO);
const documentos = fatia('governanca-documentos', () => SEMENTE_DOCUMENTOS);
const camposPersistidos = fatia('governanca-campos-obrigatorios', () => ({
  POSTO: SEMENTE_CAMPOS.POSTO.map((campo, i) => ({ id: `cmp-posto-${i + 1}`, campo })),
  FRANQUIA: SEMENTE_CAMPOS.FRANQUIA.map((campo, i) => ({ id: `cmp-franquia-${i + 1}`, campo })),
}));
const padroesBp = fatia('governanca-padroes-bp', () => SEMENTE_PADROES_BP);

// ───────────────────────────── Papéis ─────────────────────────────

/** `MATRIZ_GOVERNANCA_EXECUTAR` (rbac-matrix.ts) — quem escreve na Governança. */
const EXECUTAR = ['BP_FINANCEIRO', 'ADMIN', 'TI_SUSTENTACAO'];
/** `MATRIZ_GOVERNANCA_FRANQUIA_EXECUTAR`. */
const EXECUTAR_FRANQUIA = [...EXECUTAR, 'GESTOR_FRANQUIAS'];

const podeExecutar = (user: MockUser | null) => temPapel(user, ...EXECUTAR);
const semPermissaoParametrizacao = () => erro(403, 'Sem permissão para esta parametrização.');

// ───────────────────────────── Auxiliares ─────────────────────────────

function gerenciaDaOportunidade(clienteSap: string): string | null {
  return GERENCIA_DO_CLIENTE[clienteSap] ?? null;
}

/** O universo de gerências: as das oportunidades ∪ as já parametrizadas. */
function gerenciasConhecidas(extra: Iterable<string>): string[] {
  const universo = new Set<string>(extra);
  for (const o of oportunidades()) {
    const g = gerenciaDaOportunidade(o.clienteSap);
    if (g) universo.add(g);
  }
  return [...universo].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Análises SNEG abertas = oportunidades em `EM_ANALISE` (o elenco não separa sub-fase). */
function analisesAbertas(gerencia: string) {
  return oportunidades().filter(
    (o) => o.estado === 'EM_ANALISE' && gerenciaDaOportunidade(o.clienteSap) === gerencia,
  );
}

function corpo(body: unknown): Record<string, unknown> | null {
  return body && typeof body === 'object' && !(body instanceof FormData)
    ? (body as Record<string, unknown>)
    : null;
}

function textoNaoVazio(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

/** Colaborador do diretório (os perfis fictícios) com um dos papéis do recorte. */
function resolverColaborador(id: string, papeis: string[]): MockUser | null {
  const u = usuarioPorId(id);
  return u && temPapel(u, ...papeis) ? u : null;
}

const ETAPAS_VALIDAS = ETAPAS_SNEG.map((e) => e.etapa);
const TIPOS_PROPOSTA: TipoPropostaSneg[] = ['POSTO', 'FRANQUIA'];

// ───────────────────────────── Distribuição SNEG ─────────────────────────────

function listarDistribuicaoSneg(): GerenciaDistribuicaoList {
  const tabela = distribuicaoSneg();
  const gerencias = gerenciasConhecidas(tabela.map((l) => l.gerencia));
  const blocos: BlocoDistribuicao[] = ETAPAS_SNEG.map(({ etapa, label, legenda }) => {
    // Só a Análise tem fila em lote (veredito do backend, `etapaExecutaDistribuicao`).
    const executa = etapa === 'ANALISE';
    return {
      etapa,
      etapaLabel: label,
      legenda,
      executaDistribuicao: executa,
      items: gerencias.map((gerencia) => {
        const linha = tabela.find((l) => l.etapa === etapa && l.gerencia === gerencia);
        const analista = linha ? usuarioPorId(linha.analistaId) : null;
        return {
          gerencia,
          analistaId: linha?.analistaId ?? null,
          analistaNome: analista?.name ?? null,
          analistaEmail: analista?.email ?? null,
          oportunidadesEmCurso: executa ? analisesAbertas(gerencia).length : null,
          atualizadaEm: linha?.updatedAt ?? null,
        };
      }),
    };
  });
  return { blocos, total: gerencias.length };
}

function gravarDistribuicaoSneg(etapa: EtapaDistribuicao, gerencia: string, analista: MockUser): void {
  const tabela = distribuicaoSneg();
  const linha = tabela.find((l) => l.etapa === etapa && l.gerencia === gerencia);
  if (linha) {
    linha.analistaId = analista.id;
    linha.updatedAt = agoraIso();
  } else {
    tabela.push({ etapa, gerencia, analistaId: analista.id, updatedAt: agoraIso() });
  }
}

function analistaSnegOu422(analistaId: string): MockUser | Response {
  return (
    resolverColaborador(analistaId, ['SNEG']) ??
    erro(
      422,
      `O colaborador "${analistaId}" não foi encontrado no grupo de analistas SNEG do Entra ID — ` +
        'só quem tem esse perfil pode assumir a carteira de uma gerência.',
    )
  );
}

function putDistribuicaoSneg({ params, body, user }: MockContext): Response {
  if (!podeExecutar(user)) return semPermissaoParametrizacao();
  const b = corpo(body);
  if (!b) return erro(400, 'Corpo inválido.');
  if (!textoNaoVazio(b.analistaId)) return erro(400, 'Informe o analista SNEG.');
  if (typeof b.etapa !== 'string' || !ETAPAS_VALIDAS.includes(b.etapa as EtapaDistribuicao)) {
    return erro(400, `Etapa inválida. Use uma de: ${ETAPAS_VALIDAS.join(', ')}.`);
  }
  const analista = analistaSnegOu422(b.analistaId);
  if (analista instanceof Response) return analista;
  const etapa = b.etapa as EtapaDistribuicao;
  const gerencia = params.gerencia.trim();
  gravarDistribuicaoSneg(etapa, gerencia, analista);
  return json<Distribuicao>({
    etapa,
    gerencia,
    analistaId: analista.id,
    analistaNome: analista.name,
    analistaEmail: analista.email,
  });
}

function reatribuirSneg({ body, user }: MockContext): Response {
  if (!podeExecutar(user)) return semPermissao();
  const b = corpo(body);
  if (!b) return erro(400, 'Corpo inválido.');
  if (!textoNaoVazio(b.gerencia)) return erro(400, 'Informe a gerência.');
  if (!textoNaoVazio(b.analistaId)) return erro(400, 'Informe o analista SNEG.');
  const analista = analistaSnegOu422(b.analistaId);
  if (analista instanceof Response) return analista;

  const gerencia = b.gerencia.trim();
  const abertas = analisesAbertas(gerencia);
  const alvos = abertas.filter((o) => o.analistaSnegId !== analista.id);
  // Move o dono no estado vivo: a análise e a listagem passam a mostrar o novo analista.
  for (const o of alvos) o.analistaSnegId = analista.id;
  gravarDistribuicaoSneg('ANALISE', gerencia, analista);

  return json<ReatribuicaoGerenciaResult>({
    gerencia,
    analistaId: analista.id,
    analistaNome: analista.name,
    reatribuidas: alvos.length,
    inalteradas: abertas.length - alvos.length,
    parametrizacaoAtualizada: true,
  });
}

// ───────────────────────────── Distribuição CCOB ─────────────────────────────

function garantiasDaGerencia(gerencia: string) {
  return garantiasEmPrevia().filter((g) => {
    const o = oportunidade(g.opportunityId);
    return !!o && o.estado !== 'CONCLUIDA' && gerenciaDaOportunidade(o.clienteSap) === gerencia;
  });
}

function listarDistribuicaoCcob(): GerenciaCcobList {
  const tabela = distribuicaoCcob();
  const gerencias = gerenciasConhecidas(tabela.map((l) => l.gerencia));
  return {
    items: gerencias.map((gerencia) => {
      const linha = tabela.find((l) => l.gerencia === gerencia);
      const analista = linha ? usuarioPorId(linha.analistaId) : null;
      return {
        gerencia,
        analistaId: linha?.analistaId ?? null,
        analistaNome: analista?.name ?? null,
        analistaEmail: analista?.email ?? null,
        garantiasEmAnalisePrevia: garantiasDaGerencia(gerencia).length,
        atualizadaEm: linha?.updatedAt ?? null,
      };
    }),
    total: gerencias.length,
  };
}

function analistaCcobOu400(analistaId: string): MockUser | Response {
  return (
    resolverColaborador(analistaId, ['CCOB']) ??
    erro(400, `O colaborador "${analistaId}" não é um analista da CCOB no diretório.`)
  );
}

function gravarDistribuicaoCcob(gerencia: string, analista: MockUser) {
  const tabela = distribuicaoCcob();
  let linha = tabela.find((l) => l.gerencia === gerencia);
  if (linha) {
    linha.analistaId = analista.id;
    linha.updatedAt = agoraIso();
  } else {
    linha = { gerencia, analistaId: analista.id, createdAt: agoraIso(), updatedAt: agoraIso() };
    tabela.push(linha);
  }
  return linha;
}

function putDistribuicaoCcob({ params, body, user }: MockContext): Response {
  if (!podeExecutar(user)) return semPermissao();
  const b = corpo(body);
  if (!b) return erro(400, 'Corpo inválido.');
  if (!textoNaoVazio(b.analistaId)) return erro(400, 'Informe o analista da CCOB.');
  const analista = analistaCcobOu400(b.analistaId);
  if (analista instanceof Response) return analista;
  const linha = gravarDistribuicaoCcob(params.gerencia.trim(), analista);
  return json<CcobDistribuicao>({
    gerencia: linha.gerencia,
    analistaId: analista.id,
    analistaNome: analista.name,
    analistaEmail: analista.email,
    createdAt: linha.createdAt,
    updatedAt: linha.updatedAt,
  });
}

function reatribuirCcob({ body, user }: MockContext): Response {
  if (!podeExecutar(user)) return semPermissao();
  const b = corpo(body);
  if (!b) return erro(400, 'Corpo inválido.');
  if (!textoNaoVazio(b.gerencia)) return erro(400, 'Informe a gerência.');
  if (!textoNaoVazio(b.analistaId)) return erro(400, 'Informe o analista da CCOB.');
  const analista = analistaCcobOu400(b.analistaId);
  if (analista instanceof Response) return analista;

  const gerencia = b.gerencia.trim();
  const fila = garantiasDaGerencia(gerencia);
  const alvos = fila.filter((g) => g.analistaId !== analista.id);
  for (const g of alvos) g.analistaId = analista.id;
  gravarDistribuicaoCcob(gerencia, analista);

  return json<ReatribuicaoGerenciaCcobResult>({
    gerencia,
    analistaId: analista.id,
    analistaNome: analista.name,
    reatribuidas: alvos.length,
    inalteradas: fila.length - alvos.length,
    parametrizacaoAtualizada: true,
  });
}

// ───────────────────────────── Roteamento de franquia ─────────────────────────────

function propostasDaBandeira(gerencia: string, bandeira: BandeiraFranquia): number {
  return oportunidades()
    .filter((o) => gerenciaDaOportunidade(o.clienteSap) === gerencia)
    .reduce((n, o) => n + o.propostas.filter((p) => p.tipo === bandeira).length, 0);
}

function listarRoteamento(): RoteamentoFranquiaList {
  const tabela = roteamento();
  const gerencias = gerenciasConhecidas(tabela.map((l) => l.gerencia));
  const items = gerencias.flatMap((gerencia) =>
    BANDEIRAS.map(({ bandeira, label }) => {
      const linha = tabela.find((l) => l.bandeira === bandeira && l.gerencia === gerencia);
      const executivo = linha ? usuarioPorId(linha.executivoId) : null;
      return {
        bandeira,
        bandeiraLabel: label,
        gerencia,
        executivoId: linha?.executivoId ?? null,
        executivoNome: executivo?.name ?? null,
        executivoEmail: executivo?.email ?? null,
        propostasDaBandeira: propostasDaBandeira(gerencia, bandeira),
        atualizadaEm: linha?.updatedAt ?? null,
      };
    }),
  );
  return { items, total: items.length };
}

function putRoteamento({ params, body, user }: MockContext): Response {
  if (!temPapel(user, ...EXECUTAR_FRANQUIA)) return semPermissao();
  const b = corpo(body);
  if (!b) return erro(400, 'Corpo inválido.');
  if (!textoNaoVazio(b.executivoId)) return erro(400, 'Informe o executivo de franquia.');
  const band = BANDEIRAS.find((x) => x.bandeira === params.bandeira);
  if (!band) return erro(400, `Bandeira "${params.bandeira}" desconhecida. Use ZBRM ou ZLUB.`);
  const executivo = resolverColaborador(b.executivoId, ['CONSULTOR_EXPANSAO', 'EXPANSAO', 'GESTOR_FRANQUIAS']);
  if (!executivo) {
    return erro(400, `O colaborador "${b.executivoId}" não é executivo de franquia da bandeira ${band.label}.`);
  }

  const gerencia = params.gerencia.trim();
  const tabela = roteamento();
  let linha = tabela.find((l) => l.bandeira === band.bandeira && l.gerencia === gerencia);
  if (linha) {
    linha.executivoId = executivo.id;
    linha.updatedAt = agoraIso();
  } else {
    linha = {
      bandeira: band.bandeira,
      gerencia,
      executivoId: executivo.id,
      createdAt: agoraIso(),
      updatedAt: agoraIso(),
    };
    tabela.push(linha);
  }
  return json<RoteamentoFranquia>({
    bandeira: band.bandeira,
    bandeiraLabel: band.label,
    gerencia,
    executivoId: executivo.id,
    executivoNome: executivo.name,
    executivoEmail: executivo.email,
    createdAt: linha.createdAt,
    updatedAt: linha.updatedAt,
  });
}

// ───────────────────────────── Catálogo de documentos ─────────────────────────────

function paraDocumento(l: LinhaDocumento): DocumentoParametrizacao {
  return { ...l, acceptedTypes: [...l.acceptedTypes], removable: l.attachmentCount === 0 };
}

function acharDocumento(category: string, type: string): LinhaDocumento | undefined {
  return documentos().find((l) => l.category === category && l.type === type);
}

const ETAPAS_LIMITE_LISTA: readonly string[] = ETAPAS_LIMITE;
const FORMATOS_LISTA: readonly string[] = FORMATOS_ACEITOS;

/** Valida os campos editáveis PRESENTES no corpo; devolve a frase do 400 ou `null`. */
function validarCamposDocumento(b: Record<string, unknown>): string | null {
  if ('stageLimit' in b && b.stageLimit !== null && !ETAPAS_LIMITE_LISTA.includes(String(b.stageLimit))) {
    return `Etapa-limite inválida: ${String(b.stageLimit)}.`;
  }
  for (const k of ['required', 'single', 'selectable'] as const) {
    if (k in b && typeof b[k] !== 'boolean') return `O campo "${k}" deve ser verdadeiro ou falso.`;
  }
  if ('acceptedTypes' in b) {
    const tipos = b.acceptedTypes;
    if (!Array.isArray(tipos) || tipos.length === 0) return 'Informe ao menos um formato aceito.';
    const invalidos = tipos.filter((t) => !FORMATOS_LISTA.includes(String(t)));
    if (invalidos.length > 0) return `Formato(s) não aceito(s): ${invalidos.join(', ')}.`;
  }
  return null;
}

function criarDocumento({ body, user }: MockContext): Response {
  if (!temPapel(user, 'ADMIN')) return semPermissao();
  const b = corpo(body);
  if (!b) return erro(400, 'Corpo inválido.');
  if (!textoNaoVazio(b.category)) return erro(400, 'Informe a categoria do documento.');
  if (!textoNaoVazio(b.type)) return erro(400, 'Informe o tipo do documento.');
  // `acceptedTypes` é obrigatório na criação: sem ele o tipo recusaria todo arquivo.
  const invalido = validarCamposDocumento({ acceptedTypes: undefined, ...b });
  if (invalido) return erro(400, invalido);
  const category = b.category.trim();
  const type = b.type.trim();
  if (acharDocumento(category, type)) {
    return erro(409, `Já existe um documento "${type}" na categoria "${category}".`);
  }
  const linha: LinhaDocumento = {
    category,
    type,
    stageLimit: typeof b.stageLimit === 'string' ? b.stageLimit : null,
    required: typeof b.required === 'boolean' ? b.required : false,
    single: typeof b.single === 'boolean' ? b.single : false,
    selectable: typeof b.selectable === 'boolean' ? b.selectable : true,
    acceptedTypes: (b.acceptedTypes as unknown[]).map(String),
    attachmentCount: 0,
    updatedAt: agoraIso(),
  };
  documentos().push(linha);
  return json<DocumentoParametrizacao>(paraDocumento(linha), 201);
}

function editarDocumento({ params, body, user }: MockContext): Response {
  if (!temPapel(user, 'ADMIN')) return semPermissao();
  const b = corpo(body);
  if (!b) return erro(400, 'Corpo inválido.');
  const linha = acharDocumento(params.category, params.type);
  if (!linha) return erro(404, `O tipo "${params.type}" não existe na categoria "${params.category}".`);
  const invalido = validarCamposDocumento(b);
  if (invalido) return erro(400, invalido);
  // Só o que veio muda (o PUT é parcial).
  if ('stageLimit' in b) linha.stageLimit = typeof b.stageLimit === 'string' ? b.stageLimit : null;
  if (typeof b.required === 'boolean') linha.required = b.required;
  if (typeof b.single === 'boolean') linha.single = b.single;
  if (typeof b.selectable === 'boolean') linha.selectable = b.selectable;
  if (Array.isArray(b.acceptedTypes)) linha.acceptedTypes = b.acceptedTypes.map(String);
  linha.updatedAt = agoraIso();
  return json<DocumentoParametrizacao>(paraDocumento(linha));
}

/** Uma implementação para `POST` e `DELETE` (remoção por POST — o edge recusa DELETE). */
function removerDocumento({ params, user }: MockContext): Response {
  if (!temPapel(user, 'ADMIN')) return semPermissao();
  const lista = documentos();
  const i = lista.findIndex((l) => l.category === params.category && l.type === params.type);
  if (i < 0) return erro(404, `O tipo "${params.type}" não existe na categoria "${params.category}".`);
  const linha = lista[i];
  if (linha.attachmentCount > 0) {
    return erro(
      409,
      `O tipo "${linha.type}" já tem ${linha.attachmentCount} documento(s) anexado(s) e não pode ser ` +
        'excluído. Desmarque "Disponível para novos anexos" para tirá-lo de circulação.',
    );
  }
  lista.splice(i, 1);
  return semConteudo();
}

const DOCUMENTOS_POR_MODALIDADE: DocumentosPorModalidade[] = [
  {
    tipo: 'GARANTIA_REAL',
    tipoLabel: 'Garantia real (hipoteca / alienação fiduciária)',
    documentos: ['Certidão de Inteiro Teor atualizada', 'Laudo de Avaliação'],
  },
  { tipo: 'FIANCA_BANCARIA', tipoLabel: 'Fiança bancária', documentos: ['Minuta do Contrato de Fiança Bancária'] },
  {
    tipo: 'FIANCA_COM_LASTRO',
    tipoLabel: 'Fiança com lastro',
    documentos: ['Certidão de Inteiro Teor atualizada', 'Laudo de Avaliação'],
  },
  { tipo: 'FIANCA_SEM_LASTRO', tipoLabel: 'Fiança sem lastro', documentos: [] },
];

// ───────────────────────────── Campos obrigatórios ─────────────────────────────

function montarCampos(tipo: TipoPropostaSneg): CamposObrigatoriosResult {
  // Os travados não têm linha no banco: entram sempre, com `id: null`.
  const travados: CampoObrigatorio[] = CATALOGO_CAMPOS.filter((c) => c.travado).map((c) => ({
    id: null,
    tipoProposta: tipo,
    campo: c.campo,
    travado: true,
  }));
  const persistidos: CampoObrigatorio[] = camposPersistidos()[tipo].map((p) => ({
    id: p.id,
    tipoProposta: tipo,
    campo: p.campo,
    travado: false,
  }));
  return {
    campos: [...travados, ...persistidos].sort((a, b) => a.campo.localeCompare(b.campo)),
    catalogo: CATALOGO_CAMPOS.map((c) => ({ ...c, cobranca: [...c.cobranca] })),
  };
}

function ehTipoProposta(v: unknown): v is TipoPropostaSneg {
  return typeof v === 'string' && (TIPOS_PROPOSTA as readonly string[]).includes(v);
}

function getCampos({ query }: MockContext): Response {
  const tipo = query.get('tipoProposta');
  if (!ehTipoProposta(tipo)) return erro(400, 'Informe o tipo de proposta: POSTO ou FRANQUIA.');
  return json<CamposObrigatoriosResult>(montarCampos(tipo));
}

function putCampos({ params, body, user }: MockContext): Response {
  if (!podeExecutar(user)) return semPermissaoParametrizacao();
  const tipo = params.tipo;
  if (!ehTipoProposta(tipo)) return erro(400, 'Tipo de proposta inválido: use POSTO ou FRANQUIA.');
  const campos = corpo(body)?.campos;
  if (!Array.isArray(campos) || campos.some((c) => typeof c !== 'string')) {
    return erro(400, 'Informe a lista de campos.');
  }
  const enviados = new Set<string>(campos as string[]);
  const conhecidos = new Set(CATALOGO_CAMPOS.map((c) => c.campo));
  const invalidos = [...enviados].filter((c) => !conhecidos.has(c));
  if (invalidos.length > 0) return erro(400, `Chave(s) de campo inválida(s): ${invalidos.join(', ')}.`);
  const removidos = CATALOGO_CAMPOS.filter((c) => c.travado && !enviados.has(c.campo));
  if (removidos.length > 0) {
    return erro(
      400,
      'Campo(s) sempre obrigatório(s) não podem ser desmarcados: ' +
        removidos.map((c) => `"${c.label}" — ${c.motivoTrava}`).join(' '),
    );
  }
  const estado = camposPersistidos();
  const anteriores = estado[tipo];
  estado[tipo] = CATALOGO_CAMPOS.filter((c) => !c.travado && enviados.has(c.campo)).map(
    (c) => anteriores.find((a) => a.campo === c.campo) ?? { id: novoId('cmp'), campo: c.campo },
  );
  return json<CamposObrigatoriosResult>(montarCampos(tipo));
}

// ───────────────────────────── Padrões de BP ─────────────────────────────

const CAMPOS_METAS = ['metaPercentualAntecipacao', 'metaPercentualPostecipacao', 'metaCustoVinculacaoUnitario'];

function validarMetas(b: Record<string, unknown>): string | null {
  const fracao = (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1;
  if (!fracao(b.metaPercentualAntecipacao)) return 'A meta de antecipação deve ser um número entre 0 e 1.';
  if (!fracao(b.metaPercentualPostecipacao)) return 'A meta de postecipação deve ser um número entre 0 e 1.';
  const custo = b.metaCustoVinculacaoUnitario;
  if (typeof custo !== 'number' || custo < 0) {
    return 'O custo de vinculação unitário deve ser um número maior ou igual a 0.';
  }
  return null;
}

/** Espelho do `forbidNonWhitelisted` do backend. */
function camposDesconhecidos(b: Record<string, unknown>, permitidos: string[]): string | null {
  const extras = Object.keys(b).filter((k) => !permitidos.includes(k));
  return extras.length > 0 ? `Campo(s) não permitido(s): ${extras.join(', ')}.` : null;
}

function listarPadroes(): BpPadraoList {
  const items = [...padroesBp()].sort((a, b) => a.negocio.localeCompare(b.negocio, 'pt-BR'));
  return { items, total: items.length };
}

function criarPadrao({ body, user }: MockContext): Response {
  if (!podeExecutar(user)) return semPermissaoParametrizacao();
  const b = corpo(body);
  if (!b) return erro(400, 'Corpo inválido.');
  const extra = camposDesconhecidos(b, ['negocio', ...CAMPOS_METAS]);
  if (extra) return erro(400, extra);
  if (!textoNaoVazio(b.negocio)) return erro(400, 'Informe o negócio.');
  const invalido = validarMetas(b);
  if (invalido) return erro(400, invalido);
  const negocio = b.negocio.trim();
  if (padroesBp().some((p) => p.negocio === negocio)) {
    return erro(409, `Já existe um padrão de BP para o negócio "${negocio}". Use PUT para atualizar.`);
  }
  const padrao: BpPadrao = {
    id: novoId('bp'),
    negocio,
    metaPercentualAntecipacao: Number(b.metaPercentualAntecipacao),
    metaPercentualPostecipacao: Number(b.metaPercentualPostecipacao),
    metaCustoVinculacaoUnitario: Number(b.metaCustoVinculacaoUnitario),
  };
  padroesBp().push(padrao);
  return json<BpPadrao>(padrao, 201);
}

function editarPadrao({ params, body, user }: MockContext): Response {
  if (!podeExecutar(user)) return semPermissaoParametrizacao();
  const b = corpo(body);
  if (!b) return erro(400, 'Corpo inválido.');
  // `negocio` é a chave natural e NÃO existe no DTO de edição (ADO 67952).
  const extra = camposDesconhecidos(b, CAMPOS_METAS);
  if (extra) return erro(400, extra);
  const padrao = padroesBp().find((p) => p.id === params.id);
  if (!padrao) return erro(404, 'Padrão de BP não encontrado.');
  const invalido = validarMetas(b);
  if (invalido) return erro(400, invalido);
  padrao.metaPercentualAntecipacao = Number(b.metaPercentualAntecipacao);
  padrao.metaPercentualPostecipacao = Number(b.metaPercentualPostecipacao);
  padrao.metaCustoVinculacaoUnitario = Number(b.metaCustoVinculacaoUnitario);
  return json<BpPadrao>(padrao);
}

/** Uma implementação para `POST` e `DELETE`; a BFF responde 204 nos dois. */
function removerPadrao({ params, user }: MockContext): Response {
  if (!podeExecutar(user)) return semPermissaoParametrizacao();
  const lista = padroesBp();
  const i = lista.findIndex((p) => p.id === params.id);
  if (i < 0) return erro(404, 'Padrão de BP não encontrado.');
  lista.splice(i, 1);
  return semConteudo();
}

// ───────────────────────────── Política comercial ─────────────────────────────

function pct(fracao: number): string {
  const v = fracao * 100;
  const casas = Number.isInteger(v) ? 0 : 1;
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

function brl(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Derivada AO VIVO dos padrões de BP — editar um padrão muda esta aba. */
function politicaComercial(): PoliticaComercial {
  const padroes = listarPadroes().items;
  const doBp: ParametroReferencia[] = padroes.flatMap((p) => [
    {
      parametro: `Custo de vinculação unitário (R$/m³) — ${p.negocio}`,
      referencia: brl(p.metaCustoVinculacaoUnitario),
      foraDaFaixa: 'Acima da referência ⇒ desvio (sem tolerância)',
      fonte: 'Governança → Padrões de BP',
    },
    {
      parametro: `Mix antecipada / postecipada — ${p.negocio}`,
      referencia: `${pct(p.metaPercentualAntecipacao)} antecipado · ${pct(p.metaPercentualPostecipacao)} postecipado`,
      foraDaFaixa: 'Antecipação acima da referência ⇒ desvio (sem tolerância)',
      fonte: 'Governança → Padrões de BP',
    },
  ]);
  return {
    documentos: DOCUMENTOS_POLITICA,
    mixAntecipadoPadrao:
      padroes.length === 0
        ? null
        : padroes
            .map(
              (p) =>
                `${pct(p.metaPercentualAntecipacao)} antecipado · ${pct(p.metaPercentualPostecipacao)} postecipado (${p.negocio})`,
            )
            .join(' · '),
    parametrosReferencia: [...doBp, ...PARAMETROS_DO_ORG],
    limiares: LIMIARES,
    premissas: PREMISSAS,
    verba: VERBA,
    lacunasVerba: LACUNAS_VERBA,
    lacunasLimiares: [],
    lacunasDocumentos: padroes.length === 0 ? [...LACUNAS_DOCUMENTOS, LACUNA_SEM_PADRAO_BP] : LACUNAS_DOCUMENTOS,
  };
}

// ───────────────────────────── Registro ─────────────────────────────

rotas('governanca', [
  // Distribuição SNEG
  {
    method: 'GET',
    pattern: '/governanca/sneg/distribuicao',
    handler: () => json<GerenciaDistribuicaoList>(listarDistribuicaoSneg()),
  },
  { method: 'POST', pattern: '/governanca/sneg/distribuicao/reatribuir', handler: reatribuirSneg },
  { method: 'PUT', pattern: '/sneg/distribuicao/:gerencia', handler: putDistribuicaoSneg },

  // Distribuição CCOB
  {
    method: 'GET',
    pattern: '/governanca/ccob/distribuicao',
    handler: () => json<GerenciaCcobList>(listarDistribuicaoCcob()),
  },
  { method: 'PUT', pattern: '/governanca/ccob/distribuicao/:gerencia', handler: putDistribuicaoCcob },
  { method: 'POST', pattern: '/governanca/ccob/distribuicao/reatribuir', handler: reatribuirCcob },

  // Distribuição Franquias
  {
    method: 'GET',
    pattern: '/governanca/roteamento-franquia/distribuicao',
    handler: () => json<RoteamentoFranquiaList>(listarRoteamento()),
  },
  {
    method: 'PUT',
    pattern: '/governanca/roteamento-franquia/distribuicao/:bandeira/:gerencia',
    handler: putRoteamento,
  },

  // Documentos
  {
    method: 'GET',
    pattern: '/governanca/documentos',
    handler: () => json<DocumentoParametrizacao[]>(documentos().map(paraDocumento)),
  },
  { method: 'POST', pattern: '/governanca/documentos', handler: criarDocumento },
  {
    method: 'GET',
    pattern: '/governanca/documentos/modalidade-garantia',
    handler: () => json<DocumentosPorModalidade[]>(DOCUMENTOS_POR_MODALIDADE),
  },
  { method: 'PUT', pattern: '/governanca/documentos/:category/:type', handler: editarDocumento },
  { method: 'POST', pattern: '/governanca/documentos/:category/:type', handler: removerDocumento },
  { method: 'DELETE', pattern: '/governanca/documentos/:category/:type', handler: removerDocumento },

  // Política comercial
  {
    method: 'GET',
    pattern: '/governanca/politica-comercial',
    handler: () => json<PoliticaComercial>(politicaComercial()),
  },

  // Campos obrigatórios
  { method: 'GET', pattern: '/sneg/campos-obrigatorios', handler: getCampos },
  { method: 'PUT', pattern: '/sneg/campos-obrigatorios/:tipo', handler: putCampos },

  // Padrões de BP
  { method: 'GET', pattern: '/sneg/padroes-bp', handler: () => json<BpPadraoList>(listarPadroes()) },
  { method: 'POST', pattern: '/sneg/padroes-bp', handler: criarPadrao },
  { method: 'PUT', pattern: '/sneg/padroes-bp/:id', handler: editarPadrao },
  { method: 'POST', pattern: '/sneg/padroes-bp/:id', handler: removerPadrao },
  { method: 'DELETE', pattern: '/sneg/padroes-bp/:id', handler: removerPadrao },
]);
