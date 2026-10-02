/**
 * GENERATED-BY-HAND-VERIFIED — Salesforce picklist catalog.
 *
 * Every value below was transcribed from the client-authored analysis
 * "Análise Picklists Vibra Contratos" (manifest.xml × force-app metadata,
 * 05/08/2026), which is the AUTHORITY on picklist content: it complements and,
 * on conflict, OVERRIDES the PRDs and the HTML prototype.
 *
 * Do not edit values ad hoc — re-derive them from that document. The counts are
 * asserted by `catalog.spec.ts` so a partial edit fails the build.
 */

import { PicklistField, type PicklistDefinition } from "./definicao";

/**
 * `Recurso_Financeiro_Da_Cotacao__c.Tipo__c` — head of the deepest dependency
 * chain in the manifest: `Tipo__c → Finalidade__c → Etapa_Da_Liberacao__c`.
 *
 * Note `Mútuo Enc. Contas` carries the label **"Novo Mútuo"** — the API name
 * and the label disagree, which is why the platform value is `NOVO_MUTUO`.
 */
export const RECURSO_TIPO: PicklistDefinition = {
  field: PicklistField.RecursoFinanceiroTipo,
  salesforceField: "Recurso_Financeiro_Da_Cotacao__c.Tipo__c",
  restricted: true,
  values: [
    { apiName: "Antecipada" },
    { apiName: "Desempenho" },
    { apiName: "Mútuo" },
    /**
     * Hidden locally (Bug 67513) — NOT a Salesforce deprecation, our decision.
     *
     * Two independent reasons:
     *
     * 1. **No RecordType mapping.** `recursoRecordTypeFor` in
     *    `quote-crm-sync.service.ts` maps `Tipo__c` → RecordType of
     *    `Recurso_Financeiro_Da_Cotacao__c`. Only three RecordTypes were measured
     *    in the org on 07/08/2026 (`Bonificacao`, `Mutuo`, `MutuoEncContas`).
     *    `Parcelamento de Débito` falls through to the default branch and throws
     *    an `IntegrationError`, blocking the Quote graph when the user clicks
     *    "Acionar processo da alçada".
     *
     * 2. **Contradictory org configuration.** The two finalidades exclusive to
     *    this tipo — `Pagamento de Títulos Vencidos` and `Refinanciamento do
     *    Mútuo` — enable NO etapa in the org's `validFor` matrix (measured
     *    16/08/2026). The validation rule `Obrigatorio_Etapa_Lib_Quando_Finalidade`
     *    simultaneously demands one. The UI fell back to offering the full list
     *    with a warning note (the `SEM_VALOR_PUBLICADO` path), which confused
     *    users but still allowed saving. Hiding the tipo removes that dead-end
     *    entirely — and silences the note as a side effect.
     *
     * Not marked `legacy: true` — the value exists in Salesforce; hiding is our
     * call, not an org deprecation. Stored rows with this tipo still render
     * (`isKnown = true`) and can be edited for non-tipo fields (`diffUpdateInput`
     * omits unchanged fields so the inactive value is never re-validated).
     *
     * To reactivate when Vibra provides a RecordType: remove `active: false`.
     */
    { apiName: "Parcelamento de Débito", active: false },
    { apiName: "Mútuo Enc. Contas", label: "Novo Mútuo" },
    { apiName: "BONIFICACAO", label: "Bonificação", active: false, legacy: true },
  ],
};

/**
 * `Recurso_Financeiro_Da_Cotacao__c.Finalidade__c` — the SAME global value set
 * as {@link QUOTE_FINALIDADE} (`Finalidade_Cotacao`, 44 values) with a
 * different controlling field. 18 values carry `valueSettings` here.
 *
 * ⚠️ The source document's prose says "17 valores" while listing 18 explicit
 * pairs; the 18 pairs are encoded (data over summary) and the discrepancy is
 * asserted in the spec so it is not silently "fixed" later.
 */
