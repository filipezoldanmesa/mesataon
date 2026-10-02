import type { FinancialItemType, PeriodicidadeItem } from '@/lib/proposals/financial-items.types';
import type { ProposalSupplyCenter } from '@/lib/proposals/supply-centers.types';
import { IndiceCorrecao } from '@/lib/picklists/salesforce-values';

/**
 * Catálogos FICTÍCIOS do domínio `propostas` — produtos elegíveis, bases de
 * fornecimento, tipos de item financeiro — e os utilitários de data/valor que
 * as sementes e o handler compartilham.
 *
 * Códigos de material e de centro são inventados; os nomes de base usam só a
 * cidade (geografia pública), nunca um cadastro real.
 */

// ───────────────────────────── Datas ─────────────────────────────

/** `YYYY-MM-DD` de uma data (UTC — o protótipo não depende de fuso). */
export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseIso(s: string): Date {
  return new Date(`${s.slice(0, 10)}T00:00:00Z`);
}

export function addMeses(s: string, n: number): string {
  const d = parseIso(s);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return iso(d);
}

export function addDias(s: string, n: number): string {
  const d = parseIso(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** 1º dia do mês seguinte a `s`. */
export function primeiroDoMesSeguinte(s: string): string {
  const d = parseIso(s);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)));
}

/** Último dia do mês de `s`. */
export function ultimoDoMes(s: string): string {
  const d = parseIso(s);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function hojeIso(): string {
  return iso(new Date());
}

/**
 * Meses entre duas datas contando o mês da ponta final quando o fim não é dia 1
 * — a mesma regra de `contractTermMonths` do backend (piso 1).
 */
export function mesesEntre(inicio: string, fim: string): number {
  const a = parseIso(inicio);
  const b = parseIso(fim);
  const meses =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) +
    (b.getUTCDate() !== 1 ? 1 : 0);
  return Math.max(1, meses);
}

