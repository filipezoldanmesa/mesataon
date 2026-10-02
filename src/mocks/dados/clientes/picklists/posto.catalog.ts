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
 * `Situacao_Atual_Posto_Imovel_Cotacao__c.Tipo_De_Posto__c` — 7 values. Note
 * the API names and labels diverge (`Urbano` → "Posto Urbano", `Serviços` →
 * "Posto de Serviços"), which is why the platform stores the API name.
 */
export const POSTO_TIPO: PicklistDefinition = {
  field: PicklistField.PostoTipo,
  salesforceField: "Situacao_Atual_Posto_Imovel_Cotacao__c.Tipo_De_Posto__c",
  globalValueSet: "Tipo_De_Posto",
  restricted: true,
  values: [
    { apiName: "Urbano", label: "Posto Urbano" },
    { apiName: "Rodoviário", label: "Posto Rodoviário" },
    { apiName: "Marítimo", label: "Posto Marítimo" },
    { apiName: "Posto Escola" },
    { apiName: "Serviços", label: "Posto de Serviços" },
    { apiName: "Posto de Serviços Rodoviários" },
    { apiName: "Posto de Serviços Urbano" },
    { apiName: "SERVICOS_URBANOS", label: "Serviços urbanos", active: false, legacy: true },
  ],
};

/**
 * `Situacao_Atual_Posto_Imovel_Cotacao__c.Situacao_Atual_Posto__c` — dependent
 * on the object's own `Finalidade_Cotacao__c`.
 *
 * ⚠️ The three validation rules that used to enforce this are INACTIVE in
 * Salesforce, so today only the dependent UI enforces it there — and per the
 * source analysis `valueSettings` does not block DML. This platform DOES
 * enforce it (RN-F4-04 already refuses `EM_OPERACAO`/`PARALISADO` for
 * `Implantação`), which is stricter than the CRM on purpose.
 */
export const POSTO_SITUACAO: PicklistDefinition = {
  field: PicklistField.PostoSituacao,
  salesforceField: "Situacao_Atual_Posto_Imovel_Cotacao__c.Situacao_Atual_Posto__c",
  globalValueSet: "Situacao_Atual_Posto",
  controlledBy: PicklistField.QuoteFinalidade,
  restricted: true,
  values: [
    { apiName: "A Construir" },
    { apiName: "Em Construção" },
    { apiName: "Em Operação" },
    { apiName: "Paralisado" },
    { apiName: "A Construir / Em Construção", active: false },
  ],
  valueSettings: {
    ["A Construir"]: ["Implantação"],
    ["Em Construção"]: ["Implantação"],
    ["Em Operação"]: [
      "Após Cumprimento do Volume Contratado",
      "Construção BR Mania",
      "Construção do Lubrax +",
      "Construção do posto",
      "Cumprimento do volume contratado",
      "Incremento das atividades",
      "Pagamento de Títulos Vencidos",
      "Refinanciamento do Mútuo",
      "BR Mania - Renovação",
      "Reforma BR Mania",
      "Lubrax + - Implantação",
      "Reforma do Lubrax +",
      "Lubrax + - Renovação",
      "Reforma do Posto",
      "Troca de Operador",
      "Cessão",
      "Lubrax + - Renegociação",
      "Aquisição/Instalação de equipamento / Imagem",
      "Renegociação",
      "Renovação",
      "Vinculação",
      "Revinculação",
      "Vinculação de bandeira branca",
      "Vinculação por troca de bandeira",
      "BR Mania - Implantação",
      "BR Mania - Renegociação",
      "Posto a construir",
    ],
    ["Paralisado"]: [
      "Após Cumprimento do Volume Contratado",
      "Construção BR Mania",
      "Construção do Lubrax +",
      "Construção do posto",
      "Cumprimento do volume contratado",
      "Incremento das atividades",
      "Pagamento de Títulos Vencidos",
      "Refinanciamento do Mútuo",
      "BR Mania - Renovação",
      "Reforma BR Mania",
      "Lubrax + - Implantação",
      "Reforma do Lubrax +",
      "Lubrax + - Renovação",
      "Reforma do Posto",
      "Troca de Operador",
      "Cessão",
      "Lubrax + - Renegociação",
      "Aquisição/Instalação de equipamento / Imagem",
      "Renegociação",
      "Renovação",
      "Vinculação",
      "Revinculação",
      "Vinculação de bandeira branca",
      "Vinculação por troca de bandeira",
      "BR Mania - Implantação",
      "BR Mania - Renegociação",
      "Posto a construir",
    ],
  },
};

/** `Situacao_Atual_Posto_Imovel_Cotacao__c.Propriedade__c`. */
export const POSTO_PROPRIEDADE: PicklistDefinition = {
  field: PicklistField.PostoPropriedade,
  salesforceField: "Situacao_Atual_Posto_Imovel_Cotacao__c.Propriedade__c",
  globalValueSet: "Propriedade",
  restricted: true,
  values: [
    { apiName: "Da Razão Social que Explora o Posto" },
    { apiName: "Dos Sócios da Razão Social" },
    { apiName: "De Terceiros" },
  ],
};

/**
 * `Situacao_Atual_Posto_Imovel_Cotacao__c.Bandeira_Posto__c` — 7 valores,
 * restrita.
 *
 * ⚠️ Medido no describe em 05/09/2026: `Bandeira__c` tem o rótulo
 * "Bandeira ANP" e o **mesmo** value set. Os dois campos existem no objeto e
 * têm donos diferentes — o org deriva a ANP do cadastro da agência (a VR ativa
 * `Alteracao_Bandeira_Vinculacao` proíbe alterá-la) e o LT informa a física.
 * Este catálogo é o da FÍSICA (ADO 68153).
 */
export const POSTO_BANDEIRA: PicklistDefinition = {
  field: PicklistField.PostoBandeira,
  salesforceField: "Situacao_Atual_Posto_Imovel_Cotacao__c.Bandeira_Posto__c",
  globalValueSet: "Bandeira",
  restricted: true,
  values: [
    { apiName: "BR" },
    { apiName: "Bandeira Branca" },
    { apiName: "Ale" },
    { apiName: "Ipiranga" },
    { apiName: "Raízen" },
    { apiName: "Outras Distribuidoras" },
    { apiName: "Não Informado" },
  ],
};
