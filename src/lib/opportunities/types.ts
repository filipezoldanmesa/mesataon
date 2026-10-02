import type { IndicatorStatus } from '@/lib/opportunities-indicators/indicator-status';
import type { SituacaoMapaDaRede, StatusMapaDaRede } from '@/lib/mapa-da-rede';
/**
 * Opportunity status values (matches the backend enum and the prototype tabs).
 * "todas" is a UI-only tab key — it is never sent to the backend as a filter.
 */
export type OpportunityStatus =
  | 'preenchimento'
  | 'análise'
  | 'aprovação'
  | 'contrato'
  | 'concluída';

/**
 * "Fase atual" da listagem — espelho 1:1 de `FaseListagem` do backend
 * (`opportunities/domain/fase-listagem.ts`, 23/09/2026).
 *
 * Não é o `OpportunityStatus` acima: aquele tem 5 valores grossos (o "Quadro"
 * e o stepper os usam), este tem as 8 fases que o select da listagem oferece.
 * "Em ativação" × "Em pagamento" é veredito do backend (espelho dos contratos
 * no Salesforce) — a tela nunca o re-deriva.
 */
export const FaseAtual = {
  Preenchimento: 'PREENCHIMENTO',
  Analise: 'ANALISE',
  Aprovacao: 'APROVACAO',
  Minuta: 'MINUTA',
  Assinatura: 'ASSINATURA',
  Ativacao: 'ATIVACAO',
  Pagamento: 'PAGAMENTO',
  Concluida: 'CONCLUIDA',
} as const;

export type FaseAtual = (typeof FaseAtual)[keyof typeof FaseAtual];

/**
 * As opções do select, NA ORDEM DO FLUXO. O rótulo segue o pedido — "Em" na
 * frente de toda fase, exceto a Concluída — e é o mesmo texto que o backend
 * manda em `faseAtualLabel` por linha. Existe aqui porque o select lista as
 * oito fases mesmo quando nenhuma linha está numa delas (contagem 0).
 */
export const FASE_ATUAL_OPTIONS: ReadonlyArray<{ value: FaseAtual; label: string }> = [
  { value: FaseAtual.Preenchimento, label: 'Em preenchimento' },
  { value: FaseAtual.Analise, label: 'Em análise' },
  { value: FaseAtual.Aprovacao, label: 'Em aprovação' },
  { value: FaseAtual.Minuta, label: 'Em minuta' },
  { value: FaseAtual.Assinatura, label: 'Em assinatura' },
  { value: FaseAtual.Ativacao, label: 'Em ativação' },
  { value: FaseAtual.Pagamento, label: 'Em pagamento' },
  { value: FaseAtual.Concluida, label: 'Concluída' },
];

const FASES_ATUAIS: ReadonlySet<string> = new Set(Object.values(FaseAtual));

/** Type guard — valor fora do catálogo (backend mais novo, URL editada) é descartado. */
export function isFaseAtual(value: unknown): value is FaseAtual {
  return typeof value === 'string' && FASES_ATUAIS.has(value);
}

/** Row shape for the opportunity list (journey J2 — listing screen). */
export interface OpportunitySummary {
  id: string;
  /** Display code, e.g. "OPP-0428". */
  code: string;
  title: string;
  clientName: string;
  /** The customer REFERENCE — Código SAP, or the CRM id of a prospect (ADR-0055). */
  clientId: string;
  /**
   * The customer's Código SAP — `null` for a prospect. What a screen prints
   * after "SAP" (see `shownSapCode`); `clientId` may be a CRM id.
   */
  clientSapCode?: string | null;
  /**
   * Nome do LT responsável — o que a tela de detalhe rotula "Responsável (LT)".
   *
   * Existe porque a busca livre passou a casar o LT (09/09/2026): sem a coluna,
   * quem busca "Ana Ribeiro" recebe linhas sem nenhuma forma de conferir por que
   * elas casaram. `null` quando a oportunidade não registra o criador — a célula
   * mostra travessão, nunca um nome derivado de outra coisa.
   *
   * ⚠️ A BUSCA é mais larga que esta coluna: ela casa também o `lt_principal` da
   * equipe, que pode ser outra pessoa (o "Trocar LT" grava lá, não aqui). É
   * deliberado — esconder a linha seria pior que exibi-la com o responsável.
   */
  ltNome: string | null;
  /**
   * Finalidade da oportunidade — e.g. "Implantação", "Vinculação".
   *
   * É o que a coluna homônima da listagem (e a pill do card do "Quadro")
   * renderiza. Substituiu o `type` (`tipoNegociacao`), que é `CONTRATACAO` em
   * praticamente toda oportunidade desta plataforma e por isso pintava a MESMA
   * pill em todas as linhas — coluna que não distinguia nada.
   *
   * O valor já é o rótulo: os membros de `Finalidade` são os API names do
   * Salesforce, em pt-BR, então não há mapa de tradução a manter.
   *
   * `null` quando ninguém respondeu — o campo NUNCA é defaultado (RN-F2-03),
   * e a tela renderiza travessão em vez de afirmar uma escolha que não houve.
   */
  finalidade: string | null;
  /** Current phase label, e.g. "Proposta comercial". */
  phase: string;
  /** Deal value in BRL; null when not yet informed. */
  value: number | null;
  status: OpportunityStatus;
  /**
   * Fase atual (8 valores) — veredito do backend. `null` só quando o backend é
   * anterior ao campo: a linha então não casa nenhum filtro de fase, em vez de
   * cair numa fase adivinhada.
   */
  faseAtual: FaseAtual | null;
  /** Rótulo pt-BR da fase atual, vindo do backend ("Em ativação", "Concluída"…). */
  faseAtualLabel: string | null;
  /** O pacote de contratos está ativo no Salesforce — o botão "Contratos ativos". */
  contratoAtivo: boolean;
  /** Diretoria (Escritório de Venda do cliente); `null` ⇒ travessão. */
  diretoria: string | null;
  /** Gerência (Equipe de Vendas da conta); `null` ⇒ travessão. */
  gerencia: string | null;
  /** Opening/creation date (ISO-8601); null when unknown. Shown as "Data de criação". */
  createdAt: string | null;
  /**
   * Data de ativação do pacote de contratos (ISO-8601) — `Contract.ActivatedDate`
   * lido do Salesforce. `null` enquanto não ativado ou não lido ⇒ travessão.
   */
  dataAtivacao: string | null;
  /**
   * ISO-8601 timestamp when the current stage started (from `opportunity_stage_periods`).
   * `null` for legacy opportunities whose backfill did not recover this record.
   */
  faseIniciadaEm: string | null;
  /**
   * How long this opportunity has been in its current stage, in (fractional) days.
   * `null` for legacy opportunities without a stage-period record — the UI must
   * omit the badge entirely; rendering "0 d" would misrepresent missing data.
   * (DASH-F2 / VBR-426)
   */
  permanenciaFaseAtualDias: number | null;
}

