import type {
  BackendCustomerBankAccount,
  BackendCustomerContact,
  BackendCustomerFranchiseLink,
  BackendCustomerGuarantee,
  BackendCustomerMapaDaRede,
  BackendCustomerPartner,
} from '@/lib/clients/customer-360-mapping';

/**
 * Cadastro complementar dos clientes do elenco — o que o backend leria do
 * Salesforce, do SAP e da ANP para montar a carteira e a Visão 360º.
 *
 * ⚠️ Tudo FICTÍCIO (nomes, CPFs/CNPJs com dígito inválido, telefones, contas).
 * As chaves são o Código SAP do elenco (`src/mocks/elenco.ts`).
 */
export interface CadastroCliente {
  profitCenter: string;
  salesTeam: string;
  salesOffice: string;
  setorAtividade: string;
  sucessaoAtiva: boolean | null;
  /** Volume médio mensal (m³/mês) do `Account.VMM__c`; `null` = sem VMM cadastrado. */
  vmm: number | null;
  vmmReferenceDate: string | null;
  /** Vigência do contrato de fornecimento; `null` = sem contrato vigente. */
  contrato: { from: string; to: string | null } | null;
  mapaDaRede: BackendCustomerMapaDaRede | null;
  contatos: BackendCustomerContact[];
  socios: BackendCustomerPartner[];
  /** `null` = cliente não é fornecedor no SAP (a 360º nomeia a lacuna). */
  banco: BackendCustomerBankAccount | null;
  garantias: { outcome: 'FOUND' | 'NO_CREDIT_ACCOUNT' | 'NO_GUARANTEES'; itens: BackendCustomerGuarantee[] };
  grupoEconomico: {
    integrantes: Array<{ sapCode: string; name: string; taxId: string; city: string; state: string }>;
    exposicao: number | null;
    criterio: string;
  } | null;
  grupoEmpresa: { code: string; name: string; contratado: number; performado: number } | null;
  anp: {
    autorizacao: string | null;
    statusSigaf: string | null;
    atualizadoEm: string;
    endereco: string;
  } | null;
  franquias: BackendCustomerFranchiseLink[];
  /** Risco DDI já calculado (`BAIXO｜MEDIO｜ALTO`), ou `null` se nenhuma oportunidade produziu. */
  riscoDdi: string | null;
}

const NA_REDE_ATIVO: BackendCustomerMapaDaRede = {
  status: 'ATIVO',
  situacao: 'NA_REDE',
  justificativaPendente: false,
  dataEntrada: '2019-03-01',
  novaImagem: 'Sim',
  inativoDesde: null,
  dataSaida: null,
};

function socioPf(
  nome: string,
  cpf: string,
  pct: number,
  cidade: string,
  uf: string,
  representa = true,
): BackendCustomerPartner {
  return {
    name: nome,
    registrationType: 'INDIVIDUAL',
    taxId: cpf,
    participationPercent: pct,
    isContractRepresentative: representa,
    representative: representa
      ? {
          maritalStatus: 'Casado(a)',
          profession: 'Empresário(a)',
          nationality: 'Brasileira',
          idDocumentType: 'RG',
          idDocumentNumber: '1234567',
          idDocumentIssuer: `SSP/${uf}`,
          street: 'Rua das Acácias',
          streetNumber: '120',
          complement: null,
          district: 'Centro',
          zipCode: '00000-000',
          city: cidade,
          state: uf,
        }
      : null,
  };
}

function socioPj(nome: string, cnpj: string, pct: number): BackendCustomerPartner {
  return {
    name: nome,
    registrationType: 'COMPANY',
    taxId: cnpj,
    participationPercent: pct,
    isContractRepresentative: false,
    representative: null,
  };
}

function garantia(
  tipo: string,
  vence: string,
  avaliado: number,
  teto: number,
  usadoFornecimento: number,
  usadoConcessao: number,
): BackendCustomerGuarantee {
  return {
    type: tipo,
    validFrom: null,
    validTo: vence,
    amount: avaliado,
    ceilingBRL: teto,
    availableBRL: Math.max(0, teto - usadoFornecimento - usadoConcessao),
    usedSupplyBRL: usadoFornecimento,
    usedInstallmentBRL: 0,
    usedFinancialGrantBRL: usadoConcessao,
  };
}

