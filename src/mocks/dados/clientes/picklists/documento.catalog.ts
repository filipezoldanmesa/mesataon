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
 * `Arquivo_Da_Oportunidade__c.Tipo__c` — 46 values (2 inactive), inline value
 * set, API name == label. This is the vocabulary of document *types* the
 * opportunity file repository accepts.
 *
 * Served for reference, but NOT yet seeded into the `documents` parametrization
 * table: that table is data the SNEG maintains, and inserting 46 rows without
 * someone deciding required/stage per type would produce a checklist nobody
 * asked for. Consumers should read this list, not hardcode a subset.
 */
export const DOCUMENTO_TIPO: PicklistDefinition = {
  field: PicklistField.DocumentoTipo,
  salesforceField: "Arquivo_Da_Oportunidade__c.Tipo__c",
  restricted: true,
  values: [
    { apiName: "Anexar dados para assinatura" },
    { apiName: "Anexar documentos dos sócios/fiador" },
    { apiName: "Anexar o contrato social" },
    { apiName: "Balancete do Revendedor" },
    { apiName: "Carta Proposta Revendedor" },
    { apiName: "Cronograma de desembolso para Obra/Reforma" },
    { apiName: "Croqui Área de Influência" },
    { apiName: "Croqui de Bomba e Tanque" },
    { apiName: "Delta VPL" },
    { apiName: "Diversos" },
    { apiName: "FAP - BR Mania" },
    { apiName: "FAP - Lubrax +" },
    { apiName: "Formulário de autodeclararão" },
    { apiName: "Fotos BR Mania" },
    { apiName: "Fotos Lubrax +" },
    { apiName: "Fotos do Posto" },
    { apiName: "Minutas de Contratos" },
    { apiName: "Notes" },
    { apiName: "Orçamento de Terceiros" },
    { apiName: "RG/CPF Sócios - Cliente Prospect" },
    { apiName: "Simulador de Investimento" },
    { apiName: "Simulador de Lubrax +" },
    { apiName: "Avaliação de Imóvel de Posto Próprio" },
    { apiName: "Avaliação de Imóvel (Terreno/Benfeitorias) de Posto Próprio" },
    { apiName: "Avaliação de Operador de Posto Próprio" },
    { apiName: "Certidão RGI Operador" },
    { apiName: "Contrapartida LA - Foto do Posto LA" },
    { apiName: "Fichas de Candidatos e/ou Operador de Posto Próprio" },
    { apiName: "IPTU de Posto Próprio" },
    { apiName: "Licitação - Cópia do Edital" },
    { apiName: "Orçamento Contrapartida em Obras" },
    { apiName: "Documentos Revendedor e Sócios" },
    { apiName: "Parecer - Assessor" },
    { apiName: "Parecer - RP" },
    { apiName: "Parecer - SNEG" },
    { apiName: "Parecer - CCOB" },
    { apiName: "Parecer - VREG" },
    { apiName: "Parecer - VROD" },
    { apiName: "Parecer - DCVIM" },
    { apiName: "Parecer - DE" },
    { apiName: "Parecer - CA" },
    { apiName: "Não atende à Política Comercial" },
    { apiName: "Parecer - Técnico" },
    { apiName: "DIP Jurídico" },
    { apiName: "Foto do Posto", active: false },
    { apiName: "Parecer - Analista GAT", active: false },
  ],
};