/**
 * Contadores da listagem, calculados pela BFF sobre o conjunto recortado pela
 * busca e pela franquia — e NUNCA pelo próprio filtro de fase: cada opção do
 * select mostra quantas oportunidades estão naquela fase, e isso não pode
 * mudar conforme o usuário marca ou desmarca as outras.
 */
export interface OpportunityCounts {
  all: number;
  /** Quantas oportunidades estão em cada fase atual. */
  porFase: Record<FaseAtual, number>;
  /** Quantas têm o pacote de contratos ativo (o botão "Contratos ativos"). */
  contratosAtivos: number;
}

/**
 * Colunas ordenáveis da listagem. Conjunto FECHADO, e é a mesma allowlist que a
 * BFF aplica — valor fora dela cai na ordem padrão do backend em vez de virar
 * critério de ordenação inventado.
 *
 * Só `createdAt` por ora: é a única coluna com controle na tela (o protótipo
 * `oportunidades.html` oferece as seis, mas cada uma pede a sua decisão de
 * empate e de valor ausente). Acrescentar outra é somar um membro aqui, um caso
 * no comparador da BFF e um `<SortableHeader>` na tabela.
 */
export type OpportunitySortField = 'createdAt';

export type SortDirection = 'asc' | 'desc';

/** Parameters for listing opportunities (mirrors the backend query string). */
/**
 * Filtro "Franquia" da listagem (ADO 67860) — espelha `FranquiaFilter` no
 * backend. Segundo eixo, combinado por AND com a aba de fase: uma oportunidade
 * com franquia pode estar em qualquer fase.
 */
export const FRANQUIA_FILTER_OPTIONS = [
  { value: '', label: 'Franquia: todas' },
  { value: 'QUALQUER', label: 'Com franquia' },
  { value: 'ZBRM', label: 'BR Mania' },
  { value: 'ZLUB', label: 'Lubrax+' },
  { value: 'NENHUMA', label: 'Sem franquia' },
] as const;

export type FranquiaFilterValue = (typeof FRANQUIA_FILTER_OPTIONS)[number]['value'];

export interface ListOpportunitiesParams {
  /** Filtro de franquia (ADO 67860). Vazio/ausente = sem recorte. */
  franquia?: FranquiaFilterValue;
  q?: string;
  /** Fases marcadas no select "Fase atual"; vazio/ausente = todas. */
  fases?: readonly FaseAtual[];
  /** Só as oportunidades com contrato ativo (o botão "Contratos ativos"). */
  contratosAtivos?: boolean;
  page?: number;
  limit?: number;
  /** Ausente ⇒ ordem padrão do backend (o estado neutro do cabeçalho). */
  sort?: OpportunitySortField;
  dir?: SortDirection;
}

/** Result of loading the opportunity list (`/oportunidades`). */
export interface OpportunityListResult {
  items: OpportunitySummary[];
  counts: OpportunityCounts;
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// F2 — Opportunity detail (01b-oportunidade.html)
// ---------------------------------------------------------------------------

/** A member of the opportunity team. */
export interface OpportunityTeamMember {
  id: string;
  name: string;
  /**
   * Função/especialidade — o balde de franquia (`outros`, `exec_lubrax`, …).
   * Valor de MÁQUINA: rotule com `teamRoleLabel` antes de exibir.
   */
  role: string;
  /**
   * Perfis de acesso capturados quando o membro entrou na equipe (valores de
   * máquina do enum `Role`). É o que qualifica a pessoa no chip do protótipo
   * (`Ana Ribeiro · LT · …`).
   */
  roles?: string[];
  /** Cargo no diretório na inclusão; reserva quando não há perfil conhecido. */
  jobTitle?: string | null;
  /** Região/diretoria na inclusão. Ausente com o diretório real (ADR-0031). */
  zone?: string;
  isPrincipal?: boolean;
}

/**
 * Proposal lifecycle status — mirrors the backend `ProposalStatus` enum
 * (`apps/api/src/proposals/domain/proposal-status.enum.ts`) value-for-value.
 *
 * Deliberately NOT {@link OpportunityStatus}: a proposal has its own lifecycle
 * (RN-F2-03 — a proposal can be devolvida to the LT while the opportunity stays
 * in análise). Declared as a const object so call sites compare against a named
 * member (`ProposalStatus.Devolvida`) instead of a bare string literal.
 */
export const ProposalStatus = {
  EmPreenchimento: 'EM_PREENCHIMENTO',
  EmAnalise: 'EM_ANALISE',
  Devolvida: 'DEVOLVIDA',
} as const;

export type ProposalStatus = (typeof ProposalStatus)[keyof typeof ProposalStatus];

/** pt-BR labels for {@link ProposalStatus} — the only place the enum becomes text. */
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  [ProposalStatus.EmPreenchimento]: 'Em preenchimento',
  [ProposalStatus.EmAnalise]: 'Em análise',
  [ProposalStatus.Devolvida]: 'Devolvida',
};

