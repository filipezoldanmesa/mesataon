/**
 * Fixture compartilhada do payload da Visão 360º.
 *
 * Vive num módulo próprio porque a cobertura do card "Grupo Empresa" mora num
 * arquivo separado (o switch `SHOW_COMPANY_GROUP_CARD` é constante de módulo, e
 * `vi.mock` é hoisted por arquivo — ver `company-group-visibility.ts`).
 * Duplicar a fixture faria as duas suítes divergirem em silêncio: a que mocka o
 * flag ON é justamente a rede de segurança do flip, e uma fixture defasada a
 * tornaria inútil.
 *
 * ⚠️ O bloco abaixo é o BASE_DTO de `develop` verbatim — inclusive a forma de
 * garantia da ADR-0046 (`usedSupplyBRL`, `validFrom` nulo e o gap permanente de
 * vigência). Extrair a fixture sem trazer a forma nova era exatamente o conflito
 * que este rebase resolveu.
 *
 * Precedente de nome: `lib/picklists/picklists.test-fixtures.ts`.
 */
import type { BackendCustomer360 } from './customer-360-mapping';

export const BASE_DTO: BackendCustomer360 = {
  sapCode: '152201',
  account: {
    available: true,
    data: {
      sapCode: '152201',
      legalName: 'Posto Vibra Centro-SP',
      taxId: '12345678000190',
      city: 'São Paulo',
      state: 'SP',
      profitCenter: 'SP108',
      salesTeam: 'SÃO PAULO',
      salesOffice: 'DREG2',
      vp: 'VPVAR',
      territoryLeader: 'Ana Ribeiro',
      setorAtividade: '0001 - Posto Prop Serv Urb',
      sucessaoAtiva: false,
    },
  },
  contacts: {
    available: true,
    data: [{ name: 'Marcos Tavares', mobilePhone: '(11) 99921-8430', phone: null, email: 'marcos@vibra.com.br' }],
  },
  /*
   * Quadro societário COERENTE, que é o que o TC pede: os dois tipos de cadastro
   * (PJ e PF), documento, percentual somando 100 e o representante identificado —
   * com estado civil e cidade, que o org preenche essencialmente para ele.
   *
   * ⚠️ O fixture anterior tinha UM sócio de 95% e a soma nunca era exercitada.
   * E o `registrationType` só cobria `COMPANY`: era o caminho em que o defeito do
   * mapper (comparar rótulo em vez de código) não aparecia.
   */
  partners: {
    available: true,
    data: [
      {
        name: 'Diferencial Participações Ltda',
        registrationType: 'COMPANY',
        taxId: '22659048000149',
        participationPercent: 95,
        isContractRepresentative: false,
        /*
         * `null` é o caso de 1,23 M dos 1,24 M de sócios: a fonte não cadastra
         * dossiê nenhum para quem não representa. Ver `representanteDaLinha`.
         */
        representative: null,
      },
      {
        name: 'Helena Braga Diferencial',
        registrationType: 'INDIVIDUAL',
        taxId: '52998224725',
        participationPercent: 5,
        isContractRepresentative: true,
        /*
         * Sócio PF que representa — 5.737 dos 5.888 representantes medidos, o
         * caso comum. O dossiê é dele mesmo, então o nome já está na coluna
         * "Sócio" e não se repete na sub-linha.
         */
        representative: {
          maritalStatus: 'Casado(a)',
          profession: 'Empresária',
          nationality: 'Brasileira',
          idDocumentType: 'RG',
          idDocumentNumber: '890633',
          idDocumentIssuer: 'SSP/CE',
          street: 'Rua Nunes Valente',
          streetNumber: '3350',
          complement: 'Apto 1501',
          district: 'Dionísio Torres',
          zipCode: '60125-071',
          city: 'Fortaleza',
          state: 'CE',
        },
      },
    ],
    // Veredito do backend (`partnershipTotal`) — a tela não recalcula.
    total: { percentTotal: 100, partnersWithoutPercent: 0, closes: true },
  },
  bank: {
    available: true,
    data: {
      bankCode: '001',
      // A fonte NUNCA carrega estes dois — o fixture anterior os preenchia com
      // 'Banco do Brasil'/'Corrente', um estado impossível que escondia como a
      // tela se comporta no caso real.
      bankName: null,
      branch: '9189-3',
      accountType: null,
      accountNumber: '15418',
    },
    gaps: [],
  },
  /*
   * Linha real medida no SAP (conta 7175, iFlow `consultarGarantiasCliente`,
   * 24/08/2026 — VBR-646). O teto é MENOR que o avaliado, que é exatamente o
   * caso que a coluna "Disponível" existe para não deixar passar; e a vigência
   * vem preenchida, então a lacuna cobre só `validFrom`.
   */
  guarantees: {
    available: true,
    outcome: 'FOUND',
    data: [
      {
        type: 'Hipoteca Imóvel com Interesse Comercial',
        validFrom: null,
        validTo: '2027-02-19',
        amount: 9_800_000,
        ceilingBRL: 8_820_000,
        availableBRL: 1_775_853.32,
        usedSupplyBRL: 2_100_000,
        usedInstallmentBRL: 0,
        usedFinancialGrantBRL: 4_944_146.68,
      },
    ],
    gaps: [
      {
        // NÃO `NAO_CONTRATADA`: a integração respondeu, e com dado real na mesma
        // tela. Aquele motivo vira "Aguardando integração SAP", que ao lado de
        // seis linhas vindas do SAP é falso (VBR-646).
        source: 'sap-cpi-garantias',
        sourceLabel: 'SAP',
        reason: 'NAO_FORNECIDO',
        fields: ['validFrom'],
        detail:
          'A coluna Vigência traz a data-limite da garantia; o SAP não informa data de início.',
      },
    ],
  },
  economicGroup: {
    available: true,
    data: {
      groupId: '0000000775',
      groupName: 'Grupo Econômico - 0000000775',
      memberCount: 16,
      exposureAmount: 3_200_000,
      criterion: 'Composição societária',
      gaps: [],
    },
  },
  companyGroup: {
    available: true,
    data: {
      code: '3624',
      name: 'REDE ALEM DO RIO',
      label: '3624 · REDE ALEM DO RIO',
      contractedVolumeM3: 24_000,
      performedVolumeM3: 18_000,
      complianceRatioPercent: 75,
      validity: { from: '2021-04-01', to: '2026-03-31' },
      advanceBonus: { percent: 40, amountBRL: 1_500_000 },
      deferredBonus: { percent: 12, amountBRL: 450_000 },
      revenuePerLiterBRL: 0.058,
      gaps: [],
    },
  },
  anp: {
    available: true,
    data: {
      flag: 'Vibra',
      status: 'Revendedor autorizado',
      statusSigaf: 'Interdição',
      authorizationNumber: 'PR/SP0173260',
      lastUpdatedAt: '2026-05-08',
      dataObtencao: '31/10/2022',
      municipio: 'Curitiba',
      uf: 'PR',
      endereco: 'Rua Exemplo, 100',
    },
  },
  franchises: {
    available: true,
    data: {
      items: [
        { sapCode: '200001', legalName: 'Posto BR Mania', bandeira: 'BR_MANIA', executivo: 'Gilliard Henrique da Silva' },
        { sapCode: '200002', legalName: 'Posto Lubrax', bandeira: 'LUBRAX', executivo: null },
      ],
    },
  },
  documents: {
    available: true,
    data: {
      items: [
        { name: 'Cartão CNPJ', status: 'ok' },
        { name: 'Contrato Social', status: 'ok' },
      ],
    },
  },
  opportunities: { available: true, data: [] },
  /*
   * Cliente com risco DDI já calculado — é o estado que o protótipo
   * `11-cliente-360.html` desenha no cabeçalho (`pill s Risco DDI Baixo`) para
   * este mesmo cliente. Valor de MÁQUINA: quem rotula é `DDI_RISK_PILL`.
   */
  ddiRisk: { available: true, data: { nivel: 'BAIXO' } },
};
