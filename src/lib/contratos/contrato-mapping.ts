/**
 * BFF anti-corruption mapping for `GET /v1/opportunities/:id/contrato`.
 *
 * The backend shape uses NestJS class-validator DTOs with camelCase fields and
 * domain enum values. This mapper:
 *  - Validates every enum via its type guard, falling back to the SAFEST state.
 *  - Keeps `SectionResult` discriminant (`status: "ok" | "unavailable"`) intact.
 *  - Never passes through raw backend shapes — every field is explicitly mapped.
 *
 * See CLAUDE.md §"BFF nunca faz passthrough cru de payload do backend".
 */

import {
  EtapaContrato,
  isEtapaContrato,
} from './types';

// ---------------------------------------------------------------------------
// Backend contract for assinatura section
// ---------------------------------------------------------------------------

export interface BackendSignatarioItem {
  id: string;
  sequencia: number;
  papel: string;
  papelLabel: string;
  hint: string;
  statusLabel: string;
  statusPill: string;
  podeReenviar: boolean;
}

export interface BackendPacoteItem {
  id: string;
  envelopeExternoId: string;
  descricao: string;
  situacaoLabel: string;
  situacaoPill: string;
  assinaturasConcluidas: number;
  assinaturasTotal: number;
  faixaTexto: string | null;
  faixaTipo: string | null;
  signatarios: BackendSignatarioItem[];
  /**
   * O envelope ainda é rascunho no DocuSign (13/09/2026). `?` porque payload de
   * backend anterior a esta entrega não traz o campo — e ausente lê como "não é
   * rascunho", que é o que aqueles envelopes de fato eram.
   */
  rascunho?: boolean;
  /** `PRINCIPAL` ou `TERMO_CESSAO_HOMOLOGADA`. Ausente ⇒ principal. */
  natureza?: string;
}

/** Seção "Termo de Cessão" (13/09/2026). */
export interface BackendTermoCessao {
  aplicavel: boolean;
  minutaDisponivel: boolean;
  minutaNome: string | null;
  pacotePrincipalConcluido: boolean;
  situacao: string;
  situacaoLabel: string;
  situacaoPill: string;
  podeEnviar: boolean;
  podeAnular: boolean;
}

// ---------------------------------------------------------------------------
// Frontend types for assinatura section
// ---------------------------------------------------------------------------

export type PillVariantAssinatura = 'i' | 'w' | 's' | 'n' | 'd';
export type FaixaTipo = 'info' | 'ok';

export interface SignatarioItem {
  id: string;
  sequencia: number;
  papel: string;
  papelLabel: string;
  hint: string;
  statusLabel: string;
  statusPill: PillVariantAssinatura;
  podeReenviar: boolean;
}

export interface PacoteItem {
  id: string;
  envelopeExternoId: string;
  descricao: string;
  situacaoLabel: string;
  situacaoPill: PillVariantAssinatura;
  assinaturasConcluidas: number;
  assinaturasTotal: number;
  faixaTexto: string | null;
  faixaTipo: FaixaTipo | null;
  /** Sorted ascending by `sequencia` — backend is the authority on order. */
  signatarios: SignatarioItem[];
  /**
   * Envelope ainda em rascunho no DocuSign: ele existe lá, com documentos e
   * destinatários, e não foi enviado a ninguém.
   *
   * Veredito do backend. A tela usa isto para esconder o progresso de
   * assinaturas (que seria 0 de N sobre pessoas que não receberam nada) e não o
   * deriva de nenhum outro campo.
   */
  rascunho: boolean;
  /** `PRINCIPAL` (minutas) ou `TERMO_CESSAO_HOMOLOGADA` (Termo assinado). */
  natureza: NaturezaPacote;
}

export type NaturezaPacote = 'PRINCIPAL' | 'TERMO_CESSAO_HOMOLOGADA';

export type SituacaoTermoCessao =
  | 'NAO_APLICAVEL'
  | 'AGUARDANDO_MINUTA'
  | 'AGUARDANDO_PACOTE_PRINCIPAL'
  | 'PRONTO_PARA_ENVIO'
  | 'EM_ASSINATURA'
  | 'CONCLUIDO'
  | 'ANULADO';

/**
 * Seção "Termo de Cessão" (protótipo `01g`, `#cessao`).
 *
 * `aplicavel: false` ⇒ a tela não renderiza a seção: a oportunidade não tem
 * obra vinculada por recursos financeiros e o Termo não faz parte dela.
 */
export interface TermoCessaoData {
  aplicavel: boolean;
  minutaDisponivel: boolean;
  minutaNome: string | null;
  pacotePrincipalConcluido: boolean;
  situacao: SituacaoTermoCessao;
  situacaoLabel: string;
  situacaoPill: PillVariantAssinatura;
  podeEnviar: boolean;
  podeAnular: boolean;
}

export interface AssinaturaData {
  pacotes: PacoteItem[];
}

// ---------------------------------------------------------------------------
// Backend contract (as returned by GET /v1/opportunities/:id/contrato)
// ---------------------------------------------------------------------------

export interface BackendSectionResult<T> {
  status: 'ok' | 'unavailable';
  data: T | null;
  error?: string;
}

export interface BackendTrilhaItem {
  etapa: string;
  etapaLabel: string;
  status: string;
  ocorridoEm: string | null;
  detalhe: string | null;
}