/** Narrows an unvalidated backend value to {@link ProposalStatus}. */
export function isProposalStatus(value: unknown): value is ProposalStatus {
  return (
    typeof value === 'string' &&
    (Object.values(ProposalStatus) as string[]).includes(value)
  );
}

/**
 * A proposal associated with an opportunity.
 * The `isElected` flag reflects the "Eleita" state toggled by `PUT /proposals`.
 *
 * `group`, `tipoProposta` and `fillPercent` are nullable because the backend
 * does not produce them yet — the BFF maps `null` rather than inventing a
 * value, and the UI omits the corresponding element. They become non-null the
 * day the backend ships them; no frontend default ever stands in for missing
 * backend data.
 */
export interface OpportunityProposal {
  id: string;
  code: string; // e.g. "P-1115"
  title: string; // e.g. "Cenário conservador"
  /** Bandeira/negócio, e.g. "Posto (PCR)", "Franquia BR Mania"; null until the backend exposes it. */
  group: string | null;
  /**
   * SAP material code of the proposal type (PCR / ZBRM / ZLUB).
   * Null when the backend has not yet populated the field (safe/unknown state —
   * never defaults to the first enum member). Optional for backward compatibility
   * with callers predating FRQ-15; treat absent as null.
   */
  tipoProposta?: string | null;
  status: ProposalStatus;
  authorName?: string;
  /** 0–100; null until the backend exposes a filling signal for the list. */
  fillPercent: number | null;
  isElected: boolean;
  /**
   * Reason the SNEG typed when returning the proposal (`DEVOLVIDA`), mapped
   * from the backend `motivoDevolucao`. Null when the status is not DEVOLVIDA
   * or when no reason was recorded.
   *
   * Replaces the former `adjustmentField` ("Recursos financeiros"), which the
   * prototype showed but no backend field ever produced — the card always fell
   * back to the generic sentence. The devolução carries free text, not a block.
   */
  returnReason?: string | null;
  /**
   * Status do cálculo de indicadores econômicos (TIR/VPL — F7) da proposta.
   * Preenchido pelo backend via LEFT JOIN em `proposal_indicators` na listagem
   * da oportunidade — nunca faz uma chamada extra por proposta.
   * `null` quando a proposta nunca foi calculada (sem row em
   * `proposal_indicators`); o card omite a pill nesse caso.
   */
  indicatorStatus: IndicatorStatus | null;
}

/**
 * Consolidated financial indicators (F7 slot).
 * Nullable because F7 has not been implemented yet — the detail screen renders
 * "—" / placeholder when null.
 */
export interface FinancialIndicators {
  /**
   * Decimal ratio, e.g. `0.35` = 35% — same unit as
   * {@link OpportunityIndicatorsSnapshot.tir}, since both slots are filled from
   * the same ARP result. Render with `formatPercentFromDecimal`, never raw.
   */
  tir: number | null;
  vpl: number | null; // BRL value
  /** Decimal ratio (backend `percentualAntecipacao`), e.g. `0.4` = 40%. */
  percentualAntecipacao: number | null;
  /**
   * TMA — already a percentage (`11.05` = 11,05% a.a.), unlike `tir`. Written
   * into the same JSONB slot by the ARP callback worker, so it needs no second
   * fetch: the "Análise financeira" card renders it in the same grid as the
   * other measures (there is no nested indicators sub-card anymore).
   */
  tma?: number | null;
  /**
   * R$/m³ — consolidated financial result per contracted m³ (backend
   * `rsPorM3`). Displayed in the "Análise financeira" card under "Resultado
   * R$/m³". Null when the ARP did not return this measure.
   */
  rsPorM3?: number | null;
  /** ISO-8601 timestamp of the calculation these numbers came from. */
  calculadoEm?: string | null;
  /**
   * Motivo do `indisponivel` — a mensagem que o ARP devolveu ao recusar o
   * cálculo, ou a frase de expiração quando ele não respondeu. `null` quando
   * não há motivo a exibir; a tela só renderiza a linha quando existe.
   */
  mensagemErro?: string | null;
  /**
   * Lifecycle of the calculation these numbers came from (`IndicatorStatus`),
   * narrowed by the mapper — `null` when absent or unrecognised.
   *
   * Load-bearing: the same three numbers are rendered in "Análise financeira",
   * outside the indicators panel. While the ARP recalculates (`em_calculo`) the
   * slot still holds the PREVIOUS values, so without this field the section
   * would present them as definitive right above a panel saying a calculation is
   * running (HU-13.2).
   */
  status: IndicatorStatus | null;
}

/**
 * Os seis totais do card "Totais - Recursos Financeiros" (backend
 * `TotaisRecursosFinanceirosDto`).
 *
 * Nomes e semântica são do Salesforce; o rótulo pt-BR de cada um vive no card
 * (`TOTAIS_RECURSOS_FINANCEIROS_CAMPOS`), verbatim do `label` do org.
 *
 * ⚠️ **`valorTotalRecursosFinanceirosBRL` NÃO é a soma dos três primeiros** —
 * ele é o roll-up SEM filtro de tipo do org, então `Parcelamento de Débito`
 * entra nele e em balde nenhum. A tela exibe os seis números como vêm; não
 * derive um do outro.
 *
 * Cada campo é nullable porque a borda (BFF) nunca fabrica `0`: `null` é "o
 * backend não mandou este número" e rende `—`; `0` é soma de verdade e rende
 * `R$ 0,00`.
 */
