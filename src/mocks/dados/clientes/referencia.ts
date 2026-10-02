import type { ValorParametrizadoRow } from '@/lib/parametrizacao/financial-item-types.types';
import type { SupplyCenter } from '@/lib/proposals/supply-centers.types';

import { COLABORADORES_EXTRAS, todosOsUsuarios } from '../../core/session';

/**
 * Dados de referência do domínio: diretório de colaboradores, centros
 * fornecedores e o catálogo "Parâmetros da Oportunidade". Tudo FICTÍCIO, exceto
 * os VALORES do catálogo, que são parâmetros de negócio (não dado pessoal) e
 * vêm da migration `AlignFinancialItemTypesWithSalesforceCatalog…083`.
 */

// ───────────── Diretório de colaboradores ─────────────

export interface Colaborador {
  id: string;
  name: string;
  email: string;
  /** No tenant, `jobTitle` é o VÍNCULO ("Empregado(a)"), não o cargo. */
  jobTitle: string;
  department: string;
  region: string;
  /** Chave do perfil de acesso (grupo do Entra) — o recorte de `profile-candidates`. */
  profileKey: string;
  roles: string[];
}

const AREA_DO_PERFIL: Record<string, { department: string; region: string }> = {
  LIDER_TERRITORIO: { department: 'Varejo · Gerência SP Interior', region: 'Campinas, SP' },
  BP_FINANCEIRO: { department: 'BP Financeiro Varejo', region: 'Rio de Janeiro, RJ' },
  SNEG: { department: 'Suporte à Negociação', region: 'Rio de Janeiro, RJ' },
  VISUALIZADOR: { department: 'Controladoria Varejo', region: 'Rio de Janeiro, RJ' },
  TI_ADMINISTRADOR: { department: 'Tecnologia da Informação', region: 'Rio de Janeiro, RJ' },
  SPCOM: { department: 'Suporte Comercial', region: 'Rio de Janeiro, RJ' },
  CCOB: { department: 'Crédito e Cobrança', region: 'Rio de Janeiro, RJ' },
  GERENTE_VAREJO: { department: 'Varejo · Gerência Regional Sudeste', region: 'São Paulo, SP' },
  EXPANSAO: { department: 'Expansão da Rede', region: 'São Paulo, SP' },
  GESTOR_FRANQUIAS: { department: 'Franquias · BR Mania e Lubrax+', region: 'Rio de Janeiro, RJ' },
  TI_SUSTENTACAO: { department: 'Tecnologia da Informação', region: 'Rio de Janeiro, RJ' },
  CONSULTOR_EXPANSAO: { department: 'Expansão da Rede', region: 'Belo Horizonte, MG' },
  INTEGRIDADE: { department: 'Integridade e Compliance', region: 'Rio de Janeiro, RJ' },
};

export function colaboradores(): Colaborador[] {
  const base = todosOsUsuarios().map((u, i) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    jobTitle: i % 2 === 0 ? 'Empregada' : 'Empregado',
    ...AREA_DO_PERFIL[u.profileKey],
    profileKey: u.profileKey,
    roles: u.roles,
  }));
  // Os extras vêm da fonte única (`core/session.ts`), que é a mesma que as
  // reatribuições dos outros domínios validam.
  const extras = COLABORADORES_EXTRAS.map((e, i) => ({
    id: e.id,
    name: e.name,
    email: e.email,
    profileKey: e.profileKey,
    roles: e.roles,
    jobTitle: i % 3 === 2 ? 'Contratado' : 'Empregado',
    department: AREA_DO_PERFIL[e.profileKey].department,
    region: e.region ?? AREA_DO_PERFIL[e.profileKey].region,
  }));
  return [...base, ...extras];
}

/**
 * Baldes da equipe da oportunidade → perfis cujos grupos os povoam (ADR-0043,
 * emenda de 21/08/2026). BR Mania e Lubrax+ apontam para o MESMO grupo.
 */
export const PERFIS_DO_BALDE: Record<string, string[]> = {
  exec_expansao: ['EXPANSAO', 'CONSULTOR_EXPANSAO'],
  exec_br_mania: ['GESTOR_FRANQUIAS'],
  exec_lubrax: ['GESTOR_FRANQUIAS'],
  outros: ['VISUALIZADOR', 'GERENTE_VAREJO'],
};

// ───────────── Centros fornecedores (`Centro_Fornecedor__c`) ─────────────

export const CENTROS_FORNECEDORES: SupplyCenter[] = [
  { code: '5101', name: '5101 - Base Paulínia' },
  { code: '5102', name: '5102 - Base Ribeirão Preto' },
  { code: '5201', name: '5201 - Base Betim' },
  { code: '5301', name: '5301 - Base Itajaí' },
  { code: '5401', name: '5401 - Base Senador Canedo' },
  { code: '5501', name: '5501 - Base Candeias' },
  { code: '5601', name: '5601 - Base Vitória' },
  { code: '5701', name: '5701 - Base Brasília' },
  { code: '5801', name: '5801 - Base Canoas' },
];

// ───────────── Parâmetros da Oportunidade (Receitas e Despesas) ─────────────

type Linha = Omit<ValorParametrizadoRow, 'id' | 'tipoProposta' | 'updatedAt' | 'selectable'> & { selectable?: boolean };