export interface BackendHeadPill {
  texto: string;
  variant: string;
}

export interface BackendSendbar {
  mensagem: string;
  mensagemDetalhe: string | null;
  /** Null when the bar carries no action at all — the front renders no button. */
  acaoLabel: string | null;
  acaoEvento: string | null;
  acaoHabilitada: boolean;
  motivoBloqueio: string | null;
}

export interface BackendMinutaItem {
  id: string;
  contractId: string;
  tipo: string;
  tipoLabel: string;
  papel: string;
  papelLabel: string;
  descricao: string;
  status: string;
  statusLabel: string;
  statusPill: string;
  origem: string;
  versao: number;
  podeBaixar: boolean;
  podeSubstituir: boolean;
  netlexConsultaCodigo: string | null;
  fileName: string | null;
  atualizadoEm: string;
  /** True when this is a standard Netlex-generated template (default flow). */
  minutaPadrao: boolean;
}

export interface BackendContratoItem {
  id: string;
  tipo: string;
  tipoLabel: string;
  papel: string;
  papelLabel: string;
  etapa: string;
  etapaLabel: string;
  etapasPermitidas: string[];
  codigoExterno: string | null;
  estadoExterno: string | null;
  estadoExternoLabel: string | null;
  estadoExternoPill: string | null;
  minutaPadrao: boolean;
  /** Backend-authored text: e.g. "Cadastro/ativação: Salesforce · Liberação de pagamento: Salesforce". */
  origemGestao?: string | null;
}

/**
 * Um contrato do Salesforce (`contratosCrm`) — o que a seção "Contrato" exibe.
 *
 * `status` e `tipo` vêm VERBATIM do org: o vocabulário é o do negócio e é o
 * mesmo que o usuário vê no CRM. `statusPill` é o veredito de cor do backend.
 */
export interface BackendContratoCrmItem {
  id: string;
  numero: string | null;
  tipo: string | null;
  status: string | null;
  statusPill: string | null;
  situacao: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
}

export interface BackendReservaGarantia {
  statusLabel: string;
  statusPill: string | null;
}

/**
 * One row of the "Gate de pagamento" block, exactly as `DadosBancariosDto.gate`
 * sends it. Keys in use: `codigoFornecedorSap`, `dadosBancarios`,
 * `reservaGarantia`.
 */
export interface BackendGateItem {
  key: string;
  status: string;
  statusLabel: string;
  statusPill: string | null;
  mensagem: string | null;
}

export interface BackendDadosBancarios {
  banco: string | null;
  agencia: string | null;
  /** Masked account number — backend already masks; front must not reformat. */
  conta: string | null;
  contratoAtivo: boolean;
  aptoParaPagamento: boolean;
  /**
   * Gate de pagamento rows (CTR-16).
   *
   * This is an ARRAY keyed by `key` — it is not, and never was, a set of flat
   * `codigoFornecedorSapStatusLabel` / `dadosBancariosGateStatusLabel` fields.
   * The mapper used to read those flat names; they are absent from the payload,
   * so every row mapped to `null` and the UI printed the "Gate de pagamento"
   * heading with nothing under it — the payment gate looked empty while the
   * backend was reporting two PENDENTE blockers.
   */
  gate?: BackendGateItem[];
  /** SAP supplier code (group ZFPJ) — null until verified in SAP. */
  codigoFornecedorSap?: string | null;
  // RITM / Service Now
  podeSolicitarRitm?: boolean;
  ritmTicketId?: string | null;
  ritmStatusLabel?: string | null;
  /** Masked linked account — display as-is; never reformat. */
  contaVinculada?: string | null;
}

export interface BackendPendenciaItem {
  id: string;
  titulo: string;
  /** Context line distinguishing pendências from the same catalog rule. */
  detalhe?: string | null;
  status: string;
  statusLabel: string;
  responsavelDisplay: string | null;
  podeResolver: boolean;
  /** API resource path (`/v1/pendencias/:id`) — NOT a screen route. */
  href: string;
}

export interface BackendContratoReadModel {
  // Phase / stage
  fase: string;
  faseLabel: string;
  etapaAtual: string;
  etapaAtualLabel: string;
  etapasPermitidas: string[];
  etapaTrilha: string;
  /** 22/09/2026 — sem Mútuo/Novo Mútuo/Concessão Financeira, a fase de pagamento é pulada. */
  pagamentoNaoSeAplica?: boolean;

  // Head pill
  headPill: BackendHeadPill;

  // Trilha
  trilha: BackendTrilhaItem[];

  // Sections
  minutas: BackendSectionResult<BackendMinutaItem[]>;
  assinatura: BackendSectionResult<{ pacotes: BackendPacoteItem[] }>;
  /**
   * Termo de Cessão (13/09/2026). `?` pela mesma razão de `contratosCrm`:
   * payload anterior a esta entrega não traz o campo, e ausente tem de ler como
   * "não se aplica" — nunca como `unavailable`, que a tela mostraria como falha.
   */
  termoCessao?: BackendSectionResult<BackendTermoCessao>;
  contratos: BackendSectionResult<BackendContratoItem[]>;
  /**
   * Contratos do Salesforce. `?` porque payload de backend anterior a esta
   * entrega não traz o campo — e ausente tem de ler como "seção não veio",
   * nunca como um `unavailable` que a tela mostraria como falha do org.
   */
  contratosCrm?: BackendSectionResult<BackendContratoCrmItem[]>;
  /**
   * ⚠️ AUSENTE quando o chamador não pode ler o dado bancário do cliente — o
   * backend não resolve a seção para quem não está em `[LT, SNEG, ADMIN]`
   * (`contrato-read-roles.ts`). Não é `{ status: 'ok', data: null }`, que é a
   * afirmação de negócio "o cliente não tem dados bancários cadastrados".
   */
  dadosBancarios?: BackendSectionResult<BackendDadosBancarios | null>;
  pendencias: BackendSectionResult<{ total: number; itens: BackendPendenciaItem[] }>;

