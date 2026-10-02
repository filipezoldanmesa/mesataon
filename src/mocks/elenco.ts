/**
 * ELENCO do protótipo — as entidades que TODAS as telas compartilham.
 *
 * Cada domínio (`src/mocks/handlers/<dominio>.ts`) monta o seu dado a partir
 * daqui, para que a oportunidade `opp-003` seja a MESMA na listagem, no
 * dashboard, na pendência e na tela de análise: mesmo cliente, mesma fase, mesmo
 * LT. Quem cria um cenário novo acrescenta aqui primeiro.
 *
 * ⚠️ Tudo é FICTÍCIO: razões sociais, CNPJs (dígito verificador inválido de
 * propósito), nomes de pessoas e e-mails. Nunca copie dado real de produção ou
 * de staging para o protótipo — este repositório é acessado por quem não tem
 * acesso aos dados da Vibra.
 */

/** Fase do backend (`OpportunityState`) — o `backendState` das telas. */
export type EstadoBackend =
  | 'NOVOS'
  | 'EM_PREENCHIMENTO'
  | 'EM_ANALISE'
  | 'EM_APROVACAO'
  | 'EM_MINUTA'
  | 'EM_ASSINATURA'
  | 'EM_PAGAMENTO'
  | 'CONCLUIDA';

/** Fase da LISTAGEM (`FaseAtual`) — 8 valores; Ativação × Pagamento vêm do contrato. */
export type FaseListagem =
  | 'PREENCHIMENTO'
  | 'ANALISE'
  | 'APROVACAO'
  | 'MINUTA'
  | 'ASSINATURA'
  | 'ATIVACAO'
  | 'PAGAMENTO'
  | 'CONCLUIDA';

/** Status grosso (`OpportunityStatus`) — o "Quadro" e o stepper. */
export type StatusGrosso = 'preenchimento' | 'análise' | 'aprovação' | 'contrato' | 'concluída';

export interface ClienteElenco {
  sapCode: string;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  cidade: string;
  uf: string;
  grupoEconomico: string;
  bandeira: string;
  /** No Mapa da Rede (posto ativo da rede Vibra). */
  naRede: boolean;
}

export const CLIENTES: ClienteElenco[] = [
  {
    sapCode: '900101',
    razaoSocial: 'Auto Posto Horizonte Azul Ltda',
    nomeFantasia: 'Posto Horizonte Azul',
    cnpj: '11.222.333/0001-00',
    cidade: 'Campinas',
    uf: 'SP',
    grupoEconomico: '7001 · Grupo Horizonte',
    bandeira: 'Petrobras',
    naRede: true,
  },
  {
    sapCode: '900102',
    razaoSocial: 'Comercial de Combustíveis Serra Verde S.A.',
    nomeFantasia: 'Posto Serra Verde',
    cnpj: '22.333.444/0001-00',
    cidade: 'Belo Horizonte',
    uf: 'MG',
    grupoEconomico: '7002 · Rede Serra Verde',
    bandeira: 'Petrobras',
    naRede: true,
  },
  {
    sapCode: '900103',
    razaoSocial: 'Posto Litoral Sul Comércio de Derivados Ltda',
    nomeFantasia: 'Posto Litoral Sul',
    cnpj: '33.444.555/0001-00',
    cidade: 'Florianópolis',
    uf: 'SC',
    grupoEconomico: '7003 · Grupo Litoral',
    bandeira: 'Bandeira branca',
    naRede: false,
  },
  {
    sapCode: '900104',
    razaoSocial: 'Rodoposto Cerrado Norte Ltda',
    nomeFantasia: 'Rodoposto Cerrado',
    cnpj: '44.555.666/0001-00',
    cidade: 'Goiânia',
    uf: 'GO',
    grupoEconomico: '7004 · Cerrado Participações',
    bandeira: 'Petrobras',
    naRede: true,
  },
  {
    sapCode: '900105',
    razaoSocial: 'Auto Posto Baía Formosa Eireli',
    nomeFantasia: 'Posto Baía Formosa',
    cnpj: '55.666.777/0001-00',
    cidade: 'Salvador',
    uf: 'BA',
    grupoEconomico: '7005 · Grupo Baía',
    bandeira: 'Petrobras',
    naRede: true,
  },
  {
    sapCode: '900106',
    razaoSocial: 'Posto Vale do Rio Doce Ltda',
    nomeFantasia: 'Posto Vale do Rio',
    cnpj: '66.777.888/0001-00',
    cidade: 'Vitória',
    uf: 'ES',
    grupoEconomico: '7006 · Vale Combustíveis',
    bandeira: 'Petrobras',
    naRede: true,
  },
  {
    sapCode: '900107',
    razaoSocial: 'Centro Automotivo Planalto Ltda',
    nomeFantasia: 'Posto Planalto',
    cnpj: '77.888.999/0001-00',
    cidade: 'Brasília',
    uf: 'DF',
    grupoEconomico: '7007 · Grupo Planalto',
    bandeira: 'Petrobras',
    naRede: true,
  },
  {
    sapCode: '900108',
    razaoSocial: 'Posto Pampa Gaúcho Comércio Ltda',
    nomeFantasia: 'Posto Pampa',
    cnpj: '88.999.000/0001-00',
    cidade: 'Porto Alegre',
    uf: 'RS',
    grupoEconomico: '7008 · Pampa Energia',
    bandeira: 'Petrobras',
    naRede: true,
  },
];