export const CADASTRO: Record<string, CadastroCliente> = {
  '900101': {
    profitCenter: 'SP214',
    salesTeam: 'SP INTERIOR',
    salesOffice: 'VREG2',
    setorAtividade: '0001 - Posto Prop Serv Urb',
    sucessaoAtiva: false,
    vmm: 380,
    vmmReferenceDate: '2026-08-31',
    contrato: { from: '2021-04-01', to: '2031-03-31' },
    mapaDaRede: NA_REDE_ATIVO,
    contatos: [
      { name: 'Rogério Antunes', mobilePhone: '(19) 99000-1101', phone: '(19) 3200-1101', email: 'rogerio@postohorizonte.exemplo.com.br' },
      { name: 'Patrícia Antunes', mobilePhone: '(19) 99000-1102', phone: null, email: 'financeiro@postohorizonte.exemplo.com.br' },
    ],
    socios: [
      socioPf('Rogério Antunes', '11122233300', 60, 'Campinas', 'SP'),
      socioPf('Patrícia Antunes', '22233344400', 40, 'Campinas', 'SP', false),
    ],
    banco: { bankCode: '001', bankName: null, branch: '3301-7', accountType: null, accountNumber: '45120-9' },
    garantias: {
      outcome: 'FOUND',
      itens: [
        garantia('Hipoteca Imóvel com Interesse Comercial', '2028-06-30', 3_400_000, 3_000_000, 900_000, 1_250_000),
        garantia('Fiança Bancária', '2027-01-31', 600_000, 600_000, 250_000, 0),
      ],
    },
    grupoEconomico: {
      integrantes: [
        { sapCode: '900101', name: 'Auto Posto Horizonte Azul Ltda', taxId: '11222333000100', city: 'Campinas', state: 'SP' },
        { sapCode: '910111', name: 'Horizonte Conveniência Ltda', taxId: '11222333000281', city: 'Campinas', state: 'SP' },
        { sapCode: '910112', name: 'Auto Posto Horizonte II Ltda', taxId: '11222333000362', city: 'Valinhos', state: 'SP' },
      ],
      exposicao: 2_150_000,
      criterio: 'Composição societária',
    },
    grupoEmpresa: { code: '7001', name: 'Grupo Horizonte', contratado: 9_600, performado: 8_350 },
    anp: { autorizacao: 'PR/SP0011010', statusSigaf: null, atualizadoEm: '2026-09-15', endereco: 'Av. das Andorinhas, 1500' },
    franquias: [],
    riscoDdi: 'BAIXO',
  },
  '900102': {
    profitCenter: 'MG105',
    salesTeam: 'MINAS GERAIS',
    salesOffice: 'VREG3',
    setorAtividade: '0001 - Posto Prop Serv Urb',
    sucessaoAtiva: false,
    vmm: 600,
    vmmReferenceDate: '2026-08-31',
    contrato: { from: '2026-05-01', to: '2036-04-30' },
    mapaDaRede: NA_REDE_ATIVO,
    contatos: [
      { name: 'Marcelo Duarte', mobilePhone: '(31) 99000-2201', phone: '(31) 3300-2201', email: 'marcelo@serraverde.exemplo.com.br' },
    ],
    socios: [
      socioPj('Serra Verde Participações S.A.', '22333444000270', 70),
      socioPf('Marcelo Duarte', '33344455500', 30, 'Belo Horizonte', 'MG'),
    ],
    banco: { bankCode: '341', bankName: null, branch: '0457-2', accountType: null, accountNumber: '88731-0' },
    garantias: {
      outcome: 'FOUND',
      itens: [garantia('Hipoteca Imóvel com Interesse Comercial', '2030-12-31', 6_800_000, 6_100_000, 1_800_000, 3_400_000)],
    },
    grupoEconomico: {
      integrantes: [
        { sapCode: '900102', name: 'Comercial de Combustíveis Serra Verde S.A.', taxId: '22333444000100', city: 'Belo Horizonte', state: 'MG' },
        { sapCode: '910121', name: 'Serra Verde Contagem Ltda', taxId: '22333444000351', city: 'Contagem', state: 'MG' },
        { sapCode: '910122', name: 'Serra Verde Betim Ltda', taxId: '22333444000432', city: 'Betim', state: 'MG' },
        { sapCode: '910123', name: 'Serra Verde Lagoa Santa Ltda', taxId: '22333444000513', city: 'Lagoa Santa', state: 'MG' },
      ],
      exposicao: 5_200_000,
      criterio: 'Composição societária',
    },
    grupoEmpresa: { code: '7002', name: 'Rede Serra Verde', contratado: 28_800, performado: 25_900 },
    anp: { autorizacao: 'PR/MG0022020', statusSigaf: null, atualizadoEm: '2026-09-15', endereco: 'Av. do Contorno, 4200' },
    franquias: [
      { sapCode: '900202', legalName: 'Lubrax+ Serra Verde Ltda', bandeira: 'LUBRAX', executivo: 'João Vieira' },
    ],
    riscoDdi: 'BAIXO',
  },
  '900103': {
    profitCenter: 'SC301',
    salesTeam: 'SANTA CATARINA',
    salesOffice: 'VREG4',
    setorAtividade: '0001 - Posto Prop Serv Urb',
    sucessaoAtiva: null,
    vmm: null,
    vmmReferenceDate: null,
    contrato: null,
    mapaDaRede: null,
    contatos: [
      { name: 'Luciana Prates', mobilePhone: '(48) 99000-3301', phone: null, email: 'luciana@litoralsul.exemplo.com.br' },
    ],
    socios: [
      socioPf('Luciana Prates', '44455566600', 50, 'Florianópolis', 'SC'),
      socioPf('Otávio Prates', '55566677700', 50, 'Florianópolis', 'SC', false),
    ],
    banco: null,
    garantias: { outcome: 'NO_CREDIT_ACCOUNT', itens: [] },
    grupoEconomico: null,
    grupoEmpresa: null,
    anp: { autorizacao: 'PR/SC0033030', statusSigaf: null, atualizadoEm: '2026-09-15', endereco: 'Rod. SC-401, km 5' },
    franquias: [],
    riscoDdi: null,
  },
  '900104': {
    profitCenter: 'GO410',
    salesTeam: 'CENTRO-OESTE',
    salesOffice: 'VROD',
    setorAtividade: '0002 - Posto Rodoviário',
    sucessaoAtiva: false,
    vmm: 450,
    vmmReferenceDate: '2026-08-31',
    contrato: { from: '2018-10-01', to: '2026-12-31' },
    mapaDaRede: { ...NA_REDE_ATIVO, dataEntrada: '2018-10-01', novaImagem: 'Não' },
    contatos: [
      { name: 'Edson Rezende', mobilePhone: '(62) 99000-4401', phone: '(62) 3400-4401', email: 'edson@rodopostocerrado.exemplo.com.br' },
    ],
    socios: [
      socioPj('Cerrado Participações Ltda', '44555666000290', 80),
      socioPf('Edson Rezende', '66677788800', 20, 'Goiânia', 'GO'),
    ],
    banco: { bankCode: '104', bankName: null, branch: '1820-0', accountType: null, accountNumber: '00012345-6' },
    garantias: {
      outcome: 'FOUND',
      itens: [garantia('Carta Fiança', '2026-11-30', 1_200_000, 1_200_000, 700_000, 300_000)],
    },
    grupoEconomico: {
      integrantes: [
        { sapCode: '900104', name: 'Rodoposto Cerrado Norte Ltda', taxId: '44555666000100', city: 'Goiânia', state: 'GO' },
        { sapCode: '910141', name: 'Rodoposto Cerrado Sul Ltda', taxId: '44555666000371', city: 'Anápolis', state: 'GO' },
      ],
      exposicao: 1_000_000,
      criterio: 'Composição societária',
    },
    grupoEmpresa: { code: '7004', name: 'Cerrado Participações', contratado: 10_800, performado: 7_900 },
    anp: { autorizacao: 'PR/GO0044040', statusSigaf: null, atualizadoEm: '2026-09-15', endereco: 'BR-153, km 12' },
    franquias: [],
    riscoDdi: 'MEDIO',
  },
  '900105': {
    profitCenter: 'BA220',
    salesTeam: 'BAHIA',
    salesOffice: 'VREG1',
    setorAtividade: '0001 - Posto Prop Serv Urb',
    sucessaoAtiva: false,
    vmm: 280,
    vmmReferenceDate: '2026-08-31',
    contrato: { from: '2022-03-01', to: null },
    mapaDaRede: NA_REDE_ATIVO,
    contatos: [
      { name: 'Renata Bittencourt', mobilePhone: '(71) 99000-5501', phone: '(71) 3500-5501', email: 'renata@baiaformosa.exemplo.com.br' },
    ],
    socios: [socioPf('Renata Bittencourt', '77788899900', 100, 'Salvador', 'BA')],
    banco: { bankCode: '237', bankName: null, branch: '3150-1', accountType: null, accountNumber: '0099881-2' },
    garantias: { outcome: 'NO_GUARANTEES', itens: [] },
    grupoEconomico: {
      integrantes: [
        { sapCode: '900105', name: 'Auto Posto Baía Formosa Eireli', taxId: '55666777000100', city: 'Salvador', state: 'BA' },
        { sapCode: '900205', name: 'BR Mania Baía Formosa Ltda', taxId: '55666777000281', city: 'Salvador', state: 'BA' },
      ],
      exposicao: 380_000,
      criterio: 'Composição societária',
    },
    grupoEmpresa: null,
    anp: { autorizacao: 'PR/BA0055050', statusSigaf: null, atualizadoEm: '2026-09-15', endereco: 'Av. Oceânica, 880' },
    franquias: [
      { sapCode: '900205', legalName: 'BR Mania Baía Formosa Ltda', bandeira: 'BR_MANIA', executivo: 'João Vieira' },
    ],
    riscoDdi: null,
  },
  '900106': {
    profitCenter: 'ES130',
    salesTeam: 'ESPÍRITO SANTO',
    salesOffice: 'VREG3',
    setorAtividade: '0001 - Posto Prop Serv Urb',
    sucessaoAtiva: true,
    vmm: 720,
    vmmReferenceDate: '2026-08-31',
    contrato: { from: '2016-07-01', to: '2026-10-31' },
    mapaDaRede: NA_REDE_ATIVO,
    contatos: [
      { name: 'Gustavo Lessa', mobilePhone: '(27) 99000-6601', phone: '(27) 3600-6601', email: 'gustavo@valedorio.exemplo.com.br' },
      { name: 'Helena Lessa', mobilePhone: '(27) 99000-6602', phone: null, email: null },
    ],
    socios: [
      socioPf('Gustavo Lessa', '88899900011', 55, 'Vitória', 'ES'),
      socioPf('Helena Lessa', '99900011122', 45, 'Vitória', 'ES', false),
    ],
    banco: { bankCode: '033', bankName: null, branch: '2210-4', accountType: null, accountNumber: '13004455-1' },
    garantias: {
      outcome: 'FOUND',
      itens: [garantia('Hipoteca Imóvel com Interesse Comercial', '2031-05-31', 8_900_000, 8_000_000, 2_200_000, 4_100_000)],
    },
    grupoEconomico: {
      integrantes: [
        { sapCode: '900106', name: 'Posto Vale do Rio Doce Ltda', taxId: '66777888000100', city: 'Vitória', state: 'ES' },
        { sapCode: '910161', name: 'Vale Combustíveis Serra Ltda', taxId: '66777888000291', city: 'Serra', state: 'ES' },
      ],
      exposicao: 6_100_000,
      criterio: 'Composição societária',
    },
    grupoEmpresa: { code: '7006', name: 'Vale Combustíveis', contratado: 17_280, performado: 16_900 },
    anp: { autorizacao: 'PR/ES0066060', statusSigaf: null, atualizadoEm: '2026-09-15', endereco: 'Av. Beira-Mar, 300' },
    franquias: [],
    riscoDdi: 'MEDIO',
  },
  '900107': {
    profitCenter: 'DF150',
    salesTeam: 'DISTRITO FEDERAL',
    salesOffice: 'VREG1',
    setorAtividade: '0001 - Posto Prop Serv Urb',
    sucessaoAtiva: false,
    vmm: 500,
    vmmReferenceDate: '2026-08-31',
    contrato: { from: '2016-11-01', to: '2026-11-30' },
    mapaDaRede: NA_REDE_ATIVO,
    contatos: [
      { name: 'Sérgio Paiva', mobilePhone: '(61) 99000-7701', phone: '(61) 3700-7701', email: 'sergio@postoplanalto.exemplo.com.br' },
    ],
    socios: [
      socioPf('Sérgio Paiva', '10120230344', 50, 'Brasília', 'DF'),
      socioPf('Cláudia Paiva', '20230340455', 50, 'Brasília', 'DF', false),
    ],
    banco: { bankCode: '001', bankName: null, branch: '1606-6', accountType: null, accountNumber: '70011-3' },
    garantias: {
      outcome: 'FOUND',
      itens: [garantia('Hipoteca Imóvel com Interesse Comercial', '2029-09-30', 5_100_000, 4_600_000, 1_400_000, 1_900_000)],
    },
    grupoEconomico: null,
    grupoEmpresa: { code: '7007', name: 'Grupo Planalto', contratado: 12_000, performado: 11_200 },
    anp: { autorizacao: 'PR/DF0077070', statusSigaf: null, atualizadoEm: '2026-09-15', endereco: 'SCLN 210, Bloco A' },
    franquias: [],
    riscoDdi: 'BAIXO',
  },
  '900108': {
    profitCenter: 'RS170',
    salesTeam: 'RIO GRANDE DO SUL',
    salesOffice: 'VREG4',
    setorAtividade: '0002 - Posto Rodoviário',
    sucessaoAtiva: false,
    vmm: 830,
    vmmReferenceDate: '2026-08-31',
    contrato: { from: '2026-07-01', to: '2036-06-30' },
    mapaDaRede: { ...NA_REDE_ATIVO, situacao: 'EM_PROCESSO_DE_ENTRADA', status: null, dataEntrada: null, novaImagem: null },
    contatos: [
      { name: 'Fernando Kessler', mobilePhone: '(51) 99000-8801', phone: '(51) 3800-8801', email: 'fernando@postopampa.exemplo.com.br' },
    ],
    socios: [
      socioPj('Pampa Energia Participações Ltda', '88999000000280', 90),
      socioPf('Fernando Kessler', '30340450566', 10, 'Porto Alegre', 'RS'),
    ],
    banco: { bankCode: '041', bankName: null, branch: '0100-8', accountType: null, accountNumber: '3500012-7' },
    garantias: {
      outcome: 'FOUND',
      itens: [
        garantia('Hipoteca Imóvel com Interesse Comercial', '2032-03-31', 9_500_000, 8_500_000, 1_900_000, 5_200_000),
        garantia('Penhor de Equipamentos', '2028-03-31', 900_000, 700_000, 0, 400_000),
      ],
    },
    grupoEconomico: {
      integrantes: [
        { sapCode: '900108', name: 'Posto Pampa Gaúcho Comércio Ltda', taxId: '88999000000100', city: 'Porto Alegre', state: 'RS' },
        { sapCode: '910181', name: 'Pampa Canoas Combustíveis Ltda', taxId: '88999000000361', city: 'Canoas', state: 'RS' },
        { sapCode: '910182', name: 'Pampa Gravataí Combustíveis Ltda', taxId: '88999000000442', city: 'Gravataí', state: 'RS' },
      ],
      exposicao: 7_400_000,
      criterio: 'Composição societária',
    },
    grupoEmpresa: { code: '7008', name: 'Pampa Energia', contratado: 19_920, performado: 0 },
    anp: { autorizacao: 'PR/RS0088080', statusSigaf: null, atualizadoEm: '2026-09-15', endereco: 'BR-116, km 270' },
    franquias: [],
    riscoDdi: 'BAIXO',
  },
};

