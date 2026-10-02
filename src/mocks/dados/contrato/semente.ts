import type { CadeiaAprovacao } from '@/lib/contratos/contrato-mapping';

import type {
  ContratoInt,
  EstadoContrato,
  MinutaInt,
  PacoteInt,
  SignatarioInt,
  TipoDocumento,
} from './modelo';

/**
 * Semente do contrato das oportunidades que JÁ estão na fase de contrato no
 * elenco (opp-007 a opp-010). Quem entrar na fase depois (opp-006 aprovada, por
 * exemplo) ganha o pacote inicial por {@link pacoteInicial}, na primeira leitura.
 *
 * Tudo fictício: nomes, e-mails, números de contrato e ids de envelope.
 */

const LT_NOME = 'Ana Ribeiro';
const LT_EMAIL = 'ana.ribeiro@exemplo.com.br';

function cadeiaAprovada(gvEm: string, bpEm: string): CadeiaAprovacao {
  return {
    outcome: 'APROVADA',
    outcomeLabel: 'Aprovada',
    pill: 's',
    lidoEm: bpEm,
    niveis: [
      {
        ator: 'Henrique Barros · Gerente Varejo',
        status: 'APROVADO',
        statusLabel: 'Aprovado',
        pill: 's',
        concluidaEm: gvEm,
        comentario: 'De acordo com a política comercial vigente.',
      },
      {
        ator: 'Bruno Carvalho · BP Financeiro',
        status: 'APROVADO',
        statusLabel: 'Aprovado',
        pill: 's',
        concluidaEm: bpEm,
        comentario: null,
      },
    ],
  };
}

function contrato(
  opp: string,
  tipo: TipoDocumento,
  papel: ContratoInt['papel'],
  etapa: ContratoInt['etapa'],
  extra: Partial<ContratoInt> = {},
): ContratoInt {
  return {
    id: `ctr-${opp}-${tipo.toLowerCase().replace(/_/g, '-')}`,
    tipo,
    papel,
    etapa,
    codigoExterno: null,
    estadoExterno: null,
    minutaPadrao: true,
    ...extra,
  };
}

function minuta(c: ContratoInt, extra: Partial<MinutaInt>): MinutaInt {
  return {
    id: `min-${c.id.slice(4)}-v1`,
    contractId: c.id,
    versao: 1,
    status: 'GERADA',
    origem: 'UPLOAD_MANUAL',
    netlexConsultaCodigo: null,
    fileName: null,
    atualizadoEm: '2026-09-18T14:00:00Z',
    ...extra,
  };
}

function signatario(
  pacote: string,
  ordem: number,
  papel: SignatarioInt['papel'],
  nome: string,
  email: string,
  status: SignatarioInt['status'],
  assinadoEm: string | null = null,
): SignatarioInt {
  return {
    id: `sgn-${pacote}-${ordem}`,
    ordem,
    papel,
    nome,
    email,
    status,
    assinadoEm,
    ultimoLembreteEm: null,
  };
}

// ───────────────────────── opp-007 · em minuta ─────────────────────────────
// CPCVM e Mútuo já anexadas; o CLUM é o slot vazio ("pendente de anexo").
const c007cpcvm = contrato('007', 'CPCVM', 'PRINCIPAL', 'MINUTA', {
  codigoExterno: '00961011',
  estadoExterno: 'EM_ELABORACAO',
  minutaPadrao: false,
});
const c007clum = contrato('007', 'CLUM', 'PRINCIPAL', 'MINUTA', {
  codigoExterno: '00961012',
  estadoExterno: 'EM_ELABORACAO',
});
const c007mutuo = contrato('007', 'MUTUO_DINHEIRO', 'ACESSORIO', 'MINUTA', {
  codigoExterno: '00961013',
  estadoExterno: 'EM_ELABORACAO',
});

