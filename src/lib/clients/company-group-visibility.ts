/**
 * Company-group visibility switches — DOIS eixos (ADO 68073, 05/09/2026).
 *
 * ## Por que dois, e não um
 *
 * A decisão de 24/08/2026 escondeu o CARD da 360º **e** a coluna da carteira
 * com uma constante só. Em 04/09/2026 o negócio pediu a coluna de volta,
 * verbatim: *"Pedimos também, trazer na tabela um coluna com 'Grupo Empresa'."*
 * — e o protótipo concorda: `10-clientes.html:82` lista `Grupo empresa` entre
 * `Cliente` e `Bandeira`.
 *
 * O pedido é sobre a TABELA. A razão de esconder o CARD não mudou: ele entrega
 * um fato (a identidade, do Salesforce) ao lado de OITO lacunas — seis do
 * Tableau, sem contrato, e uma do ARP travada no G11 —, e o card não foi
 * pedido. Um switch só obrigaria a escolher entre desatender o pedido e
 * reverter uma decisão que ninguém revisou.
 *
 * Reverter qualquer um dos dois é o flip da constante correspondente, e nada
 * mais: o payload nunca deixou de carregar `companyGroup`.
 *
 * WHY — measured live against the UAT org on account `0018800001KNIWZAA5`
 * (`CRM_DRIVER=real`): the card delivered ONE fact next to eight gaps. The one
 * fact is the identity (Salesforce `Grupo_De_Empresa__c`), and ADR-0021 measured
 * 36.364 accounts with that lookup filled against 1.055.552 with a SAP code —
 * so for ~97% of accounts it reads "Não vinculado a grupo empresa". Alongside
 * it: six "Aguardando integração Tableau" (the analytics port is the
 * `PendingAnalyticsAdapter`, which throws `NotContracted`), one "Aguardando
 * integração ARP" (`getCompanyGroupIndicators`, blocked on G11) and "Última
 * oportunidade concluída", a field with no backend source at all. VBR-493
 * subordinated those sentences visually; this is the next step — while the two
 * integrations do not exist, do not spend a card and a column on them.
 *
 * WHY THIS SWITCH LIVES IN THE FRONTEND, unlike `HIDE_PROSPECTS` and
 * `RESTRICT_TO_DCVIM_SCOPE` (both in `apps/api/src/customers/`): those two have
 * to be backend because they change the QUERY (`Codigo_SAP__c != null`,
 * `DCVIM__c = true`) — the data itself is filtered at the source, and two
 * screens must agree on the same cut. Nothing is filtered here: both changes are
 * purely rendering. The repo's precedent for gating UI with no payload
 * counterpart is `ENABLE_CREATE_PROSPECT` (`lib/feature-flags.ts`). Both
 * surfaces read THIS constant, so the frontend still has a single source of
 * truth.
 *
 * NOT expressed as `companyGroup.available = false`: on the 360º that means only
 * "the source failed or timed out", and overloading it would make a reader of
 * the payload mistake a product decision for an outage.
 *
 * The card disappears entirely rather than rendering dimmed-and-empty. The CA-4
 * doctrine ("Garantias are always rendered — a section that silently disappears
 * is indistinguishable from one that has no data") governs INTEGRATION
 * degradation, where the user needs to know something failed; and the disabled
 * Prospects tab of `HIDE_PROSPECTS` stays visible because a tab is a CONTROL —
 * "it exists, not now" is information. A card and a column are data display: an
 * empty dimmed card is the very noise this removes.
 *
 * NOTHING WAS REMOVED. `GET /v1/customers/:ref/360` still composes
 * `companyGroup` with its `gaps` (`customer-360.service.ts:composeCompanyGroup`),
 * `CustomerPortfolioRow.companyGroup` still travels on the row,
 * `ClientSummary.empresaGroup` is still mapped, and the whole mapper block plus
 * its per-field VBR-493 treatment stay put.
 *
 * HOW TO REVERT: flip this constant to `true`. Nothing else.
 * `customer-360-mapping-company-group.test.ts` and
 * `client-search-company-group.test.tsx` mock it ON and are the safety net that
 * both surfaces come back correct.
 *
 * REVISIT TRIGGER: the Tableau contract and/or the ARP R$/L index (G11) landing
 * — that is what would give the six measures values. Today the two calls
 * exclusive to this card (`analytics.getCompanyGroupVolumePerformance` and
 * `profitability.getCompanyGroupIndicators`, `customer-360.service.ts`) cost
 * ZERO network, because both adapters throw `NotContracted` without a hop. With
 * a contract they would become two real hops per request feeding a card nobody
 * renders — at that moment reconsider the card AND whether the switch should
 * move to the backend. The third source (`groupsPromise`, Salesforce) is NOT
 * disposable either way: it feeds "Grupo Econômico" too.
 */
/**
 * A coluna "Grupo empresa" da carteira (`/clientes`) — **ligada** (ADO 68073).
 *
 * É a coluna do protótipo, alimentada por `CustomerPortfolioRow.companyGroup`,
 * que sempre viajou no payload. Dado cadastral do Salesforce: quando a conta
 * não tem grupo, a célula é `—`, que é a resposta honesta e não uma lacuna de
 * integração.
 */
export const SHOW_COMPANY_GROUP_COLUMN = true;

/**
 * O card "Grupo Empresa" da Visão 360º — **oculto** (decisão de 24/08/2026,
 * inalterada).
 *
 * ⚠️ Gatilho de revisão: o contrato do Tableau e/ou o R$/L do ARP (G11). Hoje
 * as duas chamadas exclusivas deste card custam ZERO rede (os adapters lançam
 * `NotContracted` sem hop); com contrato virariam dois hops por request
 * alimentando um card que ninguém renderiza — aí reavaliar o card E se o switch
 * deve ir para o backend.
 */
export const SHOW_COMPANY_GROUP_CARD = false;
