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
 * `Opportunity.Tipo_De_Negociacao__c` — inline value set, `NEG` is the default.
 *
 * ⚠️ The legacy domain value `CONTRATACAO` this platform used to force on every
 * opportunity does NOT exist in Salesforce. It is kept as a `legacy` value so
 * rows written before this catalog still read back, but it is never offered.
 */
export const OPPORTUNITY_TIPO_NEGOCIACAO: PicklistDefinition = {
  field: PicklistField.OpportunityTipoNegociacao,
  salesforceField: "Opportunity.Tipo_De_Negociacao__c",
  restricted: true,
  values: [
    { apiName: "NEG", isDefault: true },
    { apiName: "Contrato de Volume" },
    { apiName: "Contrato de Volume + CPP", label: "Crédito Pós Performance" },
    { apiName: "Pedido SPOT" },
    { apiName: "Pedido direto" },
    { apiName: "Investimento" },
    { apiName: "Investimento Conjunto" },
    { apiName: "Aguardando valores", active: false },
    { apiName: "Energia", active: false },
    { apiName: "CONTRATACAO", label: "Contratação", active: false, legacy: true },
  ],
};

/** `Opportunity.PimAdesao__c` — Sim/Não picklist, NOT a checkbox: "Não" and "unanswered" are different facts. */
export const OPPORTUNITY_PIM_ADESAO: PicklistDefinition = {
  field: PicklistField.OpportunityPimAdesao,
  salesforceField: "Opportunity.PimAdesao__c",
  restricted: true,
  values: [
    { apiName: "Sim" },
    { apiName: "Não" },
  ],
};

/**
 * `Opportunity.Alteracao_Minuta_Padrao__c` — "Haverá alteração da Minuta
 * Padrão?" (ADO 68438).
 *
 * Gêmeo de `Quote.Alteracao_Minuta_Padrao__c` (mesmo label, mesmo value set),
 * e o org copia um no outro pela entrada `Quote_Alteracao_De_Minuta` de
 * `CopyQuoteToOpportunity__mdt`. São value sets INLINE separados, não um global
 * value set — por isso duas definições, e não uma compartilhada como
 * `AREA_USUARIO`.
 *
 * Restrita, medido no describe em 15/09/2026.
 */
export const OPPORTUNITY_ALTERACAO_MINUTA_PADRAO: PicklistDefinition = {
  field: PicklistField.OpportunityAlteracaoMinutaPadrao,
  salesforceField: "Opportunity.Alteracao_Minuta_Padrao__c",
  restricted: true,
  values: [
    { apiName: "Sim" },
    { apiName: "Não" },
  ],
};

/**
 * `Gerencia_Do_Usuario__c` — Salesforce **label is "Área do Usuário"**, shared
 * by `Opportunity` and `Quote` through the global value set
 * `Gerencia_Do_Usuario`. Controls `Tipo_de_Proposta__c`.
 *
 * No `isDefault` value: Salesforce defaults it from the formula
 * `$User.Area_Do_Usuario__c`.
 */
export const AREA_USUARIO: PicklistDefinition = {
  field: PicklistField.AreaUsuario,
  salesforceField: "Opportunity.Gerencia_Do_Usuario__c / Quote.Gerencia_Do_Usuario__c",
  globalValueSet: "Gerencia_Do_Usuario",
  restricted: true,
  values: [
    { apiName: "DCVIM" },
    { apiName: "DCB2B" },
    { apiName: "AVIA" },
    { apiName: "LUB" },
    { apiName: "DD" },
    { apiName: "GML", active: false },
    { apiName: "GME", active: false },
    { apiName: "GMAV", active: false },
    { apiName: "GMC", active: false },
    { apiName: "DRPV", active: false },
  ],
};