  // Readiness
  readiness: {
    minuta: {
      ready: boolean;
      missing: string[];
      /** Human-readable blocking reason shown in the warn faixa. Backend-provided. */
      motivoBloqueio: string | null;
      /** Success message shown in the ok faixa when all minutas are generated. Backend-provided. */
      mensagemSucesso: string | null;
      /**
       * Veredito do "+ Adicionar documento" (19/09/2026). `?` porque payload de
       * backend anterior a esta entrega não traz o campo.
       *
       * ⚠️ NÃO é `!ready` — ver a nota no tipo de leitura abaixo.
       */
      podeAnexar?: boolean;
      /** Frase pt-BR do bloqueio do anexo. Null/ausente quando `podeAnexar`. */
      motivoBloqueioAnexo?: string | null;
    };
    assinatura: {
      ready: boolean;
      missing: string[];
      /**
       * Signatário #1 (o LT da oportunidade) já resolvido pelo backend.
       *
       * `editavel` é veredito DELE, não da tela: verdadeiro só quando o e-mail
       * veio do snapshot da criação — o do diretório corporativo é governado
       * por IAM e a rota de envio recusa a sobrescrita. `null` = LT não
       * resolveu, e `missing` carrega o motivo.
       */
      signatarioLt: { nome: string; email: string; editavel: boolean } | null;
      /**
       * Sugestão para a PRIMEIRA linha de "Representantes da Vibra": o
       * gerente/líder do LT no diretório (11/09/2026).
       *
       * ⚠️ É sugestão, não veredito — a lista é editável e aceita N nomes.
       * `null` significa **sem fonte** e cobre igualmente "o tenant não
       * registra gerente para este LT", "o diretório não respondeu" e "a sessão
       * não tem grant delegado". A tela responde igual aos três: campo vazio e
       * a lacuna NOMEADA, nunca um substituto plausível.
       */
      representanteSugerido: { nome: string; email: string } | null;
    };
    pagamento: { pronto: boolean; missing: string[] };
  };

  // Sendbar
  sendbar: BackendSendbar;

  /**
   * Aviso de alteração da minuta padrão. `?` porque payload anterior a esta
   * entrega não traz o campo — ausente lê como "não há alteração declarada",
   * que é o mesmo efeito de `null`.
   */
  alteracaoMinutaPadrao?: { descricao: string | null } | null;

  /**
   * Contratos do Salesforce sem minuta correspondente. `?` porque payload
   * anterior a esta entrega não traz o campo — ausente lê como "nenhuma
   * lacuna", que é o mesmo efeito da lista vazia.
   */
  lacunasDeMinuta?: { tipoNoOrg: string | null; numero: string | null }[] | null;

  // Fronteiras
  cadeiaAprovacao: BackendCadeiaAprovacao | null;

  // Analises card

  // Obra
  obra: null;
}

// ---------------------------------------------------------------------------
// Frontend types (safe, validated)
// ---------------------------------------------------------------------------

export type SectionStatus = 'ok' | 'unavailable';

export interface SectionResult<T> {
  status: SectionStatus;
  data: T | null;
  error?: string;
}

export type TrilhaItemStatus = 'CONCLUIDA' | 'ATUAL' | 'PENDENTE';

export interface TrilhaItem {
  etapa: EtapaContrato;
  etapaLabel: string;
  status: TrilhaItemStatus;
  ocorridoEm: string | null;
  detalhe: string | null;
}

export interface HeadPill {
  texto: string;
  variant: 'i' | 's' | 'w';
}

export interface Sendbar {
  mensagem: string;
  mensagemDetalhe: string | null;
  /**
   * Null when the bar carries no action — render the message only, never a
   * disabled button. See `SendbarVeredito` on the backend for the three shapes.
   */
  acaoLabel: string | null;
  acaoEvento: string | null;
  acaoHabilitada: boolean;
  motivoBloqueio: string | null;
}

export interface MinutaItem {
  id: string;
  contractId: string;
  tipo: string;
  tipoLabel: string;
  papel: string;
  papelLabel: string;
  descricao: string;
  status: string;
  statusLabel: string;
  statusPill: string;
  origem: string;
  versao: number;
  podeBaixar: boolean;
  podeSubstituir: boolean;
  netlexConsultaCodigo: string | null;
  fileName: string | null;
  atualizadoEm: string;
  /** True when this is a standard Netlex-generated template (default flow). */
  minutaPadrao: boolean;
}