const opp007: EstadoContrato = {
  oppId: 'opp-007',
  contratos: [c007cpcvm, c007clum, c007mutuo],
  minutas: [
    minuta(c007cpcvm, {
      fileName: 'CPCVM_Posto_Planalto_v1.docx',
      netlexConsultaCodigo: 'NLX-2026-04417',
      atualizadoEm: '2026-09-17T13:20:00Z',
    }),
    minuta(c007clum, { status: 'AGUARDANDO', origem: 'NETLEX_PADRAO', atualizadoEm: '2026-09-15T10:05:00Z' }),
    minuta(c007mutuo, {
      fileName: 'Mutuo_em_Dinheiro_Posto_Planalto.pdf',
      netlexConsultaCodigo: 'NLX-2026-04418',
      atualizadoEm: '2026-09-18T16:40:00Z',
    }),
  ],
  pacotes: [],
  contratosCrm: [
    {
      id: 'crm-007-1',
      numero: '00961011',
      tipo: 'DCVIM Promessa de Compra e Venda',
      status: 'Em Elaboração',
      statusPill: 'n',
      situacao: null,
      vigenciaInicio: null,
      vigenciaFim: null,
    },
    {
      id: 'crm-007-2',
      numero: '00961012',
      tipo: 'DCVIM Licença de Uso de Marca',
      status: 'Em Elaboração',
      statusPill: 'n',
      situacao: null,
      vigenciaInicio: null,
      vigenciaFim: null,
    },
    {
      id: 'crm-007-3',
      numero: '00961013',
      tipo: 'DCVIM Mútuo Espécie',
      status: 'Em Elaboração',
      statusPill: 'n',
      situacao: null,
      vigenciaInicio: null,
      vigenciaFim: null,
    },
    {
      id: 'crm-007-4',
      numero: '00961042',
      tipo: 'DCVIM Comodato',
      status: 'Em Elaboração',
      statusPill: 'n',
      situacao: null,
      vigenciaInicio: null,
      vigenciaFim: null,
    },
  ],
  // O Comodato do org não tem par no de/para — a tela NOMEIA a lacuna.
  lacunas: [{ tipoNoOrg: 'DCVIM Comodato', numero: '00961042' }],
  alteracaoMinutaPadrao: {
    descricao: 'Inclusão de carência de 6 meses para o início da bonificação por volume na CPCVM.',
  },
  atribuicao: {
    analistaId: 'usr-spcom-fabio',
    gerencia: 'Gerência Regional Centro-Oeste',
    atribuidaEm: '2026-09-15T10:00:00Z',
    atribuidaPorNome: 'Distribuição automática',
  },
  ritm: null,
  cadeia: cadeiaAprovada('2026-09-11T15:30:00Z', '2026-09-12T11:05:00Z'),
};

// ──────────────────── opp-008 · em assinatura (2 de 4) ─────────────────────
const c008cpcvm = contrato('008', 'CPCVM', 'PRINCIPAL', 'ASSINATURA', {
  codigoExterno: '00958820',
  estadoExterno: 'EM_ELABORACAO',
});
const c008clum = contrato('008', 'CLUM', 'PRINCIPAL', 'ASSINATURA', {
  codigoExterno: '00958821',
  estadoExterno: 'EM_ELABORACAO',
});
const c008mutuo = contrato('008', 'MUTUO_DINHEIRO', 'ACESSORIO', 'ASSINATURA', {
  codigoExterno: '00958822',
  estadoExterno: 'EM_ELABORACAO',
});
// O Termo de Cessão existe porque há obra vinculada por recursos financeiros.
const c008termo = contrato('008', 'TERMO_CESSAO_CREDITO', 'ACESSORIO', 'ASSINATURA', {
  minutaPadrao: false,
});

const pacote008: PacoteInt = {
  id: 'env-008-1',
  envelopeExternoId: '7c2e91d4-5b3a-4f08-9d61-0a8e3f2b6c19',
  sequencia: 1,
  status: 'SENT',
  documentosCount: 4,
  criadoEm: '2026-09-22T13:40:00Z',
  enviadoEm: '2026-09-22T13:52:00Z',
  concluidoEm: null,
  motivoAnulacao: null,
  signatarios: [
    signatario('env-008-1', 1, 'LT', LT_NOME, LT_EMAIL, 'ASSINADO', '2026-09-22T16:10:00Z'),
    signatario(
      'env-008-1',
      2,
      'CLIENTE',
      'Rogério Vasconcelos',
      'rogerio.vasconcelos@postopampa.exemplo.com.br',
      'ASSINADO',
      '2026-09-24T09:32:00Z',
    ),
    signatario('env-008-1', 3, 'REPRESENTANTE_VIBRA', 'Henrique Barros', 'henrique.barros@exemplo.com.br', 'PENDENTE'),
    signatario('env-008-1', 4, 'TESTEMUNHA', 'Patrícia Lemos', 'patricia.lemos@exemplo.com.br', 'AGUARDANDO'),
  ],
};

