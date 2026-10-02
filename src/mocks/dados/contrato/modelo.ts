import type {
  AvisoAlteracaoMinutaPadrao,
  CadeiaAprovacao,
  ContratoCrmItem,
  LacunaDeMinuta,
} from '@/lib/contratos/contrato-mapping';

/**
 * Modelo INTERNO do mock do contrato — o "banco" do protótipo.
 *
 * As telas nunca veem estes tipos: o handler (`handlers/contrato.ts`) compõe a
 * partir deles o read model no tipo do front (`ContratoReadModel`), do mesmo
 * jeito que o `ContratoReadModelService` do backend compõe a partir das
 * entidades. Os vocabulários (status, papel, tipo) são os do backend.
 */

export type EtapaContratoInt = 'MINUTA' | 'ASSINATURA' | 'CADASTRO' | 'ATIVACAO' | 'PAGAMENTO';

export type TipoDocumento =
  | 'CPCVM'
  | 'CLUM'
  | 'CLUM_GNV'
  | 'BR_MANIA'
  | 'LUBRAX'
  | 'ANTECIPACAO'
  | 'BONIFICACAO'
  | 'TERMO_ADESAO_PIM'
  | 'TERMO_CESSAO_CREDITO'
  | 'ANTECIPACAO_CONCESSAO_FINANCEIRA_BR_MANIA'
  | 'MUTUO_DINHEIRO'
  | 'NOVO_MUTUO'
  | 'TERMO_ADITIVO';

/** Espelho de `TIPO_CONTRATO_DOCUMENTO_LABEL` do backend — a ordem é a do enum. */
export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumento, string> = {
  CPCVM: 'CPCVM — Promessa de Compra e Venda Mercantil',
  CLUM: 'CLUM — Contrato de Licença de Uso de Marca',
  CLUM_GNV: 'CLUM GNV — Contrato de Licença de Uso de Marca (GNV)',
  BR_MANIA: 'BR Mania',
  LUBRAX: 'Lubrax',
  ANTECIPACAO: 'Antecipação de Concessão Financeira',
  BONIFICACAO: 'Bonificação',
  TERMO_ADESAO_PIM: 'Termo de Adesão PIM',
  TERMO_CESSAO_CREDITO: 'Termo de Cessão',
  ANTECIPACAO_CONCESSAO_FINANCEIRA_BR_MANIA: 'Antecipação de Concessão Financeira BR Mania',
  MUTUO_DINHEIRO: 'Mútuo em Dinheiro',
  NOVO_MUTUO: 'Novo Mútuo',
  TERMO_ADITIVO: 'Termo Aditivo',
};

export const TIPOS_DOCUMENTO = Object.keys(TIPO_DOCUMENTO_LABEL) as TipoDocumento[];

/** Instrumentos que exigem liberação de pagamento (22/09/2026). */
export const TIPOS_COM_PAGAMENTO: readonly TipoDocumento[] = [
  'MUTUO_DINHEIRO',
  'NOVO_MUTUO',
  'ANTECIPACAO',
  'ANTECIPACAO_CONCESSAO_FINANCEIRA_BR_MANIA',
];

export type PapelContrato = 'PRINCIPAL' | 'ACESSORIO';
export const PAPEL_CONTRATO_LABEL: Record<PapelContrato, string> = {
  PRINCIPAL: 'Principal',
  ACESSORIO: 'Acessório',
};

export type EstadoExterno = 'EM_ELABORACAO' | 'ATIVO' | 'APTO_PARA_PAGAMENTO' | 'PENDENTE';
export const ESTADO_EXTERNO_LABEL: Record<EstadoExterno, string> = {
  EM_ELABORACAO: 'Em Elaboração',
  ATIVO: 'Ativo',
  APTO_PARA_PAGAMENTO: 'Apto para Pagamento',
  PENDENTE: 'Pendente',
};
export const ESTADO_EXTERNO_PILL: Record<EstadoExterno, string> = {
  EM_ELABORACAO: 'n',
  ATIVO: 's',
  APTO_PARA_PAGAMENTO: 's',
  PENDENTE: 'w',
};

export type StatusMinutaInt =
  | 'PENDENTE'
  | 'AGUARDANDO'
  | 'GERANDO'
  | 'GERADA'
  | 'SUBSTITUIDA'
  | 'ASSINADA'
  | 'FALHA';
export const STATUS_MINUTA_LABEL_INT: Record<StatusMinutaInt, string> = {
  PENDENTE: 'Pendente',
  AGUARDANDO: 'Aguardando',
  GERANDO: 'Gerando',
  GERADA: 'Gerada',
  SUBSTITUIDA: 'Substituída',
  ASSINADA: 'Assinada',
  FALHA: 'Falha',
};
export const STATUS_MINUTA_PILL_INT: Record<StatusMinutaInt, string> = {
  PENDENTE: 'w',
  AGUARDANDO: 'i',
  GERANDO: 'i',
  GERADA: 's',
  SUBSTITUIDA: 'n',
  ASSINADA: 's',
  FALHA: 'd',
};

export type OrigemMinuta = 'NETLEX_PADRAO' | 'UPLOAD_MANUAL' | 'CONVERGE';

