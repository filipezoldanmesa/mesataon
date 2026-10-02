/**
 * MEDIDO-NO-ORG — picklists de `Investimento_Da_Cotacao__c` (ADO 68506).
 *
 * ⚠️ Diferente dos catálogos vizinhos, estes dois NÃO vêm do documento de
 * análise do cliente: foram lidos do `describe` do org UAT em **19/09/2026** e
 * transcritos na ordem em que o org os devolve. A evidência está em
 * `architecture/Salesforce-Evidencias-Investimentos-2026-09-19.md` §5.
 *
 * ⚠️ **As duas são `restrictedPicklist: true`.** Valor fora da lista faz o org
 * responder `INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST` — e como o investimento
 * entra no `createQuoteGraph`, cujo rollback é por grafo, isso derruba a **saga
 * da alçada inteira**, dias depois e longe da tela. Por isso elas existem aqui:
 * a recusa acontece na entrada, com 400 no campo certo.
 *
 * ⚠️ **O ARP não lê nenhuma das duas.** Elas não mudam um centavo do cálculo —
 * entram por decisão da Vibra (19/09/2026), porque sem elas o registro no org
 * informa que existe um equipamento de R$ X sem dizer qual.
 *
 * O valor `Outro` existe nas duas listas. No org, escolhê-lo dispara a VR
 * `Outro_Obrigatorio`, que exige o Detalhamento do Item — aqui o detalhamento
 * já é obrigatório sempre, então nada muda.
 *
 * Reverificar contra o org (precisa das `SALESFORCE_*`): `describe` de
 * `Investimento_Da_Cotacao__c`, campos `Equipamento__c` e `Elemento_de_Imagem__c`.
 */

import { PicklistField, type PicklistDefinition } from "./definicao";

/** `Investimento_Da_Cotacao__c.Equipamento__c` — 40 valores ativos. */
export const INVESTIMENTO_EQUIPAMENTO: PicklistDefinition = {
  field: PicklistField.InvestimentoEquipamento,
  salesforceField: "Investimento_Da_Cotacao__c.Equipamento__c",
  restricted: true,
  values: [
    { apiName: "Armário" },
    { apiName: "Bate Rodas" },
    { apiName: "Coletor de Óleo" },
    { apiName: "Conjunto 4 olhais" },
    { apiName: "Escada de acesso" },
    { apiName: "Luminária" },
    { apiName: "Módulo armário" },
    { apiName: "Módulo atendimento" },
    { apiName: "Módulo balcão" },
    { apiName: "Módulo cadeiras" },
    { apiName: "Módulo calibrador" },
    { apiName: "Módulo expositor" },
    { apiName: "Módulo granel" },
    { apiName: "Módulo revisteiro" },
    { apiName: "Módulo serviço" },
    { apiName: "Módulo totem pdv" },
    { apiName: "Novo tanque" },
    { apiName: "Peça de acabamento" },
    { apiName: "Quadro de ferramentas" },
    { apiName: "Quiosque Lubrax+ motos" },
    { apiName: "Tachões" },
    { apiName: "Tampas corrediças" },
    { apiName: "Tanque" },
    { apiName: "Tanque de óleo" },
    { apiName: "Totem" },
    { apiName: "Totem calibrador ar ou água" },
    { apiName: "Trilho fixo de faixa" },
    { apiName: "Trilho varal" },
    { apiName: "Outro" },
    { apiName: "Bomba Abastecimento" },
    { apiName: "Industrial" },
    { apiName: "Bomba Centrífuga" },
    { apiName: "Bomba Comercial" },
    { apiName: "Compressor de GNV" },
    { apiName: "Conjunto Abastecimento ARLA" },
    { apiName: "Conjunto Abastecimento Lubrificante" },
    { apiName: "Estação Filtragem" },
    { apiName: "Filtro Prensa" },
    { apiName: "Módulo Abastecimento ARLA" },
    { apiName: "Equipamento" },
  ],
};

/** `Investimento_Da_Cotacao__c.Elemento_de_Imagem__c` — 38 valores ativos. */
export const INVESTIMENTO_ELEMENTO_IMAGEM: PicklistDefinition = {
  field: PicklistField.InvestimentoElementoImagem,
  salesforceField: "Investimento_Da_Cotacao__c.Elemento_de_Imagem__c",
  restricted: true,
  values: [
    { apiName: "ACM" },
    { apiName: "Adesivo" },
    { apiName: "Carenagem porta capas" },
    { apiName: "Cobertura MIDI" },
    { apiName: "Cobertura MINI" },
    { apiName: "Coluna Falsa" },
    { apiName: "Faixa Promocional" },
    { apiName: "Fechamento de fundo" },
    { apiName: "Fechamento Superior" },
    { apiName: "Forro de Cobertura" },
    { apiName: "Galhardete CTF ou Siga Bem" },
    { apiName: "Galhardete envolvente" },
    { apiName: "Glifos adesivos em ACM para sanitário" },
    { apiName: "Lâmina de pvc adesivada" },
    { apiName: "Legenda Petrobras" },
    { apiName: "Letreiro BR" },
    { apiName: "Limitadores em chapa" },
    { apiName: "Logo BR" },
    { apiName: "Lona para rótulo" },
    { apiName: "Mastro para bandeira" },
    { apiName: "Olho de gato" },
    { apiName: "Painel 18 itens" },
    { apiName: "Painel back light" },
    { apiName: "Painel publicitário" },
    { apiName: "Placa ANP" },
    { apiName: "Porta faixas" },
    { apiName: "Porta galhardete" },
    { apiName: "Projetor completo" },
    { apiName: "Revestimento de coluna" },
    { apiName: "Rótulo de edifício" },
    { apiName: "Rótulo de edifício backlight" },
    { apiName: "Rótulo interno" },
    { apiName: "Sinalização horizontal" },
    { apiName: "Sinalizador de produto" },
    { apiName: "Testeira padrão" },
    { apiName: "Testeira plana" },
    { apiName: "Testeira top" },
    { apiName: "Outro" },
  ],
};