const opp008: EstadoContrato = {
  oppId: 'opp-008',
  contratos: [c008cpcvm, c008clum, c008mutuo, c008termo],
  minutas: [
    minuta(c008cpcvm, {
      fileName: 'CPCVM_Posto_Pampa.docx',
      netlexConsultaCodigo: 'NLX-2026-04102',
      atualizadoEm: '2026-09-19T11:00:00Z',
    }),
    minuta(c008clum, {
      fileName: 'CLUM_Posto_Pampa.docx',
      netlexConsultaCodigo: 'NLX-2026-04103',
      atualizadoEm: '2026-09-19T11:05:00Z',
    }),
    minuta(c008mutuo, {
      fileName: 'Mutuo_em_Dinheiro_Posto_Pampa.pdf',
      netlexConsultaCodigo: 'NLX-2026-04104',
      atualizadoEm: '2026-09-19T11:12:00Z',
    }),
    minuta(c008termo, {
      fileName: 'Termo_de_Cessao_Obra_5821.pdf',
      atualizadoEm: '2026-09-20T09:45:00Z',
    }),
  ],
  pacotes: [pacote008],
  contratosCrm: [
    {
      id: 'crm-008-1',
      numero: '00958820',
      tipo: 'DCVIM Promessa de Compra e Venda',
      status: 'Em Elaboração',
      statusPill: 'n',
      situacao: null,
      vigenciaInicio: null,
      vigenciaFim: null,
    },
    {
      id: 'crm-008-2',
      numero: '00958821',
      tipo: 'DCVIM Licença de Uso de Marca',
      status: 'Em Elaboração',
      statusPill: 'n',
      situacao: null,
      vigenciaInicio: null,
      vigenciaFim: null,
    },
    {
      id: 'crm-008-3',
      numero: '00958822',
      tipo: 'DCVIM Mútuo Espécie',
      status: 'Em Elaboração',
      statusPill: 'n',
      situacao: null,
      vigenciaInicio: null,
      vigenciaFim: null,
    },
  ],
  lacunas: [],
  alteracaoMinutaPadrao: null,
  atribuicao: {
    analistaId: 'usr-sneg-carla',
    gerencia: 'Gerência Regional Sul',
    atribuidaEm: '2026-09-16T09:00:00Z',
    atribuidaPorNome: 'Distribuição automática',
  },
  ritm: null,
  cadeia: cadeiaAprovada('2026-09-08T14:00:00Z', '2026-09-09T10:20:00Z'),
};

// ───────────── opp-009 · em pagamento (contratos ativos no org) ─────────────
const c009cpcvm = contrato('009', 'CPCVM', 'PRINCIPAL', 'CADASTRO', {
  codigoExterno: '00951107',
  estadoExterno: 'ATIVO',
});
const c009mutuo = contrato('009', 'MUTUO_DINHEIRO', 'ACESSORIO', 'CADASTRO', {
  codigoExterno: '00951108',
  estadoExterno: 'ATIVO',
});
const c009termo = contrato('009', 'TERMO_CESSAO_CREDITO', 'ACESSORIO', 'CADASTRO', {
  minutaPadrao: false,
  estadoExterno: 'ATIVO',
});

const pacote009: PacoteInt = {
  id: 'env-009-1',
  envelopeExternoId: '3f8b0c6a-91d2-4e57-b8a3-6d14c0e9f271',
  sequencia: 1,
  status: 'COMPLETED',
  documentosCount: 3,
  criadoEm: '2026-08-14T10:00:00Z',
  enviadoEm: '2026-08-14T10:12:00Z',
  concluidoEm: '2026-08-20T17:45:00Z',
  motivoAnulacao: null,
  signatarios: [
    signatario('env-009-1', 1, 'LT', LT_NOME, LT_EMAIL, 'ASSINADO', '2026-08-14T15:00:00Z'),
    signatario(
      'env-009-1',
      2,
      'CLIENTE',
      'Marcelo Antunes',
      'marcelo.antunes@postohorizonte.exemplo.com.br',
      'ASSINADO',
      '2026-08-17T10:20:00Z',
    ),
    signatario('env-009-1', 3, 'REPRESENTANTE_VIBRA', 'Henrique Barros', 'henrique.barros@exemplo.com.br', 'ASSINADO', '2026-08-19T09:00:00Z'),
    signatario('env-009-1', 4, 'TESTEMUNHA', 'Otávio Freitas', 'otavio.freitas@exemplo.com.br', 'ASSINADO', '2026-08-20T17:45:00Z'),
  ],
};

const pacote009Hom: PacoteInt = {
  id: 'env-009-2',
  envelopeExternoId: 'b51d7e20-4c3f-4a9e-8e07-2f6a9d1c5b84',
  sequencia: 2,
  status: 'COMPLETED',
  documentosCount: 1,
  criadoEm: '2026-08-24T09:00:00Z',
  enviadoEm: '2026-08-24T09:08:00Z',
  concluidoEm: '2026-08-28T14:30:00Z',
  motivoAnulacao: null,
  signatarios: [
    signatario(
      'env-009-2',
      1,
      'HOMOLOGADA',
      'Construtora Ponte Alta Ltda — Sérgio Lima',
      'sergio.lima@pontealta.exemplo.com.br',
      'ASSINADO',
      '2026-08-28T14:30:00Z',
    ),
  ],
};