export interface TotaisRecursosFinanceiros {
  bonificacaoAntecipadaComNovoMutuoBRL: number | null;
  totalRecursoFinanceiroMutuoBRL: number | null;
  totalBonificacaoDesempenhoBRL: number | null;
  mutuoComAntecipacaoENovoMutuoBRL: number | null;
  valorTotalBonificacaoComNovoMutuoBRL: number | null;
  valorTotalRecursosFinanceirosBRL: number | null;
}

/**
 * Station situation (F4 slot).
 * Nullable for the same reason as `FinancialIndicators`.
 */
export interface SituacaoPosto {
  label: string;
  details?: string;
}

/**
 * Editable fields for `PATCH /v1/opportunities/:id`.
 * Only the fields the user can mutate from the detail screen.
 */
export interface OpportunityPatchPayload {
  title?: string;
  description?: string;
  briefing?: string;
  /** "Parecer do LT" — texto livre do LT sobre a negociação (ADO 68473). */
  parecerLt?: string;
  finalidade?: string;
  clientRecebedorId?: string;
  /**
   * Adesão ao PIM — **override**, sem tela.
   *
   * O PIM é o `Programa Acelera+`, perguntado nos dados da proposta, e o valor
   * que vai ao Salesforce é derivado da proposta PCR eleita (`pim-adesao.ts` no
   * backend). A API aceita este campo para sobrepor a derivação (suporte, e o
   * caso de duas PCR eleitas com respostas divergentes); nenhum componente o
   * envia. `null` não é enviável por aqui de propósito.
   */
  pimAdesao?: boolean;
  /**
   * Possui nova imagem de pista — tri-estado como a Adesão ao PIM, e mesma
   * razão: o campo do Salesforce é picklist restrita, e o `/simulate` da alçada
   * recusa enquanto estiver em branco.
   *
   * Nasce derivado de `Account.Nova_Imagem__c` na criação; aqui o usuário
   * CORRIGE — e a correção vence a derivação (o trigger do org só sugere).
   */
  possuiNovaImagemPista?: boolean;
  /**
   * Será colocada nova imagem de pista nesta negociação. Só se aplica quando
   * `possuiNovaImagemPista` é `false` — é a única combinação que o picklist
   * dependente do Salesforce habilita.
   */
  seraColocadaNovaImagemPista?: boolean;
  /**
   * `Opportunity.Alteracao_Minuta_Padrao__c` — "Haverá alteração de minuta
   * padrão?" (ADO 68438). Tri-estado: ausente é "não respondido", que NÃO é
   * `false` — o campo do Salesforce é picklist restrita e aceita nulo.
   */
  alteracaoMinutaPadrao?: boolean;
  /**
   * Descrição da alteração da minuta padrão — texto livre do LT.
   * OBRIGATÓRIA quando `alteracaoMinutaPadrao` é `true`; o backend recusa com
   * 400 sem ela e DESCARTA o texto quando a resposta não é "Sim".
   */
  descricaoAlteracaoMinutaPadrao?: string;
}

/**
 * Full opportunity detail shape (GET /v1/opportunities/:id).
 *
 * API contract — F2 detail section (VBR-75 épico):
 *
 *   GET /v1/opportunities/:id
 *   Response 200: OpportunityDetail
 *   Response 404: { code: "OPPORTUNITY_NOT_FOUND" }
 */
export interface OpportunityDetail {
  id: string;
  code: string;
  /**
   * Raw backend workflow state (`NOVOS`, `EM_PREENCHIMENTO`, `EM_ANALISE`, …).
   *
   * Kept alongside the coarse `status` because `status` collapses `NOVOS` and
   * `EM_PREENCHIMENTO` into `preenchimento`, and the transition endpoint needs
   * the EXACT state as its optimistic-lock token — sending a guessed value
   * either 422s ("no transition from state X") or 409s ("state changed since
   * last read").
   */
  backendState: string;
  title: string;
  description: string | null;
  briefing: string | null;
  /** "Parecer do LT" — texto livre do LT sobre a negociação (ADO 68473). */
  parecerLt: string | null;
  finalidade: string | null;

  // Client
  /** The customer REFERENCE — Código SAP, or the CRM id of a prospect (ADR-0055). */
  clientId: string;
  /** The customer's Código SAP — `null` for a prospect (see `shownSapCode`). */
  clientSapCode?: string | null;
  clientName: string;
  clientDocument: string | null; // CNPJ/CPF
  clientRecebedorId: string | null;
  clientRecebedorName: string | null;
  /** Adesão ao PIM: `null` = ainda não respondido. */
  /** Override explícito da Adesão ao PIM; `null` ⇒ vale a derivação da proposta. */
  pimAdesao: boolean | null;
  /** Possui nova imagem de pista: `null` = ainda não respondido. */
  possuiNovaImagemPista: boolean | null;
  /** Será colocada nova imagem de pista: `null` = ainda não respondido. */
  seraColocadaNovaImagemPista: boolean | null;
  /**
   * "Haverá alteração de minuta padrão?": `null` = ainda não respondido —
   * NÃO é "Não" (ADO 68438).
   */
  alteracaoMinutaPadrao: boolean | null;
  /**
   * Descrição da alteração da minuta padrão. Preenchida apenas quando
   * `alteracaoMinutaPadrao` é `true` — é ela que o alerta da fase de minuta
   * exibe.
   */
  descricaoAlteracaoMinutaPadrao: string | null;

