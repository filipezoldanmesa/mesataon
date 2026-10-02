import {
  MATRIZ_ANALISE_OPORTUNIDADE,
  MATRIZ_CRIAR_EDITAR,
  MATRIZ_DDI_VISUALIZAR,
  MATRIZ_ENVIAR_ANALISE,
  MATRIZ_ENVIAR_APROVACAO,
  MATRIZ_GOVERNANCA_EXECUTAR,
  MATRIZ_GOVERNANCA_FRANQUIA_EXECUTAR,
  MATRIZ_GOVERNANCA_FRANQUIA_VISUALIZAR,
  MATRIZ_GOVERNANCA_VISUALIZAR,
  MINUTA_ASSINATURA_ROLES,
  MATRIZ_PERFIL_PREVIA_VISUALIZAR,
  MATRIZ_REJEITAR_DEVOLVER,
  MATRIZ_VISUALIZAR_TODOS,
} from '@/lib/rbac-matrix';
import { Role } from '@/lib/auth-roles';

/**
 * UI permissions — the only place the frontend decides "may this user see/do X".
 *
 * Each permission mirrors a gate the API already enforces, so the UI and the
 * backend cannot drift into two different rule sets:
 *
 * | Permission                | API gate                                                                    |
 * |---------------------------|-----------------------------------------------------------------------------|
 * | `OpportunityCreate`       | `@Roles(...OPPORTUNITY_CREATE_ROLES)` on `POST /v1/opportunities` (RN-F2-07 · ADO 68140) |
 * | `SnegAnalysis`            | `@Roles(SNEG, ADMIN)` on `.../analise*` (RN-F1-02)                          |
 * | `AlcadaSimular`           | `@Roles(LT, SNEG, ADMIN)` on `.../alcada:acionar` (ADR-0037)                |
 * | `SnegPadroesBpGovernanca`  | `SNEG_PADROES_BP_WRITE_ROLES` = `@Roles(ADMIN)` on `/v1/sneg/bp-padroes*` writes — a aba homônima da Governança (21/09/2026); SNEG e BP_FINANCEIRO saíram por pedidos diferentes |
 * | `FinancialItemTypeParametrizacaoManage` | `@Roles(ADMIN)` on `/v1/financial-item-types` (67585; BP_FINANCEIRO saiu em 21/09/2026) |
 * | `Write`                   | `ReadOnlyProfileGuard` (Visualizador/Expansão)                              |
 * | `ContractDraftManage`     | `@Roles(SNEG, ADMIN)` on `contrato/minutas:gerar` / `:substituir` (CTR-5)   |
 * | `ContractSignatureSend`   | `@Roles(SNEG, ADMIN)` on `contrato/assinatura:enviar` (CTR-8)               |
 * | `ContractSignatureVoid`   | `@Roles(SNEG, ADMIN)` on `ANULAR_ENVIO` (protótipo 01g)                     |
 * | `ContractSignatureRemind` | `@Roles(LT, SNEG, ADMIN)` on `.../signatarios/:id:reenviar` (CTR-8)         |
 * | `ContractBankDataRequest` | `@Roles(LT, SNEG, ADMIN)` on `dados-bancarios:solicitar-ritm` (CTR-11)      |
 * | `ContractConclude`        | `CONCLUIR` — fecha a oportunidade após cadastro/ativação no Salesforce      |
 * | `GarantiaView`            | `@Roles(LT, SNEG, CCOB, ADMIN)` on `GET garantia*` routes (GAR-8)           |
 * | `GarantiaIndicar`         | `@Roles(...GARANTIA_INDICACAO_WRITE_ROLES)` — LT, ADMIN (GAR-9, F1 · ADO 67947) |
 * | `GarantiaIndicarNoCard`   | `@Roles(...GARANTIA_CARD_WRITE_ROLES)` — LT, SNEG, ADMIN (ADO 67947 · 11/09/2026) |
 * | `GarantiaPreviaDecidir`   | `@Roles(CCOB, ADMIN)` on `garantia/previa:registrar-parecer/aprovar/reprovar` (GAR-13) |
 * | `GarantiaMinutaRegistrar`      | `@Roles(SNEG, ADMIN)` on `garantia/minuta:salvar-netlex` (GAR-15, F3)                |
 * | `GarantiaSnegReatribuir`  | `@Roles(SNEG, ADMIN)` on `garantia:reatribuir-sneg` (20/09/2026)            |
 * | `FranquiaView`                 | `@Roles(LT, SNEG, GESTOR_FRANQUIAS, CONSULTOR_EXPANSAO, ADMIN)` on `GET franquia*`   |
 * | `FranquiaPropostaManage`       | `@Roles(...FRANQUIA_PROPOSTA_WRITE_ROLES)` — LT, SNEG, CONSULTOR_EXPANSAO, ADMIN     |
 * | `FranquiaRoyaltyOverride`      | `@Roles(GESTOR_FRANQUIAS, CONSULTOR_EXPANSAO, ADMIN)` on royalty/override (FRQ-4)    |
 * | `FranquiaExcecaoManage`        | `@Roles(...FRANQUIA_PARAMETROS_WRITE_ROLES)` on `.../excecoes` (ADO 67802)           |
 * | `FranquiaModeloParametrosManage` | `@Roles(...FRANQUIA_PARAMETROS_WRITE_ROLES)` on `modelo-loja`, `royalty` (taxa/parcelas) e `maturacao` |
 * | `FranquiaParecerDecidir`       | `@Roles(GESTOR_FRANQUIAS, CONSULTOR_EXPANSAO, ADMIN)` on parecer antecipado (FRQ-8)  |
 * | `FranquiaParametrizacaoManage` | `@Roles(...FRANQUIA_CATALOGO_ROYALTY_WRITE_ROLES)` = `[GESTOR_FRANQUIAS, ADMIN]` no Anexo A, idem roteamento J10 (FRQ-3) — a API deixou de admitir SNEG em 21/09/2026 e passou a espelhar esta lista |
 * | `FranquiaTaxaParametrizacaoManage` | `@Roles(GESTOR_FRANQUIAS, ADMIN)` on `franquia-parametrizacao/taxa-franquia` (67575 / 67594; BP_FINANCEIRO saiu em 21/09/2026) |
 * | `FranquiaLimiteRoyaltyManage`   | `@Roles(GESTOR_FRANQUIAS, ADMIN)` on `franquia-parametrizacao/limites-royalty` (ADO 67867 nomeava quatro; SNEG e BP_FINANCEIRO saíram em 21/09/2026) |
 * | `OpportunityEdit`              | `@Roles(LT, GERENTE_VAREJO, CONSULTOR_EXPANSAO, GESTOR_FRANQUIAS, SNEG, ADMIN)` on `PATCH /v1/opportunities/:id` (COR-12) |
 * | `OpportunityCompose`           | `OPPORTUNITY_COMPOSITION_ROLES` — `@Roles(LT, GERENTE_VAREJO, SNEG, CONSULTOR_EXPANSAO, GESTOR_FRANQUIAS, ADMIN)` on `PUT /v1/opportunities/:id/proposals` (RN-F2-04) |
 * | `OpportunitySubmitForAnalysis` | `TRANSITION_AUTHORITY[ENVIAR_PARA_ANALISE]` — GATE 1 (LT, GERENTE_VAREJO, CONSULTOR_EXPANSAO, GESTOR_FRANQUIAS, SNEG, ADMIN) |
 * | `ProposalManage`               | `POSTO_PROPOSAL_WRITE_ROLES` = `@Roles(LT, GERENTE_VAREJO, SNEG, ADMIN)` on proposal create + detail writes (F3–F9) — SNEG added by ADO 67914 |
 * | `ObraCamposTravadosEditar`     | `CAMPOS_TRAVADOS_POR_OBRA_BYPASS_ROLES` — SNEG, ADMIN: a exceção do §6 que o Bug 68395 nomeou (os demais levam 400 nos campos da parcela) |
 * | `DocumentManage`               | `DOCUMENT_WRITE_ROLES` = `@Roles(LT, GERENTE_VAREJO, SNEG, CONSULTOR_EXPANSAO, GESTOR_FRANQUIAS, ADMIN)` on document attach/replace/detach (oportunidade + repositório do cliente) |
 * | `DocumentValidate`             | `@Roles(CCOB, ADMIN)` on `.../documents/:id/validar` e `.../desfazer-validacao` (RN-F9-03 + ADO 67906) |
 * | `DdiReclassify`                | `@Roles(INTEGRIDADE, ADMIN)` on `POST .../ddi/reclassify` (RN-F10-05)                |
 * | `DdiRequestDocument`           | `@Roles(INTEGRIDADE, ADMIN)` on `POST .../ddi/solicitar-documento`                   |
 * | `DdiDecide`                    | `@Roles(LT, ADMIN)` on `POST .../ddi/decision` (RN-F10-06)                           |
 * | `GovernancaAccess`             | entrada na Governança — **lista própria**, não espelho de rota: BP Financeiro, Gestor de Franquias, TI Administrador (20/09/2026) |
 * | `AuditTrailView`               | `@Roles(ADMIN)` on `GET /v1/auditoria` — espelho exato da aba Auditoria (21/09/2026) |
 * | `PoliticaComercialView`        | `@Roles(...POLITICA_COMERCIAL_READ_ROLES)` on `GET /v1/sneg/politica-comercial` (Governança F3) |
 * | `DocumentParametrizationView`  | ⚠️ **mais estrita que a API de LEITURA**: a aba Documentos é `[ADMIN]` e espelha o `@Roles(ADMIN)` das DUAS escritas (21/09/2026); o `GET` segue aberto de propósito (Governança F1) |
 * | `SnegCamposObrigatoriosGovernanca` | `@Roles(ADMIN)` no `PUT /v1/sneg/campos-obrigatorios/:tipo` — a aba homônima da Governança (21/09/2026); o `GET` usa a mesma lista desde 24/09/2026 |
 * | `BpBudgetView`                 | `BP_BUDGET_VIEW_ROLES` — o backend OMITE `bpBudget` de `.../financial-resources` fora deles (ADO 67805) |
 *
 * ⚠️ **BP Financeiro = SNEG dentro da oportunidade (24/09/2026).** Toda
 * permissão que contém `Role.Sneg` contém `Role.BpFinanceiro` — pedido do
 * negócio: *"Dentro da oportunidade, ele deve ter as mesmas permissões que
 * SNEG. Deve ver os detalhes da mesma forma, poder fazer o parecer, enviar para
 * aprovação etc."* Os docblocks abaixo que dizem "BP não" são ANTERIORES a
 * isso. O invariante está em `auth-permissions.test.ts` (e no backend em
 * `auth/bp-cobre-sneg.spec.ts`); a Governança não entra na regra porque a SNEG
 * não tem superfície nenhuma lá.
 *
 * ⚠️ **Expansão, SPCOM e TI Sustentação = LT (Matriz RBAC v2.1 · 28/09/2026).**
 * Toda permissão que contém `Role.LT` usa {@link LT_AUTHORITY_ROLES} — espelho
 * de `LT_AUTHORITY_ROLES` do backend e da regra da matriz: *"Igual a LT, mas
 * consegue ver todas as opps"*. A única exceção é o repositório do cliente
 * (`CustomerDocumentManage`), que a matriz dá como só leitura. Os docblocks e a
 * tabela acima que listam "LT" sem os três são ANTERIORES a isso.
 *
 * ⚠️ **Matriz RBAC v2.1 aplicada LITERALMENTE (28/09/2026)** — as permissões que
 * são linha da matriz apontam para `lib/rbac-matrix.ts`, mesmo onde isso
 * sobrescreve decisão anterior de ADO (ver skill `auth-perfis-acesso`).
 *
 * Hiding a control is UX, NOT security: the API returns 403 regardless. Never
 * branch business logic on a role here — a derived verdict belongs to the
 * backend (see CLAUDE.md, "Regra derivada é do backend").
 *
 * ⚠️ The bindings are provisional (gap G4, WS#6 / WS#9) and must move together
 * with the backend `@Roles(...)` lists.
 */