const opp009: EstadoContrato = {
  oppId: 'opp-009',
  contratos: [c009cpcvm, c009mutuo, c009termo],
  minutas: [
    minuta(c009cpcvm, { status: 'ASSINADA', fileName: 'CPCVM_Horizonte_Azul_Ampliacao.docx', atualizadoEm: '2026-08-12T10:00:00Z' }),
    minuta(c009mutuo, { status: 'ASSINADA', fileName: 'Mutuo_Horizonte_Azul.pdf', atualizadoEm: '2026-08-12T10:10:00Z' }),
    minuta(c009termo, { status: 'ASSINADA', fileName: 'Termo_de_Cessao_Obra_5307.pdf', atualizadoEm: '2026-08-13T08:30:00Z' }),
  ],
  pacotes: [pacote009, pacote009Hom],
  contratosCrm: [
    {
      id: 'crm-009-1',
      numero: '00951107',
      tipo: 'DCVIM Promessa de Compra e Venda',
      status: 'Ativado',
      statusPill: 's',
      situacao: 'Vigente',
      vigenciaInicio: '2026-09-01',
      vigenciaFim: '2031-08-31',
    },
    {
      id: 'crm-009-2',
      numero: '00951108',
      tipo: 'DCVIM Mútuo Espécie',
      status: 'Ativado',
      statusPill: 's',
      situacao: 'Aguardando liberação de pagamento',
      vigenciaInicio: '2026-09-01',
      vigenciaFim: '2029-08-31',
    },
  ],
  lacunas: [],
  alteracaoMinutaPadrao: null,
  atribuicao: {
    analistaId: 'usr-sneg-carla',
    gerencia: 'Gerência Regional São Paulo Interior',
    atribuidaEm: '2026-08-05T09:00:00Z',
    atribuidaPorNome: 'Distribuição automática',
  },
  ritm: { ticketId: 'RITM0048213', statusLabel: 'Em atendimento' },
  cadeia: cadeiaAprovada('2026-07-30T15:00:00Z', '2026-07-31T09:40:00Z'),
};

// ───────────────────────── opp-010 · concluída ─────────────────────────────
const c010cpcvm = contrato('010', 'CPCVM', 'PRINCIPAL', 'CADASTRO', {
  codigoExterno: '00932250',
  estadoExterno: 'ATIVO',
});
const c010clum = contrato('010', 'CLUM', 'PRINCIPAL', 'CADASTRO', {
  codigoExterno: '00932251',
  estadoExterno: 'ATIVO',
});
const c010bonif = contrato('010', 'NOVO_MUTUO', 'ACESSORIO', 'CADASTRO', {
  codigoExterno: '00932252',
  estadoExterno: 'ATIVO',
});

const pacote010: PacoteInt = {
  id: 'env-010-1',
  envelopeExternoId: 'e04a6b9c-27f1-4d38-a5c2-8b93f61d0e47',
  sequencia: 1,
  status: 'COMPLETED',
  documentosCount: 3,
  criadoEm: '2026-04-27T10:00:00Z',
  enviadoEm: '2026-04-27T10:15:00Z',
  concluidoEm: '2026-05-04T16:20:00Z',
  motivoAnulacao: null,
  signatarios: [
    signatario('env-010-1', 1, 'LT', LT_NOME, LT_EMAIL, 'ASSINADO', '2026-04-27T14:00:00Z'),
    signatario(
      'env-010-1',
      2,
      'CLIENTE',
      'Luciana Prates',
      'luciana.prates@postoserraverde.exemplo.com.br',
      'ASSINADO',
      '2026-04-29T11:00:00Z',
    ),
    signatario('env-010-1', 3, 'REPRESENTANTE_VIBRA', 'Henrique Barros', 'henrique.barros@exemplo.com.br', 'ASSINADO', '2026-05-02T09:30:00Z'),
    signatario('env-010-1', 4, 'TESTEMUNHA', 'Patrícia Lemos', 'patricia.lemos@exemplo.com.br', 'ASSINADO', '2026-05-04T16:20:00Z'),
  ],
};