export type TipoPropostaElenco = 'PCR' | 'ZBRM' | 'ZLUB';

export interface PropostaElenco {
  id: string;
  /** Código de negócio exibido (`PCR-GOP-00000001/2026`). */
  codigo: string;
  tipo: TipoPropostaElenco;
  /** `ProposalStatus` — EM_PREENCHIMENTO | EM_ANALISE | DEVOLVIDA. */
  status: 'EM_PREENCHIMENTO' | 'EM_ANALISE' | 'DEVOLVIDA';
  /** Proposta eleita (a que segue para aprovação/contrato). */
  eleita: boolean;
  valorEstimado: number;
}

export interface OportunidadeElenco {
  id: string;
  code: string;
  titulo: string;
  clienteSap: string;
  estado: EstadoBackend;
  fase: FaseListagem;
  status: StatusGrosso;
  /** Finalidade (picklist) — ex.: "Vinculação de bandeira", "Renovação contratual". */
  finalidade: string;
  /** `Posto` (PCR) ou `Franquia`. */
  tipo: 'Posto' | 'Franquia';
  /** Id do LT principal (ver `PERFIS` em `core/session.ts`). */
  ltId: string;
  /** Analista SNEG atribuído (a partir da análise). */
  analistaSnegId: string | null;
  valorEstimado: number;
  vmm: number;
  criadaEm: string;
  propostas: PropostaElenco[];
  /** Uma frase: o que este cenário existe para mostrar. Aparece em `/prototipo`. */
  cenario: string;
}

const LT = 'usr-lt-ana';
const SNEG = 'usr-sneg-carla';

