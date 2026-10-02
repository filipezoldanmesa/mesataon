import {
  mapCustomer360ToClientDetail,
  type BackendCustomer360,
  type BackendSectionSourceGap,
} from '@/lib/clients/customer-360-mapping';
import {
  mapCustomerToClient,
  mapPortfolioRowToClient,
  type BackendCustomer,
  type BackendFlagGap,
  type BackendPortfolioRow,
} from '@/lib/clients/customer-mapping';
import type { ClientDetail, ClientSummary, PortfolioCounts, PortfolioResult } from '@/lib/clients/types';
import { mapDocumentType, mapRepositoryDoc } from '@/lib/documents/documents-mapping';
import type { RepositoryDoc, RepositoryResult } from '@/lib/documents/types';
import type { BackendDirectoryUser, DirectoryUser } from '@/lib/opportunities/directory.types';
import type {
  ValorParametrizadoPayload,
  ValorParametrizadoRow,
  ValoresParametrizadosPage,
} from '@/lib/parametrizacao/financial-item-types.types';
import { PicklistField as CampoPicklist, type PicklistOptions } from '@/lib/picklists/picklists.types';
import {
  EtapaLiberacaoRecurso,
  FinalidadeRecurso,
  IndiceCorrecao,
  PeriodicidadeRecurso,
  TipoRegistroRecursoFinanceiro,
} from '@/lib/picklists/salesforce-values';
import type { FinancialResourceDomains, TipoBonificacao } from '@/lib/proposals/financial-resources.types';
import type { SupplyCenter } from '@/lib/proposals/supply-centers.types';

import {
  arquivoEnviado,
  campo,
  erro,
  imagem,
  json,
  pdf,
  semConteudo,
  semPermissao,
} from '../core/respostas';
import { rotas, type MockContext } from '../core/router';
import { temPapel, usuarioPorId, type MockUser } from '../core/session';
import { agoraIso, fatia, novoId } from '../core/store';
import { CADASTRO, CONTAS_EXTRAS, type CadastroCliente } from '../dados/clientes/cadastro';
import { campoDoFront, opcoesDaPicklist, valoresDaPicklist } from '../dados/clientes/picklists';
import {
  CENTROS_FORNECEDORES,
  PERFIS_DO_BALDE,
  colaboradores,
  sementeValoresParametrizados,
  type Colaborador,
} from '../dados/clientes/referencia';
import { CATALOGO_DOCUMENTOS, sementeRepositorio, type DocRepositorio } from '../dados/clientes/repositorio';
import { clientes, oportunidades, ROTULO_FASE } from '../estado-compartilhado';
import type { OportunidadeElenco } from '../elenco';

/**
 * Domínio `clientes`: carteira, busca, Visão 360º, repositório de documentos do
 * cliente, diretório de colaboradores e os catálogos de referência (picklists,
 * centros fornecedores, Receitas e Despesas, domínios de recurso financeiro).
 *
 * Os dados nascem no FORMATO DO BACKEND e passam pelos MESMOS mappers que a BFF
 * de produção usa (`mapPortfolioRowToClient`, `mapCustomer360ToClientDetail`,
 * `mapRepositoryDoc`…) — o que chega à tela é exatamente o tipo do front.
 */

// ───────────── Estado ─────────────

const repositorio = fatia('clientes-repositorio', sementeRepositorio);
const valoresParametrizados = fatia('clientes-valores-parametrizados', sementeValoresParametrizados);

// ───────────── Contas ─────────────

interface Conta {
  /** Id de rota: o Código SAP, ou o CRM id do prospect. */
  id: string;
  sapCode: string | null;
  razaoSocial: string;
  cnpj: string;
  cidade: string;
  uf: string;
  bandeira: string | null;
  franquiaDe: { sapCode: string; legalName: string } | null;
  cadastro: CadastroCliente | null;
}