  // Classification
  type: string; // e.g. "Posto"
  /**
   * Negotiation type — e.g. "Contratação · Vinculação".
   * Distinct from `type` (asset class); null until the backend exposes it.
   */
  tipoNegociacao?: string | null;
  status: OpportunityStatus;
  salesZone: string | null;
  companyGroup: string | null; // e.g. "4981 · Grupo JAL"
  franchises: string[]; // e.g. ["BR Mania", "Lubrax+"]
  profitCenters: string | null;
  /**
   * Escritório de Venda do cliente (`Account.Escritorio_de_vendas_da_conta__c`,
   * ex.: `VREG3`) — o primeiro item da barra "Equipe da oportunidade" (Bug 67589).
   * Opcional pela mesma razão de {@link areaUsuario}: fixtures e telas que não
   * leem o campo. O mapper do BFF sempre o preenche (`?? null`).
   */
  salesOffice?: string | null;
  /**
   * `Opportunity.Name` LIDO DE VOLTA do Salesforce — o sequencial que o org
   * atribui (`4567384`), nunca o que a plataforma enviou (ADO 68142).
   *
   * É o identificador do CRM replicado do nosso lado: o negócio abre o registro
   * no Salesforce, vê `4567384` e precisa achar a oportunidade aqui — e vice-
   * versa. Vive em `opportunity_crm_links.salesforce_code` e o backend só o
   * publica com o vínculo em `CRIADO`; `null` significa "ainda não integrada",
   * que é fato de negócio, não lacuna de fonte.
   *
   * ⚠️ **Não** é embutido em {@link OpportunityDetail.code}: aquele nasce na
   * criação, quando o registro do org ainda não existe, e reescrevê-lo depois
   * renumeraria identificador que já circula em pendência, auditoria e e-mail.
   */
  salesforceCode?: string | null;
  /**
   * Deep link para o registro no org — MONTADO pelo backend (ADO 68142,
   * reabertura de 03/09/2026).
   *
   * Pedido verbatim: *"a Michelle solicitou um link para abrir uma aba direto no
   * Salesforce com a Oportunidade"*. A URL vem pronta porque a base é
   * `SALESFORCE_INSTANCE_URL`, variável de RUNTIME do backend — montá-la aqui
   * exigiria uma `NEXT_PUBLIC_*`, ou seja **build-time**, cujo modo de falha é
   * silencioso (bundle sem o valor ⇒ link quebrado, sem nada acusando).
   *
   * É também o que mantém {@link salesforceCode} como o ÚNICO valor do org
   * exibido: o id de 18 chars viaja dentro do `href`, nunca como texto.
   *
   * `null` ⇒ a tela renderiza o código como texto, sem link (link morto ensina
   * o usuário que o controle não funciona).
   */
  salesforceUrl?: string | null;
  /**
   * "Área do usuário" (`Gerencia_Do_Usuario__c`) — a gerência desta plataforma,
   * resolvida e persistida no backend. `null` só em linha anterior ao backfill.
   *
   * Opcional pela mesma razão de {@link pimAdesao}: o tipo é consumido por
   * fixtures e por telas que não leem o campo. O mapper do BFF sempre o
   * preenche (`?? null`), então quem lê nunca recebe `undefined` em produção.
   */
  areaUsuario?: string | null;

  // Financial / contract
  vmm: number | null; // m³/mês
  /**
   * Prazo do contrato em MESES — o MAIOR entre as propostas eleitas, derivado no
   * backend (`maxContractTermMonths`, o mesmo agregado do parecer — VBR-276).
   *
   * Nunca recalculado aqui: a regra por proposta não é uma subtração, e o
   * agregado precisa saber QUAIS propostas estão eleitas. Ver
   * `prazoContratoLabel`.
   *
   * Opcional para o skew de deploy degradar: backend anterior a esta entrega
   * não manda o campo, e aí o card mostra `—` em vez de quebrar.
   */
  prazoContratoMeses?: number | null;
  indexRealLitro: number | null; // R$/L
  startDate: string | null; // ISO-8601 date
  endDate: string | null; // ISO-8601 date
  estimatedValue: number | null; // BRL

  // Audit
  createdAt: string; // ISO-8601
  /** Opening date (auto) — PRD F2 "Data de abertura". */
  dataAbertura: string | null;
  /** Completion date (auto) — PRD F2 "Data de conclusão"; null until finalized. */
  dataConclusao: string | null;
  createdBy: string;
  owner: string;
  ownerRole: string;
  /**
   * A SNEG devolveu a oportunidade INTEIRA e ela voltou ao preenchimento
   * (`DEVOLVER_AO_LT` — 27/08/2026), com o motivo que o LT precisa ler.
   *
   * `null` na maioria das oportunidades: quem nunca foi devolvida, e também
   * quem já foi reenviada — o backend guarda a ÚLTIMA devolução e só a expõe
   * enquanto a fase é de preenchimento, que é o ciclo a que ela se refere.
   *
   * Não confundir com a devolução de UMA proposta (RN-F2-03), que aparece no
   * painel da própria proposta e não move a oportunidade.
   *
   * Opcional como os demais campos de exibição deste tipo
   * (`escritorioVendas`): o mapper sempre o preenche
   * (com `null` quando não há), e as fixtures de teste que não o declaram
   * renderizam a tela sem a nota — que é o estado da maioria das
   * oportunidades.
   */
  devolucaoAoLt?: {
    motivo: string;
    /** ISO. */
    em: string;
    porNome: string | null;
  } | null;

  // Team (from F1)
  team: OpportunityTeamMember[];

  // Proposals
  propostas: OpportunityProposal[];
  /** Ids of the proposals composing the opportunity (elected via F2 PUT). */
  proposalIds: string[];