export const Permission = {
  /** Start the "Nova oportunidade" flow. */
  OpportunityCreate: 'opportunity.create',
  /** Open the SNEG analyst workspace (`04-analise-sneg`). */
  SnegAnalysis: 'sneg.analysis',
  /**
   * Acionar/simular a alçada (`POST .../alcada:acionar`).
   *
   * ⚠️ Inclui o `LT` — NÃO reuse `SnegAnalysis`, que é `[Sneg, Admin]`.
   * Simular é leitura de cenário: o BPMN modela `simular → ajustar → simular`
   * em ciclo, e quem ajusta a proposta é o LT. **Enviar** para aprovação
   * continua sendo decisão da SNEG, e não tem CTA próprio (é pre-commit effect
   * do GATE 2).
   */
  AlcadaSimular: 'alcada.simular',
  /**
   * Ver e manter a aba **Governança → Padrões de BP** — as metas por negócio
   * (centro de lucro) com que a análise compara a proposta: `%` antecipado, `%`
   * postecipado e custo de vinculação unitário (RN-F4-01). **Apenas o TI
   * Administrador.**
   *
   * > *"Trazer Padrões de BP para a raiz de Governança e remover a seção
   * > Parametrizações SNEG, que não terá mais nenhuma seção. Deve ficar ao lado
   * > de Política comercial."* (21/09/2026)
   *
   * Espelha `SNEG_PADROES_BP_WRITE_ROLES` no backend (as quatro escritas de
   * `/v1/sneg/bp-padroes`).
   *
   * ## ⚠️ Era `SnegParametrization`, a permissão da TELA — e a tela não existe mais
   *
   * `/sneg/parametrizacao` tinha três blocos e perdeu os três em 21/09/2026:
   * "Campos obrigatórios" virou aba própria
   * (`SnegCamposObrigatoriosGovernanca`), "Distribuição gerência → analista" foi
   * removido (o destino já existia — a aba Distribuição SNEG) e este virou a aba
   * homônima. Sem nenhuma seção, a tela saiu junto, e a permissão passou a
   * nomear a superfície que de fato existe. **Não recrie a tela para "devolver"
   * o bloco:** duas superfícies sobre `sneg_bp_standards` divergem na primeira
   * alteração.
   *
   * ## ⚠️ As duas retiradas de perfil vieram de pedidos DIFERENTES
   *
   * A lista chegou a `[Admin]` por dois caminhos independentes, no mesmo dia, por
   * PRs diferentes — **quem reabrir uma não reabre a outra**:
   *
   * - **`Sneg`** — *"Remover o acesso de SNEG à tela /sneg/parametrizacao por URL
   *   direta. SNEG não deve ter acesso a nada de governança."* A regra que
   *   substitui o julgamento caso a caso: quem não entra na Governança não
   *   alcança superfície nenhuma dela — nem pela interface, nem pela URL, nem
   *   pela API. `auth-permissions.test.ts` prende o invariante para TODA
   *   superfície de `GOVERNANCA_SURFACES`.
   * - **`BpFinanceiro`** — *"remover as seções documentos, franquia,
   *   parametrização e auditoria do perfil de BP Financeiro"*. Ele **mantém** o
   *   "Editar" da aba Distribuição SNEG, que escreve OUTRA tabela da mesma área
   *   (`SNEG_DISTRIBUICAO_UPSERT_ROLES` no backend).
   *
   * ⚠️ **Divergência registrada com o Anexo B**, que dá à SNEG "Tabelas de
   * parâmetros: **Visualização**" (não `n/a`) e que o próprio PRD marca como a
   * decisão pendente **D-01**. Reabrir é **um perfil por vez, com o negócio
   * nomeando qual**.
   *
   * ⚠️ Isto **não** toca `SnegAnalysis` nem as leituras (`GET`) da tabela: a
   * análise da SNEG continua comparando a proposta com estes padrões, e a aba
   * Política comercial continua exibindo os dois números que eles publicam.
   */
  SnegPadroesBpGovernanca: 'sneg.padroes_bp.governanca',
  /**
   * Maintain the amounts of the "Parâmetros da Oportunidade" catalogue —
   * Receitas & Despesas (Bug ADO 67585). BpFinanceiro, Admin.
   */
  FinancialItemTypeParametrizacaoManage: 'financial_item_type.parametrizacao.manage',
  /** Change anything at all — read-only profiles hold none of these roles. */
  Write: 'write',
  /** Generate or replace the contract draft (minuta). SNEG/Admin only. */
  ContractDraftManage: 'contract.draft.manage',
  /** Send the contract for electronic signature. SNEG/Admin only. */
  ContractSignatureSend: 'contract.signature.send',
  /**
   * Anular o envelope em circulação (protótipo `01g` — "Anular envio").
   *
   * Mesmo conjunto de `ContractSignatureSend`: quem pode colocar o pacote em
   * circulação é quem pode tirá-lo. Espelha o `@Roles(SNEG, ADMIN)` da
   * transição `ANULAR_ENVIO`.
   */
  ContractSignatureVoid: 'contract.signature.void',
  /** Resend the signature link/reminder. LT, SNEG or Admin. */
  ContractSignatureRemind: 'contract.signature.remind',
  /** Request RITM / bank data from the counterpart. LT, SNEG or Admin. */
  ContractBankDataRequest: 'contract.bank_data.request',
  /**
   * Concluir a oportunidade (`CONCLUIR`, GATE final).
   *
   * Mesmo conjunto de `ContractDraftManage`/`ContractSignatureSend`: a fase de
   * contrato é da SNEG (PRD Contratos §5 — F1/F2/F6), e o SPCOM, dono de
   * ativação e pagamento no Salesforce, **não** tem acesso ao recurso
   * `contrato` neste recorte. A rota `POST :id/transitions` carrega uma lista
   * de papéis genérica (a matriz por transição é a Fase 4 do IAM), então aqui
   * o recorte é de UI — o 403 continua sendo do backend quando a matriz chegar.
   */
  ContractConclude: 'contract.conclude',
  /*
   * ⚠️ `ContractView` e `AprovacaoView` foram REMOVIDAS em 16/09/2026.
   *
   * As duas existiam para uma coisa só: decidir se a tela da oportunidade
   * trocava para a view da fase. Enquanto decidiam, todo perfil sem elas caía no
   * corpo de PREENCHIMENTO — a tela de EDIÇÃO, com outro conjunto de cards e a
   * pill derivada do `status` grosso. A visão mais pobre era a de quem opera a
   * fase (medido no stage com a CCOB, `PCR-VITORIA-000123/2026`).
   *
   * `GET .../contrato` e `GET .../aprovacao` deixaram de filtrar por papel: ler
   * a fase é consequência de poder abrir a oportunidade, e o que recorta é o
   * PAYLOAD (`contrato-read-roles.ts`, `obra-read-roles.ts`). Sem gate na API, a
   * permissão espelho não tem o que espelhar — e o CLAUDE.md é explícito: "se
   * ela não tem gate na API, provavelmente não deveria existir".
   *
   * A ESCRITA da fase continua recortada, logo acima: `ContractDraftManage`,
   * `ContractSignatureSend`, `ContractSignatureVoid`, `ContractSignatureRemind`,
   * `ContractBankDataRequest` e `ContractConclude`.
   */

  /**
   * Ler o levantamento de perfil/risco/crédito (`GET .../perfil-credito`).
   *
   * Espelha `@Roles(LT, SNEG, CCOB, ADMIN)` do `PerfilCreditoController` —
   * o MESMO conjunto de `GarantiaView`, e por isso mesmo declarado à parte:
   * são duas rotas distintas, e amarrar uma à outra faria a tela seguir a
   * permissão errada no dia em que um dos dois `@Roles` mudar.
   *
   * Existe desde 25/08/2026, quando a tela da oportunidade em análise passou a
   * ser a mesma para todos os perfis: a linha "Perfil / Risco" do painel
   * "Análises" era carregada sem gate nenhum e, para os 9 perfis fora daquele
   * conjunto, o 403 renderizava "Indisponível" — que lê como queda de fonte e
   * convida a uma nova tentativa que jamais funciona.
   */
  PerfilCreditoView: 'perfil_credito.view',

  // ── Garantia permissions (GAR-21) ──────────────────────────────────────────
  // GarantiaView is NOT open to all roles: `GET garantia*` is gated, so only
  // the listed profiles may see the garantia section — others get a 403 from
  // the API and the UI must hide the section for them (same pattern as
  // ContractView). Derived from PRD §5 actors × functionalities.

  /** Read the garantia section (view-only: F0/F2 visibility). LT, SNEG, CCOB, Admin. */
  GarantiaView: 'garantia.view',
  /** Indicate the garantia via the pendência TICKET, and send the set to the CCOB prévia. LT and Admin (ADO 67947). */
  GarantiaIndicar: 'garantia.indicacao.submit',
  /**
   * Register the garantia via the opportunity CARD (01b). LT, SNEG and Admin
   * (ADO 67947, fechado em 11/09/2026).
   *
   * Espelha `GARANTIA_CARD_WRITE_ROLES` no backend. ⚠️ Sempre composta com
   * `indicacoesEditaveis` — é ele que a limita ao preenchimento; ver o mapa.
   */
  GarantiaIndicarNoCard: 'garantia.indicacao.card',
  /** Record/approve/reject the análise prévia (F2 — CCOB decision). CCOB and Admin. */
  GarantiaPreviaDecidir: 'garantia.previa.decide',
  /** Register the minuta in Netlex (F3 — SNEG elaborates). SNEG and Admin. */
  GarantiaMinutaRegistrar: 'garantia.minuta.register',
  /**
   * Reatribuir o FLUXO DE GARANTIA a outro analista da SNEG (20/09/2026).
   *
   * Espelha `@Roles(SNEG, ADMIN)` de `garantia:reatribuir-sneg`, o mesmo gate de
   * `garantia:salvar-minuta` — quem responde pela etapa é quem a redistribui.
   *
   * ⚠️ **Não é `GarantiaPreviaDecidir`.** Aquela é da CCOB e governa a
   * reatribuição da análise PRÉVIA; usá-la aqui daria à CCOB um CTA que a API
   * recusa com 403, e tiraria da SNEG o único conserto da própria atribuição.
   */
  GarantiaSnegReatribuir: 'garantia.sneg.reassign',

  // ── Franquia permissions (FRQ-17) ─────────────────────────────────────────
  // FranquiaView is NOT all roles: the GET franquia* routes are gated, so
  // binding it to every role would expose the section to profiles the API
  // rejects with 403 (same reasoning as ContractView/GarantiaView).
  // Expansão has the LT's authority since 28/09/2026 (Matriz RBAC v2.1 —
  // `LT_AUTHORITY_ROLES`). All bindings are provisional (gap G4, WS#6/WS#9).

  /** Read the franquia section (proposal, FAP, potential). LT, SNEG, GestorFranquias, ConsultorExpansao, Admin. */
  FranquiaView: 'franquia.view',
  /** Create/edit franquia proposal data, FAP and potential (FRQ-2/3), and the LT recall (RN-F6-04). LT, SNEG, ConsultorExpansao, Admin. */
  FranquiaPropostaManage: 'franquia.proposta.manage',
  /**
   * Os **LIMITES** do royalty — royalty mínimo, fundo de marketing, piso, teto,
   * valor fixo e valor mínimo mensal (RN-F2-06, travados ao LT).
   * GestorFranquias, ConsultorExpansao, Admin.
   *
   * ⚠️ **Não governa mais as exceções programadas** — elas têm permissão
   * própria (`FranquiaExcecaoManage`) desde o ADO 67802.
   */
  FranquiaRoyaltyOverride: 'franquia.royalty.override',
  /**
   * Exceção programada de royalties — criar, alterar e remover (ADO 67802).
   * LT, SNEG, GestorFranquias, ConsultorExpansao, Admin — espelho exato de `@Roles`
   * em `POST`/`PATCH`/`DELETE .../excecoes`.
   *
   * ⚠️ Esta permissão é só o **piso** (o perfil). O teto é o veredito do
   * backend `vereditos.editavelPorFranquia.excecoesProgramadas`, que conhece a
   * FASE da proposta: o LT deixa de alterar quando ela entra em análise. Os
   * dois têm de ser consultados juntos, senão a tela oferece ao LT um controle
   * que a API recusa com 409.
   *
   * ⚠️ Não reusar `FranquiaRoyaltyOverride` (exclui o LT — era o defeito) nem
   * `FranquiaPropostaManage` (exclui o GestorFranquias, a quem a API abre).
   */
  FranquiaExcecaoManage: 'franquia.excecao.manage',
  /**
   * Parâmetros comerciais da franquia: modelo de loja, **taxa de franquia e
   * número de parcelas**, e maturação. LT, SNEG, GestorFranquias, ConsultorExpansao,
   * Admin — espelho exato de `@Roles` em `PUT .../modelo-loja`,
   * `PUT .../royalty` e `PUT .../maturacao`.
   *
   * ⚠️ NÃO é `FranquiaRoyaltyOverride`. Aquela permissão é dos **limites**
   * (royalty mínimo, fundo de mkt, piso, teto, valor fixo) e das exceções
   * programadas, que a RN-F2-06 reserva ao time de franquia e que
   * `FranquiaF2Service.setRoyaltyEstrutura` recusa por campo. A taxa e as
   * parcelas viajam na MESMA rota, mas ficam de fora daquele recorte — o PRD F2
   * as lista com `Edit. = Sim`, e o próprio backend registra que travar a rota
   * inteira "made an LT's franchise fee unwritable".
   *
   * ⚠️ Também não é `FranquiaPropostaManage`, que exclui o GestorFranquias —
   * usá-la aqui esconderia do time de franquia um card que a API lhe abre.
   */
  FranquiaModeloParametrosManage: 'franquia.modelo_parametros.manage',
  /** Antecipated parecer (RN-F6-02). GestorFranquias, ConsultorExpansao, Admin. */
  /** Reject the antecipated parecer — decider minus Consultor (Graziella · ADO 68191). */
  FranquiaParecerRejeitar: 'franquia.parecer.rejeitar',
  FranquiaParecerDecidir: 'franquia.parecer.decide',
  /** Maintain Anexo A catalogue and routing table J10. GestorFranquias, Admin. (+SNEG urgência — pending confirmation.) */
  FranquiaParametrizacaoManage: 'franquia.parametrizacao.manage',
  /**
   * Maintain the franchise-fee table — default fee and instalment ceiling per
   * bandeira × formato de loja (Bugs 67575 / 67594). BpFinanceiro,
   * GestorFranquias, Admin.
   */
  FranquiaTaxaParametrizacaoManage: 'franquia.taxa_parametrizacao.manage',
  /**
   * Maintain the royalty LIMITS table — patamares mínimos, valor fixo, piso,
   * teto and valor mínimo mensal per bandeira (ADO 67867). BpFinanceiro, Sneg,
   * GestorFranquias, Admin — the four profiles the ticket names.
   */
  FranquiaLimiteRoyaltyManage: 'franquia.limite_royalty.manage',

  // ── Opportunity edit (COR-12) ─────────────────────────────────────────────
  /**
   * Edit Dados da Oportunidade via `PATCH /v1/opportunities/:id` (COR-12).
   *
   * ⚠️ **Deixou de ser "the same roles as OpportunityCreate" em 03/09/2026
   * (ADO 68140).** Editar é ato sobre oportunidade que já existe, e o Consultor
   * de Expansão continua aqui — perdeu só a ABERTURA. As duas listas divergem
   * de propósito; ver `OPPORTUNITY_CREATE_ROLES` no backend.
   */
  OpportunityEdit: 'opportunity.edit',
  /**
   * Compose/elect the proposals of an opportunity (`PUT
   * /v1/opportunities/:id/proposals`, RN-F2-04). PRD §7.2 gives this activity
   * to the LT/EV; the SNEG joined on 26/08/2026 by the business call that she
   * does everything the LT does — divergence registered on
   * `OPPORTUNITY_COMPOSITION_ROLES` (api/src/opportunities/domain/).
   */
  OpportunityCompose: 'opportunity.compose',

  /**
   * Disparar o GATE 1 — `POST .../transitions { event: ENVIAR_PARA_ANALISE }`.
   *
   * Espelha `TRANSITION_AUTHORITY[EnviarParaAnalise]` do backend
   * (`apps/api/src/workflow-orchestration/domain/transition-authority.ts`):
   * LT, Gerente Varejo, Consultor de Expansão, Gestor de Franquias, SNEG, Admin
   * — SUPERCONJUNTO de `OpportunityCreate`, porque quem pode criar a
   * oportunidade tem de poder submetê-la (não há transição de volta a
   * `EM_PREENCHIMENTO` para outro perfil consertar).
   *
   * ⚠️ As duas listas DIVERGEM desde 03/09/2026 (ADO 68140): o Consultor de
   * Expansão perdeu a abertura e continua aqui. Ele cria a proposta de franquia
   * numa oportunidade de que é membro (ADO 67865), e tirá-lo do envio o
   * prenderia com a proposta pronta e sem como submetê-la.
   *
   * ⚠️ **Não reuse `Permission.Write` aqui** — era o que este CTA fazia até
   * 26/08/2026, e `Write` é "todos menos Visualizador e Expansão". Com a
   * autoridade por transição no backend, SPCOM, CCOB, BP Financeiro e
   * Integridade passariam a ver um botão que a API recusa com 403: a
   * divergência tela × gate que o repo persegue. Também **não reuse
   * `OpportunityCompose`**, que exclui a SNEG de propósito (ela analisa, não
   * elege) — excluí-la do envio prenderia a oportunidade que ela mesma criou.
   */
  OpportunitySubmitForAnalysis: 'opportunity.submit_for_analysis',
  /**
   * Criar a proposta e editar os blocos de detalhe dela (F3–F9 — criação,
   * situação do posto, produtos, recursos financeiros, itens financeiros,
   * investimentos, fotos). Espelha `POSTO_PROPOSAL_WRITE_ROLES` no backend
   * (`apps/api/src/proposals/domain/proposal-write-roles.ts`).
   *
   * ⚠️ **A SNEG entra aqui desde 26/08/2026 (ADO 67914).** O PRD F3–F9 dá as
   * seções ao LT/EV e este docblock afirmava que *"SNEG acts via
   * devolver/solicitar-ajuste"*; o negócio corrigiu no próprio ticket:
   * *"Perfil de SNEG pode fazer tudo o que o LT tem permissão + parte de
   * análise."* Sem ela, o CTA "+ Nova proposta" e a opção PCR do
   * `NovaPropostaSelectorModal` simplesmente não renderizavam — que é o bug
   * relatado.
   *
   * ⚠️ **Não é `OpportunityCompose`.** Eleger a proposta continua excluindo a
   * SNEG de propósito (RN-F2-04 / PRD §7.2 — ela analisa, nunca elege).
   *
   * Não cobre os campos da minuta (CTR-F1), cujo `PATCH` já incluía a SNEG por
   * outra razão.
   */
  ProposalManage: 'proposal.manage',
  /**
   * Corrigir o PERÍODO DE ANÁLISE da proposta ("Dados da proposta" →
   * Início/Fim da análise), pela rota dedicada
   * `PATCH /v1/proposals/:id/periodo-analise`.
   *
   * ⚠️ **É `ProposalManage` MAIS o BP Financeiro** — e por isso é permissão
   * própria em vez de reuso: o relato do defeito nomeia SNEG, BP Financeiro e
   * ADMIN como os perfis que respondem pela retroatividade do padrão comercial,
   * e o backend abriu **só esta rota** a ele (o `PATCH` genérico carrega
   * `aceleraMais`, que move o gate da alçada).
   *
   * Espelha `ANALYSIS_WINDOW_EDIT_ROLES`.
   */
  ProposalAnalysisWindowEdit: 'proposal.analysis_window.edit',
  /**
   * Editar os campos que a OBRA define no item gerado por ela — os quatro do
   * recurso financeiro (qtd. de parcelas, valor da parcela, índice de correção,
   * periodicidade) e os três do investimento (detalhamento do item, valor
   * unitário, valor de aquisição), a lista do §6 do documento de 09/09/2026.
   *
   * O §6 travava esses campos para TODO perfil. O Bug 68395 nomeou a exceção:
   * *"não poderão ser alterados (exceto pela SNEG)"* e *"exceto pelo time SNEG
   * que deverá poder editar"*.
   *
   * ⚠️ **Isto não é autoridade de escrita — é o RECORTE dela.** Quem não tem
   * `ProposalManage` não chega a abrir o diálogo; quem tem, mas não está aqui,
   * abre com os sete campos desabilitados. Por isso é permissão própria e não
   * `SnegAnalysis`: aquela abre a bancada da analista (`04-analise-sneg`) e
   * fecha durante a análise, enquanto esta vale exatamente enquanto a proposta
   * é editável.
   *
   * Espelha `CAMPOS_TRAVADOS_POR_OBRA_BYPASS_ROLES`
   * (`api/src/proposals/domain/campos-travados-por-obra.ts`), que é quem de
   * fato recusa o `PUT` com 400. Mover uma lista sem a outra faz a tela
   * oferecer o campo que a API recusa — ou desabilitar o que ela aceita.
   */
  ObraCamposTravadosEditar: 'obra.campos_travados.editar',
  /**
   * Attach/replace/detach documents (opportunity checklist + client
   * repository). "Anexar documentos" is the LT's task (PRD Análise SNEG) and
   * the SNEG joins by the business call of 26/08/2026; the CCOB confers and
   * rejects via pendência (ADO 67906) — reading and downloading stay open to
   * everyone.
   */
  DocumentManage: 'document.manage',
  /**
   * Attach/replace/detach documents in the CLIENT repository
   * (`CUSTOMER_DOCUMENT_WRITE_ROLES`). Split from `DocumentManage` on
   * 28/09/2026: the Matriz RBAC v2.1 gives "Documentos do cliente" as view-only,
   * so Expansão, SPCOM and TI Sustentação — who attach on the OPPORTUNITY
   * checklist like the LT — stay out of it.
   */
  CustomerDocumentManage: 'customer_document.manage',
  /**
   * Conferência do documento anexado — "Validar", "Desfazer validação" e
   * "Solicitar reenvio" (RN-F9-03).
   *
   * ⚠️ **É da SNEG E da CCOB** — a união de duas decisões. A RN-F9-03 atribui a
   * conferência à SNEG; o ADO 67906 (26/08/2026) a moveu para a CCOB
   * (*"Somente perfil CCOB pode validar e solicitar reenvio"*); e em
   * 31/08/2026 o negócio pediu a SNEG de volta **sem** tirar a CCOB. Espelha
   * `DOCUMENT_VALIDATE_ROLES` no backend.
   *
   * Consequência no rótulo: o selo da tela é **neutro** ("✓ Validado"). Ele
   * nomeou os dois perfis errados em sequência ("pela SNEG", depois "pela
   * CCOB"), e com dois perfis conferindo qualquer nome ali afirma quem fez o
   * trabalho sem saber — quem fez está em `validated_by_id`.
   *
   * Autoridade SEPARADA de {@link DocumentManage} de propósito, espelhando o
   * backend: quem ANEXA é o LT/EV, quem CONFERE é a CCOB. Reusar a permissão de
   * anexar era o bug original — o analista via os itens no menu e o clique não
   * fazia nada, porque o guard de escrita do LT o barrava antes da chamada.
   */
  DocumentValidate: 'document.validate',

  // ── DDI permissions (RN-F10) ───────────────────────────────────────────────
  // Mirror the `@Roles(...)` guards on DdiController. Both are provisional
  // (gap G4, WS#6/WS#9) and must move together with the backend lists.

  /**
   * Submit Integridade's parecer: reviewed risk + verdict (liberar/reprovar)
   * — RN-F10-05. Integridade and Admin.
   */
  DdiReclassify: 'ddi.reclassify',
  /** Ask the LT for a document needed to rule on the DDI. Integridade and Admin. */
  DdiRequestDocument: 'ddi.request_document',
  /** Record the LT decision on an ALTO-risk DDI (RN-F10-06). LT and Admin. */
  DdiDecide: 'ddi.decide',
  /** Read the DDI (card, row, panel) — Matriz RBAC v2.1 "Análise DDI" Visualizar. */
  DdiView: 'ddi.view',
  /** Reassign the minuta analyst — mirrors `minuta/atribuicao:reatribuir` (SNEG, BP, Admin). */
  ContractDraftAssign: 'contract.draft.assign',
  /** "Cancelar oportunidade" in the DDI decision — Matriz RBAC v2.1 "Cancelar oportunidade". */
  DdiCancel: 'ddi.cancel',
  /** Devolver ao LT / solicitar ajuste — Matriz RBAC v2.1 "Rejeitar / devolver". */
  OpportunityReturn: 'opportunity.return',
  /**
   * Reexecutar a DDI em `ERRO` — o "↻ Tentar novamente" (`POST .../ddi:run`).
   *
   * Espelha `DDI_RUN_ROLES` do backend (24/09/2026): quem compõe a oportunidade
   * mais a Integridade. Até ali a rota não tinha `@Roles` e o botão lia
   * `Permission.Write` — CCOB, SPCOM, BP Financeiro e TI Sustentação
   * reexecutavam uma análise que consome crédito na NeoWay.
   */
  DdiRun: 'ddi.run',

  // ── Governança / audit trail (F14) ─────────────────────────────────────────

  /**
   * Entrar na Governança — o gate da ROTA `/governanca`, do item do menu, da
   * crumb "Governança" e do "← Voltar para Governança" das telas de
   * parametrização. **BP Financeiro, Gestor de Franquias e TI Administrador.**
   *
   * ## Por que é uma permissão PRÓPRIA, e não mais a união do que há dentro
   *
   * Até 20/09/2026 a entrada era `GOVERNANCA_PERMISSIONS`, a UNIÃO das
   * permissões das abas e dos cartões. A união é derivada, o que era a virtude
   * dela — ninguém escreve uma segunda lista —, mas ela responde à pergunta
   * errada: *"este perfil tem alguma coisa aqui dentro?"* em vez de *"este
   * perfil pode entrar na Governança?"*. No dia em que o negócio separou as
   * duas respostas, a união deixou de servir.
   *
   * O pedido de 20/09/2026, verbatim: *"O perfil SNEG não deve ter acesso a
   * governança. Apenas BP Financeiro, Gestor Franquias e TI Administrador devem
   * ter acesso."* Na época a SNEG **continuava** dona de `/sneg/parametrizacao`
   * (a permissão daquela tela, hoje `SnegPadroesBpGovernanca`) e da estrutura de royalties
   * (`FranquiaLimiteRoyaltyManage`, os quatro perfis do ADO 67867) — duas
   * permissões que a união varria para dentro. Ou seja: tirar a SNEG da
   * Governança pela união exigiria tirar dela autoridade que ninguém pediu e que
   * outro ticket concedeu.
   *
   * ⚠️ **E a metade que faltava voltou como bug em 21/09/2026.** Ter cartão lá
   * dentro deixou de garantir entrada — mas o inverso não foi fechado: a SNEG
   * **continuou abrindo as duas telas por URL direta**, porque a entrada é o gate
   * de `/governanca`, não o das superfícies. O negócio devolveu a frase com o
   * caso concreto: *"Remover o acesso de SNEG à tela /sneg/parametrizacao por URL
   * direta. SNEG não deve ter acesso a nada de governança."* Desde então as duas
   * permissões de superfície também perderam a SNEG, e o invariante está preso em
   * `auth-permissions.test.ts`: **nenhum perfil tem permissão de uma superfície
   * de `GOVERNANCA_SURFACES` sem ter `GovernancaAccess`.**
   *
   * Quem está fora desta lista recebe `NotFoundScreen` em `/governanca`, não vê o
   * item no menu e — agora — também recebe `NotFoundScreen` nas telas de
   * parametrização. A crumb "Governança" e o botão de volta daquelas telas seguem
   * GATEADOS: é rede, não decoração, para o dia em que um perfil entrar numa
   * superfície sem entrar na área.
   *
   * A fonte concorda com os três perfis: o Anexo B do
   * `PRD_Admin_Backoffice_Governanca_EspecFuncional_v0.1` (baseline do SailPoint
   * ISC preenchido pela Vibra) dá "Tabelas de parâmetros" como **Edição** ao BP
   * Financeiro, **Criação/visualização/edição** ao TI Administrador e apenas
   * **Visualização** à SNEG e ao Gestor de Franquias. O pedido é a decisão D-01
   * da §12 daquele PRD, no sentido do baseline.
   */
  GovernancaAccess: 'governanca.access',
  /** See every parametrização tab read-only (SPCOM) — Matriz RBAC v2.1 Governança "Visualizar". */
  GovernancaView: 'governanca.view',

  /**
   * Ver a aba **Auditoria** da Governança — a trilha (`GET /v1/auditoria`).
   * **Apenas o TI Administrador** (21/09/2026).
   *
   * ⚠️ **Terceira lista em três dias, e cada passo tem dono.** Era `[SNEG, Admin]`
   * até 20/09, quando a SNEG saiu da Governança e "todas as seções" passaram ao BP
   * Financeiro; em 21/09 o negócio pediu *"remover as seções documentos, franquia,
   * parametrização e auditoria do perfil de BP Financeiro"*, e sobrou a
   * administração técnica. A trilha tem **uma** superfície no produto, esta aba.
   *
   * ⚠️ **A rota é o ESPELHO EXATO desta lista** — `@Roles(ADMIN)`. Foi medido
   * (20/09) que deixar a rota mais larga que a aba mantém o perfil removido lendo
   * a trilha inteira por API: a SNEG respondia **200** depois de perder a tela.
   * Estreitar as duas metades juntas é o que faz a remoção significar alguma
   * coisa.
   *
   * ⚠️ **Divergência registrada com a F6** do PRD de Dashboards/Auditoria, que
   * descreve SNEG/Integridade e TI Sustentação como consumidores da trilha. A
   * Integridade sai junto porque carrega `COMPLIANCE` sem grupo próprio, e manter
   * a role para ela devolveria o acesso à SNEG. Reabrir é um perfil por vez, com
   * o negócio nomeando qual — nunca a lista larga inteira de volta.
   */
  AuditTrailView: 'audit_trail.view',

  /**
   * A aba **SNEG** da Governança (`15-governanca.html` — "Distribuição SNEG"):
   * listar as gerências, **editar** o analista de uma delas e **reatribuir** a
   * carteira em curso. BP Financeiro e TI Administrador.
   *
   * ⚠️ **NÃO é `SnegPadroesBpGovernanca`**, embora as duas listas tenham
   * convergido em 21/09/2026: aquela governa a aba **Padrões de BP**
   * (`sneg_bp_standards`), esta governa a aba de distribuição
   * (`sneg_assignments`). São duas perguntas; unificá-las
   * faria a próxima mudança de uma arrastar a outra em silêncio. O que mudou é
   * que a SNEG saiu das duas — não entra na Governança desde 20/09/2026 e não
   * alcança mais as superfícies dela desde 21/09/2026.
   *
   * Espelha dois gates do backend, que são o piso desta tela:
   * `@Roles(BP_FINANCEIRO, ADMIN)` em `/v1/analise/distribuicao[:reatribuir]` e
   * o `BP_FINANCEIRO` acrescentado ao `PUT /v1/sneg/distribuicao/:gerencia`.
   */
  SnegDistribuicaoGovernanca: 'sneg.distribuicao.governanca',

  /**
   * A aba **CCOB** da Governança ("Distribuição CCOB"): listar as gerências,
   * **editar** o analista da CCOB que responde pela análise prévia da garantia
   * em cada uma (04/09/2026) e **reatribuir** a fila em curso (08/09/2026).
   * **BP Financeiro e TI Administrador** (20/09/2026).
   *
   * Espelha `CCOB_DISTRIBUICAO_WRITE_ROLES` — o `@Roles` das duas rotas de
   * `/v1/ccob/distribuicao` e do `POST /v1/garantia/distribuicao:reatribuir`,
   * que é o piso desta tela.
   *
   * ⚠️ **`Role.Ccob` SAIU daqui e do backend em 20/09/2026**, e o pedido nomeia
   * esta aba em uma frase própria: *"A distribuição CCOB deve aparecer para BP
   * Financeiro e TI Administrador"* — dentro de *"Apenas BP Financeiro, Gestor
   * Franquias e TI Administrador devem ter acesso"* à Governança. A CCOB entrava
   * porque a fila é dela; o negócio decidiu que quem PARAMETRIZA a fila é a
   * governança, não a área. A `@Roles` das duas rotas foi estreitada no mesmo
   * commit: manter a API aberta deixaria a autoridade sem superfície nenhuma que
   * a exerça, e a lista existe para espelhar o gate, não para guardar história.
   *
   * ⚠️ Isto **não** toca a reatribuição de UMA garantia específica
   * (`POST .../garantia:reatribuir`, `@Roles(CCOB, ADMIN)`), que segue com a
   * CCOB: é a correção caso a caso na tela da garantia, e o Anexo B do PRD de
   * Governança dá à CCOB direito sobre a Análise Prévia — o que ele não lhe dá é
   * direito sobre tabela de parâmetro.
   *
   * ⚠️ Não confundir com a REATRIBUIÇÃO de uma garantia específica
   * (`POST .../garantia:reatribuir`, `@Roles(CCOB, ADMIN)`): esta é a
   * parametrização que vale daí em diante; aquela troca o responsável de uma
   * análise já em curso.
   */
  CcobDistribuicaoGovernanca: 'ccob.distribuicao.governanca',

  /**
   * Ver e editar a aba **Governança → Distribuição Franquias** — a tabela
   * `(bandeira, gerência) → executivo de franquia` que decide quem entra na
   * equipe da oportunidade quando uma proposta BR Mania ou Lubrax+ é criada
   * (pedido de 19/09/2026).
   *
   * Espelha `ROTEAMENTO_FRANQUIA_WRITE_ROLES` — o `@Roles` das duas rotas de
   * `/v1/roteamento-franquia/distribuicao`, que é o piso desta aba.
   *
   * ⚠️ **O Gestor de Franquias entra pela mesma razão que a CCOB entra na
   * permissão vizinha:** a fila é dele, e a coordenação da área é quem sabe qual
   * executivo cobre qual gerência. Reusar a permissão da CCOB abriria esta aba
   * para quem não responde por ela.
   */
  RoteamentoFranquiaGovernanca: 'franquia.roteamento.governanca',

  /**
   * Ver a aba **Governança → Política comercial** — documentos de política
   * (`PL-1BR-00003`, `PG-1BR-00019`), parâmetros de referência para aderência,
   * limites de exceção, WACC/TMA, os limiares de alçada do Salesforce e a verba
   * de BP. **BP Financeiro e TI Administrador** (20/09/2026).
   *
   * Espelha `POLITICA_COMERCIAL_READ_ROLES` no backend
   * (`GET /v1/sneg/politica-comercial`), estreitado no mesmo commit.
   *
   * ⚠️ **`Role.Sneg` SAIU daqui em 20/09/2026** — a SNEG não tem mais acesso à
   * Governança, e esta aba não tem outra superfície. O badge do protótipo diz
   * "Dono: SNEG + BP Financeiro" no card de parâmetros de referência, e a
   * divergência é deliberada: o badge nomeia quem REVISA o documento fora desta
   * plataforma, não quem abre a aba. Como a aba é somente leitura, a SNEG não
   * perde nenhuma escrita — os dois números que a aba exibe (`sneg_bp_standards`)
   * são mantidos na aba vizinha **Padrões de BP**, e esta apenas os LÊ.
   *
   * ⚠️ **Somente leitura.** Não existe escrita nesta aba: os documentos são
   * revisados pela área dona fora desta plataforma, os limiares são
   * parametrizados no Salesforce e a verba não tem rota de edição.
   */
  PoliticaComercialView: 'politica_comercial.view',

  /**
   * Ver a aba **Governança → Documentos** — o catálogo de documentos e
   * etapa-limite (`document_parametrizations`) e os documentos exigidos por
   * modalidade de garantia. **Apenas o TI Administrador** (21/09/2026).
   *
   * ⚠️ **Terceira lista em três dias.** Era `[SNEG, Admin]`, espelhando o
   * `@Roles(SNEG)` da ESCRITA; em 20/09/2026 a SNEG saiu da Governança e "todas as
   * seções" passaram ao BP Financeiro; em 21/09/2026 o negócio pediu *"Documentos
   * deve ficar disponível apenas para TI Administrador e deve ser possível
   * adicionar/editar os documentos"*.
   *
   * ⚠️ **É deliberadamente MAIS ESTRITA que a API de LEITURA.**
   * `GET /v1/documents/parametrization` **não tem `@Roles`** e não pode ganhar
   * um: ele alimenta o select "Tipo do documento" do repositório do cliente
   * (`/api/clients/[id]/repository`), então gatear a leitura quebraria o LT. O
   * gate vive aqui, e é UX.
   *
   * ⚠️ O segundo card da aba (documentos por modalidade de garantia) lê
   * `GET /v1/garantia/documentos-por-modalidade`. Aquela rota ganhou
   * `BP_FINANCEIRO` em 20/09/2026 por causa desta aba, e o perdeu em 21/09/2026
   * com ela: role cujo único motivo desapareceu é autoridade que ninguém sabe
   * explicar no próximo ticket. `SNEG` e `CCOB` ficam lá — o motivo delas é de
   * DOMÍNIO, não de aba.
   *
   * ⚠️ **Passou a permitir ESCRITA em 21/09/2026**, no mesmo pedido: *"deve ser
   * possível adicionar/editar os documentos"*. A aba era somente leitura porque o
   * `PUT` respondia 404 em todo ambiente pela feature-flag
   * `DOCUMENTS_PARAMETRIZATION_ENABLED` — que foi **removida**, não ligada. O
   * `POST` (criar) nasceu no mesmo commit, e `DOCUMENT_PARAMETRIZATION_WRITE_ROLES`
   * (`[ADMIN]`) é o espelho desta permissão.
   *
   * ⚠️ **Não há remoção**: tirar de circulação é `selectable: false` (VBR-645) —
   * o documento já anexado continua legível.
   */
  DocumentParametrizationView: 'document_parametrization.view',

  /**
   * Ver e editar a aba **Governança → Campos obrigatórios** — quais campos da
   * proposta a conferência da SNEG cobra, por tipo de proposta (RN-F1-03).
   * **Apenas o TI Administrador** (21/09/2026).
   *
   * > *"Puxar Parametrização → Parametrização SNEG → Campos obrigatórios para a
   * > raiz de Governança. Apenas TI Administrador deve acessar e editar."*
   *
   * ⚠️ **O bloco MUDOU de casa, não foi copiado.** Ele saiu de
   * `/sneg/parametrizacao` e virou aba própria. A tabela é a mesma: duas
   * superfícies sobre ela divergiriam na primeira alteração. ⚠️ Aquela tela
   * ficou sem nenhum bloco horas depois — os padrões de BP viraram aba também —
   * e foi REMOVIDA no mesmo dia.
   *
   * ⚠️ **Acessar e editar são a MESMA lista, e isso é o pedido.** Não existe modo
   * somente-leitura nesta aba — ninguém chega a ela sem poder salvar —, e por
   * isso o card não tem estado de leitura. Se um dia as duas perguntas se
   * separarem, o estado tem de nascer ANTES de a lista mudar
   * (`campos-obrigatorios-card.test.tsx` prende a premissa).
   *
   * ⚠️ **Consequência nomeada: a SNEG perde a edição da tabela que a análise
   * DELA consome.** É divergência com a RN-F2-03 do PRD (que atribui campos
   * obrigatórios à SNEG) e está no sentido do Anexo B do PRD de Governança, que
   * dá à SNEG **Visualização** e ao TI Administrador criação/edição.
   *
   * ⚠️ **O `GET` usa a mesma lista desde 24/09/2026.** Ele ficou aberto sob a
   * premissa de que a conferência do analista o consumia — ela lê a tabela
   * in-process no backend, nunca pela rota.
   */
  SnegCamposObrigatoriosGovernanca: 'sneg.campos_obrigatorios.governanca',

  /**
   * Ver o card **Verba (BP) disponível** dentro de "Recursos financeiros" da
   * proposta — barra, percentual, `R$ x de R$ y utilizados` e o alerta
   * `⚠ BP excedido` (ADO 67805). BP Financeiro, SNEG, TI Administrador,
   * Gerente Varejo e TI Sustentação.
   *
   * ⚠️ **É gate de INFORMAÇÃO, não de controle.** Diferente das permissões
   * vizinhas, esta não esconde um botão: esconde um DADO. Por isso o espelho no
   * backend não é um `@Roles` de rota — o LT continua lendo e escrevendo o
   * recurso financeiro —, e sim a omissão do campo `bpBudget` (e do aviso
   * `"BP excedido"`) em `FinancialResourcesService.composeResult`, governada por
   * `BP_BUDGET_VIEW_ROLES` (`apps/api/src/proposals/domain/bp-budget-visibility.ts`).
   * A tela consulta esta permissão para não depender só da ausência do campo.
   *
   * ⚠️ **O LT NÃO tem** — e é a exceção deliberada ao "a SNEG cobre o LT"
   * pelo lado oposto: aqui quem fica de fora é o LT, então o invariante de
   * `auth-permissions.test.ts` não é tocado. Consequência aceita: o LT deixa de
   * ver o alerta de estouro da verba (decisão do ticket — a informação inteira
   * é restrita).
   *
   * ⚠️ Não reusar `FinancialItemTypeParametrizacaoManage` (`[BpFinanceiro,
   * Admin]`, autoridade sobre o CATÁLOGO de receitas/despesas) nem
   * `ProposalManage`: são conjuntos diferentes e amarrá-los faria esta
   * informação seguir a permissão errada.
   */
  BpBudgetView: 'bp_budget.view',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/** Profiles that only consult (mirrors `READ_ONLY_ROLES` on the backend). */
const READ_ONLY_ROLES: readonly Role[] = [Role.Visualizador];

/**
 * Profiles with the LT's authority inside the opportunity (Matriz RBAC v2.1 ·
 * 28/09/2026) — mirrors `LT_AUTHORITY_ROLES` in `api/src/auth/access-profiles.ts`.
 */
export const LT_AUTHORITY_ROLES: readonly Role[] = [
  Role.LT,
  Role.Expansao,
  Role.Spcom,
  Role.TiSustentacao,
];

const WRITE_ROLES: readonly Role[] = Object.values(Role).filter(
  (role) => !READ_ONLY_ROLES.includes(role),
);

const PERMISSION_ROLES: Record<Permission, readonly Role[]> = {
  /*
   * Espelha `OPPORTUNITY_CREATE_ROLES` do backend (`opportunities/domain/`).
   *
   * ⚠️ **O Consultor de Expansão saiu em 03/09/2026 (ADO 68140).** A abertura
   * da oportunidade é exclusiva do LT/gestão comercial; ele "atua apenas nas
   * propostas de franquia de oportunidades existentes das quais é membro"
   * (Test Case 68120). Consequência de tela: o `NewOpportunityButton` não
   * renderiza para ele e `/oportunidades/nova` cai em `NotFoundScreen` — o
   * mesmo desfecho de qualquer rota sem permissão.
   *
   * ⚠️ **NÃO reuse esta lista para `OpportunityEdit`, `OpportunityCompose` nem
   * `OpportunitySubmitForAnalysis`.** Os três são atos sobre oportunidade que
   * JÁ existe e continuam com o consultor, exatamente como o Test Case
   * autoriza; estreitá-los junto o deixaria criar a proposta de franquia sem
   * conseguir submetê-la.
   */
  // Sem o Consultor de Expansão: "não abre oportunidade mas abre e edita proposta
  // de franquia" (Graziella, 28/09/2026 — ADO 68140).
  [Permission.OpportunityCreate]: MATRIZ_CRIAR_EDITAR.filter((r) => r !== Role.ConsultorExpansao),
  [Permission.SnegAnalysis]: MATRIZ_ANALISE_OPORTUNIDADE,
  // Matriz RBAC v2.1: "Enviar para aprovação" do lado comercial (28/09/2026).
  [Permission.AlcadaSimular]: MATRIZ_ENVIAR_APROVACAO,
  /*
   * A aba **Padrões de BP** (era a tela `/sneg/parametrizacao`, removida em
   * 21/09/2026) — sobrou o TI Administrador. Espelha
   * `SNEG_PADROES_BP_WRITE_ROLES` no backend.
   *
   * ⚠️ **Duas retiradas independentes em 21/09/2026, por PRs diferentes:** a
   * `SNEG` (*"SNEG não deve ter acesso a nada de governança"* — a tela é
   * superfície da Governança, e quem não entra não a alcança nem por URL direta)
   * e o `BP_FINANCEIRO` (*"remover … parametrização … do perfil de BP
   * Financeiro"*, que lhe tirou o cartão que levava até aqui). Quem reabrir uma
   * não reabre a outra.
   *
   * ⚠️ O BP Financeiro **mantém** o "Editar" da aba Distribuição SNEG da
   * Governança, que escreve na mesma tabela por outra superfície — daí
   * `SNEG_DISTRIBUICAO_UPSERT_ROLES` no backend.
   */
  [Permission.SnegPadroesBpGovernanca]: MATRIZ_GOVERNANCA_EXECUTAR,
  /*
   * ⚠️ **Só o TI Administrador desde 21/09/2026.** O alinhamento de 21/08/2026
   * (Bug ADO 67585) nomeava dois — *"BP Financeiro e Administrador que podem
   * editar apenas"* —, e o pedido de *"remover a seção parametrização do perfil
   * de BP Financeiro"* tirou o segundo cartão daquela aba das mãos dele. A
   * consequência é nomeada e foi aceita pelo negócio: **Receitas e Despesas passa
   * a ser mantida só pela administração técnica**, embora seja uma tabela de
   * números do BP.
   *
   * ⚠️ A DIFFERENT set from its neighbours, deliberately. It is not
   * `SnegPadroesBpGovernanca` (the `/v1/sneg/*` tables once admitted SNEG, this
   * one never did — the entity docstring had guessed an "SNEG-owned CRUD" before
   * anyone asked the business) and it is not `ProposalManage` (LT and GerenteVarejo
   * write items on the proposal; keeping them out here IS the bug fix).
   * Mirror only the @Roles of `FinancialItemTypeParametrizacaoController`.
   */
  [Permission.FinancialItemTypeParametrizacaoManage]: MATRIZ_GOVERNANCA_EXECUTAR,
  [Permission.Write]: WRITE_ROLES,
  // Contract permissions (CTR-18) — these mirror the @Roles(...) actually
  // SHIPPED on ContractsController / MinutasController (SNEG, LT, ADMIN), not
  // the SPCOM placeholder the map carried while those controllers were still
  // unbuilt. VBR-310: "se algum divergir no merge, o backend manda". The
  // signature gates (CTR-8) mirror the @Roles agreed for the assinatura routes.
  // Provisional (G4, WS#6/WS#9); move together with the backend @Roles lists.
  //
  [Permission.ContractDraftManage]: MINUTA_ASSINATURA_ROLES,
  [Permission.ContractDraftAssign]: [Role.Sneg, Role.BpFinanceiro, Role.Admin],
  [Permission.ContractSignatureSend]: MINUTA_ASSINATURA_ROLES,
  [Permission.ContractSignatureVoid]: MINUTA_ASSINATURA_ROLES,
  [Permission.ContractSignatureRemind]: [...LT_AUTHORITY_ROLES, Role.Sneg, Role.BpFinanceiro, Role.Admin],
  [Permission.ContractBankDataRequest]: [...LT_AUTHORITY_ROLES, Role.Sneg, Role.BpFinanceiro, Role.Admin],
  [Permission.ContractConclude]: [Role.Sneg, Role.BpFinanceiro, Role.Admin],
  // Matriz RBAC v2.1: todo perfil menos Integridade vê a Análise de Perfil.
  [Permission.PerfilCreditoView]: MATRIZ_PERFIL_PREVIA_VISUALIZAR,

  // Garantia permissions (GAR-21) — derived from PRD §5 actors × functionalities.
  // These are provisional (gap G4, WS#6/WS#9) and must move together with the
  // backend @Roles lists when GAR-8/GAR-9/GAR-13/GAR-15 are merged.
  //
  // Note: GarantiaView is gated, e segue gateada: ali o 403 é real e o recorte
  // é de dado de crédito/terceiro (decisão mantida em 16/09/2026). The Amaral
  // Maia external partner has no system access profile and receives no permission.
  // Matriz RBAC v2.1: todo perfil menos Integridade vê a Análise Prévia.
  [Permission.GarantiaView]: MATRIZ_PERFIL_PREVIA_VISUALIZAR,
  /*
   * Espelha `GARANTIA_INDICACAO_WRITE_ROLES` (`[LT, ADMIN]`) — a via da ANÁLISE:
   * o ticket de pendência (`garantia:indicar`), o envio à prévia da CCOB
   * (`garantia:enviar-analise-previa`) e `garantia:reconciliar`.
   *
   * ⚠️ **NÃO é o gate do card da 01b** — aquele é `GarantiaIndicarNoCard` desde
   * 11/09/2026, e a diferença é a SNEG.
   *
   * ⚠️ **A SNEG ESTEVE aqui, por um dia (ADO 67947).** O passe de 26/08/2026
   * ("Perfil de SNEG pode fazer tudo o que o LT tem permissão") a acrescentou,
   * e o negócio reverteu em 27/08/2026: *"No perfil da SNEG **em análise** não é
   * para permitir adicionar nova garantia."* Ela continua fora **daqui** porque
   * as três rotas acima SÃO a via da análise — o ticket é o que convoca o LT
   * durante ela, e o envio à prévia aciona a CCOB. Concordam o protótipo (o
   * workspace SNEG, `01c-oportunidade-analise.html`, não tem `+ Adicionar
   * garantia`) e o PRD/ADR-0023 §D4, que dá a indicação pelo ticket ao LT.
   *
   * É a segunda exceção NOMEADA do invariante "a SNEG cobre o LT"
   * (`auth-permissions.test.ts`), ao lado de `DdiDecide`.
   *
   * ⚠️ Não é `GarantiaView`: a SNEG **lê** a seção inteira (é o card somente
   * leitura do workspace dela).
   *
   * ⚠️ Não é `GarantiaPreviaDecidir`: o veredito da prévia é da CCOB
   * (`@Roles(CCOB, ADMIN)`) e é autoridade OPOSTA — quem indica a garantia não
   * a aprova. Enviar o conjunto PARA a prévia é outro ato, e é este campo.
   */
  [Permission.GarantiaIndicar]: [...LT_AUTHORITY_ROLES, Role.Admin],
  /*
   * Espelha `GARANTIA_CARD_WRITE_ROLES` (`[LT, SNEG, ADMIN]`) — as cinco
   * escritas de `garantia/indicacoes*`, que são o card da 01b.
   *
   * Pedido do negócio em 11/09/2026, fechando a leitura que o ADO 67947 deixou
   * ambígua: a SNEG **pode** cadastrar garantia enquanto a oportunidade está em
   * preenchimento e **não pode** depois que ela entra em análise. A frase
   * original da reversão já dizia *"em análise"*; foi a implementação que a
   * generalizou para toda fase, e o caso em que as duas leituras divergem
   * apareceu no stage em 11/09/2026 (`PCR-VITORIA-000115/2026`, `state = NOVOS`):
   * a SNEG sem `+ Adicionar garantia`, e a tela sem dizer por quê.
   *
   * ⚠️ **Esta permissão sozinha NÃO expressa a regra — ela tem de vir composta
   * com `indicacoesEditaveis`**, o veredito de fase que o backend publica em
   * `GarantiaTrilhaDto` (`canWrite = can(GarantiaIndicarNoCard) &&
   * indicacoesEditaveis`, em `garantias-indicadas-card.tsx`). O permission map
   * não conhece a fase; usá-la solta daria à SNEG o controle durante a análise,
   * e a API responderia 409. Do lado do backend a contrapartida é
   * `assertMutavel`, que recebe os papéis do ator justamente porque a segunda
   * porta dele (pendência aberta) é a porta do ticket.
   *
   * ⚠️ **A CCOB fica fora** — autoridade OPOSTA, e ela nunca indicou (nem no
   * passe de 26/08/2026).
   */
  [Permission.GarantiaIndicarNoCard]: [...LT_AUTHORITY_ROLES, Role.Sneg, Role.BpFinanceiro, Role.Admin],
  [Permission.GarantiaPreviaDecidir]: [Role.Ccob, Role.Admin],
  [Permission.GarantiaMinutaRegistrar]: [Role.Sneg, Role.BpFinanceiro, Role.Admin],
  /*
   * ⚠️ DISJUNTO de `GarantiaPreviaDecidir` (CCOB) de propósito: as duas
   * reatribuições da tela da garantia são atos de áreas com autoridade oposta, e
   * um gate comum deixaria cada uma trocar o responsável da outra.
   */
  [Permission.GarantiaSnegReatribuir]: [Role.Sneg, Role.BpFinanceiro, Role.Admin],

  // Franquia permissions (FRQ-17) — derived from the @Roles(...) lists of
  // FRQ-2/3/4/8. Provisional (gap G4, WS#6/WS#9); move together with backend.
  // Expansão, SPCOM and TI Sustentação follow the LT here (`LT_AUTHORITY_ROLES`).
  [Permission.FranquiaView]: MATRIZ_VISUALIZAR_TODOS,
  /*
   * Espelha `FRANQUIA_PROPOSTA_WRITE_ROLES` do backend. A SNEG entra pela mesma
   * decisão de negócio do ADO 67914 ("Perfil de SNEG pode fazer tudo o que o LT
   * tem permissão"): aquele recorte parou no posto, e o resultado medido em
   * stage foi uma analista que cria proposta mas só de POSTO — o modal "Nova
   * proposta" esconde BR Mania e Lubrax+ exatamente por esta permissão.
   *
   * ⚠️ Não é `FranquiaRoyaltyOverride` (o aceite do Royalty Premiado é
   * irreversível e o LT não o tem) nem `FranquiaParecerDecidir`. O critério é
   * literal: esta lista é "o que o LT tem".
   */
  [Permission.FranquiaPropostaManage]: [
    ...LT_AUTHORITY_ROLES,
    Role.Sneg,
    Role.BpFinanceiro,
    Role.ConsultorExpansao,
    Role.Admin,
  ],
  [Permission.FranquiaRoyaltyOverride]: [
    Role.GestorFranquias,
    Role.ConsultorExpansao,
    Role.Admin,
  ],
  [Permission.FranquiaExcecaoManage]: [
    ...LT_AUTHORITY_ROLES,
    Role.Sneg,
    Role.BpFinanceiro,
    Role.GestorFranquias,
    Role.ConsultorExpansao,
    Role.Admin,
  ],
  [Permission.FranquiaModeloParametrosManage]: [
    ...LT_AUTHORITY_ROLES,
    Role.Sneg,
    Role.BpFinanceiro,
    Role.GestorFranquias,
    Role.ConsultorExpansao,
    Role.Admin,
  ],
  [Permission.FranquiaParecerDecidir]: [
    Role.GestorFranquias,
    Role.ConsultorExpansao,
    Role.Admin,
  ],
  [Permission.FranquiaParecerRejeitar]: [Role.GestorFranquias, Role.Admin],
  // +SNEG urgência pending confirmation — do NOT add until @Roles on FRQ-3 is
  // shipped. The J10 admin screen renders NotFoundScreen via RequirePermission.
  [Permission.FranquiaParametrizacaoManage]: MATRIZ_GOVERNANCA_FRANQUIA_EXECUTAR,
  /*
   * Os perfis da tabela de taxa: Gestor de Franquias e TI Administrador.
   *
   * ⚠️ **Eram três até 21/09/2026** (o alinhamento de 21/08/2026 incluía o BP
   * Financeiro). O pedido de *"remover a seção franquia do perfil de BP
   * Financeiro"* o retirou daqui e do `@Roles` da rota — revogação, não apenas a
   * perda do atalho da Governança.
   *
   * ⚠️ A DIFFERENT set from the two neighbours, deliberately. It is not
   * `FranquiaParametrizacaoManage` (no BpFinanceiro) and not
   * `FranquiaRoyaltyOverride` (no ConsultorExpansao, and that one is authority
   * over a proposal's LIMITS, not over the table). Unifying any pair would grant
   * or withhold access the API decides differently — mirror only its @Roles.
   */
  [Permission.FranquiaTaxaParametrizacaoManage]: MATRIZ_GOVERNANCA_FRANQUIA_EXECUTAR,
  /*
   * A estrutura de royalties: Gestor de Franquias e TI Administrador.
   *
   * ⚠️ **O ADO 67867 nomeava QUATRO** — BP Financeiro, SNEG, TI Administrador e
   * Gestor de Franquias — e DOIS saíram em 21/09/2026, por pedidos
   * independentes: a SNEG (*"SNEG não deve ter acesso a nada de governança"*, e
   * este bloco é aba de `/franquia/parametrizacao`, cartão da Governança) e o BP
   * Financeiro (*"remover … franquia … do perfil de BP Financeiro"*). Quem
   * reabrir uma não reabre a outra.
   *
   * ⚠️ **A `SNEG` saiu em 21/09/2026.** O domínio não mudou: a SUPERFÍCIE é que
   * é a aba "Limites de royalty" de `/franquia/parametrizacao`, cartão da
   * Governança — e o negócio tirou a SNEG da Governança inteira (*"SNEG não deve
   * ter acesso a nada de governança"*). Mantê-la aqui devolveria a tela por URL
   * direta, que é o defeito reaberto. O `@Roles` do
   * `FranquiaLimiteRoyaltyParametrizacaoController` saiu no mesmo commit — lá o
   * gate é de CLASSE, então a leitura cai junto.
   *
   * ⚠️ **Continua sendo lista PRÓPRIA, embora hoje coincida com
   * `FranquiaTaxaParametrizacaoManage`.** Coincidência de valor não é a mesma
   * pergunta: são duas rotas com dois `@Roles`, e unificá-las faria a próxima
   * mudança de uma arrastar a outra em silêncio. Não é
   * `FranquiaParametrizacaoManage` (sem BP Financeiro) e não é
   * `FranquiaRoyaltyOverride` (que tem ConsultorExpansao — justamente o perfil
   * que o print do ticket mostra digitando `1111`, e que aqui está fora).
   * Espelha só o `@Roles` da rota.
   */
  [Permission.FranquiaLimiteRoyaltyManage]: MATRIZ_GOVERNANCA_FRANQUIA_EXECUTAR,

  // Opportunity edit (COR-12) — mirrors the @Roles(...) on PATCH
  // /v1/opportunities/:id, which is the SAME list as POST /v1/opportunities:
  // whoever may open an opportunity may correct its Dados. Binding this to a
  // narrower [LT, Sneg, Admin] would hide the Editar button from GerenteVarejo,
  // ConsultorExpansao and GestorFranquias while the API accepts their PATCH.
  [Permission.OpportunityEdit]: MATRIZ_CRIAR_EDITAR,
  /*
   * Espelha `OPPORTUNITY_COMPOSITION_ROLES` do backend, consumido pelo `@Roles`
   * de `PUT /v1/opportunities/:id/proposals` E pelo `incluirNaoEleitas` do
   * `GET` — quem não elege não tem o que fazer com a lista das que ficaram de
   * fora.
   *
   * ⚠️ A SNEG entrou em 26/08/2026, e isto REVISA a decisão do ADO 67914, que a
   * excluía citando o PRD §7.2 / RN-F2-04 ("a analista analisa, nunca elege").
   * O negócio reafirmou na revisão: tudo o que o LT faz, a SNEG faz.
   *
   * ⚠️ Não é `ProposalManage`: criar e ELEGER seguem autoridades distintas (os
   * conjuntos divergem no GerenteVarejo e nos atores de franquia).
   */
  [Permission.OpportunityCompose]: MATRIZ_CRIAR_EDITAR,
  /*
   * GATE 1 (`ENVIAR_PARA_ANALISE`). Espelha o mapa de autoridade por transição
   * do backend — ver o docblock do membro. Provisional (G4, WS#6/WS#9); move
   * junto com `TRANSITION_AUTHORITY`.
   */
  [Permission.OpportunitySubmitForAnalysis]: MATRIZ_ENVIAR_ANALISE,
  // Espelha `POSTO_PROPOSAL_WRITE_ROLES` do backend. ConsultorExpansao e
  // GestorFranquias são atores de franquia, não de posto, e ficam de fora
  // (Bug 67590 / VBR-590); a SNEG entra por decisão do negócio (ADO 67914).
  [Permission.ProposalManage]: [
    ...LT_AUTHORITY_ROLES,
    Role.GerenteVarejo,
    Role.Sneg,
    Role.BpFinanceiro,
    Role.Admin,
  ],
  /*
   * Espelha `ANALYSIS_WINDOW_EDIT_ROLES` do backend: `POSTO_PROPOSAL_WRITE_ROLES`
   * + BP Financeiro. Esconder o controle é UX — o 403 da rota é a garantia —, e
   * a JANELA (só antes do envio para aprovação) é veredito do backend pelo
   * `status` da proposta, nunca uma regra que a tela decida por conta própria.
   */
  [Permission.ProposalAnalysisWindowEdit]: [
    ...LT_AUTHORITY_ROLES,
    Role.GerenteVarejo,
    Role.Sneg,
    Role.BpFinanceiro,
    Role.Admin,
  ],
  /*
   * Bug 68395 — espelha `CAMPOS_TRAVADOS_POR_OBRA_BYPASS_ROLES` do backend.
   *
   * ⚠️ É um SUBCONJUNTO de `ProposalManage`, e é esse o ponto: LT e Gerente
   * Varejo escrevem no bloco e mesmo assim leem os campos da parcela
   * desabilitados. O Admin acompanha a SNEG como em todo gate do repositório
   * (`SnegAnalysis`, `SnegPadroesBpGovernanca`, `DocumentValidate`, …) — o ticket
   * nomeia só a SNEG, e deixar o admin de fora criaria a única exceção do
   * produto em que ele vê menos que a analista.
   */
  [Permission.ObraCamposTravadosEditar]: [Role.Sneg, Role.BpFinanceiro, Role.Admin],
  /*
   * Espelha `DOCUMENT_WRITE_ROLES` do backend (`documents/domain`), que gateia
   * anexo e remoção de documento na oportunidade E no cliente. O PRD Análise
   * SNEG dá a tarefa "anexar documentos" ao LT; a SNEG entra pela decisão de
   * negócio de 26/08/2026.
   *
   * ⚠️ Não é `DocumentValidate`: conferir é da CCOB (`@Roles(CCOB, ADMIN)`,
   * RN-F9-03 + ADO 67906) e é autoridade oposta — quem anexa não confere o
   * próprio anexo.
   */
  [Permission.DocumentManage]: MATRIZ_CRIAR_EDITAR,
  /*
   * Conferência do documento — espelha `DOCUMENT_VALIDATE_ROLES` do backend
   * (`documents/domain`), o `@Roles` de `.../validar` e `.../desfazer-validacao`.
   *
   * A autoridade mudou duas vezes, e esta lista é a UNIÃO das duas decisões:
   * a RN-F9-03 dá a conferência à SNEG, o ADO 67906 (26/08/2026) a moveu para a
   * CCOB, e em 31/08/2026 o negócio pediu a SNEG de volta sem tirar a CCOB.
   *
   * ⚠️ O LT fica FORA: ele anexa (`DocumentManage`) e não confere o próprio
   * anexo. A SNEG está nas duas listas — é a única sobreposição, e é decisão de
   * negócio, não descuido.
   *
   * ⚠️ O rótulo da tela é NEUTRO ("✓ Validado"): com dois perfis conferindo, um
   * selo que nomeia um deles afirma quem fez o trabalho sem saber.
   */
  // Espelha `CUSTOMER_DOCUMENT_WRITE_ROLES` — a lista de `DocumentManage` de
  // antes do alinhamento, SEM os três perfis de `LT_AUTHORITY_ROLES`.
  [Permission.CustomerDocumentManage]: [
    Role.LT,
    Role.GerenteVarejo,
    Role.Sneg,
    Role.BpFinanceiro,
    Role.ConsultorExpansao,
    Role.GestorFranquias,
    Role.Admin,
  ],
  [Permission.DocumentValidate]: [Role.Sneg, Role.BpFinanceiro, Role.Ccob, Role.Admin],

  // DDI permissions (RN-F10) — mirror DdiController @Roles guards.
  // Provisional (gap G4, WS#6/WS#9); move together with backend.
  // DdiReclassify / DdiRequestDocument: backend uses @Roles(INTEGRIDADE, ADMIN).
  // Gated on the PROFILE, not the COMPLIANCE capability: SNEG used to carry the
  // capability, so mirroring it here would show the parecer form to SNEG and
  // earn a 403 on submit.
  // DdiDecide: backend uses @Roles(LT, ADMIN) — the LT makes the final call.
  // Exceção NOMEADA ao "a SNEG faz tudo o que o LT faz": a DDI inteira é da
  // Integridade (ADO 67911, mesmo dia), e a SNEG acompanha sem agir.
  [Permission.DdiReclassify]: [Role.Integridade, Role.Admin],
  [Permission.DdiRequestDocument]: [Role.Integridade, Role.Admin],
  [Permission.DdiDecide]: [...LT_AUTHORITY_ROLES, Role.Admin],
  [Permission.DdiView]: MATRIZ_DDI_VISUALIZAR,
  // Produção (ADO 66411, mantido pela Graziella): quem decide o risco ALTO também cancela.
  [Permission.DdiCancel]: [...LT_AUTHORITY_ROLES, Role.Admin],
  [Permission.OpportunityReturn]: MATRIZ_REJEITAR_DEVOLVER,
  // Espelha `DDI_RUN_ROLES` = `OPPORTUNITY_COMPOSITION_ROLES` + Integridade.
  [Permission.DdiRun]: [
    ...LT_AUTHORITY_ROLES,
    Role.GerenteVarejo,
    Role.Sneg,
    Role.BpFinanceiro,
    Role.ConsultorExpansao,
    Role.GestorFranquias,
    Role.Integridade,
    Role.Admin,
  ],

  /*
   * Entrada na Governança (20/09/2026) — os TRÊS perfis que o pedido nomeia,
   * verbatim: "Apenas BP Financeiro, Gestor Franquias e TI Administrador devem
   * ter acesso." Ver o docblock do membro: é uma lista PRÓPRIA, e não mais a
   * união do que existe dentro da página, porque SNEG e CCOB mantêm permissões
   * de superfícies que a união varria para dentro.
   */
  // Matriz RBAC v2.1: TI Sustentação EXECUTA Parametrizações (28/09/2026).
  // Entra na Governança: executores, Gestor de Franquias (só abas de franquia) e
  // SPCOM (visualiza). SNEG fora (Graziella, ADO 67950).
  [Permission.GovernancaAccess]: MATRIZ_GOVERNANCA_FRANQUIA_VISUALIZAR,
  [Permission.GovernancaView]: MATRIZ_GOVERNANCA_VISUALIZAR,

  /*
   * Governança → Auditoria (21/09/2026). Era `[Sneg, Admin]` e passou por
   * `[BpFinanceiro, Admin]` no mesmo dia. A rota `GET /v1/auditoria` é o espelho
   * EXATO desta lista — `@Roles(ADMIN)`. Ver o docblock do membro.
   */
  [Permission.AuditTrailView]: [Role.Admin],

  // Governança → SNEG: os dois perfis que o negócio nomeou. Ver o docblock do
  // membro — deliberadamente um conjunto DIFERENTE de SnegPadroesBpGovernanca.
  [Permission.SnegDistribuicaoGovernanca]: MATRIZ_GOVERNANCA_EXECUTAR,
  /*
   * Roteamento da CCOB (04/09/2026, estreitado em 20/09/2026) — espelho de
   * `CCOB_DISTRIBUICAO_WRITE_ROLES`. `Role.Ccob` saiu daqui E do backend: o
   * pedido do negócio dá esta aba a "BP Financeiro e TI Administrador". Ver o
   * docblock da permissão.
   */
  [Permission.CcobDistribuicaoGovernanca]: MATRIZ_GOVERNANCA_EXECUTAR,

  /*
   * Roteamento de franquia (19/09/2026) — espelho de
   * `ROTEAMENTO_FRANQUIA_WRITE_ROLES`. O Gestor de Franquias está aqui pela
   * mesma razão que a CCOB está na permissão acima: a fila é da área dele.
   */
  [Permission.RoteamentoFranquiaGovernanca]: MATRIZ_GOVERNANCA_FRANQUIA_EXECUTAR,

  /*
   * Governança → Política comercial (08/09/2026, estreitado em 20/09/2026) —
   * espelho de `POLITICA_COMERCIAL_READ_ROLES`. `Role.Sneg` saiu daqui e do
   * backend. Gateada, e não aberta: o card de limiares expõe a parametrização de
   * alçada do org (quem aprova o quê, por faixa).
   */
  [Permission.PoliticaComercialView]: MATRIZ_GOVERNANCA_VISUALIZAR,

  /*
   * Governança → Documentos (08/09/2026, invertido em 20/09 e estreitado em
   * 21/09/2026). Era `[Sneg, Admin]`, depois `[BpFinanceiro, Admin]`, e sobrou o
   * TI Administrador.
   *
   * ⚠️ O `@Roles` das escritas acompanha esta lista desde 21/09/2026, e foi
   * quando a feature-flag `DOCUMENTS_PARAMETRIZATION_ENABLED` saiu: enquanto ela
   * existia, o `PUT` respondia 404 para todo mundo e o `@Roles(SNEG)` antigo
   * ficava escondido atrás dela. Flag desligada esconde o buraco, não o fecha —
   * no dia em que alguém a ligasse, a SNEG voltaria a escrever numa tabela de
   * governança sem ter tela para isso. Ver o docblock do membro.
   *
   * ⚠️ Consequência nomeada: **nenhum perfil de negócio vê esta aba** — nem a
   * SNEG, que mantém o catálogo fora daqui, nem o BP Financeiro, nem o Gestor de
   * Franquias, nem a CCOB (embora a rota de "documentos por modalidade" admita a
   * CCOB, porque a exigência é do domínio dela). Alargar por analogia com aquela
   * rota entregaria a parametrização de documento a quem não a mantém.
   */
  [Permission.DocumentParametrizationView]: MATRIZ_GOVERNANCA_EXECUTAR,

  /*
   * Governança → Campos obrigatórios (21/09/2026) — aba nova, puxada de
   * `/sneg/parametrizacao`. Espelha `SNEG_CAMPOS_OBRIGATORIOS_WRITE_ROLES` no
   * backend. Ver o docblock do membro: acessar e editar são a mesma lista.
   */
  [Permission.SnegCamposObrigatoriosGovernanca]: MATRIZ_GOVERNANCA_EXECUTAR,

  /*
   * ADO 67805 — os cinco perfis que o ticket nomeia, verbatim: "BP Financeiro,
   * Sneg, TI Administrador, Gerente Varejo, TI Sustentação".
   *
   * ⚠️ Espelha `BP_BUDGET_VIEW_ROLES` no backend
   * (`apps/api/src/proposals/domain/bp-budget-visibility.ts`), que é quem de
   * fato OMITE o campo da resposta. Mover uma lista sem a outra faz a tela
   * esconder o que a API entrega — ou, pior, renderizar um card vazio para
   * quem a API já recusa.
   */
  [Permission.BpBudgetView]: [
    Role.BpFinanceiro,
    Role.Sneg,
    Role.Admin,
    Role.GerenteVarejo,
    Role.TiSustentacao,
  ],
};

/** `true` when the caller holds at least one role bound to the permission. */
export function hasPermission(
  roles: string[] | undefined,
  permission: Permission,
): boolean {
  const allowed = PERMISSION_ROLES[permission];

  return (roles ?? []).some((role) =>
    allowed.includes(role as Role),
  );
}