function contas(): Conta[] {
  const doElenco: Conta[] = clientes().map((c) => ({
    id: c.sapCode,
    sapCode: c.sapCode,
    razaoSocial: c.razaoSocial,
    cnpj: c.cnpj,
    cidade: c.cidade,
    uf: c.uf,
    bandeira: c.bandeira,
    franquiaDe: null,
    cadastro: CADASTRO[c.sapCode] ?? null,
  }));
  const extras: Conta[] = CONTAS_EXTRAS.map((e) => ({
    id: e.id,
    sapCode: e.sapCode,
    razaoSocial: e.razaoSocial,
    cnpj: e.cnpj,
    cidade: e.cidade,
    uf: e.uf,
    bandeira: null,
    franquiaDe: e.franquiaDe,
    cadastro: null,
  }));
  return [...doElenco, ...extras];
}

/** O backend resolve SAP primeiro e CRM id depois — aqui os dois são o `id`. */
function contaPorRef(ref: string): Conta | undefined {
  return contas().find((c) => c.id === ref || (c.sapCode !== null && c.sapCode === ref));
}

function oportunidadesDa(conta: Conta): OportunidadeElenco[] {
  if (!conta.sapCode) return [];
  return oportunidades()
    .filter((o) => o.clienteSap === conta.sapCode)
    .sort((a, b) => b.criadaEm.localeCompare(a.criadaEm));
}

function emFluxo(conta: Conta): OportunidadeElenco | undefined {
  return oportunidadesDa(conta).find((o) => o.estado !== 'CONCLUIDA');
}

function docsDa(conta: Conta): DocRepositorio[] {
  return repositorio()[conta.id] ?? [];
}

const digitos = (s: string) => s.replace(/\D/g, '');
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function casaTermo(conta: Conta, termo: string): boolean {
  const t = normalizar(termo.trim());
  if (!t) return true;
  const d = digitos(termo);
  return (
    normalizar(conta.razaoSocial).includes(t) ||
    normalizar(conta.cidade).includes(t) ||
    (conta.sapCode ?? '').includes(t) ||
    (d.length >= 3 && digitos(conta.cnpj).includes(d))
  );
}

// ───────────── Busca (autocomplete) ─────────────

function paraBusca(conta: Conta): BackendCustomer {
  return {
    id: conta.id,
    name: conta.razaoSocial,
    sapCode: conta.sapCode,
    taxId: digitos(conta.cnpj),
    city: conta.cidade,
    state: conta.uf,
    registrationStatus: conta.sapCode ? 'REGISTERED' : 'PROSPECT',
  };
}

// ───────────── Carteira ─────────────

const SEM_VMM: BackendFlagGap = {
  sourceLabel: 'Salesforce',
  reason: 'SEM_REGISTRO',
  detail: 'A conta não tem VMM cadastrado no Salesforce.',
};
const SEM_CONTRATO: BackendFlagGap = {
  sourceLabel: 'Salesforce',
  reason: 'SEM_REGISTRO',
  detail: 'O Salesforce não tem contrato de fornecimento ativo e vigente para esta conta.',
};
const SEM_ANP: BackendFlagGap = {
  sourceLabel: 'ANP',
  reason: 'SEM_REGISTRO',
  detail: 'A ANP não tem registro de revenda para este CNPJ.',
};

function linhaDaCarteira(conta: Conta): BackendPortfolioRow {
  const cad = conta.cadastro;
  const opp = emFluxo(conta);
  const cadastrado = conta.sapCode !== null;
  return {
    id: conta.id,
    name: conta.razaoSocial,
    sapCode: conta.sapCode,
    taxId: digitos(conta.cnpj),
    city: conta.cidade,
    state: conta.uf,
    registrationStatus: cadastrado ? 'REGISTERED' : 'PROSPECT',
    companyGroup: cad?.grupoEmpresa ? { code: cad.grupoEmpresa.code, name: cad.grupoEmpresa.name } : null,
    franchiseOf: conta.franquiaDe,
    flag: conta.bandeira,
    flagGap: conta.bandeira ? null : SEM_ANP,
    vmm: cad?.vmm ?? null,
    vmmReferenceDate: cad?.vmmReferenceDate ?? null,
    vmmGap: cadastrado && !cad?.vmm ? SEM_VMM : null,
    contractValidity: cad?.contrato ?? null,
    // Prospect não tem contrato a procurar: "não se aplica", não lacuna.
    validityGap: cadastrado && !cad?.contrato ? SEM_CONTRATO : null,
    inFlowOpportunity: opp ? { code: opp.code, title: opp.titulo, status: ROTULO_FASE[opp.fase] } : null,
    documents: { count: docsDa(conta).length },
  };
}