  // Consolidated slots — null until F7 / F4 are implemented
  indicadores: FinancialIndicators | null;
  situacaoPosto: SituacaoPosto | null;
  /**
   * Mapa da Rede do CLIENTE (09/09/2026) — o par exibido no card "Dados da
   * oportunidade", logo abaixo da situação do posto.
   *
   * `null` = a conta não participa do mapa **ou** a leitura não respondeu; o
   * backend colapsa os dois de propósito (fabricar "Fora da rede" a partir de
   * uma leitura que falhou afirmaria sobre o cadastro). A tela mostra `—`.
   */
  mapaDaRede: {
    status: StatusMapaDaRede | null;
    situacao: SituacaoMapaDaRede | null;
  } | null;

  /**
   * Card "Totais - Recursos Financeiros" — os seis totais que o Salesforce
   * exibe na `Opportunity`, somados sobre os recursos financeiros das propostas
   * eleitas.
   *
   * `null` significa UMA coisa: a oportunidade ainda não passou da fase de
   * preenchimento, então o card não se aplica. **Quem decide é o backend** — a
   * fase pós-preenchimento é renderizada por quatro superfícies, e um predicado
   * de fase copiado em cada uma divergiria.
   *
   * Opcional como os demais campos de exibição deste tipo: o mapper do BFF
   * sempre o preenche (com `null` quando não há), e as fixtures de teste que
   * não o declaram renderizam a tela sem o card.
   */
  totaisRecursosFinanceiros?: TotaisRecursosFinanceiros | null;

  /**
   * Franquias ELEITAS cujo royalty não entrou no cálculo consolidado, e o que
   * falta em cada uma (ADO 68009).
   *
   * Vazio é o caso normal. `undefined`/`null` é "não sei" — backend anterior ao
   * campo, ou leitura que degradou — e a nota simplesmente não renderiza: um
   * aviso derivado de desconhecimento afirmaria sobre o cálculo o que ninguém
   * apurou.
   */
  franquiasSemRoyalty?: FranquiaSemRoyalty[] | null;

}

/**
 * Uma franquia eleita fora do cálculo de royalties, com o que falta nela em
 * pt-BR (ADO 68009). Ver `RoyaltyFranquiaNote`.
 */
export interface FranquiaSemRoyalty {
  proposalId: string;
  /** `proposals.code` — o identificador que a linha da proposta imprime. */
  codigo: string | null;
  /** `ZBRM` | `ZLUB` — o tipo da proposta É a bandeira. */
  bandeira: string;
  /** Ex.: `["faturamento proposto", "formato de loja"]`. Nunca vazio. */
  faltando: string[];
}