export type StatusEnvelope = 'CREATED' | 'SENT' | 'DELIVERED' | 'COMPLETED' | 'DECLINED' | 'VOIDED';
export const STATUS_ENVELOPE_LABEL: Record<StatusEnvelope, string> = {
  CREATED: 'Criado',
  SENT: 'Em assinatura',
  DELIVERED: 'Entregue',
  COMPLETED: 'Concluído',
  DECLINED: 'Recusado',
  VOIDED: 'Anulado',
};
export const STATUS_ENVELOPE_PILL: Record<StatusEnvelope, 'i' | 'w' | 's' | 'd' | 'n'> = {
  CREATED: 'i',
  SENT: 'w',
  DELIVERED: 'i',
  COMPLETED: 's',
  DECLINED: 'd',
  VOIDED: 'n',
};
/** `COMPLETED` fica "em circulação" de propósito — mesma regra do backend. */
export const EM_CIRCULACAO: readonly StatusEnvelope[] = ['CREATED', 'SENT', 'DELIVERED', 'COMPLETED'];

export type StatusSignatarioInt = 'AGUARDANDO' | 'PENDENTE' | 'ASSINADO' | 'RECUSADO';
export const STATUS_SIGNATARIO_LABEL_INT: Record<StatusSignatarioInt, string> = {
  AGUARDANDO: 'Aguardando',
  PENDENTE: 'Pendente',
  ASSINADO: 'Assinado',
  RECUSADO: 'Recusado',
};
export const STATUS_SIGNATARIO_PILL_INT: Record<StatusSignatarioInt, 'i' | 'w' | 's' | 'd'> = {
  AGUARDANDO: 'i',
  PENDENTE: 'w',
  ASSINADO: 's',
  RECUSADO: 'd',
};

export type PapelSignatarioInt = 'LT' | 'CLIENTE' | 'REPRESENTANTE_VIBRA' | 'TESTEMUNHA' | 'HOMOLOGADA';
export const PAPEL_SIGNATARIO_LABEL_INT: Record<PapelSignatarioInt, string> = {
  LT: 'LT',
  CLIENTE: 'Cliente',
  REPRESENTANTE_VIBRA: 'Representante Vibra / BR Mania / Lubrax',
  TESTEMUNHA: 'Testemunhas',
  HOMOLOGADA: 'Empresa homologada',
};
export const PAPEL_SIGNATARIO_HINT_INT: Record<PapelSignatarioInt, string> = {
  LT: 'Assina primeiro',
  CLIENTE: 'Sócios · e-mails do contrato social',
  REPRESENTANTE_VIBRA: 'Assina após o cliente',
  TESTEMUNHA: 'Encerram o envelope',
  HOMOLOGADA: 'Assina apenas o Termo de Cessão',
};

export interface ContratoInt {
  id: string;
  tipo: TipoDocumento;
  papel: PapelContrato;
  etapa: EtapaContratoInt;
  codigoExterno: string | null;
  estadoExterno: EstadoExterno | null;
  minutaPadrao: boolean;
}

export interface MinutaInt {
  id: string;
  contractId: string;
  versao: number;
  status: StatusMinutaInt;
  origem: OrigemMinuta;
  netlexConsultaCodigo: string | null;
  /** `null` = slot sem documento (o "pendente de anexo"). */
  fileName: string | null;
  atualizadoEm: string;
}

export interface SignatarioInt {
  id: string;
  ordem: number;
  papel: PapelSignatarioInt;
  nome: string;
  email: string;
  status: StatusSignatarioInt;
  assinadoEm: string | null;
  ultimoLembreteEm: string | null;
}

export interface PacoteInt {
  /** Id LOCAL do envelope — é o `pacote.id` da tela e o `:envelopeId` do certificado. */
  id: string;
  envelopeExternoId: string;
  /** 1 = pacote principal; 2 = Termo de Cessão para a empresa homologada. */
  sequencia: 1 | 2;
  status: StatusEnvelope;
  documentosCount: number;
  signatarios: SignatarioInt[];
  criadoEm: string;
  enviadoEm: string | null;
  concluidoEm: string | null;
  motivoAnulacao: string | null;
}

export interface AtribuicaoMinutaInt {
  analistaId: string | null;
  gerencia: string | null;
  atribuidaEm: string | null;
  atribuidaPorNome: string | null;
}

export interface EstadoContrato {
  oppId: string;
  contratos: ContratoInt[];
  /** Todas as versões; a tela vê só a corrente de cada contrato. */
  minutas: MinutaInt[];
  /** Todas as tentativas de envelope; a tela vê a corrente de cada sequência. */
  pacotes: PacoteInt[];
  /** Contratos do Salesforce (seção "Contrato"), verbatim do org. */
  contratosCrm: ContratoCrmItem[];
  lacunas: LacunaDeMinuta[];
  alteracaoMinutaPadrao: AvisoAlteracaoMinutaPadrao | null;
  atribuicao: AtribuicaoMinutaInt;
  ritm: { ticketId: string; statusLabel: string } | null;
  cadeia: CadeiaAprovacao | null;
}

/** Signatário digitado num formulário de envio (cliente, representante, testemunha, homologada). */
export interface SignatarioDigitado {
  nome?: unknown;
  email?: unknown;
}