function linha(
  nome: string,
  categoria: 'RECEITA' | 'DESPESA',
  descricao: string,
  valores: [number | null, number | null, number | null, number | null, number | null, number | null],
  flags: { obrigatoria?: boolean; cataloguePriced?: boolean; selectable?: boolean } = {},
): Linha {
  const [geral, vrod, v1, v2, v3, v4] = valores;
  return {
    recordType: categoria,
    categoria,
    nome,
    descricao,
    defaultValor: geral,
    defaultValorVrod: vrod,
    defaultValorVreg1: v1,
    defaultValorVreg2: v2,
    defaultValorVreg3: v3,
    defaultValorVreg4: v4,
    obrigatoria: flags.obrigatoria ?? false,
    cataloguePriced: flags.cataloguePriced ?? false,
    selectable: flags.selectable ?? true,
  };
}

const LINHAS_PCR: Linha[] = [
  linha('Licença de Uso de Marca', 'RECEITA', 'Licença de Uso de Marca (CLUM)', [null, null, null, null, null, null]),
  linha('Receita - Estorno DOC', 'RECEITA', 'Estorno do DOC', [null, 1254, 1053.61, 1254, 940.44, 678.65]),
  linha('Receita - Royalties GNV VMM <= 60', 'RECEITA', 'Royalties GNV — VMM até 60', [null, 2376.53, 2376.53, 2376.53, 2376.53, 2376.53], { cataloguePriced: true }),
  linha('Receita - Royalties GNV 60 > VMM <= 90', 'RECEITA', 'Royalties GNV — VMM entre 60 e 90', [null, 5061.26, 5061.26, 5061.26, 5061.26, 5061.26], { cataloguePriced: true }),
  linha('Receita - Royalties GNV 90 > VMM <= 120', 'RECEITA', 'Royalties GNV — VMM entre 90 e 120', [null, 7402.14, 7402.14, 7402.14, 7402.14, 7402.14], { cataloguePriced: true }),
  linha('Receita - Royalties GNV VMM > 120', 'RECEITA', 'Royalties GNV — VMM acima de 120', [null, 12228.57, 12228.57, 12228.57, 12228.57, 12228.57], { cataloguePriced: true }),
  linha('Receita - Royalties GNV - Fora da faixa', 'RECEITA', 'Royalties GNV — fora da faixa', [null, null, null, null, null, null], { selectable: false }),
  linha('Outras Receitas', 'RECEITA', 'Receita livre lançada pelo LT', [null, null, null, null, null, null]),
  linha('DOC', 'DESPESA', 'DOC', [678.65, 1254, 1053.61, 1254, 940.44, 678.65], { obrigatoria: true }),
  linha('Ações Ambientais Corretivas e Preventivas', 'DESPESA', 'Ações Ambientais Corretivas e Preventivas', [678.65, 540.36, 540.36, 401.29, 298.54, 540.36], { obrigatoria: true }),
  linha('Manutenção Equipamentos', 'DESPESA', 'Manutenção de equipamentos', [0, 564.18, 335.41, 564.18, 506.29, 335.41]),
  linha('Manutenção Imagem', 'DESPESA', 'Manutenção de imagem', [null, 836.12, 424.77, 628.7, 836.12, 424.77]),
  linha('Despesa - Avaliação de Imóveis', 'DESPESA', 'Avaliação de imóveis', [null, 1699, 920.59, 1159.77, 1699, 920.59]),
  linha('Despesa - Fiscalização Obra Lubrax +', 'DESPESA', 'Fiscalização de obra — Lubrax +', [null, 7112, 7112, 7112, 7112, 7112]),
  linha('Despesa - Projeto Posto', 'DESPESA', 'Projeto — posto', [null, 12050.36, 4357.02, 5423.45, 12050.36, 4357.02]),
  linha('Despesa - Projeto Lubrax +', 'DESPESA', 'Projeto — Lubrax +', [null, 5520, 5520, 5520, 5520, 5520]),
  linha('Despesa - Manutenção CTF', 'DESPESA', 'Manutenção CTF', [null, 20, 20, 20, 20, 20]),
  linha('Despesa - Manutenção de GNV', 'DESPESA', 'Manutenção de GNV', [null, 0.07, 0.07, 0.07, 0.07, 0.07]),
  linha('Despesa - Seller Pista', 'DESPESA', 'Seller pista', [713.74, 713.74, 713.74, 713.74, 713.74, 713.74]),
  linha('Outras Despesas', 'DESPESA', 'Despesa livre lançada pelo LT', [null, null, null, null, null, null]),
];

export function sementeValoresParametrizados(): ValorParametrizadoRow[] {
  return LINHAS_PCR.map((l, i) => {
    const outra = l.nome === 'Outras Receitas' ? 'OUTRA_RECEITA' : l.nome === 'Outras Despesas' ? 'OUTRA_DESPESA' : l.recordType;
    return {
      ...l,
      id: `fit-pcr-${String(i + 1).padStart(2, '0')}`,
      tipoProposta: 'PCR',
      recordType: outra,
      selectable: l.selectable ?? true,
      updatedAt: '2026-08-21T12:00:00.000Z',
    };
  });
}
