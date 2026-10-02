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
 * `Quote.Tipo_de_Proposta__c` — dependent on {@link AREA_USUARIO}.
 *
 * ⚠️ Finding carried over from the source analysis: `DD` has no mapping in any
 * dependent picklist, so an opportunity owned by Distribuição Direta leaves
 * this select empty. That is Salesforce's real behaviour, not a bug here.
 */
export const QUOTE_TIPO_PROPOSTA: PicklistDefinition = {
  field: PicklistField.QuoteTipoProposta,
  salesforceField: "Quote.Tipo_de_Proposta__c",
  globalValueSet: "Tipo_De_Proposta",
  controlledBy: PicklistField.AreaUsuario,
  restricted: true,
  values: [
    { apiName: "PCR" },
    { apiName: "PCOPP" },
    { apiName: "PCC" },
    { apiName: "PCA" },
    { apiName: "ZBRM", label: "Franquia BR Mania", active: false, platformOnly: true },
    { apiName: "ZLUB", label: "Franquia Lubrax+", active: false, platformOnly: true },
  ],
  valueSettings: {
    ["PCR"]: ["DCVIM", "LUB"],
    ["PCOPP"]: ["DCVIM", "LUB"],
    ["PCC"]: ["DCB2B", "LUB"],
    ["PCA"]: ["AVIA"],
  },
};

/**
 * `Quote.Tipo_De_Contrato__c` — 65 values in the global value set, of which
 * only the 11 below carry `valueSettings`. The remaining ~54 (CLUM - GNV,
 * Locação - PPD/PPI, the whole Z1xx series, Único, Individual, …) are
 * unreachable through the dependent UI for ANY `Tipo_de_Proposta__c` — they are
 * still catalogued because Apex/API writes accept them (see the source
 * document's `controllingField` vs DML note).
 */