const opp010: EstadoContrato = {
  oppId: 'opp-010',
  contratos: [c010cpcvm, c010clum, c010bonif],
  minutas: [
    minuta(c010cpcvm, { status: 'ASSINADA', origem: 'NETLEX_PADRAO', fileName: 'CPCVM_Serra_Verde.docx', atualizadoEm: '2026-04-22T10:00:00Z' }),
    minuta(c010clum, { status: 'ASSINADA', origem: 'NETLEX_PADRAO', fileName: 'CLUM_Serra_Verde.docx', atualizadoEm: '2026-04-22T10:05:00Z' }),
    minuta(c010bonif, { status: 'ASSINADA', fileName: 'Novo_Mutuo_Serra_Verde.pdf', atualizadoEm: '2026-04-23T15:00:00Z' }),
  ],
  pacotes: [pacote010],
  contratosCrm: [
    {
      id: 'crm-010-1',
      numero: '00932250',
      tipo: 'DCVIM Promessa de Compra e Venda',
      status: 'Ativado',
      statusPill: 's',
      situacao: 'Vigente',
      vigenciaInicio: '2026-05-15',
      vigenciaFim: '2031-05-14',
    },
    {
      id: 'crm-010-2',
      numero: '00932251',
      tipo: 'DCVIM Licença de Uso de Marca',
      status: 'Ativado',
      statusPill: 's',
      situacao: 'Vigente',
      vigenciaInicio: '2026-05-15',
      vigenciaFim: '2031-05-14',
    },
    {
      id: 'crm-010-3',
      numero: '00932252',
      tipo: 'DCVIM Novo Mútuo',
      status: 'Ativado',
      statusPill: 's',
      situacao: 'Vigente',
      vigenciaInicio: '2026-05-15',
      vigenciaFim: '2028-05-14',
    },
  ],
  lacunas: [],
  alteracaoMinutaPadrao: null,
  atribuicao: {
    analistaId: 'usr-sneg-carla',
    gerencia: 'Gerência Regional Minas Gerais',
    atribuidaEm: '2026-04-15T09:00:00Z',
    atribuidaPorNome: 'Distribuição automática',
  },
  ritm: { ticketId: 'RITM0031876', statusLabel: 'Encerrado' },
  cadeia: cadeiaAprovada('2026-04-08T15:00:00Z', '2026-04-09T10:00:00Z'),
};

export const SEMENTE_CONTRATOS: Record<string, EstadoContrato> = {
  'opp-007': opp007,
  'opp-008': opp008,
  'opp-009': opp009,
  'opp-010': opp010,
};

/**
 * Pacote de quem entra na fase de minuta depois da semente: os contratos que o
 * backend derivaria das propostas eleitas, todos com o slot vazio — a minuta
 * entra por "+ Adicionar documento" (a geração automática está desativada).
 */
export function pacoteInicial(
  oppId: string,
  tipoOpp: 'Posto' | 'Franquia',
  analistaId: string | null,
  agora: string,
): EstadoContrato {
  const sufixo = oppId.replace(/^opp-/, '');
  const tipos: TipoDocumento[] = tipoOpp === 'Franquia' ? ['CPCVM', 'BR_MANIA'] : ['CPCVM', 'CLUM'];
  const contratos = tipos.map((t) => contrato(sufixo, t, 'PRINCIPAL', 'MINUTA'));
  return {
    oppId,
    contratos,
    minutas: contratos.map((c) =>
      minuta(c, { status: 'AGUARDANDO', origem: 'NETLEX_PADRAO', atualizadoEm: agora }),
    ),
    pacotes: [],
    contratosCrm: [],
    lacunas: [],
    alteracaoMinutaPadrao: null,
    atribuicao: {
      analistaId,
      gerencia: 'Gerência Regional',
      atribuidaEm: analistaId ? agora : null,
      atribuidaPorNome: analistaId ? 'Distribuição automática' : null,
    },
    ritm: null,
    cadeia: null,
  };
}

/** Signatários padrão quando o envelope nasce sem formulário (transição feita por outra tela). */
export function signatariosPadrao(pacoteId: string, ltNome: string, ltEmail: string): SignatarioInt[] {
  return [
    signatario(pacoteId, 1, 'LT', ltNome, ltEmail, 'AGUARDANDO'),
    signatario(pacoteId, 2, 'CLIENTE', 'Sócio administrador', 'socio@cliente.exemplo.com.br', 'AGUARDANDO'),
    signatario(pacoteId, 3, 'REPRESENTANTE_VIBRA', 'Henrique Barros', 'henrique.barros@exemplo.com.br', 'AGUARDANDO'),
    signatario(pacoteId, 4, 'TESTEMUNHA', 'Patrícia Lemos', 'patricia.lemos@exemplo.com.br', 'AGUARDANDO'),
  ];
}

export { signatario as novoSignatario };