const ABAS: Record<string, (c: Conta) => boolean> = {
  cadastrado: (c) => c.sapCode !== null,
  prospect: (c) => c.sapCode === null,
  fluxo: (c) => emFluxo(c) !== undefined,
  franquia: (c) => (c.cadastro?.franquias.length ?? 0) > 0,
};

type Ordenavel = 'name' | 'flag' | 'location' | 'inFlowOpportunity' | 'docsCount';
const CHAVE_ORDEM: Record<Ordenavel, (s: ClientSummary) => string | number> = {
  name: (s) => normalizar(s.name),
  flag: (s) => normalizar(s.flag),
  location: (s) => normalizar(s.location),
  inFlowOpportunity: (s) => s.inFlowOpportunity ?? '',
  docsCount: (s) => s.docsCount,
};

function carteiraDo(user: MockUser | null): PortfolioResult['carteira'] {
  // Só o LT tem carteira própria (`PERFIS_COM_CARTEIRA_PROPRIA`).
  if (temPapel(user, 'LT')) {
    return { modo: 'propria', motivo: null, motivoLabel: null, executivoDeVenda: user?.name ?? null };
  }
  return {
    modo: 'completa',
    motivo: 'PERFIL_SEM_CARTEIRA',
    motivoLabel: 'Seu perfil acompanha a base do escopo, não uma carteira individual.',
    executivoDeVenda: null,
  };
}

function carteira({ query, user }: MockContext): Response {
  const todas = contas();
  const counts: PortfolioCounts = {
    all: todas.length,
    registered: todas.filter(ABAS.cadastrado).length,
    prospect: todas.filter(ABAS.prospect).length,
    inFlowOpportunity: todas.filter(ABAS.fluxo).length,
    franchise: todas.filter(ABAS.franquia).length,
  };

  const aba = query.get('tab');
  const q = query.get('q') ?? '';
  const filtradas = todas.filter((c) => (aba && ABAS[aba] ? ABAS[aba](c) : true) && casaTermo(c, q));

  const resumos = filtradas.map((c) => mapPortfolioRowToClient(linhaDaCarteira(c)));
  const sortBy = query.get('sortBy');
  const chave = sortBy && sortBy in CHAVE_ORDEM ? CHAVE_ORDEM[sortBy as Ordenavel] : CHAVE_ORDEM.name;
  const sinal = query.get('sortOrder') === 'desc' ? -1 : 1;
  resumos.sort((a, b) => {
    const ka = chave(a);
    const kb = chave(b);
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * sinal;
  });

  const page = Math.max(1, Number(query.get('page') ?? '1') || 1);
  const limit = Math.max(1, Number(query.get('limit') ?? '10') || 10);
  const inicio = (page - 1) * limit;

  return json<PortfolioResult>({
    items: resumos.slice(inicio, inicio + limit),
    counts,
    // A carteira do protótipo é pequena e inteira: os contadores SÃO totais.
    janela: { amostra: false, limiteJanela: 200 },
    total: resumos.length,
    hasMore: inicio + limit < resumos.length,
    prospectsEnabled: true,
    carteira: carteiraDo(user),
    foraDoRecorte: 0,
  });
}

// ───────────── Visão 360º ─────────────

const GAP_VIGENCIA_GARANTIA: BackendSectionSourceGap = {
  source: 'sap-cpi-garantias',
  sourceLabel: 'SAP',
  reason: 'NAO_FORNECIDO',
  fields: ['validFrom'],
  detail: 'A coluna Vigência traz a data-limite da garantia; o SAP não informa data de início.',
};