export const OPORTUNIDADES: OportunidadeElenco[] = [
  {
    id: 'opp-001',
    code: 'OPP-0001',
    titulo: 'Posto Horizonte Azul · Vinculação de bandeira',
    clienteSap: '900101',
    estado: 'EM_PREENCHIMENTO',
    fase: 'PREENCHIMENTO',
    status: 'preenchimento',
    finalidade: 'Vinculação de bandeira',
    tipo: 'Posto',
    ltId: LT,
    analistaSnegId: null,
    valorEstimado: 1_850_000,
    vmm: 320,
    criadaEm: '2026-09-22T13:10:00Z',
    propostas: [
      { id: 'prp-001a', codigo: 'PCR-GOP-00000101/2026', tipo: 'PCR', status: 'EM_PREENCHIMENTO', eleita: false, valorEstimado: 1_850_000 },
    ],
    cenario: 'Recém-criada: proposta em preenchimento, checklist incompleto, GATE 1 bloqueado.',
  },
  {
    id: 'opp-002',
    code: 'OPP-0002',
    titulo: 'Posto Serra Verde · Renovação contratual',
    clienteSap: '900102',
    estado: 'EM_PREENCHIMENTO',
    fase: 'PREENCHIMENTO',
    status: 'preenchimento',
    finalidade: 'Renovação contratual',
    tipo: 'Posto',
    ltId: LT,
    analistaSnegId: null,
    valorEstimado: 3_200_000,
    vmm: 540,
    criadaEm: '2026-09-10T11:00:00Z',
    propostas: [
      // Eleita: o GATE 1 exige proposta eleita, e este é o cenário "pronta para o GATE 1".
      { id: 'prp-002a', codigo: 'PCR-GOP-00000102/2026', tipo: 'PCR', status: 'EM_PREENCHIMENTO', eleita: true, valorEstimado: 3_200_000 },
      { id: 'prp-002b', codigo: 'PCR-GOP-00000103/2026', tipo: 'PCR', status: 'EM_PREENCHIMENTO', eleita: false, valorEstimado: 2_900_000 },
    ],
    cenario: 'Pronta para o GATE 1: duas propostas completas (comparação de cenários), checklist ok.',
  },
  {
    id: 'opp-003',
    code: 'OPP-0003',
    titulo: 'Posto Litoral Sul · Embandeiramento',
    clienteSap: '900103',
    estado: 'EM_ANALISE',
    fase: 'ANALISE',
    status: 'análise',
    finalidade: 'Embandeiramento',
    tipo: 'Posto',
    ltId: LT,
    analistaSnegId: SNEG,
    valorEstimado: 4_750_000,
    vmm: 610,
    criadaEm: '2026-08-28T14:30:00Z',
    propostas: [
      { id: 'prp-003a', codigo: 'PCR-GOP-00000104/2026', tipo: 'PCR', status: 'EM_ANALISE', eleita: true, valorEstimado: 4_750_000 },
    ],
    cenario: 'Em análise SNEG: parecer em rascunho, DDI em andamento, garantia em análise prévia na CCOB.',
  },
  {
    id: 'opp-004',
    code: 'OPP-0004',
    titulo: 'Rodoposto Cerrado · Renovação com investimento',
    clienteSap: '900104',
    estado: 'EM_ANALISE',
    fase: 'ANALISE',
    status: 'análise',
    finalidade: 'Renovação contratual',
    tipo: 'Posto',
    ltId: LT,
    analistaSnegId: SNEG,
    valorEstimado: 2_400_000,
    vmm: 450,
    criadaEm: '2026-08-15T10:00:00Z',
    propostas: [
      { id: 'prp-004a', codigo: 'PCR-GOP-00000105/2026', tipo: 'PCR', status: 'DEVOLVIDA', eleita: true, valorEstimado: 2_400_000 },
    ],
    cenario: 'Devolvida ao LT pelo SNEG com motivo e pendência aberta — o LT precisa ajustar e reenviar.',
  },
  {
    id: 'opp-005',
    code: 'OPP-0005',
    titulo: 'Posto Baía Formosa · Franquia BR Mania',
    clienteSap: '900105',
    estado: 'EM_ANALISE',
    fase: 'ANALISE',
    status: 'análise',
    finalidade: 'Franquia',
    tipo: 'Franquia',
    ltId: LT,
    analistaSnegId: SNEG,
    valorEstimado: 980_000,
    vmm: 280,
    criadaEm: '2026-08-20T09:00:00Z',
    propostas: [
      { id: 'prp-005a', codigo: 'PCR-GOP-00000106/2026', tipo: 'PCR', status: 'EM_ANALISE', eleita: true, valorEstimado: 780_000 },
      { id: 'prp-005b', codigo: 'ZBRM-GOP-00000011/2026', tipo: 'ZBRM', status: 'EM_ANALISE', eleita: true, valorEstimado: 200_000 },
    ],
    cenario: 'Franquia BR Mania: proposta ZBRM com royalties, exceções e parecer do Gestor de Franquias.',
  },
  {
    id: 'opp-006',
    code: 'OPP-0006',
    titulo: 'Posto Vale do Rio · Vinculação de bandeira',
    clienteSap: '900106',
    estado: 'EM_APROVACAO',
    fase: 'APROVACAO',
    status: 'aprovação',
    finalidade: 'Vinculação de bandeira',
    tipo: 'Posto',
    ltId: LT,
    analistaSnegId: SNEG,
    valorEstimado: 5_600_000,
    vmm: 720,
    criadaEm: '2026-07-30T15:00:00Z',
    propostas: [
      { id: 'prp-006a', codigo: 'PCR-GOP-00000107/2026', tipo: 'PCR', status: 'EM_ANALISE', eleita: true, valorEstimado: 5_600_000 },
    ],
    cenario: 'Em aprovação: alçada acionada, aprovadores em sequência (Gerente Varejo aprovou, BP pendente).',
  },
  {
    id: 'opp-007',
    code: 'OPP-0007',
    titulo: 'Posto Planalto · Renovação contratual',
    clienteSap: '900107',
    estado: 'EM_MINUTA',
    fase: 'MINUTA',
    status: 'contrato',
    finalidade: 'Renovação contratual',
    tipo: 'Posto',
    ltId: LT,
    analistaSnegId: SNEG,
    valorEstimado: 3_900_000,
    vmm: 500,
    criadaEm: '2026-07-12T10:00:00Z',
    propostas: [
      { id: 'prp-007a', codigo: 'PCR-GOP-00000108/2026', tipo: 'PCR', status: 'EM_ANALISE', eleita: true, valorEstimado: 3_900_000 },
    ],
    cenario: 'Em minuta: minutas geradas (CPCVM e Mútuo), uma pendente de anexo, SPCOM atribuído.',
  },
  {
    id: 'opp-008',
    code: 'OPP-0008',
    titulo: 'Posto Pampa · Embandeiramento com obra',
    clienteSap: '900108',
    estado: 'EM_ASSINATURA',
    fase: 'ASSINATURA',
    status: 'contrato',
    finalidade: 'Embandeiramento',
    tipo: 'Posto',
    ltId: LT,
    analistaSnegId: SNEG,
    valorEstimado: 6_300_000,
    vmm: 830,
    criadaEm: '2026-06-25T13:00:00Z',
    propostas: [
      { id: 'prp-008a', codigo: 'PCR-GOP-00000109/2026', tipo: 'PCR', status: 'EM_ANALISE', eleita: true, valorEstimado: 6_300_000 },
    ],
    cenario: 'Em assinatura: envelope DocuSign enviado, 2 de 4 signatários assinaram; obra vinculada no Converge.',
  },
  {
    id: 'opp-009',
    code: 'OPP-0009',
    titulo: 'Posto Horizonte Azul · Ampliação de pista',
    clienteSap: '900101',
    estado: 'EM_PAGAMENTO',
    fase: 'PAGAMENTO',
    status: 'contrato',
    finalidade: 'Renovação contratual',
    tipo: 'Posto',
    ltId: LT,
    analistaSnegId: SNEG,
    valorEstimado: 2_100_000,
    vmm: 380,
    criadaEm: '2026-05-18T09:30:00Z',
    propostas: [
      { id: 'prp-009a', codigo: 'PCR-GOP-00000110/2026', tipo: 'PCR', status: 'EM_ANALISE', eleita: true, valorEstimado: 2_100_000 },
    ],
    cenario: 'Em pagamento: contrato assinado, contratos ativados no Salesforce, liberação de pagamento em curso.',
  },
  {
    id: 'opp-010',
    code: 'OPP-0010',
    titulo: 'Posto Serra Verde · Vinculação de bandeira',
    clienteSap: '900102',
    estado: 'CONCLUIDA',
    fase: 'CONCLUIDA',
    status: 'concluída',
    finalidade: 'Vinculação de bandeira',
    tipo: 'Posto',
    ltId: LT,
    analistaSnegId: SNEG,
    valorEstimado: 4_200_000,
    vmm: 600,
    criadaEm: '2026-03-02T10:00:00Z',
    propostas: [
      { id: 'prp-010a', codigo: 'PCR-GOP-00000111/2026', tipo: 'PCR', status: 'EM_ANALISE', eleita: true, valorEstimado: 4_200_000 },
    ],
    cenario: 'Concluída: trilha inteira percorrida, somente leitura, trilha de auditoria completa.',
  },
];

export function oportunidadePorId(id: string): OportunidadeElenco | undefined {
  return OPORTUNIDADES.find((o) => o.id === id);
}

export function clientePorSap(sap: string): ClienteElenco | undefined {
  return CLIENTES.find((c) => c.sapCode === sap);
}

export function propostaPorId(
  id: string,
): { proposta: PropostaElenco; oportunidade: OportunidadeElenco } | undefined {
  for (const o of OPORTUNIDADES) {
    const p = o.propostas.find((x) => x.id === id);
    if (p) return { proposta: p, oportunidade: o };
  }
  return undefined;
}