export const QUOTE_TIPO_CONTRATO: PicklistDefinition = {
  field: PicklistField.QuoteTipoContrato,
  salesforceField: "Quote.Tipo_De_Contrato__c",
  globalValueSet: "Tipo_De_Contrato",
  controlledBy: PicklistField.QuoteTipoProposta,
  restricted: true,
  values: [
    { apiName: "CPCVM Produto" },
    { apiName: "CPCVM Volume", label: "CPCVM Volume Total" },
    { apiName: "CPCVM Disponibilidade" },
    { apiName: "Comodato" },
    { apiName: "CPCVM + Locação", label: "Locação" },
    { apiName: "CPCVM + Sublocação", label: "Sublocação" },
    { apiName: "Comissão Mercantil" },
    { apiName: "CLUM Liquido", label: "CLUM Líquidos" },
    { apiName: "CLUM - GNV" },
    { apiName: "BR Mania" },
    { apiName: "Lubrax +" },
    { apiName: "Locação - PPD" },
    { apiName: "Locação - PPI" },
    { apiName: "PCRA" },
    { apiName: "CQ", label: "CQ - Contrato em qtd." },
    { apiName: "MV", label: "MV - Contrato de locação" },
    { apiName: "OIU1", label: "OIU1 - OIU1" },
    { apiName: "WK1", label: "WK1 - Contrato valor geral" },
    { apiName: "WK2", label: "WK2 - Contrato vlr.ref.mat" },
    { apiName: "WV", label: "WV - Serviço e manutenção" },
    { apiName: "Z100", label: "Z100 - Contrato em qtd." },
    { apiName: "Z101", label: "Z101 - Contrato valor geral" },
    { apiName: "Z103", label: "Z103 - Quota Mensal" },
    { apiName: "Z104", label: "Z104 - Adicional de Quota -" },
    { apiName: "Z105", label: "Z105 - Antecipação Quota" },
    { apiName: "Z120", label: "Z120 - Contrato Mútuo Abs." },
    { apiName: "Z121", label: "Z121 - Contrato Mútuo Res." },
    { apiName: "Z130", label: "Z130 - CtQt Trading" },
    { apiName: "Z131", label: "Z131 - CtQt Exp. Bunker" },
    { apiName: "Z132", label: "Z132 - CtQt Vd Intercomp." },
    { apiName: "Z133", label: "Z133 - CtQt Vd Ben Ref Ext" },
    { apiName: "Z134", label: "Z134 - CtQt Vd Transp Ext." },
    { apiName: "Z135", label: "Z135 - CtQt Vd Mat Ext" },
    { apiName: "Z136", label: "Z136 - CtQt Vd Serv Ext" },
    { apiName: "Z137", label: "Z137 - CtQt Export Serviço" },
    { apiName: "Z138", label: "Z138 - CtQt Export Materias" },
    { apiName: "Z139", label: "Z139 - CtQt Exp. Bunker L C" },
    { apiName: "Z140", label: "Z140 - CtVal Trading" },
    { apiName: "Z144", label: "Z144 - CtVal Vd Transporte" },
    { apiName: "Z149", label: "Z149 - CV Serviços-Empenhos" },
    { apiName: "Z150", label: "Z150 - Contrato Qtdade" },
    { apiName: "Z151", label: "Z151 - CV Serviços" },
    { apiName: "Z152", label: "Z152 - Contrato Valor" },
    { apiName: "Z153", label: "Z153 - CQ Termoelétrica" },
    { apiName: "Z154", label: "Z154 - CV Empenhos" },
    { apiName: "Z155", label: "Z155 - CV Licitação" },
    { apiName: "Z156", label: "Z156 - CQ Consignação" },
    { apiName: "Z157", label: "Z157 - CQ Fat.Antecipado" },
    { apiName: "Z158", label: "Z158 - CQ Mt. Absorvível" },
    { apiName: "Z159", label: "Z159 - CQ Mt. Ressarcível" },
    { apiName: "Z160", label: "Z160 - CQ Ft. p/Consumo" },
    { apiName: "Z161", label: "Z161 - CQ Vd.p/Cnt.Ordem" },
    { apiName: "Z162", label: "Z162 - CQ Venda à Ordem" },
    { apiName: "Z163", label: "Z163 - CQ com NEG" },
    { apiName: "Z164", label: "Z164 - CQ Vd.Entr.Futura" },
    { apiName: "Z165", label: "Z165 - Contrato Qtdade Pesq" },
    { apiName: "Z167", label: "Z167 - CQ.Fiel Depositário" },
    { apiName: "Z168", label: "Z168 - CQ Controle CRM" },
    { apiName: "Z170", label: "Z170 - CQ Aviação" },
    { apiName: "Z172", label: "Z172 - CQ Serviço BR" },
    { apiName: "Z174", label: "Z174 - CQ Serviço BR Obra" },
    { apiName: "Z191", label: "Z191 - CV Empenho Aviação" },
    { apiName: "ZZCQ", label: "ZZCQ - Contrato em qtd. P.C" },
    { apiName: "Único" },
    { apiName: "Individual" },
  ],
  valueSettings: {
    ["CPCVM Produto"]: ["PCR", "PCOPP", "PCC", "PCA"],
    ["CPCVM Volume"]: ["PCR", "PCC", "PCA"],
    ["CPCVM + Sublocação"]: ["PCR", "PCOPP"],
    ["CLUM Liquido"]: ["PCR"],
    ["BR Mania"]: ["PCR"],
    ["Lubrax +"]: ["PCR"],
    ["CPCVM + Locação"]: ["PCOPP"],
    ["Comissão Mercantil"]: ["PCOPP"],
    ["CPCVM Disponibilidade"]: ["PCC"],
    ["Comodato"]: ["PCC", "PCA"],
    ["PCRA"]: ["PCA"],
  },
};

/**
 * `Quote.Finalidade_Cotacao__c` — global value set `Finalidade_Cotacao`, 44
 * values, reused (with a DIFFERENT controlling field) by
 * `Recurso_Financeiro_Da_Cotacao__c.Finalidade__c`. Only the 12 below are
 * reachable from `Tipo_de_Proposta__c`; the other ~32 belong to the financial
 * resource flavour of the same value set.
 */
