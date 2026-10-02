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
 * `Garantia_Da_Cotacao__c.Tipo_De_Garantia_Proposta__c` — only THREE values are
 * active in Salesforce; `Alienação Fiduciária`, `Fiança`, `Fiança Bancaria`,
 * `Hipoteca` and `Outros` are inactive.
 *
 * ⚠️ This is coarser than the platform's `TipoGarantia`, which the Garantias PRD
 * needs at a finer grain (`exigePrevia`/`exigeFiador` are functions of it). The
 * two are deliberately NOT unified — collapsing them in the domain would delete
 * the distinction the whole subprocess is built on.
 *
 * There is no converter yet, because nothing writes a guarantee to Salesforce in
 * this slice. When that lands it belongs in the `garantia` module (the owner of
 * `TipoGarantia`), collapsing the fine-grained type onto one of these three;
 * this catalog stays the target vocabulary and nothing more.
 */
export const GARANTIA_TIPO: PicklistDefinition = {
  field: PicklistField.GarantiaTipo,
  salesforceField: "Garantia_Da_Cotacao__c.Tipo_De_Garantia_Proposta__c",
  restricted: true,
  values: [
    { apiName: "Garantia Real" },
    { apiName: "Garantia Pessoal" },
    { apiName: "Sem Garantia" },
    { apiName: "Alienação Fiduciária", active: false },
    { apiName: "Fiança", active: false },
    { apiName: "Fiança Bancaria", active: false },
    { apiName: "Hipoteca", active: false },
    { apiName: "Outros", active: false },
  ],
};

/** `Garantia_Da_Cotacao__c.Utilizacao__c` — default `Fornecimento`; `Parcelamento` is inactive. */
export const GARANTIA_UTILIZACAO: PicklistDefinition = {
  field: PicklistField.GarantiaUtilizacao,
  salesforceField: "Garantia_Da_Cotacao__c.Utilizacao__c",
  restricted: true,
  values: [
    { apiName: "Fornecimento", isDefault: true },
    { apiName: "Concessão Financeira" },
    { apiName: "Parcelamento", active: false },
  ],
};