/**
 * Contas que não estão no elenco mas dão estado às abas da carteira: dois
 * prospects (sem Código SAP — ADR-0055) e uma unidade de franquia vinculada a
 * um posto do elenco (Bug 67504 — a linha é MARCADA, não escondida).
 */
export interface ContaExtra {
  /** Id de rota (CRM id do prospect, ou o próprio SAP da unidade). */
  id: string;
  sapCode: string | null;
  razaoSocial: string;
  cnpj: string;
  cidade: string;
  uf: string;
  franquiaDe: { sapCode: string; legalName: string } | null;
}

export const CONTAS_EXTRAS: ContaExtra[] = [
  {
    id: '900205',
    sapCode: '900205',
    razaoSocial: 'BR Mania Baía Formosa Ltda',
    cnpj: '55.666.777/0002-81',
    cidade: 'Salvador',
    uf: 'BA',
    franquiaDe: { sapCode: '900105', legalName: 'Auto Posto Baía Formosa Eireli' },
  },
  {
    id: '001PRS000000001',
    sapCode: null,
    razaoSocial: 'Auto Posto Mirante do Sol Ltda',
    cnpj: '91.234.567/0001-00',
    cidade: 'Ribeirão Preto',
    uf: 'SP',
    franquiaDe: null,
  },
  {
    id: '001PRS000000002',
    sapCode: null,
    razaoSocial: 'Posto Estrela do Agreste Ltda',
    cnpj: '92.345.678/0001-00',
    cidade: 'Caruaru',
    uf: 'PE',
    franquiaDe: null,
  },
];