function documentos360(conta: Conta): BackendCustomer360['documents'] {
  // Um TIPO, uma linha (ADO 67547); vencido só quando nenhum arquivo do tipo vale.
  const porTipo = new Map<string, boolean>();
  for (const d of docsDa(conta)) {
    const vencido = d.situacao === 'VENCIDO';
    porTipo.set(d.type, (porTipo.get(d.type) ?? true) && vencido);
  }
  return {
    available: true,
    data: {
      items: Array.from(porTipo, ([name, vencido]) => ({ name, status: vencido ? 'vencido' : 'ok' })),
    },
  };
}

function visao360(conta: Conta): BackendCustomer360 {
  const cad = conta.cadastro;
  const lt = usuarioPorId('usr-lt-ana')?.name ?? null;
  const sap = conta.sapCode ?? '';
  const grupoCodigo = cad?.grupoEconomico
    ? clientes().find((c) => c.sapCode === conta.sapCode)?.grupoEconomico.split(' · ')[0] ?? null
    : null;
  const grupoId = grupoCodigo ? grupoCodigo.padStart(10, '0') : null;
  const ge = cad?.grupoEconomico ?? null;
  const gemp = cad?.grupoEmpresa ?? null;

  return {
    sapCode: sap,
    account: {
      available: true,
      data: {
        sapCode: sap,
        legalName: conta.razaoSocial,
        taxId: digitos(conta.cnpj),
        city: conta.cidade,
        state: conta.uf,
        profitCenter: cad?.profitCenter ?? null,
        salesTeam: cad?.salesTeam ?? null,
        salesOffice: cad?.salesOffice ?? null,
        vp: cad ? 'VPVAR' : null,
        territoryLeader: conta.sapCode ? lt : null,
        setorAtividade: cad?.setorAtividade ?? null,
        sucessaoAtiva: cad ? cad.sucessaoAtiva : null,
        mapaDaRede: cad?.mapaDaRede ?? null,
      },
    },
    contacts: { available: true, data: cad?.contatos ?? [] },
    partners: {
      available: true,
      data: cad?.socios ?? [],
      total: cad
        ? {
            percentTotal: cad.socios.reduce((s, p) => s + (p.participationPercent ?? 0), 0),
            partnersWithoutPercent: cad.socios.filter((p) => p.participationPercent === null).length,
            closes: cad.socios.reduce((s, p) => s + (p.participationPercent ?? 0), 0) === 100,
          }
        : { percentTotal: null, partnersWithoutPercent: 0, closes: null },
    },
    bank: cad?.banco
      ? { available: true, data: cad.banco, gaps: [] }
      : {
          available: true,
          data: null,
          gaps: [
            {
              source: 'sap-cpi-dados-bancarios',
              sourceLabel: 'SAP',
              reason: 'SEM_REGISTRO',
              fields: ['bank'],
              detail: 'Este cliente não é fornecedor no SAP — não há dados bancários cadastrados.',
            },
          ],
        },
    guarantees: {
      available: true,
      outcome: cad?.garantias.outcome ?? 'NO_CREDIT_ACCOUNT',
      data: cad?.garantias.itens ?? [],
      gaps: [GAP_VIGENCIA_GARANTIA],
    },
    economicGroup: {
      available: true,
      data: ge
        ? {
            groupId: grupoId,
            groupName: grupoId ? `Grupo Econômico - ${grupoId}` : null,
            memberCount: ge.integrantes.length,
            members: ge.integrantes,
            membersTruncated: false,
            exposureAmount: ge.exposicao,
            criterion: ge.criterio,
            gaps: [],
          }
        : { groupId: null, groupName: null, memberCount: null, members: null, exposureAmount: null, criterion: null, gaps: [] },
    },
    companyGroup: {
      available: true,
      data: {
        code: gemp?.code ?? null,
        name: gemp?.name ?? null,
        label: gemp ? `${gemp.code} · ${gemp.name}` : null,
        contractedVolumeM3: gemp?.contratado ?? null,
        performedVolumeM3: gemp?.performado ?? null,
        complianceRatioPercent: gemp && gemp.contratado ? Math.round((gemp.performado / gemp.contratado) * 100) : null,
        validity: cad?.contrato?.to ? { from: cad.contrato.from, to: cad.contrato.to } : null,
        advanceBonus: null,
        deferredBonus: null,
        revenuePerLiterBRL: null,
        gaps: gemp
          ? [
              {
                source: 'tableau',
                sourceLabel: 'Tableau',
                reason: 'NAO_CONTRATADA',
                fields: ['advanceBonus', 'deferredBonus', 'revenuePerLiterBRL', 'ultimaOportunidade'],
                detail: null,
              },
            ]
          : [],
      },
    },
    anp:
      cad?.anp && conta.bandeira
        ? {
            available: true,
            data: {
              flag: conta.bandeira,
              status: 'Revendedor autorizado',
              statusSigaf: cad.anp.statusSigaf,
              authorizationNumber: cad.anp.autorizacao,
              lastUpdatedAt: cad.anp.atualizadoEm,
              dataObtencao: '15/03/2019',
              municipio: conta.cidade,
              uf: conta.uf,
              endereco: cad.anp.endereco,
              source: 'api',
              asOf: null,
            },
            gaps: [],
          }
        : {
            available: true,
            data: null,
            gaps: [
              {
                source: 'anp',
                sourceLabel: 'ANP',
                reason: 'SEM_REGISTRO',
                fields: ['flag', 'statusSigaf', 'authorizationNumber', 'lastUpdatedAt'],
                detail: SEM_ANP.detail,
              },
            ],
          },
    franchises: { available: true, data: { items: cad?.franquias ?? [] } },
    documents: documentos360(conta),
    opportunities: {
      available: true,
      data: oportunidadesDa(conta).map((o) => ({
        id: o.id,
        code: o.code,
        title: o.titulo,
        status: ROTULO_FASE[o.fase],
      })),
    },
    ddiRisk: { available: true, data: cad?.riscoDdi ? { nivel: cad.riscoDdi } : null },
  };
}