export const RECURSO_FINALIDADE: PicklistDefinition = {
  field: PicklistField.RecursoFinanceiroFinalidade,
  salesforceField: "Recurso_Financeiro_Da_Cotacao__c.Finalidade__c",
  globalValueSet: "Finalidade_Cotacao",
  controlledBy: PicklistField.RecursoFinanceiroTipo,
  restricted: true,
  values: [
    { apiName: "Implantação" },
    { apiName: "Renovação" },
    { apiName: "Vinculação" },
    { apiName: "Revinculação" },
    { apiName: "Renegociação" },
    { apiName: "Vinculação de bandeira branca" },
    { apiName: "Vinculação por troca de bandeira" },
    { apiName: "BR Mania - Implantação" },
    { apiName: "BR Mania - Renegociação" },
    { apiName: "BR Mania - Renovação" },
    { apiName: "Lubrax + - Implantação" },
    { apiName: "Lubrax + - Renegociação" },
    { apiName: "Lubrax + - Renovação" },
    { apiName: "Aquisição/Instalação de equipamento / Imagem" },
    { apiName: "Aquisição / Instalação - Equipamentos" },
    { apiName: "Aquisição / Instalação - Imagem BR Mania" },
    { apiName: "Aquisição / Instalação - Imagem Lubrax+" },
    { apiName: "Aquisição / Instalação - Imagem Pista" },
    { apiName: "Após Cumprimento do Volume Contratado", label: "Bônus por Cumprimento do Volume" },
    { apiName: "Cessão" },
    { apiName: "Construção BR Mania" },
    { apiName: "Construção do Lubrax +" },
    { apiName: "Construção do posto" },
    { apiName: "Construção Loja BR Mania" },
    /**
     * Duplicate of `Construção do Lubrax +` — both values are active in the
     * Salesforce global value set `Finalidade_Cotacao` and both are enabled by
     * the same three `Tipo__c` (Antecipada, Mútuo, Mútuo Enc. Contas), causing
     * the select to show two identical-meaning entries.
     *
     * Measured in the org on 17/08/2026: `Construção do Lubrax +` has 47 records,
     * `Construção Lubrax+` has 7. We hide the minority spelling locally while the
     * Vibra deactivates one of the two in the global value set.
     *
     * Not marked `legacy` — the value exists in Salesforce; hiding is our decision,
     * not an org deprecation. Existing records with this value still render correctly
     * because `isKnown = true` (value present in catalog) even with `active: false`.
     */
    { apiName: "Construção Lubrax+", active: false },
    { apiName: "Cumprimento do volume contratado" },
    { apiName: "Incremento das atividades" },
    { apiName: "Pagamento de Títulos Vencidos" },
    { apiName: "Posto a construir" },
    { apiName: "Construção" },
    { apiName: "Manutenção - Imagem Pista" },
    { apiName: "Refinanciamento do Mútuo" },
    { apiName: "Reforma BR Mania" },
    { apiName: "Reforma do Lubrax +" },
    { apiName: "Reforma do Posto" },
    { apiName: "Reforma Loja BR Mania" },
    { apiName: "Reforma Lubrax+" },
    { apiName: "Reforma" },
    { apiName: "Troca de Operador" },
    { apiName: "Complementar" },
    { apiName: "Financiamento" },
    { apiName: "Complementar Mutuo BR" },
    { apiName: "Serviço Especializado em Garantia Real" },
    { apiName: "Impostos referentes a Imagem" },
    { apiName: "REFORMA_E_EQUIPAMENTOS", label: "Reforma e equipamentos", active: false, legacy: true },
    { apiName: "COMUNICACAO_VISUAL", label: "Comunicação visual", active: false, legacy: true },
    { apiName: "CAPITAL_DE_GIRO", label: "Capital de giro", active: false, legacy: true },
    { apiName: "OUTROS", label: "Outros", active: false, legacy: true },
  ],
  valueSettings: {
    ["Aquisição / Instalação - Equipamentos"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Aquisição / Instalação - Imagem BR Mania"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Aquisição / Instalação - Imagem Lubrax+"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Aquisição / Instalação - Imagem Pista"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Construção do Lubrax +"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Construção do posto"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Construção Loja BR Mania"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Construção Lubrax+"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Incremento das atividades"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Manutenção - Imagem Pista"]: ["Antecipada"],
    ["Reforma do Posto"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Reforma Loja BR Mania"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Reforma Lubrax+"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Serviço Especializado em Garantia Real"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Impostos referentes a Imagem"]: ["Antecipada", "Mútuo", "Mútuo Enc. Contas"],
    ["Cumprimento do volume contratado"]: ["Desempenho"],
    ["Pagamento de Títulos Vencidos"]: ["Parcelamento de Débito"],
    ["Refinanciamento do Mútuo"]: ["Parcelamento de Débito"],
  },
};

/**
 * `Recurso_Financeiro_Da_Cotacao__c.Etapa_Da_Liberacao__c` — inline, NOT
 * restricted, API name == label in all 37 values.
 *
 * ⚠️ The source document's PROSE says "34 valores" in three separate places
 * while its own table lists **37 rows**. The 37 are encoded — data beats the
 * summary, the same call made for the 17-vs-18 discrepancy in
 * {@link RECURSO_FINALIDADE} — and `catalog.spec.ts` pins the number so nobody
 * "corrects" it back to 34. Worth confirming with Vibra which count is stale;
 * if 34 is right, three values here are not in the org.
 *
 * `valueSettingsComplete: true` since 16/08/2026 — the matrix below was MEASURED
 * against the UAT org (`scripts/sfdc-etapa-liberacao-investigate.js`, field
 * describe: `dependentPicklist: true`, `controllerName: Finalidade__c`, every
 * active value carrying at least one enabling `validFor` bit). It is not the
 * source document's three examples extrapolated — the analysis publishes only
 * those three, which is exactly why this flag used to be `false`.
 *
 * ⚠️ 16 finalidades enable an etapa. Two finalidades our catalog makes
 * selectable — `Pagamento de Títulos Vencidos` and `Refinanciamento do Mútuo`,
 * both under `Tipo__c = Parcelamento de Débito` — enable NONE. The org
 * contradicts itself there: `Obrigatorio_Etapa_Lib_Quando_Finalidade` demands
 * an etapa the dependency does not offer. Returning an empty list would leave
 * the user with no way forward, so {@link PicklistCatalogService.options}
 * answers `SEM_ETAPA_PUBLICADA` and offers every active value with the gap
 * named — the `DEPENDENCIA_NAO_MAPEADA` reasoning, now scoped to 2 of 18
 * finalidades instead of all of them.
 */
export const RECURSO_ETAPA_LIBERACAO: PicklistDefinition = {
  field: PicklistField.RecursoFinanceiroEtapaLiberacao,
  salesforceField: "Recurso_Financeiro_Da_Cotacao__c.Etapa_Da_Liberacao__c",
  controlledBy: PicklistField.RecursoFinanceiroFinalidade,
  restricted: false,
  valueSettingsComplete: true,
  offerAllWhenControllerEnablesNone: true,
  values: [
    { apiName: "Após obra civil - fundação / execução de alvenaria (prédio)" },
    { apiName: "Após obra civil - infra estrutura elétrica e hidráulica / acabamentos (prédio)" },
    { apiName: "Após obra civil - fundação / execução de colunas (cobertura da pista)" },
    { apiName: "Após obra civil - execução de vigas e treliças (cobertura da pista)" },
    { apiName: "Após obra civil - pavimentação da pista" },
    { apiName: "Após obra civil - conclusão das obras" },
    { apiName: "Após licença - emissão da LO (licença de operação)" },
    { apiName: "Após início da operação - posto" },
    { apiName: "Após início da operação - loja BR Mania" },
    { apiName: "Após cumprimento do volume contratado" },
    { apiName: "Após Contratação Fornecedor - Bombas" },
    { apiName: "Após Contratação Fornecedor - Tanques" },
    { apiName: "Após Entrega do Material - Bombas" },
    { apiName: "Após Entrega do Material - Tanques" },
    { apiName: "Após Instalação - Bombas" },
    { apiName: "Após Instalação - Tanques" },
    { apiName: "Após Contratação Fornecedor - Imagem BR Mania" },
    { apiName: "Após Entrega do Material - Imagem BR Mania" },
    { apiName: "Após Implantação - Imagem BR Mania" },
    { apiName: "Após Contratação Fornecedor - Imagem Lubrax+" },
    { apiName: "Após Entrega do Material - Imagem Lubrax+" },
    { apiName: "Após Implantação - Imagem Lubrax+" },
    { apiName: "Após Contratação Fornecedor - Imagem Pista" },
    { apiName: "Após Entrega do Material - Imagem Pista" },
    { apiName: "Após Implantação - Imagem Pista" },
    { apiName: "Após Assinatura do Contrato e Efetivação das Garantias" },
    { apiName: "Após Início da Operação - Unidade Lubrax+" },
    { apiName: "Após 30 dias da assinatura do contrato e efetivação das garantias" },
    { apiName: "Após 60 dias da assinatura do contrato e efetivação das garantias" },
    { apiName: "Após 90 dias da assinatura do contrato e efetivação das garantias" },
    { apiName: "Após 120 dias da assinatura do contrato e efetivação das garantias" },
    { apiName: "Após 150 dias da assinatura do contrato e efetivação das garantias" },
    { apiName: "Após 180 dias da assinatura do contrato e efetivação das garantias" },
    { apiName: "Após reforma - Posto" },
    { apiName: "Após reforma - BR Mania" },
    { apiName: "Após reforma - Lubrax+" },
    { apiName: "Será liberada em até 30 dias da adesão do REVENDEDOR ao Programa de Manutenção de Imagem Petrobras" },
    { apiName: "ASSINATURA_DO_CONTRATO", label: "Assinatura do contrato", active: false, legacy: true },
    { apiName: "ATIVACAO_DO_POSTO", label: "Ativação do posto", active: false, legacy: true },
    { apiName: "ENTREGA_DA_DOCUMENTACAO", label: "Entrega da documentação", active: false, legacy: true },
    { apiName: "OUTROS", label: "Outros", active: false, legacy: true },
  ],
  // Measured 16/08/2026 against the UAT org — do not hand-edit. Regenerate with
  // `node scripts/sfdc-etapa-liberacao-investigate.js` (SEÇÃO 2) if the org changes.
  valueSettings: {
    ["Após obra civil - fundação / execução de alvenaria (prédio)"]: ["Construção do posto"],
    ["Após obra civil - infra estrutura elétrica e hidráulica / acabamentos (prédio)"]: ["Construção do posto"],
    ["Após obra civil - fundação / execução de colunas (cobertura da pista)"]: ["Construção do posto"],
    ["Após obra civil - execução de vigas e treliças (cobertura da pista)"]: ["Construção do posto"],
    ["Após obra civil - pavimentação da pista"]: ["Construção do posto"],
    ["Após obra civil - conclusão das obras"]: ["Construção do posto"],
    ["Após licença - emissão da LO (licença de operação)"]: ["Construção do posto"],
    ["Após início da operação - posto"]: ["Construção do posto"],
    ["Após início da operação - loja BR Mania"]: ["Construção Loja BR Mania"],
    ["Após cumprimento do volume contratado"]: ["Cumprimento do volume contratado"],
    ["Após Contratação Fornecedor - Bombas"]: ["Aquisição / Instalação - Equipamentos"],
    ["Após Contratação Fornecedor - Tanques"]: ["Aquisição / Instalação - Equipamentos"],
    ["Após Entrega do Material - Bombas"]: ["Aquisição / Instalação - Equipamentos"],
    ["Após Entrega do Material - Tanques"]: ["Aquisição / Instalação - Equipamentos"],
    ["Após Instalação - Bombas"]: ["Aquisição / Instalação - Equipamentos"],
    ["Após Instalação - Tanques"]: ["Aquisição / Instalação - Equipamentos"],
    ["Após Contratação Fornecedor - Imagem BR Mania"]: ["Aquisição / Instalação - Imagem BR Mania"],
    ["Após Entrega do Material - Imagem BR Mania"]: ["Aquisição / Instalação - Imagem BR Mania"],
    ["Após Implantação - Imagem BR Mania"]: ["Aquisição / Instalação - Imagem BR Mania"],
    ["Após Contratação Fornecedor - Imagem Lubrax+"]: ["Aquisição / Instalação - Imagem Lubrax+"],
    ["Após Entrega do Material - Imagem Lubrax+"]: ["Aquisição / Instalação - Imagem Lubrax+"],
    ["Após Implantação - Imagem Lubrax+"]: ["Aquisição / Instalação - Imagem Lubrax+"],
    ["Após Contratação Fornecedor - Imagem Pista"]: [
      "Aquisição / Instalação - Imagem Pista",
      "Impostos referentes a Imagem",
    ],
    ["Após Entrega do Material - Imagem Pista"]: [
      "Aquisição / Instalação - Imagem Pista",
      "Impostos referentes a Imagem",
    ],
    ["Após Implantação - Imagem Pista"]: [
      "Aquisição / Instalação - Imagem Pista",
      "Impostos referentes a Imagem",
    ],
    ["Após Assinatura do Contrato e Efetivação das Garantias"]: [
      "Construção do Lubrax +",
      "Construção do posto",
      "Construção Loja BR Mania",
      "Construção Lubrax+",
      "Incremento das atividades",
      "Reforma do Posto",
      "Reforma Loja BR Mania",
      "Reforma Lubrax+",
      "Serviço Especializado em Garantia Real",
      "Impostos referentes a Imagem",
    ],
    ["Após Início da Operação - Unidade Lubrax+"]: ["Construção do Lubrax +", "Construção Lubrax+"],
    ["Após 30 dias da assinatura do contrato e efetivação das garantias"]: [
      "Incremento das atividades",
      "Serviço Especializado em Garantia Real",
    ],
    ["Após 60 dias da assinatura do contrato e efetivação das garantias"]: [
      "Incremento das atividades",
      "Serviço Especializado em Garantia Real",
    ],
    ["Após 90 dias da assinatura do contrato e efetivação das garantias"]: [
      "Incremento das atividades",
      "Serviço Especializado em Garantia Real",
    ],
    ["Após 120 dias da assinatura do contrato e efetivação das garantias"]: [
      "Incremento das atividades",
      "Serviço Especializado em Garantia Real",
    ],
    ["Após 150 dias da assinatura do contrato e efetivação das garantias"]: [
      "Incremento das atividades",
      "Serviço Especializado em Garantia Real",
    ],
    ["Após 180 dias da assinatura do contrato e efetivação das garantias"]: [
      "Incremento das atividades",
      "Serviço Especializado em Garantia Real",
    ],
    ["Após reforma - Posto"]: ["Reforma do Posto"],
    ["Após reforma - BR Mania"]: ["Reforma Loja BR Mania"],
    ["Após reforma - Lubrax+"]: ["Reforma Lubrax+"],
    ["Será liberada em até 30 dias da adesão do REVENDEDOR ao Programa de Manutenção de Imagem Petrobras"]:
      ["Manutenção - Imagem Pista"],
  },
};

/** `Recurso_Financeiro_Da_Cotacao__c.Periodicidade_Lancamento__c` — default `Anual`. */
export const RECURSO_PERIODICIDADE: PicklistDefinition = {
  field: PicklistField.RecursoFinanceiroPeriodicidade,
  salesforceField: "Recurso_Financeiro_Da_Cotacao__c.Periodicidade_Lancamento__c",
  globalValueSet: "Periodicidade_Item_FInanceiro",
  restricted: true,
  values: [
    { apiName: "Única" },
    { apiName: "Mensal" },
    { apiName: "Bimestral" },
    { apiName: "Trimestral" },
    { apiName: "Quadrimestral" },
    { apiName: "Semestral" },
    { apiName: "Anual", isDefault: true },
  ],
};

/**
 * `Recurso_Financeiro_Da_Cotacao__c.Indice_De_Correcao__c` — default `IGP-M`.
 *
 * ⚠️ Casing finding from the source analysis: a Salesforce formula default uses
 * `SEM CORREÇÃO` (upper case) while the only valid member is `Sem correção`, so
 * that default never matches on a restricted picklist. The value here is the
 * one that exists; the platform must not reproduce the upper-case spelling.
 */
export const RECURSO_INDICE_CORRECAO: PicklistDefinition = {
  field: PicklistField.RecursoFinanceiroIndiceCorrecao,
  salesforceField: "Recurso_Financeiro_Da_Cotacao__c.Indice_De_Correcao__c",
  globalValueSet: "Indice_De_Correcao",
  restricted: true,
  values: [
    { apiName: "CDI" },
    { apiName: "IGP-DI" },
    { apiName: "IGP-M", isDefault: true },
    { apiName: "INPC" },
    { apiName: "IPC" },
    { apiName: "IPCA" },
    { apiName: "TR" },
    { apiName: "ICTM" },
    { apiName: "UFIR" },
    { apiName: "SELIC" },
    { apiName: "UFIR-RJ" },
    { apiName: "UFESP" },
    { apiName: "SELIC-M" },
    { apiName: "BTN/TR" },
    { apiName: "IPCR" },
    { apiName: "OTN" },
    { apiName: "URV" },
    { apiName: "Sem correção" },
  ],
};
