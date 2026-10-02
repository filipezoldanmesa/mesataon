import type { OpportunityDetail as OpportunityDetailType } from '@/lib/opportunities/types';
import { ProposalStatus } from '@/lib/opportunities/types';
import type { ListPendenciasResult } from '@/lib/pendencias/types';

/**
 * Fixtures compartilhadas da tela de detalhe da oportunidade.
 *
 * Extraídas de `opportunity-detail.test.tsx` quando um segundo arquivo passou a
 * precisar delas (`opportunity-detail-devolucao.test.tsx`, que precisa mockar
 * `AnaliseView` — um `vi.mock` é de módulo inteiro e derrubaria as asserções do
 * arquivo original, que montam o shell de verdade).
 *
 * Duplicar as ~70 linhas era a alternativa, e as duas cópias divergiriam
 * exatamente no campo que alguém acrescentasse só de um lado. Mesmo precedente
 * de `sneg-analise-shell.test-fixtures.ts` e `customer-360.test-fixtures.ts`.
 */
export function makeOpportunity(
  overrides: Partial<OpportunityDetailType> = {},
): OpportunityDetailType {
  return {
    id: 'opp-0428',
    code: 'OPP-0428',
    backendState: 'EM_PREENCHIMENTO',
    title: 'Posto Vibra Centro-SP · Contratação',
    description: null,
    briefing: null,
    parecerLt: null,
    finalidade: 'Vinculação de bandeira',
    clientId: '152201',
    clientName: 'Posto Vibra Centro-SP',
    clientDocument: '12.345.678/0001-90',
    clientRecebedorId: '152201',
    clientRecebedorName: 'Posto Vibra Centro-SP',
    pimAdesao: null,
    possuiNovaImagemPista: null,
    seraColocadaNovaImagemPista: null,
    alteracaoMinutaPadrao: null,
    descricaoAlteracaoMinutaPadrao: null,
    type: 'Posto',
    status: 'preenchimento',
    /*
     * ⚠️ `salesZone` é a lista de ÁREAS de venda da conta (Divisão / Canal,
     * juntas por vírgula em `buildAreaVenda`) e `profitCenters` é a ZONA do LT
     * (`Account.Zona_de_vendas_da_conta__c`). A fixture declarava `'SP Capital'`
     * na primeira e `null`/escritório na segunda — payload que o backend não
     * produz, e o teste passava a provar que a tela lê bem algo impossível.
     * Ver `lib/opportunities/zona-venda-oportunidade.ts`.
     */
    salesZone: 'Combustíveis Claros / Vendas Indiretas, Lubrificantes / Vendas Indiretas',
    companyGroup: '4981 · Grupo JAL',
    franchises: ['BR Mania', 'Lubrax+'],
    profitCenters: 'RN06',
    vmm: 24000,
    indexRealLitro: 0.058,
    startDate: '2026-07-01',
    endDate: '2031-06-30',
    estimatedValue: 6000000,
    createdAt: '2026-06-18T09:00:00Z',
    dataAbertura: '2026-06-18T09:00:00Z',
    dataConclusao: null,
    createdBy: 'Ana Ribeiro',
    owner: 'Ana Ribeiro',
    ownerRole: 'LT',
    team: [
      { id: 'u1', name: 'Ana Ribeiro', role: 'LT', zone: 'SP Capital', isPrincipal: true },
      { id: 'u2', name: 'Pedro Almeida', role: 'LT', zone: 'Centro-Oeste' },
    ],
    propostas: [
      {
        id: 'P-1115',
        code: 'P-1115',
        title: 'Cenário conservador',
        group: 'Posto',
        status: ProposalStatus.EmPreenchimento,
        authorName: 'Ana Ribeiro',
        fillPercent: 50,
        isElected: false,
        indicatorStatus: null,
      },
      {
        id: 'P-1116',
        code: 'P-1116',
        title: 'Cenário base',
        group: 'Franquia BR Mania',
        status: ProposalStatus.EmPreenchimento,
        fillPercent: 17,
        isElected: false,
        indicatorStatus: null,
      },
    ],
    proposalIds: [],
    indicadores: null,
    situacaoPosto: null,
    mapaDaRede: null,
    ...overrides,
  };
}

export const EMPTY_KPIS = { atrasadas: 0, vencemHoje: 0, abertas: 0, concluidasSemana: 0 };

export async function makeNoPendencies(): Promise<ListPendenciasResult> {
  return { items: [], total: 0, totalAtivas: 0, kpis: EMPTY_KPIS };
}