// ───────────── Repositório de documentos ─────────────

const HOJE = () => new Date().toISOString().slice(0, 10);

/** Situação é veredito do BACKEND — aqui, recalculada só para docs do próprio repositório. */
function situacaoDoRepositorio(expiresAt: string | null): string {
  return expiresAt && expiresAt < HOJE() ? 'VENCIDO' : 'NO_REPOSITORIO';
}

function repositorioDe({ params }: MockContext): Response {
  const conta = contaPorRef(params.id);
  if (!conta) return erro(404, 'Cliente não encontrado.');
  return json<RepositoryResult>({
    clientId: params.id,
    clientName: conta.razaoSocial,
    docs: docsDa(conta).map((d) => mapRepositoryDoc(params.id, d)),
    documentTypes: CATALOGO_DOCUMENTOS.filter((p) => p.selectable ?? true).map(mapDocumentType),
  });
}

function falhaUpload(mensagem: string, code = 'VALIDATION_ERROR'): Response {
  return erro(400, 'Falha ao enviar o documento.', { code, message: mensagem });
}

function enviarAoRepositorio({ params, body }: MockContext): Response {
  const conta = contaPorRef(params.id);
  if (!conta) return erro(404, 'Cliente não encontrado.');
  const [category, type] = String(campo(body, 'docTypeId') ?? '').split('::');
  const tipo = CATALOGO_DOCUMENTOS.find((p) => p.category === category && p.type === type);
  if (!tipo) return falhaUpload('Tipo de documento não catalogado.');
  if (tipo.selectable === false) return falhaUpload('Este tipo de documento foi aposentado e não aceita novos anexos.');
  const arquivo = arquivoEnviado(body);
  if (!arquivo) return falhaUpload('Selecione o arquivo a enviar.');
  const validade = campo<string>(body, 'expiresAt');
  const expiresAt = typeof validade === 'string' && validade !== '' ? validade.slice(0, 10) : null;

  const novo: DocRepositorio = {
    id: novoId('doc-rep'),
    category: tipo.category,
    type: tipo.type,
    fileName: arquivo.nome,
    mimeType: arquivo.tipo,
    sizeBytes: arquivo.tamanho,
    uploadedAt: agoraIso(),
    expiresAt,
    origem: 'REPOSITORIO',
    opportunityId: null,
    opportunityCode: null,
    situacao: situacaoDoRepositorio(expiresAt),
  };
  const lista = (repositorio()[conta.id] ??= []);
  lista.unshift(novo);
  return json<RepositoryDoc>(mapRepositoryDoc(params.id, novo), 201);
}