export interface ContratoItem {
  id: string;
  tipo: string;
  tipoLabel: string;
  papel: string;
  papelLabel: string;
  etapa: string;
  etapaLabel: string;
  etapasPermitidas: string[];
  codigoExterno: string | null;
  estadoExterno: string | null;
  estadoExternoLabel: string | null;
  estadoExternoPill: string | null;
  minutaPadrao: boolean;
  /** Backend-authored origin text (e.g. "Cadastro/ativação: Salesforce · Liberação de pagamento: Salesforce"). */
  origemGestao: string | null;
}

/** Uma linha da seção "Contrato" — um contrato do Salesforce. */
export interface ContratoCrmItem {
  id: string;
  numero: string | null;
  tipo: string | null;
  status: string | null;
  statusPill: string | null;
  situacao: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
}

/** One rendered row of the "Gate de pagamento" block. */
export interface GateRow {
  key: string;
  /** pt-BR row label resolved from {@link GATE_ROW_LABEL}. */
  label: string;
  statusLabel: string;
  statusPill: 'i' | 'w' | 's' | 'n' | 'd' | null;
  /** Per-row explanation (`.att` line). Null when the backend omits it. */
  mensagem: string | null;
}

/**
 * pt-BR label for each gate row key. An unknown key falls back to the raw key
 * so a new backend row shows up on screen instead of vanishing (CLAUDE.md:
 * rótulo sem mapeamento cai no valor bruto, não num genérico).
 */
export const GATE_ROW_LABEL: Record<string, string> = {
  codigoFornecedorSap: 'Código de fornecedor (SAP)',
  dadosBancarios: 'Dados bancários',
  reservaGarantia: 'Reserva de garantia (CCOB)',
};

export interface DadosBancarios {
  banco: string | null;
  agencia: string | null;
  /** Masked account number — backend already masks; front must not reformat. */
  conta: string | null;
  contratoAtivo: boolean;
  aptoParaPagamento: boolean;
  /** SAP supplier code (group ZFPJ) — null until verified in SAP. */
  codigoFornecedorSap: string | null;
  /** Gate de pagamento rows, in backend order (CTR-16). */
  gate: GateRow[];
  // RITM / Service Now
  podeSolicitarRitm: boolean;
  ritmTicketId: string | null;
  ritmStatusLabel: string | null;
  /** Masked linked account — display as-is; never reformat. */
  contaVinculada: string | null;
}

// ---------------------------------------------------------------------------
// RITM request / response types (solicitar-ritm)
// ---------------------------------------------------------------------------

export interface BackendRitmRequestBody {
  banco?: string;
  agencia?: string;
  conta?: string;
}

export interface BackendRitmResponse {
  ritmTicketId: string;
  ritmStatus: string;
  ritmStatusLabel: string;
}

export interface SolicitarRitmResult {
  ritmTicketId: string;
  ritmStatusLabel: string;
}

export function mapRitmResponse(b: BackendRitmResponse): SolicitarRitmResult {
  return {
    ritmTicketId: b.ritmTicketId,
    ritmStatusLabel: b.ritmStatusLabel,
  };
}

export interface PendenciaContratoItem {
  id: string;
  titulo: string;
  /** Context line distinguishing pendências from the same catalog rule. */
  detalhe: string | null;
  status: string;
  statusLabel: string;
  responsavelDisplay: string | null;
  podeResolver: boolean;
  /** Screen route, derived from `id` — never the backend's API path. */
  href: string;
}

/** Alerta "haverá alteração de minuta padrão" da fase de minuta. */
export interface AvisoAlteracaoMinutaPadrao {
  descricao: string | null;
}

/**
 * Um contrato do Salesforce para o qual esta plataforma não sabe qual minuta
 * corresponde — o `RecordType.Name` dele não tem par no de/para.
 *
 * "Gera lacuna" foi a resposta da Vibra em 21/09/2026: a tela NOMEIA o
 * instrumento em vez de omiti-lo. O veredito é do BACKEND — a tela nunca deriva
 * isso da lista de contratos do org.
 */
export interface LacunaDeMinuta {
  /** `RecordType.Name` do org, verbatim (ex. `DCVIM Locação`). */
  tipoNoOrg: string | null;
  /** `ContractNumber` do org (ex. `09552690`). */
  numero: string | null;
}