export function arred(n: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

// ───────────────────────────── Bases ─────────────────────────────

export interface BaseCatalogo {
  code: string;
  name: string;
  uf: string;
}

export const BASES: BaseCatalogo[] = [
  { code: '5064', name: 'Base Paulínia', uf: 'SP' },
  { code: '5071', name: 'Base Betim', uf: 'MG' },
  { code: '5082', name: 'Base Itajaí', uf: 'SC' },
  { code: '5090', name: 'Base Senador Canedo', uf: 'GO' },
  { code: '5103', name: 'Base Candeias', uf: 'BA' },
  { code: '5110', name: 'Base Serra', uf: 'ES' },
  { code: '5121', name: 'Base Brasília', uf: 'DF' },
  { code: '5134', name: 'Base Canoas', uf: 'RS' },
];

export function basePorCodigo(code: string | null | undefined): BaseCatalogo | undefined {
  return BASES.find((b) => b.code === code);
}

export function basePorNome(nome: string | null | undefined): BaseCatalogo | undefined {
  return BASES.find((b) => b.name === nome);
}

/** Centro sugerido da conta (área de venda), por UF. */
export function baseSugeridaDaUf(uf: string): BaseCatalogo | undefined {
  return BASES.find((b) => b.uf === uf);
}

/** Catálogo inteiro com o centro da conta marcado e listado primeiro (ADO 67869). */
export function basesDaProposta(codigoSugerido: string | null): ProposalSupplyCenter[] {
  const itens = BASES.map((b) => ({ code: b.code, name: b.name, sugerida: b.code === codigoSugerido }));
  return [...itens.filter((i) => i.sugerida), ...itens.filter((i) => !i.sugerida)];
}

// ───────────────────────────── Produtos ─────────────────────────────

export interface ProdutoCatalogo {
  codigo: string;
  nome: string;
  /** CPV de referência em R$/m³ (varia um pouco por base). */
  cpvBase: number;
  /** Margem do plano de negócios, R$/m³. */
  margemBp: number;
  /** Margem realizada nos últimos 6 meses, R$/m³. */
  margemSugerida: number;
  /** Fatia típica do VMM do posto. */
  mix: number;
}

export const PRODUTOS: ProdutoCatalogo[] = [
  { codigo: '7401', nome: 'Gasolina Comum', cpvBase: 4920, margemBp: 185, margemSugerida: 172, mix: 0.4 },
  { codigo: '7402', nome: 'Gasolina Aditivada', cpvBase: 5065, margemBp: 228, margemSugerida: 214, mix: 0.12 },
  { codigo: '7410', nome: 'Etanol Hidratado', cpvBase: 3480, margemBp: 142, margemSugerida: 131, mix: 0.16 },
  { codigo: '7420', nome: 'Diesel S10', cpvBase: 5310, margemBp: 168, margemSugerida: 159, mix: 0.26 },
  { codigo: '7421', nome: 'Diesel S10 Aditivado', cpvBase: 5440, margemBp: 196, margemSugerida: 188, mix: 0.06 },
  { codigo: '7430', nome: 'Diesel S500', cpvBase: 5190, margemBp: 151, margemSugerida: 144, mix: 0 },
  { codigo: '7450', nome: 'Arla 32 Granel', cpvBase: 2310, margemBp: 260, margemSugerida: 248, mix: 0 },
];

export function produtoPorCodigo(codigo: string): ProdutoCatalogo | undefined {
  return PRODUTOS.find((p) => p.codigo === codigo);
}

/** CPV do produto na base (R$/m³). */
export function cpvNaBase(p: ProdutoCatalogo, baseCodigo: string | null): number {
  const i = Math.max(0, BASES.findIndex((b) => b.code === baseCodigo));
  return arred(p.cpvBase + (i - 3) * 18);
}

/** O par produto × base sem CPV cadastrado — mostra o estado "sem CPV nesta base". */
export function temCpv(codigo: string, baseCodigo: string): boolean {
  return !(codigo === '7430' && baseCodigo === '5082') && !(codigo === '7450' && baseCodigo === '5134');
}

/** Contas com allowlist em `Produtos_Elegiveis__c` (o resto cai no catálogo). */
export const CLIENTES_COM_ALLOWLIST: Record<string, string[]> = {
  '900101': ['7401', '7402', '7410', '7420'],
  '900102': ['7401', '7402', '7410', '7420', '7421'],
  '900107': ['7401', '7410', '7420'],
};

// ───────────────────────── Tipos de item financeiro ─────────────────────────

const ipca = IndiceCorrecao.Ipca;
const igpdi = IndiceCorrecao.IgpDi;
const igpm = IndiceCorrecao.Igpm;

function tipo(
  id: string,
  nome: string,
  categoria: 'RECEITA' | 'DESPESA',
  descricao: string,
  periodicidade: PeriodicidadeItem,
  indice: IndiceCorrecao,
  extra: Partial<FinancialItemType> = {},
): FinancialItemType {
  return {
    id,
    recordType: categoria,
    categoria,
    nome,
    descricao,
    defaultIndiceCorrecao: indice,
    defaultPeriodicidade: periodicidade,
    defaultValor: null,
    defaultDescricao: descricao,
    obrigatoria: false,
    isGnvCtf: false,
    cataloguePriced: false,
    ...extra,
  };
}

/** Catálogo PCR (espelho de `Parametros_Da_Oportunidade__c`, valores fictícios). */
export const TIPOS_ITEM_FINANCEIRO: FinancialItemType[] = [
  tipo('fit-clum', 'Licença de Uso de Marca', 'RECEITA', 'Licença de Uso de Marca (CLUM)', 'MENSAL', igpm),
  tipo('fit-estorno-doc', 'Receita - Estorno DOC', 'RECEITA', 'Estorno do DOC', 'ANUAL', igpdi, {
    defaultValor: 1053.61,
  }),
  tipo('fit-gnv-60', 'Receita - Royalties GNV VMM <= 60', 'RECEITA', 'Royalties GNV — VMM até 60', 'MENSAL', ipca, {
    defaultValor: 2376.53,
    cataloguePriced: true,
  }),
  tipo('fit-gnv-90', 'Receita - Royalties GNV 60 > VMM <= 90', 'RECEITA', 'Royalties GNV — VMM entre 60 e 90', 'MENSAL', ipca, {
    defaultValor: 3120.4,
    cataloguePriced: true,
  }),
  tipo('fit-outra-receita', 'Outras Receitas', 'RECEITA', '', 'UNICA', igpm, {
    recordType: 'OUTRA_RECEITA',
    descricao: null,
    defaultDescricao: null,
  }),
  tipo('fit-doc', 'DOC', 'DESPESA', 'DOC', 'ANUAL', igpdi, { obrigatoria: true, defaultValor: 1053.61 }),
  tipo('fit-ambiental', 'Ações Ambientais Corretivas e Preventivas', 'DESPESA', 'Ações Ambientais Corretivas e Preventivas', 'MENSAL', igpdi, {
    obrigatoria: true,
    defaultValor: 540.36,
  }),
  tipo('fit-manut-equip', 'Manutenção Equipamentos', 'DESPESA', 'Manutenção de equipamentos', 'MENSAL', igpdi, {
    defaultValor: 335.41,
  }),
  tipo('fit-manut-imagem', 'Manutenção Imagem', 'DESPESA', 'Manutenção de imagem', 'ANUAL', igpdi, {
    defaultValor: 424.77,
  }),
  tipo('fit-avaliacao', 'Despesa - Avaliação de Imóveis', 'DESPESA', 'Avaliação de imóveis', 'UNICA', igpdi, {
    defaultValor: 920.59,
  }),
  tipo('fit-fiscalizacao', 'Despesa - Fiscalização Obra Posto', 'DESPESA', 'Fiscalização de obra — posto', 'UNICA', igpm),
  tipo('fit-gnv-ctf', 'Despesa - Comodato CTF GNV', 'DESPESA', 'Comodato de equipamento CTF/GNV', 'MENSAL', igpm, {
    isGnvCtf: true,
  }),
  tipo('fit-outra-despesa', 'Outras Despesas', 'DESPESA', '', 'UNICA', igpm, {
    recordType: 'OUTRA_DESPESA',
    descricao: null,
    defaultDescricao: null,
  }),
];

export function tipoItemPorId(id: string): FinancialItemType | undefined {
  return TIPOS_ITEM_FINANCEIRO.find((t) => t.id === id);
}

/** Quantas ocorrências de um item cabem no período (base do `valorFinal`). */
export function ocorrencias(periodicidade: PeriodicidadeItem, numMeses: number): number {
  switch (periodicidade) {
    case 'UNICA':
      return 1;
    case 'MENSAL':
      return numMeses;
    case 'TRIMESTRAL':
      return Math.ceil(numMeses / 3);
    case 'SEMESTRAL':
      return Math.ceil(numMeses / 6);
    case 'ANUAL':
      return Math.ceil(numMeses / 12);
  }
}

/** Meses entre lançamentos de uma periodicidade de recurso financeiro. */
export const MESES_DA_PERIODICIDADE: Record<string, number> = {
  Única: 0,
  Mensal: 1,
  Bimestral: 2,
  Trimestral: 3,
  Quadrimestral: 4,
  Semestral: 6,
  Anual: 12,
};