/** Documento editável daqui — o vindo de oportunidade é recusado (404) como na API. */
function docDoRepositorio(params: Record<string, string>): { conta: Conta; doc: DocRepositorio } | null {
  const conta = contaPorRef(params.id);
  const doc = conta ? docsDa(conta).find((d) => d.id === params.docId) : undefined;
  if (!conta || !doc || doc.origem === 'OPORTUNIDADE') return null;
  return { conta, doc };
}

function substituirNoRepositorio({ params, body }: MockContext): Response {
  const achado = docDoRepositorio(params);
  if (!achado) return erro(404, 'Documento não encontrado.');
  const { doc } = achado;
  const arquivo = arquivoEnviado(body);
  if (arquivo) {
    doc.fileName = arquivo.nome;
    doc.mimeType = arquivo.tipo;
    doc.sizeBytes = arquivo.tamanho;
    doc.uploadedAt = agoraIso();
  }
  // Ausente mantém a validade; vazio a limpa.
  const validade = campo<string>(body, 'expiresAt');
  if (typeof validade === 'string') doc.expiresAt = validade === '' ? null : validade.slice(0, 10);
  doc.situacao = situacaoDoRepositorio(doc.expiresAt);
  return json<RepositoryDoc>(mapRepositoryDoc(params.id, doc));
}

/** `POST` e `DELETE` compartilham a remoção (o edge recusa `DELETE`). */
function removerDoRepositorio({ params }: MockContext): Response {
  const achado = docDoRepositorio(params);
  if (!achado) return erro(404, 'Documento não encontrado.');
  const lista = repositorio()[achado.conta.id] ?? [];
  lista.splice(lista.indexOf(achado.doc), 1);
  return semConteudo();
}

function baixarDoRepositorio({ params }: MockContext): Response {
  const conta = contaPorRef(params.id);
  const doc = conta ? docsDa(conta).find((d) => d.id === params.docId) : undefined;
  if (!conta || !doc) return erro(404, 'Documento não encontrado.');
  return doc.mimeType.startsWith('image/')
    ? imagem(doc.type)
    : pdf(`${doc.type} - ${conta.razaoSocial}`, doc.fileName);
}

// ───────────── Diretório de colaboradores ─────────────