export interface ContratoReadModel {
  fase: string;
  faseLabel: string;
  etapaAtual: EtapaContrato;
  etapaAtualLabel: string;
  etapasPermitidas: EtapaContrato[];
  /**
   * Etapa que a TRILHA pinta — veredito do backend, não derivação da tela.
   *
   * Igual a `etapaAtual`, exceto quando o pacote inteiro já está ativo no
   * Salesforce: aí `CADASTRO`/`ATIVACAO` resolvem para `PAGAMENTO`. É o único
   * sinal que alcança o passo "Em pagamento" — `contracts.stage` nunca passa de
   * `CADASTRO`, porque cadastro, ativação e liberação de pagamento correm no org.
   */
  etapaTrilha: EtapaContrato;
  /**
   * A fase "Em pagamento" NÃO SE APLICA e foi (ou vai ser) pulada: a negociação
   * não tem Mútuo, Novo Mútuo nem Concessão Financeira (22/09/2026). Veredito
   * do backend — a trilha só decide como desenhar o passo.
   */
  pagamentoNaoSeAplica: boolean;
  headPill: HeadPill;
  trilha: TrilhaItem[];
  minutas: SectionResult<MinutaItem[]>;
  assinatura: SectionResult<AssinaturaData>;
  /** Termo de Cessão e o envio à empresa homologada (13/09/2026). */
  termoCessao: SectionResult<TermoCessaoData>;
  contratos: SectionResult<ContratoItem[]>;
  /** Contratos do Salesforce, com o status de lá — o que a seção "Contrato" renderiza. */
  contratosCrm: SectionResult<ContratoCrmItem[]>;
  /** Ausente para quem não pode lê-la — ver o tipo do backend acima. */
  dadosBancarios?: SectionResult<DadosBancarios | null>;
  pendencias: SectionResult<{ total: number; itens: PendenciaContratoItem[] }>;
  readiness: {
    minuta: {
      ready: boolean;
      missing: string[];
      /** Human-readable blocking reason shown in the warn faixa. From backend. */
      motivoBloqueio: string | null;
      /** Success message shown in the ok faixa when all minutas are generated. From backend. */
      mensagemSucesso: string | null;
      /**
       * Se o "+ Adicionar documento" da seção Minuta pode ser acionado
       * (19/09/2026). Veredito do BACKEND — a tela não o deriva de `ready`.
       *
       * ⚠️ **Não é `!ready`.** `ready` também fica falso quando o backend não
       * CONSEGUIU apurar o gate, e a rota de anexo aceitaria a chamada nesse
       * caso: desabilitar o botão ali tiraria a única porta pela qual a minuta
       * entra por causa de uma consulta que não respondeu.
       */
      podeAnexar: boolean;
      /**
       * Frase pt-BR do bloqueio, associada ao botão desabilitado. Null quando
       * `podeAnexar` — esconder o CTA não pode esconder o fato.
       */
      motivoBloqueioAnexo: string | null;
    };
    assinatura: {
      ready: boolean;
      missing: string[];
      /**
       * Signatário #1 (o LT da oportunidade) já resolvido pelo backend.
       *
       * `editavel` é veredito DELE, não da tela: verdadeiro só quando o e-mail
       * veio do snapshot da criação — o do diretório corporativo é governado
       * por IAM e a rota de envio recusa a sobrescrita. `null` = LT não
       * resolveu, e `missing` carrega o motivo.
       */
      signatarioLt: { nome: string; email: string; editavel: boolean } | null;
      /**
       * Sugestão para a PRIMEIRA linha de "Representantes da Vibra": o
       * gerente/líder do LT no diretório (11/09/2026).
       *
       * ⚠️ É sugestão, não veredito — a lista é editável e aceita N nomes.
       * `null` significa **sem fonte** e cobre igualmente "o tenant não
       * registra gerente para este LT", "o diretório não respondeu" e "a sessão
       * não tem grant delegado". A tela responde igual aos três: campo vazio e
       * a lacuna NOMEADA, nunca um substituto plausível.
       */
      representanteSugerido: { nome: string; email: string } | null;
    };
    pagamento: { pronto: boolean; missing: string[] };
  };
  sendbar: Sendbar;
  /**
   * Alerta de que a negociação NÃO seguirá a minuta padrão, com a
   * descrição da alteração do LT (`null` quando ela não foi escrita — o alerta aparece
   * assim mesmo, porque o FATO é o que muda a conferência do documento).
   *
   * ⚠️ `null` no lugar do objeto é VEREDITO DO BACKEND: "a resposta não é
   * Sim". A tela não deriva isso de campo nenhum.
   */
  alteracaoMinutaPadrao: AvisoAlteracaoMinutaPadrao | null;
  /**
   * Contratos do Salesforce sem minuta correspondente aqui (21/09/2026).
   *
   * Lista vazia cobre "não há lacuna" e "o org não pôde ser lido" — quem
   * distingue os dois é `contratosCrm.status`.
   */
  lacunasDeMinuta: LacunaDeMinuta[];
  cadeiaAprovacao: CadeiaAprovacao | null;
  obra: null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TRILHA_STATUS = new Set<TrilhaItemStatus>(['CONCLUIDA', 'ATUAL', 'PENDENTE']);

function mapTrilhaStatus(raw: string): TrilhaItemStatus {
  return VALID_TRILHA_STATUS.has(raw as TrilhaItemStatus)
    ? (raw as TrilhaItemStatus)
    : 'PENDENTE'; // safest: no destructive CTA gated on PENDENTE
}

const VALID_HEAD_VARIANTS = new Set(['i', 's', 'w']);

function mapHeadVariant(raw: string): 'i' | 's' | 'w' {
  return VALID_HEAD_VARIANTS.has(raw) ? (raw as 'i' | 's' | 'w') : 'i';
}

const VALID_PILL_VARIANTS = new Set(['i', 'w', 's', 'n', 'd']);

function mapPillVariant(raw: string | null): 'i' | 'w' | 's' | 'n' | 'd' | null {
  if (raw === null) return null;
  return VALID_PILL_VARIANTS.has(raw) ? (raw as 'i' | 'w' | 's' | 'n' | 'd') : null;
}

function mapSectionResult<TBackend, TFront>(
  section: BackendSectionResult<TBackend>,
  mapData: (data: TBackend) => TFront,
): SectionResult<TFront> {
  if (section.status === 'unavailable' || section.data === null) {
    return { status: section.status ?? 'unavailable', data: null, error: section.error };
  }
  return { status: 'ok', data: mapData(section.data) };
}

const VALID_FAIXA_TIPOS = new Set<FaixaTipo>(['info', 'ok']);

function mapFaixaTipo(raw: string | null): FaixaTipo | null {
  if (raw === null) return null;
  return VALID_FAIXA_TIPOS.has(raw as FaixaTipo) ? (raw as FaixaTipo) : null;
}

function mapPillVariantAssinatura(raw: string): PillVariantAssinatura {
  return VALID_PILL_VARIANTS.has(raw)
    ? (raw as PillVariantAssinatura)
    : 'n'; // safest: neutral
}

function mapSignatarioItem(b: BackendSignatarioItem): SignatarioItem {
  return {
    id: b.id,
    sequencia: b.sequencia,
    papel: b.papel,
    papelLabel: b.papelLabel,
    hint: b.hint,
    statusLabel: b.statusLabel,
    statusPill: mapPillVariantAssinatura(b.statusPill),
    podeReenviar: b.podeReenviar,
  };
}

function mapPacoteItem(b: BackendPacoteItem): PacoteItem {
  return {
    id: b.id,
    envelopeExternoId: b.envelopeExternoId,
    descricao: b.descricao,
    situacaoLabel: b.situacaoLabel,
    situacaoPill: mapPillVariantAssinatura(b.situacaoPill),
    assinaturasConcluidas: b.assinaturasConcluidas,
    assinaturasTotal: b.assinaturasTotal,
    faixaTexto: b.faixaTexto,
    faixaTipo: mapFaixaTipo(b.faixaTipo),
    // signatarios come pre-sorted by the backend; we preserve that order
    signatarios: b.signatarios.map(mapSignatarioItem),
    rascunho: b.rascunho === true,
    // Valor desconhecido cai em PRINCIPAL, não em TERMO: o pacote do Termo tem
    // afordâncias próprias (enviar/anular a homologada) e oferecê-las sobre um
    // pacote que não é o dele agiria no envelope errado.
    natureza: b.natureza === 'TERMO_CESSAO_HOMOLOGADA' ? 'TERMO_CESSAO_HOMOLOGADA' : 'PRINCIPAL',
  };
}

const SITUACOES_TERMO_CESSAO: readonly SituacaoTermoCessao[] = [
  'NAO_APLICAVEL',
  'AGUARDANDO_MINUTA',
  'AGUARDANDO_PACOTE_PRINCIPAL',
  'PRONTO_PARA_ENVIO',
  'EM_ASSINATURA',
  'CONCLUIDO',
  'ANULADO',
];

function mapTermoCessao(b: BackendTermoCessao): TermoCessaoData {
  const situacao = SITUACOES_TERMO_CESSAO.includes(b.situacao as SituacaoTermoCessao)
    ? (b.situacao as SituacaoTermoCessao)
    : 'NAO_APLICAVEL';

  return {
    aplicavel: b.aplicavel === true,
    minutaDisponivel: b.minutaDisponivel === true,
    minutaNome: b.minutaNome ?? null,
    pacotePrincipalConcluido: b.pacotePrincipalConcluido === true,
    situacao,
    situacaoLabel: b.situacaoLabel,
    situacaoPill: mapPillVariantAssinatura(b.situacaoPill),
    // ⚠️ As duas ações vêm do backend e NUNCA são derivadas de `situacao` aqui:
    // quem decide se pode enviar é quem sabe o estado dos dois envelopes, e uma
    // segunda regra na tela divergiria exatamente no caso ambíguo — o pacote
    // principal que conclui entre o render e o clique.
    podeEnviar: b.podeEnviar === true,
    podeAnular: b.podeAnular === true,
  };
}

function mapMinutaItem(b: BackendMinutaItem): MinutaItem {
  return {
    id: b.id,
    contractId: b.contractId,
    tipo: b.tipo,
    tipoLabel: b.tipoLabel,
    papel: b.papel,
    papelLabel: b.papelLabel,
    descricao: b.descricao,
    status: b.status,
    statusLabel: b.statusLabel,
    statusPill: b.statusPill,
    origem: b.origem,
    versao: b.versao,
    podeBaixar: b.podeBaixar,
    podeSubstituir: b.podeSubstituir,
    netlexConsultaCodigo: b.netlexConsultaCodigo,
    fileName: b.fileName,
    atualizadoEm: b.atualizadoEm,
    // No `?? true`: the backend now always sends this field, and defaulting it
    // rendered a non-standard minuta as standard — a fabricated value the tela
    // presented as fact, invisible to any grep for "mock".
    minutaPadrao: b.minutaPadrao,
  };
}

function mapContratoItem(b: BackendContratoItem): ContratoItem {
  return {
    id: b.id,
    tipo: b.tipo,
    tipoLabel: b.tipoLabel,
    papel: b.papel,
    papelLabel: b.papelLabel,
    etapa: b.etapa,
    etapaLabel: b.etapaLabel,
    etapasPermitidas: b.etapasPermitidas,
    codigoExterno: b.codigoExterno,
    estadoExterno: b.estadoExterno,
    estadoExternoLabel: b.estadoExternoLabel,
    estadoExternoPill: b.estadoExternoPill,
    minutaPadrao: b.minutaPadrao,
    origemGestao: b.origemGestao ?? null,
  };
}

function mapContratoCrmItem(b: BackendContratoCrmItem): ContratoCrmItem {
  return {
    id: b.id,
    numero: b.numero ?? null,
    tipo: b.tipo ?? null,
    status: b.status ?? null,
    statusPill: b.statusPill ?? null,
    situacao: b.situacao ?? null,
    vigenciaInicio: b.vigenciaInicio ?? null,
    vigenciaFim: b.vigenciaFim ?? null,
  };
}

function mapDadosBancarios(b: BackendDadosBancarios | null): DadosBancarios | null {
  if (!b) return null;
  return {
    banco: b.banco,
    agencia: b.agencia,
    conta: b.conta,
    contratoAtivo: b.contratoAtivo,
    aptoParaPagamento: b.aptoParaPagamento,
    codigoFornecedorSap: b.codigoFornecedorSap ?? null,
    gate: (b.gate ?? []).map((row) => ({
      key: row.key,
      label: GATE_ROW_LABEL[row.key] ?? row.key,
      statusLabel: row.statusLabel,
      statusPill: mapPillVariant(row.statusPill),
      mensagem: row.mensagem ?? null,
    })),
    podeSolicitarRitm: b.podeSolicitarRitm ?? false,
    ritmTicketId: b.ritmTicketId ?? null,
    ritmStatusLabel: b.ritmStatusLabel ?? null,
    contaVinculada: b.contaVinculada ?? null,
  };
}

function mapPendenciaItem(b: BackendPendenciaItem): PendenciaContratoItem {
  return {
    id: b.id,
    titulo: b.titulo,
    detalhe: b.detalhe ?? null,
    status: b.status,
    statusLabel: b.statusLabel,
    responsavelDisplay: b.responsavelDisplay,
    podeResolver: b.podeResolver,
    // Routing is a frontend concern: the backend's `/v1/pendencias/:id` is an
    // API path, and putting it in a Next <Link> navigated the app to a 404.
    href: `/pendencias/${encodeURIComponent(b.id)}`,
  };
}

// ---------------------------------------------------------------------------
// Main mapper
// ---------------------------------------------------------------------------

/**
 * Maps the backend `ContratoReadModelDto` to the frontend `ContratoReadModel`.
 *
 * Every enum is validated via its type guard; unknown values fall to the safest
 * state (never `?? firstValue`). Explicit mapping on every field — no passthrough.
 */
export function mapContrato(b: BackendContratoReadModel): ContratoReadModel {
  // Safest EtapaContrato fallback: Minuta (no destructive CTA gated on it, all
  // CTAs that mutate are on deeper sub-phases).
  const etapaAtual: EtapaContrato = isEtapaContrato(b.etapaAtual)
    ? b.etapaAtual
    : EtapaContrato.Minuta;
  /*
   * Etapa desconhecida degrada para `etapaAtual`, nunca para `Minuta`: este
   * campo só existe para ADIANTAR a trilha, e cair em Minuta a mandaria para
   * trás — um contrato assinado voltaria a exibir "Minuta" como passo corrente.
   */
  const etapaTrilha: EtapaContrato = isEtapaContrato(b.etapaTrilha)
    ? b.etapaTrilha
    : etapaAtual;

  return {
    fase: b.fase,
    faseLabel: b.faseLabel,
    etapaAtual,
    etapaAtualLabel: b.etapaAtualLabel,
    etapasPermitidas: b.etapasPermitidas.filter(isEtapaContrato),
    etapaTrilha,
    // Ausente (backend anterior) ⇒ `false`: nunca afirmar um pulo que ninguém apurou.
    pagamentoNaoSeAplica: b.pagamentoNaoSeAplica === true,

    headPill: {
      texto: b.headPill.texto,
      variant: mapHeadVariant(b.headPill.variant),
    },

    trilha: b.trilha.map((t) => ({
      etapa: isEtapaContrato(t.etapa) ? t.etapa : EtapaContrato.Minuta,
      etapaLabel: t.etapaLabel,
      status: mapTrilhaStatus(t.status),
      ocorridoEm: t.ocorridoEm,
      detalhe: t.detalhe,
    })),

    minutas: mapSectionResult(b.minutas, (items) => items.map(mapMinutaItem)),

    assinatura: mapSectionResult(b.assinatura, (d) => ({
      pacotes: d.pacotes.map(mapPacoteItem),
    })),

    // Seção ausente (backend anterior a esta entrega) degrada para "não se
    // aplica", com `status: 'ok'`: a tela simplesmente não renderiza a seção.
    // Um `unavailable` acusaria uma falha que não houve.
    termoCessao: b.termoCessao
      ? mapSectionResult(b.termoCessao, mapTermoCessao)
      : {
          status: 'ok',
          data: {
            aplicavel: false,
            minutaDisponivel: false,
            minutaNome: null,
            pacotePrincipalConcluido: false,
            situacao: 'NAO_APLICAVEL',
            situacaoLabel: 'Não se aplica a esta oportunidade.',
            situacaoPill: 'n',
            podeEnviar: false,
            podeAnular: false,
          },
        },

    contratos: mapSectionResult(b.contratos, (items) => items.map(mapContratoItem)),

    // Seção ausente no payload (backend anterior a esta entrega) degrada para
    // lista vazia com `status: 'ok'` — a tela mostra o estado vazio padrão, e
    // não um erro que culparia o Salesforce por um campo que ninguém mandou.
    contratosCrm: b.contratosCrm
      ? mapSectionResult(b.contratosCrm, (items) => items.map(mapContratoCrmItem))
      : { status: 'ok', data: [] },

    /*
     * Condicional, e não `mapSectionResult(b.dadosBancarios ?? …)`: a chave
     * AUSENTE é o sinal de que este perfil não lê o dado, e inventar um
     * `SectionResult` aqui reintroduziria no front a afirmação que o backend se
     * recusou a fazer. Nenhuma tela consome esta seção desde 10/09/2026.
     */
    ...(b.dadosBancarios
      ? { dadosBancarios: mapSectionResult(b.dadosBancarios, mapDadosBancarios) }
      : {}),

    pendencias: mapSectionResult(b.pendencias, (d) => ({
      total: d.total,
      itens: d.itens.map(mapPendenciaItem),
    })),

    readiness: {
      minuta: {
        ready: b.readiness.minuta.ready,
        missing: b.readiness.minuta.missing,
        motivoBloqueio: b.readiness.minuta.motivoBloqueio ?? null,
        mensagemSucesso: b.readiness.minuta.mensagemSucesso ?? null,
        // Ausente lê como LIBERADO, nunca como bloqueado: payload velho (ou um
        // backend que não conseguiu apurar) não pode fechar a única porta de
        // entrada da minuta. Quem recusa de verdade é a rota, com 422.
        podeAnexar: b.readiness.minuta.podeAnexar ?? true,
        motivoBloqueioAnexo: b.readiness.minuta.motivoBloqueioAnexo ?? null,
      },
      assinatura: {
        ready: b.readiness.assinatura.ready,
        missing: b.readiness.assinatura.missing,
        // `?? null` porque payload de backend anterior a esta entrega não traz o
        // campo — e ausente tem de ler como "não resolvido", nunca como um
        // objeto vazio que a tela renderizaria com nome em branco.
        signatarioLt: b.readiness.assinatura.signatarioLt ?? null,
        // Mesma razão do `?? null` acima: ausente lê como "sem sugestão", que é
        // o estado honesto — e é exatamente o que a tela sabe nomear.
        representanteSugerido: b.readiness.assinatura.representanteSugerido ?? null,
      },
      pagamento: {
        pronto: b.readiness.pagamento.pronto,
        missing: b.readiness.pagamento.missing,
      },
    },

    sendbar: {
      mensagem: b.sendbar.mensagem,
      mensagemDetalhe: b.sendbar.mensagemDetalhe,
      acaoLabel: b.sendbar.acaoLabel,
      acaoEvento: b.sendbar.acaoEvento,
      acaoHabilitada: b.sendbar.acaoHabilitada,
      motivoBloqueio: b.sendbar.motivoBloqueio,
    },

    // Objeto ausente e `null` significam a mesma coisa aqui: nenhuma alteração
    // de minuta declarada. `descrição da alteração` é normalizada para `null` — string
    // vazia renderizaria "Haverá alteração de minuta padrão: ".
    alteracaoMinutaPadrao: b.alteracaoMinutaPadrao
      ? { descricao: b.alteracaoMinutaPadrao.descricao?.trim() || null }
      : null,

    // Campo ausente e lista vazia significam a mesma coisa aqui: nenhuma
    // lacuna a nomear. Strings são normalizadas para `null` — vazia
    // renderizaria um marcador sem nome, que é o oposto de "nomear a lacuna".
    lacunasDeMinuta: (b.lacunasDeMinuta ?? []).map((lacuna) => ({
      tipoNoOrg: lacuna.tipoNoOrg?.trim() || null,
      numero: lacuna.numero?.trim() || null,
    })),

    // ADR-0044: deixou de ser `null` fixo. `null` agora significa uma coisa só —
    // não há retrato lido da aprovação — e a tela omite o card.
    cadeiaAprovacao: b.cadeiaAprovacao
      ? {
          outcome: b.cadeiaAprovacao.outcome,
          outcomeLabel: b.cadeiaAprovacao.outcomeLabel,
          pill: b.cadeiaAprovacao.pill,
          lidoEm: b.cadeiaAprovacao.lidoEm,
          niveis: (b.cadeiaAprovacao.niveis ?? []).map((n) => ({
            ator: n.ator,
            status: n.status,
            statusLabel: n.statusLabel,
            pill: n.pill,
            concluidaEm: n.concluidaEm,
            comentario: n.comentario,
          })),
        }
      : null,

    obra: null,
  };
}


// ---------------------------------------------------------------------------
// Cadeia de aprovação (ADR-0044)
// ---------------------------------------------------------------------------

/** One alçada level as the backend serialises it. */
export type BackendCadeiaAprovacaoNivel = {
  ator: string | null;
  status: string;
  statusLabel: string;
  pill: string;
  concluidaEm: string | null;
  comentario: string | null;
};

export type BackendCadeiaAprovacao = {
  outcome: string;
  outcomeLabel: string;
  pill: string;
  niveis: BackendCadeiaAprovacaoNivel[];
  lidoEm: string | null;
};

/** Screen model of the "Cadeia de aprovação" card (protótipos `01f`/`01g`). */
export type CadeiaAprovacaoNivel = BackendCadeiaAprovacaoNivel;

export type CadeiaAprovacao = {
  outcome: string;
  outcomeLabel: string;
  pill: string;
  niveis: CadeiaAprovacaoNivel[];
  lidoEm: string | null;
};