/** Thrown when an opportunity id returns 404 from the detail endpoint. */
export class OpportunityNotFoundError extends Error {
  constructor(readonly opportunityId: string) {
    super(`Oportunidade não encontrada: ${opportunityId}`);
    this.name = 'OpportunityNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// F8 — Envio para análise (GATE 1, 01b-oportunidade.html)
// ---------------------------------------------------------------------------

/**
 * Machine-readable codes for each unsatisfied GATE 1 minimum-completeness
 * criterion (RN-F8-01). Mirrors the backend's `Gate1MissingCode`
 * (`apps/api/src/workflow-orchestration/gate1-readiness.service.ts`).
 */
export type Gate1MissingCode =
  | 'propostas_selecionadas'
  | 'indicadores_calculados'
  | 'documentos_obrigatorios'
  /*
   * Os CINCO códigos da DDI (ADO 68233 + 09/09/2026). Espelham
   * `DdiGate1Bloqueio`, e são cinco porque são cinco consertos: a ferramenta
   * ainda rodando, o parecer da Integridade em aberto, a decisão do LT
   * pendente, a reprovação — e o documento que a Integridade pediu.
   *
   * ⚠️ O último é o único que NÃO sai do status da análise: `requestDocument`
   * não move o status, então uma DDI já `LIBERADA` pode ter a pendência
   * `ddi:documento` aberta. Ele também é o único cujo destino não é o painel da
   * DDI — o LT resolve anexando, no ticket.
   */
  | 'ddi_finalizado'
  | 'ddi_parecer_integridade'
  | 'ddi_decisao_lt'
  | 'ddi_reprovada'
  | 'ddi_documento_pendente'
  /*
   * Os TRÊS códigos da alçada (19/09/2026). Espelham `AlcadaGate1Bloqueio`, e
   * são três porque são três consertos: acionar, ESPERAR o Salesforce responder,
   * e acionar de novo depois de a oportunidade ter voltado ao LT para ajuste.
   *
   * ⚠️ O último não é derivável do status da simulação — depende de quando a
   * oportunidade voltou ao preenchimento, que o backend lê dos períodos de
   * etapa. A tela renderiza o veredito; nunca o deriva.
   */
  | 'alcada_nao_acionada'
  | 'alcada_em_simulacao'
  | 'alcada_nao_reacionada';

/**
 * O que o 422 `GATE_NOT_READY` carrega em `missing[]`.
 *
 * ⚠️ **Nem toda entrada é um {@link Gate1MissingCode}.** A rota de transição é
 * uma só para uma CADEIA de guards, e os dois do GATE 1 escrevem `missing[]`
 * em vocabulários diferentes:
 *
 *  - `Gate1CompletenessGuard` emite os 4 CÓDIGOS de máquina acima;
 *  - `FranquiaGateGuard` (FRQ-F4 / RN-F4-01) emite FRASES pt-BR já compostas
 *    ("Franquia BR Mania: FAP não anexada"), por decisão registrada na HU-07.2
 *    — *"o backend devolve a lista do que falta; o front não deriva"*.
 *
 * Tipar isto como `Gate1MissingCode[]` fazia a frase do guard de franquia cair
 * no `MISSING_LABEL[code] ?? …` e virar o genérico "Requisito pendente",
 * jogando fora a única linha que dizia o que consertar. O tipo agora admite as
 * duas metades e quem renderiza decide: código conhecido ⇒ rótulo do catálogo;
 * qualquer outra string ⇒ **ela própria**, nunca um genérico (a mesma regra do
 * `origemDisplay` da pendência — valor fora do catálogo cai no valor CRU).
 */
export type Gate1MissingItem = Gate1MissingCode | (string & {});

/**
 * Result of `GET /v1/opportunities/:id/gate1-readiness` (F8, HU-14.1).
 * Same verdict the transition guard would produce for `ENVIAR_PARA_ANALISE`,
 * without effecting any state change — used to enable/disable the "Enviar
 * para análise" button and list exactly what is missing.
 *
 * API Contract — F8 (épico VBR-121 / BE VBR-122):
 *
 *   GET /v1/opportunities/:id/gate1-readiness
 *   Response 200: Gate1Readiness
 *   Response 404: { code: "OPPORTUNITY_NOT_FOUND" }
 */
export interface Gate1Readiness {
  ready: boolean;
  missing: Gate1MissingItem[];
  /**
   * Um bloqueio de DDI foi LEVANTADO pelo *de acordo do Diretor* (ADO 68233).
   *
   * ⚠️ **É rótulo, não veredito.** Quem decide continua sendo `missing` — a
   * tela não deriva liberação disto (regra do repo: veredito é do backend).
   * Ele existe para a barra NOMEAR por que um bloqueio que estava de pé
   * sumiu; um override de compliance silencioso é pior que nenhum.
   *
   * Opcional porque um backend anterior a esta entrega não o manda: nesse
   * caso a barra apenas não nomeia nada, em vez de quebrar.
   */
  liberadoPorDeAcordoDiretor?: boolean;
  /**
   * O ator pode DISPARAR o GATE 1 desta oportunidade (ADO 68191).
   *
   * ⚠️ **É VEREDITO, não rótulo** — o oposto de
   * `liberadoPorDeAcordoDiretor`. Vem do MESMO predicado que o guard da
   * transição aplica (`domain/gate1-participacao.ts`: participa da
   * oportunidade, ou é perfil de suporte), e a barra do GATE 1 não é
   * renderizada quando é `false`. A tela **não** deriva pertencimento por
   * conta própria: até 10/09/2026 o rodapé *"complete os itens abaixo para
   * enviar à análise"* aparecia para todo perfil de visão ampla em qualquer
   * oportunidade em preenchimento da base.
   *
   * ⚠️ Opcional, e a AUSÊNCIA vale `true` — ao contrário do campo acima. Aqui
   * "não sei" tem de degradar para o comportamento ANTERIOR (barra visível),
   * porque um backend antigo não manda o campo e assumir `false` esconderia o
   * CTA do próprio LT, que é regressão pior que o bug. Quem recusa de verdade
   * é o guard, e o erro dele já é tratado pela barra.
   */
  podeEnviar?: boolean;
}

/** Successful result of `POST /v1/opportunities/:id/transitions`. */
export interface TriggerTransitionResult {
  status: string;
  correlationId: string;
}

/**
 * Thrown on `422 GATE_NOT_READY` — the completeness guard rejected the
 * `ENVIAR_PARA_ANALISE` transition. Carries the same `missing[]` codes as
 * `Gate1Readiness`, covering the case where completeness regressed between
 * the pre-flight check and the click (HU-14.1 fallback).
 */
export class GateNotReadyError extends Error {
  constructor(readonly missing: Gate1MissingItem[]) {
    super('A oportunidade não atende aos requisitos mínimos do GATE 1.');
    this.name = 'GateNotReadyError';
  }
}

/**
 * Thrown on a `422` que **não** carrega `missing[]` (ADO 68189 · 04/09/2026).
 *
 * A rota `POST .../transitions` é uma só para toda a cadeia de guards e para os
 * pre-commit effects, e só o `GATE_NOT_READY` traz lista estruturada. Todo o
 * resto — recusa de outro guard, `PreCommitEffectError`, `InvalidTransition` —
 * chega como `{ statusCode: 422, code?, message }`, onde `message` é a frase
 * pt-BR que NOMEIA o conserto.
 *
 * ⚠️ Até 04/09/2026 o cliente traduzia **todo** 422 em `GateNotReadyError(body
 * .missing ?? [])`: a frase era descartada e a tela caía no estado "bloqueado"
 * com lista VAZIA, escrevendo *"complete os itens abaixo para enviar à
 * análise:"* seguido de nada. Foi assim que o ticket foi aberto — *"não
 * aparece quais são os itens que precisa verificar"*.
 */
export class TransitionRefusedError extends Error {
  constructor(
    message: string,
    /** Código de máquina do guard, quando houver (ex.: `DDI_PENDING`). */
    readonly code?: string,
  ) {
    super(message);
    this.name = 'TransitionRefusedError';
  }
}

/** Thrown on `403` — the authenticated caller lacks a role authorized to trigger the transition. */
export class TransitionForbiddenError extends Error {
  constructor() {
    super('Você não tem autoridade para enviar esta oportunidade para análise.');
    this.name = 'TransitionForbiddenError';
  }
}

/**
 * Thrown on `409` — the opportunity's state changed since it was last read
 * (optimistic lock). The caller should reload the opportunity detail.
 */
export class TransitionConflictError extends Error {
  constructor() {
    super(
      'O estado da oportunidade foi alterado por outra pessoa. Atualizando os dados…',
    );
    this.name = 'TransitionConflictError';
  }
}

// ---------------------------------------------------------------------------
// F2 — Opportunity creation (01a-nova-oportunidade.html)
// ---------------------------------------------------------------------------

/**
 * Pre-fill data returned by `GET /v1/opportunities/prefill?customerId=<id>`.
 *
 * API Contract — F2 creation (VBR-75 épico / VBR-77 BE):
 *
 *   GET /v1/opportunities/prefill?customerId=<id>
 *   Response 200: OpportunityPrefill
 *   Response 404: { code: "CUSTOMER_NOT_FOUND" }
 *   Response 503: { code: "CRM_UNAVAILABLE" }
 */
/**
 * One approved sales area of the account (creation-screen selector option).
 * `code` is opaque (composed ID_Area_De_Vendas__c) — never validate its shape.
 */
export interface OpportunitySalesAreaOption {
  code: string;
  name: string;
  isPrimary: boolean;
  /**
   * `Area_De_Vendas_Aprovada__c`. Only a prospect is offered an area with
   * `false` — its area awaits the SAP approval flow (ADR-0055). Optional: a
   * backend older than this field does not send it, and absence is NOT
   * "unapproved" (that would mislabel every registered account's area).
   */
  aprovada?: boolean;
}

export interface OpportunityPrefill {
  customerId: string;
  clientName: string;
  clientDocument: string | null;
  /** Suggested title built server-side, e.g. "Posto Vibra Centro-SP · Contratação". */
  suggestedTitle: string;
  salesZone: string | null;
  /**
   * Approved sales areas of the account, as a LIST — feeds the creation
   * screen's selector. `salesZone` above is the joined display string and
   * cannot express a choice; the chosen `code` travels back to the backend in
   * {@link CreateOpportunityPayload.areaVendaCode}.
   */
  salesAreas: OpportunitySalesAreaOption[];
  profitCenter: string | null;
  /**
   * Equipe de Vendas da conta (Equipe_de_vendas_da_conta__c in Salesforce).
   * Added in COR-3: previously read by the CRM port but discarded before
   * reaching the prefill response.
   */
  salesTeam: string | null;
  companyGroup: string | null;
  /** SAP id of the receiving client — backend defaults it to the customer id. */
  clientRecebedorId: string | null;
  /**
   * ADO 68001 — SUGESTÃO de "possui nova imagem de pista", derivada de
   * `Account.Nova_Imagem__c` pela regra do trigger do Salesforce.
   *
   * Semeia o select da tela de criação. `null` = a conta não informa (84%
   * delas) e o campo nasce em branco — nunca um default. A resposta do usuário
   * vence: na população, contas `Aprovada` têm 91 oportunidades com "Não".
   */
  possuiNovaImagemPista: boolean | null;
  /** Initial team members derived from the territory assignment. */
  team: OpportunityTeamMember[];
}

/**
 * Payload for `POST /v1/opportunities`.
 *
 * API Contract — F2 creation (VBR-75 épico / VBR-77 BE):
 *
 *   POST /v1/opportunities
 *   Body: CreateOpportunityPayload
 *   Response 201: { id: string; code: string }
 *   Response 400: { code: "VALIDATION_ERROR", errors: [] }
 *   Response 403: { code: "FORBIDDEN" }
 */
export interface CreateOpportunityPayload {
  customerId: string;
  title: string;
  description?: string;
  briefing?: string;
  /** "Parecer do LT" — texto livre do LT sobre a negociação (ADO 68473). */
  parecerLt?: string;
  /** Only set when applicable per RN-F2-03 (Vinculação/Implantação). */
  finalidade?: string;
  clientRecebedorId?: string;
  /** F4 — initial posto situation (SituacaoPosto enum value); omitted when not informed. */
  situacaoPosto?: string;
  /**
   * `Opportunity.PossuiNovaImagemPista__c` — tri-state: ausente é "não
   * respondido", que NÃO é `false`. Ausente ⇒ o backend deriva do cadastro da
   * conta; informado ⇒ vence a derivação (ADO 68001).
   */
  possuiNovaImagemPista?: boolean;
  /**
   * `Opportunity.SeraColocadaNovaImagemPista__c` — só é enviado quando
   * `possuiNovaImagemPista` é `false`: é a única combinação que o picklist
   * dependente do Salesforce habilita.
   */
  seraColocadaNovaImagemPista?: boolean;
  /**
   * `Opportunity.Alteracao_Minuta_Padrao__c` — "Haverá alteração de minuta
   * padrão?" (ADO 68438). Tri-estado: ausente é "não respondido", que NÃO é
   * `false` — o campo do Salesforce é picklist restrita e aceita nulo.
   */
  alteracaoMinutaPadrao?: boolean;
  /**
   * Descrição da alteração da minuta padrão — texto livre do LT.
   * OBRIGATÓRIA quando `alteracaoMinutaPadrao` é `true`; o backend recusa com
   * 400 sem ela e DESCARTA o texto quando a resposta não é "Sim".
   */
  descricaoAlteracaoMinutaPadrao?: string;
  /**
   * `code` of the chosen sales area (from {@link OpportunityPrefill.salesAreas}).
   * Optional — without it the Salesforce sync omits Area_De_Vendas__c whenever
   * the account has more than one approved area.
   */
  areaVendaCode?: string;
  salesZone?: string | null;
  profitCenter?: string | null;
  team?: OpportunityTeamMember[];
}

/** Minimal response from a successful `POST /v1/opportunities`. */
export interface CreateOpportunityResult {
  id: string;
  code: string;
}

/** Thrown when the user lacks permission to create an opportunity (HTTP 403). */
export class OpportunityForbiddenError extends Error {
  constructor() {
    super('Você não tem permissão para criar oportunidades.');
    this.name = 'OpportunityForbiddenError';
  }
}

/** Thrown when the CRM is unavailable during prefill (HTTP 503). */
export class PrefillUnavailableError extends Error {
  constructor() {
    super(
      'Serviço CRM indisponível. Aguarde alguns instantes e tente novamente.',
    );
    this.name = 'PrefillUnavailableError';
  }
}