export const QUOTE_FINALIDADE: PicklistDefinition = {
  field: PicklistField.QuoteFinalidade,
  salesforceField: "Quote.Finalidade_Cotacao__c",
  globalValueSet: "Finalidade_Cotacao",
  controlledBy: PicklistField.QuoteTipoProposta,
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
    { apiName: "Construção Lubrax+" },
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
  ],
  valueSettings: {
    ["Implantação"]: ["PCR", "PCOPP"],
    ["Renovação"]: ["PCR", "PCOPP"],
    ["Vinculação"]: ["PCR", "PCC", "PCA"],
    ["Renegociação"]: ["PCR", "PCOPP", "PCC", "PCA"],
    ["BR Mania - Implantação"]: ["PCR"],
    ["BR Mania - Renovação"]: ["PCR"],
    ["Lubrax + - Implantação"]: ["PCR"],
    ["Lubrax + - Renovação"]: ["PCR"],
    ["Cessão"]: ["PCR", "PCOPP"],
    ["Complementar"]: ["PCR", "PCOPP", "PCC"],
    ["Complementar Mutuo BR"]: ["PCR", "PCOPP", "PCC"],
    ["Revinculação"]: ["PCA"],
  },
};

/** `Quote.Prazo_Do_Contrato__c` — both values enabled by the same 15 contract types. */
export const QUOTE_PRAZO_CONTRATO: PicklistDefinition = {
  field: PicklistField.QuotePrazoContrato,
  salesforceField: "Quote.Prazo_Do_Contrato__c",
  controlledBy: PicklistField.QuoteTipoContrato,
  restricted: true,
  values: [
    { apiName: "Determinado" },
    { apiName: "Indeterminado" },
  ],
  valueSettings: {
    ["Determinado"]: [
      "Comodato",
      "CLUM - GNV",
      "Locação - PPD",
      "Locação - PPI",
      "CPCVM Produto",
      "CPCVM Volume",
      "Comissão Mercantil",
      "CPCVM + Locação",
      "CPCVM + Sublocação",
      "CPCVM Disponibilidade",
      "CLUM Liquido",
      "BR Mania",
      "Lubrax +",
      "Único",
      "Individual",
    ],
    ["Indeterminado"]: [
      "Comodato",
      "CLUM - GNV",
      "Locação - PPD",
      "Locação - PPI",
      "CPCVM Produto",
      "CPCVM Volume",
      "Comissão Mercantil",
      "CPCVM + Locação",
      "CPCVM + Sublocação",
      "CPCVM Disponibilidade",
      "CLUM Liquido",
      "BR Mania",
      "Lubrax +",
      "Único",
      "Individual",
    ],
  },
};

/** `Quote.Responsavel_Manutencao__c` — equipment maintenance. Label of `BR` is "VIBRA". */
export const QUOTE_RESPONSAVEL_MANUTENCAO: PicklistDefinition = {
  field: PicklistField.QuoteResponsavelManutencao,
  salesforceField: "Quote.Responsavel_Manutencao__c",
  globalValueSet: "Responsavel_Manutencao",
  restricted: true,
  values: [
    { apiName: "BR", label: "VIBRA" },
    { apiName: "Cliente" },
    { apiName: "Parceiro" },
  ],
};

/**
 * `Quote.Responsavel_Manutencao_Imagem__c` — image maintenance. Deliberately a
 * SEPARATE definition: Salesforce accepts `Parceiro` for equipment and rejects
 * it here, so collapsing the two would let a payload through validation that
 * the CRM refuses on write.
 */
export const QUOTE_RESPONSAVEL_MANUTENCAO_IMAGEM: PicklistDefinition = {
  field: PicklistField.QuoteResponsavelManutencaoImagem,
  salesforceField: "Quote.Responsavel_Manutencao_Imagem__c",
  restricted: true,
  values: [
    { apiName: "BR", label: "VIBRA" },
    { apiName: "Cliente" },
  ],
};

/** `Quote.Alteracao_Minuta_Padrao__c` — Sim/Não. */
export const QUOTE_ALTERACAO_MINUTA_PADRAO: PicklistDefinition = {
  field: PicklistField.QuoteAlteracaoMinutaPadrao,
  salesforceField: "Quote.Alteracao_Minuta_Padrao__c",
  restricted: true,
  values: [
    { apiName: "Sim" },
    { apiName: "Não" },
  ],
};

/** `Quote.Licenca_Onerosa__c` — Sim/Não. */
export const QUOTE_LICENCA_ONEROSA: PicklistDefinition = {
  field: PicklistField.QuoteLicencaOnerosa,
  salesforceField: "Quote.Licenca_Onerosa__c",
  restricted: true,
  values: [
    { apiName: "Não" },
    { apiName: "Sim" },
  ],
};