function buscaColaborador(lista: Colaborador[], q: string): Colaborador[] {
  const t = normalizar(q.trim());
  const achados = t
    ? lista.filter((c) => normalizar(c.name).includes(t) || normalizar(c.email).includes(t))
    : lista;
  return achados.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function doBackend(c: Colaborador): BackendDirectoryUser {
  return { id: c.id, name: c.name, email: c.email, jobTitle: c.jobTitle, region: c.region, department: c.department, roles: c.roles };
}

/** `users`: subtítulo `cargo · área` (o `region` do backend vira `department`). */
function paraUsuario(u: BackendDirectoryUser): DirectoryUser {
  const department = u.region ?? undefined;
  return { id: u.id, name: u.name, email: u.email, jobTitle: u.jobTitle, department, detail: [u.jobTitle, department].filter(Boolean).join(' · ') };
}

/** `team-candidates`/`profile-candidates`: subtítulo `área · cidade, UF` — `jobTitle` é o vínculo. */
function paraCandidato(u: BackendDirectoryUser): DirectoryUser {
  const area = u.department ?? undefined;
  return { id: u.id, name: u.name, email: u.email, jobTitle: u.jobTitle, department: area, detail: [area, u.region ?? undefined].filter(Boolean).join(' · ') };
}

const PERFIS_CONHECIDOS = new Set(colaboradores().map((c) => c.profileKey));

const DOMINIO = {
  tipoRegistro: Object.values(TipoRegistroRecursoFinanceiro),
  finalidadeRecurso: Object.values(FinalidadeRecurso),
  etapaLiberacao: Object.values(EtapaLiberacaoRecurso),
  periodicidade: Object.values(PeriodicidadeRecurso),
  indiceCorrecao: Object.values(IndiceCorrecao),
};

// ───────────── Rotas ─────────────

rotas('clientes', [
  // Busca do autocomplete (F1) — abaixo de 2 caracteres a BFF nem pergunta.
  {
    method: 'GET',
    pattern: '/clients',
    handler: ({ query }) => {
      const q = (query.get('q') ?? '').trim();
      if (q.length < 2) return json<ClientSummary[]>([]);
      return json<ClientSummary[]>(
        contas()
          .filter((c) => casaTermo(c, q))
          .map((c) => mapCustomerToClient(paraBusca(c))),
      );
    },
  },
  { method: 'GET', pattern: '/clients/portfolio', handler: carteira },
  {
    method: 'GET',
    pattern: '/clients/:id',
    handler: ({ params }) => {
      const conta = contaPorRef(params.id);
      // A frase alimenta o estado "cliente não encontrado" da tela (HU-01.2).
      if (!conta) return erro(404, 'Cliente não encontrado.');
      return json<ClientDetail>(mapCustomer360ToClientDetail(visao360(conta), params.id));
    },
  },

  // Repositório do cliente (F9 — telas 13a/13b)
  { method: 'GET', pattern: '/clients/:id/repository', handler: repositorioDe },
  { method: 'POST', pattern: '/clients/:id/repository', handler: enviarAoRepositorio },
  { method: 'PUT', pattern: '/clients/:id/repository/:docId', handler: substituirNoRepositorio },
  { method: 'POST', pattern: '/clients/:id/repository/:docId', handler: removerDoRepositorio },
  { method: 'DELETE', pattern: '/clients/:id/repository/:docId', handler: removerDoRepositorio },
  { method: 'GET', pattern: '/clients/:id/repository/:docId/download', handler: baixarDoRepositorio },

  // Diretório de colaboradores
  {
    method: 'GET',
    pattern: '/directory/users',
    handler: ({ query }) => {
      const q = (query.get('q') ?? '').trim();
      const role = (query.get('role') ?? '').trim();
      if (!role && q.length < 2) return json<{ items: DirectoryUser[] }>({ items: [] });
      const base = role ? colaboradores().filter((c) => c.roles.includes(role)) : colaboradores();
      return json<{ items: DirectoryUser[] }>({ items: buscaColaborador(base, q).map(doBackend).map(paraUsuario) });
    },
  },
  {
    method: 'GET',
    pattern: '/directory/team-candidates',
    handler: ({ query }) => {
      const funcao = (query.get('funcao') ?? '').trim();
      if (funcao === '') return erro(400, 'Informe o balde da equipe (funcao).');
      const perfis = PERFIS_DO_BALDE[funcao];
      if (!perfis) return erro(400, 'Balde da equipe desconhecido.');
      const base = colaboradores().filter((c) => perfis.includes(c.profileKey));
      return json<{ items: DirectoryUser[] }>({
        items: buscaColaborador(base, query.get('q') ?? '').map(doBackend).map(paraCandidato),
      });
    },
  },
  {
    method: 'GET',
    pattern: '/directory/profile-candidates',
    handler: ({ query }) => {
      const perfil = (query.get('perfil') ?? '').trim();
      if (perfil === '') return erro(400, 'Informe o perfil de acesso (perfil).');
      if (!PERFIS_CONHECIDOS.has(perfil)) return erro(400, 'Perfil de acesso desconhecido.');
      const base = colaboradores().filter((c) => c.profileKey === perfil);
      return json<{ items: DirectoryUser[] }>({
        items: buscaColaborador(base, query.get('q') ?? '').map(doBackend).map(paraCandidato),
      });
    },
  },

  // Catálogo de picklists do Salesforce (dependências resolvidas aqui, como no backend)
  {
    method: 'GET',
    pattern: '/picklists/:field',
    handler: ({ params, query }) => {
      const field = campoDoFront(params.field);
      if (!field) return erro(404, 'Picklist não catalogada.');
      const opcoes = opcoesDaPicklist(field, query.get('controllingValue') || null);
      if (!opcoes) return erro(502, 'Falha ao carregar as opções do campo.');
      return json<PicklistOptions>(opcoes);
    },
  },

  // Centros fornecedores (lookup `Centro_Fornecedor__c` da linha de produto)
  { method: 'GET', pattern: '/supply-centers', handler: () => json<SupplyCenter[]>(CENTROS_FORNECEDORES) },

  // Parametrização de Receitas e Despesas — BP Financeiro / TI Administrador, leitura inclusive.
  {
    method: 'GET',
    pattern: '/financial-item-types',
    handler: ({ query, user }) => {
      if (!temPapel(user, 'BP_FINANCEIRO', 'ADMIN')) return semPermissao();
      const tipo = query.get('tipoProposta');
      const itens = valoresParametrizados()
        .filter((r) => !tipo || r.tipoProposta === tipo)
        .sort(
          (a, b) =>
            a.tipoProposta.localeCompare(b.tipoProposta) ||
            a.categoria.localeCompare(b.categoria) ||
            a.nome.localeCompare(b.nome, 'pt-BR'),
        );
      return json<ValoresParametrizadosPage>({ items: itens, total: itens.length });
    },
  },
  {
    method: 'PUT',
    pattern: '/financial-item-types/:id',
    handler: ({ params, body, user }) => {
      if (!temPapel(user, 'BP_FINANCEIRO', 'ADMIN')) return semPermissao();
      if (!body || typeof body !== 'object') return erro(400, 'Corpo inválido.');
      const linha = valoresParametrizados().find((r) => r.id === params.id);
      if (!linha) return erro(404, 'Tipo de item financeiro não encontrado.');

      const payload = body as Record<string, unknown>;
      const CAMPOS: Array<keyof Omit<ValorParametrizadoPayload, 'descricao'>> = [
        'defaultValor',
        'defaultValorVrod',
        'defaultValorVreg1',
        'defaultValorVreg2',
        'defaultValorVreg3',
        'defaultValorVreg4',
      ];
      for (const c of CAMPOS) {
        const v = payload[c];
        if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
          return erro(400, 'Os valores parametrizados devem ser números não negativos.');
        }
      }
      // Ausente mantém; `null` explícito limpa ("esta região não é precificada").
      for (const c of CAMPOS) {
        const v = payload[c];
        if (v !== undefined) linha[c] = typeof v === 'number' ? v : null;
      }
      if (payload.descricao !== undefined) {
        linha.descricao = typeof payload.descricao === 'string' && payload.descricao.trim() ? payload.descricao.trim() : null;
      }
      linha.updatedAt = agoraIso();
      return json<ValorParametrizadoRow>(linha);
    },
  },

  // Domínios do bloco "Recursos financeiros" — a BFF não repassa query, então a
  // finalidade (dependente do tipo) volta vazia, exatamente como em produção.
  {
    method: 'GET',
    pattern: '/financial-resources/domains',
    handler: () => {
      const TIPOS_BONIFICACAO: TipoBonificacao[] = ['ANTECIPADA', 'POR_DESEMPENHO'];
      // Ordem do catálogo; valor fora do tipo do front é descartado (nunca cast).
      const valores = <T extends string>(lista: string[], conhecidos: readonly T[]): T[] =>
        lista.flatMap((v) => conhecidos.filter((k) => k === v));
      return json<FinancialResourceDomains>({
        tipoRegistro: valores(valoresDaPicklist(CampoPicklist.RecursoFinanceiroTipo), DOMINIO.tipoRegistro),
        tipoBonificacao: TIPOS_BONIFICACAO,
        finalidadeRecurso: valores(valoresDaPicklist(CampoPicklist.RecursoFinanceiroFinalidade), DOMINIO.finalidadeRecurso),
        etapaLiberacao: valores(valoresDaPicklist(CampoPicklist.RecursoFinanceiroEtapaLiberacao), DOMINIO.etapaLiberacao),
        periodicidade: valores(valoresDaPicklist(CampoPicklist.RecursoFinanceiroPeriodicidade), DOMINIO.periodicidade),
        indiceCorrecao: valores(valoresDaPicklist(CampoPicklist.RecursoFinanceiroIndiceCorrecao), DOMINIO.indiceCorrecao),
      });
    },
  },
]);
